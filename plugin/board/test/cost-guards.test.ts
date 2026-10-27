// Cost ledger guards from the security review (L3, L4, I2, I3), on made-up usage events and a fixed clock.
import "./env.ts";
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildCost } from "../lib/cost.ts";
import { loadRoles } from "../lib/crew.ts";
import { MODEL_ID, type BoardEvent, type UsageRow } from "../lib/events.ts";

const NOW = Date.parse("2026-10-27T12:00:00Z");
const row = (out: number, model = "claude-sonnet-5-5"): UsageRow => ({ model, speed: "standard", long: false, day: "2026-10-27", n: 1, in: 0, out, cw5m: 0, cw1h: 0, cr: 0, ws: 0, wf: 0 });
let k = 0;
const usage = (min: number, e: Partial<BoardEvent>): BoardEvent =>
  ({ id: `e-${++k}-aaaaaa`, ts: new Date(NOW - min * 60_000).toISOString(), kind: "usage", text: "Usage update", sid: "s1aaaaaa", scope: "main", final: false, partial: false, ...e });
const opts = { roles: new Map(), dayOf: (ms: number) => new Date(ms).toISOString().slice(0, 10) };

test("[L3] a room, its agents and a task named __proto__ keep their cost in the JSON the page gets", () => {
  const events = [
    usage(5, { project: "__proto__", rows: [row(1_000_000)] }),
    usage(4, { project: "__proto__", scope: "agent", agentId: "a1", agentType: "toon-crew:bob", rows: [row(10)] }),
  ];
  const c = buildCost(events, NOW, { ...opts, taskOf: new Map([["a1", "__proto__"]]) });
  for (const sent of [JSON.parse(JSON.stringify(c)), JSON.parse(JSON.stringify(c.windows.today))]) {
    assert.ok(Object.hasOwn(sent.rooms, "__proto__"), `rooms sent: ${JSON.stringify(sent.rooms)}`);
    assert.equal(sent.rooms.__proto__.usage.out, 1_000_010);
    assert.ok(Object.hasOwn(sent.agents, "__proto__"));
    assert.ok(Object.hasOwn(sent.tasks, "__proto__"));
  }
  // No prototype was replaced: an ordinary object still looks ordinary afterwards.
  assert.equal(Object.getPrototypeOf(c.rooms), Object.prototype);
});

test("[L4] a later partial read never lowers a transcript's cumulative total, per field and per row", () => {
  const events = [
    usage(30, { project: "p", rows: [row(1_000_000), { ...row(50, "claude-opus-5-5"), in: 7 }] }),   // a full read
    usage(10, { project: "p", partial: true, rows: [{ ...row(400_000), in: 3 }] }),                // the budget stopped this one early
  ];
  const c = buildCost(events, NOW, opts);
  assert.equal(c.rooms.p.usage.out, 1_000_050, "all-time output went down after a capped read");
  assert.equal(c.rooms.p.usage.in, 10, "a field the capped read saw more of still counts");
  assert.equal(c.rooms.p.partial, true);
  // The window measures against the same raised total, so no negative or lost share.
  assert.equal(c.windows["7d"].rooms.p.usage.out, 1_000_050);
  // A complete read after it is the truth again, even when lower (a rewritten transcript).
  const later = buildCost([...events, usage(5, { project: "p", rows: [row(900_000)] })], NOW, opts);
  assert.equal(later.rooms.p.usage.out, 900_000);
  assert.equal(later.rooms.p.partial, false);
});

test("[L4] a capped read is flagged on the agent and task rows too, not only on the room", () => {
  const events = [
    usage(10, { project: "p", partial: true, rows: [row(1)] }),
    usage(10, { project: "p", scope: "agent", agentId: "a1", agentType: "toon-crew:bob", partial: true, rows: [row(5)] }),
    usage(10, { project: "p", scope: "agent", agentId: "a2", agentType: "toon-crew:kevin", rows: [row(5)] }),
  ];
  const c = buildCost(events, NOW, { ...opts, roles: loadRoles(), taskOf: new Map([["a1", "t-1"], ["a2", "t-2"]]) });
  assert.deepEqual(c.agents.p.map((a) => [a.role, a.partial]), [["doraemon", true], ["bob", true], ["kevin", false]]);
  assert.equal(c.tasks["t-1"].partial, true);
  assert.equal(c.tasks["t-2"].partial, false);
  assert.equal(c.windows.today.tasks["t-1"].partial, true);
});

test("[I2] a model string from the log that fails MODEL_ID is shown as unknown, never echoed", () => {
  const odd = "Bearer <b>x</b> " + "y".repeat(5000);
  const c = buildCost([usage(5, { project: "p", rows: [row(5, odd), row(5, "not-a-claude-model")] })], NOW, opts);
  const sent = JSON.stringify(c);
  assert.ok(!sent.includes("<b>") && !sent.includes("not-a-claude"), "raw model text reached cost");
  assert.deepEqual(c.rooms.p.unpriced, ["unknown"]);
});

test("[I3] MODEL_ID takes Claude ids only: plain, dated, regional and Bedrock-prefixed", () => {
  for (const id of ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-4-5-20251001", "claude-mystery-1", "claude-opus-5-5-preview",
    "anthropic.claude-opus-5-5", "us.anthropic.claude-sonnet-5-5", "eu.claude-haiku-5-5"]) assert.ok(MODEL_ID.test(id), id);
  for (const id of ["gpt-4o", "unknown", "claude-", "claude", "evil.example", "a".repeat(40), "claude-opus-5-5\nx", "Claude-Opus-5-5",
    "claude-opus-4-5@20251101", "us.anthropic.claude-x:0", "abc.anthropic.claude-opus-5-5", `claude-${"a".repeat(57)}`]) assert.ok(!MODEL_ID.test(id), id);
});
