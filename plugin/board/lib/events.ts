// The JSONL event log: one line per event, appended with a single write so concurrent hooks
// (several subagents finishing at once) never interleave half-lines.
import { closeSync, constants, existsSync, fstatSync, lstatSync, openSync, readFileSync, readSync, renameSync, rmSync, unlinkSync, writeFileSync, writeSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { EVENTS_FILE, LOG_DIR } from "./paths.ts";
import { appendPrivate } from "./private-fs.ts";
import { redactDeep } from "./redact.ts";

export type EventKind = "agent-start" | "agent-stop" | "commit" | "pr" | "turn-end" | "session-start" | "session-end" | "ci" | "deploy" | "main-busy" | "assign"
  | "task-queue" | "task-start" | "task-done" | "task-drop"   // board v2 tasks, see lib/tasks.ts
  | "usage"                                                   // cost ledger: cumulative numbers for one transcript
  | "needs-you"                                               // the owner is the blocker (see lib/needs.ts)
  | "compact-hint";                                           // the manager's context is big, or a PR was merged (board/remind.ts)

// Bookkeeping kinds, not history: kept out of the page's event list and out of task activity.
export const QUIET_KINDS: ReadonlySet<EventKind> = new Set<EventKind>(["usage", "needs-you", "compact-hint"]);

// What someone is waiting for. The hook maps Claude Code's notification_type through this allow-list only.
export type Need = "permission" | "input" | "idle" | "agent-input";
// A Map, not an object literal, so "constructor" or "__proto__" can never look like a known type.
export const NEED_OF: ReadonlyMap<string, Need> = new Map<string, Need>([
  ["permission_prompt", "permission"], ["idle_prompt", "idle"],
  ["elicitation_dialog", "input"], ["elicitation_url_dialog", "input"], ["agent_needs_input", "agent-input"],
]);
export const needOf = (type: unknown): Need | undefined => (typeof type === "string" ? NEED_OF.get(type) : undefined);
// The only text a needs-you event carries: Claude Code's own message and title are never stored.
export const NEED_TEXT: Readonly<Record<Need, string>> = {
  permission: "Waiting for your permission", input: "Waiting for your answer", idle: "Waiting for your reply", "agent-input": "Waiting for your input",
};

// The only text a compact-hint event carries; its numbers live in `ctx`.
export const COMPACT_TEXT = "Time to run /compact or /clear";

// One usage row: cumulative numbers for one (model, speed, long-prompt, day) group of one transcript.
// Short key names on purpose: redactDeep blanks any value whose key says token, session, secret and so on.
export interface UsageRow {
  model: string; speed: "standard" | "fast"; long: boolean;   // long: the prompt was over the long-prompt price tier
  // The local calendar day of the responses ("YYYY-MM-DD"), or "" for no usable timestamp, days older than the
  // USAGE_MAX_DAYS kept, and events written before days existed: "" counts toward all-time only.
  day: string;
  n: number;      // API responses
  in: number;     // uncached input
  out: number;    // output, thinking included
  cw5m: number;   // cache writes, 5-minute TTL
  cw1h: number;   // cache writes, 1-hour TTL
  cr: number;     // cache reads
  ws: number;     // web search requests
  wf: number;     // web fetch requests
}
export const USAGE_NUMBERS = ["n", "in", "out", "cw5m", "cw1h", "cr", "ws", "wf"] as const;
// The same numbers per UTC clock hour ("2026-10-28T09"), for the plan's 5-hour window. Only the transcript's newest
// USAGE_MAX_HOURS hours with a response are kept (a 5-hour window touches at most 6 clock hours); older ones are dropped,
// not folded, since the day rows already hold every response.
export interface HourRow extends Omit<UsageRow, "day"> { hr: string }
export const USAGE_MAX_HOURS = 6;
export const USAGE_MAX_HOUR_ROWS = 96;
// A Claude model id, optionally with a two-letter region and Bedrock's "anthropic." prefix ("us.anthropic.claude-...").
// Anything else is stored as "unknown", so no free text gets in.
export const MODEL_ID = /^(?:[a-z]{2}\.)?(?:anthropic\.)?claude-[a-z0-9.-]{1,56}$/;
// Agent identity from a hook payload or the log: a value that fails these is left out, never stored as free text.
export const AGENT_ID = /^[A-Za-z0-9_-]{1,64}$/;
export const AGENT_TYPE = /^[A-Za-z0-9_.:-]{1,100}$/;
export const agentIdOf = (v: unknown): string | undefined => (typeof v === "string" && AGENT_ID.test(v) ? v : undefined);
export const agentTypeOf = (v: unknown): string | undefined => (typeof v === "string" && AGENT_TYPE.test(v) ? v : undefined);
export const USAGE_TEXT = "Usage update";   // fixed: counts go in rows, never in text (redact() would mask long ones)
// Size of one usage event: the newest USAGE_MAX_DAYS days keep their own rows, older ones fold into day "".
// The windows need 7 days; the 8th covers a day boundary between the hook's write and the board's read.
export const USAGE_MAX_DAYS = 8;
export const USAGE_MAX_ROWS = 512;

// Days are calendar strings, compared as text. A value that is not a real date becomes "" (all-time only).
export const DAY = /^\d{4}-\d{2}-\d{2}$/;
const utcDayOf = (ms: number) => (Number.isFinite(ms) && Math.abs(ms) <= 8.64e15 ? new Date(ms).toISOString().slice(0, 10) : "");
export const dayOf = (v: unknown): string =>
  typeof v === "string" && DAY.test(v) && utcDayOf(Date.parse(`${v}T00:00:00Z`)) === v ? v : "";
const pad2 = (n: number) => String(n).padStart(2, "0");
// The machine's local calendar day of a time; the reader and the ledger both default to it.
export const localDay = (ms: number): string => {
  const d = new Date(ms);
  return Number.isFinite(d.getTime()) ? dayOf(`${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`) : "";
};
// Calendar arithmetic on the string itself, so a DST change can never skip or repeat a day. "" for a bad day.
export const addDays = (day: string, n: number): string => dayOf(utcDayOf(Date.parse(`${dayOf(day)}T00:00:00Z`) + n * 86_400_000));
// A UTC clock hour "YYYY-MM-DDTHH", checked by round trip like a day; "" for anything else.
export const HOUR = /^\d{4}-\d{2}-\d{2}T\d{2}$/;
export const utcHour = (ms: number): string => (Number.isFinite(ms) && Math.abs(ms) <= 8.64e15 ? new Date(ms).toISOString().slice(0, 13) : "");
export const hourOf = (v: unknown): string => (typeof v === "string" && HOUR.test(v) && utcHour(Date.parse(`${v}:00:00Z`)) === v ? v : "");

// The plan's rate-limit reading: what the toon-crew mod (plugin/hooks/plan-mod.mjs) saw in Claude Code's
// `session.measure`, handed to the Stop hook (board/limits.ts) through one environment variable and kept in
// LIMITS_FILE. Numbers, times and one flag only. Short key names: redaction blanks keys that say token or session.
export type LimitId = "5h" | "7d";
export interface LimitReading { id: LimitId; pct: number; end: string | null }   // pct 0-100; end: reset time, ISO UTC
// sub: true when a 5-hour or weekly window was reported (claude.ai subscriptions only); false when responses came back
// with none (API key, cloud provider, or a gateway's spend limit).
export interface LimitsReading { v: 1; at: string; sub: boolean; w: LimitReading[] }
export const LIMITS_FILE = join(LOG_DIR, "limits.json");
export const LIMITS_ENV = "TOON_CREW_LIMITS";
const LIMIT_IDS: ReadonlyMap<string, LimitId> = new Map<string, LimitId>([["5h", "5h"], ["7d", "7d"]]);
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const isoOf = (v: unknown): string | null => {
  if (typeof v !== "string" || !ISO_UTC.test(v) || !dayOf(v.slice(0, 10))) return null;
  const ms = Date.parse(v);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
};

// The allow-list both ends use (the writer on the environment variable, the board on the file): known keys only,
// a finite percentage clamped to 0-100, real UTC times, each window at most once. Anything else gives null.
export function limitsReading(x: unknown): LimitsReading | null {
  if (!x || typeof x !== "object" || Array.isArray(x)) return null;
  const r = x as Record<string, unknown>;
  const at = isoOf(r.at);
  if (r.v !== 1 || !at || typeof r.sub !== "boolean" || !Array.isArray(r.w) || r.w.length > LIMIT_IDS.size) return null;
  const w: LimitReading[] = [];
  for (const raw of r.w) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const y = raw as Record<string, unknown>;
    const id = typeof y.id === "string" ? LIMIT_IDS.get(y.id) : undefined;
    const end = y.end === null ? null : isoOf(y.end);
    if (!id || w.some((q) => q.id === id) || typeof y.pct !== "number" || !Number.isFinite(y.pct) || (y.end !== null && !end)) return null;
    w.push({ id, pct: Math.min(100, Math.max(0, Math.round(y.pct * 10) / 10)), end });
  }
  return { v: 1, at, sub: r.sub, w };
}

