// What the board may poll for a project, read from the "## Board" section of .claude/crew/project.md:
//   ## Board
//   - github: owner/repo
//   - branches: main, feat/x           (optional, default main)
//   - deploy-ssh: user@host            (optional; with deploy-result the deploy poller runs)
//   - deploy-result: /var/lib/app/result
//   - deploy-log: ~/app/deploy.log     (optional)
//   - deploy-containers: app-api-1, app-worker-1   (optional: recent error lines)
// Every value is checked against a strict pattern because it ends up in a command line.
// Nothing is polled unless the owner set `board: true` on the project in the registry (see projects.ts).
import { existsSync, readFileSync } from "node:fs";
import { notesFile, type Project } from "./projects.ts";

export interface ProjectConfig { github?: string; branches: string[]; deploy?: { ssh: string; result: string; log?: string; containers: string[] } }

const REPO = /^[\w.-]+\/[\w.-]+$/, BRANCH = /^[\w./-]+$/, HOST = /^(?!-)[\w.-]+@[\w.-]+$/, PATH = /^(?:~|\/)[\w./~-]*$/, NAME = /^[\w.-]+$/;
const list = (v: string | undefined) => (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);

export function parseConfig(markdown: string): ProjectConfig {
  const section = markdown.split(/^## /m).find((s) => /^Board\b/i.test(s)) ?? "";
  const kv = new Map<string, string>();
  for (const line of section.split("\n")) {
    const m = line.match(/^\s*[-*]?\s*([a-z-]+)\s*:\s*(.+?)\s*$/i);
    if (m) kv.set(m[1].toLowerCase(), m[2].replace(/`/g, ""));
  }
  const github = kv.get("github");
  const ssh = kv.get("deploy-ssh"), result = kv.get("deploy-result"), log = kv.get("deploy-log");
  const branches = list(kv.get("branches")).filter((b) => BRANCH.test(b));
  return {
    github: github && REPO.test(github) ? github : undefined,
    branches: branches.length ? branches : ["main"],
    deploy: ssh && result && HOST.test(ssh) && PATH.test(result)
      ? { ssh, result, log: log && PATH.test(log) ? log : undefined, containers: list(kv.get("deploy-containers")).filter((c) => NAME.test(c)) }
      : undefined,
  };
}

// No notes file, or no Board section: nothing to poll.
export function configFor(p: Project): ProjectConfig {
  try { return existsSync(notesFile(p)) ? parseConfig(readFileSync(notesFile(p), "utf8")) : { branches: ["main"] }; } catch { return { branches: ["main"] }; }
}
