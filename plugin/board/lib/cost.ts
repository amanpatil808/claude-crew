// The cost ledger: rolls `usage` events up per room (project), per agent role and per task, all-time and for the
// Today / 7 days windows. Pure: the clock, the roles and the task binding come in as arguments.
// Each usage event is cumulative for one transcript, so only the newest per (sid, agent) counts, and a window's
// share is that newest total minus the newest total from before the window opened.
import type { BoardEvent, UsageRow } from "./events.ts";
import { loadRoles, roleFor, type Role } from "./crew.ts";
import { priceRows, pricesInfo } from "./prices.ts";

export interface Usage { n: number; in: number; out: number; cw5m: number; cw1h: number; cr: number; ws: number; wf: number }
export interface Priced { usage: Usage; usd: number | null; unpriced: string[] }
export interface RoomCost extends Priced { partial: boolean }
export interface AgentCost extends Priced { role: string; main?: true; runs?: number }
export interface CostSlice { rooms: Record<string, RoomCost>; agents: Record<string, AgentCost[]>; tasks: Record<string, Priced> }
export interface CostWindow extends CostSlice { from: string }
export interface CostState extends CostSlice {
  basis: "estimate"; currency: "USD";
  prices: { asOf: string; source: string; stale: boolean; note: string };
  updatedAt: string | null;
  windows: { today: CostWindow; "7d": CostWindow };
}

export interface CostOptions {
  roles?: Map<string, Role>;
  // agent id -> the last task it was bound to (lib/tasks.ts). An agent counts toward that one task only.
  taskOf?: ReadonlyMap<string, string>;
  dayStart?: (now: number) => number;   // start of "today"; default local midnight
}

const MANAGER = "doraemon";   // the main session is the manager's
const OTHER = "other";        // a run whose type is unknown or generic
const WEEK_MS = 7 * 86_400_000;
const MAX_ROWS = 64;
const FIELDS = ["n", "in", "out", "cw5m", "cw1h", "cr", "ws", "wf"] as const;

const localMidnight = (now: number) => new Date(now).setHours(0, 0, 0, 0);
const count = (x: unknown) => (typeof x === "number" && Number.isFinite(x) && x > 0 ? Math.floor(x) : 0);
const rowKey = (r: UsageRow) => `${r.model}\0${r.speed}\0${r.long}`;
const zero = (): Usage => ({ n: 0, in: 0, out: 0, cw5m: 0, cw1h: 0, cr: 0, ws: 0, wf: 0 });

// The log is a file on disk: rows are re-checked here, not trusted.
function parseRows(x: unknown): UsageRow[] {
  if (!Array.isArray(x)) return [];
  const out: UsageRow[] = [];
  for (const raw of x.slice(0, MAX_ROWS)) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    if (typeof r.model !== "string" || !r.model) continue;
    out.push({
      model: r.model, speed: r.speed === "fast" ? "fast" : "standard", long: r.long === true,
      n: count(r.n), in: count(r.in), out: count(r.out), cw5m: count(r.cw5m), cw1h: count(r.cw1h), cr: count(r.cr), ws: count(r.ws), wf: count(r.wf),
    });
  }
  return out;
}

interface Snap { ms: number; ts: string; project: string; agentId?: string; agentType?: string; partial: boolean; rows: UsageRow[] }
interface Run { key: string; project: string; agentId?: string; agentType?: string; partial: boolean; rows: UsageRow[] }

// Usage snapshots per run key, oldest first (log order breaks a same-millisecond tie).
function snapshots(events: readonly BoardEvent[], now: number): Map<string, Snap[]> {
  const byKey = new Map<string, Snap[]>();
  for (const e of events) {
    if (e.kind !== "usage") continue;
    const ms = Date.parse(e.ts);
    const agent = e.scope === "agent" && e.agentId ? e.agentId : e.scope === "main" ? undefined : null;
    if (!Number.isFinite(ms) || ms > now || agent === null) continue;
    const key = `${e.sid ?? ""}\0${agent ?? "main"}`;
    const list = byKey.get(key) ?? [];
    list.push({ ms, ts: e.ts, project: e.project ?? "", agentId: agent, agentType: e.agentType, partial: e.partial === true, rows: parseRows(e.rows) });
    byKey.set(key, list);
  }
  for (const list of byKey.values()) list.sort((a, b) => a.ms - b.ms);   // stable: equal times keep log order
  return byKey;
}

const lastBefore = (list: Snap[], ms: number) => { let hit: Snap | undefined; for (const s of list) if (s.ms < ms) hit = s; return hit; };

