// Where the plan's numbers come from: the rate-limit reading's allow-list, the Stop hook that writes limits.json
// (in process and as the real child script), and the hour rows from a transcript through the hook and the log.
import "./env.ts";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, test } from "node:test";
import { appendEvent, hourOf, hourRows, LIMITS_ENV, LIMITS_FILE, limitsReading, readEvents, usageFields, USAGE_MAX_HOURS, type LimitsReading } from "../lib/events.ts";
import { EVENTS_FILE } from "../lib/paths.ts";
import { redactDeep } from "../lib/redact.ts";
import { readUsage } from "../lib/usage.ts";
import { toUsage } from "../hook.ts";
import { saveLimits } from "../limits.ts";

const SCRIPT = join(import.meta.dirname, "..", "limits.ts");
const GOOD: LimitsReading = { v: 1, at: "2026-10-28T01:00:00.000Z", sub: true, w: [{ id: "5h", pct: 23.5, end: "2026-10-28T04:00:00.000Z" }, { id: "7d", pct: 41.2, end: null }] };
const raw = (x: unknown) => JSON.stringify(x);

beforeEach(() => { rmSync(LIMITS_FILE, { force: true }); rmSync(EVENTS_FILE, { force: true }); });

// ---- the reading's allow-list ----

test("limitsReading keeps known keys only, clamps the percentage and normalises times", () => {
  assert.deepEqual(limitsReading({ ...GOOD, extra: "x", w: [{ ...GOOD.w[0], note: "hi" }, GOOD.w[1]] }), GOOD);
  const r = limitsReading({ ...GOOD, at: "2026-10-28T01:00:00Z", w: [{ id: "5h", pct: 123.456, end: "2026-10-28T04:00:00Z" }, { id: "7d", pct: -3, end: null }] });
  assert.deepEqual(r?.w.map((x) => [x.pct, x.end]), [[100, "2026-10-28T04:00:00.000Z"], [0, null]]);
  assert.equal(r?.at, "2026-10-28T01:00:00.000Z");
});

test("limitsReading refuses anything odd: wrong version, types, times, windows or a repeated window", () => {
  const bad: unknown[] = [
    null, 5, "x", [GOOD], { ...GOOD, v: 2 }, { ...GOOD, sub: "true" }, { ...GOOD, at: "yesterday" }, { ...GOOD, at: "2026-02-30T01:00:00.000Z" },
    { ...GOOD, at: "2026-10-28T01:00:00+05:30" }, { ...GOOD, w: "5h" }, { ...GOOD, w: [...GOOD.w, GOOD.w[0]] },
    { ...GOOD, w: [{ ...GOOD.w[0], id: "spend_limit" }] }, { ...GOOD, w: [{ ...GOOD.w[0], id: "__proto__" }] }, { ...GOOD, w: [{ ...GOOD.w[0], id: "constructor" }] },
    { ...GOOD, w: [{ ...GOOD.w[0], pct: "50" }] }, { ...GOOD, w: [{ ...GOOD.w[0], pct: Number.NaN }] }, { ...GOOD, w: [{ ...GOOD.w[0], end: "soon" }] },
    { ...GOOD, w: [{ ...GOOD.w[0], end: undefined }] }, { ...GOOD, w: [null] }, { ...GOOD, w: [GOOD.w[0], GOOD.w[0]] },
  ];
  for (const b of bad) assert.equal(limitsReading(b), null, raw(b)?.slice(0, 80));
});

test("the reading's and the hour rows' key names survive redaction: no token, session or secret words", () => {
  assert.deepEqual(redactDeep(GOOD), GOOD);
  const hours = [{ model: "claude-opus-5-5", speed: "standard", long: false, hr: "2026-10-28T09", n: 9876543210, in: 4111111111111111, out: 1, cw5m: 1, cw1h: 1, cr: 1, ws: 1, wf: 1 }];
  assert.deepEqual(redactDeep(hours), hours, "numbers that look like phones or cards stay numbers");
});

test("hourOf takes a real UTC hour only", () => {
  assert.equal(hourOf("2026-10-28T09"), "2026-10-28T09");
  for (const b of ["2026-10-28T24", "2026-02-30T01", "2026-10-28 09", "2026-10-28T9", "2026-10-28T09:00", 2026, null]) assert.equal(hourOf(b), "", String(b));
});

