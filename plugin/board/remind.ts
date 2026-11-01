// Stop hook (sync): reminds the owner to run /compact or /clear when the main session's context is big or a PR
// was just merged. Output is one JSON line {"systemMessage": "..."} only when reminding; every error prints
// nothing and exits 0. The transcript is read for numbers only (see lib/usage.ts for its limits and path checks).
import { createHash } from "node:crypto";
import { closeSync, constants, existsSync, fstatSync, openSync, readFileSync, readSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { appendEvent, COMPACT_TEXT, type BoardEvent } from "./lib/events.ts";
import { EVENTS_FILE, LOG_DIR } from "./lib/paths.ts";
import { writePrivate } from "./lib/private-fs.ts";
import { projectName } from "./lib/projects.ts";
import { safeTranscript } from "./lib/usage.ts";

export const SIZE_LIMIT = 200_000;   // context tokens at which the first reminder shows
export const SIZE_STEP = 100_000;    // further growth needed before the next one
const TAIL_BYTES = 2 * 2 ** 20;      // the last assistant message is near the end; a longer line than this is skipped
const EVENT_TAIL_BYTES = 256 * 1024;

interface StopInput { hook_event_name?: string; session_id?: string; cwd?: string; agent_id?: string; transcript_path?: string }
interface State { size: number; merge: string }   // last reminded context (0: none yet), time of the last merge handled

const obj = (x: unknown): Record<string, unknown> => (x && typeof x === "object" && !Array.isArray(x) ? x as Record<string, unknown> : {});
const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) && x > 0 ? Math.floor(x) : 0);

function tailOf(file: string, bytes: number): string {
  const fd = openSync(file, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    const size = fstatSync(fd).size, start = Math.max(0, size - bytes), buf = Buffer.alloc(size - start);
    const text = buf.subarray(0, readSync(fd, buf, 0, buf.length, start)).toString("utf8");
    return start > 0 ? text.slice(text.indexOf("\n") + 1) : text;   // the first line may be cut by the start
  } finally { closeSync(fd); }
}

// The context the last API response was sent with: uncached input + cache reads + cache writes. A response is
// several transcript lines repeating one usage; the newest line of the newest message is the current size.
// 0 for a refused path, an unreadable file or no usage.
export function contextTokens(path: unknown, root?: string): number {
  const file = safeTranscript(path, root);
  if (!file) return 0;
  const lines = tailOf(file.real, TAIL_BYTES).split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!lines[i].includes('"type":"assistant"')) continue;
    let rec: Record<string, unknown>;
    try { rec = obj(JSON.parse(lines[i])); } catch { continue; }
    const msg = obj(rec.message), u = obj(msg.usage);
    if (rec.type !== "assistant" || rec.isSidechain === true || msg.model === "<synthetic>" || !Object.keys(u).length) continue;
    const cc = obj(u.cache_creation);
    const created = u.cache_creation_input_tokens === undefined ? num(cc.ephemeral_5m_input_tokens) + num(cc.ephemeral_1h_input_tokens) : num(u.cache_creation_input_tokens);
    return num(u.input_tokens) + num(u.cache_read_input_tokens) + created;
  }
  return 0;
}

// Newest merge event of this session in the log's tail ("" for none). The board's hook writes it on every
// `gh pr merge`, so this is the "a merge happened in this session" signal.
export function lastMergeTime(sid8: string, file = EVENTS_FILE): string {
  if (!existsSync(file)) return "";
  let best = "";
  for (const line of tailOf(file, EVENT_TAIL_BYTES).split("\n")) {
    if (!line.includes('"kind":"pr"')) continue;
    let e: Partial<BoardEvent>;
    try { e = obj(JSON.parse(line)) as Partial<BoardEvent>; } catch { continue; }
    if (e.kind === "pr" && e.sid === sid8 && typeof e.text === "string" && e.text.startsWith("Merged PR") && typeof e.ts === "string" && e.ts > best) best = e.ts;
  }
  return best;
}

