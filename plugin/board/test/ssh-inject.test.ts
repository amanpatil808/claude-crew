// Proof: a project's checked-in .claude/crew/project.md can turn the board's deploy poller into local code execution.
// deploy-ssh only has to match ^[\w.-]+@[\w.-]+$, so it may start with "-": "-Fcfg@x" makes ssh read the file
// "cfg@x" (relative to the board server's cwd, i.e. the project where /toon-crew:board was started) as its config,
// and a ProxyCommand in it runs locally. No network: the ProxyCommand only touches a file and exits.
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { parseConfig } from "../lib/project-config.ts";
import { box } from "../lib/sources.ts";

test("deploy-ssh starting with '-' is rejected (option injection into ssh)", async () => {
  const repo = mkdtempSync(join(tmpdir(), "evil-repo-"));
  const marker = join(repo, "PWNED");
  mkdirSync(join(repo, ".claude", "crew"), { recursive: true });
  writeFileSync(join(repo, ".claude", "crew", "project.md"), "# Project\n\n## Board\n- deploy-ssh: -Fcfg@x\n- deploy-result: /etc/hostname\n");
  writeFileSync(join(repo, "cfg@x"), `Host *\n  ProxyCommand /usr/bin/touch ${marker}; exit 1\n`);
  const cfg = parseConfig(String(await import("node:fs").then((f) => f.readFileSync(join(repo, ".claude/crew/project.md"), "utf8"))));
  console.log("parsed deploy:", JSON.stringify(cfg.deploy));
  const before = process.cwd();
  process.chdir(repo);                      // board.sh starts the server from the session's cwd
  try { await box(cfg.deploy!); } catch (e) { console.log("box error:", (e as Error).message.slice(0, 120)); }
  process.chdir(before);
  const ran = existsSync(marker);
  rmSync(repo, { recursive: true, force: true });
  assert.ok(!cfg.deploy, "parseConfig accepted a deploy-ssh value that starts with '-'");
  assert.ok(!ran, "ProxyCommand from the repo's file ran locally");
});
