// Polls each registered project's optional sources on a timer, keeps the latest snapshot per project, and turns
// real changes (a CI run finishing, a new deploy result, a commit no hook saw) into timeline events.
// A project with no .claude/crew/project.md Board section has no poller. The first poll only records
// what exists, so starting the server never floods the log.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, renameSync, statSync } from "node:fs";
import { join } from "node:path";
import { LOG_DIR, projectStateDir } from "./paths.ts";
import { writePrivate } from "./private-fs.ts";
import { appendEvent, readEvents } from "./events.ts";
import { configFor } from "./project-config.ts";
import { projectKey, readRegistry, type Project } from "./projects.ts";
import { box, ciRuns, commits, PR_LIMIT, pullRequests, type AppError, type CiRun, type Commit, type Deploy, type Pr } from "./sources.ts";

export interface Snapshot {
  polledAt: { github?: string; box?: string };
  ci: CiRun[]; prs: Pr[]; commits: Record<string, Commit[]>;
  deploy: Deploy | null; errors: AppError[];
  problems: Record<string, string>;      // source -> last failure, shown on the page instead of silently stale data
}

// prLimit: the PR window the `prs` memory was filled with. A wider window (10 -> 20) shows older PRs that
// already happened, so the first poll after the change records them without announcing them.
interface Seen { ci: number[]; prs: string[]; commits: string[]; deploy: string; seeded: { github: boolean; box: boolean }; prLimit?: number }

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
    const widened = (seen.prLimit ?? 10) < PR_LIMIT;
    for (const pr of snap.prs) {
      const key = `${pr.number}:${pr.state}`;
      if (seen.prs.includes(key)) continue;
      // A PR a hook already logged (opened or merged from a Claude session) is not repeated.
      const logged = mine().some((e) => e.kind === "pr" && (e.ref === pr.url || e.ref === `#${pr.number}`) && e.text.toLowerCase().includes(pr.state === "MERGED" ? "merged" : pr.state === "CLOSED" ? "closed" : "opened"));
      if (emit && !widened && !logged) appendEvent({ project: p.name, kind: "pr", text: `PR #${pr.number} ${pr.state.toLowerCase()}: ${pr.title}`, ref: pr.url });
      seen.prs.push(key);
    }
    seen.prLimit = PR_LIMIT;
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

// ---- Instant refresh: the hook leaves a small marker when the crew runs a command that changes GitHub ----
// The marker holds the project name only (never the command). The server sees the marker change and polls that
// project's GitHub at once, instead of waiting for the next timer round.
export const refreshDir = () => join(LOG_DIR, "refresh");
const REFRESH_CMD = [/\bgh\s+pr\s+(?:create|merge|close|ready|reopen)\b/, /\bgit\s+(?:-C\s+\S+\s+)?push\b/];
export const refreshWanted = (cmd: string): boolean => REFRESH_CMD.some((re) => re.test(cmd));
export function markRefresh(project: string, dir = refreshDir()): void {
  writePrivate(join(dir, `${createHash("sha256").update(project).digest("hex").slice(0, 16)}.json`), JSON.stringify({ project }));
}

interface Watch { dir?: string; registry?: () => Project[]; poll?: (p: Project) => Promise<void>; debounceMs?: number; everyMs?: number }

// Looks at the marker folder once a second. A changed marker starts one debounced poll for that project (markers
// changing inside the window share it); a marker that changes during a poll queues exactly one more, so at most
// one poll per project runs at a time. Only projects with board: true are polled.
export function watchRefresh({ dir = refreshDir(), registry = readRegistry, poll = pollGithub, debounceMs = 1000, everyMs = 1000 }: Watch = {}): () => void {
  const mtimes = new Map<string, number>(), due = new Set<string>(), running = new Set<string>(), again = new Set<string>();
  let timer: NodeJS.Timeout | undefined, stopped = false;
  const scan = (fire: boolean) => {
    let files: string[] = [];
    try { files = readdirSync(dir).filter((f) => f.endsWith(".json")); } catch { return; }
    for (const f of files) {
      let at: number;
      try { at = statSync(join(dir, f)).mtimeMs; } catch { continue; }
      const before = mtimes.get(f);
      mtimes.set(f, at);
      if (!fire || before === at) continue;
      try { const name = (JSON.parse(readFileSync(join(dir, f), "utf8")) as { project?: unknown }).project; if (typeof name === "string") due.add(name); } catch { /* a torn marker: the next write fixes it */ }
    }
    if (due.size && !timer) timer = setTimeout(flush, debounceMs);
  };
  const go = (p: Project) => {
    if (running.has(p.name)) { again.add(p.name); return; }
    running.add(p.name);
    poll(p).catch(() => undefined).finally(() => { running.delete(p.name); if (again.delete(p.name) && !stopped) go(p); });
  };
  const flush = () => {
    timer = undefined;
    const names = [...due]; due.clear();
    if (!stopped) for (const p of registry()) if (p.board && names.includes(p.name)) go(p);
  };
  scan(false);
  const every = setInterval(() => scan(true), everyMs);
  return () => { stopped = true; clearInterval(every); clearTimeout(timer); };
}

