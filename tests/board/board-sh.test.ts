// board.sh builds paths only under the plugin root and the data folder, and only stops its own board server.
import "./env.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BOARD_SH = join(import.meta.dirname, "..", "..", "plugin", "board", "board.sh");
const PLUGIN_ROOT = realpathSync(join(import.meta.dirname, "..", "..", "plugin"));
const fresh = (p: string) => realpathSync(mkdtempSync(join(tmpdir(), p)));
const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const sh = (args: string[], env: Record<string, string>, cwd?: string) =>
  spawnSync("bash", [BOARD_SH, ...args], { encoding: "utf8", env: { PATH: process.env.PATH ?? "", ...env }, cwd, timeout: 20_000 });

test("without an absolute data folder every command but handbacks is refused, and nothing is created (no ~/.toon-crew)", () => {
  const home = fresh("crew-sh-home-"), cwd = fresh("crew-sh-cwd-");
  try {
    for (const data of [undefined, "", "rel/data"]) for (const cmd of [["status"], ["stop"], ["start"], ["export", "--dry"], ["task", "list"]]) {
      const r = sh(cmd, { HOME: home, BOARD_PORT: "1", ...(data === undefined ? {} : { CLAUDE_PLUGIN_DATA: data }) }, cwd);
      assert.equal(r.status, 2, `${cmd.join(" ")} ${JSON.stringify(data)}: ${r.stdout}${r.stderr}`);
      assert.match(r.stdout, /^CLAUDE_PLUGIN_DATA is not set to an absolute folder\./);
    }
    assert.deepEqual(readdirSync(home), [], "nothing in the home folder");
    assert.deepEqual(readdirSync(cwd), [], "nothing in the current folder");
  } finally {
    // Old code started a real server under <home>/.toon-crew: never leave one behind.
    const sj = join(home, ".toon-crew", "server.json");
    if (existsSync(sj)) try { process.kill(JSON.parse(readFileSync(sj, "utf8")).pid); } catch { /* gone */ }
  }
});

test("node gets the plugin root of board.sh's own folder, never an inherited CLAUDE_PLUGIN_ROOT", () => {
  const bin = fresh("crew-sh-bin-"), log = join(bin, "calls.log"), data = fresh("crew-sh-data-");
  // A stand-in node that records what board.sh hands it and runs nothing.
  writeFileSync(join(bin, "node"), '#!/bin/bash\nprintf "root=%s log=%s args=%s\\n" "$CLAUDE_PLUGIN_ROOT" "$BOARD_LOG_DIR" "$*" >> "$FAKE_NODE_LOG"\n');
  chmodSync(join(bin, "node"), 0o755);
  const env = { PATH: `${bin}:${process.env.PATH ?? ""}`, FAKE_NODE_LOG: log, CLAUDE_PLUGIN_DATA: data };
  for (const inherited of [undefined, "/somewhere/else", "relative/root"]) {
    writeFileSync(log, "");
    const r = sh(["task", "list"], { ...env, ...(inherited === undefined ? {} : { CLAUDE_PLUGIN_ROOT: inherited }) });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(readFileSync(log, "utf8"), `root=${PLUGIN_ROOT} log=${data} args=--no-warnings ${PLUGIN_ROOT}/board/task.ts list\n`, String(inherited));
  }
});

test("stop and status never act on a pid in server.json that is not a board server", async () => {
  const data = fresh("crew-sh-pid-");
  const other = spawn("sleep", ["30"], { stdio: "ignore" });
  try {
    assert.ok(other.pid && alive(other.pid));
    writeFileSync(join(data, "server.json"), JSON.stringify({ pid: other.pid, port: 1 }));
    assert.equal(sh(["status"], { BOARD_LOG_DIR: data }).stdout, "not running\n");
    const r = sh(["stop"], { BOARD_LOG_DIR: data });
    assert.equal(r.stdout, "not running\n");
    await new Promise((ok) => setTimeout(ok, 100));
    assert.ok(alive(other.pid!), "the unrelated process is still running");
    assert.ok(!existsSync(join(data, "server.json")), "the stale file is removed");
    // Odd pids are refused before kill -0: none of these may signal anything.
    for (const pid of [0, 1, -1, "1; touch x", 2.5]) {
      writeFileSync(join(data, "server.json"), JSON.stringify({ pid }));
      assert.equal(sh(["stop"], { BOARD_LOG_DIR: data }).stdout, "not running\n", String(pid));
    }
  } finally { other.kill(); }
});

test("start, status and stop still work end to end on a real board server", async () => {
  const data = fresh("crew-sh-e2e-");
  mkdirSync(data, { recursive: true });
  const env = { BOARD_LOG_DIR: data, BOARD_REGISTRY_FILE: join(data, "projects.json"), BOARD_PORT: String(20000 + Math.floor(Math.random() * 20000)), HOME: fresh("crew-sh-home2-") };
  const start = sh(["start"], env);
  let pid = 0;
  try {
    assert.equal(start.status, 0, start.stdout + start.stderr);
    pid = JSON.parse(start.stdout).pid;
    assert.ok(alive(pid));
    assert.match(sh(["status"], env).stdout, /^running: \{"pid":/);
    assert.match(sh(["start"], env).stdout, /^already running \(pid \d+\)/);
    assert.equal(sh(["stop"], env).stdout, `stopped pid ${pid}\n`);
    for (let i = 0; i < 50 && alive(pid); i++) await new Promise((ok) => setTimeout(ok, 50));
    assert.ok(!alive(pid), "the board server stopped");
    assert.deepEqual(readdirSync(env.HOME), [], "nothing in the home folder");
  } finally { if (pid && alive(pid)) process.kill(pid); }
});
