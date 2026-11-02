// An agent stopped by the user never fires SubagentStop. Its own transcript's mtime (lstat only) tells the board
// it is gone: a stale or missing file drops it from copies, crew.running and clone detection within one poll.
import "./env.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { linkSync, mkdirSync, mkdtempSync, renameSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listRoles, loadRoles } from "../../plugin/board/lib/crew.ts";
import { buildRooms, roomFeed, roomFor, transcriptProbe } from "../../plugin/board/lib/room.ts";
import type { BoardEvent } from "../../plugin/board/lib/events.ts";

const NOW = Date.parse("2026-10-28T12:00:00Z");
const MIN = 60_000;
const at = (minAgo: number, now = NOW) => new Date(now - minAgo * MIN).toISOString();
let n = 0;
const ev = (o: Partial<BoardEvent>): BoardEvent => ({ id: "e-" + ++n, ts: at(0), kind: "agent-start", text: "", project: "shop", ...o }) as BoardEvent;
const SH = "toon-crew:shinchan";
const SID = "0123abcd", UUID = "0123abcd-0000-4000-8000-000000000001";
const start = (agentId: string, minAgo: number, o: Partial<BoardEvent> = {}) => ev({ kind: "agent-start", agentId, agentType: SH, sid: SID, ts: at(minAgo), text: `${SH} started`, ...o });
const stop = (agentId: string, minAgo: number) => ev({ kind: "agent-stop", agentId, agentType: SH, sid: SID, ts: at(minAgo), text: `${SH} finished: ok` });

// A throwaway transcript root laid out like Claude Code's: <root>/<slug>/<session uuid>/subagents/agent-<id>.jsonl.
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "crew-live-"));
  const subs = join(root, "-w-shop", UUID, "subagents");
  mkdirSync(subs, { recursive: true });
  const file = (agentId: string, minAgo: number, now = NOW) => {
    const p = join(subs, `agent-${agentId}.jsonl`);
    writeFileSync(p, "{}\n");
    const t = new Date(now - minAgo * MIN);
    utimesSync(p, t, t);
    return p;
  };
  return { root, subs, file, probe: transcriptProbe({ root: () => root, clock: () => NOW }) };
}

const roles = loadRoles(), cards = listRoles();
const shin = (r: ReturnType<typeof roomFor>) => r.members.find((m) => m.id === "shinchan")!;

test("stopped without a stop: a twin whose transcript went quiet 20 minutes ago is dropped within one poll", () => {
  const f = fixture();
  f.file("a1", 20); f.file("a2", 1);
  const r = roomFor("shop", [start("a1", 40), start("a2", 30)], roles, cards, NOW, f.probe);
  assert.deepEqual([shin(r).status, shin(r).copies, shin(r).copyIds], ["working", 1, ["a2"]]);
  assert.deepEqual(r.crew, { running: 1, cap: 8, light: 4, roles: 1 });
  // Alone, the stale one shows Lost contact at once, not after the 45-minute fallback.
  const alone = roomFor("shop", [start("a1", 30)], roles, cards, NOW, f.probe);
  assert.deepEqual([shin(alone).status, shin(alone).line, shin(alone).stale, shin(alone).copies], ["idle", "Lost contact", true, 0]);
  assert.equal(alone.crew.running, 0);
});

test("ALIVE_MS is 12 minutes: quiet for 11 is running, quiet for 13 is not", () => {
  const f = fixture();
  f.file("a1", 11); f.file("a2", 13);
  const r = roomFor("shop", [start("a1", 30), start("a2", 30)], roles, cards, NOW, f.probe);
  assert.deepEqual(shin(r).copyIds, ["a1"]);
});

test("a fresh transcript keeps an agent running past the 45-minute fallback", () => {
  const f = fixture();
  f.file("a1", 1);
  const r = roomFor("shop", [start("a1", 50)], roles, cards, NOW, f.probe);
  assert.deepEqual([shin(r).status, shin(r).copies, shin(r).stale], ["working", 1, undefined]);
  assert.equal(r.crew.running, 1);
});

test("a missing transcript drops the agent once the start is older than the 2-minute grace", () => {
  const f = fixture();
  const r = roomFor("shop", [start("a1", 3)], roles, cards, NOW, f.probe);
  assert.deepEqual([shin(r).status, shin(r).line, shin(r).copies], ["idle", "Lost contact", 0]);
  assert.equal(r.crew.running, 0);
  // Just started: the file is written async, so it may not exist yet.
  assert.equal(shin(roomFor("shop", [start("a1", 1)], roles, cards, NOW, f.probe)).copies, 1);
});

