import "./env.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { listRoles, loadRoles } from "../lib/crew.ts";
import { buildRooms } from "../lib/room.ts";
import type { BoardEvent } from "../lib/events.ts";

const now = Date.parse("2026-10-26T12:00:00Z");
const at = (s: number) => new Date(now - s * 1000).toISOString();
let seq = 0;
const ev = (o: Partial<BoardEvent>): BoardEvent => ({ id: `e-${now - 1000 * ++seq}-${seq.toString(16).padStart(6, "0")}`, ts: at(60), kind: "agent-start", text: "", ...o }) as BoardEvent;
const rooms = (events: BoardEvent[], registry: { name: string }[] = []) => buildRooms(events, registry, loadRoles(), listRoles(), now);
const member = (r: ReturnType<typeof rooms>, project: string, id: string) => r[project].members.find((m) => m.id === id)!;

test("two projects with a busy Doraemon each are both managerBusy", () => {
  const r = rooms([ev({ project: "A", kind: "main-busy", ts: at(30) }), ev({ project: "B", kind: "main-busy", ts: at(20) })]);
  assert.equal(r.A.managerBusy, true);
  assert.equal(r.B.managerBusy, true);
  assert.equal(member(r, "A", "doraemon").status, "working");
  assert.equal(member(r, "B", "doraemon").project, "B");
});

test("a turn-end in one project does not idle the other", () => {
  const r = rooms([ev({ project: "A", kind: "main-busy", ts: at(30) }), ev({ project: "B", kind: "main-busy", ts: at(20) }), ev({ project: "A", kind: "turn-end", ts: at(10) })]);
  assert.equal(r.A.managerBusy, false);
  assert.equal(r.B.managerBusy, true);
});

test("bob working in A and B is working in both rooms", () => {
  const r = rooms([ev({ project: "A", agentId: "a1", agentType: "bob" }), ev({ project: "B", agentId: "b1", agentType: "bob" })]);
  assert.equal(member(r, "A", "bob").status, "working");
  assert.equal(member(r, "B", "bob").status, "working");
});

test("an active task makes the role working in its own project only", () => {
  const queued = ev({ project: "A", kind: "task-queue", role: "kevin", text: "plan the route", priority: "P1" });
  const r = rooms([queued, ev({ project: "A", kind: "task-start", taskId: `t${queued.id.slice(1)}`, text: "" }), ev({ project: "B", kind: "main-busy" })]);
  assert.equal(member(r, "A", "kevin").status, "working");
  assert.equal(member(r, "A", "kevin").line, "plan the route");
  assert.equal(member(r, "B", "kevin").status, "idle");
});

test("old events with no registry row leave the project out; a registry row keeps it", () => {
  const old = new Date(now - 8 * 24 * 3600_000).toISOString();
  const r = rooms([ev({ project: "gone", agentId: "g", agentType: "bob", ts: old }), ev({ project: "kept", agentId: "k", agentType: "bob", ts: old })], [{ name: "kept" }, { name: "empty" }]);
  assert.deepEqual(Object.keys(r).sort(), ["empty", "kept"]);
  assert.ok(r.empty.members.every((m) => m.status === "idle"));
});

test("project isolation: A's hand-back text never shows in B", () => {
  const r = rooms([
    ev({ project: "A", agentId: "a1", agentType: "bob" }),
    ev({ project: "A", agentId: "a1", agentType: "bob", kind: "agent-stop", text: "bob finished: SECRET-ALPHA done" }),
    ev({ project: "B", agentId: "b1", agentType: "kevin" }),
  ]);
  assert.match(JSON.stringify(r.A), /SECRET-ALPHA/);
  assert.doesNotMatch(JSON.stringify(r.B), /SECRET-ALPHA/);
  assert.equal(member(r, "B", "bob").status, "idle");
});
