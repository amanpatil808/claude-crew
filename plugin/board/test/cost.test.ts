// Cost ledger rollups: newest event per (sid, agent), per room / role / task, the Today and 7 days windows from
// per-day rows, and the whole path from a synthetic transcript through the event log into the state shape.
import "./env.ts";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { buildCost } from "../lib/cost.ts";
import { appendEvent, localDay, readEvents, type BoardEvent, type UsageEvent, type UsageRow } from "../lib/events.ts";
import { EVENTS_FILE } from "../lib/paths.ts";
import { PRICES_AS_OF } from "../lib/prices.ts";
import { readUsage } from "../lib/usage.ts";

const M = 1_000_000;
const NOW = Date.parse("2026-10-27T18:00:00Z");
const DAY_MS = 86_400_000;
const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);   // fixed zone, so no test depends on the machine's
const T = "2026-10-27";   // today at NOW in UTC

let seq = 0;
const row = (model: string, f: Partial<UsageRow> = {}): UsageRow => ({ model, speed: "standard", long: false, day: T, n: 1, in: 0, out: 0, cw5m: 0, cw1h: 0, cr: 0, ws: 0, wf: 0, ...f });
const usage = (ts: string, project: string, sid: string, agent: { id: string; type?: string } | null, rows: UsageRow[], partial = false): BoardEvent => ({
  id: `e-${Date.parse(ts)}-${(seq++).toString(16).padStart(6, "0")}`, ts, kind: "usage", text: "Usage update", project, sid,
  ...(agent ? { scope: "agent", agentId: agent.id, ...(agent.type ? { agentType: agent.type } : {}) } : { scope: "main" }),
  final: false, partial, rows,
});
const other = (ts: string, f: Partial<BoardEvent> & Pick<BoardEvent, "kind">): BoardEvent => ({ id: `e-${Date.parse(ts)}-ffffff`, ts, text: "x", ...f });

// shop: the manager across midnight, two Kevin runs (one only typed by its agent-start), a generic agent on an
// unpriced model, and a future event. lab: an old partial main run and a Bob run inside the 7 days.
// Each event is the transcript's cumulative total, split by the day of each response.
const EVENTS: BoardEvent[] = [
  usage("2026-10-15T09:00:00Z", "lab", "s2", null, [row("claude-haiku-5-5", { in: M, day: "2026-10-15" })], true),
  usage("2026-10-22T09:00:00Z", "lab", "s2", { id: "a-b", type: "toon-crew:bob" }, [row("claude-opus-5-5", { speed: "fast", in: M, day: "2026-10-22" })]),
  usage("2026-10-26T23:00:00Z", "shop", "s1", null, [row("claude-opus-5-5", { n: 2, in: M, day: "2026-10-26" })]),
  other("2026-10-27T07:00:00Z", { kind: "agent-start", agentId: "a-k1", agentType: "toon-crew:kevin", project: "shop" }),
  usage("2026-10-27T08:00:00Z", "shop", "s1", { id: "a-k1" }, [row("claude-sonnet-5-5", { in: M / 2 })]),
  usage("2026-10-27T09:00:00Z", "shop", "s1", { id: "a-k1" }, [row("claude-sonnet-5-5", { n: 2, in: M })]),
  usage("2026-10-27T10:00:00Z", "shop", "s1", null, [row("claude-opus-5-5", { n: 2, in: M, day: "2026-10-26" }), row("claude-opus-5-5", { n: 1, in: M / 2, out: M / 10 })]),
  usage("2026-10-27T11:00:00Z", "shop", "s1", { id: "a-k2", type: "toon-crew:kevin" }, [row("claude-sonnet-5-5", { out: M / 10 })]),
  usage("2026-10-27T12:00:00Z", "shop", "s1", { id: "a-x", type: "general-purpose" }, [row("claude-mystery-1", { in: M })]),
  usage("2026-10-28T09:00:00Z", "shop", "s1", null, [row("claude-opus-5-5", { n: 9, in: 9 * M, day: "2026-10-28" })]),   // after `now`
];
const TASKS = new Map([["a-k1", "t-1"], ["a-k2", "t-1"], ["a-b", "t-2"]]);
const cost = () => buildCost(EVENTS, NOW, { taskOf: TASKS, dayOf: utcDay });
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
  assert.deepEqual(buildCost(EVENTS, NOW, { dayOf: utcDay }).tasks, {}, "no binding, no task rows");
});