export interface BoardEvent {
  id: string;          // also the board's feed doc_id, so it uses only doc_id-safe characters
  ts: string;          // UTC ISO, taken when the hook or poller fires
  kind: EventKind;
  text: string;        // one human line, already redacted
  project?: string;    // project name (registry or folder name) the event came from
  sid?: string;        // first 8 chars of the session id: enough to tell sessions apart (not "session": redaction masks that key)
  agentId?: string;
  agentType?: string;
  from?: string;       // assign: who gave the work ("doraemon" for the main session)
  to?: string;         // assign: the agent type receiving it
  toId?: string;       // assign via SendMessage: the receiving agent id, so a resumed agent counts as working again
  model?: string;      // assign: the Agent tool's per-call model, when it gave one
  declaredModel?: string;   // assign: the model in the agent's own file ("inherit" or no file: absent)
  effectiveModel?: string;  // assign: the model it runs on: call > file > CLAUDE_CODE_SUBAGENT_MODEL > "main"
  ref?: string;        // commit SHA, PR URL, CI run id or deploy version, for dedupe and links
  ok?: boolean;        // CI/deploy outcome
  role?: string;       // task-queue: the role id the work is queued for
  priority?: "P0" | "P1" | "P2";   // task-queue
  taskId?: string;     // task-start/done/drop: which task ("t-<ms>-<hex>"; a queued or assign task's id is its event id with "t" for "e")
  need?: Need;         // needs-you: what the owner is asked for
  why?: "size" | "merge";   // compact-hint: the context grew past its limit, or a PR was merged
  ctx?: number;        // compact-hint (size): the context in thousands, kept out of text
  scope?: "main" | "agent";   // usage: the main session's transcript or one subagent's
  final?: boolean;     // usage: that transcript is finished (SubagentStop, SessionEnd)
  partial?: boolean;   // usage: a read budget stopped the sum early
  rows?: UsageRow[];   // usage: cumulative for that transcript; the newest per (sid, agentId ?? "main") wins
  hours?: HourRow[];   // usage: the same transcript's newest clock hours, for the plan's 5-hour window
  since?: string;      // usage: the earliest day of any response in that transcript, also when folded into day ""
}

