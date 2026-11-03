// The board's data folder: only an absolute CLAUDE_PLUGIN_DATA (or a developer's BOARD_LOG_DIR), never a folder the
// plugin picks itself (the old ~/.toon-crew fallback). Without one, nothing is read or written anywhere.
import "./env.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dataDirOf, NO_DATA_DIR } from "../../plugin/board/lib/paths.ts";

const BOARD = join(import.meta.dirname, "..", "..", "plugin", "board");
const fresh = (p: string) => realpathSync(mkdtempSync(join(tmpdir(), p)));

test("dataDirOf: BOARD_LOG_DIR, then CLAUDE_PLUGIN_DATA, and only an absolute folder", () => {
  assert.equal(dataDirOf({ CLAUDE_PLUGIN_DATA: "/data/toon" }), "/data/toon");
  assert.equal(dataDirOf({ BOARD_LOG_DIR: "/dev/board", CLAUDE_PLUGIN_DATA: "/data/toon" }), "/dev/board");
  for (const env of [{}, { CLAUDE_PLUGIN_DATA: "" }, { CLAUDE_PLUGIN_DATA: "rel/data" }, { CLAUDE_PLUGIN_DATA: "~/.toon-crew" },
    { BOARD_LOG_DIR: "./x", CLAUDE_PLUGIN_DATA: "/data/toon" }, { HOME: "/home/someone" }]) {
    assert.equal(dataDirOf(env), undefined, JSON.stringify(env));
  }
});

test("the stand-in folder can never be created, read or written", () => {
  assert.throws(() => mkdirSync(join(NO_DATA_DIR, "projects"), { recursive: true }), { code: "ENOTDIR" });
  assert.throws(() => writeFileSync(join(NO_DATA_DIR, "events.jsonl"), "x"), { code: "ENOTDIR" });
  assert.throws(() => readdirSync(NO_DATA_DIR), { code: "ENOTDIR" });
});

// The hook entries as Claude Code would run them, but with no data folder and a fake home: nothing lands anywhere.
function runEntry(script: string, input: string, extra: Record<string, string> = {}) {
  const home = fresh("crew-data-home-"), cwd = fresh("crew-data-cwd-");
  const env: Record<string, string> = { PATH: process.env.PATH ?? "", HOME: home, ...extra };
  const r = spawnSync(process.execPath, ["--no-warnings", join(BOARD, script)], { env, cwd, input, encoding: "utf8", timeout: 15_000 });
  return { r, home: readdirSync(home), cwd: readdirSync(cwd) };
}

test("hook.ts, limits.ts and remind.ts with no data folder write nothing to the home folder or the session folder", () => {
  const start = JSON.stringify({ hook_event_name: "SessionStart", session_id: "aaaaaaaa-1111", cwd: "/work/acme", source: "startup" });
  const reading = JSON.stringify({ v: 1, at: "2026-11-03T10:00:00.000Z", sub: true, w: [{ id: "5h", pct: 12, end: null }] });
  const stop = JSON.stringify({ hook_event_name: "Stop", session_id: "aaaaaaaa-1111", cwd: "/work/acme" });
  for (const [script, input, extra] of [["hook.ts", start, {}], ["limits.ts", stop, { TOON_CREW_LIMITS: reading }], ["remind.ts", stop, {}]] as const) {
    for (const data of [undefined, "", "rel/data"]) {
      const { r, home, cwd } = runEntry(script, input, { ...extra, ...(data === undefined ? {} : { CLAUDE_PLUGIN_DATA: data }) });
      assert.equal(r.stdout, "", `${script} ${data}`);
      assert.deepEqual(home, [], `${script} ${JSON.stringify(data)}: nothing in the home folder (no ~/.toon-crew)`);
      assert.deepEqual(cwd, [], `${script} ${JSON.stringify(data)}: nothing in the session's folder`);
    }
  }
});

test("with CLAUDE_PLUGIN_DATA set, hook.ts still writes its event there", () => {
  const data = fresh("crew-data-ok-");
  const start = JSON.stringify({ hook_event_name: "SessionStart", session_id: "aaaaaaaa-1111", cwd: "/work/acme", source: "startup" });
  const { r, home } = runEntry("hook.ts", start, { CLAUDE_PLUGIN_DATA: data });
  assert.equal(r.status, 0);
  assert.deepEqual(home, []);
  assert.ok(readdirSync(data).includes("events.jsonl"), readdirSync(data).join(","));
});
