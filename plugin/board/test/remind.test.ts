// The compact reminder: Stop hook thresholds, state between turns, its output, and the "Needs you" card.
import "./env.ts";
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { appendEvent, readEvents, QUIET_KINDS } from "../lib/events.ts";
import { loadRoles } from "../lib/crew.ts";
import { DROP_AFTER_MS, deriveNeeds } from "../lib/needs.ts";
import { EVENTS_FILE, LOG_DIR } from "../lib/paths.ts";
import { transcriptRoot } from "../lib/usage.ts";
import { contextTokens, run } from "../remind.ts";

const SETTINGS = join(process.env.CLAUDE_CONFIG_DIR ?? "", "settings.json");   // the temp config folder from env.ts
const ENV = { CLAUDE_PROJECT_DIR: "/work/acme", CLAUDE_CONFIG_DIR: process.env.CLAUDE_CONFIG_DIR };
// The text the owner asked for, spelled out here on purpose (not built by the code under test).
const OPTIONS = [
  " • /compact keep the open PR, queued tasks and decisions   (shrink, keep working)",
  " • /clear   (fresh start; best when the work is committed; the board and summaries keep the state)",
];
const AUTO = " • /autocompact 200k   (one time: auto-compact at 200K from now on)";
const head = (k: number, auto = true) => [`Context is ${k}K tokens (re-sent every turn). Options:`, ...OPTIONS, ...(auto ? [AUTO] : [])].join("\n");
const MERGE_MESSAGE = "PR merged. Good time to /clear (the board and hand-back summaries keep the state), or /compact keep the next steps.";
const roles = loadRoles();
const dir = join(transcriptRoot(), "-work-acme");
mkdirSync(dir, { recursive: true });
let n = 0;

// A transcript whose last assistant message was sent with `ctx` tokens of context (split over the three counters).
function transcript(ctx: number, extra: Record<string, unknown>[] = []): string {
  const path = join(dir, `s${++n}.jsonl`);
  const line = (o: unknown) => JSON.stringify(o) + "\n";
  const asst = (id: string, total: number) => line({ type: "assistant", message: { id, model: "claude-opus-4-1", usage: { input_tokens: 10, cache_read_input_tokens: total - 110, cache_creation_input_tokens: 100, output_tokens: 5 } } });
  writeFileSync(path, line({ type: "user", message: { content: "hi" } }) + asst("msg_1", 5000) + asst("msg_2", ctx) + asst("msg_2", ctx) + extra.map(line).join(""));
  return path;
}
const stop = (path: string, extra: Record<string, unknown> = {}) => ({ hook_event_name: "Stop", session_id: "aaaaaaaa-1111", cwd: "/work/acme", transcript_path: path, ...extra });
const go = (input: Record<string, unknown>) => run(input as Parameters<typeof run>[0], ENV);
const msg = (out: string) => (out ? (JSON.parse(out) as { systemMessage: string }).systemMessage : "");

beforeEach(() => { rmSync(EVENTS_FILE, { force: true }); rmSync(join(LOG_DIR, "remind"), { recursive: true, force: true }); });

test("under 200K: nothing printed, nothing written", () => {
  assert.equal(go(stop(transcript(199_999))), "");
  assert.deepEqual(readEvents(), []);
});

test("at 200K one reminder; none again until another 100K", () => {
  const first = go(stop(transcript(200_000)));
  assert.equal(msg(first), head(200));
  assert.equal(go(stop(transcript(250_000))), "");
  assert.equal(go(stop(transcript(299_999))), "");
  assert.equal(msg(go(stop(transcript(300_000)))), head(300));
  assert.equal(go(stop(transcript(310_000))), "");
});

test("the size counts input + cache reads + cache writes of the newest message, not the first", () => {
  assert.equal(msg(go(stop(transcript(230_000)))), head(230));
});

