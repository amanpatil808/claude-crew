// Cost ledger reader: numbers only from a synthetic transcript, refused paths, read caps, and the event surviving
// the board's own redaction. Every transcript here is made up; no real one is read.
import "./env.ts";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, test } from "node:test";
import { appendEvent, localDay, readEvents, USAGE_MAX_DAYS, USAGE_MAX_ROWS, usageFields, type UsageEvent, type UsageOptions } from "../lib/events.ts";
import { EVENTS_FILE } from "../lib/paths.ts";
import { redactDeep } from "../lib/redact.ts";
import { readUsage, safeTranscript, sumTranscript, type ReadLimits } from "../lib/usage.ts";

const base = mkdtempSync(join(tmpdir(), "crew-usage-"));
const root = join(base, "projects");                 // stands in for ~/.claude/projects
const outside = join(base, "elsewhere");
mkdirSync(join(root, "-work-shop", "s1", "subagents"), { recursive: true });
mkdirSync(outside, { recursive: true });
const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);   // fixed zone, so no test depends on the machine's
const L: ReadLimits = { root, dayOf: utcDay };
const TS = "2026-10-27T09:00:00.000Z";
const MAIN: UsageOptions = { scope: "main", project: "shop", sid: "s1aaaaaa", final: false };
const AGENT: UsageOptions = { scope: "agent", agentId: "a0123456789abcdef", agentType: "toon-crew:kevin", project: "shop", sid: "s1aaaaaa", final: true };

interface U { in?: number; out?: number; w5?: number; w1?: number; cr?: number; speed?: string; ws?: number; wf?: number }
const usage = (u: U) => ({
  input_tokens: u.in ?? 0, output_tokens: u.out ?? 0,
  cache_creation_input_tokens: (u.w5 ?? 0) + (u.w1 ?? 0),
  cache_creation: { ephemeral_5m_input_tokens: u.w5 ?? 0, ephemeral_1h_input_tokens: u.w1 ?? 0 },
  cache_read_input_tokens: u.cr ?? 0, speed: u.speed ?? "standard", service_tier: "standard", inference_geo: "global",
  server_tool_use: { web_search_requests: u.ws ?? 0, web_fetch_requests: u.wf ?? 0 },
  iterations: [{ input_tokens: u.in ?? 0, output_tokens: u.out ?? 0 }],
});
// The line shape follows a real transcript's key names (CLI 2.1.310): `timestamp` is top-level ISO UTC.
const asst = (id: string, u: U, model = "claude-sonnet-5-5", text = "hello", timestamp: unknown = TS) => JSON.stringify({
  parentUuid: "p", isSidechain: false, type: "assistant", requestId: `req_${id}`, version: "2.1.310", timestamp,
  message: { id, type: "message", role: "assistant", model, content: [{ type: "text", text }], usage: usage(u) },
});
const user = (text: string) => JSON.stringify({ type: "user", message: { role: "user", content: text } });
const write = (rel: string, lines: string[], end = "\n") => { const p = join(root, rel); writeFileSync(p, lines.join("\n") + end); return p; };
const sumOf = (e: UsageEvent | null) => e?.rows.reduce((a, r) => ({ n: a.n + r.n, in: a.in + r.in, out: a.out + r.out }), { n: 0, in: 0, out: 0 });

beforeEach(() => rmSync(EVENTS_FILE, { force: true }));

