// Claude Code hook entry: reads the hook's JSON from stdin and appends at most one event, plus one usage
// event at Stop / SubagentStop / SessionEnd.
// It always exits 0 and prints nothing, so a logging failure can never block or change a session.
import { closeSync, constants, existsSync, fstatSync, openSync, readFileSync, readSync } from "node:fs";
import { writePrivate } from "./lib/private-fs.ts";
import { join } from "node:path";
import { agentIdOf, agentTypeOf, appendEvent, needOf, NEED_TEXT, readEvents, USAGE_TEXT, usageFields, type BoardEvent, type UsageOptions } from "./lib/events.ts";
import { redact } from "./lib/redact.ts";
import { AGENTS_DIR, EVENTS_FILE, LOG_DIR } from "./lib/paths.ts";
import { projectName } from "./lib/projects.ts";
import { readAgentInfo, slug } from "./lib/crew.ts";
import { ALIASES } from "./lib/roster.ts";
import { resolveModel } from "./lib/model.ts";

// The fields of a hook payload this file reads; anything else is ignored. Notification's `message` and
// `title` are deliberately absent: they are Claude Code's free text and are never read or stored.
interface HookInput {
  hook_event_name?: string; session_id?: string; cwd?: string;
  agent_id?: string; agent_type?: string; last_assistant_message?: string; source?: string; reason?: string;
  tool_name?: string; tool_input?: Record<string, unknown>; tool_response?: unknown;
  notification_type?: string; transcript_path?: string; agent_transcript_path?: string;
}
type Draft = Omit<BoardEvent, "id" | "ts">;
// lib/usage.ts readUsage(path, opts). Its result is untrusted here: usageFields() allow-lists it.
export type ReadUsage = (path: string, opts: UsageOptions) => unknown;

const clip = (s: unknown, n = 160) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

// Bash's tool_response is { stdout, stderr, ... } today; accept a bare string too in case it changes.
function stdoutOf(response: unknown): string {
  if (typeof response === "string") return response;
  const r = response as { stdout?: string; output?: string } | undefined;
  return String(r?.stdout ?? r?.output ?? "");
}

// Only a real commit prints "[branch sha] subject"; that also filters out `git commit --help` and greps.
function commitEvent(cmd: string, out: string): Draft | null {
  if (!/\bgit\b[^|;&]*\bcommit\b/.test(cmd)) return null;
  const m = out.match(/^\[([^\]\s]+)(?: \([^)]*\))? ([0-9a-f]{7,40})\] (.*)$/m);
  if (!m) return null;
  return { kind: "commit", text: `Committed ${m[2]} on ${m[1]}: ${clip(m[3], 120)}`, ref: m[2] };
}

