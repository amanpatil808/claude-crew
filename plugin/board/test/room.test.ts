import "./env.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { listRoles, loadRoles, crewFrom, readAgentInfo } from "../lib/crew.ts";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mainBusy, roomFeed, roomMembers, roomFacts, roomTalks, roleNotes, managerActive } from "../lib/room.ts";
import type { BoardEvent } from "../lib/events.ts";

const ev = (o: Partial<BoardEvent>): BoardEvent => ({ id: "e-" + Math.random(), ts: new Date().toISOString(), kind: "agent-start", text: "", ...o }) as BoardEvent;

// A throwaway agents folder, so the tests do not depend on the plugin's real agent files.
function agentsFolder(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "crew-agents-"));
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, `${name}.md`), body);
  return dir;
}
const TOM = "---\nname: tom\ndescription: Tester who runs every check. (v0.2, training)\nmodel: haiku\neffort: low\ncolor: cyan\nmaxTurns: 40\n---\nbody";

test("listRoles gives the 13 roster roles in desk order, even with no agent files", () => {
  const roles = listRoles(agentsFolder({}));
  assert.equal(roles.length, 13);
  assert.deepEqual(roles.map((r) => r.order), [...roles.map((r) => r.order)].sort((a, b) => a - b));
  assert.deepEqual(roles.map((r) => r.id).sort(), ["bob-the-builder", "chhota-bheem", "chip-and-dale", "dexter", "doraemon", "dorami", "nobita", "scooby-doo", "scrooge", "shinchan", "shizuka", "tom", "velma"]);
  assert.ok(roles.every((r) => r.id && r.mascot && r.role));
  assert.equal(roles.find((r) => r.id === "chip-and-dale")?.mascot, "Chip & Dale");
});

test("feed keeps outcomes only: no generic helpers, no main session, no repeated starts, no passing CI", () => {
  const roles = loadRoles();
  const feed = roomFeed([
    ev({ agentId: "a", agentType: "tom", text: "tom started" }),
    ev({ agentId: "a", agentType: "tom", text: "tom started" }),
    ev({ agentId: "g", agentType: "general-purpose", text: "general-purpose started" }),
    ev({ agentId: "m", agentType: "agent", kind: "agent-stop", text: "main session finished: chatter" }),
    ev({ agentId: "a", agentType: "tom", kind: "agent-stop", text: "tom finished: All 120 tests pass" }),
    ev({ kind: "ci", ok: true, text: "CI x: success" }),
    ev({ kind: "ci", ok: false, text: "CI x on main: failure" }),
    ev({ kind: "commit", text: "Commit abc" }),
    ev({ kind: "pr", text: "Opened PR #23" }),
    ev({ kind: "deploy", ok: true, text: "Deploy ok v0.22.0: healthy" }),
  ], roles);
  assert.deepEqual(feed.map((f) => f.text).reverse(), ["Tom started", "Tom handed back: All 120 tests pass", "CI x on main: failure", "Opened PR #23", "Deployed v0.22.0 ok"]);
  assert.equal(feed.length, 5);
  assert.ok(!feed.some((f) => /general|main session|Commit/.test(f.text)));
});

test("members: working beats done, unknown roles are idle; facts are at most three", () => {
  const roles = loadRoles();
  const events = [ev({ agentId: "a", agentType: "tom", text: "tom started" })];
  const members = roomMembers(crewFrom(events, roles), ["tom", "doraemon"]);
  assert.equal(members.find((m) => m.id === "tom")?.status, "working");
  assert.equal(members.find((m) => m.id === "doraemon")?.status, "working");   // managing Tom
  assert.match(members.find((m) => m.id === "doraemon")?.line ?? "", /^Managing Tom/);
  assert.equal(roomMembers([], ["doraemon"])[0].status, "idle");
  assert.equal(roomMembers([], ["doraemon"], true)[0].line, "Working now");
  assert.ok(roomFacts(members, { status: "ok", version: "v1" }).length <= 3);
});

