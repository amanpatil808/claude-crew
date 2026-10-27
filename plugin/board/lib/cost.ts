// The cost ledger: rolls `usage` events up per room (project), per agent role and per task, all-time and for the
// Today / 7 days windows. Pure: the clock, the calendar day, the roles and the task binding come in as arguments.
// Each usage event is cumulative for one transcript, so only the newest per (sid, agent) counts. Its rows are
// split by the calendar day of each response, so a window is the sum of that snapshot's rows for the window's days:
// a long session seen for the first time today puts only today's calls in Today.
import { addDays, dayOf, localDay, MODEL_ID, USAGE_MAX_ROWS, type BoardEvent, type UsageRow } from "./events.ts";
import { loadRoles, roleFor, type Role } from "./crew.ts";
import { priceRows, pricesInfo } from "./prices.ts";
import { putOwn } from "./records.ts";

export interface Usage { n: number; in: number; out: number; cw5m: number; cw1h: number; cr: number; ws: number; wf: number }
// cached: cache-read tokens (cr). fresh: every other token (in + out + cw5m + cw1h). Split for the page.
export interface Priced { usage: Usage; cached: number; fresh: number; usd: number | null; unpriced: string[] }
// partial: at least one run in it was a capped read, so the real numbers may be higher.
export interface RoomCost extends Priced { partial: boolean }
export interface TaskCost extends Priced { partial: boolean }
// since: the earliest calendar day in its rows ("tracking since"), or null when none of them has a day.
export interface AgentCost extends Priced { role: string; main?: true; runs?: number; partial: boolean; since: string | null }
export interface CostSlice { rooms: Record<string, RoomCost>; agents: Record<string, AgentCost[]>; tasks: Record<string, TaskCost> }
// from / to: the first and last calendar day the window sums, both included ("YYYY-MM-DD").
export interface CostWindow extends CostSlice { from: string; to: string }
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
  dayOf?: (ms: number) => string;   // the calendar day of a time; default the machine's local day, as the reader's
}

const MANAGER = "doraemon";   // the main session is the manager's
const OTHER = "other";        // a run whose type is unknown or generic
const WEEK_DAYS = 7;
const FIELDS = ["n", "in", "out", "cw5m", "cw1h", "cr", "ws", "wf"] as const;

const count = (x: unknown) => (typeof x === "number" && Number.isFinite(x) && x > 0 ? Math.floor(x) : 0);
const rowKey = (r: UsageRow) => `${r.model}\0${r.speed}\0${r.long}`;
const dayKey = (r: UsageRow) => `${rowKey(r)}\0${r.day}`;
const zero = (): Usage => ({ n: 0, in: 0, out: 0, cw5m: 0, cw1h: 0, cr: 0, ws: 0, wf: 0 });

// The log is a file on disk: rows are re-checked here, not trusted. `legacy`: written before rows had a day,
// so its rows are whole-transcript totals (kept as day "", all-time only).
function parseRows(x: unknown): { rows: UsageRow[]; legacy: boolean } {
  if (!Array.isArray(x)) return { rows: [], legacy: false };
  const rows: UsageRow[] = [];
  let legacy = false;
  for (const raw of x.slice(0, USAGE_MAX_ROWS)) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    if (typeof r.model !== "string" || !r.model) continue;
    if (typeof r.day !== "string") legacy = true;
    rows.push({
      model: MODEL_ID.test(r.model) ? r.model : "unknown", speed: r.speed === "fast" ? "fast" : "standard", long: r.long === true, day: dayOf(r.day),
      n: count(r.n), in: count(r.in), out: count(r.out), cw5m: count(r.cw5m), cw1h: count(r.cw1h), cr: count(r.cr), ws: count(r.ws), wf: count(r.wf),
    });
  }
  return { rows, legacy };
}

// since: the event's own earliest day ("" when it has none); rows older than the reader's day cap have day "".
interface Snap { ms: number; ts: string; project: string; agentId?: string; agentType?: string; partial: boolean; legacy: boolean; since: string; rows: UsageRow[] }
interface Run { key: string; project: string; agentId?: string; agentType?: string; partial: boolean; since: string; rows: UsageRow[] }

const earliest = (a: string, b: string) => (a && b ? (a < b ? a : b) : a || b);

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
    list.push({ ms, ts: e.ts, project: e.project ?? "", agentId: agent, agentType: e.agentType, partial: e.partial === true, since: dayOf(e.since), ...parseRows(e.rows) });
    byKey.set(key, list);
  }
  for (const list of byKey.values()) {
    list.sort((a, b) => a.ms - b.ms);   // stable: equal times keep log order
    // A capped read summed only the start of the file: it never lowers what the read before it counted.
    for (let i = 1; i < list.length; i++) {
      if (list[i].partial) {
        const prev = list[i - 1];
        list[i] = { ...list[i], since: earliest(list[i].since, prev.since), rows: atLeast(list[i].rows, prev.rows, prev.legacy) };
      }
    }
  }
  return byKey;
}

// Sums rows that share a key; copies, never changes the input.
function merge(rows: readonly UsageRow[], key: (r: UsageRow) => string = dayKey): UsageRow[] {
  const m = new Map<string, UsageRow>();
  for (const r of rows) {
    const acc = m.get(key(r));
    if (!acc) { m.set(key(r), { ...r }); continue; }
    for (const f of FIELDS) acc[f] += r[f];
  }
  return [...m.values()];
}

