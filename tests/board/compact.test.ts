// F6: the event log is compacted (newest usage per key, 30 days of other events, a day of turn ends), the board
// server reads only appended bytes, and the hook's agent lookup reads the log's tail only.
import "./env.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { appendFileSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cacheLiveLog, compactEventLog, eventCache, KEEP_EVENT_DAYS, localDay, planCompaction, readEvents, type BoardEvent, type UsageRow } from "../../plugin/board/lib/events.ts";
import { CURSOR_FILE, EVENTS_FILE } from "../../plugin/board/lib/paths.ts";
import { buildState } from "../../plugin/board/lib/state.ts";
import { typeOfAgent } from "../../plugin/board/hook.ts";
import { pendingFeed } from "../../plugin/board/export.ts";

const NOW = Date.parse("2026-11-01T12:00:00Z"), DAY = 86_400_000, MIN = 60_000;
let seq = 0;
const idAt = (ms: number) => `e-${ms}-${(seq++ % 0xffffff).toString(16).padStart(6, "0")}`;
const ev = (ms: number, kind: BoardEvent["kind"], extra: Partial<BoardEvent> = {}): BoardEvent =>
  ({ id: idAt(ms), ts: new Date(ms).toISOString(), kind, text: "x", project: "shop", ...extra });
const row = (day: string, n: number): UsageRow => ({ model: "claude-opus-5-5", speed: "standard", long: false, day, n, in: n * 10, out: n * 5, cw5m: 0, cw1h: 0, cr: n * 100, ws: 0, wf: 0 });
const usage = (ms: number, sid: string, agentId: string | null, rows: UsageRow[], extra: Partial<BoardEvent> = {}) =>
  ev(ms, "usage", { sid, scope: agentId ? "agent" : "main", ...(agentId ? { agentId } : {}), rows, ...extra });
const lines = (events: (BoardEvent | string)[]) => events.map((e) => (typeof e === "string" ? e : JSON.stringify(e)) + "\n").join("");
const tmpFile = () => join(mkdtempSync(join(tmpdir(), "crew-compact-")), "events.jsonl");

test("plan: newest usage per key, its capped reads, future ones; 30 days of events, a day of turn ends", () => {
  const old = NOW - 40 * DAY, recent = NOW - 2 * DAY;
  const events: (BoardEvent | null)[] = [
    usage(old, "s1", null, [row("2026-09-22", 1)]),                                    // 0 superseded
    usage(old + MIN, "s1", null, [row("2026-09-22", 2)]),                              // 1 newest full read before a capped one
    usage(old + 2 * MIN, "s1", null, [row("2026-09-22", 1)], { partial: true }),       // 2 capped: folded with 1
    usage(recent, "s2", "a1", [row("2026-10-30", 5)]),                                 // 3 superseded
    usage(recent + MIN, "s2", "a1", [row("2026-10-30", 6)]),                           // 4 newest
    usage(NOW + 3_600_000, "s2", "a1", [row("2026-11-01", 9)]),                        // 5 future: readers skip it until then
    usage(recent, "s3", null, [row("2026-10-30", 1)], { scope: undefined }),           // 6 no reader counts it
    ev(NOW - 2 * DAY, "turn-end"), ev(NOW - 3_600_000, "turn-end"),                    // 7 drop, 8 keep
    ev(NOW - 25 * 3_600_000, "main-busy"), ev(NOW - 60_000, "main-busy"),              // 9 drop, 10 keep
    ev(NOW - (KEEP_EVENT_DAYS + 1) * DAY, "agent-start", { agentId: "a1", agentType: "toon-crew:bob" }),   // 11 drop
    ev(NOW - (KEEP_EVENT_DAYS - 1) * DAY, "commit", { ref: "abc1234" }),             // 12 keep
    null,                                                                               // 13 a torn line
    ev(old, "task-queue", { role: "kevin" }),                                           // 14 open task: keep
    ev(old, "task-queue", { role: "kevin" }),                                           // 15 closed long ago: drop
  ];
  const open = new Set([`t${(events[14] as BoardEvent).id.slice(1)}`]);
  events.push(ev(old + DAY, "task-start", { taskId: [...open][0] }));                  // 16 its start: keep
  const { keep, fill } = planCompaction(events, NOW, open);
  assert.deepEqual(keep.flatMap((k, i) => (k ? [i] : [])), [1, 2, 4, 5, 8, 10, 12, 14, 16]);
  // a1's start goes, so its kept usage events carry the type themselves
  assert.deepEqual([...fill], [[4, "toon-crew:bob"], [5, "toon-crew:bob"]]);
});