// What lib/usage.ts readUsage(path, opts) returns: a ready-to-append usage event.
export interface UsageEvent {
  kind: "usage"; project: string; sid: string; agentId?: string; agentType?: string;
  text: typeof USAGE_TEXT; scope: "main" | "agent"; final: boolean; partial: boolean; rows: UsageRow[]; hours?: HourRow[]; since?: string;
}
export interface UsageOptions { scope: "main" | "agent"; agentId?: string; agentType?: string; project: string; sid: string; final: boolean }
// The part of a reader's answer the hook keeps; usageFields() checks it. Identity comes from the hook payload.
export type UsageFields = Pick<UsageEvent, "scope" | "final" | "partial" | "rows" | "hours" | "since">;

const count = (v: unknown) => (typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : 0);

// Hour rows from the log or a reader, re-checked: a pattern-checked model and hour, non-negative integer counts.
// A row without a real hour or without any count is dropped.
export function hourRows(x: unknown): HourRow[] {
  if (!Array.isArray(x)) return [];
  const out: HourRow[] = [];
  for (const r of x.slice(0, USAGE_MAX_HOUR_ROWS)) {
    if (!r || typeof r !== "object") continue;
    const y = r as Record<string, unknown>;
    const hr = hourOf(y.hr);
    if (!hr) continue;
    const row: HourRow = {
      model: typeof y.model === "string" && MODEL_ID.test(y.model) ? y.model : "unknown", speed: y.speed === "fast" ? "fast" : "standard", long: y.long === true,
      hr, n: 0, in: 0, out: 0, cw5m: 0, cw1h: 0, cr: 0, ws: 0, wf: 0,
    };
    for (const k of USAGE_NUMBERS) row[k] = count(y[k]);
    if (USAGE_NUMBERS.some((k) => row[k] > 0)) out.push(row);
  }
  return out;
}

