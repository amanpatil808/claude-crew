// The plan panel (docs/specs/plan-usage.md): the plan's kind and its 5-hour and weekly limits from the newest
// rate-limit reading, and each agent's share of the usage in each window. Pure apart from readLimits(): the clock,
// the calendar day, the roles and the reading come in as arguments.
// Shares are estimated: each agent's tokens in the window, weighted by the model's API list price, out of the usage
// this board logged. Rate limits are account-wide, so other tools on the same account are not in the shares.
import { readFileSync } from "node:fs";
import { dayOf, hourOf, hourRows, limitsReading, LIMITS_FILE, localDay, MODEL_ID, USAGE_MAX_ROWS, type BoardEvent, type LimitId, type LimitsReading } from "./events.ts";
import { loadRoles, roleFor, typesById, type Role } from "./crew.ts";
import { rowUsd, type PricedRow } from "./prices.ts";

export interface PlanLimit { id: LimitId; label: string; usedPct: number | null; resetsAt: string | null }
export interface AgentShare { role: string; sharePct: number; planPct: number | null; heavy: boolean }
export interface PlanShares { window: LimitId; agents: AgentShare[] }
export interface PlanState {
  kind: "subscription" | "api" | "unknown";
  name: string | null;
  source: "rate-limits" | "setting" | "none";
  limits: PlanLimit[];
  shares: PlanShares[];
  basis: string;
  updatedAt: string | null;
}

export interface PlanOptions {
  roles?: Map<string, Role>;
  reading?: LimitsReading | null;   // absent: read LIMITS_FILE
  dayOf?: (ms: number) => string;   // the calendar day of a time; default the machine's local day, as the reader's
}

const MANAGER = "doraemon", OTHER = "other";
const HOUR_MS = 3_600_000;
const WINDOWS: readonly { id: LimitId; label: string; ms: number }[] = [
  { id: "5h", label: "5-hour", ms: 5 * HOUR_MS },
  { id: "7d", label: "Weekly", ms: 7 * 24 * HOUR_MS },
];
// A reading older than this says nothing about the plan any more (both windows have long reset).
export const READING_MAX_AGE_MS = 30 * 24 * HOUR_MS;
// A reading stamped further ahead than this is from a wrong clock and is not used.
const FUTURE_SLACK_MS = 5 * 60_000;
const BASIS = "Each agent's share is its tokens in the window weighted by API list prices, from the sessions this board logs.";
const UNPRICED = " Models without a list price are left out.";

const round1 = (x: number) => Math.round(x * 10) / 10;

// The heavy rule from the contract: at least 20% and at least twice a fair share among the n agents with usage.
export const isHeavy = (sharePct: number, n: number): boolean => n > 0 && sharePct >= 20 && sharePct >= 2 * (100 / n);

// limits.json is a file on disk: re-checked through the same allow-list as the writer's, never trusted.
export function readLimits(file = LIMITS_FILE): LimitsReading | null {
  try { return limitsReading(JSON.parse(readFileSync(file, "utf8"))); } catch { return null; }
}

// The reading if it can still describe the plan at `now`, else null.
function usable(reading: LimitsReading | null | undefined, now: number): LimitsReading | null {
  if (!reading) return null;
  const at = Date.parse(reading.at);
  return Number.isFinite(at) && at <= now + FUTURE_SLACK_MS && now - at <= READING_MAX_AGE_MS ? reading : null;
}

// One window's limit: known only until it resets, or until a whole window has passed since the reading when the
// reset time is missing (Claude Code drops a window at its reset too).
function limitOf(reading: LimitsReading, w: (typeof WINDOWS)[number], now: number): PlanLimit {
  const got = reading.w.find((x) => x.id === w.id);
  const until = got ? (got.end ? Date.parse(got.end) : Date.parse(reading.at) + w.ms) : NaN;
  const live = got && Number.isFinite(until) && until > now;
  return { id: w.id, label: w.label, usedPct: live ? got.pct : null, resetsAt: live ? got.end : null };
}

interface Row extends PricedRow { bucket: string }   // bucket: the day ("YYYY-MM-DD") or the UTC hour ("YYYY-MM-DDTHH")
interface Snap { ms: number; partial: boolean; agentId?: string; agentType?: string; days: Row[]; hours: Row[] }

const count = (x: unknown) => (typeof x === "number" && Number.isFinite(x) && x > 0 ? Math.floor(x) : 0);
const modelOf = (x: unknown) => (typeof x === "string" && MODEL_ID.test(x) ? x : "unknown");

// The log's day rows, re-checked; rows without a real day (all-time only) never fall in a window.
function dayRows(x: unknown): Row[] {
  if (!Array.isArray(x)) return [];
  const out: Row[] = [];
  for (const raw of x.slice(0, USAGE_MAX_ROWS)) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>, bucket = dayOf(r.day);
    if (!bucket) continue;
    out.push({ model: modelOf(r.model), speed: r.speed === "fast" ? "fast" : "standard", long: r.long === true, bucket, in: count(r.in), out: count(r.out), cw5m: count(r.cw5m), cw1h: count(r.cw1h), cr: count(r.cr), ws: count(r.ws) });
  }
  return out;
}