test("no locator (old sid, unknown session) falls back to the 45-minute rule while a located twin still drops", () => {
  const f = fixture();
  f.file("a2", 20);
  const events = [start("a1", 20, { sid: "s1" }), start("a3", 20, { sid: "fedcba98" }), start("a2", 20)];
  const r = roomFor("shop", events, roles, cards, NOW, f.probe);
  assert.deepEqual(shin(r).copyIds, ["a1", "a3"]);
  assert.equal(r.crew.running, 2);
  const old = roomFor("shop", [start("a1", 46, { sid: "s1" })], roles, cards, NOW, f.probe);
  assert.deepEqual([shin(old).line, shin(old).copies], ["Lost contact", 0]);
});

test("a symlink, a second name or a folder outside the root is no locator: the fallback, never stat through it", () => {
  const f = fixture();
  const outside = mkdtempSync(join(tmpdir(), "crew-live-out-"));
  const old = join(outside, "old.jsonl");
  writeFileSync(old, "{}\n");
  utimesSync(old, new Date(NOW - 60 * MIN), new Date(NOW - 60 * MIN));
  symlinkSync(old, join(f.subs, "agent-l1.jsonl"));            // symlinked file
  linkSync(old, join(f.subs, "agent-h1.jsonl"));               // hard link: a second name
  // A symlinked project folder that leads out of the root, holding another session.
  const out2 = "89abcdef-0000-4000-8000-000000000002";
  mkdirSync(join(outside, "p", out2, "subagents"), { recursive: true });
  const far = join(outside, "p", out2, "subagents", "agent-o1.jsonl");
  writeFileSync(far, "{}\n");
  utimesSync(far, new Date(NOW - 60 * MIN), new Date(NOW - 60 * MIN));
  symlinkSync(join(outside, "p"), join(f.root, "-linked"));
  f.file("a2", 20);
  const events = [start("l1", 20), start("h1", 20), start("o1", 20, { sid: out2.slice(0, 8) }), start("a2", 20)];
  for (const id of ["l1", "h1", "o1"]) assert.deepEqual(f.probe(id, id === "o1" ? out2.slice(0, 8) : SID), { kind: "none" }, id);
  const r = roomFor("shop", events, roles, cards, NOW, f.probe);
  assert.deepEqual(shin(r).copyIds, ["l1", "h1", "o1"]);
});

test("a session folder swapped for a symlink out of the root after it was indexed is still no locator", () => {
  const f = fixture();
  f.file("a1", 1);
  assert.equal(f.probe("a1", SID).kind, "seen");   // indexes the session folder
  const outside = mkdtempSync(join(tmpdir(), "crew-live-swap-"));
  mkdirSync(join(outside, "subagents"));
  const far = join(outside, "subagents", "agent-s1.jsonl");
  writeFileSync(far, "{}\n");
  utimesSync(far, new Date(NOW - 60 * MIN), new Date(NOW - 60 * MIN));
  renameSync(join(f.root, "-w-shop", UUID), join(f.root, "-w-shop", "moved"));
  symlinkSync(outside, join(f.root, "-w-shop", UUID));
  assert.deepEqual(f.probe("s1", SID), { kind: "none" });
});

test("symlinked project or session folders are never indexed, even when they point inside the root", () => {
  const f = fixture();
  f.file("a1", 1);
  symlinkSync(join(f.root, "-w-shop"), join(f.root, "-w-alias"));                     // a project folder link
  mkdirSync(join(f.root, "-w-real"));
  symlinkSync(join(f.root, "-w-shop", UUID), join(f.root, "-w-real", UUID));          // a session folder link
  // Indexed, either link would make the real session look ambiguous (two folders, one prefix).
  assert.equal(f.probe("a1", SID).kind, "seen");
});

// Write agent-<id>.jsonl into <root>/<slug>/<uuid>/subagents with an mtime minAgo minutes back.
function put(root: string, slug: string, uuid: string, agentId: string, minAgo: number) {
  const subs = join(root, slug, uuid, "subagents");
  mkdirSync(subs, { recursive: true });
  const p = join(subs, `agent-${agentId}.jsonl`), t = new Date(NOW - minAgo * MIN);
  writeFileSync(p, "{}\n"); utimesSync(p, t, t);
  return p;
}

