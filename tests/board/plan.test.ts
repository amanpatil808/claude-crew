// The plan panel (docs/specs/plan-usage.md): kind from the rate-limit reading, both limit windows, per-agent shares
// from hour buckets (5-hour) and day buckets (weekly), the heavy rule's edges, planPct, and the optional loader.
import "./env.ts";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, test } from "node:test";
import { LIMITS_FILE, readEvents, type BoardEvent, type HourRow, type LimitsReading, type UsageRow } from "../../plugin/board/lib/events.ts";
import { buildPlan, isHeavy, readLimits, READING_MAX_AGE_MS, type PlanState } from "../../plugin/board/lib/plan.ts";
import { loadRoles } from "../../plugin/board/lib/crew.ts";
import { buildState, loadBuildPlan, planOf } from "../../plugin/board/lib/state.ts";
import { EVENTS_FILE } from "../../plugin/board/lib/paths.ts";

const NOW = Date.parse("2026-10-28T01:30:00Z");
const H = 3_600_000, DAY = 24 * H, M = 1_000_000;
const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);   // fixed zone, so no test depends on the machine's
const roles = loadRoles();

let seq = 0;
const hour = (hr: string, f: Partial<HourRow> = {}): HourRow => ({ model: "claude-sonnet-5-5", speed: "standard", long: false, hr, n: 1, in: 0, out: 0, cw5m: 0, cw1h: 0, cr: 0, ws: 0, wf: 0, ...f });
const day = (d: string, f: Partial<UsageRow> = {}): UsageRow => ({ model: "claude-sonnet-5-5", speed: "standard", long: false, day: d, n: 1, in: 0, out: 0, cw5m: 0, cw1h: 0, cr: 0, ws: 0, wf: 0, ...f });
// One cumulative usage snapshot: the main session (agent null) or one agent run.
const usage = (ts: string, agent: { id: string; type?: string } | null, rows: UsageRow[], hours: HourRow[], f: Partial<BoardEvent> = {}): BoardEvent => ({
  id: `e-${Date.parse(ts)}-${(seq++).toString(16).padStart(6, "0")}`, ts, kind: "usage", text: "Usage update", project: "shop", sid: "s1aaaaaa",
  ...(agent ? { scope: "agent", agentId: agent.id, ...(agent.type ? { agentType: agent.type } : {}) } : { scope: "main" }),
  final: false, partial: false, rows, hours, ...f,
});
const reading = (f: Partial<LimitsReading> = {}): LimitsReading => ({
  v: 1, at: "2026-10-28T01:00:00.000Z", sub: true,
  w: [{ id: "5h", pct: 40, end: "2026-10-28T04:00:00.000Z" }, { id: "7d", pct: 10, end: "2026-11-02T00:00:00.000Z" }], ...f,
});
const plan = (events: BoardEvent[], r: LimitsReading | null, now = NOW): PlanState => buildPlan(events, now, { roles, reading: r, dayOf: utcDay });
const shares = (p: PlanState, w: "5h" | "7d") => p.shares.find((s) => s.window === w)?.agents.map((a) => [a.role, a.sharePct, a.planPct, a.heavy]);

beforeEach(() => { rmSync(LIMITS_FILE, { force: true }); rmSync(EVENTS_FILE, { force: true }); });

// ---- kind and limits ----

test("kind: no reading is unknown with no limits; a subscription reading has both; an API reading has none", () => {
  const none = plan([], null);
  assert.deepEqual([none.kind, none.source, none.name, none.limits, none.shares, none.updatedAt], ["unknown", "none", null, [], [], null]);
  const sub = plan([], reading());
  assert.deepEqual([sub.kind, sub.source, sub.name, sub.updatedAt], ["subscription", "rate-limits", null, "2026-10-28T01:00:00.000Z"]);
  assert.deepEqual(sub.limits, [
    { id: "5h", label: "5-hour", usedPct: 40, resetsAt: "2026-10-28T04:00:00.000Z" },
    { id: "7d", label: "Weekly", usedPct: 10, resetsAt: "2026-11-02T00:00:00.000Z" },
  ]);
  const api = plan([], reading({ sub: false, w: [] }));
  assert.deepEqual([api.kind, api.source, api.limits], ["api", "rate-limits", []]);
});

