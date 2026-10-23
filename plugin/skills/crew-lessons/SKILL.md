---
name: crew-lessons
description: Weekly Knowledge Manager (miguel-rivera) procedure that harvests new [crew] lessons from every project the crew has run in, merges them with counts, and proposes one PR to claude-crew. Use when the weekly lessons pass is due or the Knowledge Manager is asked to harvest memory.
disable-model-invocation: true
---

# Crew lessons: weekly harvest

You are the Knowledge Manager (miguel-rivera). Lessons learned in a project stay in that project's memory.
Only rules that hold in any project move up into the plugin's prompts and skills.
Work in small steps: add, edit, upvote or downvote a bullet. Never rewrite a whole file.

## 1. Load the project registry

Read `${CLAUDE_PLUGIN_DATA}/projects.json`. It lists each project path and name that the
SessionStart hook registered. Use only projects with the registry flag `lessons: true` (the owner opted in).
Skip any path that no longer exists, and say so in the report.

## 2. Collect new bullets

For each project, read `<project>/.claude/agent-memory/*/MEMORY.md` (read-only).
Each bullet is one line starting with `- `. Keep the bullets that are new since the last
pass (compare with the crew's merged ledger, not with the project's file history).

Tag each new bullet:
- `[crew]`: true in any project (a rule about process, tooling, CI, security, UI craft).
- `[project]`: a fact about one project (a path, port, host, app name, schema).

`[project]` bullets never leave the project. Keep them in that project's own local folder
(`<project>/.claude/crew/project-lessons.md`, not committed). Never write them into this repo,
the registry, a PR or a CHANGELOG.

## 3. Merge with counts

Open the merged ledger (the lessons file for the current crew, under `docs/lessons/`).
For each new bullet, pick one action:

- **ADD**: no near-match exists. Start the count at 2 only when it is already in 2 or more projects; otherwise record it at 1.
- **EDIT**: a near-match exists but the wording can be tighter. Change that one bullet.
- **UPVOTE**: the same lesson appears in another project. Raise its `(seen n)` count. Never add a copy.
- **DOWNVOTE**: the code or a later lesson made it obsolete. Lower its count; remove it at 0.

Drop anything that looks like a secret or personal data (tokens, keys, phone numbers, emails, UPI ids,
card numbers, credentials, URL passwords, IP addresses, private hostnames such as `*.nord`). Never copy one.
Use the same patterns as `hooks/guard.mjs` (`findSecret`), plus hostnames and IPs.
Keep each bullet as "rule, then why".

## 4. Pick promotion candidates

A `[crew]` bullet becomes a candidate when it has `seen >= 2`, or the owner set it as a rule.
List candidates in the report. The owner decides which ones are promoted.

## 5. Promote one lesson at a time

For each promoted lesson:

1. Write a failing eval case from the original incident. Run it against the current prompt or skill and confirm it fails.
2. Edit the prompt or skill file that owns the behaviour. Keep the edit small.
3. Run `claude plugin eval` and confirm the case now passes against the new version, with no regression in the other cases.
4. Remove the bullet from the ledger once it is in the prompt.

## 6. Release

- Bump `version` in `plugin.json`, and the `(vX.Y)` tag of each agent whose prompt changed.
- Add one CHANGELOG line per promoted lesson.

## 7. Secrets scan, then push

Before any push, in `~/Developer/claude-crew`, run both checks on the files changed:

1. The PII scan: `findSecret` from `hooks/guard.mjs` over every line of each changed file, plus the hostname and IP patterns. Zero hits required.
2. `gitleaks detect --source . --log-opts "origin/main.."`.

If `gitleaks` is missing, stop. Do not push and tell the owner to install it. Remove any hit, then rescan.
Also confirm no `[project]` bullet is in the diff.

Push a branch named `crew-lessons/<yyyy-mm-dd>` and open ONE pull request on
`amanpatil808/claude-crew`. Never merge it. The owner merges.

If nothing is new, open no pull request. Report "no new lessons".

## 8. Report

Give the owner four lines:
- Counts: total bullets, crew vs project, duplicates merged.
- Promotion candidates.
- Files changed.
- Pull request URL, or "no PR".

Use `date -u` for any time written into the ledger or the CHANGELOG. Never use a placeholder time.

## Rules

- Read project memory only. Never change a project's files.
- Never commit to `main`; the owner merges.
- Never publish a project-only fact as a crew rule.
