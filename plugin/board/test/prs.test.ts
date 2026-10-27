// PR source for "Needs you": the extra fields ride on the same single `gh pr list` call, only enums are kept,
// and widening the window to 20 never announces old PRs. A fake `gh` on PATH stands in for GitHub.
import "./env.ts";
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { readEvents } from "../lib/events.ts";
import { EVENTS_FILE, projectStateDir } from "../lib/paths.ts";
import { loadSnapshot, pollGithub } from "../lib/pollers.ts";
import { projectKey, type Project } from "../lib/projects.ts";
import { checksOf, PR_LIMIT, pullRequests, reviewOf } from "../lib/sources.ts";

// Shaped like `gh pr list --json ...,statusCheckRollup` output (CheckRun and StatusContext entries);
// made-up names, ids and URLs, with a marker that must never be kept.
const MARK = "PLANTED-check-name-7f3a";
const checkRun = (status: string, conclusion: string) => ({ __typename: "CheckRun", name: `${MARK} plugin`, workflowName: "ci", status, conclusion, detailsUrl: `https://github.com/acme/shop/actions/runs/1/${MARK}`, startedAt: "2026-10-27T09:00:00Z", completedAt: "2026-10-27T09:05:00Z" });
const context = (state: string) => ({ __typename: "StatusContext", context: `${MARK}/ext`, state, targetUrl: `https://ci.example/${MARK}`, startedAt: "2026-10-27T09:00:00Z" });

test("checks: any failure fails, anything unfinished or unknown is pending, all passed is pass, none is none", () => {
  assert.equal(checksOf([checkRun("COMPLETED", "SUCCESS"), context("SUCCESS"), checkRun("COMPLETED", "SKIPPED"), checkRun("COMPLETED", "NEUTRAL")]), "pass");
  for (const bad of ["FAILURE", "CANCELLED", "TIMED_OUT", "ACTION_REQUIRED", "STARTUP_FAILURE"]) assert.equal(checksOf([checkRun("IN_PROGRESS", ""), checkRun("COMPLETED", bad)]), "fail", bad);
  assert.equal(checksOf([checkRun("COMPLETED", "SUCCESS"), context("ERROR")]), "fail");
  assert.equal(checksOf([checkRun("COMPLETED", "SUCCESS"), context("FAILURE")]), "fail");
  for (const pending of [[checkRun("IN_PROGRESS", "")], [checkRun("QUEUED", "")], [context("PENDING")], [context("EXPECTED")], [checkRun("COMPLETED", "STALE")], [checkRun("COMPLETED", "SOMETHING_NEW")], [{}], [null], ["x"], [checkRun("COMPLETED", "SUCCESS"), checkRun("WAITING", "")]])
    assert.equal(checksOf(pending), "pending", JSON.stringify(pending));
  for (const none of [[], null, undefined, "SUCCESS", {}]) assert.equal(checksOf(none), "none");
  assert.equal(checksOf([checkRun("COMPLETED", "success")]), "pass");
});

test("review: the three GitHub decisions, anything else is empty", () => {
  for (const v of ["APPROVED", "CHANGES_REQUESTED", "REVIEW_REQUIRED"]) assert.equal(reviewOf(v), v);
  for (const v of [null, undefined, "", "approved", "COMMENTED", 1, "__proto__"]) assert.equal(reviewOf(v), "");
});