// ---- Viewers: the timer pollers run only while a page is looking ----
// A page asks /api/state every 2 s while its tab is visible (room.js stops when hidden), so a request in the last
// VIEWER_WINDOW_MS means someone is watching. The server exits after IDLE_EXIT_MS with none.
export const VIEWER_WINDOW_MS = 5 * 60_000;
export const IDLE_EXIT_MS = 2 * 3_600_000;
export interface Viewers {
  seen(): boolean;      // a page asked now; true when nobody had asked within the window before (a page came back)
  watched(): boolean;   // a page asked within the window
  idleMs(): number;     // since the last page request, or since the start when none came yet
}
export function viewerClock(now: () => number = Date.now, windowMs = VIEWER_WINDOW_MS): Viewers {
  const started = now();
  let last = Number.NEGATIVE_INFINITY;
  return {
    seen: () => { const t = now(), back = !(t - last <= windowMs); last = t; return back; },
    watched: () => now() - last <= windowMs,
    idleMs: () => now() - Math.max(started, last),
  };
}

export interface Polling { stop(): void; wake(): void }
export interface PollOptions {
  githubMs?: number; boxMs?: number;
  watched?: () => boolean;                       // false: the timer rounds poll nothing (gh, ssh)
  github?: (p: Project) => Promise<void>; box?: (p: Project) => Promise<void>;
  registry?: () => Project[];
  refresh?: boolean;                             // watch the refresh markers (default true)
}

// Overlapping polls would race on the state files, so each loop waits for its previous round and the two
// pollers are chained through one queue. The registry is re-read each round, so a new project is picked up
// without a restart. GitHub is polled every 20 s as a fallback (about 180 calls an hour of gh's 5000) and at once
// after a marker; the box every 2 min: each poll is an ssh login there. With no viewer a round polls nothing;
// wake() runs both rounds at once (a page came back). Refresh markers still poll: a crew command asked for them.
export function startPolling(o: PollOptions = {}): Polling {
  const watched = o.watched ?? (() => true), registry = o.registry ?? readRegistry;
  const loop = (fn: (p: Project) => Promise<void>, ms: number) => {
    let stopped = false, running = false, timer: NodeJS.Timeout | undefined;
    const tick = async () => {
      timer = undefined;
      running = true;
      try { if (watched()) for (const p of registry()) await enqueue(() => fn(p)).catch(() => undefined); }
      finally { running = false; if (!stopped) timer = setTimeout(tick, ms); }
    };
    void tick();
    return {
      stop: () => { stopped = true; clearTimeout(timer); },
      wake: () => { if (stopped || running) return; clearTimeout(timer); void tick(); },
    };
  };
  let queue = Promise.resolve();
  const enqueue = (fn: () => Promise<void>) => (queue = queue.then(fn, fn));
  const github = o.github ?? pollGithub;
  const loops = [loop(github, o.githubMs ?? 20_000), loop(o.box ?? pollBox, o.boxMs ?? 120_000)];
  // Refresh polls join the same queue as the timers, so they never overlap a timer round on the state files.
  const stopRefresh = o.refresh === false ? () => undefined : watchRefresh({ registry, poll: (p) => enqueue(() => github(p)) });
  return { stop: () => { loops.forEach((l) => l.stop()); stopRefresh(); }, wake: () => loops.forEach((l) => l.wake()) };
}
