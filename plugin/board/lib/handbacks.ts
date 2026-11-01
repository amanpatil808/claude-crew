// Hand-back files (docs/specs/handbacks.md): each crew agent writes a full report and a short summary under
// <data>/projects/<key>/handbacks/(full|summaries)/<agent id>/<name>.md. The guard decides who may write there;
// this module finds the folder, lists summaries for the manager, and deletes files older than 60 days.
// Nothing here follows a symlink: the folder is written by agents, so a link could point anywhere.
import { chmodSync, closeSync, constants, fstatSync, lstatSync, mkdirSync, openSync, readSync, readdirSync, realpathSync, rmdirSync, unlinkSync, type Dirent, type Stats } from "node:fs";
import { join, resolve, sep } from "node:path";
import { projectKey, type Project } from "./projects.ts";

export const KINDS = ["full", "summaries"] as const;
export const AGENT_ID = /^[a-z0-9-]{1,40}$/;
export const FILE_NAME = /^[a-z0-9-]{1,60}\.md$/;
export const KEEP_DAYS = 60;
export const DAY_MS = 86_400_000;
const MAX_SCAN = 5000;       // summaries looked at per list, and entries per folder per prune pass
const HEAD_BYTES = 4096;     // enough for the first lines of a summary
const LINE_MAX = 200;

const lstatOrNull = (p: string): Stats | null => { try { return lstatSync(p); } catch { return null; } };
const realDir = (p: string) => { const st = lstatOrNull(p); return !!st && st.isDirectory() && !st.isSymbolicLink(); };

// The board's own project key: the deepest registered project that holds `dir`, else `dir` itself.
// A worktree inside a project therefore shares the project's folder.
export function handbackKey(dir: string, registry: Project[]): string {
  const d = resolve(dir);
  const hit = registry
    .filter((p) => d === resolve(p.path) || d.startsWith(resolve(p.path) + sep))
    .sort((a, b) => resolve(b.path).length - resolve(a.path).length)[0];
  return projectKey(hit ? hit.path : d);
}

export const handbacksDir = (dataDir: string, key: string) => join(resolve(dataDir), "projects", key, "handbacks");

export class LinkError extends Error {}
// Creates handbacks/, full/ and summaries/ owner-only (0700), tightening looser ones. Agents' Write creates the
// <agent id>/ folder inside; it inherits the protection of these. A link at any level below the data folder is refused.
export function ensureHandbacks(dataDir: string, key: string): string {
  const root = handbacksDir(dataDir, key);
  mkdirSync(resolve(dataDir), { recursive: true, mode: 0o700 });
  let p = resolve(dataDir);
  for (const part of ["projects", key, "handbacks"]) {
    p = join(p, part);
    makePrivateDir(p);
  }
  for (const kind of KINDS) makePrivateDir(join(root, kind));
  return root;
}
function makePrivateDir(p: string) {
  try { mkdirSync(p, { mode: 0o700 }); } catch (err) { if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err; }
  if (!realDir(p)) throw new LinkError("not a plain folder");
  chmodSync(p, 0o700);
}

export interface Summary { path: string; agent: string; mtimeMs: number; head: string[] }

