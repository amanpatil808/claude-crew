// Board tasks: queued / active / done / dropped, derived from the event log, plus the `task` CLI.
import "./env.ts";
import { afterEach, beforeEach, mock, test } from "node:test";
import assert from "node:assert/strict";
import { rmSync, statSync } from "node:fs";
import { appendEvent, readEvents, type BoardEvent } from "../../plugin/board/lib/events.ts";
import { EVENTS_FILE } from "../../plugin/board/lib/paths.ts";
import { buildState } from "../../plugin/board/lib/state.ts";
import { deriveTasks } from "../../plugin/board/lib/tasks.ts";
import { run } from "../../plugin/board/task.ts";

// The whole file runs on one fake clock, so the CLI (which stamps events with `new Date()`) and the fixtures agree
// on "now" whatever the real date is. A fixture on a fixed date next to real-clock events broke on 2026-10-27.
const START = Date.parse("2026-10-26T10:00:00Z");
let clock = START;
const setClock = (ms: number) => { clock = ms; mock.timers.setTime(ms); };
const tick = () => { setClock(clock + 1000); return new Date(clock); };
const log = (e: Omit<BoardEvent, "id" | "ts">) => appendEvent(e, tick());
const assign = (to: string, project: string, text = "do the thing") => log({ kind: "assign", from: "doraemon", to: `toon-crew:${to}`, text, project });
// A stop is followed by a quiet 10 s, so the next assign is a new job, not a foreground call reporting late.
const stop = (type: string, project: string) => { const e = log({ kind: "agent-stop", agentId: `a-${type}`, agentType: `toon-crew:${type}`, text: `${type} finished`, project }); setClock(clock + 10_000); return e; };
// The CLI stamps events with the real clock; keep its tasks apart from the fixed one by using these envs.
const cli = (project: string, ...argv: string[]) => run(argv, { CLAUDE_PROJECT_DIR: `/work/${project}` });
const idOf = (out: string) => out.trim().split(" ")[1];
// buildState takes its reference time as an argument; read state "as of" the newest event.
const bs = (now = Math.max(0, ...readEvents().map((e) => Date.parse(e.ts)))) => buildState(now);
const state = () => deriveTasks(bs().events.slice().reverse());

beforeEach(() => {
  rmSync(EVENTS_FILE, { force: true });
  mock.timers.enable({ apis: ["Date"], now: START });
  clock = START;
});
afterEach(() => mock.timers.reset());

// The same scenario on dates far from the real one: it must not depend on today's date.
for (const start of ["2020-01-01T00:00:00Z", "2040-01-01T00:00:00Z"]) test(`queue, assign, stop gives the same result when the clock reads ${start.slice(0, 4)}`, () => {
  setClock(Date.parse(start));
  const id = idOf(cli("shop", "add", "--role", "bob", "Build the thing").out);
  assert.deepEqual(bs().tasks.queued.map((x) => x.id), [id]);
  assign("bob", "shop");
  assert.deepEqual(bs().tasks.active.map((x) => [x.id, x.stale]), [[id, undefined]]);
  stop("bob", "shop");
  assert.deepEqual(bs().tasks.done.map((x) => [x.id, x.stale]), [[id, undefined]]);
  assert.equal(bs().tasks.active.length, 0);
});

test("queue, assign promotes it, the agent's stop finishes it", () => {
  const q = cli("shop", "add", "--role", "bob", "--priority", "P1", "--ref", "feat/x", "Build the thing");
  assert.equal(q.code, 0);
  const id = idOf(q.out);
  assert.match(id, /^t-\d+-[0-9a-f]{6}$/);
  let t = bs().tasks;
  assert.deepEqual(t.queued.map((x) => [x.id, x.state, x.role, x.priority, x.project, x.text, x.ref]), [[id, "queued", "bob", "P1", "shop", "Build the thing", "feat/x"]]);
  assert.equal(t.active.length, 0);

  assign("bob", "shop", "Build the thing now");
  t = bs().tasks;
  assert.equal(t.queued.length, 0);
  assert.equal(t.active.length, 1);
  assert.equal(t.active[0].id, id);          // the queued task itself, with its own text
  assert.equal(t.active[0].text, "Build the thing");
  assert.ok(t.active[0].startedAt);
  assert.equal(bs().projects.find((p) => p.name === "shop")?.working, 1);

  stop("bob", "shop");
  t = bs().tasks;
  assert.equal(t.active.length, 0);
  assert.deepEqual(t.done.map((x) => [x.id, x.state]), [[id, "done"]]);
  assert.ok(t.done[0].doneAt);
  assert.equal(bs().projects.find((p) => p.name === "shop")?.working, 0);
});