test("limits: a window past its reset, or missing from the reading, is null; without a reset it lasts one window", () => {
  // The 5-hour window reset at 01:00; the weekly one is missing.
  const p = plan([], reading({ w: [{ id: "5h", pct: 99, end: "2026-10-28T01:00:00.000Z" }] }));
  assert.deepEqual(p.limits.map((l) => [l.id, l.usedPct, l.resetsAt]), [["5h", null, null], ["7d", null, null]]);
  // No reset time: known for one window after the reading, then null.
  const noEnd = reading({ at: "2026-10-27T21:00:00.000Z", w: [{ id: "5h", pct: 30, end: null }, { id: "7d", pct: 20, end: null }] });
  assert.deepEqual(plan([], noEnd).limits.map((l) => [l.id, l.usedPct]), [["5h", 30], ["7d", 20]]);   // 4.5 h later
  assert.deepEqual(plan([], noEnd, Date.parse("2026-10-28T02:00:01Z")).limits.map((l) => [l.id, l.usedPct]), [["5h", null], ["7d", 20]]);
});

test("a stale or future-dated reading is not used: the plan is unknown again", () => {
  const at = new Date(NOW - READING_MAX_AGE_MS - 1).toISOString();
  assert.equal(plan([], reading({ at })).kind, "unknown");
  assert.equal(plan([], reading({ at: new Date(NOW - READING_MAX_AGE_MS).toISOString() })).kind, "subscription", "exactly the max age still counts");
  assert.equal(plan([], reading({ at: new Date(NOW + 6 * 60_000).toISOString() })).kind, "unknown");
});

// ---- shares ----

test("5-hour shares come from hour buckets across midnight; an hour fully before the window is left out", () => {
  // No reset known (api): the window is 20:30-01:30 UTC. Hour 19 ends at 20:00, outside; hour 20 is half inside.
  const events = [
    usage("2026-10-28T01:00:00Z", null, [], [hour("2026-10-28T00", { out: M }), hour("2026-10-27T23", { out: M }), hour("2026-10-27T19", { out: 50 * M })]),
    usage("2026-10-28T01:10:00Z", { id: "a1", type: "toon-crew:kevin" }, [], [hour("2026-10-27T20", { out: 2 * M })]),
  ];
  const p = plan(events, reading({ sub: false, w: [] }));
  assert.deepEqual(shares(p, "5h"), [["doraemon", 50, null, false], ["kevin", 50, null, false]]);
});

test("the 5-hour window starts at the reset minus five hours when the reset is known", () => {
  // Resets 04:00, so the window began 23:00: hour 22 is out even though it is within five hours of now.
  const events = [
    usage("2026-10-28T01:00:00Z", null, [], [hour("2026-10-27T22", { out: 9 * M })]),
    usage("2026-10-28T01:00:00Z", { id: "a1", type: "toon-crew:bob" }, [], [hour("2026-10-27T23", { out: M })]),
  ];
  assert.deepEqual(shares(plan(events, reading()), "5h"), [["bob", 100, 40, false]]);
});

test("weekly shares come from day buckets from the reset minus seven days; planPct uses that window's %", () => {
  // Weekly reset 2026-11-02, so the window began 2026-10-26: day 25 is out.
  const events = [
    usage("2026-10-28T01:00:00Z", null, [day("2026-10-25", { out: 99 * M }), day("2026-10-26", { out: 3 * M })], []),
    usage("2026-10-28T01:00:00Z", { id: "a1", type: "toon-crew:kevin" }, [day("2026-10-28", { out: M }), day("", { out: 99 * M })], []),
  ];
  const p = plan(events, reading());
  // Two agents: twice the fair share is 100%, so 75% is not heavy.
  assert.deepEqual(shares(p, "7d"), [["doraemon", 75, 7.5, false], ["kevin", 25, 2.5, false]]);
  assert.deepEqual(shares(p, "5h"), [], "no hour rows: the 5-hour window is empty, the weekly one is not");
});

test("shares weight tokens by the model's API price: an Opus token counts more than a Haiku token", () => {
  const events = [
    usage("2026-10-28T01:00:00Z", null, [], [hour("2026-10-28T01", { model: "claude-opus-5-5", out: M })]),               // $20
    usage("2026-10-28T01:00:00Z", { id: "a1", type: "toon-crew:shizuka" }, [], [hour("2026-10-28T01", { model: "claude-haiku-5-5", out: M })]),   // $0.50
  ];
  const s = shares(plan(events, null), "5h");
  assert.deepEqual(s?.map((x) => [x[0], x[1]]), [["doraemon", 97.6], ["shizuka", 2.4]]);
});

