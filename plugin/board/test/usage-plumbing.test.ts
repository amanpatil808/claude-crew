// The board side of the cost ledger: where the hook calls readUsage, what it keeps of the answer,
// that usage rows survive redaction, the optional usage.ts / cost.ts modules, and task activity.
import "./env.ts";
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadReadUsage, logUsage, repeatsLastUsage, toEvent, toUsage, type ReadUsage } from "../hook.ts";
import { appendEvent, QUIET_KINDS, readEvents, USAGE_MAX_ROWS, USAGE_NUMBERS, usageFields, type BoardEvent, type UsageOptions, type UsageRow } from "../lib/events.ts";
import { loadRoles } from "../lib/crew.ts";
import { EVENTS_FILE } from "../lib/paths.ts";
import { costOf, loadBuildCost } from "../lib/state.ts";
import { buildCost } from "../lib/cost.ts";
import { deriveTasks, taskOfAgent } from "../lib/tasks.ts";

const ENV = { CLAUDE_PROJECT_DIR: "/work/acme" };
const PATH = "/home/someone/.claude/projects/-work-acme/5e55a0f1-unique-path-marker.jsonl";
const SUB = "/home/someone/.claude/projects/-work-acme/5e55a0f1/subagents/agent-a1-unique-path-marker.jsonl";
const row = (over: Partial<UsageRow> = {}): UsageRow => ({ model: "claude-sonnet-5-5", speed: "standard", long: false, day: "2026-10-27", n: 23, in: 48, out: 13072, cw5m: 59124, cw1h: 0, cr: 1036895, ws: 0, wf: 0, ...over });
const base = { session_id: "5e55a0f1-0000", cwd: "/tmp", transcript_path: PATH };

// A fake readUsage that records its calls and echoes the scope it was asked for.
function reader(answer: (opts: UsageOptions) => unknown = (o) => ({ scope: o.scope, final: o.final, partial: false, rows: [row()] })) {
  const calls: [string, UsageOptions][] = [];
  const read: ReadUsage = (path, opts) => { calls.push([path, opts]); return answer(opts); };
  return { read, calls };
}
const usage = (input: Record<string, unknown>, read: ReadUsage, lookup = (_: string): string | undefined => undefined) => toUsage(input, read, lookup, ENV);

beforeEach(() => rmSync(EVENTS_FILE, { force: true }));

test("Stop sums the main transcript; SessionEnd marks it final", async () => {
  const r = reader();
  assert.deepEqual(await usage({ ...base, hook_event_name: "Stop" }, r.read), {
    project: "acme", sid: "5e55a0f1", kind: "usage", text: "Usage update", scope: "main", final: false, partial: false, rows: [row()],
  });
  assert.equal((await usage({ ...base, hook_event_name: "SessionEnd", reason: "exit" }, r.read))?.final, true);
  const who = { project: "acme", sid: "5e55a0f1" };
  assert.deepEqual(r.calls, [[PATH, { scope: "main", final: false, ...who }], [PATH, { scope: "main", final: true, ...who }]]);
  // no project or session in the payload: readUsage still gets strings, the event leaves them out
  const bare = await toUsage({ hook_event_name: "Stop", transcript_path: PATH }, r.read, () => undefined, {});
  assert.deepEqual(r.calls.at(-1), [PATH, { scope: "main", final: false, project: "", sid: "" }]);
  assert.deepEqual([bare && "project" in bare, bare?.sid], [false, undefined]);
});

test("SubagentStop sums the subagent's own transcript, with its id and type", async () => {
  const r = reader();
  const e = await usage({ ...base, hook_event_name: "SubagentStop", agent_id: "a1", agent_type: "toon-crew:bob", agent_transcript_path: SUB }, r.read);
  assert.deepEqual(r.calls, [[SUB, { scope: "agent", final: true, agentId: "a1", agentType: "toon-crew:bob", project: "acme", sid: "5e55a0f1" }]]);
  assert.deepEqual([e?.scope, e?.agentId, e?.agentType, e?.final], ["agent", "a1", "toon-crew:bob", true]);
  // a resumed agent stops without its type: the log supplies it
  const resumed = await usage({ ...base, hook_event_name: "SubagentStop", agent_id: "a1", agent_transcript_path: SUB }, r.read, (id) => (id === "a1" ? "toon-crew:kevin" : undefined));
  assert.equal(resumed?.agentType, "toon-crew:kevin");
});

