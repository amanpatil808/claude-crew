// hooks.json shape for the board: the one async Notification entry matches the hook's own allow-list,
// and the guard's blocking PreToolUse entry is untouched.
import "./env.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NEED_OF } from "../lib/events.ts";

interface Hook { type: string; command: string; async?: boolean; timeout?: number; onFailure?: string }
interface Group { matcher?: string; hooks: Hook[] }
const file = join(import.meta.dirname, "..", "..", "hooks", "hooks.json");
const { hooks } = JSON.parse(readFileSync(file, "utf8")) as { hooks: Record<string, Group[]> };
const BOARD = 'node --no-warnings "${CLAUDE_PLUGIN_ROOT}/board/hook.ts"';

test("Notification: one async board entry whose matcher is exactly the hook's allow-list", () => {
  assert.equal(hooks.Notification?.length, 1);
  const [group] = hooks.Notification;
  assert.deepEqual(group.hooks, [{ type: "command", command: BOARD, async: true }]);
  assert.deepEqual((group.matcher ?? "").split("|").sort(), [...NEED_OF.keys()].sort());
});

test("every board hook entry is async, so logging can never slow or block a session", () => {
  for (const [event, groups] of Object.entries(hooks)) for (const g of groups) for (const h of g.hooks)
    if (h.command.includes("/board/hook.ts")) assert.equal(h.async, true, event);
});

test("the guard's PreToolUse entry is unchanged: blocking, with a timeout, failing closed", () => {
  assert.equal(hooks.PreToolUse.length, 1);
  const [guard] = hooks.PreToolUse[0].hooks;
  assert.equal(guard.command, 'node --no-warnings "${CLAUDE_PLUGIN_ROOT}/hooks/guard.mjs"');
  assert.deepEqual([guard.async, guard.timeout, guard.onFailure], [undefined, 10, "block"]);
});