test("today: the rows of today's day only, from each run's newest snapshot", () => {
  const t = cost().windows.today;
  assert.deepEqual([t.from, t.to], [T, T]);
  assert.deepEqual(Object.keys(t.rooms), ["shop"]);
  // The manager's newest total holds yesterday's 1M in on its own row: today is 0.5M in + 0.1M out ($4) over 1 response.
  assert.deepEqual(usd(t.agents.shop), [["doraemon", true, undefined, 4], ["kevin", false, 2, 3], ["other", false, 1, null]]);
  assert.equal(t.agents.shop[0].usage.n, 1);
  assert.deepEqual([t.rooms.shop.usd, t.rooms.shop.unpriced], [7, ["claude-mystery-1"]]);
  assert.deepEqual(t.tasks["t-1"].usd, 3);
  assert.equal(t.tasks["t-2"], undefined);
});

test("7 days: the last 7 calendar days, today included; older days drop out", () => {
  const w = cost().windows["7d"];
  assert.deepEqual([w.from, w.to], ["2026-10-21", T]);
  assert.deepEqual([w.rooms.shop.usd, w.rooms.lab.usd, w.rooms.lab.partial], [11, 8, false]);
  assert.deepEqual(usd(w.agents.lab), [["bob", false, 1, 8]]);
  assert.equal(w.tasks["t-2"].usd, 8);
});

test("cached and fresh tokens on every slice, and since (the earliest day) on agent rows", () => {
  const ev = [
    usage("2026-10-27T09:00:00Z", "shop", "s7", null, [
      row("claude-opus-5-5", { in: 10, out: 20, cw5m: 30, cw1h: 40, cr: 1000, day: "2026-10-12" }),
      row("claude-opus-5-5", { in: 1, out: 2, cw5m: 3, cw1h: 4, cr: 100 }),
      row("claude-opus-5-5", { in: 5, cr: 7, day: "" }),
    ]),
    usage("2026-10-27T09:00:00Z", "shop", "s7", { id: "a1", type: "toon-crew:kevin" }, [row("claude-sonnet-5-5", { out: 9, cr: 50, day: "" })]),
  ];
  const c = buildCost(ev, NOW, { dayOf: utcDay, taskOf: new Map([["a1", "t-9"]]) });
  assert.deepEqual([c.rooms.shop.cached, c.rooms.shop.fresh], [1157, 124]);
  assert.deepEqual(c.agents.shop.map((a) => [a.role, a.cached, a.fresh, a.since]), [["doraemon", 1107, 115, "2026-10-12"], ["kevin", 50, 9, null]]);
  assert.deepEqual([c.tasks["t-9"].cached, c.tasks["t-9"].fresh], [50, 9]);
  const t = c.windows.today;
  assert.deepEqual([t.rooms.shop.cached, t.rooms.shop.fresh, t.agents.shop[0].since], [100, 10, T]);
  assert.deepEqual([c.windows["7d"].rooms.shop.cached, c.windows["7d"].rooms.shop.fresh], [100, 10]);
});

test("since: the event's own earliest day when older days were folded into \"\"; a capped read keeps the earlier one", () => {
  const ev = (since: unknown, ts: string, partial = false) => ({ ...usage(ts, "shop", "s6", null, [row("claude-opus-5-5", { out: 1 }), row("claude-opus-5-5", { day: "", out: 5 })], partial), since });
  const at = (events: BoardEvent[]) => buildCost(events, NOW, { dayOf: utcDay }).agents.shop[0].since;
  assert.equal(at([ev("2026-09-01", "2026-10-27T08:00:00Z") as BoardEvent]), "2026-09-01");
  assert.equal(at([ev("nope", "2026-10-27T08:00:00Z") as BoardEvent]), T, "a bad since is ignored, the dated rows still count");
  assert.equal(at([ev("2026-09-01", "2026-10-27T08:00:00Z") as BoardEvent, ev("2026-10-27", "2026-10-27T09:00:00Z", true) as BoardEvent]), "2026-09-01");
  assert.equal(at([ev("2026-09-01", "2026-10-27T08:00:00Z") as BoardEvent, ev("2026-10-27", "2026-10-27T09:00:00Z") as BoardEvent]), T, "a full read is the truth again");
});