test("one response written as several lines counts once; user and quoted lines are ignored", () => {
  const p = write("-work-shop/s1.jsonl", [
    user("start"),
    asst("msg_A", { in: 10, out: 100, w1: 1000, cr: 5000 }, undefined, "block 1"),
    asst("msg_A", { in: 10, out: 100, w1: 1000, cr: 5000 }, undefined, "block 2"),
    asst("msg_A", { in: 10, out: 100, w1: 1000, cr: 5000 }, undefined, "block 3"),
    user('tool said {"type":"assistant","message":{"id":"msg_FAKE","usage":{"input_tokens":999999}}}'),
    JSON.stringify({ type: "attachment", attachment: { type: "file" } }),
    asst("msg_B", { in: 20, out: 200, w5: 300, cr: 6000 }),
    asst("msg_B", { in: 20, out: 200, w5: 300, cr: 6000 }),
  ]);
  const e = readUsage(p, MAIN, L);
  assert.ok(e);
  assert.deepEqual(e.rows, [{ model: "claude-sonnet-5-5", speed: "standard", long: false, day: "2026-10-27", n: 2, in: 30, out: 300, cw5m: 300, cw1h: 1000, cr: 11000, ws: 0, wf: 0 }]);
});

test("dedupe keeps the last line of a response, also when its lines are not adjacent", () => {
  const p = write("-work-shop/last.jsonl", [asst("msg_A", { out: 5 }), asst("msg_B", { out: 7 }), asst("msg_A", { out: 50 })]);
  assert.deepEqual(sumOf(readUsage(p, MAIN, L)), { n: 2, in: 0, out: 57 });
});

test("rows split by model, speed and long prompt; web search and fetch counted", () => {
  const p = write("-work-shop/mix.jsonl", [
    asst("m1", { in: 1, out: 2, ws: 3, wf: 1 }, "claude-opus-5-5"),
    asst("m2", { in: 1, out: 2, speed: "fast" }, "claude-opus-5-5"),
    asst("m3", { in: 100_000 }, "claude-haiku-5-5"),               // exactly 100K: not over
    asst("m4", { in: 1, w5: 50_000, cr: 50_000 }, "claude-haiku-5-5"),  // 100,001 with cache: over
  ]);
  const rows = readUsage(p, MAIN, L)?.rows.map((r) => [r.model, r.speed, r.long, r.n, r.ws, r.wf]);
  assert.deepEqual(rows, [
    ["claude-haiku-5-5", "standard", false, 1, 0, 0],
    ["claude-haiku-5-5", "standard", true, 1, 0, 0],
    ["claude-opus-5-5", "fast", false, 1, 0, 0],
    ["claude-opus-5-5", "standard", false, 1, 3, 1],
  ]);
});

test("a write total without the TTL split counts as 5-minute writes", () => {
  const line = JSON.stringify({ type: "assistant", message: { id: "m1", model: "claude-opus-5-5", usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 70 } } });
  const r = readUsage(write("-work-shop/nosplit.jsonl", [line]), MAIN, L)?.rows[0];
  assert.deepEqual([r?.cw5m, r?.cw1h], [70, 0]);
});

test("only numbers leave the transcript: planted secrets, paths and odd model ids never reach the event", () => {
  // Built at run time so no token-shaped literal sits in the source (gitleaks scans every commit).
  const secrets = ["sk-ant-" + "api03-" + "Pl4nted".repeat(5), "ghp_" + "Pl4nted0".repeat(5), "hunter2-planted", "planted@example.com"];
  const p = write("-work-shop/leak.jsonl", [
    asst("m1", { in: 1, out: 1 }, "claude-sonnet-5-5", `the key is ${secrets[0]}`),
    JSON.stringify({ type: "user", toolUseResult: { stdout: `${secrets[1]} ${secrets[2]}` }, message: { content: secrets[3] } }),
    asst("m2", { in: 1, out: 1 }, secrets[0]),                       // a model field holding a secret
    asst("m3", { in: 1, out: 1 }, "claude-sonnet-5-5\nplanted"),
    asst("m4", { in: 0, out: 0 }, "<synthetic>"),                    // Claude Code's placeholder: skipped
  ]);
  const e = readUsage(p, MAIN, L);
  assert.ok(e);
  const json = JSON.stringify(e);
  for (const s of [...secrets, root, base, "leak.jsonl"]) assert.ok(!json.includes(s), `leaks ${s}`);
  assert.deepEqual(e.rows.map((r) => [r.model, r.n]), [["claude-sonnet-5-5", 1], ["unknown", 2]]);
  // Allow-listed keys only, at both levels.
  assert.deepEqual(Object.keys(e).sort(), ["final", "kind", "partial", "project", "rows", "scope", "sid", "since", "text"]);
  assert.equal(e.since, "2026-10-27");
  for (const r of e.rows) assert.deepEqual(Object.keys(r).sort(), ["cr", "cw1h", "cw5m", "day", "in", "long", "model", "n", "out", "speed", "wf", "ws"]);
});