// Sessions over 60 days: main and agent usage snapshots every 10 minutes, a turn end per main snapshot, agent starts
// that alone name the agent's type, assigns, a capped read, a future snapshot, junk lines and tasks.
function bigLog(): string[] {
  const out: string[] = [];
  const push = (e: BoardEvent | string) => out.push(typeof e === "string" ? e : JSON.stringify(e));
  out.push(JSON.stringify(ev(NOW - 40 * DAY, "task-queue", { role: "kevin", text: "an old task nobody started" })));
  const closed = ev(NOW - 45 * DAY, "task-queue", { role: "kevin", text: "an old finished task" });
  push(closed); push(ev(NOW - 44 * DAY, "task-done", { taskId: `t${closed.id.slice(1)}` }));
  for (let s = 0; s < 100; s++) {
    const start = NOW - 60 * DAY + Math.round(s * 0.6 * DAY), sid = `s${String(s).padStart(4, "0")}`, aid = `a${s}`;
    push(ev(start, "assign", { sid, from: "doraemon", to: "toon-crew:bob", text: "build the thing" }));
    push(ev(start + 1000, "agent-start", { sid, agentId: aid, agentType: s % 2 ? "toon-crew:kevin" : "toon-crew:bob" }));
    const main = new Map<string, number>(), agent = new Map<string, number>();
    for (let k = 0; k < 200; k++) {
      const ms = start + k * 10 * MIN, day = localDay(ms);
      main.set(day, (main.get(day) ?? 0) + 3);
      const last = s === 50 && k === 199;   // a capped read that summed less than the read before it
      push(usage(ms, sid, null, [...main].map(([d, n]) => row(d, last ? Math.floor(n / 2) : n)), last ? { partial: true } : {}));
      push(ev(ms + 1, "turn-end", { sid }));
      if (k % 2) {
        agent.set(day, (agent.get(day) ?? 0) + 2);
        push(usage(ms + 2, sid, aid, [...agent].map(([d, n]) => row(d, n))));
      }
      if (k === 100) push(ev(ms + 3, "agent-stop", { sid, agentId: aid }));
    }
  }
  push(usage(NOW + 3_600_000, "s0099", null, [row(localDay(NOW), 99_999)]));
  push("{torn line");
  push(JSON.stringify({ kind: "usage", note: "no id" }));
  push(ev(NOW - 2 * DAY, "task-queue", { role: "bob", text: "a recent task" }));
  return out;
}

const median = (f: () => void) => {
  const t: number[] = [];
  for (let i = 0; i < 3; i++) { const a = performance.now(); f(); t.push(performance.now() - a); }
  return t.sort((a, b) => a - b)[1];
};

test("a 50k-line log compacts to a small one; cost, plan and tasks are unchanged and buildState gets faster", async () => {
  const log = bigLog();
  assert.ok(log.length >= 50_000, `fixture has ${log.length} lines`);
  writeFileSync(EVENTS_FILE, log.join("\n") + "\n", { mode: 0o600 });
  const sizeBefore = statSync(EVENTS_FILE).size;
  const before = buildState(NOW), slow = median(() => buildState(NOW));

  const r = await compactEventLog(EVENTS_FILE, NOW);
  assert.ok(r && r.dropped > 45_000, `dropped ${r?.dropped}`);
  const kept = readFileSync(EVENTS_FILE, "utf8").split("\n").filter(Boolean);
  assert.ok(kept.length < 1500, `kept ${kept.length} lines`);
  assert.ok(statSync(EVENTS_FILE).size * 10 < sizeBefore, "at least 10x smaller");
  assert.equal(statSync(EVENTS_FILE).mode & 0o777, 0o600);

  const after = buildState(NOW), fast = median(() => buildState(NOW));
  assert.ok(before.cost && after.cost);
  assert.deepEqual(after.cost, before.cost, "all-time and window cost, per room, role and task");
  assert.deepEqual(after.plan, before.plan);
  assert.deepEqual(after.tasks.queued, before.tasks.queued);
  assert.ok(before.tasks.queued.some((t) => t.text === "an old task nobody started"), "the fixture has an old open task");
  assert.deepEqual(after.tasks.active, before.tasks.active);
  const inWindow = (t: { doneAt?: string }) => Date.parse(t.doneAt ?? "") >= NOW - KEEP_EVENT_DAYS * DAY;
  assert.deepEqual(after.tasks.done.filter(inWindow), before.tasks.done.filter(inWindow));
  // the capped read kept its full read, so session s0050's main cost did not halve
  assert.ok(kept.filter((l) => l.includes('"sid":"s0050"') && l.includes('"usage"') && !l.includes('"agentId"')).length === 2);
  assert.ok(fast * 2 < slow, `buildState ${slow.toFixed(1)} ms before, ${fast.toFixed(1)} ms after`);

  // A second pass finds nothing to drop and leaves the file as it is.
  const ino = statSync(EVENTS_FILE).ino;
  assert.deepEqual(await compactEventLog(EVENTS_FILE, NOW), { before: statSync(EVENTS_FILE).size, after: statSync(EVENTS_FILE).size, dropped: 0 });
  assert.equal(statSync(EVENTS_FILE).ino, ino);
});

