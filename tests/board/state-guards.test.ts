// /api/state guards from the security review: a hand-edited log line never breaks the page (I4), a project named
// "__proto__" keeps its snapshot and facts (L3), and cost.tasks lists only the tasks the board still shows:
// active, queued and done in the last 7 days (I5). The server's own 500 is in server-errors.test.ts.
import "./env.ts";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, test } from "node:test";
import { appendEvent, localDay, readEvents, type BoardEvent } from "../../plugin/board/lib/events.ts";
import { EVENTS_FILE, REGISTRY_FILE } from "../../plugin/board/lib/paths.ts";
import { buildState } from "../../plugin/board/lib/state.ts";
import { taskIdOf } from "../../plugin/board/lib/tasks.ts";

beforeEach(() => { rmSync(EVENTS_FILE, { force: true }); writeFileSync(REGISTRY_FILE, "[]"); });

const GOOD = { id: "e-1-aaaaaa", ts: "2026-10-27T10:00:00.000Z", kind: "needs-you", sid: "s1aaaaaa", need: "permission", text: "Waiting for your permission" };

test("[I4] readEvents drops a line whose id, ts, kind, agentId or agentType has the wrong type", () => {
  const bad = [
    { ...GOOD, agentType: { x: 1 } }, { ...GOOD, agentId: 7 }, { ...GOOD, id: 1 }, { ...GOOD, ts: Date.now() }, { ...GOOD, kind: ["usage"] },
    { ...GOOD, id: undefined }, { ...GOOD, kind: null }, 5, null, [GOOD], "e-1",
  ];
  writeFileSync(EVENTS_FILE, [...bad.map((b) => JSON.stringify(b)), "{torn", JSON.stringify({ ...GOOD, agentId: "a1", agentType: "toon-crew:bob" })].join("\n") + "\n");
  assert.deepEqual(readEvents(), [{ ...GOOD, agentId: "a1", agentType: "toon-crew:bob" }]);
});

test("[I4] /api/state still builds with a hand-edited line that has an object agentType", () => {
  writeFileSync(EVENTS_FILE, JSON.stringify({ ...GOOD, ts: new Date().toISOString(), agentId: "a1", agentType: { x: 1 } }) + "\n");
  const s = buildState();
  assert.deepEqual(s.needsYou, []);
});

test("[L3] a registered project named __proto__ keeps its snapshot and facts in /api/state", () => {
  const dir = mkdtempSync(join(tmpdir(), "crew-proto-"));
  mkdirSync(join(dir, ".git"));
  writeFileSync(join(dir, ".git", "HEAD"), "ref: refs/heads/feat/x\n");
  writeFileSync(REGISTRY_FILE, JSON.stringify([{ name: "__proto__", path: dir }]));
  const s = buildState();
  const sent = JSON.parse(JSON.stringify(s));
  assert.ok(Object.hasOwn(sent.snapshots, "__proto__"), `snapshots: ${JSON.stringify(sent.snapshots)}`);
  assert.ok(Object.hasOwn(sent.factsByProject, "__proto__"));
  assert.deepEqual(sent.factsByProject.__proto__, [{ label: "Branch", value: "feat/x" }]);
  assert.equal(Object.getPrototypeOf(s.snapshots), Object.prototype);
  assert.equal(Object.getPrototypeOf(s.factsByProject), Object.prototype);
});

test("[I5] cost.tasks and its windows list only active, queued and recently done tasks", () => {
  const N = Date.parse("2026-10-27T12:00:00Z"), DAY = 86_400_000, MIN = 60_000;
  // The board's default day is the machine's local day, so the rows carry that day of their own time.
  const row = (ms: number) => ({ model: "claude-sonnet-5-5", speed: "standard" as const, long: false, day: localDay(ms), n: 1, in: 1, out: 1, cw5m: 0, cw1h: 0, cr: 0, ws: 0, wf: 0 });
  const add = (ms: number, e: Partial<BoardEvent> & Pick<BoardEvent, "kind">) => appendEvent({ text: "x", project: "shop", sid: "s1aaaaaa", ...e }, new Date(ms));
  // One agent run: assigned, started, used tokens, and (unless still running) stopped.
  const run = (ms: number, type: string, agentId: string, stop = true) => {
    const a = add(ms, { kind: "assign", from: "doraemon", to: type });
    add(ms + MIN, { kind: "agent-start", agentId, agentType: type });
    add(ms + 2 * MIN, { kind: "usage", scope: "agent", agentId, agentType: type, final: stop, partial: false, rows: [row(ms + 2 * MIN)] });
    if (stop) add(ms + 3 * MIN, { kind: "agent-stop", agentId, agentType: type });
    return taskIdOf(a.id);
  };
  const old = run(N - 10 * DAY, "toon-crew:bob", "b0");                 // done 10 days ago: out
  const q = add(N - 3 * DAY, { kind: "task-queue", role: "bob", text: "dropped work" });
  run(N - 3 * DAY + MIN, "toon-crew:bob", "b1", false);                 // takes the queued task...
  add(N - 3 * DAY + 10 * MIN, { kind: "task-drop", taskId: taskIdOf(q.id) });   // ...which is then dropped: out
  const recent = Array.from({ length: 11 }, (_, i) => run(N - 2 * DAY + i * 10 * MIN, "toon-crew:kevin", `k${i}`));   // more than the 10 done shown
  const active = run(N - 60 * MIN, "toon-crew:kevin", "k-live", false);
  const s = buildState(N);
  assert.ok(s.cost);
  const want = [...recent, active].sort();
  assert.deepEqual(Object.keys(s.cost.tasks).sort(), want);
  assert.deepEqual(Object.keys(s.cost.windows["7d"].tasks).sort(), want);
  for (const id of Object.keys(s.cost.windows.today.tasks)) assert.ok(want.includes(id), id);
  assert.ok(!(old in s.cost.tasks) && !(taskIdOf(q.id) in s.cost.windows["7d"].tasks));
  assert.equal(s.tasks.done.length, 10);
});