test("refused without a read: symlinks, paths outside the root, traversal, non-.jsonl and devices", () => {
  const good = [asst("m1", { in: 1, out: 1 })];
  const inside = write("-work-shop/real.jsonl", good);
  assert.ok(readUsage(inside, MAIN, L), "control: the real file is read");
  const out = join(outside, "x.jsonl");
  writeFileSync(out, good.join("\n") + "\n");
  symlinkSync(inside, join(root, "-work-shop", "link-in.jsonl"));        // symlink to a good file inside the root
  symlinkSync(out, join(root, "-work-shop", "link-out.jsonl"));          // symlink pointing outside
  symlinkSync(outside, join(root, "-work-shop", "dirlink"));             // a symlinked folder pointing outside
  mkdirSync(join(root, "-work-shop", "folder.jsonl"));
  writeFileSync(join(root, "-work-shop", "notes.txt"), good.join("\n"));
  for (const p of [
    join(root, "-work-shop", "link-in.jsonl"), join(root, "-work-shop", "link-out.jsonl"), join(root, "-work-shop", "dirlink", "x.jsonl"),
    out, join(root, "..", "elsewhere", "x.jsonl"), join(root, "-work-shop", "notes.txt"), join(root, "-work-shop", "folder.jsonl"),
    "-work-shop/real.jsonl", "/etc/passwd", "/dev/zero", join(root, "-work-shop", "missing.jsonl"),
  ]) assert.equal(readUsage(p, MAIN, L), null, p);
});

test("a file swapped after the check is not read: another file, or a symlink, in its place", () => {
  const p = write("-work-shop/swap.jsonl", [asst("m1", { in: 1 })]);
  const checked = safeTranscript(p, root);
  assert.ok(checked && sumTranscript(checked)?.rows.length, "control: unchanged file is read");
  const secret = join(outside, "secret.jsonl");
  writeFileSync(secret, asst("m9", { in: 999 }) + "\n");
  // Create the replacement while the original still exists, then rename it over: the two inodes
  // are guaranteed different. rm-then-write lets ext4 reuse the freed inode (same dev+ino) on Linux.
  writeFileSync(p + ".new", asst("m9", { in: 999 }) + "\n");
  renameSync(p + ".new", p);                           // same path, new file (new inode)
  assert.equal(sumTranscript(checked), null);
  rmSync(p);
  symlinkSync(secret, p);                              // same path, now a symlink to a file outside the root
  assert.throws(() => sumTranscript(checked), /ELOOP|too many|symbolic/i);
});

test("the default root is <CLAUDE_CONFIG_DIR>/projects, so a file elsewhere is refused", () => {
  const prev = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = base;   // base/projects is `root`
  try {
    assert.ok(readUsage(write("-work-shop/env.jsonl", [asst("m1", { in: 1 })]), MAIN));
    const out = join(outside, "env.jsonl");
    writeFileSync(out, asst("m1", { in: 1 }) + "\n");
    assert.equal(readUsage(out, MAIN), null);
  } finally { if (prev === undefined) delete process.env.CLAUDE_CONFIG_DIR; else process.env.CLAUDE_CONFIG_DIR = prev; }
});

