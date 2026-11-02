import "./env.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { isOverride, normalizeModel, resolveModel } from "../../plugin/board/lib/model.ts";
import { toEvent } from "../../plugin/board/hook.ts";
import { roleNotes, roomMembers } from "../../plugin/board/lib/room.ts";
import { loadRoles } from "../../plugin/board/lib/crew.ts";
import type { BoardEvent } from "../../plugin/board/lib/events.ts";

const none = {};
const ev = (o: Partial<BoardEvent>): BoardEvent => ({ id: "e-1", ts: "2026-10-23T10:00:00Z", kind: "assign", text: "", ...o }) as BoardEvent;

test("normalizeModel keeps the family word and drops inherit", () => {
  assert.equal(normalizeModel("Sonnet"), "sonnet");
  assert.equal(normalizeModel("claude-opus-5-5"), "opus");
  assert.equal(normalizeModel("inherit"), undefined);
  assert.equal(normalizeModel(undefined), undefined);
});

test("precedence: call > file > env > main", () => {
  const env = { CLAUDE_CODE_SUBAGENT_MODEL: "haiku" };
  assert.deepEqual([resolveModel("opus", "sonnet", env).effective, resolveModel("opus", "sonnet", env).source], ["opus", "call"]);
  assert.deepEqual([resolveModel(undefined, "sonnet", env).effective, resolveModel(undefined, "sonnet", env).source], ["sonnet", "file"]);
  assert.deepEqual([resolveModel(undefined, "inherit", env).effective, resolveModel(undefined, "inherit", env).source], ["haiku", "env"]);
  assert.deepEqual([resolveModel(undefined, undefined, none).effective, resolveModel(undefined, undefined, none).source], ["main", "main"]);
});

test("override flag: only when the call differs from the file", () => {
  assert.equal(isOverride("haiku", "sonnet"), true);
  assert.equal(isOverride("sonnet", "sonnet"), false);
  assert.equal(isOverride(undefined, "sonnet"), false);
  assert.equal(isOverride("haiku", undefined), true);
});

test("the Agent hook event records asked, declared and effective models", () => {
  const post = (input: Record<string, unknown>) => toEvent({ hook_event_name: "PostToolUse", session_id: "s", cwd: "/x", tool_name: "Agent", tool_input: input }, () => false, () => undefined, none);
  const leak = post({ subagent_type: "toon-crew:bob", description: "build", model: "haiku" });
  assert.deepEqual([leak?.model, leak?.declaredModel, leak?.effectiveModel], ["haiku", "sonnet", "haiku"]);
  const plain = post({ subagent_type: "bob", description: "build" });
  assert.deepEqual([plain?.model, plain?.declaredModel, plain?.effectiveModel], [undefined, "sonnet", "sonnet"]);
  const inherit = post({ subagent_type: "nobita", description: "design" });
  assert.deepEqual([inherit?.declaredModel, inherit?.effectiveModel], [undefined, "main"]);
});

test("the desk shows the model it ran on and flags an override; old events still render", () => {
  const roles = loadRoles(), cards = [{ id: "bob", model: "sonnet" }, { id: "kevin", model: "opus" }];
  const events = [
    ev({ to: "bob", text: "build", model: "haiku", declaredModel: "sonnet", effectiveModel: "haiku" }),
    ev({ to: "kevin", text: "old event", model: "sonnet" }),   // before declaredModel/effectiveModel existed
  ];
  const ms = roomMembers([], ["bob", "kevin", "olaf"], false, roleNotes(events, roles), cards);
  const get = (id: string) => ms.find((m) => m.id === id);
  assert.deepEqual([get("bob")?.ranOn, get("bob")?.modelOverride, get("bob")?.fileModel], ["haiku", "haiku", "sonnet"]);
  assert.deepEqual([get("kevin")?.ranOn, get("kevin")?.modelOverride, get("kevin")?.fileModel], ["sonnet", "sonnet", "opus"]);
  assert.deepEqual([get("olaf")?.ranOn, get("olaf")?.modelOverride], [undefined, undefined]);
});
