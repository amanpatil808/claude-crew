// F8: hand-back files older than 60 days go from the SessionStart hook, at most once a day, with no board running.
import "./env.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DAY_MS, pruneIfDue, PRUNE_STAMP } from "../lib/handbacks.ts";
import { SERVER_FILE } from "../lib/paths.ts";

const HOOK = join(import.meta.dirname, "..", "hook.ts");
const fresh = () => realpathSync(mkdtempSync(join(tmpdir(), "crew-daily-prune-")));
const put = (file: string, ageDays: number, now = Date.now()) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, "Verdict: done\n");
  const t = (now - ageDays * DAY_MS) / 1000;
  utimesSync(file, t, t);
  return file;
};
const summary = (data: string, name: string) => join(data, "projects", "shop-1234", "handbacks", "summaries", "kevin", `${name}.md`);
const runHook = (data: string, event = "SessionStart") => spawnSync(process.execPath, ["--no-warnings", HOOK], {
  input: JSON.stringify({ hook_event_name: event, session_id: "sess-1234", cwd: data, source: "startup" }),
  env: { ...process.env, CLAUDE_PLUGIN_DATA: data, CLAUDE_PROJECT_DIR: "" }, encoding: "utf8", timeout: 20_000,
});

test("the SessionStart hook prunes 61-day-old hand-backs with no board running, once a day", () => {
  const data = fresh();
  assert.equal(existsSync(SERVER_FILE), false, "no board server");
  const old = put(summary(data, "20260801-old"), 61), today = put(summary(data, "20261101-new"), 0);
  const r = runHook(data);
  assert.equal(r.status, 0);
  assert.equal(r.stdout + r.stderr, "", "the hook prints nothing");
  assert.equal(existsSync(old), false, "61 days old: gone");
  assert.equal(existsSync(today), true);
  assert.ok(Number(readFileSync(join(data, PRUNE_STAMP), "utf8")) > Date.now() - 60_000, "stamp written");

  const again = put(summary(data, "20260802-old"), 70);
  assert.equal(runHook(data).status, 0);
  assert.equal(existsSync(again), true, "the second session the same day does not sweep");
  assert.equal(runHook(data, "Stop").status, 0);
  assert.equal(existsSync(again), true, "other hook events never sweep");
});

test("pruneIfDue: due with no stamp, after a day, or with a stamp from the future; never through a linked stamp", () => {
  const data = fresh(), now = Date.parse("2026-11-01T12:00:00Z");
  const a = put(summary(data, "a"), 61, now);
  assert.deepEqual(pruneIfDue(data, now), { files: 1, dirs: 1 });
  assert.equal(existsSync(a), false);
  const b = put(summary(data, "b"), 61, now);
  assert.equal(pruneIfDue(data, now + DAY_MS - 1), null, "less than a day later");
  assert.equal(existsSync(b), true);
  assert.deepEqual(pruneIfDue(data, now + DAY_MS), { files: 1, dirs: 1 }, "a day later");
  writeFileSync(join(data, PRUNE_STAMP), String(now + 10 * DAY_MS));
  const c = put(summary(data, "c"), 61, now);
  assert.equal(pruneIfDue(data, now)?.files, 1, "a stamp in the future does not stop the prune for days");
  assert.equal(existsSync(c), false);
  writeFileSync(join(data, PRUNE_STAMP), "junk");
  assert.notEqual(pruneIfDue(data, now), null, "an unreadable stamp: due");

  const linked = fresh(), target = join(fresh(), "target.txt");
  writeFileSync(target, "keep me");
  symlinkSync(target, join(linked, PRUNE_STAMP));
  const d = put(summary(linked, "d"), 61, now);
  assert.equal(pruneIfDue(linked, now), null);
  assert.equal(readFileSync(target, "utf8"), "keep me", "the link is not followed");
  assert.equal(existsSync(d), true);
  assert.equal(pruneIfDue(join(linked, "missing"), now), null, "no data folder: nothing");
});