// A capped read `rows` against the read before it, `prev`: the larger of the two per (model, speed, long, day) and
// per field; a row only `prev` has is kept. Days `prev` already folded into "" (older than its oldest dated row)
// are folded the same way first, or they would count twice. A `legacy` prev has only whole-transcript totals,
// so the capped read is topped up in its "" row to at least those totals, per (model, speed, long).
function atLeast(rows: UsageRow[], prev: UsageRow[], legacy: boolean): UsageRow[] {
  if (legacy) return topUp(merge(rows), prev);
  const horizon = prev.reduce((min, p) => (p.day && (!min || p.day < min) ? p.day : min), "");
  const own = merge(horizon ? rows.map((r) => (r.day && r.day < horizon ? { ...r, day: "" } : r)) : rows);
  const m = new Map(own.map((r) => [dayKey(r), r]));
  for (const p of merge(prev)) {
    const r = m.get(dayKey(p));
    if (!r) m.set(dayKey(p), p);
    else for (const f of FIELDS) r[f] = Math.max(r[f], p[f]);
  }
  return [...m.values()];
}

function topUp(rows: UsageRow[], totals: readonly UsageRow[]): UsageRow[] {
  for (const t of merge(totals, rowKey)) {
    const have = zero();
    for (const r of rows) if (rowKey(r) === rowKey(t)) for (const f of FIELDS) have[f] += r[f];
    if (!FIELDS.some((f) => t[f] > have[f])) continue;
    let undated = rows.find((r) => rowKey(r) === rowKey(t) && r.day === "");
    if (!undated) { undated = { ...t, day: "", ...zero() }; rows.push(undated); }
    for (const f of FIELDS) undated[f] += Math.max(0, t[f] - have[f]);
  }
  return rows;
}

// One run per key from its newest snapshot: every row (all-time), or only the rows of the window's days.
function runs(byKey: Map<string, Snap[]>, days?: { from: string; to: string }): Run[] {
  const out: Run[] = [];
  for (const [key, list] of byKey) {
    const last = list[list.length - 1];
    const rows = days ? last.rows.filter((r) => r.day !== "" && r.day >= days.from && r.day <= days.to) : last.rows;
    if (rows.length) out.push({ key, project: last.project, agentId: last.agentId, agentType: last.agentType, partial: last.partial, since: last.since, rows });
  }
  return out;
}

function priced(rows: UsageRow[]): Priced {
  const merged = merge(rows, rowKey), usage = zero();   // prices do not depend on the day
  for (const r of merged) for (const f of FIELDS) usage[f] += r[f];
  return { usage, cached: usage.cr, fresh: usage.in + usage.out + usage.cw5m + usage.cw1h, ...priceRows(merged) };
}

// The earliest day of the runs' own `since` and their dated rows; null when there is none.
const sinceOf = (rs: Run[]) => rs.reduce((min, run) => run.rows.reduce((m, r) => earliest(m, r.day), earliest(min, run.since)), "") || null;

function group(list: Run[], key: (r: Run) => string | undefined): Map<string, Run[]> {
  const m = new Map<string, Run[]>();
  for (const r of list) { const k = key(r); if (k !== undefined) m.set(k, [...(m.get(k) ?? []), r]); }
  return m;
}

const rowsOf = (rs: Run[]) => rs.flatMap((r) => r.rows);
const partialOf = (rs: Run[]) => rs.some((r) => r.partial);

// Keys are project names and task ids from the log: putOwn, so one named "__proto__" is an ordinary key.
function rollup(list: Run[], roleOf: (r: Run) => string, taskOf: ReadonlyMap<string, string>): CostSlice {
  const rooms: Record<string, RoomCost> = {}, agents: Record<string, AgentCost[]> = {}, tasks: Record<string, TaskCost> = {};
  for (const [project, inRoom] of group(list, (r) => r.project)) {
    putOwn(rooms, project, { ...priced(rowsOf(inRoom)), partial: partialOf(inRoom) });
    const main = inRoom.filter((r) => !r.agentId);
    const rows: AgentCost[] = main.length ? [{ role: MANAGER, main: true, ...priced(rowsOf(main)), partial: partialOf(main), since: sinceOf(main) }] : [];
    for (const [role, rs] of group(inRoom.filter((r) => r.agentId), roleOf)) {
      rows.push({ role, runs: rs.length, ...priced(rowsOf(rs)), partial: partialOf(rs), since: sinceOf(rs) });
    }
    // The manager first, then the most expensive; unpriced rows last.
    rows.sort((a, b) => Number(!!b.main) - Number(!!a.main) || (b.usd ?? -1) - (a.usd ?? -1) || a.role.localeCompare(b.role));
    putOwn(agents, project, rows);
  }
  for (const [task, rs] of group(list, (r) => (r.agentId ? taskOf.get(r.agentId) : undefined))) putOwn(tasks, task, { ...priced(rowsOf(rs)), partial: partialOf(rs) });
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
  // A day function that gives no real day leaves both windows empty rather than guessing one.
  const today = dayOf((opts.dayOf ?? localDay)(now));
  const window = (from: string): CostWindow => ({ from, to: today, ...rollup(runs(byKey, { from, to: today }), roleOf, taskOf) });
  return {
    basis: "estimate", currency: "USD", prices: pricesInfo(now),
    updatedAt: newest?.ts ?? null,
    ...rollup(runs(byKey), roleOf, taskOf),
    windows: { today: window(today), "7d": window(addDays(today, 1 - WEEK_DAYS)) },
  };
}