test("an assign with nothing queued becomes an active task; a stop of another role changes nothing", () => {
  const a = assign("kevin", "shop", "Review the contract");
  stop("bob", "shop");
  const t = state();
  assert.equal(t.active.length, 1);
  assert.deepEqual([t.active[0].id, t.active[0].role, t.active[0].text, t.active[0].priority], [`t${a.id.slice(1)}`, "kevin", "Review the contract", undefined]);
  stop("kevin", "shop");
  assert.equal(state().active.length, 0);
  assert.equal(state().done.length, 1);
});

test("task start, done and drop; dropped tasks are hidden and cannot be reused", () => {
  const a = idOf(cli("shop", "add", "--role", "bob", "A").out), b = idOf(cli("shop", "add", "--role", "bob", "B").out), c = idOf(cli("shop", "add", "--role", "kevin", "C").out);
  assert.equal(cli("shop", "start", b).code, 0);
  assert.deepEqual(state().active.map((x) => x.id), [b]);
  assert.equal(cli("shop", "drop", a).code, 0);
  const t = state();
  assert.deepEqual(t.queued.map((x) => x.id), [c]);
  assert.ok(![...t.active, ...t.queued, ...t.done].some((x) => x.id === a));
  assert.equal(cli("shop", "drop", a).code, 2);          // already dropped
  assert.equal(cli("shop", "start", b).code, 2);         // already active
  assert.equal(cli("shop", "done", b, "--ref", "PR #7").code, 0);
  assert.deepEqual(state().done.map((x) => [x.id, x.ref]), [[b, "PR #7"]]);
  assert.equal(cli("shop", "done", "t-1-abcdef").code, 2);   // unknown id
  assert.equal(cli("shop", "done", "nonsense").code, 2);
  // a dropped task is not promoted by a later assign
  assign("bob", "shop", "fresh");
  assert.equal(state().active.length, 1);
  assert.notEqual(state().active[0].id, a);
});

test("queued tasks sort by priority, then oldest; assign takes the oldest for that role", () => {
  const none = idOf(cli("shop", "add", "--role", "bob", "no priority").out);
  const p2 = idOf(cli("shop", "add", "--role", "bob", "--priority", "P2", "second").out);
  const p1a = idOf(cli("shop", "add", "--role", "bob", "--priority", "P1", "first").out);
  const p0 = idOf(cli("shop", "add", "--role", "kevin", "--priority", "P0", "urgent").out);
  const p1b = idOf(cli("shop", "add", "--role", "bob", "--priority", "P1", "later").out);
  assert.deepEqual(state().queued.map((x) => x.id), [p0, p1a, p1b, p2, none]);
  // "oldest first" for an assign is by queue time, not by priority
  assign("bob", "shop");
  assert.deepEqual(state().active.map((x) => x.id), [none]);
  assign("bob", "shop");
  assert.deepEqual(state().active.map((x) => x.id), [none, p2]);
  stop("bob", "shop");   // finishes the oldest active one
  assert.deepEqual(state().active.map((x) => x.id), [p2]);
  assert.deepEqual(state().done.map((x) => x.id), [none]);
});

test("done keeps the last 10, newest first", () => {
  for (let i = 0; i < 12; i++) { assign("bob", "shop", `job ${i}`); stop("bob", "shop"); }
  const d = state().done;
  assert.equal(d.length, 10);
  assert.equal(d[0].text, "job 11");
  assert.equal(d[9].text, "job 2");
});

test("two projects stay separate", () => {
  const shop = idOf(cli("shop", "add", "--role", "bob", "shop work").out);
  const blog = idOf(cli("blog", "add", "--role", "bob", "blog work").out);
  assign("bob", "blog");
  let t = state();
  assert.deepEqual(t.active.map((x) => [x.id, x.project]), [[blog, "blog"]]);
  assert.deepEqual(t.queued.map((x) => [x.id, x.project]), [[shop, "shop"]]);
  stop("bob", "shop");                   // wrong project: blog's task keeps going
  assert.equal(state().active.length, 1);
  stop("bob", "blog");
  t = state();
  assert.deepEqual(t.done.map((x) => x.id), [blog]);
  assert.deepEqual(t.queued.map((x) => x.id), [shop]);
  const working = Object.fromEntries(bs().projects.map((p) => [p.name, p.working]));
  assert.equal(working.blog, 0);
  // list shows the current project by default, all with --all
  assert.deepEqual(JSON.parse(cli("shop", "list", "--json").out).queued.map((x: { id: string }) => x.id), [shop]);
  assert.equal(JSON.parse(cli("shop", "list", "--all", "--json").out).done.length, 1);
  assert.match(cli("shop", "list").out, /shop work/);
});