// ---- the writer ----

test("saveLimits writes only the checked reading, owner-only, through a temp file it leaves no trace of", () => {
  assert.equal(saveLimits(raw({ ...GOOD, extra: "planted" })), true);
  assert.deepEqual(JSON.parse(readFileSync(LIMITS_FILE, "utf8")), GOOD);
  assert.ok(!readFileSync(LIMITS_FILE, "utf8").includes("planted"));
  assert.equal(statSync(LIMITS_FILE).mode & 0o777, 0o600);
  const dir = join(LIMITS_FILE, "..");
  assert.deepEqual(readdirSync(dir).filter((f) => f.startsWith("limits.json.")), [], "no temp file left behind");
});

test("saveLimits: a looser temp file left from an earlier run still ends owner-only", () => {
  // writeFileSync's mode applies only when it creates the file; the chmod is what covers this case.
  const tmp = `${LIMITS_FILE}.${process.pid}.tmp`;
  writeFileSync(tmp, "old", { mode: 0o644 });
  chmodSync(tmp, 0o644);
  assert.equal(saveLimits(raw(GOOD)), true);
  assert.equal(statSync(LIMITS_FILE).mode & 0o777, 0o600);
});

test("saveLimits: junk, an unset variable or an over-long value write nothing", () => {
  for (const b of [undefined, "", "{", raw({ ...GOOD, v: 9 }), raw(GOOD) + " ".repeat(5000), 42]) assert.equal(saveLimits(b), false, String(b).slice(0, 40));
  assert.equal(existsSync(LIMITS_FILE), false);
});

test("saveLimits never puts an older reading over a newer one, and does not rewrite an equal one", () => {
  assert.equal(saveLimits(raw(GOOD)), true);
  assert.equal(saveLimits(raw(GOOD)), false, "equal");
  assert.equal(saveLimits(raw({ ...GOOD, at: "2026-10-28T00:59:59.000Z", sub: false, w: [] })), false, "older");
  assert.equal(JSON.parse(readFileSync(LIMITS_FILE, "utf8")).sub, true);
  assert.equal(saveLimits(raw({ ...GOOD, at: "2026-10-28T01:05:00.000Z", sub: false, w: [] })), true, "newer");
  assert.equal(JSON.parse(readFileSync(LIMITS_FILE, "utf8")).sub, false);
});

test("saveLimits replaces a torn or hand-edited file with a good reading", () => {
  writeFileSync(LIMITS_FILE, '{"v":1,');
  assert.equal(saveLimits(raw(GOOD)), true);
  assert.deepEqual(JSON.parse(readFileSync(LIMITS_FILE, "utf8")), GOOD);
});

// The real hook entry as Claude Code runs it: the variable from the mod, the data folder, stdin it never reads.
function runHook(env: Record<string, string | undefined>, dir: string) {
  const childEnv: Record<string, string> = {};
  for (const k of ["PATH", "HOME"]) if (process.env[k]) childEnv[k] = process.env[k] as string;
  for (const [k, v] of Object.entries({ CLAUDE_PLUGIN_DATA: dir, ...env })) if (v !== undefined) childEnv[k] = v;
  return spawnSync(process.execPath, ["--no-warnings", SCRIPT], { env: childEnv, input: '{"hook_event_name":"Stop","transcript_path":"/etc/passwd"}', encoding: "utf8", timeout: 10_000 });
}

test("the Stop hook script copies the variable into <CLAUDE_PLUGIN_DATA>/limits.json, prints nothing and exits 0", () => {
  const dir = mkdtempSync(join(tmpdir(), "crew-limits-hook-"));
  const ok = runHook({ [LIMITS_ENV]: raw(GOOD) }, dir);
  assert.deepEqual([ok.status, ok.stdout, ok.stderr], [0, "", ""]);
  assert.deepEqual(JSON.parse(readFileSync(join(dir, "limits.json"), "utf8")), GOOD);
  const other = mkdtempSync(join(tmpdir(), "crew-limits-hook-"));
  for (const v of [undefined, "not json", raw({ ...GOOD, w: [{ id: "5h", pct: "lots", end: null }] })]) {
    const r = runHook({ [LIMITS_ENV]: v }, other);
    assert.deepEqual([r.status, r.stdout], [0, ""], String(v));
  }
  assert.deepEqual(readdirSync(other), [], "nothing written for a missing or bad reading");
});

