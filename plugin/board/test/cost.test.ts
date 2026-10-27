// Cost ledger rollups: newest event per (sid, agent), per room / role / task, the Today and 7 days windows,
// and the whole path from a synthetic transcript through the event log into the state shape.
import "./env.ts";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { buildCost } from "../lib/cost.ts";
import { appendEvent, readEvents, type BoardEvent, type UsageEvent, type UsageRow } from "../lib/events.ts";
import { EVENTS_FILE } from "../lib/paths.ts";
import { PRICES_AS_OF } from "../lib/prices.ts";
import { readUsage } from "../lib/usage.ts";

const M = 1_000_000;
const NOW = Date.parse("2026-10-27T18:00:00Z");
const utcDay = (now: number) => now - (now % 86_400_000);   // fixed "today" so the test never depends on the machine's zone

let seq = 0;
const row = (model: string, f: Partial<UsageRow> = {}): UsageRow => ({ model, speed: "standard", long: false, n: 1, in: 0, out: 0, cw5m: 0, cw1h: 0, cr: 0, ws: 0, wf: 0, ...f });
const usage = (ts: string, project: string, sid: string, agent: { id: string; type?: string } | null, rows: UsageRow[], partial = false): BoardEvent => ({
  id: `e-${Date.parse(ts)}-${(seq++).toString(16).padStart(6, "0")}`, ts, kind: "usage", text: "Usage update", project, sid,
  ...(agent ? { scope: "agent", agentId: agent.id, ...(agent.type ? { agentType: agent.type } : {}) } : { scope: "main" }),
  final: false, partial, rows,
});
const other = (ts: string, f: Partial<BoardEvent> & Pick<BoardEvent, "kind">): BoardEvent => ({ id: `e-${Date.parse(ts)}-ffffff`, ts, text: "x", ...f });

// shop: the manager across midnight, two Kevin runs (one only typed by its agent-start), a generic agent on an
// unpriced model, and a future event. lab: an old partial main run and a Bob run inside the 7 days.
const EVENTS: BoardEvent[] = [
  usage("2026-10-15T09:00:00Z", "lab", "s2", null, [row("claude-haiku-5-5", { in: M })], true),
  usage("2026-10-22T09:00:00Z", "lab", "s2", { id: "a-b", type: "toon-crew:bob" }, [row("claude-opus-5-5", { speed: "fast", in: M })]),
  usage("2026-10-26T23:00:00Z", "shop", "s1", null, [row("claude-opus-5-5", { n: 2, in: M })]),
  other("2026-10-27T07:00:00Z", { kind: "agent-start", agentId: "a-k1", agentType: "toon-crew:kevin", project: "shop" }),
  usage("2026-10-27T08:00:00Z", "shop", "s1", { id: "a-k1" }, [row("claude-sonnet-5-5", { in: M / 2 })]),
  usage("2026-10-27T09:00:00Z", "shop", "s1", { id: "a-k1" }, [row("claude-sonnet-5-5", { n: 2, in: M })]),
  usage("2026-10-27T10:00:00Z", "shop", "s1", null, [row("claude-opus-5-5", { n: 3, in: 1.5 * M, out: M / 10 })]),
  usage("2026-10-27T11:00:00Z", "shop", "s1", { id: "a-k2", type: "toon-crew:kevin" }, [row("claude-sonnet-5-5", { out: M / 10 })]),
  usage("2026-10-27T12:00:00Z", "shop", "s1", { id: "a-x", type: "general-purpose" }, [row("claude-mystery-1", { in: M })]),
  usage("2026-10-28T09:00:00Z", "shop", "s1", null, [row("claude-opus-5-5", { n: 9, in: 9 * M })]),   // after `now`
];
const TASKS = new Map([["a-k1", "t-1"], ["a-k2", "t-1"], ["a-b", "t-2"]]);
const cost = () => buildCost(EVENTS, NOW, { taskOf: TASKS, dayStart: utcDay });
const usd = (list: { role: string; usd: number | null; runs?: number; main?: true }[] | undefined) => list?.map((a) => [a.role, a.main ?? false, a.runs, a.usd]);