test("no read for other hooks, a missing path, or a subagent stop without its id or own transcript", async () => {
  const r = reader();
  for (const input of [
    { ...base, hook_event_name: "PostToolUse", tool_name: "Bash" }, { ...base, hook_event_name: "Notification", notification_type: "idle_prompt" },
    { ...base, hook_event_name: "SubagentStart", agent_id: "a1" }, { ...base, hook_event_name: "Stop", transcript_path: undefined },
    { ...base, hook_event_name: "Stop", transcript_path: 42 }, { ...base, hook_event_name: "SubagentStop", agent_transcript_path: SUB },
    { ...base, hook_event_name: "SubagentStop", agent_id: "a1" },   // never falls back to the main transcript
  ]) assert.equal(await usage(input, r.read), null, JSON.stringify(input));
  assert.deepEqual(r.calls, []);
});

test("nothing is logged when the reader has nothing, throws, or answers for the wrong scope", async () => {
  for (const answer of [() => null, () => undefined, () => "rows", () => ({ scope: "main", rows: [] }), () => ({ scope: "main", rows: [row({ n: 0, in: 0, out: 0, cw5m: 0, cr: 0 })] }), () => ({ scope: "agent", rows: [row()] }), () => { throw new Error("EACCES /home/someone/secret"); }]) {
    assert.equal(await usage({ ...base, hook_event_name: "Stop" }, reader(answer).read), null);
  }
  assert.ok((await usage({ ...base, hook_event_name: "Stop" }, async (_p, o) => ({ scope: o.scope, rows: [row()] })))?.rows);   // an async reader works too
});

test("the hook keeps only allow-listed usage fields: no text, paths, secrets or odd values from the reader", async () => {
  const planted = "sk-ant-" + "api03-PLANTEDsecretVALUE0123456789";   // concatenated so gitleaks never sees a token
  const answer = () => ({
    scope: "main", final: "yes", partial: 1, text: planted, path: PATH, kind: "commit", project: "evil", sid: "x", agentId: "x",
    rows: [
      { ...row(), model: planted, content: planted, speed: "warp", long: "true", in: -5, out: 1.5, cr: Number.NaN, cw5m: "99", cw1h: 2 ** 60, ws: 3, extra: 1 },
      "not a row", null,
    ],
  });
  const e = await usage({ ...base, hook_event_name: "Stop" }, reader(answer).read);
  assert.deepEqual(e, {
    project: "acme", sid: "5e55a0f1", kind: "usage", text: "Usage update", scope: "main", final: false, partial: false,
    rows: [{ model: "unknown", speed: "standard", long: false, day: "2026-10-27", n: 23, in: 0, out: 0, cw5m: 0, cw1h: 0, cr: 0, ws: 3, wf: 0 }],
  });
  assert.ok(!JSON.stringify(e).includes("unique-path-marker"));
  assert.deepEqual(Object.keys(e?.rows?.[0] ?? {}).sort(), ["cr", "cw1h", "cw5m", "day", "in", "long", "model", "n", "out", "speed", "wf", "ws"]);
});

test("the hook allow-lists the day: a real YYYY-MM-DD date or \"\", anything else becomes \"\" with its numbers kept", async () => {
  const days: unknown[] = ["2026-10-27", "", "2026-02-29", "2028-02-29", "2026-13-01", "2026-10-27T00:00:00Z", " 2026-10-27", "2026-1-7", 20261027, null, undefined,
    { toString: () => "2026-10-27" }, "sk-ant-" + "api03-PLANTED", "../../etc", "9876543210"];
  const answer = () => ({ scope: "main", rows: days.map((day, i) => ({ ...row({ n: i + 1 }), day })) });
  const e = await usage({ ...base, hook_event_name: "Stop" }, reader(answer).read);
  assert.deepEqual(e?.rows?.map((r) => [r.n, r.day]), [[1, "2026-10-27"], [2, ""], [3, ""], [4, "2028-02-29"], ...days.slice(4).map((_, i) => [i + 5, ""])]);
});