// The hook's own allow-list over whatever the transcript reader returned: known keys only, counts that are
// non-negative integers, a pattern-checked model id and day. No non-empty row means nothing to log (never zeros).
export function usageFields(u: unknown): UsageFields | null {
  if (!u || typeof u !== "object") return null;
  const x = u as Record<string, unknown>;
  if ((x.scope !== "main" && x.scope !== "agent") || !Array.isArray(x.rows)) return null;
  const rows: UsageRow[] = [];
  for (const r of x.rows.slice(0, USAGE_MAX_ROWS)) {
    if (!r || typeof r !== "object") continue;
    const y = r as Record<string, unknown>;
    const row: UsageRow = {
      model: typeof y.model === "string" && MODEL_ID.test(y.model) ? y.model : "unknown", speed: y.speed === "fast" ? "fast" : "standard", long: y.long === true,
      day: dayOf(y.day), n: 0, in: 0, out: 0, cw5m: 0, cw1h: 0, cr: 0, ws: 0, wf: 0,
    };
    for (const k of USAGE_NUMBERS) row[k] = count(y[k]);
    if (USAGE_NUMBERS.some((k) => row[k] > 0)) rows.push(row);
  }
  const since = dayOf(x.since), hours = hourRows(x.hours);
  return rows.length ? { scope: x.scope, final: x.final === true, partial: x.partial === true, rows, ...(hours.length ? { hours } : {}), ...(since ? { since } : {}) } : null;
}

export function newId(at: Date): string {
  return `e-${at.getTime()}-${randomBytes(3).toString("hex")}`;
}

export function appendEvent(e: Omit<BoardEvent, "id" | "ts">, at = new Date()): BoardEvent {
  // id, ts and taskId are ours and skip redaction (a 13-digit id could pass for a card number).
  const event: BoardEvent = { ...redactDeep(e), ...(e.taskId ? { taskId: e.taskId } : {}), id: newId(at), ts: at.toISOString() };
  appendPrivate(EVENTS_FILE, JSON.stringify(event) + "\n");
  return event;
}

// Fields every reader treats as strings: a line where any of them has another type is dropped, so one
// hand-edited line can never throw inside /api/state.
const STRING_FIELDS = ["id", "ts", "kind"] as const, OPTIONAL_STRING_FIELDS = ["agentId", "agentType"] as const;
function isEvent(x: unknown): x is BoardEvent {
  if (!x || typeof x !== "object" || Array.isArray(x)) return false;
  const r = x as Record<string, unknown>;
  return STRING_FIELDS.every((k) => typeof r[k] === "string") && OPTIONAL_STRING_FIELDS.every((k) => r[k] === undefined || typeof r[k] === "string");
}

// One log line, or null for a torn or hand-edited one.
export function parseEvent(line: string): BoardEvent | null {
  if (!line.trim()) return null;
  let parsed: unknown;
  try { parsed = JSON.parse(line); } catch { return null; }   // a torn line
  return isEvent(parsed) ? parsed : null;
}