test("task text is redacted and clipped to 120 characters", () => {
  const token = "ghp_" + "a1B2c3D4e5".repeat(4);
  const r = cli("shop", "add", "--role", "bob", `deploy with ${token} and a long tail ${"x".repeat(200)}`);
  assert.equal(r.code, 0);
  const t = bs().tasks.queued[0];
  assert.ok(!t.text.includes(token) && !t.text.includes("ghp_"));
  assert.match(t.text, /\[token\]/);
  assert.ok(t.text.length <= 120);
  assert.ok(!JSON.stringify(bs()).includes(token));
});

test("an unknown role, priority or empty text is refused with a clear error and writes nothing", () => {
  const before = bs().events.length;
  const bad = cli("shop", "add", "--role", "mickey", "x");
  assert.equal(bad.code, 2);
  assert.match(bad.out, /unknown role "mickey".*doraemon.*bob/);
  assert.match(cli("shop", "add", "--role", "bob", "--priority", "P9", "x").out, /priority must be/);
  assert.match(cli("shop", "add", "--role", "bob").out, /text is required/);
  assert.match(cli("shop", "add", "x").out, /--role is required/);
  assert.match(cli("shop", "add", "--role").out, /needs a value/);
  assert.equal(cli("shop", "frobnicate").code, 2);
  assert.equal(bs().events.length, before);
});

const at = (ms: number) => new Date(Date.parse("2026-10-26T12:00:00Z") + ms);
const ev = (ms: number, e: Omit<BoardEvent, "id" | "ts">) => appendEvent(e, at(ms));
const bobStop = (ms: number, project = "shop") => ev(ms, { kind: "agent-stop", agentId: "a-bob", agentType: "toon-crew:bob", text: "bob finished", project });
const bobAssign = (ms: number, extra: Partial<BoardEvent> = {}, project = "shop") => ev(ms, { kind: "assign", from: "doraemon", to: "toon-crew:bob", text: "job", project, ...extra });

test("an assign right after the same role's stop (no start between) is ignored; a start or 5 s makes it real", () => {
  bobAssign(0); bobStop(2000);
  bobAssign(3000);                       // a foreground Agent call reporting late
  assert.equal(state().active.length, 0);
  assert.equal(state().done.length, 1);
  ev(3500, { kind: "agent-start", agentId: "a-bob", agentType: "toon-crew:bob", text: "bob started", project: "shop" });
  bobAssign(4000);                       // a start came in between: a new job
  assert.equal(state().active.length, 1);
  bobStop(5000); bobAssign(5000 + 5001);   // more than 5 s later
  assert.equal(state().active.length, 1);
  bobStop(20_000); bobAssign(21_000, {}, "blog");   // another project's assign is not affected
  assert.deepEqual(state().active.map((x) => x.project), ["blog"]);
});

test("an assign with toId re-opens the role's latest done task within 30 minutes, else does nothing", () => {
  bobAssign(0); bobStop(60_000);
  const first = state().done[0].id;
  bobAssign(10 * 60_000, { toId: "a-bob", text: "keep going" });
  let t = state();
  assert.deepEqual(t.active.map((x) => [x.id, x.text, x.state]), [[first, "job", "active"]]);
  assert.equal(t.done.length, 0);
  assert.equal(t.active[0].doneAt, undefined);
  bobStop(11 * 60_000);
  bobAssign(11 * 60_000 + 31 * 60_000, { toId: "a-bob" });   // 31 min after it finished
  t = state();
  assert.equal(t.active.length, 0);
  assert.deepEqual(t.done.map((x) => x.id), [first]);
  bobAssign(100 * 60_000, { toId: "a-bob" }, "blog");        // nothing finished in that project
  assert.equal(state().active.length, 0);
});