// Control characters (terminal escapes, newlines inside a line) are shown escaped; long lines are cut.
const clean = (s: string) => s.replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u2028\u2029]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`).slice(0, LINE_MAX);

// The first `lines` lines, read through O_NOFOLLOW so a link swapped in after the listing is not read.
function headOf(file: string, lines: number): string[] {
  let fd: number | null = null;
  try {
    fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW);
    if (!fstatSync(fd).isFile()) return [];
    const buf = Buffer.alloc(HEAD_BYTES);
    const n = readSync(fd, buf, 0, HEAD_BYTES, 0);
    const all = buf.subarray(0, n).toString("utf8").split(/\r?\n/);
    if (all.length > 1 && all[all.length - 1] === "") all.pop(); // the file's final newline is not a line
    return all.slice(0, lines).map((l) => clean(l.replace(/�+$/, "")));
  } catch { return []; } finally { if (fd !== null) closeSync(fd); }
}

const plainDirs = (dir: string): Dirent[] => { try { return readdirSync(dir, { withFileTypes: true }); } catch { return []; } };

// Newest summaries first (by modification time, then name). `agent` limits to one agent's folder.
export function listSummaries(dataDir: string, key: string, opts: { agent?: string; limit: number; lines?: number }): { items: Summary[]; capped: boolean } {
  const root = handbacksDir(dataDir, key);
  if (opts.agent !== undefined && !AGENT_ID.test(opts.agent)) return { items: [], capped: false };
  let p = resolve(dataDir);
  for (const part of ["projects", key, "handbacks", "summaries"]) { p = join(p, part); if (!realDir(p)) return { items: [], capped: false }; }
  const agents = opts.agent !== undefined ? [opts.agent] : plainDirs(join(root, "summaries")).filter((e) => e.isDirectory() && AGENT_ID.test(e.name)).map((e) => e.name);
  const found: Omit<Summary, "head">[] = [];
  let capped = false;
  for (const agent of agents) {
    const dir = join(root, "summaries", agent);
    if (!realDir(dir)) continue;
    for (const e of plainDirs(dir)) {
      if (!e.isFile() || !FILE_NAME.test(e.name)) continue; // links and odd names are skipped, never followed
      if (found.length >= MAX_SCAN) { capped = true; break; }
      const st = lstatOrNull(join(dir, e.name));
      if (st?.isFile()) found.push({ path: join(dir, e.name), agent, mtimeMs: st.mtimeMs });
    }
  }
  found.sort((a, b) => b.mtimeMs - a.mtimeMs || (a.path < b.path ? 1 : a.path > b.path ? -1 : 0));
  return { items: found.slice(0, opts.limit).map((s) => ({ ...s, head: headOf(s.path, opts.lines ?? 3) })), capped };
}

export interface PruneResult { files: number; dirs: number }

// Deletes files under every project's handbacks/ whose modification time is older than `keepDays`, and the
// agent folders that leaves empty (handbacks/, full/ and summaries/ stay, with the 0700 mode `dir` gave them). Only plain folders are entered and only plain files are
// deleted; links are left where they are, and nothing outside handbacks/ is touched.
export function pruneHandbacks(dataDir: string, nowMs: number, keepDays = KEEP_DAYS): PruneResult {
  const out: PruneResult = { files: 0, dirs: 0 };
  let base: string;
  try { base = realpathSync(dataDir); } catch { return out; }
  const projects = join(base, "projects");
  if (!realDir(projects)) return out;
  const cutoff = nowMs - keepDays * DAY_MS;
  for (const e of plainDirs(projects).slice(0, MAX_SCAN)) {
    if (!e.isDirectory()) continue;
    const hb = join(projects, e.name, "handbacks");
    if (!realDir(hb)) continue;
    // Write makes missing folders 0755 and files 0644; an owner-only handbacks/ keeps everything below private.
    try { chmodSync(hb, 0o700); } catch { /* not ours to fix: the sweep still runs */ }
    sweep(hb, cutoff, out);
  }
  return out;
}

// One folder. Exported for the test of its own link check (the Dirent filter above hides it otherwise).
// Returns true when the folder is empty afterwards.
export function sweep(dir: string, cutoff: number, out: PruneResult, depth = 0): boolean {
  // The folder must be its own real path: a link swapped in for it after the parent was listed is not entered.
  // (A swap after this check is still possible; only the owner's own processes can write these 0700 folders.)
  const same = () => { try { return realpathSync(dir) === dir; } catch { return false; } };
  if (depth > 8 || !same()) return false;
  const entries = plainDirs(dir);
  let kept = entries.length > MAX_SCAN ? 1 : 0;
  for (const e of entries.slice(0, MAX_SCAN)) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (sweep(p, cutoff, out, depth + 1) && depth > 0) { try { rmdirSync(p); out.dirs++; } catch { kept++; } } else kept++;
      continue;
    }
    const st = e.isFile() ? lstatOrNull(p) : null;
    if (!st?.isFile() || st.mtimeMs >= cutoff) { kept++; continue; }
    try { unlinkSync(p); out.files++; } catch { kept++; }
  }
  return kept === 0;
}

// Once now, then every `every` ms (a day by default). The timer does not keep the process alive.
// Errors are reported as a fixed line: paths and file names stay out of the server log.
export function startPrune(dataDir: string, opts: { every?: number; now?: () => number; log?: (line: string) => void } = {}): () => void {
  const now = opts.now ?? Date.now, log = opts.log ?? ((l: string) => console.log(l));
  const pass = () => {
    try {
      const r = pruneHandbacks(dataDir, now());
      if (r.files || r.dirs) log(`crew board: removed ${r.files} hand-back files older than ${KEEP_DAYS} days and ${r.dirs} empty folders`);
    } catch { log("crew board: hand-back clean-up failed; it will try again tomorrow"); }
  };
  pass();
  const timer = setInterval(pass, opts.every ?? DAY_MS);
  timer.unref?.();
  return () => clearInterval(timer);
}