// The fake gh: logs its argv, prints the canned answer for `pr list` or `run list`.
const bin = mkdtempSync(join(tmpdir(), "crew-fake-gh-"));
const GH_LOG = join(bin, "calls.jsonl"), PR_OUT = join(bin, "pr.json");
writeFileSync(join(bin, "gh"), [
  "#!/usr/bin/env node",
  "const fs = require('node:fs');",
  `fs.appendFileSync(${JSON.stringify(GH_LOG)}, JSON.stringify(process.argv.slice(2)) + '\\n');`,
  `process.stdout.write(process.argv[2] === 'pr' ? fs.readFileSync(${JSON.stringify(PR_OUT)}, 'utf8') : '[]');`,
].join("\n"));
chmodSync(join(bin, "gh"), 0o755);
process.env.PATH = `${bin}${delimiter}${process.env.PATH ?? ""}`;
const calls = (): string[][] => { try { return readFileSync(GH_LOG, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
const ghPr = (number: number, state = "OPEN", extra: Record<string, unknown> = {}) => ({
  number, title: `PR ${number}`, state, author: { login: "someone" }, headRefName: `feat/${number}`, updatedAt: "2026-10-27T09:00:00Z",
  url: `https://github.com/acme/shop/pull/${number}`, isDraft: false, reviewDecision: "REVIEW_REQUIRED", statusCheckRollup: [checkRun("COMPLETED", "SUCCESS"), context("SUCCESS")], ...extra,
});
const answer = (prs: unknown[]) => writeFileSync(PR_OUT, JSON.stringify(prs));

beforeEach(() => { rmSync(GH_LOG, { force: true }); rmSync(EVENTS_FILE, { force: true }); });

test("one gh pr list call: limit 20, the three extra fields, enums only in the result", async () => {
  answer([ghPr(12), ghPr(13, "OPEN", { isDraft: true, reviewDecision: null, statusCheckRollup: [] })]);
  const prs = await pullRequests("acme/shop");
  assert.deepEqual(calls(), [["pr", "list", "-R", "acme/shop", "--state", "all", "-L", "20", "--json", "number,title,state,author,headRefName,updatedAt,url,isDraft,reviewDecision,statusCheckRollup"]]);
  assert.equal(PR_LIMIT, 20);
  assert.deepEqual(prs[0], { number: 12, title: "PR 12", state: "OPEN", author: "someone", branch: "feat/12", updatedAt: "2026-10-27T09:00:00Z", url: "https://github.com/acme/shop/pull/12", draft: false, checks: "pass", review: "REVIEW_REQUIRED" });
  assert.deepEqual([prs[1].draft, prs[1].checks, prs[1].review], [true, "none", ""]);
  assert.ok(!JSON.stringify(prs).includes(MARK), "check names and URLs are never kept");
});

function boardProject(name: string): Project {
  const path = mkdtempSync(join(tmpdir(), `crew-${name}-`));
  mkdirSync(join(path, ".claude", "crew"), { recursive: true });
  writeFileSync(join(path, ".claude", "crew", "project.md"), "## Board\n- github: acme/shop\n");
  return { path, name, board: true };
}

test("widening the PR window to 20 records the older PRs without announcing them; later changes are announced", async () => {
  const p = boardProject("Shop");
  // A board that ran with the old 10-PR window: seeded, PRs 1-10 seen, no prLimit yet.
  const dir = projectStateDir(projectKey(p.path));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "seen.json"), JSON.stringify({ ci: [], prs: Array.from({ length: 10 }, (_, i) => `${i + 1}:OPEN`), commits: [], deploy: "", seeded: { github: true, box: false } }));
  answer(Array.from({ length: 20 }, (_, i) => ghPr(i + 1, i < 10 ? "OPEN" : i % 2 ? "MERGED" : "CLOSED")));
  await pollGithub(p);
  assert.deepEqual(readEvents().filter((e) => e.kind === "pr").map((e) => e.text), []);
  assert.equal(JSON.parse(readFileSync(join(dir, "seen.json"), "utf8")).prLimit, 20);
  assert.equal(loadSnapshot(p).prs.length, 20);
  assert.equal(calls().filter((c) => c[0] === "pr").length, 1, "still one PR call per poll");

  answer(Array.from({ length: 20 }, (_, i) => ghPr(i + 1, i === 0 ? "MERGED" : i < 10 ? "OPEN" : i % 2 ? "MERGED" : "CLOSED")));
  await pollGithub(p);
  assert.deepEqual(readEvents().filter((e) => e.kind === "pr").map((e) => e.text), ["PR #1 merged: PR 1"]);
});