test("lines hooks append while the compaction runs, and a line cut off at its end, are kept", async () => {
  const file = tmpFile();
  const late = JSON.stringify(ev(NOW, "agent-stop", { agentId: "late" }));
  writeFileSync(file, lines([ev(NOW - 40 * DAY, "commit"), ev(NOW - DAY, "commit", { ref: "keep123" })]) + late.slice(0, 20));
  const running = compactEventLog(file, NOW);   // reads the file now, writes after its first await
  appendFileSync(file, late.slice(20) + "\n" + JSON.stringify(ev(NOW, "commit", { ref: "late456" })) + "\n");
  assert.equal((await running)?.dropped, 1);
  const refs = readEvents(file).map((e) => e.ref ?? e.agentId);
  assert.deepEqual(refs, ["keep123", "late", "late456"]);
});

test("a held lock skips the compaction; a lock older than 10 minutes is taken over", async () => {
  const file = tmpFile(), body = lines([ev(NOW - 40 * DAY, "commit"), ev(NOW, "commit")]);
  writeFileSync(file, body);
  writeFileSync(`${file}.lock`, "1");
  assert.equal(await compactEventLog(file, NOW), null);
  assert.equal(readFileSync(file, "utf8"), body);
  const t = (NOW - 11 * MIN) / 1000;
  utimesSync(`${file}.lock`, t, t);
  assert.equal((await compactEventLog(file, NOW))?.dropped, 1);
  assert.equal(readEvents(file).length, 1);
  assert.throws(() => statSync(`${file}.lock`), "the lock is released");
});

test("the cache reads only appended bytes and re-reads in full on a new inode, a shorter file or a rewrite", () => {
  const file = tmpFile(), cache = eventCache(file);
  assert.deepEqual(cache.read(), []);
  writeFileSync(file, lines([ev(NOW, "commit", { ref: "a" }), ev(NOW, "commit", { ref: "b" })]));
  assert.deepEqual(cache.read().map((e) => e.ref), ["a", "b"]);
  assert.equal(cache.stats.full, 1);
  const size = statSync(file).size, c = JSON.stringify(ev(NOW, "commit", { ref: "c" }));
  appendFileSync(file, c.slice(0, 10));   // a hook's line in progress waits for its newline
  assert.deepEqual(cache.read().map((e) => e.ref), ["a", "b"]);
  appendFileSync(file, c.slice(10) + "\n");
  assert.deepEqual(cache.read().map((e) => e.ref), ["a", "b", "c"]);
  assert.equal(cache.stats.full, 1, "no full re-read for appends");
  assert.equal(cache.stats.bytes, statSync(file).size, "each byte read once");
  assert.ok(cache.stats.bytes - size === c.length + 1);
  const copy = cache.read();
  copy.pop();
  assert.equal(cache.read().length, 3, "callers get a copy");

  const next = `${file}.new`;   // compaction: a new file renamed in
  writeFileSync(next, lines([ev(NOW, "commit", { ref: "z" })]));
  renameSync(next, file);
  assert.deepEqual(cache.read().map((e) => e.ref), ["z"]);
  assert.equal(cache.stats.full, 2);
  writeFileSync(file, lines([ev(NOW, "commit", { ref: "y" })]).slice(0, 5));   // shorter: re-read
  assert.deepEqual(cache.read(), []);
  assert.equal(cache.stats.full, 3);

  // Rewritten in place to the same length: the bytes before the old end changed.
  const a = lines([ev(NOW, "commit", { ref: "same-1" })]), b = a.replace("same-1", "diff-1");
  writeFileSync(file, a);
  assert.deepEqual(cache.read().map((e) => e.ref), ["same-1"]);
  writeFileSync(file, b + lines([ev(NOW, "commit", { ref: "more" })]));
  assert.deepEqual(cache.read().map((e) => e.ref), ["diff-1", "more"]);
  rmSync(file);
  assert.deepEqual(cache.read(), []);
});

