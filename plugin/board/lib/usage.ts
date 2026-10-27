// Token usage from one Claude Code transcript (.jsonl), as numbers only: the reader touches `type`, `message.id`,
// `message.model` and the numeric `message.usage` fields, never content, tool output or the path itself.
// The transcript format is internal to Claude Code (checked on CLI 2.1.309-2.1.310), so anything odd is skipped.
import { closeSync, constants, fstatSync, lstatSync, openSync, readSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, sep } from "node:path";
import { LONG_PROMPT_TOKENS } from "./prices.ts";
// The event shape, row fields, fixed text and model pattern have one home: lib/events.ts.
import { agentIdOf, agentTypeOf, MODEL_ID, USAGE_TEXT, type UsageEvent, type UsageOptions, type UsageRow } from "./events.ts";

// Overridable for tests only; the hook passes nothing.
export interface ReadLimits {
  root?: string;          // the only folder transcripts may come from
  maxBytes?: number;
  maxMs?: number;
  clock?: () => number;   // milliseconds
  chunkBytes?: number;
  maxLineBytes?: number;
}

export const MAX_BYTES = 512 * 2 ** 20;
export const MAX_MS = 3_000;
const CHUNK_BYTES = 2 ** 20;
const MAX_LINE_BYTES = 16 * 2 ** 20;        // one line longer than this is dropped and the read marked partial

const MESSAGE_ID = /^[A-Za-z0-9_-]{1,128}$/;
const NEEDLE = '"type":"assistant"';             // cheap filter before JSON.parse; the parsed type is checked again

export const transcriptRoot = () => join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude"), "projects");

export interface SafeFile { real: string; dev: number; ino: number }

// A transcript has exactly one name: a hard link is a second name that realpath cannot see, so it could make a
// file outside the root look like one inside it.
const oneName = (st: { isFile(): boolean; nlink: number }) => st.isFile() && st.nlink === 1;

// Only an absolute .jsonl path that is a regular file with one name (a symlink is refused, not followed) whose
// real path is inside the root. Nothing is opened before every check passes.
export function safeTranscript(path: unknown, root = transcriptRoot()): SafeFile | null {
  if (typeof path !== "string" || !isAbsolute(path) || !path.endsWith(".jsonl")) return null;
  try {
    const st = lstatSync(path);
    if (!oneName(st)) return null;
    const real = realpathSync(path), base = realpathSync(root);
    return real.startsWith(base + sep) ? { real, dev: st.dev, ino: st.ino } : null;
  } catch { return null; }
}

const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) && x > 0 ? Math.floor(x) : 0);
const obj = (x: unknown): Record<string, unknown> => (x && typeof x === "object" && !Array.isArray(x) ? x as Record<string, unknown> : {});

type Response = Omit<UsageRow, "n">;

// One assistant line to one response's numbers, or null when it is not one.
function response(line: string): [string, Response] | null {
  let parsed: unknown;
  try { parsed = JSON.parse(line); } catch { return null; }
  const rec = obj(parsed), msg = obj(rec.message), u = obj(msg.usage);
  if (rec.type !== "assistant" || typeof msg.id !== "string" || !MESSAGE_ID.test(msg.id) || !Object.keys(u).length) return null;
  if (msg.model === "<synthetic>") return null;   // Claude Code's own placeholder replies: no API call, no usage
  const model = typeof msg.model === "string" && MODEL_ID.test(msg.model) ? msg.model : "unknown";
  const cc = obj(u.cache_creation), tools = obj(u.server_tool_use);
  const cw1h = num(cc.ephemeral_1h_input_tokens);
  const cwAll = u.cache_creation_input_tokens === undefined ? num(cc.ephemeral_5m_input_tokens) + cw1h : num(u.cache_creation_input_tokens);
  // Without the TTL split, every write is counted as a 5-minute one (the cheaper rate).
  const cw5m = cc.ephemeral_5m_input_tokens === undefined ? Math.max(0, cwAll - cw1h) : num(cc.ephemeral_5m_input_tokens);
  const input = num(u.input_tokens), cr = num(u.cache_read_input_tokens);
  return [msg.id, {
    model, speed: u.speed === "fast" ? "fast" : "standard", long: input + cwAll + cr > LONG_PROMPT_TOKENS,
    in: input, out: num(u.output_tokens), cw5m, cw1h, cr, ws: num(tools.web_search_requests), wf: num(tools.web_fetch_requests),
  }];
}