// newest - base, per row; never below zero (a rewritten or capped transcript can read lower than before).
function minus(rows: UsageRow[], base: UsageRow[] | undefined): UsageRow[] {
  if (!base?.length) return rows;
  const old = new Map(base.map((r) => [rowKey(r), r]));
  return rows.map((r) => {
    const b = old.get(rowKey(r)), d = { ...r };
    if (b) for (const f of FIELDS) d[f] = Math.max(0, r[f] - b[f]);
    return d;
  }).filter((r) => FIELDS.some((f) => r[f] > 0));
}

// One run per key: all-time (from = undefined) or what changed since `from`.
function runs(byKey: Map<string, Snap[]>, from?: number): Run[] {
  const out: Run[] = [];
  for (const [key, list] of byKey) {
    const last = list[list.length - 1];
    if (from !== undefined && last.ms < from) continue;
    const rows = from === undefined ? last.rows : minus(last.rows, lastBefore(list, from)?.rows);
    if (rows.length) out.push({ key, project: last.project, agentId: last.agentId, agentType: last.agentType, partial: last.partial, rows });
  }
  return out;
}

function merge(rows: UsageRow[]): UsageRow[] {
  const m = new Map<string, UsageRow>();
  for (const r of rows) {
    const acc = m.get(rowKey(r));
    if (!acc) { m.set(rowKey(r), { ...r }); continue; }
    for (const f of FIELDS) acc[f] += r[f];
  }
  return [...m.values()];
}

function priced(rows: UsageRow[]): Priced {
  const merged = merge(rows), usage = zero();
  for (const r of merged) for (const f of FIELDS) usage[f] += r[f];
  return { usage, ...priceRows(merged) };
}

function group(list: Run[], key: (r: Run) => string | undefined): Map<string, Run[]> {
  const m = new Map<string, Run[]>();
  for (const r of list) { const k = key(r); if (k !== undefined) m.set(k, [...(m.get(k) ?? []), r]); }
  return m;
}

const rowsOf = (rs: Run[]) => rs.flatMap((r) => r.rows);

function rollup(list: Run[], roleOf: (r: Run) => string, taskOf: ReadonlyMap<string, string>): CostSlice {
  const rooms: Record<string, RoomCost> = {}, agents: Record<string, AgentCost[]> = {}, tasks: Record<string, Priced> = {};
  for (const [project, inRoom] of group(list, (r) => r.project)) {
    rooms[project] = { ...priced(rowsOf(inRoom)), partial: inRoom.some((r) => r.partial) };
    const main = inRoom.filter((r) => !r.agentId);
    const rows: AgentCost[] = main.length ? [{ role: MANAGER, main: true, ...priced(rowsOf(main)) }] : [];
    for (const [role, rs] of group(inRoom.filter((r) => r.agentId), roleOf)) rows.push({ role, runs: rs.length, ...priced(rowsOf(rs)) });
    // The manager first, then the most expensive; unpriced rows last.
    rows.sort((a, b) => Number(!!b.main) - Number(!!a.main) || (b.usd ?? -1) - (a.usd ?? -1) || a.role.localeCompare(b.role));
    agents[project] = rows;
  }
  for (const [task, rs] of group(list, (r) => (r.agentId ? taskOf.get(r.agentId) : undefined))) tasks[task] = priced(rowsOf(rs));
  return { rooms, agents, tasks };
}

export function buildCost(events: readonly BoardEvent[], now: number, opts: CostOptions = {}): CostState {
  const roles = opts.roles ?? loadRoles(), taskOf = opts.taskOf ?? new Map<string, string>();
  // agent id -> type from any event that names both (a stop or usage event may carry none of its own).
  const types = new Map<string, string>();
  for (const e of events) if (e.agentId && e.agentType && e.agentType !== "agent") types.set(e.agentId, e.agentType);
  const roleOf = (r: Run) => {
    const type = (r.agentId && types.get(r.agentId)) || r.agentType;
    return type && type !== "agent" ? roleFor(type, roles)?.id ?? OTHER : OTHER;
  };
  const byKey = snapshots(events, now);
  const newest = [...byKey.values()].map((l) => l[l.length - 1]).sort((a, b) => b.ms - a.ms)[0];
  const window = (from: number): CostWindow => ({ from: new Date(from).toISOString(), ...rollup(runs(byKey, from), roleOf, taskOf) });
  return {
    basis: "estimate", currency: "USD", prices: pricesInfo(now),
    updatedAt: newest?.ts ?? null,
    ...rollup(runs(byKey), roleOf, taskOf),
    windows: { today: window((opts.dayStart ?? localMidnight)(now)), "7d": window(now - WEEK_MS) },
  };
}
