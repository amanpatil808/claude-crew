// The board's data folder: only an absolute CLAUDE_PLUGIN_DATA, never a folder the plugin picks itself (the old
// ~/.toon-crew fallback). A developer's BOARD_LOG_DIR is board.sh's alone. Without one, nothing is read or written.
import "./env.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { dataDirOf, insideNoDataDir, NO_DATA_DIR } from "../../plugin/board/lib/paths.ts";
import { ensureDir, writePrivate } from "../../plugin/board/lib/private-fs.ts";
import { ensureHandbacks } from "../../plugin/board/lib/handbacks.ts";
import { configDirOf, transcriptRoot } from "../../plugin/board/lib/usage.ts";

const BOARD = join(import.meta.dirname, "..", "..", "plugin", "board");
const fresh = (p: string) => realpathSync(mkdtempSync(join(tmpdir(), p)));

test("dataDirOf: only an absolute CLAUDE_PLUGIN_DATA, never BOARD_LOG_DIR", () => {
  assert.equal(dataDirOf({ CLAUDE_PLUGIN_DATA: "/data/toon" }), "/data/toon");
  assert.equal(dataDirOf({ BOARD_LOG_DIR: "/dev/board", CLAUDE_PLUGIN_DATA: "/data/toon" }), "/data/toon");
  for (const env of [{}, { CLAUDE_PLUGIN_DATA: "" }, { CLAUDE_PLUGIN_DATA: "rel/data" }, { CLAUDE_PLUGIN_DATA: "~/.toon-crew" },
    { BOARD_LOG_DIR: "/dev/board" }, { BOARD_LOG_DIR: "./x", CLAUDE_PLUGIN_DATA: "rel" }, { HOME: "/home/someone" }]) {
    assert.equal(dataDirOf(env), undefined, JSON.stringify(env));
  }
});

test("the stand-in folder can never be created, read or written", () => {
  assert.throws(() => mkdirSync(join(NO_DATA_DIR, "projects"), { recursive: true }), { code: "ENOTDIR" });
  assert.throws(() => writeFileSync(join(NO_DATA_DIR, "events.jsonl"), "x"), { code: "ENOTDIR" });
  assert.throws(() => readdirSync(NO_DATA_DIR), { code: "ENOTDIR" });
});

// Where /dev/null is not a device file (Windows), mkdir would make the stand-in: the helpers refuse it first,
// with their own error, before any mkdir (an ENOTDIR here would mean the refusal was skipped).
test("ensureDir, writePrivate and ensureHandbacks refuse the stand-in and anything under it", () => {
  const refused = { message: "no data folder" };
  for (const dir of [NO_DATA_DIR, join(NO_DATA_DIR, "projects", "x"), `${NO_DATA_DIR}/`, join(NO_DATA_DIR, "a", "..", "b"), join(NO_DATA_DIR, "..", "toon-crew-no-data-folder", "x")]) {
    assert.ok(insideNoDataDir(dir), dir);
    assert.throws(() => ensureDir(dir), refused, dir);
  }
  assert.throws(() => writePrivate(join(NO_DATA_DIR, "limits.json"), "{}"), refused);
  assert.throws(() => ensureHandbacks(NO_DATA_DIR, "shop-1234"), refused);
  for (const dir of ["/dev/null/toon-crew-no-data-folder-2", "/dev/null", "/data/toon", join(NO_DATA_DIR, "..")]) assert.ok(!insideNoDataDir(dir), dir);
  const ok = join(fresh("crew-data-ensure-"), "a", "b");
  ensureDir(ok);
  assert.ok(existsSync(ok));
});

// Claude Code's config folder (transcripts, settings.json): absolute only, like the data folder.
test("transcriptRoot and configDirOf never resolve a relative CLAUDE_CONFIG_DIR", () => {
  const saved = process.env.CLAUDE_CONFIG_DIR;
  try {
    for (const rel of ["rel/cfg", "./cfg", "~/.claude"]) {
      process.env.CLAUDE_CONFIG_DIR = rel;
      assert.equal(configDirOf({ CLAUDE_CONFIG_DIR: rel }), undefined, rel);
      const root = transcriptRoot();
      assert.ok(isAbsolute(root) && !root.startsWith(process.cwd()), `${rel}: ${root}`);
      assert.throws(() => readdirSync(root), rel);
    }
    process.env.CLAUDE_CONFIG_DIR = "/cfg/claude";
    assert.equal(transcriptRoot(), join("/cfg/claude", "projects"));
    process.env.CLAUDE_CONFIG_DIR = "";
    assert.ok(transcriptRoot().endsWith(join(".claude", "projects")));
  } finally { process.env.CLAUDE_CONFIG_DIR = saved; }
});

// A BOARD_LOG_DIR left in a session's environment must not move the hooks' files out of the data folder.
test("hook.ts, limits.ts and remind.ts ignore BOARD_LOG_DIR and write only under CLAUDE_PLUGIN_DATA", () => {
  const start = JSON.stringify({ hook_event_name: "SessionStart", session_id: "aaaaaaaa-1111", cwd: "/work/acme", source: "startup" });
  const reading = JSON.stringify({ v: 1, at: "2026-11-03T10:00:00.000Z", sub: true, w: [{ id: "5h", pct: 12, end: null }] });
  const stop = JSON.stringify({ hook_event_name: "Stop", session_id: "aaaaaaaa-1111", cwd: "/work/acme" });
  const cases = [["hook.ts", start, {}, "events.jsonl"], ["limits.ts", stop, { TOON_CREW_LIMITS: reading }, "limits.json"], ["remind.ts", stop, {}, ""]] as const;
  for (const [script, input, extra, expected] of cases) {
    for (const withData of [true, false]) {
      const data = fresh("crew-data-real-"), other = fresh("crew-data-dev-");
      const { r } = runEntry(script, input, { ...extra, BOARD_LOG_DIR: other, ...(withData ? { CLAUDE_PLUGIN_DATA: data } : {}) });
      assert.equal(r.status, 0, `${script}: ${r.stderr}`);
      assert.deepEqual(readdirSync(other), [], `${script} (data folder ${withData ? "set" : "unset"}): nothing under BOARD_LOG_DIR`);
      if (withData && expected) assert.ok(readdirSync(data).includes(expected), `${script}: ${readdirSync(data).join(",")}`);
      if (!withData) assert.deepEqual(readdirSync(data), [], script);
    }
  }
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