test("roles: runs of one role add up across sessions and projects; a generic run is other; unpriced models are left out", () => {
  const events = [
    usage("2026-10-28T01:00:00Z", { id: "a1", type: "toon-crew:kevin" }, [], [hour("2026-10-28T01", { out: M })]),
    usage("2026-10-28T01:00:00Z", { id: "a2" }, [], [hour("2026-10-28T01", { out: M })], { sid: "s2bbbbbb", project: "lab" }),
    { id: "e-1-000abc", ts: "2026-10-28T00:00:00Z", kind: "agent-start", text: "x", agentId: "a2", agentType: "toon-crew:kevin" } as BoardEvent,
    usage("2026-10-28T01:00:00Z", { id: "a3", type: "general-purpose" }, [], [hour("2026-10-28T01", { out: 2 * M })]),
    usage("2026-10-28T01:00:00Z", { id: "a4", type: "toon-crew:bob" }, [], [hour("2026-10-28T01", { model: "claude-mystery-1", out: 50 * M })]),
  ];
  const p = plan(events, null);
  assert.deepEqual(shares(p, "5h")?.map((x) => [x[0], x[1]]), [["kevin", 50], ["other", 50]]);
  assert.match(p.basis, /without a list price are left out/);
  assert.doesNotMatch(plan(events.slice(0, 3), null).basis, /left out/);
});

test("only the newest snapshot per transcript counts, and a capped read never lowers the one before it", () => {
  const a = { id: "a1", type: "toon-crew:kevin" };
  const events = [
    usage("2026-10-28T00:10:00Z", a, [], [hour("2026-10-28T00", { out: 4 * M })]),
    usage("2026-10-28T00:20:00Z", a, [], [hour("2026-10-28T00", { out: 6 * M })]),             // cumulative: 6, not 10
    usage("2026-10-28T00:30:00Z", a, [], [hour("2026-10-28T00", { out: M })], { partial: true }),   // capped: still 6
    usage("2026-10-28T00:30:00Z", null, [], [hour("2026-10-28T00", { out: 6 * M })]),
    usage("2026-10-28T02:00:00Z", null, [], [hour("2026-10-28T01", { out: 90 * M })]),          // after now: ignored
  ];
  assert.deepEqual(shares(plan(events, null), "5h")?.map((x) => [x[0], x[1]]), [["doraemon", 50], ["kevin", 50]]);
});

test("no usage in either window: shares is [], and the windows are both listed once one has usage", () => {
  assert.deepEqual(plan([usage("2026-10-20T01:00:00Z", null, [day("2026-10-20", { out: M })], [])], reading()).shares, []);
  const p = plan([usage("2026-10-28T01:00:00Z", null, [day("2026-10-28", { out: M })], [])], reading());
  assert.deepEqual(p.shares.map((s) => [s.window, s.agents.length]), [["5h", 0], ["7d", 1]]);
});

// ---- the heavy rule and planPct ----

test("heavy: at least 20% and at least twice a fair share; the edges are inclusive", () => {
  assert.equal(isHeavy(20, 10), true, "20% with 10 agents: exactly 20% and exactly 2x the 10% fair share");
  assert.equal(isHeavy(19.9, 10), false, "just under 20%");
  assert.equal(isHeavy(50, 4), true, "exactly 2x the 25% fair share");
  assert.equal(isHeavy(49.9, 4), false, "over 20% but under 2x the fair share");
  assert.equal(isHeavy(20, 20), true, "2x a 5% fair share is 10%; 20% is the binding edge");
  assert.equal(isHeavy(19.9, 20), false);
  assert.equal(isHeavy(100, 1), false, "alone: 2x fair share is 200%");
  assert.equal(isHeavy(100, 0), false);
});

test("heavy from real shares: one agent at exactly 20% of ten is flagged, the rest are not; doraemon counts too", () => {
  // doraemon 20, kevin 20, eight others 7.5 each: n = 10, fair share 10%.
  const others = ["bob", "nobita", "shizuka", "olaf", "stuart", "shinchan", "dekisugi", "joe-gardner"];
  const events = [
    usage("2026-10-28T01:00:00Z", null, [], [hour("2026-10-28T01", { out: 20 * M })]),
    usage("2026-10-28T01:00:00Z", { id: "k", type: "toon-crew:kevin" }, [], [hour("2026-10-28T01", { out: 20 * M })]),
    ...others.map((r, i) => usage("2026-10-28T01:00:00Z", { id: `o${i}`, type: `toon-crew:${r}` }, [], [hour("2026-10-28T01", { out: 7.5 * M })])),
  ];
  const s = shares(plan(events, null), "5h") ?? [];
  assert.equal(s.length, 10);
  assert.deepEqual(s.filter((x) => x[3]).map((x) => [x[0], x[1]]), [["doraemon", 20], ["kevin", 20]]);
});