test("after a compact the size reminder is armed again", () => {
  go(stop(transcript(260_000)));
  assert.equal(go(stop(transcript(40_000))), "");
  assert.ok(msg(go(stop(transcript(210_000)))).startsWith("Context is 210K"));
});

test("a subagent Stop and other events are ignored", () => {
  const big = transcript(400_000);
  assert.equal(go(stop(big, { agent_id: "agent-1" })), "");
  assert.equal(go(stop(big, { hook_event_name: "SubagentStop" })), "");
  assert.deepEqual(readEvents(), []);
});

test("one reminder after a merge in this session, once; other sessions' merges do not count", () => {
  const small = transcript(50_000);
  appendEvent({ kind: "pr", text: "Merged PR #7", sid: "bbbbbbbb", project: "acme" });
  assert.equal(go(stop(small)), "");
  appendEvent({ kind: "pr", text: "Opened PR #8", sid: "aaaaaaaa", project: "acme" });
  assert.equal(go(stop(small)), "");
  appendEvent({ kind: "pr", text: "Merged PR #8", sid: "aaaaaaaa", project: "acme" }, new Date(Date.now() + 1000));
  assert.equal(msg(go(stop(small))), MERGE_MESSAGE);
  assert.equal(go(stop(small)), "");
  appendEvent({ kind: "pr", text: "Merged PR #9", sid: "aaaaaaaa", project: "acme" }, new Date(Date.now() + 5000));
  assert.ok(msg(go(stop(small))).startsWith("PR merged."));
});

test("size and merge due together give one message, and the merge is used up", () => {
  const big = transcript(220_000);
  appendEvent({ kind: "pr", text: "Merged PR #3", sid: "aaaaaaaa" });
  assert.ok(msg(go(stop(big))).startsWith("Context is 220K"));
  assert.equal(go(stop(big)), "");
});

test("the state file is owner-only and holds numbers and a time, no transcript text", () => {
  go(stop(transcript(210_000, [{ type: "user", message: { content: "SECRET-CONTENT" } }])));
  const folder = join(LOG_DIR, "remind"), files = readdirSync(folder);
  assert.equal(files.length, 1);
  assert.match(files[0], /^[0-9a-f]{24}\.json$/);
  assert.ok(!files[0].includes("aaaaaaaa"));
  assert.equal(statSync(join(folder, files[0])).mode & 0o777, 0o600);
  assert.deepEqual(JSON.parse(readFileSync(join(folder, files[0]), "utf8")), { size: 210_000, merge: "" });
});

test("a broken, missing, outside or empty transcript gives nothing and does not throw", () => {
  const bad = join(dir, "bad.jsonl");
  writeFileSync(bad, '{"type":"assistant","message":{"usage":\n\u0000garbage\n');
  for (const p of [bad, join(dir, "missing.jsonl"), "/etc/passwd", "relative.jsonl", undefined, 42]) assert.equal(go(stop(p as string)), "");
  assert.equal(go({ hook_event_name: "Stop" }), "");
});

test("absurd token counts are capped per field at 1e9, so the message never shows exponents or huge numbers", () => {
  const usageFile = (usage: Record<string, unknown>) => {
    const p = join(dir, `big${++n}.jsonl`);
    writeFileSync(p, JSON.stringify({ type: "assistant", message: { id: "m1", model: "claude-opus-4-1", usage } }) + "\n");
    return p;
  };
  const cases: [Record<string, unknown>, number][] = [
    [{ input_tokens: 1e300, cache_read_input_tokens: 1e300, cache_creation_input_tokens: 1e300 }, 3_000_000],
    [{ input_tokens: 1e300, cache_read_input_tokens: 1e300, cache_creation: { ephemeral_5m_input_tokens: 1e300, ephemeral_1h_input_tokens: 1e300 } }, 4_000_000],
    [{ input_tokens: 5e9, cache_read_input_tokens: 1000, cache_creation_input_tokens: 100 }, 1_000_001],   // each field on its own, not the sum
    [{ input_tokens: 1_000_000_000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }, 1_000_000], // the cap itself is kept
  ];
  for (const [usage, k] of cases) {
    rmSync(join(LOG_DIR, "remind"), { recursive: true, force: true });
    const file = usageFile(usage);
    if (k % 1_000_000 === 0) assert.equal(contextTokens(file), k * 1000, `exact count ${JSON.stringify(usage)}`);
    const m = msg(go(stop(file)));
    assert.equal(m, head(k), JSON.stringify(usage));
    assert.doesNotMatch(m, /e\+|Infinity|NaN/);
  }
});

