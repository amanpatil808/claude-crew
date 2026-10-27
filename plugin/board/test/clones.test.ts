import "./env.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { listRoles, loadRoles } from "../lib/crew.ts";
import { roomFeed, roomFor } from "../lib/room.ts";
import type { BoardEvent } from "../lib/events.ts";

const STALE_AGENT_MS = 6 * 3_600_000;   // same horizon as tasks.ts STALE_AFTER_MS

const NOW = Date.parse("2026-10-28T12:00:00Z");
const at = (minAgo: number) => new Date(NOW - minAgo * 60_000).toISOString();
let n = 0;
const ev = (o: Partial<BoardEvent>): BoardEvent => ({ id: "e-" + ++n, ts: at(0), kind: "agent-start", text: "", project: "shop", ...o }) as BoardEvent;
const SH = "toon-crew:shinchan";
const start = (agentId: string, minAgo: number, o: Partial<BoardEvent> = {}) => ev({ kind: "agent-start", agentId, agentType: SH, ts: at(minAgo), text: `${SH} started`, ...o });
const stop = (agentId: string, minAgo: number, o: Partial<BoardEvent> = {}) => ev({ kind: "agent-stop", agentId, agentType: SH, ts: at(minAgo), text: `${SH} finished: ok`, ...o });

const roles = loadRoles(), cards = listRoles();
const room = (events: BoardEvent[], project = "shop") => roomFor(project, events, roles, cards, NOW);
const shin = (r: ReturnType<typeof room>) => r.members.find((m) => m.id === "shinchan")!;
const clones = (events: BoardEvent[]) => roomFeed(events, roles).filter((f) => f.kind === "clone");

test("two concurrent shinchan starts give copies 2, copyIds oldest first and one clone item with n=2", () => {
  const events = [start("a1", 5), start("a2", 1)];
  const r = room(events);
  assert.equal(shin(r).copies, 2);
  assert.deepEqual(shin(r).copyIds, ["a1", "a2"]);
  const c = clones(events);
  assert.equal(c.length, 1);
  assert.deepEqual([c[0].kind, c[0].role, c[0].n, c[0].agentId, c[0].ts, c[0].project], ["clone", "shinchan", 2, "a2", at(1), "shop"]);
  assert.deepEqual(r.crew, { running: 2, cap: 4, roles: 1 });
});

test("a stop brings copies back to 1 and a lone agent has no clone item", () => {
  const events = [start("a1", 5), start("a2", 3), stop("a2", 1)];
  assert.equal(shin(room(events)).copies, 1);
  assert.deepEqual(shin(room(events)).copyIds, ["a1"]);
  assert.equal(clones([start("a1", 5)]).length, 0);
  assert.equal(shin(room([start("a1", 5)])).copies, 1);
  assert.equal(shin(room([start("a1", 5), stop("a1", 1)])).copies, 0);
});

test("a start after the other copy stopped is not a clone", () => {
  assert.equal(clones([start("a1", 9), stop("a1", 7), start("a2", 3)]).length, 0);
  assert.equal(shin(room([start("a1", 9), stop("a1", 7), start("a2", 3)])).copies, 1);
});

test("three copies give n=3 on the third clone item", () => {
  const events = [start("a1", 6), start("a2", 4), start("a3", 2)];
  assert.equal(shin(room(events)).copies, 3);
  assert.deepEqual(clones(events).map((c) => c.n), [3, 2]);   // newest first
  assert.equal(room(events).crew.running, 3);
});

test("the manager's main session and generic helpers are not counted in crew.running", () => {
  const events = [
    start("a1", 5),
    ev({ kind: "agent-start", agentId: "m", agentType: "agent", ts: at(4), text: "main" }),
    ev({ kind: "agent-start", agentId: "d", agentType: "toon-crew:doraemon", ts: at(3), text: "manager" }),
    ev({ kind: "main-busy", ts: at(1), text: "Manager at work" }),
  ];
  assert.deepEqual(room(events).crew, { running: 1, cap: 4, roles: 1 });
});

test("distinct roles count once each in crew.roles, copies count in running", () => {
  const events = [start("a1", 5), start("a2", 4), start("b1", 3, { agentType: "toon-crew:bob" })];
  assert.deepEqual(room(events).crew, { running: 3, cap: 4, roles: 2 });
  assert.equal(room(events).members.find((m) => m.id === "bob")!.copies, 1);
});

test("roles in different projects do not mix", () => {
  const events = [start("a1", 5, { project: "shop" }), start("a2", 1, { project: "recipe" })];
  assert.equal(shin(room(events, "shop")).copies, 1);
  assert.equal(shin(room(events, "recipe")).copies, 1);
  assert.equal(room(events, "shop").crew.running, 1);
  assert.equal(clones(events).length, 0);
});

test("a never-stopped start beyond the staleness rule does not count", () => {
  const old = STALE_AGENT_MS / 60_000 + 30;
  const events = [start("a1", old), start("a2", 1)];
  assert.equal(shin(room(events)).copies, 1);
  assert.deepEqual(shin(room(events)).copyIds, ["a2"]);
  assert.equal(room(events).crew.running, 1);
  assert.equal(clones(events).length, 0);
});

// ---- ghosts: a start whose agent died without a stop ----
test("a start with no stop and no events for 46 minutes is a ghost: idle, Lost contact, stale, not counted", () => {
  const r = room([start("g1", 46)]);
  assert.deepEqual([shin(r).status, shin(r).line, shin(r).stale, shin(r).copies], ["idle", "Lost contact", true, 0]);
  assert.deepEqual(r.crew, { running: 0, cap: 4, roles: 0 });
});

test("a start 30 minutes ago is still working", () => {
  const r = room([start("g1", 30)]);
  assert.deepEqual([shin(r).status, shin(r).stale, shin(r).copies], ["working", undefined, 1]);
  assert.equal(r.crew.running, 1);
});

test("the agent's own later events keep it alive; its session's commits and the manager's heartbeat do not", () => {
  assert.equal(shin(room([start("g1", 120), ev({ kind: "assign", to: SH, toId: "g1", from: "doraemon", ts: at(10), text: "go" })])).copies, 1);
  assert.equal(shin(room([start("g1", 120, { sid: "s1" }), ev({ kind: "commit", sid: "s1", agentId: "g1", ts: at(5), text: "Commit" })])).copies, 1);
  assert.equal(shin(room([start("g1", 120, { sid: "s1" }), ev({ kind: "commit", sid: "s1", ts: at(5), text: "Commit" })])).copies, 0);
  assert.equal(shin(room([start("g1", 120, { sid: "s1" }), ev({ kind: "main-busy", sid: "s1", ts: at(1), text: "busy" })])).copies, 0);
});

test("a ghost and a live copy of the same role give copies 1 and no clone", () => {
  const events = [start("g1", 120), start("a2", 2)];
  const r = room(events);
  assert.equal(shin(r).copies, 1);
  assert.deepEqual(shin(r).copyIds, ["a2"]);
  assert.equal(r.crew.running, 1);
  assert.equal(clones(events).length, 0);
});

test("after 6 hours a ghost is plain idle, no longer stale", () => {
  const r = room([start("g1", 7 * 60)]);
  assert.deepEqual([shin(r).status, shin(r).line, shin(r).stale], ["idle", "Idle", undefined]);
});