test("planPct: share x used % when the window's % is known, null when it is not (api, unknown or expired)", () => {
  const events = [
    usage("2026-10-28T01:00:00Z", null, [day("2026-10-28", { out: 3 * M })], [hour("2026-10-28T01", { out: 3 * M })]),
    usage("2026-10-28T01:00:00Z", { id: "a1", type: "toon-crew:kevin" }, [day("2026-10-28", { out: M })], [hour("2026-10-28T01", { out: M })]),
  ];
  const sub = plan(events, reading({ w: [{ id: "5h", pct: 62.4, end: "2026-10-28T04:00:00.000Z" }] }));
  assert.deepEqual(shares(sub, "5h"), [["doraemon", 75, 46.8, false], ["kevin", 25, 15.6, false]]);
  assert.deepEqual(shares(sub, "7d")?.map((x) => x[2]), [null, null], "no weekly reading: no plan %");
  for (const r of [null, reading({ sub: false, w: [] })]) assert.deepEqual(shares(plan(events, r), "5h")?.map((x) => x[2]), [null, null]);
});

// ---- the file and the loader ----

test("readLimits: the file goes through the allow-list; junk, a torn file or no file is null", () => {
  assert.equal(readLimits(), null);
  writeFileSync(LIMITS_FILE, JSON.stringify({ ...reading(), extra: "x" }));
  assert.deepEqual(readLimits(), reading());
  writeFileSync(LIMITS_FILE, '{"v":1,"at":');
  assert.equal(readLimits(), null);
  writeFileSync(LIMITS_FILE, JSON.stringify(reading({ sub: "yes" as unknown as boolean })));
  assert.equal(readLimits(), null);
});

test("buildPlan reads limits.json when no reading is passed", () => {
  writeFileSync(LIMITS_FILE, JSON.stringify(reading()));
  assert.equal(buildPlan([], NOW, { roles }).kind, "subscription");
});

test("the demo seed shows a subscription with limits and exactly one heavy agent in the 5-hour window", () => {
  const dir = join(mkdtempSync(join(tmpdir(), "crew-plan-demo-")), "demo");
  execFileSync(process.execPath, [join(import.meta.dirname, "..", "..", "scripts", "board-demo.mjs"), dir], { encoding: "utf8" });
  const p = buildPlan(readEvents(join(dir, "events.jsonl")), Date.now(), { roles, reading: readLimits(join(dir, "limits.json")) });
  assert.equal(p.kind, "subscription");
  assert.deepEqual(p.limits.map((l) => [l.id, l.usedPct]), [["5h", 62], ["7d", 38]]);
  const five = p.shares.find((s) => s.window === "5h")?.agents ?? [];
  assert.deepEqual(five.filter((a) => a.heavy).map((a) => a.role), ["shinchan"]);
  assert.ok(five.every((a) => a.planPct !== null));
});

test("the optional module: loaded when plan.ts exists; null without it or when it throws; state carries plan", async () => {
  const fn = await loadBuildPlan();
  assert.equal(typeof fn, existsSync(join(import.meta.dirname, "..", "..", "plugin", "board", "lib", "plan.ts")) ? "function" : "object");
  assert.equal(planOf([], roles, NOW, null), null);
  assert.equal(planOf([], roles, NOW, () => { throw new Error("boom"); }), null);
  let seen: unknown;
  const out = planOf([], roles, NOW, (es, now, opts) => { seen = [es.length, now, opts?.roles?.size]; return buildPlan(es, now, { ...opts, reading: null }); });
  assert.equal(out?.kind, "unknown");
  assert.deepEqual(seen, [0, NOW, roles.size]);
  const state = buildState(NOW);
  assert.ok(Object.hasOwn(state, "plan"));
  assert.equal(state.plan?.kind, "unknown");
});

test("a plan.ts that throws on import, exports no function, is missing, or throws when called gives plan: null", async () => {
  const dir = mkdtempSync(join(tmpdir(), "crew-plan-mods-"));
  const file = (name: string, src: string) => { const p = join(dir, name); writeFileSync(p, src); return p; };
  for (const p of [file("boom.ts", 'throw new Error("import");\n'), file("none.ts", "export const buildPlan = 5;\n"), join(dir, "missing.ts")]) {
    const fn = await loadBuildPlan(p);
    assert.equal(fn, null, p);
    assert.equal(planOf([], roles, NOW, fn), null);
  }
  const throws = await loadBuildPlan(file("call.ts", 'export function buildPlan() { throw new Error("call"); }\n'));
  assert.equal(typeof throws, "function");
  assert.equal(planOf([], roles, NOW, throws), null);
});