test("the compact-hint event: quiet, fixed text, numbers in numeric fields", () => {
  go(stop(transcript(230_000)));
  const [e] = readEvents();
  assert.equal(e.kind, "compact-hint");
  assert.equal(e.why, "size");
  assert.equal(e.ctx, 230);
  assert.equal(e.project, "acme");
  assert.ok(!/\d/.test(e.text), e.text);
  assert.ok(QUIET_KINDS.has("compact-hint"));
  assert.deepEqual(Object.keys(e).sort(), ["ctx", "id", "kind", "project", "sid", "text", "ts", "why"]);
});

test("the script prints valid JSON with systemMessage only when reminding, and exits 0 on garbage", () => {
  const exec = (stdin: string) => spawnSync(process.execPath, ["--no-warnings", join(import.meta.dirname, "..", "remind.ts")], { input: stdin, encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: "/work/acme" } });
  const loud = exec(JSON.stringify(stop(transcript(240_000))));
  assert.equal(loud.status, 0);
  assert.deepEqual(Object.keys(JSON.parse(loud.stdout)), ["systemMessage"]);
  assert.equal(JSON.parse(loud.stdout).systemMessage, head(240));
  const quiet = exec(JSON.stringify(stop(transcript(240_000))));
  assert.deepEqual([quiet.status, quiet.stdout, quiet.stderr], [0, "", ""]);
  for (const junk of ["", "not json", "null", "[1]", JSON.stringify(stop(join(dir, "nope.jsonl"), { session_id: "zzzzzzzz-2" }))]) {
    const r = exec(junk);
    assert.deepEqual([r.status, r.stdout, r.stderr], [0, "", ""], junk);
  }
});

test("the size message is the headline and the options, 4 lines with /autocompact and 3 without", () => {
  const m = msg(go(stop(transcript(230_000))));
  assert.equal(m.split("\n").length, 4);
  assert.equal(m, head(230));
});

test("the /autocompact line hides when autoCompactWindow is set at or below 250000, and only then", () => {
  const set = (v: unknown) => writeFileSync(SETTINGS, JSON.stringify({ autoCompactWindow: v, other: "ignored" }));
  const lineFor = (v: unknown) => { rmSync(join(LOG_DIR, "remind"), { recursive: true, force: true }); set(v); return msg(go(stop(transcript(230_000)))); };
  try {
    assert.equal(lineFor(200_000), head(230, false));
    assert.equal(lineFor(250_000), head(230, false));
    assert.equal(lineFor(250_001), head(230, true));
    assert.equal(lineFor(800_000), head(230, true));
    for (const odd of ["200000", null, -5, 0, {}, [200000]]) assert.equal(lineFor(odd), head(230, true), JSON.stringify(odd));
    rmSync(SETTINGS);   // no settings file
    rmSync(join(LOG_DIR, "remind"), { recursive: true, force: true });
    assert.equal(msg(go(stop(transcript(230_000)))), head(230, true));
    writeFileSync(SETTINGS, "{ not json");
    rmSync(join(LOG_DIR, "remind"), { recursive: true, force: true });
    assert.equal(msg(go(stop(transcript(230_000)))), head(230, true));
  } finally { rmSync(SETTINGS, { force: true }); }
});