test("usageFields caps the number of rows at the shared cap", () => {
  const many = Array.from({ length: 2000 }, (_, i) => row({ model: `m-${i}` }));
  assert.equal(usageFields({ scope: "main", rows: many })?.rows.length, USAGE_MAX_ROWS);
  assert.equal(USAGE_MAX_ROWS, 512);
});

test("the hook keeps a real since day and drops anything else", async () => {
  for (const [since, want] of [["2026-09-01", "2026-09-01"], ["2026-02-30", undefined], ["sk-ant-" + "x", undefined], [20260901, undefined]] as const) {
    const e = await usage({ ...base, hook_event_name: "Stop" }, reader((o) => ({ scope: o.scope, rows: [row()], since })).read);
    assert.equal(e?.since, want, String(since));
  }
});

// What toUsage hands main(): a ready usage draft for one transcript.
const draft = (over: Partial<BoardEvent> = {}): Omit<BoardEvent, "id" | "ts"> =>
  ({ project: "acme", sid: "5e55a0f1", kind: "usage", text: "Usage update", scope: "main", final: false, partial: false, rows: [row()], since: "2026-10-20", ...over });
const usageCount = () => readEvents().filter((e) => e.kind === "usage").length;

test("a usage event that repeats the last one for its (sid, agent) is not written again", () => {
  assert.equal(logUsage(draft()), true, "the first is written");
  assert.equal(logUsage(draft({ final: true })), false, "same rows at SessionEnd: skipped");
  assert.equal(usageCount(), 1);
  // Anything that changes what the board shows is written.
  assert.equal(logUsage(draft({ rows: [row({ out: 13073 })] })), true, "new numbers");
  assert.equal(logUsage(draft({ rows: [row({ out: 13073 })], partial: true })), true, "the partial flag changed");
  assert.equal(logUsage(draft({ rows: [row({ out: 13073 })], partial: true, since: "2026-10-01" })), true, "since changed");
  assert.equal(logUsage(draft({ rows: [row({ out: 13073 })], partial: true, since: "2026-10-01" })), false);
  // Compared only with the newest event of the same transcript: other sessions, agents and kinds in between do not count.
  appendEvent({ kind: "commit", text: "Committed abc", project: "acme" });
  assert.equal(logUsage(draft({ sid: "other000", rows: [row({ out: 13073 })], partial: true, since: "2026-10-01" })), true, "another session");
  assert.equal(logUsage(draft({ scope: "agent", agentId: "a1", rows: [row({ out: 13073 })], partial: true, since: "2026-10-01" })), true, "an agent of the same session");
  assert.equal(logUsage(draft({ scope: "agent", agentId: "a2", rows: [row({ out: 13073 })], partial: true, since: "2026-10-01" })), true, "another agent, same numbers");
  assert.equal(logUsage(draft({ rows: [row({ out: 13073 })], partial: true, since: "2026-10-01" })), false, "the main session again: still a repeat");
  assert.equal(logUsage(draft({ rows: [row()] })), true, "back to the first numbers: compared with the newest, not any older one");
  assert.equal(usageCount(), 8);
});