test("the header: estimate, USD, the price table's source and date, the newest usage time", () => {
  const c = cost();
  assert.deepEqual([c.basis, c.currency, c.prices.asOf, c.prices.stale, c.updatedAt], ["estimate", "USD", PRICES_AS_OF, false, "2026-10-27T12:00:00Z"]);
  assert.match(c.prices.source, /^https:\/\/platform\.claude\.com\/docs\/en\/about-claude\/pricing$/);
  assert.match(c.prices.note, /Not a bill/);
});

test("rooms: newest event per (sid, agent), unpriced models named, partial carried, future events ignored", () => {
  const { rooms } = cost();
  assert.deepEqual(Object.keys(rooms).sort(), ["lab", "shop"]);
  // shop: manager 1.5M in + 0.1M out on Opus 5.5 ($8), Kevin 1M in + 0.1M out on Sonnet 5.5 ($3), the mystery model unpriced.
  assert.deepEqual([rooms.shop.usd, rooms.shop.unpriced, rooms.shop.partial], [11, ["claude-mystery-1"], false]);
  assert.deepEqual(rooms.shop.usage, { n: 7, in: 3.5 * M, out: 0.2 * M, cw5m: 0, cw1h: 0, cr: 0, ws: 0, wf: 0 });
  // lab: Haiku 5.5 1M in ($0.10) and Opus 5.5 fast 1M in ($8).
  assert.deepEqual([rooms.lab.usd, rooms.lab.partial], [8.1, true]);
});

test("agents: the manager first, roles from the agent's own events, unknown types as other", () => {
  const { agents } = cost();
  assert.deepEqual(usd(agents.shop), [["doraemon", true, undefined, 8], ["kevin", false, 2, 3], ["other", false, 1, null]]);
  assert.deepEqual(usd(agents.lab), [["doraemon", true, undefined, 0.1], ["bob", false, 1, 8]]);
  assert.deepEqual(agents.shop[2].unpriced, ["claude-mystery-1"]);
});

test("tasks: a run counts toward the task its agent is bound to, and only that one", () => {
  const { tasks } = cost();
  assert.deepEqual(Object.keys(tasks).sort(), ["t-1", "t-2"]);
  assert.deepEqual([tasks["t-1"].usd, tasks["t-1"].usage.in, tasks["t-1"].usage.out], [3, M, M / 10]);
  assert.equal(tasks["t-2"].usd, 8);
  assert.deepEqual(buildCost(EVENTS, NOW, { dayStart: utcDay }).tasks, {}, "no binding, no task rows");
});

test("today: only what changed since midnight, measured against the last total before it", () => {
  const t = cost().windows.today;
  assert.equal(t.from, "2026-10-27T00:00:00.000Z");
  assert.deepEqual(Object.keys(t.rooms), ["shop"]);
  // The manager had 1M in at 23:00 yesterday: today is 0.5M in + 0.1M out ($4) over 1 response.
  assert.deepEqual(usd(t.agents.shop), [["doraemon", true, undefined, 4], ["kevin", false, 2, 3], ["other", false, 1, null]]);
  assert.equal(t.agents.shop[0].usage.n, 1);
  assert.deepEqual([t.rooms.shop.usd, t.rooms.shop.unpriced], [7, ["claude-mystery-1"]]);
  assert.deepEqual(t.tasks["t-1"].usd, 3);
  assert.equal(t.tasks["t-2"], undefined);
});

test("7 days: a rolling window; runs whose last total is older drop out", () => {
  const w = cost().windows["7d"];
  assert.equal(w.from, "2026-10-20T18:00:00.000Z");
  assert.deepEqual([w.rooms.shop.usd, w.rooms.lab.usd, w.rooms.lab.partial], [11, 8, false]);
  assert.deepEqual(usd(w.agents.lab), [["bob", false, 1, 8]]);
  assert.equal(w.tasks["t-2"].usd, 8);
});

