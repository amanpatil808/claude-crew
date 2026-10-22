// Polls each registered project's optional sources on a timer, keeps the latest snapshot per project, and turns
// real changes (a CI run finishing, a new deploy result, a commit no hook saw) into timeline events.
// A project with no .claude/crew/project.md Board section has no poller. The first poll only records
// what exists, so starting the server never floods the log.
import { existsSync, readFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { projectStateDir } from "./paths.ts";
import { writePrivate } from "./private-fs.ts";
import { appendEvent, readEvents } from "./events.ts";
import { configFor } from "./project-config.ts";
import { projectKey, readRegistry, type Project } from "./projects.ts";
import { box, ciRuns, commits, pullRequests, type AppError, type CiRun, type Commit, type Deploy, type Pr } from "./sources.ts";

export interface Snapshot {
  polledAt: { github?: string; box?: string };
  ci: CiRun[]; prs: Pr[]; commits: Record<string, Commit[]>;
  deploy: Deploy | null; errors: AppError[];
  problems: Record<string, string>;      // source -> last failure, shown on the page instead of silently stale data
}

interface Seen { ci: number[]; prs: string[]; commits: string[]; deploy: string; seeded: { github: boolean; box: boolean } }

export const emptySnapshot = (): Snapshot => ({ polledAt: {}, ci: [], prs: [], commits: {}, deploy: null, errors: [], problems: {} });

const readJson = <T>(file: string, fallback: T): T => { try { return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : fallback; } catch { return fallback; } };
// Write to a temp file and rename, so the page never reads a half-written snapshot.
const writeJson = (file: string, value: unknown) => { writePrivate(`${file}.tmp`, JSON.stringify(value, null, 1)); renameSync(`${file}.tmp`, file); };

const stateFile = (p: Project) => join(projectStateDir(projectKey(p.path)), "state.json");
const seenFile = (p: Project) => join(projectStateDir(projectKey(p.path)), "seen.json");
export const loadSnapshot = (p: Project): Snapshot => ({ ...emptySnapshot(), ...readJson<Partial<Snapshot>>(stateFile(p), {}) });
const loadSeen = (p: Project): Seen => ({ ci: [], prs: [], commits: [], deploy: "", seeded: { github: false, box: false }, ...readJson<Partial<Seen>>(seenFile(p), {}) });

export async function pollGithub(p: Project): Promise<void> {
  if (!p.board) return;     // the owner has not approved polling for this project
  const cfg = configFor(p);
  if (!cfg.github) return;
  const repo = cfg.github, snap = loadSnapshot(p), seen = loadSeen(p);
  const emit = seen.seeded.github;
  const mine = () => readEvents().filter((e) => e.project === p.name);
  await step(snap, "ci", async () => {
    snap.ci = await ciRuns(repo, p.path);
    for (const r of snap.ci.filter((r) => r.status === "completed" && !seen.ci.includes(r.id))) {
      if (emit) appendEvent({ project: p.name, kind: "ci", text: `CI ${r.workflow} on ${r.branch}: ${r.conclusion}`, ref: String(r.id), ok: r.conclusion === "success" });
      seen.ci.push(r.id);
    }
  });
  await step(snap, "prs", async () => {
    snap.prs = await pullRequests(repo, p.path);
    for (const pr of snap.prs) {
      const key = `${pr.number}:${pr.state}`;
      if (seen.prs.includes(key)) continue;
      // A PR a hook already logged (opened or merged from a Claude session) is not repeated.
      const logged = mine().some((e) => e.kind === "pr" && (e.ref === pr.url || e.ref === `#${pr.number}`) && e.text.toLowerCase().includes(pr.state === "MERGED" ? "merged" : pr.state === "CLOSED" ? "closed" : "opened"));
      if (emit && !logged) appendEvent({ project: p.name, kind: "pr", text: `PR #${pr.number} ${pr.state.toLowerCase()}: ${pr.title}`, ref: pr.url });
      seen.prs.push(key);
    }
  });
  await step(snap, "git", async () => {
    snap.commits = await commits(p.path, cfg.branches);
    const hooked = new Set(mine().filter((e) => e.kind === "commit").map((e) => e.ref));
    for (const [branch, list] of Object.entries(snap.commits)) {
      for (const c of [...list].reverse()) {
        if (seen.commits.includes(c.sha)) continue;
        if (emit && !hooked.has(c.short) && ![...hooked].some((h) => h && c.sha.startsWith(h))) appendEvent({ project: p.name, kind: "commit", text: `Commit ${c.short} on ${branch} by ${c.author}: ${c.subject}`, ref: c.short });
        seen.commits.push(c.sha);
      }
    }
  });
  snap.polledAt.github = new Date().toISOString();
  seen.seeded.github = true;
  trim(seen);
  writeJson(stateFile(p), snap);
  writeJson(seenFile(p), seen);
}

export async function pollBox(p: Project): Promise<void> {
  if (!p.board) return;
  const cfg = configFor(p);
  if (!cfg.deploy) return;
  const target = cfg.deploy, snap = loadSnapshot(p), seen = loadSeen(p);
  await step(snap, "box", async () => {
    const { deploy, errors } = await box(target);
    snap.deploy = deploy;
    snap.errors = errors;
    if (deploy.raw && deploy.raw !== seen.deploy) {
      if (seen.seeded.box) appendEvent({ project: p.name, kind: "deploy", text: `Deploy ${deploy.status} ${deploy.version}${deploy.detail ? `: ${deploy.detail}` : ""}`, ref: deploy.version, ok: deploy.status === "ok" });
      seen.deploy = deploy.raw;
    }
    seen.seeded.box = true;
  });
  snap.polledAt.box = new Date().toISOString();
  writeJson(stateFile(p), snap);
  writeJson(seenFile(p), seen);
}

// A failing source keeps its last good data and reports why, instead of blanking the page.
async function step(snap: Snapshot, name: string, fn: () => Promise<void>): Promise<void> {
  try { await fn(); delete snap.problems[name]; }
  catch (err) { snap.problems[name] = `${new Date().toISOString()} ${String((err as Error).message ?? err).slice(0, 240)}`; }
}

function trim(seen: Seen) { seen.ci = seen.ci.slice(-300); seen.prs = seen.prs.slice(-300); seen.commits = seen.commits.slice(-600); }

// Overlapping polls would race on the state files, so each loop waits for its previous round and the two
// pollers are chained through one queue. The registry is re-read each round, so a new project is picked up
// without a restart. The box is polled every 2 min: each poll is an ssh login there.
export function startPolling(githubMs = 60_000, boxMs = 120_000): () => void {
  const loop = (fn: (p: Project) => Promise<void>, ms: number) => {
    let stopped = false, timer: NodeJS.Timeout | undefined;
    const tick = async () => {
      try { for (const p of readRegistry()) await enqueue(() => fn(p)).catch(() => undefined); }
      finally { if (!stopped) timer = setTimeout(tick, ms); }
    };
    void tick();
    return () => { stopped = true; clearTimeout(timer); };
  };
  let queue = Promise.resolve();
  const enqueue = (fn: () => Promise<void>) => (queue = queue.then(fn, fn));
  const stops = [loop(pollGithub, githubMs), loop(pollBox, boxMs)];
  return () => stops.forEach((s) => s());
}
