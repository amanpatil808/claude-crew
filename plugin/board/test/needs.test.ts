// "Needs you": the Notification branch of the hook, how waits open and clear, the PR rule, and /api/state.
import "./env.ts";
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { toEvent as rawToEvent } from "../hook.ts";
import { appendEvent, NEED_OF, NEED_TEXT, readEvents, type BoardEvent } from "../lib/events.ts";
import { loadRoles } from "../lib/crew.ts";
import { DROP_AFTER_MS, deriveNeeds, eventNeeds, prNeeds, STALE_AFTER_MS } from "../lib/needs.ts";
import { EVENTS_FILE, REGISTRY_FILE } from "../lib/paths.ts";
import { buildState } from "../lib/state.ts";
import type { Pr } from "../lib/sources.ts";

const ENV = { CLAUDE_PROJECT_DIR: "/work/acme" };
const toEvent = (input: Parameters<typeof rawToEvent>[0]) => rawToEvent(input, () => false, () => undefined, ENV);
const roles = loadRoles();
const SECRET = "ghp_" + "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8";   // planted in Claude Code's own message and title
const note = (notification_type: unknown, extra: Record<string, unknown> = {}) =>
  ({ hook_event_name: "Notification", session_id: "5e55a0f1-0000", cwd: "/tmp", notification_type, message: `Claude needs your permission to use Bash ${SECRET}`, title: `Permission ${SECRET}`, ...extra }) as Parameters<typeof rawToEvent>[0];

beforeEach(() => rmSync(EVENTS_FILE, { force: true }));

test("Notification: each allow-listed type gives needs-you with the fixed text for its need", () => {
  const want: [string, string, string][] = [
    ["permission_prompt", "permission", "Waiting for your permission"], ["idle_prompt", "idle", "Waiting for your reply"],
    ["elicitation_dialog", "input", "Waiting for your answer"], ["elicitation_url_dialog", "input", "Waiting for your answer"],
    ["agent_needs_input", "agent-input", "Waiting for your input"],
  ];
  for (const [type, need, text] of want) assert.deepEqual(toEvent(note(type)), { project: "acme", sid: "5e55a0f1", agentId: undefined, agentType: undefined, kind: "needs-you", need, text });
  assert.equal(NEED_OF.size, want.length);
});

test("Notification: Claude Code's message and title never reach the event or the log", () => {
  const e = toEvent(note("permission_prompt"));
  assert.ok(e);
  assert.ok(!JSON.stringify(e).includes(SECRET) && !JSON.stringify(e).includes("Bash"));
  appendEvent(e);
  const line = readFileSync(EVENTS_FILE, "utf8");
  assert.ok(!line.includes(SECRET) && !line.includes("Claude needs"), line);
  assert.deepEqual(Object.keys(readEvents()[0]).sort(), ["id", "kind", "need", "project", "sid", "text", "ts"]);
});

test("Notification: unknown, odd and prototype-named types are ignored", () => {
  for (const t of ["auth_success", "", "PERMISSION_PROMPT", "constructor", "__proto__", "toString", "hasOwnProperty", undefined, 7, null, ["permission_prompt"]]) assert.equal(toEvent(note(t)), null, String(t));
});

test("Notification: a subagent's wait carries its agent id and type", () => {
  const e = toEvent(note("permission_prompt", { agent_id: "a0b0c0", agent_type: "toon-crew:bob" }));
  assert.equal(e?.agentId, "a0b0c0");
  assert.equal(e?.agentType, "toon-crew:bob");
});

// Fixture events on a fixed clock.
const T0 = Date.parse("2026-10-27T10:00:00Z");
let seq = 0;
const ev = (min: number, e: Partial<BoardEvent> & Pick<BoardEvent, "kind">): BoardEvent =>
  ({ id: `e-${T0 + min * 60_000}-${(seq++).toString(16).padStart(6, "0")}`, ts: new Date(T0 + min * 60_000).toISOString(), text: "", sid: "s1", project: "acme", ...e });
const wait = (min: number, need: BoardEvent["need"], extra: Partial<BoardEvent> = {}) => ev(min, { kind: "needs-you", need, text: "x", ...extra });
const at = (min: number) => T0 + min * 60_000;
const open = (events: BoardEvent[], min = 5) => eventNeeds(events, roles, at(min)).map((n) => [n.kind, n.role ?? "", n.text]);