// ---- hour rows: transcript -> hook -> log ----

const cfg = mkdtempSync(join(tmpdir(), "crew-plan-cfg-"));
const root = join(cfg, "projects");
mkdirSync(join(root, "w"), { recursive: true });
const line = (id: string, ts: string, out: number, model = "claude-sonnet-5-5") =>
  JSON.stringify({ type: "assistant", timestamp: ts, message: { id, model, usage: { input_tokens: 1, output_tokens: out } } });

test("the reader buckets responses by UTC hour across midnight, newest hours first, and keeps only the newest six", () => {
  const ts = ["2026-10-27T15:10:00.000Z", "2026-10-27T18:05:00.000Z", "2026-10-27T19:05:00.000Z", "2026-10-27T20:05:00.000Z",
    "2026-10-27T21:05:00.000Z", "2026-10-27T23:59:00.000Z", "2026-10-28T00:01:00.000Z", "2026-10-28T00:30:00.000Z"];
  const file = join(root, "w", "midnight.jsonl");
  writeFileSync(file, [...ts.map((t, i) => line(`m${i}`, t, 10 + i)), line("m9", "not a time", 99)].join("\n") + "\n");
  const e = readUsage(file, { scope: "main", project: "w", sid: "s1aaaaaa", final: false }, { root, dayOf: (ms) => new Date(ms).toISOString().slice(0, 10) });
  assert.ok(e);
  assert.deepEqual(e.hours?.map((h) => [h.hr, h.n, h.out]), [
    ["2026-10-28T00", 2, 16 + 17], ["2026-10-27T23", 1, 15], ["2026-10-27T21", 1, 14], ["2026-10-27T20", 1, 13], ["2026-10-27T19", 1, 12], ["2026-10-27T18", 1, 11],
  ]);
  assert.equal(new Set(e.hours?.map((h) => h.hr)).size, USAGE_MAX_HOURS);
  // The day rows still hold every response, the untimed one in day "".
  assert.equal(e.rows.reduce((a, r) => a + r.n, 0), 9);
});

test("hour rows pass the hook's allow-list into the log and come back unchanged; bad ones are dropped", async () => {
  const file = join(root, "w", "hook.jsonl");
  writeFileSync(file, line("m1", "2026-10-28T00:30:00.000Z", 5) + "\n");
  const stop = { hook_event_name: "Stop", session_id: "s1aaaaaa", transcript_path: file };
  const read = (p: string, o: Parameters<typeof readUsage>[1]) => readUsage(p, o, { root });
  const e = await toUsage(stop, read, () => undefined, { CLAUDE_PROJECT_DIR: "/w/shop" });
  assert.deepEqual(e?.hours?.map((h) => [h.hr, h.out]), [["2026-10-28T00", 5]]);
  assert.ok(e);
  const id = appendEvent(e).id;
  const back = readEvents().find((x) => x.id === id);
  assert.deepEqual(back?.hours, e.hours);
  // A reader that returns odd hours: only rows with a real hour, a known shape and a count are kept.
  const odd = usageFields({ scope: "main", rows: [{ model: "claude-sonnet-5-5", day: "2026-10-28", n: 1 }],
    hours: [{ model: "claude-sonnet-5-5", hr: "2026-10-28T00", n: 1, note: "x" }, { model: "x\ny", hr: "2026-10-28T01", out: 2 }, { hr: "soon", n: 1 }, { hr: "2026-10-28T02", n: 0 }, "x"] });
  assert.deepEqual(odd?.hours, [
    { model: "claude-sonnet-5-5", speed: "standard", long: false, hr: "2026-10-28T00", n: 1, in: 0, out: 0, cw5m: 0, cw1h: 0, cr: 0, ws: 0, wf: 0 },
    { model: "unknown", speed: "standard", long: false, hr: "2026-10-28T01", n: 0, in: 0, out: 2, cw5m: 0, cw1h: 0, cr: 0, ws: 0, wf: 0 },
  ]);
  assert.deepEqual(hourRows("x"), []);
});
