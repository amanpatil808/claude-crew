// The JSONL event log: one line per event, appended with a single write so concurrent hooks
// (several subagents finishing at once) never interleave half-lines.
import { existsSync, readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { EVENTS_FILE } from "./paths.ts";
import { appendPrivate } from "./private-fs.ts";
import { redactDeep } from "./redact.ts";

export type EventKind = "agent-start" | "agent-stop" | "commit" | "pr" | "turn-end" | "session-start" | "session-end" | "ci" | "deploy" | "main-busy" | "assign"
  | "task-queue" | "task-start" | "task-done" | "task-drop"   // board v2 tasks, see lib/tasks.ts
  | "usage"                                                   // cost ledger: cumulative numbers for one transcript
  | "needs-you";                                              // the owner is the blocker (see lib/needs.ts)

// Bookkeeping kinds, not history: kept out of the page's event list and out of task activity.
export const QUIET_KINDS: ReadonlySet<EventKind> = new Set<EventKind>(["usage", "needs-you"]);

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
  scope?: "main" | "agent";   // usage: the main session's transcript or one subagent's
  final?: boolean;     // usage: that transcript is finished (SubagentStop, SessionEnd)
  partial?: boolean;   // usage: a read budget stopped the sum early
  rows?: UsageRow[];   // usage: cumulative for that transcript; the newest per (sid, agentId ?? "main") wins
  since?: string;      // usage: the earliest day of any response in that transcript, also when folded into day ""
}

// What lib/usage.ts readUsage(path, opts) returns: a ready-to-append usage event.
export interface UsageEvent {
  kind: "usage"; project: string; sid: string; agentId?: string; agentType?: string;
  text: typeof USAGE_TEXT; scope: "main" | "agent"; final: boolean; partial: boolean; rows: UsageRow[]; since?: string;
}
export interface UsageOptions { scope: "main" | "agent"; agentId?: string; agentType?: string; project: string; sid: string; final: boolean }
// The part of a reader's answer the hook keeps; usageFields() checks it. Identity comes from the hook payload.
export type UsageFields = Pick<UsageEvent, "scope" | "final" | "partial" | "rows" | "since">;

const count = (v: unknown) => (typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : 0);

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
  const since = dayOf(x.since);
  return rows.length ? { scope: x.scope, final: x.final === true, partial: x.partial === true, rows, ...(since ? { since } : {}) } : null;
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

// Skips a torn or hand-edited line instead of failing the whole page.
export function readEvents(file = EVENTS_FILE): BoardEvent[] {
  if (!existsSync(file)) return [];
  const out: BoardEvent[] = [];
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    let parsed: unknown;
    try { parsed = JSON.parse(line); } catch { continue; }   // a torn line
    if (isEvent(parsed)) out.push(parsed);
  }
  return out;
}