test("main-session wait: opens, names the manager, clears on the session's next main event", () => {
  const w = wait(0, "permission");
  assert.deepEqual(open([w]), [["permission", "doraemon", "The manager is waiting for your permission"]]);
  for (const kind of ["turn-end", "main-busy", "assign", "commit", "pr", "session-start"] as const) assert.deepEqual(open([w, ev(1, { kind })]), [], kind);
  assert.deepEqual(open([wait(0, "idle"), ev(1, { kind: "turn-end" })]), []);
});

test("a wait does not clear on usage, other waits, another session or another agent's events", () => {
  const w = wait(0, "permission");
  const others = [
    ev(1, { kind: "usage", scope: "main", rows: [] }),                                // the Stop hook's bookkeeping
    ev(1, { kind: "turn-end", sid: "s2" }),                                         // another session
    ev(1, { kind: "agent-stop", agentId: "a1", agentType: "toon-crew:bob" }),       // a subagent of the same session
    wait(1, "permission", { agentId: "a1", agentType: "toon-crew:bob" }),           // a subagent's own wait
  ];
  for (const o of others) assert.deepEqual(open([w, o]).filter((x) => x[1] === "doraemon").length, 1, o.kind);
});

test("subagent wait: named by role, cleared by that agent's next event or the session's end only", () => {
  const w = wait(0, "permission", { agentId: "a1", agentType: "toon-crew:bob" });
  assert.deepEqual(open([w]), [["permission", "bob", "Bob is waiting for your permission"]]);
  assert.equal(open([w, ev(1, { kind: "turn-end" })]).length, 1);                             // the manager moving on is not an answer
  assert.equal(open([w, ev(1, { kind: "commit", agentId: "a1" })]).length, 0);
  assert.equal(open([w, ev(1, { kind: "agent-stop", agentId: "a1" })]).length, 0);
  assert.equal(open([w, ev(1, { kind: "session-end" })]).length, 0);
  assert.equal(open([w, ev(1, { kind: "session-end", sid: "s2" })]).length, 1);
});

test("subagent role: from the log when the wait has no type; unknown agents are 'a crew member'", () => {
  const start = ev(0, { kind: "agent-start", agentId: "a2", agentType: "toon-crew:shizuka" });
  assert.deepEqual(open([start, wait(1, "agent-input", { agentId: "a2" })]), [["agent-input", "shizuka", "Shizuka is waiting for your input"]]);
  assert.deepEqual(open([wait(1, "input", { agentId: "zz9" })]), [["input", "", "A crew member is waiting for your answer"]]);
  assert.deepEqual(open([wait(1, "input", { agentId: "g1", agentType: "general-purpose" })]), [["input", "", "A crew member is waiting for your answer"]]);
});

test("a newer wait of the same waiter replaces the older one", () => {
  const items = eventNeeds([wait(0, "permission"), wait(2, "idle")], roles, at(3));
  assert.deepEqual(items.map((n) => [n.kind, n.since]), [["idle", new Date(at(2)).toISOString()]]);
});

test("ageing: stale after 30 minutes, gone after 2 hours", () => {
  const w = [wait(0, "permission")];
  assert.equal(eventNeeds(w, roles, at(0) + STALE_AFTER_MS).at(0)?.stale, undefined);
  assert.equal(eventNeeds(w, roles, at(0) + STALE_AFTER_MS + 1).at(0)?.stale, true);
  assert.equal(eventNeeds(w, roles, at(0) + DROP_AFTER_MS).length, 1);
  assert.equal(eventNeeds(w, roles, at(0) + DROP_AFTER_MS + 1).length, 0);
});

test("hand-edited or broken waits are ignored: unknown need, no session, bad time", () => {
  assert.equal(open([wait(0, "constructor" as BoardEvent["need"])]).length, 0);
  assert.equal(open([wait(0, undefined)]).length, 0);
  assert.equal(open([wait(0, "permission", { sid: undefined })]).length, 0);
  assert.equal(open([{ ...wait(0, "permission"), ts: "not a date" }]).length, 0);
});