test("the same session under 2 slugs plus a tmp folder: the folder holding the agent's file decides, an old mtime drops it", () => {
  const f = fixture();
  f.file("a1", 20);                                          // stopped by the user 20 minutes ago
  put(f.root, "-w-shop-wt", UUID, "a2", 1);                  // the same session uuid under a worktree slug
  mkdirSync(join(f.root, "-private-tmp", UUID, "tool-results"), { recursive: true });   // a tmp cwd: a folder with no subagents
  writeFileSync(join(f.root, "-private-tmp", UUID + ".jsonl"), "{}\n");                   // and the main transcript file: never a folder
  // In both folders (the same id twice): the newest write wins, so an old copy cannot drop a live agent.
  f.file("a3", 30); put(f.root, "-w-shop-wt", UUID, "a3", 2);
  // A different session that only shares the 8-character prefix, holding nothing of these agents.
  mkdirSync(join(f.root, "-w-other", SID + "-1111-4000-8000-000000000009", "subagents"), { recursive: true });
  assert.equal((f.probe("a1", SID) as { mtime: number }).mtime, NOW - 20 * MIN);
  assert.equal((f.probe("a3", SID) as { mtime: number }).mtime, NOW - 2 * MIN);
  assert.equal(f.probe("zz", SID).kind, "missing");
  const r = roomFor("shop", [start("a1", 30), start("a2", 30), start("a3", 30)], roles, cards, NOW, f.probe);
  assert.deepEqual(shin(r).copyIds, ["a2", "a3"]);
  assert.equal(r.crew.running, 2);
});

test("several folders: a symlink in one cannot keep a ghost alive while the real file in another is old", () => {
  const f = fixture();
  f.file("a1", 20);
  const outside = mkdtempSync(join(tmpdir(), "crew-live-multi-"));
  writeFileSync(join(outside, "fresh.jsonl"), "{}\n");
  mkdirSync(join(f.root, "-w-shop-wt", UUID, "subagents"), { recursive: true });
  symlinkSync(join(outside, "fresh.jsonl"), join(f.root, "-w-shop-wt", UUID, "subagents", "agent-a1.jsonl"));
  assert.equal(f.probe("a1", SID).kind, "seen");
  assert.equal(shin(roomFor("shop", [start("a1", 30)], roles, cards, NOW, f.probe)).copies, 0);
  // With no real file anywhere, the odd path means no locator (the fallback), not "missing".
  symlinkSync(join(outside, "fresh.jsonl"), join(f.root, "-w-shop-wt", UUID, "subagents", "agent-l1.jsonl"));
  assert.deepEqual(f.probe("l1", SID), { kind: "none" });
});

test("a session that gains a folder under a new slug after indexing is rescanned before an agent counts as missing", () => {
  const f = fixture();
  let clock = NOW;
  const probe = transcriptProbe({ root: () => f.root, clock: () => clock });
  f.file("a1", 1);
  assert.equal(probe("a1", SID).kind, "seen");               // indexes the one folder
  put(f.root, "-w-shop-wt2", UUID, "b1", 1);                 // a new worktree slug appears later
  clock += 10_001;
  assert.equal(probe("b1", SID).kind, "seen");
});

test("a session folder swapped for a symlink that stays inside the root is no locator", () => {
  const f = fixture();
  f.file("a1", 1);
  assert.equal(f.probe("a1", SID).kind, "seen");
  // Another real session in the root, with a fresh file for s1.
  put(f.root, "-w-else", "fedcba98-0000-4000-8000-000000000003", "s1", 1);
  renameSync(join(f.root, "-w-shop", UUID), join(f.root, "-w-shop", "moved"));
  symlinkSync(join(f.root, "-w-else", "fedcba98-0000-4000-8000-000000000003"), join(f.root, "-w-shop", UUID));
  assert.deepEqual(f.probe("s1", SID), { kind: "none" });
});

test("a busy session (turn ends every 5 minutes) with a stopped agent and no locator: dropped after 45 minutes", () => {
  const f = fixture();
  const busy = (sid: string) => Array.from({ length: 12 }, (_, i) => ev({ kind: "turn-end", sid, ts: at(55 - i * 5), text: "Turn ended" }));
  // "fedcba98" has no folder (no locator); "s1" is an old-style sid.
  for (const sid of ["fedcba98", "s1"]) {
    const events = [start("a1", 60, { sid }), ...busy(sid), ev({ kind: "commit", sid, ts: at(1), text: "Commit" })];
    const r = roomFor("shop", events, roles, cards, NOW, f.probe);
    assert.deepEqual([shin(r).status, shin(r).line, shin(r).copies, r.crew.running], ["idle", "Lost contact", 0, 0], sid);
    // The agent's own event inside the window still keeps it.
    const own = ev({ kind: "usage", agentId: "a1", sid, ts: at(10), text: "usage" });
    assert.equal(shin(roomFor("shop", [...events, own], roles, cards, NOW, f.probe)).copies, 1, sid);
  }
});