test("the byte cap stops the read and marks it partial; a cap at the exact size does not", () => {
  const lines = Array.from({ length: 20 }, (_, i) => asst(`m${i}`, { in: 1 }));
  const p = write("-work-shop/big.jsonl", lines);
  const size = Buffer.byteLength(lines.join("\n") + "\n");
  const half = readUsage(p, MAIN, { root, maxBytes: Math.floor(size / 2), chunkBytes: 64 });
  assert.equal(half?.partial, true);
  assert.ok(half && half.rows[0].n > 0 && half.rows[0].n < 20, `read ${half?.rows[0].n}`);
  const all = readUsage(p, MAIN, { root, maxBytes: size, chunkBytes: 64 });
  assert.deepEqual([all?.partial, all?.rows[0].n], [false, 20]);
});

test("the time cap stops the read and marks it partial", () => {
  const p = write("-work-shop/slow.jsonl", Array.from({ length: 20 }, (_, i) => asst(`m${i}`, { in: 1 })));
  let t = 0;
  const e = readUsage(p, MAIN, { root, maxMs: 400, chunkBytes: 256, clock: () => (t += 20) });   // each check is 20 ms later
  assert.equal(e?.partial, true);
  assert.ok(e && e.rows[0].n > 0 && e.rows[0].n < 20, `read ${e?.rows[0].n}`);
  // Out of time before one whole line: nothing to report, so no event (the next read starts over).
  t = 0;
  assert.equal(readUsage(p, MAIN, { root, maxMs: 30, chunkBytes: 256, clock: () => (t += 20) }), null);
  assert.equal(readUsage(p, MAIN, { root, chunkBytes: 256 })?.partial, false);
});

test("an over-long line is dropped and marks the read partial; the lines around it still count", () => {
  const p = write("-work-shop/long.jsonl", [asst("m1", { in: 1 }), asst("m2", { in: 2 }, undefined, "x".repeat(5000)), asst("m3", { in: 4 })]);
  const e = readUsage(p, MAIN, { root, maxLineBytes: 1000, chunkBytes: 100 });
  assert.deepEqual([e?.partial, e?.rows[0].n, e?.rows[0].in], [true, 2, 5]);
});

test("chunk size never changes the result (lines cut across chunks, multi-byte text)", () => {
  const p = write("-work-shop/chunks.jsonl", [asst("m1", { in: 3, out: 9 }, undefined, "naïve café ✓ 日本"), user("ü"), asst("m2", { in: 4, out: 1 })]);
  const want = readUsage(p, MAIN, L);
  for (const chunkBytes of [1, 7, 64, 4096]) assert.deepEqual(readUsage(p, MAIN, { ...L, chunkBytes }), want, `chunk ${chunkBytes}`);
});

test("a torn last line is skipped; a whole last line without a newline counts", () => {
  const whole = asst("m2", { in: 2 });
  assert.equal(sumOf(readUsage(write("-work-shop/torn.jsonl", [asst("m1", { in: 1 }), whole.slice(0, 40)], ""), MAIN, L))?.n, 1);
  assert.equal(sumOf(readUsage(write("-work-shop/nonl.jsonl", [asst("m1", { in: 1 }), whole], ""), MAIN, L))?.n, 2);
  assert.equal(readUsage(write("-work-shop/torn.jsonl", [asst("m1", { in: 1 }), whole.slice(0, 40)], ""), MAIN, L)?.partial, false);
});

test("no usage found gives no event, never an event of zeros", () => {
  assert.equal(readUsage(write("-work-shop/empty.jsonl", [], ""), MAIN, L), null);
  assert.equal(readUsage(write("-work-shop/users.jsonl", [user("a"), user("b")]), MAIN, L), null);
  assert.equal(readUsage(write("-work-shop/junk.jsonl", ['{"type":"assistant",', "not json"]), MAIN, L), null);
});

