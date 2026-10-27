// Read-only log sources for one project. Each returns plain data that is redacted before it leaves this module.
// The deploy box is reached with one ssh command built only from values project-config.ts has already
// checked against strict patterns; it only reads files and logs.
import { run } from "./run.ts";
import { redact, redactDeep } from "./redact.ts";
import type { ProjectConfig } from "./project-config.ts";

export interface CiRun { id: number; workflow: string; title: string; branch: string; status: string; conclusion: string; createdAt: string; updatedAt: string; url: string }
export type Checks = "pass" | "fail" | "pending" | "none";
export type Review = "APPROVED" | "CHANGES_REQUESTED" | "REVIEW_REQUIRED" | "";
// checks and review are enums only: check names, URLs and reviewer names are never kept.
export interface Pr { number: number; title: string; state: string; author: string; branch: string; updatedAt: string; url: string; draft: boolean; checks: Checks; review: Review }
export interface Commit { sha: string; short: string; author: string; at: string; subject: string }
export interface AppError { service: string; at: string; level: string; msg: string }
export interface Deploy { status: string; version: string; at: string; detail: string; raw: string; history: string[] }

interface GhRun { databaseId: number; workflowName: string; displayTitle: string; headBranch: string; status: string; conclusion?: string; createdAt: string; updatedAt: string; url: string }
interface GhPr { number: number; title: string; state: string; author?: { login?: string }; headRefName: string; updatedAt: string; url: string; isDraft?: boolean; reviewDecision?: string | null; statusCheckRollup?: unknown }

// One PR list call, more rows than the old 10, so an older open PR stays in view (not a guarantee).
export const PR_LIMIT = 20;
const PR_FIELDS = "number,title,state,author,headRefName,updatedAt,url,isDraft,reviewDecision,statusCheckRollup";
const FAILED = new Set(["FAILURE", "ERROR", "CANCELLED", "TIMED_OUT", "ACTION_REQUIRED", "STARTUP_FAILURE"]);
const PASSED = new Set(["SUCCESS", "NEUTRAL", "SKIPPED"]);

// statusCheckRollup mixes CheckRun ({status, conclusion}) and StatusContext ({state}). Any failure fails;
// anything not known to have passed (running, queued, stale, a value GitHub adds later) is pending, never pass.
export function checksOf(rollup: unknown): Checks {
  if (!Array.isArray(rollup) || !rollup.length) return "none";
  let pending = false;
  for (const c of rollup) {
    const x: Record<string, unknown> = c && typeof c === "object" ? (c as Record<string, unknown>) : {};
    const result = x.status === undefined && typeof x.state === "string" ? x.state : x.status === "COMPLETED" ? x.conclusion : "PENDING";
    const r = typeof result === "string" ? result.toUpperCase() : "";
    if (FAILED.has(r)) return "fail";
    if (!PASSED.has(r)) pending = true;
  }
  return pending ? "pending" : "pass";
}

export const reviewOf = (v: unknown): Review => (v === "APPROVED" || v === "CHANGES_REQUESTED" || v === "REVIEW_REQUIRED" ? v : "");

const parse = <T>(text: string, fallback: T): T => { try { return JSON.parse(text) as T; } catch { return fallback; } };

export async function ciRuns(repo: string, cwd?: string): Promise<CiRun[]> {
  const r = await run(["gh", "run", "list", "-R", repo, "-L", "12", "--json", "databaseId,workflowName,displayTitle,headBranch,status,conclusion,createdAt,updatedAt,url"], 20_000, cwd);
  if (!r.ok) throw new Error(`gh run list: ${redact(r.err).slice(0, 200)}`);
  return parse<GhRun[]>(r.out, []).map((x) => redactDeep({
    id: x.databaseId, workflow: x.workflowName, title: x.displayTitle, branch: x.headBranch,
    status: x.status, conclusion: x.conclusion ?? "", createdAt: x.createdAt, updatedAt: x.updatedAt, url: x.url,
  }));
}