// gh pr create prints the PR URL; merge/close/ready/reopen print "#N". Read-only gh pr calls are skipped.
function prEvent(cmd: string, out: string): Draft | null {
  const sub = cmd.match(/\bgh\s+pr\s+(create|merge|close|ready|reopen)\b/)?.[1];
  if (!sub) return null;
  const url = out.match(/https:\/\/github\.com\/[^\s]+\/pull\/\d+/)?.[0];
  const num = url?.match(/\/pull\/(\d+)/)?.[1] ?? out.match(/#(\d+)/)?.[1] ?? cmd.match(/\bpr\s+\w+\s+(\d+)\b/)?.[1];
  const verb = { create: "Opened", merge: "Merged", close: "Closed", ready: "Marked ready", reopen: "Reopened" }[sub];
  return { kind: "pr", text: `${verb} PR${num ? ` #${num}` : ""}`, ref: url ?? (num ? `#${num}` : undefined) };
}

// Assignment text is only ever the tool's short description or summary, never the prompt or message body.
const say = (s: unknown) => clip(redact(clip(s, 200)), 70);

// Agent id -> agent type from the log, so a SendMessage "to" (an id) names a person on the board.
function typeOfAgent(id: string): string | undefined {
  const hit = readEvents().reverse().find((e) => e.agentId === id && e.agentType && e.agentType !== "agent");
  return hit?.agentType;
}

// The model in the agent's own file; plugin-scoped ("toon-crew:bob"), helper-copy and retired names resolve like the board's roles.
function declaredModelOf(agentType: string): string | undefined {
  const base = slug(agentType.split(":").pop() ?? agentType).replace(/-\d+$/, "");
  return readAgentInfo(join(AGENTS_DIR, `${ALIASES[base] ?? base}.md`)).model;
}

// Main-session tool use that hands work to the crew: starting an agent, or messaging (resuming) one.
function assignEvent(input: HookInput, lookup: (id: string) => string | undefined, env: Record<string, string | undefined>): Draft | null {
  const ti = input.tool_input ?? {};
  const from = input.agent_id ? agentTypeOf(input.agent_type) ?? "agent" : "doraemon";
  if (input.tool_name === "Agent" || input.tool_name === "Task") {
    const to = clip(ti.subagent_type, 60);
    const m = resolveModel(ti.model, declaredModelOf(to), env);
    return to ? { kind: "assign", from, to, text: say(ti.description) || "new task", ...(m.requested ? { model: m.requested } : {}), ...(m.declared ? { declaredModel: m.declared } : {}), effectiveModel: m.effective } : null;
  }
  if (input.tool_name === "SendMessage") {
    const target = clip(ti.to, 80);
    if (!target || target === "*") return null;
    const type = lookup(target);
    return { kind: "assign", from, to: type ?? target, toId: type ? target : undefined, text: say(ti.summary) || "sent a message" };
  }
  return null;
}

// `due` decides when the manager's heartbeat is written (once a minute); tests pass their own.
// `env` is injectable for tests. The project is the registered project (or folder name) of CLAUDE_PROJECT_DIR, else of the hook's cwd.
export function toEvent(input: HookInput, due: () => boolean = () => heartbeatDue(), lookup: (id: string) => string | undefined = typeOfAgent, env: Record<string, string | undefined> = process.env): Draft | null {
  const project = projectName(env.CLAUDE_PROJECT_DIR || input.cwd);
  // Identity is pattern-checked here, once, for every event built from this payload.
  const base = {
    ...(project ? { project } : {}),
    sid: clip(input.session_id, 8) || undefined,
    agentId: agentIdOf(input.agent_id),
    agentType: agentTypeOf(input.agent_type),
  };
  // A resumed agent stops without its own type; the log knows it from the earlier start.
  if (!base.agentType && base.agentId && input.hook_event_name === "SubagentStop") base.agentType = agentTypeOf(lookup(base.agentId));
  const who = base.agentType || "main session";
  switch (input.hook_event_name) {
    case "SubagentStart":
      return { ...base, kind: "agent-start", text: `${who} started` };
    case "SubagentStop":
      return { ...base, kind: "agent-stop", text: `${who} finished${input.last_assistant_message ? `: ${clip(input.last_assistant_message)}` : ""}` };
    case "Stop":
      return { ...base, kind: "turn-end", text: "Main session finished a turn" };
    case "SessionStart":
      return { ...base, kind: "session-start", text: `Session started (${clip(input.source, 20) || "startup"})` };
    case "SessionEnd":
      return { ...base, kind: "session-end", text: `Session ended (${clip(input.reason, 30) || "other"})` };
    case "Notification": {
      // Allow-listed types only, and a fixed line per need: the notification's own words never reach the log.
      const need = needOf(input.notification_type);
      return need ? { ...base, kind: "needs-you", need, text: NEED_TEXT[need] } : null;
    }
    case "PostToolUse": {
      if (input.tool_name === "Agent" || input.tool_name === "Task" || input.tool_name === "SendMessage") {
        const a = assignEvent(input, lookup, env);
        return a ? { ...(project ? { project } : {}), sid: base.sid, ...a } : null;
      }
      if (input.tool_name !== "Bash") return null;
      const cmd = String(input.tool_input?.command ?? "");
      const out = stdoutOf(input.tool_response);
      const e = commitEvent(cmd, out) ?? prEvent(cmd, out);
      if (e) return { ...base, ...e };
      // The main session (no agent id) is the manager at work: one quiet heartbeat a minute, with no command text,
      // lets the Crew Room show Doraemon working until his turn ends.
      return !input.agent_id && due() ? { ...base, kind: "main-busy", text: "Manager at work" } : null;
    }
    default:
      return null;
  }
}

function heartbeatDue(now = Date.now()): boolean {
  const file = join(LOG_DIR, "main-busy.txt");
  if (existsSync(file) && now - Number(readFileSync(file, "utf8")) < 60_000) return false;
  writePrivate(file, String(now));
  return true;
}

// Cost ledger: the transcript that just finished a turn (main) or ended (a subagent's own file).
// Only numbers come back; the path is handed to readUsage, which checks it, and is never stored.
export async function toUsage(input: HookInput, read: ReadUsage, lookup: (id: string) => string | undefined = typeOfAgent, env: Record<string, string | undefined> = process.env): Promise<Draft | null> {
  const ev = input.hook_event_name, agent = ev === "SubagentStop";
  if (ev !== "Stop" && ev !== "SessionEnd" && !agent) return null;
  const path = agent ? input.agent_transcript_path : input.transcript_path;
  // The event's identity comes from the payload, so it passes the same patterns as toEvent's; a bad id means no event.
  const agentId = agent ? agentIdOf(input.agent_id) : undefined;
  if (typeof path !== "string" || !path || (agent && !agentId)) return null;
  const project = projectName(env.CLAUDE_PROJECT_DIR || input.cwd), sid = clip(input.session_id, 8) || undefined;
  const agentType = agentId ? agentTypeOf(input.agent_type) ?? agentTypeOf(lookup(agentId)) : undefined;
  const who = agentId ? { agentId, ...(agentType ? { agentType } : {}) } : {};
  // readUsage wants both as strings; the event below leaves out what the payload did not give.
  const opts: UsageOptions = { scope: agent ? "agent" : "main", final: ev !== "Stop", ...who, project: project ?? "", sid: sid ?? "" };
  let got: unknown;
  try { got = await read(path, opts); } catch { return null; }
  // Whatever the reader returns, the event's identity comes from the payload, its numbers from usageFields().
  const u = usageFields(got);
  if (!u || u.scope !== opts.scope) return null;
  return { ...(project ? { project } : {}), sid, ...who, kind: "usage", text: USAGE_TEXT, ...u };
}

export const USAGE_TAIL_BYTES = 256 * 1024;

// The log's last `tailBytes` only, never the whole file; a first line cut by the start is dropped.
function tail(file: string, tailBytes: number): string {
  const fd = openSync(file, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    const size = fstatSync(fd).size, start = Math.max(0, size - tailBytes), buf = Buffer.alloc(size - start);
    const text = buf.subarray(0, readSync(fd, buf, 0, buf.length, start)).toString("utf8");
    return start > 0 ? text.slice(text.indexOf("\n") + 1) : text;
  } finally { closeSync(fd); }
}

// True only when the newest usage event for the same (sid, agent, scope) in the log's tail has the same rows,
// partial flag and since: writing it again would add bytes and no information. Anything unsure (no such event in
// the tail, a read error, an odd line) is false, so the event is written.
export function repeatsLastUsage(u: Draft, file = EVENTS_FILE, tailBytes = USAGE_TAIL_BYTES): boolean {
  try {
    const lines = tail(file, tailBytes).split("\n");
    for (let i = lines.length - 1; i >= 0; i--) {
      if (!lines[i].includes('"usage"')) continue;
      let parsed: unknown;
      try { parsed = JSON.parse(lines[i]); } catch { continue; }
      if (!parsed || typeof parsed !== "object") continue;
      const x = parsed as Record<string, unknown>;
      if (x.kind !== "usage" || x.sid !== u.sid || x.agentId !== u.agentId || x.scope !== u.scope) continue;
      // Through the same allow-list as the new event, so both sides have one shape and key order.
      const before = usageFields(x);
      return !!before && before.partial === (u.partial === true) && (before.since ?? "") === (u.since ?? "")
        && JSON.stringify(before.rows) === JSON.stringify(u.rows);
    }
    return false;
  } catch { return false; }
}

// Appends a usage event unless it repeats the last one for its transcript; true when it was written.
export function logUsage(u: Draft): boolean {
  if (repeatsLastUsage(u, EVENTS_FILE)) return false;
  appendEvent(u);
  return true;
}

// lib/usage.ts is optional: a missing or broken module means no usage events, never a failed hook.
export async function loadReadUsage(): Promise<ReadUsage | null> {
  try {
    const m: Record<string, unknown> = await import("./lib/usage.ts");
    const fn = m.readUsage;
    return typeof fn === "function" ? (path, opts) => fn(path, opts) : null;
  } catch { return null; }
}

async function main() {
  try {
    let raw = "";
    for await (const chunk of process.stdin) raw += chunk;
    const input: HookInput = JSON.parse(raw);
    const e = toEvent(input);
    if (e) appendEvent(e);
    const read = input.hook_event_name === "Stop" || input.hook_event_name === "SubagentStop" || input.hook_event_name === "SessionEnd" ? await loadReadUsage() : null;
    const u = read ? await toUsage(input, read, (id) => (id === e?.agentId ? e.agentType : undefined) ?? typeOfAgent(id)) : null;
    if (u) logUsage(u);
  } catch { /* never fail the session over a log line */ }
  process.exit(0);
}

if (import.meta.main) main();