test("a long session first seen today puts only today's calls in Today and only the last 7 days in 7 days", () => {
  // One snapshot, written today, holding ten days of history: the case that put a whole lifetime into Today.
  const days = Array.from({ length: 10 }, (_, i) => utcDay(NOW - i * DAY_MS));
  const c = buildCost([usage("2026-10-27T17:00:00Z", "shop", "s8", null, days.map((day) => row("claude-opus-5-5", { day, out: M })))], NOW, { dayOf: utcDay });
  assert.deepEqual([c.rooms.shop.usage.n, c.windows["7d"].rooms.shop.usage.n, c.windows.today.rooms.shop.usage.n], [10, 7, 1]);
  assert.deepEqual([c.rooms.shop.usage.out, c.windows["7d"].rooms.shop.usage.out, c.windows.today.rooms.shop.usage.out], [10 * M, 7 * M, M]);
});

test("an old event without days counts toward all-time only, never toward Today or 7 days", () => {
  // Written before rows had a day: through a real file, as the log holds it.
  const old = { ...usage("2026-10-27T17:00:00Z", "shop", "s3", null, []), rows: [{ model: "claude-opus-5-5", speed: "standard", long: false, n: 6000, out: 5 * M, cr: 2000 * M }] };
  const file = join(mkdtempSync(join(tmpdir(), "crew-cost-old-")), "events.jsonl");
  writeFileSync(file, JSON.stringify(old) + "\n");
  const c = buildCost(readEvents(file), NOW, { dayOf: utcDay });
  assert.deepEqual([c.rooms.shop.usage.n, c.rooms.shop.cached], [6000, 2000 * M]);
  assert.deepEqual([c.windows.today.rooms, c.windows["7d"].rooms], [{}, {}]);
  // The same on the real clock and the default local day, as the board runs it.
  const now = Date.now();
  writeFileSync(file, JSON.stringify({ ...old, ts: new Date(now - 60_000).toISOString() }) + "\n");
  const live = buildCost(readEvents(file), now);
  assert.deepEqual([live.rooms.shop.usage.n, live.windows.today.rooms, live.windows["7d"].rooms], [6000, {}, {}]);
});

test("a partial read keeps the larger value per (model, day) and per field, never lowering any day", () => {
  const ev = [
    usage("2026-10-27T08:00:00Z", "shop", "s9", null, [row("claude-opus-5-5", { day: "2026-10-26", in: 2 * M, out: M }), row("claude-opus-5-5", { out: 3 * M })]),
    usage("2026-10-27T09:00:00Z", "shop", "s9", null, [row("claude-opus-5-5", { day: "2026-10-26", in: M, out: 2 * M })], true),
  ];
  const c = buildCost(ev, NOW, { dayOf: utcDay });
  // 10-26: max(2M, 1M) in, max(1M, 2M) out; today's 3M out is kept although the capped read never reached it.
  assert.deepEqual([c.rooms.shop.usage.in, c.rooms.shop.usage.out, c.rooms.shop.partial], [2 * M, 5 * M, true]);
  assert.deepEqual([c.windows.today.rooms.shop.usage.in, c.windows.today.rooms.shop.usage.out], [0, 3 * M]);
  assert.deepEqual([c.windows["7d"].rooms.shop.usage.in, c.windows["7d"].rooms.shop.usage.out], [2 * M, 5 * M]);
});