test("readEvents of the live log uses the cache only once the server turns it on", () => {
  writeFileSync(EVENTS_FILE, lines([ev(NOW, "commit", { ref: "one" })]));
  cacheLiveLog();
  try {
    assert.deepEqual(readEvents().map((e) => e.ref), ["one"]);
    appendFileSync(EVENTS_FILE, lines([ev(NOW, "commit", { ref: "two" })]));
    assert.deepEqual(readEvents().map((e) => e.ref), ["one", "two"]);
    // proof it is the cache: a same-size in-place change past the checked edge is not seen until the inode changes
    const full = readFileSync(EVENTS_FILE, "utf8"), swapped = full.replace('"ref":"one"', '"ref":"uno"');
    writeFileSync(EVENTS_FILE, swapped);
    assert.deepEqual(readEvents().map((e) => e.ref), ["one", "two"]);
  } finally { cacheLiveLog(false); }
  assert.deepEqual(readEvents().map((e) => e.ref), ["uno", "two"], "off: the file itself");
});

test("typeOfAgent reads the log's tail only, never the whole file", () => {
  const file = tmpFile(), filler = lines(Array.from({ length: 200 }, () => ev(NOW, "turn-end")));
  writeFileSync(file, lines([ev(NOW, "agent-start", { agentId: "early", agentType: "toon-crew:bob" })]) + filler
    + lines([ev(NOW, "agent-start", { agentId: "late", agentType: "toon-crew:kevin" }), ev(NOW, "agent-stop", { agentId: "late" })]));
  assert.ok(statSync(file).size > 8192);
  assert.equal(typeOfAgent("late", file, [4096]), "toon-crew:kevin");
  assert.equal(typeOfAgent("early", file, [4096]), undefined, "outside every tail");
  assert.equal(typeOfAgent("early", file, [1024, 1 << 20]), "toon-crew:bob", "the wider tail holds it");
  assert.equal(typeOfAgent("nobody", file), undefined);
  assert.equal(typeOfAgent("x", join(tmpdir(), "no-such-crew-log.jsonl")), undefined);
});

test("export resumes by time when compaction removed the cursor's event", () => {
  const a = ev(NOW - 3 * MIN, "commit"), b = ev(NOW - 2 * MIN, "agent-stop"), c = ev(NOW - MIN, "turn-end"), d = ev(NOW, "pr");
  assert.deepEqual(pendingFeed([a, b, c, d], b.id).map((e) => e.id), [d.id], "after the cursor");
  assert.deepEqual(pendingFeed([c, d], b.id).map((e) => e.id), [d.id], "cursor gone: by its time");
  assert.deepEqual(pendingFeed([a, b, d], `e-${NOW - 30 * DAY}-abcdef`).map((e) => e.id), [a.id, b.id, d.id]);
  assert.deepEqual(pendingFeed([a, d], `e-${NOW + DAY}-abcdef`), []);
  assert.deepEqual(pendingFeed([a, d]).map((e) => e.id), [a.id, d.id], "no cursor: everything");
  assert.deepEqual(pendingFeed([a, d], "junk").map((e) => e.id), [a.id, d.id], "an unreadable cursor: everything");
});

test("export --dry on a compacted log does not send everything again", () => {
  const sent = ev(NOW - 50 * DAY, "commit"), newer = ev(NOW - DAY, "commit", { text: "the only new one" });
  writeFileSync(EVENTS_FILE, lines([ev(NOW - 60 * DAY, "commit", { text: "already sent" }), newer]));
  writeFileSync(CURSOR_FILE, JSON.stringify({ lastId: sent.id }));
  const r = spawnSync(process.execPath, ["--no-warnings", join(import.meta.dirname, "..", "..", "plugin", "board", "export.ts"), "--dry"], { encoding: "utf8", timeout: 20_000 });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /the only new one/);
  assert.doesNotMatch(r.stdout, /already sent/);
  rmSync(CURSOR_FILE, { force: true });
});