test("hooks.json: remind.ts is one sync entry, in Stop only", () => {
  const { hooks } = JSON.parse(readFileSync(join(import.meta.dirname, "..", "..", "hooks", "hooks.json"), "utf8")) as { hooks: Record<string, { hooks: { command: string; async?: boolean; timeout?: number }[] }[]> };
  const hits = Object.entries(hooks).flatMap(([ev, gs]) => gs.flatMap((g) => g.hooks.filter((h) => h.command.includes("/board/remind.ts")).map((h) => ({ ev, h }))));
  assert.equal(hits.length, 1);
  assert.equal(hits[0].ev, "Stop");
  assert.equal(hits[0].h.async, undefined);
  assert.ok(hits[0].h.timeout && hits[0].h.timeout <= 10);
});

const NOW = Date.parse("2026-11-01T12:00:00Z");
const needs = (now = NOW) => deriveNeeds(readEvents(), roles, [], {}, now).filter((x) => x.kind === "compact");
const at = (min: number) => new Date(NOW + min * 60_000);

test("Needs you: the compact item appears, survives turn-ends, and clears on the next session start", () => {
  appendEvent({ kind: "compact-hint", text: "x", why: "size", ctx: 230, sid: "aaaaaaaa", project: "acme" }, at(0));
  const [item] = needs();
  assert.equal(item.kind, "compact");
  assert.equal(item.role, "doraemon");
  assert.equal(item.ctx, 230);
  assert.equal(item.why, "size");
  assert.ok(!/\d/.test(item.text), item.text);
  appendEvent({ kind: "turn-end", text: "t", sid: "aaaaaaaa", project: "acme" }, at(1));
  assert.equal(needs().length, 1);
  appendEvent({ kind: "session-start", text: "Session started (compact)", sid: "aaaaaaaa", project: "acme" }, at(2));
  assert.equal(needs().length, 0);
});

test("Needs you: a /clear (new session id) in the same project clears it; another project does not", () => {
  appendEvent({ kind: "compact-hint", text: "x", why: "merge", sid: "aaaaaaaa", project: "acme" }, at(0));
  appendEvent({ kind: "session-start", text: "s", sid: "cccccccc", project: "other" }, at(1));
  assert.equal(needs().length, 1);
  appendEvent({ kind: "session-start", text: "s", sid: "dddddddd", project: "acme" }, at(2));
  assert.equal(needs().length, 0);
});

test("Needs you: it drops after 2 hours, and a new hint replaces the older one of the session", () => {
  appendEvent({ kind: "compact-hint", text: "x", why: "size", ctx: 210, sid: "aaaaaaaa", project: "acme" }, at(0));
  assert.equal(needs(NOW + DROP_AFTER_MS + 1).length, 0);
  appendEvent({ kind: "compact-hint", text: "x", why: "size", ctx: 310, sid: "aaaaaaaa", project: "acme" }, at(30));
  const list = needs(NOW + 60 * 60_000);
  assert.equal(list.length, 1);
  assert.equal(list[0].ctx, 310);
});

test("the card text in room.js", () => {
  const src = readFileSync(join(import.meta.dirname, "..", "room.js"), "utf8");
  const body = /function needCopy\(x, s, who\) \{[\s\S]*?\n\}\n/.exec(src)?.[0] ?? "";
  const needCopy = new Function("own", `${body}; return needCopy;`)(() => undefined) as (x: object, s: object, who: string) => { text: string };
  assert.equal(needCopy({ kind: "compact", why: "size", ctx: 230 }, {}, "Doraemon").text, "Context is 230K tokens (re-sent every turn). Run `/compact` or `/clear` in your Claude Code session.");
  assert.equal(needCopy({ kind: "compact", why: "merge" }, {}, "Doraemon").text, "PR merged. Good time to `/clear` (the board and hand-back summaries keep the state), or `/compact` keep the next steps.");
});