test("a partial read after an old event without days is raised to its totals without counting twice", () => {
  const old = { ...usage("2026-10-27T08:00:00Z", "shop", "s4", null, []), rows: [{ model: "claude-opus-5-5", speed: "standard", long: false, n: 10, out: 10 * M }] };
  const file = join(mkdtempSync(join(tmpdir(), "crew-cost-legacy-")), "events.jsonl");
  writeFileSync(file, `${JSON.stringify(old)}\n${JSON.stringify(usage("2026-10-27T09:00:00Z", "shop", "s4", null, [row("claude-opus-5-5", { n: 4, out: 4 * M })], true))}\n`);
  const c = buildCost(readEvents(file), NOW, { dayOf: utcDay });
  assert.deepEqual([c.rooms.shop.usage.n, c.rooms.shop.usage.out], [10, 10 * M]);
  assert.deepEqual([c.windows.today.rooms.shop.usage.n, c.windows.today.rooms.shop.usage.out], [4, 4 * M]);
});

test("a partial read does not count twice a day the full read before it had folded into the undated row", () => {
  // The full read kept only 10-26 and today (older days folded into ""); the capped read saw 10-20 on its own.
  const ev = [
    usage("2026-10-27T08:00:00Z", "shop", "s5", null, [row("claude-opus-5-5", { day: "", out: 5 }), row("claude-opus-5-5", { day: "2026-10-26", out: 7 }), row("claude-opus-5-5", { out: 9 })]),
    usage("2026-10-27T09:00:00Z", "shop", "s5", null, [row("claude-opus-5-5", { day: "2026-10-20", out: 5 })], true),
  ];
  const c = buildCost(ev, NOW, { dayOf: utcDay });
  assert.equal(c.rooms.shop.usage.out, 21);
  assert.equal(c.windows["7d"].rooms.shop.usage.out, 16);
});

test("the default day is the machine's local day, as the reader's", () => {
  const w = buildCost([], NOW).windows;
  assert.deepEqual([w.today.from, w.today.to, w["7d"].to], [localDay(NOW), localDay(NOW), localDay(NOW)]);
  // Calendar arithmetic, not 24-hour steps: always 7 distinct days.
  assert.equal((Date.parse(w.today.from) - Date.parse(w["7d"].from)) / DAY_MS, 6);
  // A day function that gives no real day: both windows empty, and the undated row is not mistaken for that day.
  const undated = [usage("2026-10-27T09:00:00Z", "shop", "s1", null, [row("claude-opus-5-5", { day: "", out: M })])];
  const bad = buildCost(undated, NOW, { dayOf: () => "not a day" }).windows;
  assert.deepEqual([bad.today, bad["7d"]], [{ from: "", to: "", rooms: {}, agents: {}, tasks: {} }, { from: "", to: "", rooms: {}, agents: {}, tasks: {} }]);
});

test("the stale flag follows the clock", () => {
  const later = Date.parse(`${PRICES_AS_OF}T00:00:00Z`) + 91 * DAY_MS;
  assert.equal(buildCost(EVENTS, later, { dayOf: utcDay }).prices.stale, true);
});

test("an empty log gives empty rollups, not zeros for rooms that never ran", () => {
  const c = buildCost([], NOW, { dayOf: utcDay });
  assert.deepEqual([c.rooms, c.agents, c.tasks, c.updatedAt, c.windows.today.rooms], [{}, {}, {}, null, {}]);
});

test("rows from the log are re-checked: bad numbers become 0, bad days become \"\", rows without a model and events without a scope are skipped", () => {
  // A hand-edited log: wrong types on purpose, so they go through a real file and readEvents, as they would.
  const bad = [
    { ...usage("2026-10-27T09:00:00Z", "shop", "s3", null, []), rows: [{ model: "claude-opus-5-5", day: T, in: "1000000", out: -5, cr: M, n: 1.7 }, { in: 5 }, "x", null] },
    { ...usage("2026-10-27T09:00:00Z", "shop", "s7", null, []), rows: [{ model: "claude-opus-5-5", day: "2026-10-27T00:00", n: 1, cr: M }, { model: "claude-opus-5-5", day: "2026-02-30", n: 1, cr: M }, { model: "claude-opus-5-5", day: 20261027, n: 1, cr: M }] },
    { ...usage("2026-10-27T09:00:00Z", "shop", "s4", null, [row("claude-opus-5-5", { in: M })]), scope: "weird" },
    { ...usage("2026-10-27T09:00:00Z", "shop", "s5", null, [row("claude-opus-5-5", { in: M })]), ts: "not a time" },
    { ...usage("2026-10-27T09:00:00Z", "shop", "s6", null, [row("claude-opus-5-5", { in: M })]), scope: "agent" },   // agent without an id
  ];
  const file = join(mkdtempSync(join(tmpdir(), "crew-cost-bad-")), "events.jsonl");
  writeFileSync(file, bad.map((e) => JSON.stringify(e)).join("\n") + "\n");
  const c = buildCost(readEvents(file), NOW, { dayOf: utcDay });
  const r = c.rooms.shop;
  assert.deepEqual([r.usage.n, r.usage.in, r.usage.out, r.usage.cr, r.usd], [4, 0, 0, 4 * M, 0.8]);
  assert.deepEqual([c.windows.today.rooms.shop.usage.n, c.windows.today.rooms.shop.usage.cr], [1, M], "only the real day counts toward Today");
});