// Skips a torn or hand-edited line instead of failing the whole page. In the board server (cacheLiveLog), the live
// log comes from the incremental cache below; hooks and CLIs run once and read the file.
export function readEvents(file = EVENTS_FILE): BoardEvent[] {
  if (liveCached && file === EVENTS_FILE) return sharedEvents();
  if (!existsSync(file)) return [];
  const out: BoardEvent[] = [];
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const e = parseEvent(line);
    if (e) out.push(e);
  }
  return out;
}

// Exactly [pos, pos + len), or less when the file is shorter.
function readAt(fd: number, pos: number, len: number): Buffer {
  const buf = Buffer.alloc(len);
  let got = 0;
  while (got < len) {
    const n = readSync(fd, buf, got, len - got, pos + got);
    if (n <= 0) break;
    got += n;
  }
  return got === len ? buf : buf.subarray(0, got);
}
function writeAll(fd: number, buf: Buffer): void {
  for (let done = 0; done < buf.length;) done += writeSync(fd, buf, done, buf.length - done);
}

// ---- The board server's reader: parsed events kept in memory, only appended bytes read ----
// A new inode (compaction renamed a new file in), a shorter file, or changed bytes just before the old end (the file
// was rewritten in place) mean one full re-read. Bytes after the last newline wait for the rest of their line.
export interface EventCache { read(): BoardEvent[]; readonly stats: { full: number; bytes: number } }
const EDGE_BYTES = 64;
export function eventCache(file = EVENTS_FILE): EventCache {
  let ino = -1, dev = -1, offset = 0, edge = Buffer.alloc(0), rest = Buffer.alloc(0), events: BoardEvent[] = [];
  const stats = { full: 0, bytes: 0 };
  const reset = () => { ino = -1; dev = -1; offset = 0; edge = Buffer.alloc(0); rest = Buffer.alloc(0); events = []; };
  const read = (): BoardEvent[] => {
    let fd: number;
    try { fd = openSync(file, constants.O_RDONLY | constants.O_NONBLOCK); } catch { reset(); return []; }
    try {
      const st = fstatSync(fd);
      if (!st.isFile()) { reset(); return []; }
      const same = st.ino === ino && st.dev === dev && st.size >= offset && readAt(fd, offset - edge.length, edge.length).equals(edge);
      if (!same) { reset(); ino = st.ino; dev = st.dev; stats.full++; }
      if (st.size > offset) {
        const chunk = readAt(fd, offset, st.size - offset);
        stats.bytes += chunk.length;
        offset += chunk.length;
        const data = rest.length ? Buffer.concat([rest, chunk]) : chunk, nl = data.lastIndexOf(10);
        edge = Buffer.from(data.subarray(Math.max(0, data.length - EDGE_BYTES)));
        if (nl >= 0) for (const line of data.toString("utf8", 0, nl).split("\n")) { const e = parseEvent(line); if (e) events.push(e); }
        rest = Buffer.from(data.subarray(nl + 1));
      }
    } finally { closeSync(fd); }
    return events.slice();   // a copy: no caller can change the cache
  };
  return { read, stats };
}
// One cache per process for EVENTS_FILE: the server's /api/state and its pollers share it.
let shared: EventCache | undefined, liveCached = false;
export const sharedEvents = (): BoardEvent[] => (shared ??= eventCache()).read();
export function cacheLiveLog(on = true): void { liveCached = on; }

// ---- Compaction: the board server runs it at start, then daily ----
// Usage events are cumulative per transcript and about 90% of the bytes, so only the newest per reader key is kept
// (plus the capped reads before it that it is folded with). Other events are kept for KEEP_EVENT_DAYS, turn ends
// and manager heartbeats for a day. A task still queued or active keeps its own task events whatever their age.
export const KEEP_EVENT_DAYS = 30;
const DAY_MS = 86_400_000;
const BEAT_KINDS: ReadonlySet<string> = new Set(["turn-end", "main-busy"]);
const TASK_KINDS: ReadonlySet<string> = new Set(["task-start", "task-done", "task-drop"]);
const LOCK_STALE_MS = 10 * 60_000;
const CHUNK = 1 << 20;