test("scope: main carries no agent fields; agent needs a clean id; the text is fixed", () => {
  const p = write("-work-shop/s1/subagents/agent-a0123456789abcdef.jsonl", [asst("m1", { in: 9_876_543_210 })]);
  const main = readUsage(p, { ...MAIN, agentId: "x", agentType: "y" }, L);
  assert.deepEqual([main?.scope, main?.agentId, main?.agentType, main?.text], ["main", undefined, undefined, "Usage update"]);
  const agent = readUsage(p, AGENT, L);
  assert.deepEqual([agent?.scope, agent?.agentId, agent?.agentType, agent?.final], ["agent", "a0123456789abcdef", "toon-crew:kevin", true]);
  assert.equal(readUsage(p, { ...AGENT, agentId: undefined }, L), null);
  assert.equal(readUsage(p, { ...AGENT, agentId: "../etc" }, L), null);
  assert.equal(readUsage(p, { ...AGENT, agentType: "kevin says hi" }, L)?.agentType, undefined);
});

test("each response is bucketed by the day of its own line; a missing or bad time goes to day \"\"", () => {
  const p = write("-work-shop/days.jsonl", [
    asst("m1", { out: 1 }, undefined, undefined, "2026-10-20T23:59:59.999Z"),
    asst("m2", { out: 2 }, undefined, undefined, "2026-10-21T00:00:00.000Z"),
    asst("m3", { out: 4 }, undefined, undefined, "2026-10-21T08:00:00Z"),
    JSON.stringify({ ...JSON.parse(asst("m4", { out: 8 })), timestamp: undefined }),   // no timestamp key at all
    asst("m5", { out: 16 }, undefined, undefined, "yesterday"),
    asst("m6", { out: 32 }, undefined, undefined, 1792929600000),            // a number, not ISO text
    asst("m7", { out: 64 }, undefined, undefined, "2026-02-30T10:00:00Z"),   // not a real date
    asst("m8", { out: 128 }, undefined, undefined, "2026-10-21"),            // a date without a time
    // One response written as several lines: the last line's time wins, like its numbers.
    asst("m9", { out: 256 }, undefined, "a", "2026-10-19T10:00:00Z"), asst("m9", { out: 256 }, undefined, "b", "2026-10-21T10:00:00Z"),
  ]);
  const e = readUsage(p, MAIN, L);
  assert.deepEqual(e?.rows.map((r) => [r.day, r.n, r.out]), [["2026-10-21", 3, 262], ["2026-10-20", 1, 1], ["", 5, 248]]);
});

test("the day is the injected zone's calendar day, the machine's local day by default", () => {
  const p = write("-work-shop/zone.jsonl", [asst("m1", { out: 1 }, undefined, undefined, "2026-10-27T20:00:00Z")]);
  const ist = (ms: number) => utcDay(ms + 5.5 * 3_600_000);   // UTC+05:30: 20:00 UTC is 01:30 the next day
  assert.equal(readUsage(p, MAIN, { root, dayOf: ist })?.rows[0].day, "2026-10-28");
  assert.equal(readUsage(p, MAIN, L)?.rows[0].day, "2026-10-27");
  assert.equal(readUsage(p, MAIN, { root })?.rows[0].day, localDay(Date.parse("2026-10-27T20:00:00Z")));
  // A day function that gives no real day puts the response in "", never free text.
  assert.equal(readUsage(p, MAIN, { root, dayOf: () => "<b>x</b>" })?.rows[0].day, "");
});