export async function pullRequests(repo: string, cwd?: string): Promise<Pr[]> {
  const r = await run(["gh", "pr", "list", "-R", repo, "--state", "all", "-L", String(PR_LIMIT), "--json", PR_FIELDS], 20_000, cwd);
  if (!r.ok) throw new Error(`gh pr list: ${redact(r.err).slice(0, 200)}`);
  return parse<GhPr[]>(r.out, []).map((x) => redactDeep({
    number: x.number, title: x.title, state: x.state, author: x.author?.login ?? "", branch: x.headRefName,
    updatedAt: x.updatedAt, url: x.url, draft: !!x.isDraft, checks: checksOf(x.statusCheckRollup), review: reviewOf(x.reviewDecision),
  }));
}

// Local refs, so it reads what this machine's crew committed without fetching (fetch would write to .git).
export async function commits(dir: string, branches: string[]): Promise<Record<string, Commit[]>> {
  const out: Record<string, Commit[]> = {};
  for (const branch of branches) {
    const r = await run(["git", "log", "-n", "12", "--format=%H%x1f%h%x1f%an%x1f%aI%x1f%s", branch, "--"], 10_000, dir);
    if (!r.ok) throw new Error(`git log ${branch}: ${redact(r.err).slice(0, 200)}`);
    out[branch] = r.out.split("\n").filter(Boolean).map((line) => {
      const [sha, short, author, at, subject] = line.split("\x1f");
      return redactDeep({ sha, short, author, at, subject });
    });
  }
  return out;
}

// Sections are split by marker lines. grep runs on the box so only candidate error lines travel.
export function remoteCommand(d: NonNullable<ProjectConfig["deploy"]>): string {
  return [
    `cat ${d.result} 2>/dev/null`,
    ...(d.log ? ["echo @@HIST", `tail -n 8 ${d.log} 2>/dev/null`] : []),
    ...d.containers.flatMap((c) => [
      `echo @@c:${c}`,
      `docker logs --tail 500 ${c} 2>&1 | grep -iE '\"level\":\"(warn|error|fatal)\"|error|exception|panic|fatal' | tail -n 40`,
    ]),
  ].join("; ");
}

export async function box(d: NonNullable<ProjectConfig["deploy"]>): Promise<{ deploy: Deploy; errors: AppError[] }> {
  const r = await run(["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=8", "-o", "StrictHostKeyChecking=yes", "--", d.ssh, remoteCommand(d)], 30_000);
  if (!r.out.trim()) throw new Error(`ssh ${d.ssh}: ${redact(r.err).slice(0, 200) || "no output"}`);
  const parts = r.out.split(/^@@(HIST|c:[\w.-]+)$/m);
  const section = (name: string) => { const i = parts.indexOf(name); return i >= 0 ? parts[i + 1] ?? "" : ""; };
  const raw = redact((parts[0] ?? "").trim());
  // Result line format: "<status> <version> <time> req=<id> <detail>".
  const [status = "unknown", version = "", at = "", , ...detail] = raw.split(" ");
  const deploy: Deploy = {
    status, version, at, detail: detail.join(" "), raw,
    history: section("HIST").split("\n").filter(Boolean).map(redact).reverse(),
  };
  const errors = d.containers.flatMap((c) => section(`c:${c}`).split("\n").filter(Boolean).map((l) => toError(c, l))).reverse();
  return { deploy, errors };
}

interface LogLine { at?: unknown; level?: unknown; msg?: unknown; meta?: Record<string, unknown> }

// Services may log JSON lines ({at, level, msg, meta}); anything else is kept as plain text.
export function toError(service: string, line: string): AppError {
  const j = parse<LogLine | null>(line, null);
  if (j && typeof j === "object" && j.msg) {
    const meta = j.meta ? Object.entries(redactDeep(j.meta)).filter(([k]) => k !== "svc").map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : v}`).join(" ") : "";
    return { service, at: String(j.at ?? ""), level: String(j.level ?? "error"), msg: redact(`${j.msg}${meta ? ` (${meta})` : ""}`).slice(0, 400) };
  }
  return { service, at: "", level: /warn/i.test(line) ? "warn" : "error", msg: redact(line).slice(0, 400) };
}