// The key cost.ts and plan.ts group usage by; null for a usage event neither counts.
export function usageKey(e: Pick<BoardEvent, "sid" | "scope" | "agentId">): string | null {
  const agent = e.scope === "agent" && e.agentId ? e.agentId : e.scope === "main" ? "main" : null;
  return agent === null ? null : `${e.sid ?? ""}\0${agent}`;
}

export interface CompactPlan { keep: boolean[]; fill: Map<number, string> }   // fill: line -> agentType to add

// Pure: one entry per complete line (null for a line no reader keeps). `openTasks` holds task ids ("t-...").
export function planCompaction(events: readonly (BoardEvent | null)[], now: number, openTasks: ReadonlySet<string> = new Set()): CompactPlan {
  const keep = events.map(() => false), fill = new Map<number, string>();
  const cutoff = now - KEEP_EVENT_DAYS * DAY_MS, beatCutoff = now - DAY_MS;
  const usage = new Map<string, { ms: number; i: number; partial: boolean }[]>(), types = new Map<string, string>();
  events.forEach((e, i) => {
    if (!e) return;
    if (e.agentId && e.agentType && e.agentType !== "agent") types.set(e.agentId, e.agentType);
    const ms = Date.parse(e.ts);
    if (!Number.isFinite(ms)) return;
    if (e.kind === "usage") {
      const key = usageKey(e);
      if (key === null) return;
      if (ms > now) { keep[i] = true; return; }   // readers skip it until then; it may be the newest later
      const list = usage.get(key) ?? [];
      list.push({ ms, i, partial: e.partial === true });
      usage.set(key, list);
      return;
    }
    if (BEAT_KINDS.has(e.kind)) { keep[i] = ms >= beatCutoff; return; }
    // tasks.ts taskIdOf: a queued task's id is its event id with "t" for "e".
    const task = e.kind === "task-queue" ? `t${e.id.slice(1)}` : TASK_KINDS.has(e.kind) ? e.taskId : undefined;
    keep[i] = ms >= cutoff || (!!task && openTasks.has(task));
  });
  for (const list of usage.values()) {
    list.sort((a, b) => a.ms - b.ms);   // stable, like the readers: equal times keep log order
    // A capped (partial) read is folded with the one before it, back to the last full read: keep that whole run.
    let k = list.length - 1;
    while (k > 0 && list[k].partial) k--;
    for (let j = k; j < list.length; j++) keep[list[j].i] = true;
  }
  // The start that named a kept usage event's agent may go: the event carries the type itself (cost by role).
  events.forEach((e, i) => {
    if (!keep[i] || !e || e.kind !== "usage" || !e.agentId || (e.agentType && e.agentType !== "agent")) return;
    const t = agentTypeOf(types.get(e.agentId));
    if (t) fill.set(i, t);
  });
  return { keep, fill };
}

// A usage event without its rows: all the plan needs, so a big log is not held in memory twice.
const slim = (e: BoardEvent | null): BoardEvent | null => (e && e.kind === "usage"
  ? { id: e.id, ts: e.ts, kind: e.kind, text: "", sid: e.sid, scope: e.scope, agentId: e.agentId, agentType: e.agentType, partial: e.partial }
  : e);

// Tasks the compacted log must still know: queued, active, or finished inside the kept window.
async function openTaskIds(events: BoardEvent[], now: number): Promise<Set<string>> {
  const { deriveTasks } = await import("./tasks.ts");   // loaded here only: hooks import this file on every call
  const t = deriveTasks(events, undefined, now), cutoff = now - KEEP_EVENT_DAYS * DAY_MS;
  return new Set([...t.queued, ...t.active, ...t.done.filter((x) => Date.parse(x.doneAt ?? "") >= cutoff)].map((x) => x.id));
}

function takeLock(lock: string, now: number): boolean {
  for (let attempt = 0; attempt < 2; attempt++) {
    try { writeFileSync(lock, String(now), { flag: "wx", mode: 0o600 }); return true; } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") return false;
      try { if (now - lstatSync(lock).mtimeMs < LOCK_STALE_MS) return false; unlinkSync(lock); } catch { return false; }
    }
  }
  return false;
}

export interface CompactResult { before: number; after: number; dropped: number }