test("the repeat check reads only the log's tail and writes the event whenever it is unsure", () => {
  const dir = mkdtempSync(join(tmpdir(), "crew-usage-tail-")), file = join(dir, "events.jsonl");
  const line = (over: Partial<BoardEvent> = {}) => JSON.stringify({ id: "e-1-aaaaaa", ts: "2026-10-27T10:00:00.000Z", ...draft(), ...over }) + "\n";
  assert.equal(repeatsLastUsage(draft(), join(dir, "missing.jsonl")), false, "no log yet");
  mkdirSync(join(dir, "folder.jsonl"));
  assert.equal(repeatsLastUsage(draft(), join(dir, "folder.jsonl")), false, "a read error");
  writeFileSync(file, line());
  assert.equal(repeatsLastUsage(draft(), file), true, "control: the same event is a repeat");
  // The matching event sits before the tail: not seen, so not a repeat.
  appendFileSync(file, line({ kind: "commit", text: "x".repeat(2000), rows: undefined }));
  assert.equal(repeatsLastUsage(draft(), file, 4096), true);
  assert.equal(repeatsLastUsage(draft(), file, 1500), false, "outside the tail");
  // A tail that starts 10 bytes into the matching line drops that line rather than parsing what is left of it.
  assert.equal(repeatsLastUsage(draft(), file, statSync(file).size - 10), false, "cut line dropped");
  // A torn last line, an old event without days, and an odd line are never a match.
  writeFileSync(file, line() + line().slice(0, 40));
  assert.equal(repeatsLastUsage(draft(), file), true, "the torn line is skipped, the whole one before it still matches");
  writeFileSync(file, line({ rows: [{ ...row(), day: undefined } as unknown as UsageRow] }));
  assert.equal(repeatsLastUsage(draft(), file), false, "old rows without a day differ from day rows");
  writeFileSync(file, '{"kind":"usage","sid":"5e55a0f1","scope":"main","rows":"x"}\n');
  assert.equal(repeatsLastUsage(draft(), file), false);
});

test("usage rows survive appendEvent and readEvents unchanged: no key is blanked, no count is masked", () => {
  // 9876543210 looks like a phone and 4111111111111111 like a card in text; as numbers under neutral keys they must survive.
  const rows = [row(), row({ model: "claude-opus-5-5", speed: "fast", long: true, n: 193, in: 440, out: 139488, cw5m: 0, cw1h: 396475, cr: 9876543210, ws: 2, wf: 4111111111111111 })];
  appendEvent({ kind: "usage", text: "Usage update", project: "acme", sid: "5e55a0f1", agentId: "a03765539f7237cdd", agentType: "toon-crew:kevin", scope: "agent", final: true, partial: false, rows });
  const [back] = readEvents();
  assert.deepEqual(back.rows, rows);
  assert.deepEqual([back.scope, back.final, back.partial, back.text, back.agentId], ["agent", true, false, "Usage update", "a03765539f7237cdd"]);
  for (const k of USAGE_NUMBERS) assert.ok(!/token|session|secret|password|cookie|key/i.test(k), k);
});

test("a usage event is never treated as an assignment, a stop or anything else the hook logs", () => {
  assert.equal(toEvent({ ...base, hook_event_name: "Stop" }, () => false, () => undefined, ENV)?.kind, "turn-end");
  assert.ok(QUIET_KINDS.has("usage") && QUIET_KINDS.has("needs-you") && QUIET_KINDS.size === 2);
});

test("the optional modules: loaded when the file exists, absent means null, never a throw", async () => {
  const lib = join(import.meta.dirname, "..", "lib");
  const read = await loadReadUsage();
  assert.equal(typeof read, existsSync(join(lib, "usage.ts")) ? "function" : "object");
  if (!existsSync(join(lib, "usage.ts"))) assert.equal(read, null);
  // the real reader is reached through the loader: a path outside the transcripts folder is refused
  if (read) assert.equal(await read("/etc/passwd", { scope: "main", final: false, project: "acme", sid: "s1" }), null);
  const build = await loadBuildCost();
  assert.equal(typeof build, existsSync(join(lib, "cost.ts")) ? "function" : "object");
  if (!existsSync(join(lib, "cost.ts"))) assert.equal(build, null);
  if (build) assert.deepEqual(Object.keys(build([], Date.parse("2026-10-27T18:00:00Z")).windows), ["today", "7d"]);
});

