// [L5] Agent identity from a hook payload (or looked up in the log) must match AGENT_ID / AGENT_TYPE before it
// reaches any event, the usage event included; anything else is left out, never stored as free text.
import "./env.ts";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { loadReadUsage, toEvent, toUsage } from "../../plugin/board/hook.ts";
import { AGENT_ID, AGENT_TYPE } from "../../plugin/board/lib/events.ts";

const cfg = mkdtempSync(join(tmpdir(), "crew-hook-id-"));
process.env.CLAUDE_CONFIG_DIR = cfg;                        // the real reader's root becomes <tmp>/projects
mkdirSync(join(cfg, "projects", "w"), { recursive: true });
const file = join(cfg, "projects", "w", "agent-a1.jsonl");
writeFileSync(file, JSON.stringify({ type: "assistant", message: { id: "msg_1", model: "claude-sonnet-5-5", usage: { input_tokens: 1, output_tokens: 2 } } }) + "\n");
const env = { CLAUDE_PROJECT_DIR: "/w/shop" };
const BAD_TYPE = 'toon-crew:bob"<img src=x onerror=alert(1)>\n' + "A".repeat(4000);
const BAD_ID = "a1/../../x";
const NOT_STRING = { nested: true } as unknown as string;
const show = (v: unknown) => String(JSON.stringify(v)).slice(0, 80);
const clean = (e: { agentId?: unknown; agentType?: unknown } | null) => {
  assert.ok(e);
  assert.ok(e.agentId === undefined || (typeof e.agentId === "string" && AGENT_ID.test(e.agentId)), `agentId: ${show(e.agentId)}`);
  assert.ok(e.agentType === undefined || (typeof e.agentType === "string" && AGENT_TYPE.test(e.agentType)), `agentType: ${show(e.agentType)}`);
};

test("the patterns have one home: lib/events.ts", () => {
  assert.ok(AGENT_ID.test("a0123456789abcdef") && !AGENT_ID.test("a b") && !AGENT_ID.test("x".repeat(65)));
  assert.ok(AGENT_TYPE.test("toon-crew:kevin") && !AGENT_TYPE.test("a<b") && !AGENT_TYPE.test("x".repeat(101)));
});

test("a usage event never carries an agent_type that fails AGENT_TYPE; a bad agent_id means no event", async () => {
  const read = await loadReadUsage();
  assert.ok(read);
  const stop = { hook_event_name: "SubagentStop", session_id: "s1aaaaaa", agent_id: "a1", agent_type: BAD_TYPE, agent_transcript_path: file };
  const e = await toUsage(stop, read, () => undefined, env);
  assert.ok(e, "the clean transcript gives an event");
  clean(e);
  assert.equal(e.agentType, undefined);
  // A bad type from the log lookup is dropped the same way; a good one is kept.
  clean(await toUsage({ ...stop, agent_type: undefined }, read, () => BAD_TYPE, env));
  assert.equal((await toUsage({ ...stop, agent_type: undefined }, read, () => "toon-crew:bob", env))?.agentType, "toon-crew:bob");
  for (const agent_id of [BAD_ID, NOT_STRING, "x".repeat(65)]) assert.equal(await toUsage({ ...stop, agent_id }, read, () => undefined, env), null, show(agent_id));
});

test("every event built from the payload drops an agent id or type that fails the patterns", () => {
  const base = { session_id: "s1aaaaaa", agent_id: NOT_STRING, agent_type: BAD_TYPE };
  const inputs = [
    { ...base, hook_event_name: "Notification", notification_type: "permission_prompt" },
    { ...base, hook_event_name: "SubagentStart" },
    { ...base, hook_event_name: "SubagentStop", agent_id: BAD_ID },
    { ...base, hook_event_name: "PostToolUse", tool_name: "Bash", tool_input: { command: "git commit -m x" }, tool_response: { stdout: "[main abc1234] x" } },
  ];
  for (const input of inputs) {
    const e = toEvent(input, () => false, () => BAD_TYPE, env);
    clean(e);
    assert.ok(!JSON.stringify(e).includes("<img"), input.hook_event_name);
  }
  // A clean identity still goes through unchanged.
  const ok = toEvent({ hook_event_name: "SubagentStart", session_id: "s1aaaaaa", agent_id: "a1", agent_type: "toon-crew:bob" }, () => false, () => undefined, env);
  assert.deepEqual([ok?.agentId, ok?.agentType, ok?.text], ["a1", "toon-crew:bob", "toon-crew:bob started"]);
});

test("an assignment by a subagent names it by a checked type only", () => {
  const e = toEvent({ hook_event_name: "PostToolUse", session_id: "s1aaaaaa", agent_id: "a1", agent_type: BAD_TYPE, tool_name: "Agent",
    tool_input: { subagent_type: "toon-crew:bob", description: "build" } }, () => false, () => undefined, env);
  assert.equal(e?.from, "agent");
});