test("wait items carry no free text and no numbers", () => {
  const items = eventNeeds([wait(0, "permission"), wait(0, "input", { sid: "s2", agentId: "a1", agentType: "toon-crew:kevin" })], roles, at(1));
  assert.equal(items.length, 2);
  for (const n of items) {
    assert.ok(!/\d/.test(n.text), n.text);
    assert.deepEqual(Object.keys(n).filter((k) => !["id", "kind", "text", "since", "project", "role", "stale"].includes(k)), []);
  }
  assert.ok(Object.values(NEED_TEXT).every((t) => !/\d/.test(t)));
});

// PR snapshots, shaped as sources.ts maps them.
const pr = (number: number, over: Partial<Pr> = {}): Pr => ({
  number, title: "t", state: "OPEN", author: "x", branch: "feat/x", updatedAt: "2026-10-27T09:00:00Z",
  url: `https://github.com/acme/shop/pull/${number}`, draft: false, checks: "pass", review: "", ...over,
});
const approved = [{ name: "acme", board: true }];

test("PR rule: open, not a draft, checks green, no changes requested; review required is said", () => {
  const prs = [
    pr(1), pr(2, { review: "REVIEW_REQUIRED" }), pr(3, { review: "APPROVED" }),
    pr(4, { draft: true }), pr(5, { state: "MERGED" }), pr(6, { state: "CLOSED" }),
    pr(7, { checks: "pending" }), pr(8, { checks: "fail" }), pr(9, { checks: "none" }), pr(10, { review: "CHANGES_REQUESTED" }),
  ];
  const items = prNeeds(approved, { acme: { prs } });
  assert.deepEqual(items.map((n) => [n.number, n.text]), [
    [1, "PR ready for you: checks green"], [2, "PR ready for you: checks green, review required"], [3, "PR ready for you: checks green"],
  ]);
  assert.deepEqual(items[0], { id: "n-pr-acme-1", kind: "pr", text: "PR ready for you: checks green", since: "2026-10-27T09:00:00Z", project: "acme", number: 1, ref: "https://github.com/acme/shop/pull/1" });
});

test("PR rule: only projects the owner approved for polling; old snapshots without checks give nothing", () => {
  const snaps = { acme: { prs: [pr(1)] }, blog: { prs: [pr(2)] }, old: { prs: [{ ...pr(3), checks: undefined, review: undefined }] } };
  assert.deepEqual(prNeeds([{ name: "acme" }, { name: "blog", board: false }], snaps), []);
  assert.deepEqual(prNeeds([{ name: "old", board: true }], snaps), []);
  assert.equal(prNeeds([{ name: "missing", board: true }], snaps).length, 0);
});

test("PR rule: a link that is not an https PR URL is dropped, the item stays", () => {
  for (const url of ["javascript:alert(1)//pull/1", "http://github.com/a/b/pull/1", "https://github.com/a/b/pull/1?x=1", "https://github.com/a/b/issues/1"]) {
    const [n] = prNeeds(approved, { acme: { prs: [pr(1, { url })] } });
    assert.equal(n.ref, undefined, url);
  }
});

test("deriveNeeds: waits and PRs together, oldest first", () => {
  const items = deriveNeeds([wait(0, "permission"), wait(20, "input", { sid: "s2" })], roles, approved, { acme: { prs: [pr(4, { updatedAt: "2026-10-27T10:10:00Z" })] } }, at(30));
  assert.deepEqual(items.map((n) => n.kind), ["permission", "pr", "input"]);
});

test("/api/state: needsYou is served, and usage / needs-you stay out of the last-300 event list", () => {
  writeFileSync(REGISTRY_FILE, "[]");
  const now = Date.now();
  appendEvent({ kind: "commit", text: "real history", project: "acme", sid: "s9" }, new Date(now - 60_000));
  appendEvent({ kind: "needs-you", need: "permission", text: NEED_TEXT.permission, project: "acme", sid: "s9" }, new Date(now - 30_000));
  for (let i = 0; i < 320; i++) appendEvent({ kind: "usage", text: "Usage update", scope: "main", final: false, partial: false, rows: [], project: "acme", sid: "s9" }, new Date(now - 20_000));
  const s = buildState(now);
  assert.deepEqual(s.events.map((e) => e.kind), ["commit"]);
  assert.deepEqual(s.needsYou.map((n) => [n.kind, n.project, n.role]), [["permission", "acme", "doraemon"]]);
  assert.ok("cost" in s);
});