test("the manager is busy from a heartbeat until his turn ends, 10 minutes at most", () => {
  const at = (min: number) => new Date(Date.parse("2026-10-22T10:00:00Z") + min * 60_000).toISOString();
  const now = Date.parse(at(5));
  assert.equal(mainBusy([ev({ kind: "main-busy", ts: at(1) })], now), true);
  assert.equal(mainBusy([ev({ kind: "main-busy", ts: at(1) }), ev({ kind: "turn-end", ts: at(2) })], now), false);
  assert.equal(mainBusy([ev({ kind: "main-busy", ts: at(1) })], Date.parse(at(20))), false);
  assert.equal(mainBusy([ev({ kind: "turn-end", ts: at(1) }), ev({ kind: "main-busy", ts: at(3) })], now), true);
});

test("talks, feed lines and hover notes for assignments and resumed agents", () => {
  const roles = loadRoles(), now = Date.now();
  const at = (s: number) => new Date(now - s * 1000).toISOString();
  const events = [
    ev({ ts: at(90), agentId: "s1", agentType: "shinchan", text: "shinchan started" }),
    ev({ ts: at(80), agentId: "s1", kind: "agent-stop", text: "main session finished: Built the hallway" }),
    ev({ ts: at(40), kind: "assign", from: "doraemon", to: "shinchan", toId: "s1", text: "keep old numbers while fetching" }),
    ev({ ts: at(30), kind: "assign", from: "doraemon", to: "nobody-here", text: "x" }),
    ev({ ts: new Date(now - 3_600_000).toISOString(), kind: "assign", from: "doraemon", to: "tom", text: "old" }),
  ];
  const talks = roomTalks(events, roles, now);
  assert.deepEqual(talks.map((t) => [t.from, t.to, t.text]), [["doraemon", "shinchan", "keep old numbers while fetching"]]);
  const feed = roomFeed(events, roles);
  assert.ok(feed.some((f) => f.text === "Doraemon → Shinchan: keep old numbers while fetching" && f.tone === "assign"));
  assert.ok(feed.some((f) => f.tone === "done" && f.say === "Built the hallway"));   // untyped stop resolved by agent id
  const members = roomMembers(crewFrom(events, roles), ["shinchan"], false, roleNotes(events, roles));
  assert.equal(members[0].status, "working");   // the message resumed the agent
  assert.equal(members[0].task, "keep old numbers while fetching");
  assert.equal(members[0].lastHandback, "Built the hallway");
});

test("agent files give model, effort, colour, turns, version and stage", () => {
  const roles = listRoles(agentsFolder({ tom: TOM }));
  const tom = roles.find((r) => r.id === "tom");
  assert.deepEqual([tom?.model, tom?.effort, tom?.color, tom?.maxTurns, tom?.version, tom?.stage], ["haiku", "low", "cyan", 40, "v0.2", "training"]);
  assert.equal(roles.find((r) => r.id === "nobita")?.model, undefined);   // no file: no invented model
  assert.deepEqual(readAgentInfo("/nonexistent/x.md"), {});
});

test("members carry role info, last contact and model override; manager activity follows the heartbeat", () => {
  const roles = loadRoles(), now = Date.now(), at = (s: number) => new Date(now - s * 1000).toISOString();
  const events = [
    ev({ ts: at(300), agentId: "t1", agentType: "tom", text: "tom started" }),
    ev({ ts: at(100), kind: "assign", from: "doraemon", to: "tom", toId: "t1", text: "re-run", model: "sonnet" }),
  ];
  const [m] = roomMembers(crewFrom(events, roles), ["tom"], false, roleNotes(events, roles), listRoles(agentsFolder({ tom: TOM })));
  assert.equal(m.lastContactAt, at(100));
  assert.equal(m.modelOverride, "sonnet");
  assert.deepEqual([m.model, m.version, m.stage, m.effort], ["haiku", "v0.2", "training", "low"]);
  const [s] = roomMembers([], ["tom"], false, roleNotes([events[0]], roles));
  assert.equal(s.lastContactAt, at(300));
  assert.equal(managerActive([ev({ kind: "main-busy", ts: at(120) })], now), true);
  assert.equal(managerActive([ev({ kind: "main-busy", ts: at(300) })], now), false);
  assert.equal(managerActive([], now), false);
});