test("a resume never takes a queued task or makes a new one", () => {
  const q = idOf(cli("shop", "add", "--role", "bob", "waiting").out);
  bobAssign(0, { toId: "a-bob" });
  const t = state();
  assert.equal(t.active.length, 0);
  assert.deepEqual(t.queued.map((x) => x.id), [q]);
});

// Two queued tasks for nobita: the older is unrelated, the newer is the one an assign may name.
const queueTwo = () => {
  const older = idOf(cli("shop", "add", "--role", "nobita", "Review clone animation and meter").out);
  const newer = idOf(cli("shop", "add", "--role", "nobita", "Design a travel style per character").out);
  return { older, newer };
};
const nobitaAssign = (ms: number, text: string, extra: Partial<BoardEvent> = {}) =>
  ev(ms, { kind: "assign", from: "doraemon", to: "toon-crew:nobita", text, project: "shop", ...extra });

test("an assign binds the queued task its text matches, not the oldest", () => {
  const { older, newer } = queueTwo();
  nobitaAssign(0, "Design per-character travel styles");
  const t = state();
  assert.deepEqual(t.active.map((x) => x.id), [newer]);
  assert.deepEqual(t.queued.map((x) => x.id), [older]);
});

test("an assign with unrelated text binds the oldest queued task", () => {
  const { older, newer } = queueTwo();
  nobitaAssign(0, "Fix the login redirect");
  const t = state();
  assert.deepEqual(t.active.map((x) => x.id), [older]);
  assert.deepEqual(t.queued.map((x) => x.id), [newer]);
});

test("a tie between matching queued tasks goes to the oldest", () => {
  const a = idOf(cli("shop", "add", "--role", "nobita", "Polish the walk cycle").out);
  const b = idOf(cli("shop", "add", "--role", "nobita", "Polish the walk cycle").out);
  nobitaAssign(0, "Polish walk cycle");
  assert.deepEqual(state().active.map((x) => x.id), [a]);
  assert.deepEqual(state().queued.map((x) => x.id), [b]);
});

test("a follow-up to a running, bound agent does not bind a second queued task", () => {
  const { older, newer } = queueTwo();
  nobitaAssign(0, "Design per-character travel styles");
  ev(1000, { kind: "agent-start", agentId: "a-nob", agentType: "toon-crew:nobita", text: "s", project: "shop" });
  nobitaAssign(2000, "Review clone animation and meter", { toId: "a-nob" });   // SendMessage follow-up, same agent
  const t = state();
  assert.deepEqual(t.active.map((x) => x.id), [newer]);
  assert.deepEqual(t.queued.map((x) => x.id), [older]);
});

test("modelOverride is set only when the assign's model differs from the agent file's", () => {
  bobAssign(0, { model: "opus", declaredModel: "sonnet", effectiveModel: "opus" });
  assert.equal(state().active[0].modelOverride, "opus");
  bobStop(1000);
  bobAssign(20_000, { model: "sonnet", declaredModel: "sonnet" });
  bobAssign(21_000, { text: "no model" });
  const t = state().active;
  assert.equal(t.length, 2);
  assert.ok(t.every((x) => x.modelOverride === undefined));
});

// One full round for an agent: assign, start, stop (the stop can be left out to model a missed hook).
const round = (ms: number, agentId: string, role = "bob", opts: { stop?: boolean; project?: string } = {}) => {
  const project = opts.project ?? "shop", type = `toon-crew:${role}`;
  ev(ms, { kind: "assign", from: "doraemon", to: type, text: `job ${agentId}`, project });
  ev(ms + 1000, { kind: "agent-start", agentId, agentType: type, text: "started", project });
  if (opts.stop !== false) ev(ms + 20_000, { kind: "agent-stop", agentId, agentType: type, text: "finished", project });
};
const MIN = 60_000;

test("a missed stop does not make every later stop close the wrong (older) task", () => {
  round(0, "a-old", "bob", { stop: false });          // the stop never arrived
  round(10 * MIN, "a-two");
  round(20 * MIN, "a-three");
  const t = state();
  assert.deepEqual(t.active.map((x) => x.text), ["job a-old"]);       // only the one whose stop was missed
  assert.deepEqual(t.done.map((x) => x.text), ["job a-three", "job a-two"]);
});