const append = (e: UsageEvent, at: string) => appendEvent(e, new Date(at));
const line = (id: string, input: number, ts: string) =>
  JSON.stringify({ type: "assistant", timestamp: ts, message: { id, model: "claude-sonnet-5-5", usage: { input_tokens: input, output_tokens: 0, cache_read_input_tokens: 0 } } });
const transcript = () => {
  const root = join(mkdtempSync(join(tmpdir(), "crew-cost-")), "projects");
  mkdirSync(join(root, "p"), { recursive: true });
  return { root, file: join(root, "p", "s.jsonl") };
};

test("end to end: transcript -> readUsage -> appendEvent -> readEvents -> buildCost keeps every number", () => {
  rmSync(EVENTS_FILE, { force: true });
  const { root, file } = transcript();
  writeFileSync(file, `${line("m1", 9_876_543_210, "2026-10-26T11:00:00.000Z")}\n`);
  const first = readUsage(file, { scope: "main", project: "shop", sid: "s1", final: false }, { root, dayOf: utcDay });
  assert.ok(first);
  append(first, "2026-10-26T12:00:00Z");
  writeFileSync(file, `${line("m1", 9_876_543_210, "2026-10-26T11:00:00.000Z")}\n${line("m2", 1_000_000, "2026-10-27T11:00:00.000Z")}\n`);
  const second = readUsage(file, { scope: "main", project: "shop", sid: "s1", final: true }, { root, dayOf: utcDay });
  assert.ok(second);
  append(second, "2026-10-27T12:00:00Z");
  const c = buildCost(readEvents(), NOW, { dayOf: utcDay });
  assert.deepEqual([c.rooms.shop.usage.n, c.rooms.shop.usage.in], [2, 9_877_543_210]);
  assert.deepEqual([c.windows.today.rooms.shop.usage.n, c.windows.today.rooms.shop.usage.in, c.windows.today.rooms.shop.usd], [1, M, 2]);
});

test("end to end: a transcript with ten days of history, first read today, splits into Today, 7 days and all-time", () => {
  rmSync(EVENTS_FILE, { force: true });
  const { root, file } = transcript();
  // One response a day at 10:00 UTC for ten days, M input each, plus a line with no time at all.
  const lines = Array.from({ length: 10 }, (_, i) => line(`m${i}`, M, `${utcDay(NOW - i * DAY_MS)}T10:00:00.000Z`));
  lines.push(JSON.stringify({ type: "assistant", message: { id: "m-notime", model: "claude-sonnet-5-5", usage: { input_tokens: M } } }));
  writeFileSync(file, lines.join("\n") + "\n");
  const e = readUsage(file, { scope: "main", project: "shop", sid: "s1", final: false }, { root, dayOf: utcDay });
  assert.ok(e);
  append(e, "2026-10-27T17:00:00Z");   // the board's first and only snapshot of this session
  const c = buildCost(readEvents(), NOW, { dayOf: utcDay });
  assert.deepEqual([c.rooms.shop.usage.n, c.windows["7d"].rooms.shop.usage.n, c.windows.today.rooms.shop.usage.n], [11, 7, 1]);
  assert.deepEqual([c.rooms.shop.usage.in, c.windows["7d"].rooms.shop.usage.in, c.windows.today.rooms.shop.usage.in], [11 * M, 7 * M, M]);
  assert.equal(c.agents.shop[0].since, "2026-10-18");
});