test("a total that reads lower than before never gives negative usage", () => {
  const ev = [
    usage("2026-10-26T20:00:00Z", "shop", "s9", null, [row("claude-opus-5-5", { in: 2 * M, out: M })]),
    usage("2026-10-27T09:00:00Z", "shop", "s9", null, [row("claude-opus-5-5", { in: M, out: 2 * M })], true),
  ];
  const t = buildCost(ev, NOW, { dayStart: utcDay }).windows.today;
  assert.deepEqual([t.rooms.shop.usage.in, t.rooms.shop.usage.out, t.rooms.shop.usd, t.rooms.shop.partial], [0, M, 20, true]);
});

test("the default day starts at local midnight", () => {
  assert.equal(buildCost([], NOW).windows.today.from, new Date(new Date(NOW).setHours(0, 0, 0, 0)).toISOString());
});

test("the stale flag follows the clock", () => {
  const later = Date.parse(`${PRICES_AS_OF}T00:00:00Z`) + 91 * 86_400_000;
  assert.equal(buildCost(EVENTS, later, { dayStart: utcDay }).prices.stale, true);
});

test("an empty log gives empty rollups, not zeros for rooms that never ran", () => {
  const c = buildCost([], NOW, { dayStart: utcDay });
  assert.deepEqual([c.rooms, c.agents, c.tasks, c.updatedAt, c.windows.today.rooms], [{}, {}, {}, null, {}]);
});

test("rows from the log are re-checked: bad numbers become 0, rows without a model and events without a scope are skipped", () => {
  // A hand-edited log: wrong types on purpose, so they go through a real file and readEvents, as they would.
  const bad = [
    { ...usage("2026-10-27T09:00:00Z", "shop", "s3", null, []), rows: [{ model: "claude-opus-5-5", in: "1000000", out: -5, cr: M, n: 1.7 }, { in: 5 }, "x", null] },
    { ...usage("2026-10-27T09:00:00Z", "shop", "s4", null, [row("claude-opus-5-5", { in: M })]), scope: "weird" },
    { ...usage("2026-10-27T09:00:00Z", "shop", "s5", null, [row("claude-opus-5-5", { in: M })]), ts: "not a time" },
    { ...usage("2026-10-27T09:00:00Z", "shop", "s6", null, [row("claude-opus-5-5", { in: M })]), scope: "agent" },   // agent without an id
  ];
  const file = join(mkdtempSync(join(tmpdir(), "crew-cost-bad-")), "events.jsonl");
  writeFileSync(file, bad.map((e) => JSON.stringify(e)).join("\n") + "\n");
  const r = buildCost(readEvents(file), NOW, { dayStart: utcDay }).rooms.shop;
  assert.deepEqual([r.usage.n, r.usage.in, r.usage.out, r.usage.cr, r.usd], [1, 0, 0, M, 0.2]);
});

const append = (e: UsageEvent, at: string) => appendEvent(e, new Date(at));

test("end to end: transcript -> readUsage -> appendEvent -> readEvents -> buildCost keeps every number", () => {
  rmSync(EVENTS_FILE, { force: true });
  const root = join(mkdtempSync(join(tmpdir(), "crew-cost-")), "projects");
  mkdirSync(join(root, "p"), { recursive: true });
  const file = join(root, "p", "s.jsonl");
  const line = (id: string, input: number) => JSON.stringify({ type: "assistant", message: { id, model: "claude-sonnet-5-5", usage: { input_tokens: input, output_tokens: 0, cache_read_input_tokens: 0 } } });
  writeFileSync(file, `${line("m1", 9_876_543_210)}\n`);
  const first = readUsage(file, { scope: "main", project: "shop", sid: "s1", final: false }, { root });
  assert.ok(first);
  append(first, "2026-10-26T12:00:00Z");
  writeFileSync(file, `${line("m1", 9_876_543_210)}\n${line("m2", 1_000_000)}\n`);
  const second = readUsage(file, { scope: "main", project: "shop", sid: "s1", final: true }, { root });
  assert.ok(second);
  append(second, "2026-10-27T12:00:00Z");
  const c = buildCost(readEvents(), NOW, { dayStart: utcDay });
  assert.deepEqual([c.rooms.shop.usage.n, c.rooms.shop.usage.in], [2, 9_877_543_210]);
  assert.deepEqual([c.windows.today.rooms.shop.usage.n, c.windows.today.rooms.shop.usage.in, c.windows.today.rooms.shop.usd], [1, M, 2]);
});