test("a stop finishes the task bound to its own agent, whatever order tasks started in", () => {
  ev(0, { kind: "assign", from: "doraemon", to: "toon-crew:bob", text: "first", project: "shop" });
  ev(1000, { kind: "agent-start", agentId: "a-1", agentType: "toon-crew:bob", text: "s", project: "shop" });
  ev(2000, { kind: "assign", from: "doraemon", to: "toon-crew:bob", text: "second", project: "shop" });
  ev(3000, { kind: "agent-start", agentId: "a-2", agentType: "toon-crew:bob", text: "s", project: "shop" });
  ev(4000, { kind: "agent-stop", agentId: "a-2", agentType: "toon-crew:bob", text: "f", project: "shop" });
  assert.deepEqual(state().active.map((x) => x.text), ["first"]);
  ev(5000, { kind: "agent-stop", agentId: "a-2", agentType: "toon-crew:bob", text: "f again", project: "shop" });   // a repeat stop closes nothing else
  assert.deepEqual(state().active.map((x) => x.text), ["first"]);
  ev(6000, { kind: "agent-stop", agentId: "a-1", agentType: "toon-crew:bob", text: "f", project: "shop" });
  assert.equal(state().active.length, 0);
});

test("a resume re-opens the task bound to that agent, and its next stop finishes it again", () => {
  round(0, "a-one");
  round(2 * MIN, "a-two");
  bobAssign(3 * MIN, { toId: "a-one" });                // resume the older agent: its own task comes back, not a-two's
  assert.deepEqual(state().active.map((x) => x.text), ["job a-one"]);
  ev(4 * MIN, { kind: "agent-stop", agentId: "a-one", agentType: "toon-crew:bob", text: "f", project: "shop" });
  assert.equal(state().active.length, 0);
});

test("a resume of an agent that is still running re-opens nothing", () => {
  round(0, "a-done");
  ev(2 * MIN, { kind: "assign", from: "doraemon", to: "toon-crew:bob", text: "running", project: "shop" });
  ev(2 * MIN + 1000, { kind: "agent-start", agentId: "a-live", agentType: "toon-crew:bob", text: "s", project: "shop" });
  bobAssign(3 * MIN, { toId: "a-live" });
  assert.deepEqual(state().active.map((x) => x.text), ["running"]);
  assert.deepEqual(state().done.map((x) => x.text), ["job a-done"]);
});

test("an unbound task, or a bound one whose agent is silent, is shown as done (stale) after 6 hours", () => {
  ev(0, { kind: "assign", from: "doraemon", to: "toon-crew:kevin", text: "lost", project: "shop" });   // no start, no stop
  round(1 * MIN, "a-bob", "bob", { stop: false });                                                      // bound, stop missed
  round(2 * MIN, "a-mike", "mike-wazowski", { stop: false });
  ev(5 * 60 * MIN, { kind: "agent-start", agentId: "a-x", agentType: "toon-crew:sulley", text: "s", project: "blog" });
  assert.deepEqual(state().active.map((x) => x.role).sort(), ["bob", "kevin", "mike-wazowski"]);
  ev(5 * 60 * MIN + 30 * MIN, { kind: "pr", agentId: "a-mike", agentType: "toon-crew:mike-wazowski", text: "pr", project: "shop" });   // any event of the agent is activity
  ev(6 * 60 * MIN + 10 * MIN, { kind: "agent-start", agentId: "a-y", agentType: "toon-crew:sulley", text: "s", project: "blog" });
  const t = state();
  assert.deepEqual(t.active.map((x) => x.role), ["mike-wazowski"]);
  assert.deepEqual(t.done.map((x) => [x.role, x.stale]).sort(), [["bob", true], ["kevin", true]]);
  const bob = t.done.find((x) => x.role === "bob");
  assert.equal(bob?.doneAt, new Date(at(1 * MIN + 1000).getTime() + 6 * 3_600_000).toISOString());   // last agent event + 6 h
});

test("buildState judges staleness by the wall clock it is given", () => {
  ev(0, { kind: "assign", from: "doraemon", to: "toon-crew:kevin", text: "lost", project: "shop" });
  const t0 = at(0).getTime();
  assert.equal(buildState(t0 + 5 * 3_600_000).tasks.active.length, 1);
  assert.equal(buildState(t0 + 7 * 3_600_000).tasks.active.length, 0);
  assert.equal(buildState(t0 + 7 * 3_600_000).projects.find((p) => p.name === "shop")?.working, 0);
});

test("the event log stays owner-only", () => {
  cli("shop", "add", "--role", "bob", "x");
  assert.equal(statSync(EVENTS_FILE).mode & 0o777, 0o600);
});
