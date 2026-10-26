// Board tasks: queued / active / done / dropped, derived from the event log, plus the `task` CLI.
import "./env.ts";
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { rmSync, statSync } from "node:fs";
import { appendEvent, type BoardEvent } from "../lib/events.ts";
import { EVENTS_FILE } from "../lib/paths.ts";
import { buildState } from "../lib/state.ts";
import { deriveTasks } from "../lib/tasks.ts";
import { run } from "../task.ts";

let clock = Date.parse("2026-10-26T10:00:00Z");
const tick = () => new Date((clock += 1000));
const log = (e: Omit<BoardEvent, "id" | "ts">) => appendEvent(e, tick());
const assign = (to: string, project: string, text = "do the thing") => log({ kind: "assign", from: "doraemon", to: `toon-crew:${to}`, text, project });
const stop = (type: string, project: string) => log({ kind: "agent-stop", agentId: `a-${type}`, agentType: `toon-crew:${type}`, text: `${type} finished`, project });
// The CLI stamps events with the real clock; keep its tasks apart from the fixed one by using these envs.
const cli = (project: string, ...argv: string[]) => run(argv, { CLAUDE_PROJECT_DIR: `/work/${project}` });
const idOf = (out: string) => out.trim().split(" ")[1];
const state = () => deriveTasks(buildState().events.slice().reverse());

beforeEach(() => rmSync(EVENTS_FILE, { force: true }));

test("queue, assign promotes it, the agent's stop finishes it", () => {
  const q = cli("shop", "add", "--role", "bob", "--priority", "P1", "--ref", "feat/x", "Build the thing");
  assert.equal(q.code, 0);
  const id = idOf(q.out);
  assert.match(id, /^t-\d+-[0-9a-f]{6}$/);
  let t = buildState().tasks;
  assert.deepEqual(t.queued.map((x) => [x.id, x.state, x.role, x.priority, x.project, x.text, x.ref]), [[id, "queued", "bob", "P1", "shop", "Build the thing", "feat/x"]]);
  assert.equal(t.active.length, 0);

  assign("bob", "shop", "Build the thing now");
  t = buildState().tasks;
  assert.equal(t.queued.length, 0);
  assert.equal(t.active.length, 1);
  assert.equal(t.active[0].id, id);          // the queued task itself, with its own text
  assert.equal(t.active[0].text, "Build the thing");
  assert.ok(t.active[0].startedAt);
  assert.equal(buildState().projects.find((p) => p.name === "shop")?.working, 1);

  stop("bob", "shop");
  t = buildState().tasks;
  assert.equal(t.active.length, 0);
  assert.deepEqual(t.done.map((x) => [x.id, x.state]), [[id, "done"]]);
  assert.ok(t.done[0].doneAt);
  assert.equal(buildState().projects.find((p) => p.name === "shop")?.working, 0);
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
  const working = Object.fromEntries(buildState().projects.map((p) => [p.name, p.working]));
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
  const t = buildState().tasks.queued[0];
  assert.ok(!t.text.includes(token) && !t.text.includes("ghp_"));
  assert.match(t.text, /\[token\]/);
  assert.ok(t.text.length <= 120);
  assert.ok(!JSON.stringify(buildState()).includes(token));
});

test("an unknown role, priority or empty text is refused with a clear error and writes nothing", () => {
  const before = buildState().events.length;
  const bad = cli("shop", "add", "--role", "mickey", "x");
  assert.equal(bad.code, 2);
  assert.match(bad.out, /unknown role "mickey".*doraemon.*bob/);
  assert.match(cli("shop", "add", "--role", "bob", "--priority", "P9", "x").out, /priority must be/);
  assert.match(cli("shop", "add", "--role", "bob").out, /text is required/);
  assert.match(cli("shop", "add", "x").out, /--role is required/);
  assert.match(cli("shop", "add", "--role").out, /needs a value/);
  assert.equal(cli("shop", "frobnicate").code, 2);
  assert.equal(buildState().events.length, before);
});

test("the event log stays owner-only", () => {
  cli("shop", "add", "--role", "bob", "x");
  assert.equal(statSync(EVENTS_FILE).mode & 0o777, 0o600);
});