// Streams the file in chunks. A response is written as several lines (one per content block) repeating the
// same usage, so responses are keyed by message.id and the last line seen wins.
// Exported for the swap test only; callers use readUsage, which checks the path first.
export function sumTranscript(file: SafeFile, limits: ReadLimits = {}): { rows: UsageRow[]; partial: boolean } | null {
  const maxBytes = limits.maxBytes ?? MAX_BYTES, maxMs = limits.maxMs ?? MAX_MS, clock = limits.clock ?? (() => performance.now());
  const maxLine = limits.maxLineBytes ?? MAX_LINE_BYTES;
  // O_NOFOLLOW plus the same inode as the checked path: a file swapped in after the check is not read.
  // O_NONBLOCK: a FIFO swapped in would otherwise block open() for good; a regular file ignores it.
  const fd = openSync(file.real, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const st = fstatSync(fd);
    if (!oneName(st) || st.dev !== file.dev || st.ino !== file.ino) return null;
    const seen = new Map<string, Response>();
    const scan = (text: string) => {
      for (const line of text.split("\n")) {
        if (!line.includes(NEEDLE)) continue;
        const hit = response(line);
        if (hit) seen.set(hit[0], hit[1]);
      }
    };
    const buf = Buffer.allocUnsafe(limits.chunkBytes ?? CHUNK_BYTES);
    // The unfinished line is kept as a list of copied chunks and joined once, at its "\n". Joining on every read
    // copies the whole line each time: memory then grows with the square of the line's length.
    let parts: Buffer[] = [], restLen = 0, bytes = 0, partial = false, dropping = false;
    const start = clock();
    for (;;) {
      if (clock() - start > maxMs) { partial = true; break; }
      if (bytes >= maxBytes) { partial = readSync(fd, Buffer.alloc(1), 0, 1, null) > 0; break; }
      const n = readSync(fd, buf, 0, Math.min(buf.length, maxBytes - bytes), null);
      if (n === 0) break;
      bytes += n;
      const chunk = buf.subarray(0, n);
      let from = 0;
      if (dropping) {   // still inside an over-long line: skip to its end
        const nl = chunk.indexOf(10);
        if (nl < 0) continue;
        from = nl + 1; dropping = false;
      }
      // "\n" is a single byte that never occurs inside a multi-byte UTF-8 character, so cutting there is safe.
      const cut = chunk.lastIndexOf(10);
      if (cut >= from) {
        parts.push(chunk.subarray(from, cut));
        scan(Buffer.concat(parts, restLen + cut - from).toString("utf8"));
        parts = [Buffer.from(chunk.subarray(cut + 1))]; restLen = n - cut - 1;   // copied: `buf` is reused
      } else { parts.push(Buffer.from(chunk.subarray(from))); restLen += n - from; }
      if (restLen > maxLine) { parts = []; restLen = 0; dropping = true; partial = true; }
    }
    // A last line without "\n" may be torn (the transcript is written async); it is used only if it parses.
    if (!partial && !dropping && restLen) scan(Buffer.concat(parts, restLen).toString("utf8"));
    return { rows: toRows(seen.values()), partial };
  } finally { closeSync(fd); }
}

function toRows(responses: Iterable<Response>): UsageRow[] {
  const rows = new Map<string, UsageRow>();
  for (const x of responses) {
    const key = `${x.model}\0${x.speed}\0${x.long}`;
    const row = rows.get(key) ?? { model: x.model, speed: x.speed, long: x.long, n: 0, in: 0, out: 0, cw5m: 0, cw1h: 0, cr: 0, ws: 0, wf: 0 };
    row.n++; row.in += x.in; row.out += x.out; row.cw5m += x.cw5m; row.cw1h += x.cw1h; row.cr += x.cr; row.ws += x.ws; row.wf += x.wf;
    rows.set(key, row);
  }
  return [...rows.values()].sort((a, b) => a.model.localeCompare(b.model) || a.speed.localeCompare(b.speed) || Number(a.long) - Number(b.long));
}

// Cumulative usage of one transcript as a ready-to-append event, or null: a refused path, an unreadable file,
// or no usage found (never an event of zeros, which would wipe out an earlier good total).
export function readUsage(path: string, opts: UsageOptions, limits: ReadLimits = {}): UsageEvent | null {
  if (opts.scope === "agent" && !agentIdOf(opts.agentId)) return null;
  const file = safeTranscript(path, limits.root ?? transcriptRoot());
  if (!file) return null;
  let read: ReturnType<typeof sumTranscript>;
  try { read = sumTranscript(file, limits); } catch { return null; }
  if (!read || !read.rows.length) return null;
  const agent = opts.scope === "agent"
    ? { agentId: opts.agentId, ...(agentTypeOf(opts.agentType) ? { agentType: opts.agentType } : {}) }
    : {};
  return { kind: "usage", project: opts.project, sid: opts.sid, ...agent, text: USAGE_TEXT, scope: opts.scope, final: opts.final, partial: read.partial, rows: read.rows };
}