// The state file is named by a hash of the session id and holds two plain values, never any transcript text.
const stateFile = (sid: string) => join(LOG_DIR, "remind", `${createHash("sha256").update(sid).digest("hex").slice(0, 24)}.json`);

function readState(file: string): State {
  try {
    const s = obj(JSON.parse(readFileSync(file, "utf8")));
    return { size: num(s.size), merge: typeof s.merge === "string" ? s.merge : "" };
  } catch { return { size: 0, merge: "" }; }
}

// What to tell the owner for this Stop, and the state to keep. A size reminder wins over a merge one when both
// are due; the merge is then marked handled too, so it does not repeat.
export const MERGE_MESSAGE = "PR merged. Good time to /clear (the board and hand-back summaries keep the state), or /compact keep the next steps.";

// The size reminder: a headline and the owner's options. The /autocompact line is dropped once it is set.
export function sizeMessage(ctx: number, showAuto: boolean): string {
  return [
    `Context is ${Math.round(ctx / 1000)}K tokens (re-sent every turn). Options:`,
    " • /compact keep the open PR, queued tasks and decisions   (shrink, keep working)",
    " • /clear   (fresh start; best when the work is committed; the board and summaries keep the state)",
    ...(showAuto ? [" • /autocompact 200k   (one time: auto-compact at 200K from now on)"] : []),
  ].join("\n");
}

// The one setting read from the owner's settings.json: autoCompactWindow, nothing else is kept. Unreadable,
// missing or not a number means "not set", so the line stays.
export const AUTO_WINDOW_MAX = 250_000;
export function autoCompactSet(env: Record<string, string | undefined>): boolean {
  try {
    const w = obj(JSON.parse(readFileSync(join(env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude"), "settings.json"), "utf8"))).autoCompactWindow;
    return typeof w === "number" && Number.isFinite(w) && w > 0 && w <= AUTO_WINDOW_MAX;
  } catch { return false; }
}

export function decide(ctx: number, merge: string, prev: State, showAuto = true): { message: string; why: "size" | "merge"; next: State } | null {
  // A context that fell under the limit (after /compact or /clear) re-arms the size reminder.
  const base: State = { size: ctx < SIZE_LIMIT ? 0 : prev.size, merge: prev.merge };
  const sizeDue = ctx >= SIZE_LIMIT && (base.size === 0 || ctx >= base.size + SIZE_STEP);
  const mergeDue = merge > base.merge;
  if (sizeDue) return { message: sizeMessage(ctx, showAuto), why: "size", next: { size: ctx, merge: mergeDue ? merge : base.merge } };
  if (mergeDue) return { message: MERGE_MESSAGE, why: "merge", next: { size: base.size, merge } };
  return base.size === prev.size ? null : { message: "", why: "size", next: base };
}

// Returns the JSON line to print, or "" for nothing. Main session Stop only.
export function run(input: StopInput, env: Record<string, string | undefined> = process.env): string {
  if (input.hook_event_name !== "Stop" || input.agent_id || typeof input.session_id !== "string" || !input.session_id) return "";
  const sid8 = input.session_id.replace(/\s+/g, " ").trim().slice(0, 8), file = stateFile(input.session_id), prev = readState(file);
  const d = decide(contextTokens(input.transcript_path), lastMergeTime(sid8), prev, !autoCompactSet(env));
  if (!d) return "";
  writePrivate(file, JSON.stringify(d.next));
  if (!d.message) return "";
  const project = projectName(env.CLAUDE_PROJECT_DIR || input.cwd);
  appendEvent({ ...(project ? { project } : {}), sid: sid8, kind: "compact-hint", text: COMPACT_TEXT, why: d.why, ...(d.why === "size" ? { ctx: Math.round(d.next.size / 1000) } : {}) });
  return JSON.stringify({ systemMessage: d.message });
}

function main() {
  try {
    const out = run(JSON.parse(readFileSync(0, "utf8")));
    if (out) process.stdout.write(out + "\n");
  } catch { /* never fail or slow a Stop over a reminder */ }
  process.exit(0);
}

if (import.meta.main) main();