const key = (r: Row) => `${r.model}\0${r.speed}\0${r.long}\0${r.bucket}`;
const PRICED = ["in", "out", "cw5m", "cw1h", "cr", "ws"] as const;

// A capped read summed only the start of its transcript: per (model, speed, long, bucket) it never lowers what
// the read before it counted, and a bucket only the earlier read has is kept.
function atLeast(rows: Row[], prev: Row[]): Row[] {
  const m = new Map(rows.map((r) => [key(r), { ...r }]));
  for (const p of prev) {
    const r = m.get(key(p));
    if (!r) m.set(key(p), { ...p });
    else for (const f of PRICED) r[f] = Math.max(r[f], p[f]);
  }
  return [...m.values()];
}

// The newest usage snapshot per (sid, agent), each transcript's numbers being cumulative.
function newest(events: readonly BoardEvent[], now: number): Snap[] {
  const byKey = new Map<string, Snap[]>();
  for (const e of events) {
    if (e.kind !== "usage") continue;
    const ms = Date.parse(e.ts);
    const agent = e.scope === "agent" && e.agentId ? e.agentId : e.scope === "main" ? undefined : null;
    if (!Number.isFinite(ms) || ms > now || agent === null) continue;
    const k = `${e.sid ?? ""}\0${agent ?? "main"}`;
    const hours = hourRows(e.hours).map((h): Row => ({ ...h, bucket: hourOf(h.hr) }));
    byKey.set(k, [...(byKey.get(k) ?? []), { ms, partial: e.partial === true, agentId: agent, agentType: e.agentType, days: dayRows(e.rows), hours }]);
  }
  const out: Snap[] = [];
  for (const list of byKey.values()) {
    list.sort((a, b) => a.ms - b.ms);   // stable: equal times keep log order
    for (let i = 1; i < list.length; i++) {
      if (list[i].partial) list[i] = { ...list[i], days: atLeast(list[i].days, list[i - 1].days), hours: atLeast(list[i].hours, list[i - 1].hours) };
    }
    out.push(list[list.length - 1]);
  }
  return out;
}

// One window's shares: weight per role (API price of its rows in the window), as a percent of the total.
function sharesOf(weights: Map<string, number>, usedPct: number | null): AgentShare[] {
  const total = [...weights.values()].reduce((a, b) => a + b, 0);
  if (!(total > 0)) return [];
  const n = weights.size;
  return [...weights].map(([role, w]) => {
    const sharePct = round1((100 * w) / total);
    return { role, sharePct, planPct: usedPct === null ? null : round1((sharePct * usedPct) / 100), heavy: isHeavy(sharePct, n) };
  }).sort((a, b) => b.sharePct - a.sharePct || a.role.localeCompare(b.role));
}

export function buildPlan(events: readonly BoardEvent[], now: number, opts: PlanOptions = {}): PlanState {
  const roles = opts.roles ?? loadRoles(), day = opts.dayOf ?? localDay;
  const reading = usable(opts.reading === undefined ? readLimits() : opts.reading, now);
  const kind = !reading ? "unknown" : reading.sub ? "subscription" : "api";
  const limits = kind === "subscription" && reading ? WINDOWS.map((w) => limitOf(reading, w, now)) : [];

  const types = typesById([...events]);
  const roleOf = (s: Snap) => {
    if (!s.agentId) return MANAGER;
    const type = types.get(s.agentId) || s.agentType;
    return type && type !== "agent" ? roleFor(type, roles)?.id ?? OTHER : OTHER;
  };
  const snaps = newest(events, now);
  let unpriced = false;
  const shares: PlanShares[] = WINDOWS.map((w) => {
    const limit = limits.find((l) => l.id === w.id);
    // The window started a whole window before its reset; without a known reset, a window back from now.
    const start = limit?.resetsAt ? Math.min(now, Date.parse(limit.resetsAt) - w.ms) : now - w.ms;
    const fromDay = dayOf(day(start)), toDay = dayOf(day(now));
    const inWindow = w.id === "5h"
      // An hour counts when any part of it is inside [start, now].
      ? (r: Row) => { const h = Date.parse(`${r.bucket}:00:00Z`); return h + HOUR_MS > start && h <= now; }
      : (r: Row) => !!fromDay && !!toDay && r.bucket >= fromDay && r.bucket <= toDay;
    const weights = new Map<string, number>();
    for (const s of snaps) {
      let w8 = 0;
      for (const r of (w.id === "5h" ? s.hours : s.days).filter(inWindow)) {
        const usd = rowUsd(r);
        if (usd === null) unpriced = true;
        else w8 += usd;
      }
      if (w8 > 0) weights.set(roleOf(s), (weights.get(roleOf(s)) ?? 0) + w8);
    }
    return { window: w.id, agents: sharesOf(weights, limit?.usedPct ?? null) };
  });

  return {
    kind, name: null, source: reading ? "rate-limits" : "none", limits,
    shares: shares.some((s) => s.agents.length) ? shares : [],
    basis: BASIS + (unpriced ? UNPRICED : ""),
    updatedAt: reading?.at ?? null,
  };
}
