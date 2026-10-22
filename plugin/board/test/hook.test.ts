// Checks the hook turns real hook payload shapes into the right events and ignores everything else.
import "./env.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { toEvent as rawToEvent } from "../hook.ts";
import { crewFrom, loadRoles, roleFor } from "../lib/crew.ts";

// Every test runs with an explicit project folder, whatever the machine running the tests has set.
const ENV = { CLAUDE_PROJECT_DIR: "/work/acme" };
type Args = Parameters<typeof rawToEvent>;
const toEvent = (input: Args[0], due?: Args[1], lookup?: Args[2]) => rawToEvent(input, due, lookup, ENV);

const base = { session_id: "a9dd6b0f-d51f-4f3d", transcript_path: "/x", cwd: "/tmp" };

test("subagent start and stop", () => {
  assert.deepEqual(toEvent({ ...base, hook_event_name: "SubagentStart", agent_id: "a1", agent_type: "bob-the-builder" }),
    { project: "acme", sid: "a9dd6b0f", agentId: "a1", agentType: "bob-the-builder", kind: "agent-start", text: "bob-the-builder started" });
  const stop = toEvent({ ...base, hook_event_name: "SubagentStop", agent_id: "a1", agent_type: "tom", last_assistant_message: "All 40 tests pass." });
  assert.equal(stop?.kind, "agent-stop");
  assert.equal(stop?.text, "tom finished: All 40 tests pass.");
});

test("git commit is logged only when it really committed", () => {
  const ok = toEvent({ ...base, hook_event_name: "PostToolUse", tool_name: "Bash", tool_input: { command: "git add -A && git commit -m 'fix tabs'" }, tool_response: { stdout: "[feat/ui-wow 3f9c2ab] fix tabs\n 2 files changed" } });
  assert.equal(ok?.kind, "commit");
  assert.equal(ok?.ref, "3f9c2ab");
  assert.equal(toEvent({ ...base, hook_event_name: "PostToolUse", tool_name: "Bash", tool_input: { command: "git commit --help" }, tool_response: { stdout: "usage" } }, () => false), null);
  assert.equal(toEvent({ ...base, hook_event_name: "PostToolUse", tool_name: "Bash", tool_input: { command: "ls" }, tool_response: { stdout: "" } }, () => false), null);
  // the main session's other commands leave only a heartbeat, never the command text; a sub-agent's leave nothing
  assert.deepEqual(toEvent({ ...base, hook_event_name: "PostToolUse", tool_name: "Bash", tool_input: { command: "cat secrets.txt" }, tool_response: { stdout: "x" } }, () => true)?.text, "Manager at work");
  assert.equal(toEvent({ ...base, agent_id: "a1", hook_event_name: "PostToolUse", tool_name: "Bash", tool_input: { command: "ls" }, tool_response: { stdout: "" } }, () => true), null);
});

test("gh pr create and merge; read-only gh pr ignored", () => {
  const pr = toEvent({ ...base, hook_event_name: "PostToolUse", tool_name: "Bash", tool_input: { command: "gh pr create --fill" }, tool_response: { stdout: "https://github.com/o/r/pull/42\n" } });
  assert.equal(pr?.text, "Opened PR #42");
  assert.equal(toEvent({ ...base, hook_event_name: "PostToolUse", tool_name: "Bash", tool_input: { command: "gh pr merge 42 --squash" }, tool_response: { stdout: "✓ Squashed and merged pull request #42" } })?.text, "Merged PR #42");
  assert.equal(toEvent({ ...base, hook_event_name: "PostToolUse", tool_name: "Bash", tool_input: { command: "gh pr list" }, tool_response: { stdout: "#42" } }, () => false), null);
});

test("crew state and role mapping", () => {
  const roles = loadRoles();
  assert.equal(roleFor("chip-and-dale", roles)?.id, "chip-and-dale");
  assert.equal(roleFor("bob-the-builder-2", roles)?.id, "bob-the-builder");
  const crew = crewFrom([
    { id: "1", ts: "2026-10-22T10:00:00Z", kind: "agent-start", text: "", agentId: "a1", agentType: "bob-the-builder" },
    { id: "2", ts: "2026-10-22T10:30:00Z", kind: "agent-stop", text: "", agentId: "a1", agentType: "bob-the-builder" },
    { id: "3", ts: "2026-10-22T10:40:00Z", kind: "agent-start", text: "", agentId: "a2", agentType: "tom" },
  ], roles);
  assert.deepEqual(crew.map((c) => [c.agentId, c.status]), [["a2", "working"], ["a1", "done"]]);
  assert.equal(crew[1].roleId, "bob-the-builder");
});

const post = (tool_name: string, tool_input: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({ ...base, hook_event_name: "PostToolUse", tool_name, tool_input, tool_response: {}, ...extra });
const known = (id: string) => (id === "a1f3" ? "shinchan" : undefined);

test("Agent and SendMessage from the main session become assign events", () => {
  const start = toEvent(post("Agent", { subagent_type: "shinchan", description: "Build the hallway", prompt: "SECRET-FULL-PROMPT" }), () => false, known);
  assert.deepEqual(start, { project: "acme", sid: "a9dd6b0f", kind: "assign", from: "doraemon", to: "shinchan", text: "Build the hallway" });
  const msg = toEvent(post("SendMessage", { to: "a1f3", summary: "keep old numbers while fetching", message: "FULL-MESSAGE-BODY" }), () => false, known);
  assert.deepEqual(msg, { project: "acme", sid: "a9dd6b0f", kind: "assign", from: "doraemon", to: "shinchan", toId: "a1f3", text: "keep old numbers while fetching" });
  assert.ok(!JSON.stringify([start, msg]).match(/SECRET-FULL|FULL-MESSAGE/));
  assert.equal(toEvent(post("SendMessage", { to: "*", summary: "hi" }), () => false, known), null);
  assert.equal(toEvent(post("Agent", { description: "no type" }), () => false, known), null);
});

test("assign text is redacted and clipped to 70 chars", () => {
  const e = toEvent(post("Agent", { subagent_type: "tom", description: "Check mail me@example.com " + "x".repeat(200) }), () => false, known);
  assert.ok(!e?.text.includes("me@example.com"));
  assert.ok((e?.text.length ?? 0) <= 70);
});

test("a stop without an agent type takes it from the log", () => {
  const stop = toEvent({ ...base, hook_event_name: "SubagentStop", agent_id: "a1f3", last_assistant_message: "Done." }, () => false, known);
  assert.equal(stop?.agentType, "shinchan");
  assert.equal(stop?.text, "shinchan finished: Done.");
});

test("an Agent model override is logged on the assign event", () => {
  const e = toEvent(post("Agent", { subagent_type: "tom", description: "Run checks", model: "Sonnet" }), () => false, known);
  assert.equal(e?.model, "sonnet");
  assert.equal(toEvent(post("Agent", { subagent_type: "tom", description: "Run checks" }), () => false, known)?.model, undefined);
});