test("two stopped agents with old transcripts and no live one: idle, copies 0, copyIds empty", () => {
  const f = fixture();
  f.file("a1", 25); f.file("a2", 24);
  const r = roomFor("shop", [start("a1", 30), start("a2", 29)], roles, cards, NOW, f.probe);
  assert.deepEqual([shin(r).status, shin(r).copies, shin(r).copyIds], ["idle", 0, []]);
  assert.equal(r.crew.running, 0);
  // Every member that is not working has no copies, whatever else it shows.
  for (const m of r.members) if (m.status !== "working") assert.deepEqual([m.copies, m.copyIds], [0, []], m.id);
});

test("a ghost followed by a normal hand-back of the same role shows done, not Lost contact", () => {
  const f = fixture();
  f.file("g1", 20); f.file("a2", 5);
  const r = roomFor("shop", [start("g1", 30), start("a2", 15), stop("a2", 5)], roles, cards, NOW, f.probe);
  assert.deepEqual([shin(r).status, shin(r).stale, shin(r).copies], ["done", undefined, 0]);
  // The other way round (the ghost's last sign is the newer news) it is Lost contact.
  f.file("g2", 13);
  const r2 = roomFor("shop", [start("a2", 40), stop("a2", 30), start("g2", 25)], roles, cards, NOW, f.probe);
  assert.deepEqual([shin(r2).line, shin(r2).stale], ["Lost contact", true]);
});

test("clone detection ignores a copy whose transcript was already quiet when the new one started", () => {
  const f = fixture();
  f.file("a1", 30); f.file("a2", 1);
  const events = [start("a1", 40), start("a2", 5)];
  assert.equal(roomFeed(events, roles, f.probe).filter((x) => x.kind === "clone").length, 0);
  // A copy that was still writing then is a real clone, even though it has gone quiet since.
  f.file("a1", 4);
  const fresh = transcriptProbe({ root: () => f.root, clock: () => NOW });
  assert.equal(roomFeed(events, roles, fresh).filter((x) => x.kind === "clone").length, 1);
});

test("an open needs-you of the agent keeps it while its transcript is quiet (a permission dialog writes nothing)", () => {
  const f = fixture();
  f.file("a1", 20);
  const events = [start("a1", 30), ev({ kind: "needs-you", agentId: "a1", sid: SID, need: "permission", ts: at(18), text: "Waiting for your permission" })];
  assert.equal(shin(roomFor("shop", events, roles, cards, NOW, f.probe)).copies, 1);
});

test("one lstat per agent per poll: the answer is reused for 10 seconds, then read again", () => {
  const f = fixture();
  let clock = NOW;
  const probe = transcriptProbe({ root: () => f.root, clock: () => clock });
  f.file("a1", 30);
  assert.equal(probe("a1", SID).kind, "seen");
  const before = probe("a1", SID);
  f.file("a1", 0);
  assert.deepEqual(probe("a1", SID), before);
  clock += 10_001;
  assert.equal((probe("a1", SID) as { mtime: number }).mtime, NOW);
  // Bad identities never reach the file system.
  for (const [id, sid] of [["../x", SID], ["a1", "../../.."], ["a1", undefined]] as const) assert.deepEqual(probe(id, sid), { kind: "none" });
});

test("real clock: buildRooms with Date.now() drops a stale twin and keeps a fresh one", () => {
  const f = fixture(), now = Date.now();
  f.file("r1", 0, now); f.file("r2", 13, now);
  const real = transcriptProbe({ root: () => f.root });
  const events = [ev({ kind: "agent-start", agentId: "r1", agentType: SH, sid: SID, ts: at(20, now), text: "s" }), ev({ kind: "agent-start", agentId: "r2", agentType: SH, sid: SID, ts: at(20, now), text: "s" })];
  const rooms = buildRooms(events, [], roles, cards, now, real);
  assert.deepEqual(rooms.shop.members.find((m) => m.id === "shinchan")!.copyIds, ["r1"]);
  assert.equal(rooms.shop.crew.running, 1);
});