// Rewrites the log through a temp file and a rename. Hooks keep appending meanwhile: whatever they added after the
// read (and a line cut off at its end) is copied over right before the rename. A line written between that last
// copy and the rename (microseconds) is lost. null: another compaction holds the lock, or there is no plain file.
export async function compactEventLog(file = EVENTS_FILE, now = Date.now()): Promise<CompactResult | null> {
  const lock = `${file}.lock`;
  if (!takeLock(lock, now)) return null;
  let fd: number | null = null;
  const tmp = `${file}.compact.tmp`;
  try {
    try { fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK); } catch { return null; }
    const src = fd, st = fstatSync(src);
    if (!st.isFile()) return null;
    const spans: [number, number][] = [], events: (BoardEvent | null)[] = [];
    let end = 0;   // just after the last newline read
    for (let pos = 0, rest = Buffer.alloc(0); pos < st.size;) {
      const chunk = readAt(src, pos, Math.min(CHUNK, st.size - pos));
      if (!chunk.length) break;
      const data = rest.length ? Buffer.concat([rest, chunk]) : chunk, base = pos - rest.length;
      pos += chunk.length;
      let from = 0;
      for (let nl = data.indexOf(10); nl >= 0; from = nl + 1, nl = data.indexOf(10, from)) {
        spans.push([base + from, nl - from]);
        events.push(slim(parseEvent(data.toString("utf8", from, nl))));
      }
      end = base + from;
      rest = Buffer.from(data.subarray(from));
    }
    const plan = planCompaction(events, now, await openTaskIds(events.filter((e): e is BoardEvent => !!e), now));
    const dropped = plan.keep.filter((k) => !k).length;
    if (!dropped) return { before: st.size, after: st.size, dropped: 0 };
    rmSync(tmp, { force: true });
    // O_EXCL: never a file or link someone else put there; 0600 like every board file.
    const out = openSync(tmp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
    let after = 0, copied = end;
    try {
      let parts: Buffer[] = [], size = 0;
      const flush = () => { if (size) { writeAll(out, Buffer.concat(parts)); after += size; parts = []; size = 0; } };
      plan.keep.forEach((k, i) => {
        if (!k) return;
        let line = readAt(src, spans[i][0], spans[i][1] + 1);   // with its newline
        const t = plan.fill.get(i);
        if (t) line = Buffer.from(JSON.stringify({ ...JSON.parse(line.toString("utf8")), agentType: t }) + "\n");
        parts.push(line);
        size += line.length;
        if (size >= CHUNK) flush();
      });
      flush();
      // Until the file stops growing: hooks append whole lines with one write each.
      for (let size = fstatSync(src).size; size > copied; size = fstatSync(src).size) {
        const b = readAt(src, copied, size - copied);
        if (!b.length) break;
        writeAll(out, b);
        copied += b.length;
        after += b.length;
      }
    } finally { closeSync(out); }
    renameSync(tmp, file);
    return { before: st.size, after, dropped };
  } finally {
    if (fd !== null) closeSync(fd);
    rmSync(tmp, { force: true });
    rmSync(lock, { force: true });
  }
}

// Once now, then every `every` ms (a day by default); the timer does not keep the process alive. Fixed log lines.
export function startCompaction(opts: { file?: string; every?: number; now?: () => number; log?: (line: string) => void } = {}): () => void {
  const file = opts.file ?? EVENTS_FILE, now = opts.now ?? Date.now, log = opts.log ?? ((l: string) => console.log(l));
  let busy = false;
  const pass = () => {
    if (busy) return;
    busy = true;
    let at: number;
    try { at = now(); } catch { busy = false; log("crew board: event log compaction failed; it will try again tomorrow"); return; }
    compactEventLog(file, at)
      .then((r) => { if (r?.dropped) log(`crew board: compacted the event log (${r.dropped} old lines removed)`); },
        () => log("crew board: event log compaction failed; it will try again tomorrow"))
      .finally(() => { busy = false; });
  };
  pass();
  const timer = setInterval(pass, opts.every ?? DAY_MS);
  timer.unref?.();
  return () => clearInterval(timer);
}