test("cost: null without a ledger or when it throws; the ledger gets (events, now, { roles, taskOf })", () => {
  const roles = loadRoles();
  assert.equal(costOf([], roles, 1, null), null);
  assert.equal(costOf([], roles, 1, () => { throw new Error("boom"); }), null);
  const events = [
    ev(0, { kind: "assign", from: "doraemon", to: "toon-crew:bob", text: "build" }),
    ev(1, { kind: "agent-start", agentId: "a1", agentType: "toon-crew:bob" }),
  ];
  let seen: unknown;
  const out = costOf(events, roles, 42, (es, now, opts) => {
    seen = { events: es.length, now, roles: opts?.roles?.size, taskOf: [...(opts?.taskOf ?? [])] };
    return buildCost(es, now, opts);
  });
  assert.equal(out?.basis, "estimate");
  assert.deepEqual(seen, { events: 2, now: 42, roles: roles.size, taskOf: [["a1", `t${events[0].id.slice(1)}`]] });
});

// Task activity, on a fixed clock.
const T0 = Date.parse("2026-10-26T10:00:00Z");
let n = 0;
const ev = (min: number, e: Partial<BoardEvent> & Pick<BoardEvent, "kind">): BoardEvent =>
  ({ id: `e-${T0 + min * 60_000}-${(n++).toString(16).padStart(6, "0")}`, ts: new Date(T0 + min * 60_000).toISOString(), text: "", project: "shop", ...e });
const HOUR = 60;

test("a usage event is not task activity: a quiet task still goes stale", () => {
  const events = [
    ev(0, { kind: "assign", from: "doraemon", to: "toon-crew:bob", text: "build" }),
    ev(1, { kind: "agent-start", agentId: "a1", agentType: "toon-crew:bob" }),
    ev(5 * HOUR, { kind: "usage", agentId: "a1", agentType: "toon-crew:bob", scope: "agent", rows: [row()] }),   // a late sweep
  ];
  const t = deriveTasks(events, loadRoles(), T0 + (6 * HOUR + 2) * 60_000);
  assert.equal(t.active.length, 0);
  assert.equal(t.done[0]?.stale, true);
  assert.equal(t.done[0]?.doneAt, new Date(T0 + (6 * HOUR + 1) * 60_000).toISOString());
  // a real event of the agent at the same time does keep it going (so does a wait on the owner)
  for (const kind of ["commit", "needs-you"] as const) {
    const live = deriveTasks([...events.slice(0, 2), ev(5 * HOUR, { kind, agentId: "a1", need: "permission" })], loadRoles(), T0 + (6 * HOUR + 2) * 60_000);
    assert.equal(live.active.length, 1, kind);
  }
});

test("taskOfAgent: an agent counts toward the last task it was bound to", () => {
  const events = [
    ev(0, { kind: "assign", from: "doraemon", to: "toon-crew:bob", text: "first" }),
    ev(1, { kind: "agent-start", agentId: "a1", agentType: "toon-crew:bob" }),
    ev(2, { kind: "agent-stop", agentId: "a1", agentType: "toon-crew:bob" }),
    ev(3, { kind: "assign", from: "doraemon", to: "toon-crew:kevin", text: "other" }),
    ev(4, { kind: "agent-start", agentId: "k1", agentType: "toon-crew:kevin" }),
  ];
  const first = `t${events[0].id.slice(1)}`, other = `t${events[3].id.slice(1)}`;
  assert.deepEqual([...taskOfAgent(events, loadRoles())], [["a1", first], ["k1", other]]);
  // a SendMessage resume of a1 after its own task finished re-opens that task: still the same one
  const resumed = [...events, ev(5, { kind: "assign", from: "doraemon", to: "toon-crew:bob", toId: "a1", text: "more" })];
  assert.equal(taskOfAgent(resumed, loadRoles()).get("a1"), first);
  // a1 is started again for a new bob task after its first one finished: it now counts toward the second only
  const second = ev(10, { kind: "assign", from: "doraemon", to: "toon-crew:bob", text: "second" });
  const rebound = [...events, second, ev(11, { kind: "agent-start", agentId: "a1", agentType: "toon-crew:bob" })];
  assert.equal(taskOfAgent(rebound, loadRoles()).get("a1"), `t${second.id.slice(1)}`);
});