test("row cap: only the newest days keep their own rows; older days fold into \"\" and no number is lost", () => {
  // 40 days, two models a day: 80 dated rows before the cap.
  const lines = [];
  for (let i = 0; i < 40; i++) {
    const ts = `${utcDay(Date.parse("2026-10-27T10:00:00Z") - i * 86_400_000)}T10:00:00Z`;
    lines.push(asst(`a${i}`, { out: 1, cr: 10 }, "claude-opus-5-5", "x", ts), asst(`b${i}`, { out: 2 }, "claude-haiku-5-5", "x", ts));
  }
  const p = write("-work-shop/cap.jsonl", lines);
  const total = (e: UsageEvent | null) => e?.rows.reduce((a, r) => [a[0] + r.n, a[1] + r.out, a[2] + r.cr], [0, 0, 0]);
  const e = readUsage(p, MAIN, L);
  assert.ok(e);
  assert.equal(USAGE_MAX_DAYS, 8);
  assert.equal(new Set(e.rows.map((r) => r.day).filter(Boolean)).size, 8);
  assert.equal(e.rows.length, 18, "8 days x 2 models + one \"\" row per model");
  assert.deepEqual(e.rows.filter((r) => r.day === "").map((r) => [r.model, r.n]), [["claude-haiku-5-5", 32], ["claude-opus-5-5", 32]]);
  assert.equal(e.rows.some((r) => r.day !== "" && r.day < "2026-10-20"), false, "the oldest kept day is 7 days before the newest");
  assert.deepEqual([total(e), e.partial], [[80, 120, 400], false]);
  assert.equal(e.since, "2026-09-18", "since is the earliest day seen, folded or not");
  // Too many rows: more days fold until the event fits, still with every number.
  const small = readUsage(p, MAIN, { ...L, maxRows: 11 });
  assert.ok(small && small.rows.length <= 11);
  assert.deepEqual([small.rows.filter((r) => r.day).length, total(small), small.partial], [8, [80, 120, 400], false]);
  // Only when even day "" cannot fit are rows cut, and the read is then marked partial.
  const cut = readUsage(p, MAIN, { ...L, maxRows: 1 });
  assert.deepEqual([cut?.rows.length, cut?.rows[0].day, cut?.partial], [1, "", true]);
  // The hook's and the ledger's own row caps take a full event.
  assert.deepEqual([usageFields(e)?.rows.length, usageFields(e)?.since], [18, "2026-09-18"]);
  assert.ok(USAGE_MAX_ROWS >= USAGE_MAX_DAYS * 8);
});

const append = (e: UsageEvent) => appendEvent(e, new Date("2026-10-27T16:40:00Z"));

test("the event survives appendEvent / redactDeep with every number intact", () => {
  // Counts that look like a phone (10 digits) or a Luhn-valid card (16 digits) would be masked inside text.
  // Days too: "2026-10-27" must stay a day, not turn into a masked number.
  const p = write("-work-shop/s1/subagents/agent-a0123456789abcdef.jsonl", [
    asst("m1", { in: 9_876_543_210, out: 4_111_111_111_111_111, w5: 59124, cr: 1_036_895, ws: 2 }),
    asst("m2", { in: 48, out: 13072 }, "claude-opus-5-5"),
    asst("m3", { in: 9_876_543_210, cr: 4_111_111_111_111_111 }, "claude-opus-5-5", "x", "2026-10-01T10:00:00Z"),
    asst("m4", { out: 7 }, "claude-opus-5-5", "x", null),
  ]);
  const e = readUsage(p, AGENT, L);
  assert.ok(e);
  assert.deepEqual(e.rows.map((r) => [r.model, r.long, r.day, r.in, r.out, r.cr]), [
    ["claude-opus-5-5", false, "2026-10-27", 48, 13072, 0], ["claude-opus-5-5", false, "", 0, 7, 0],
    ["claude-opus-5-5", true, "2026-10-01", 9_876_543_210, 0, 4_111_111_111_111_111],
    ["claude-sonnet-5-5", true, "2026-10-27", 9_876_543_210, 4_111_111_111_111_111, 1_036_895],
  ]);
  assert.deepEqual(redactDeep(e), e);
  const written = append(e);
  const back = readEvents().find((x) => x.id === written.id);
  assert.ok(back);
  const { id, ts, ...rest } = back;
  assert.match(id, /^e-\d+-[0-9a-f]{6}$/);
  assert.equal(ts, "2026-10-27T16:40:00.000Z");
  assert.deepEqual(rest, e);
});

test("why the keys are short: token- and session-named keys would be wiped by redaction", () => {
  assert.deepEqual(redactDeep({ inputTokens: 1234, cacheReadTokens: 99, session: "x", in: 1234, cr: 99 }),
    { inputTokens: "[redacted]", cacheReadTokens: "[redacted]", session: "[redacted]", in: 1234, cr: 99 });
});
