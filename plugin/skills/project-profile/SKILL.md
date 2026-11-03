---
name: project-profile
description: Creates or updates `.claude/crew/project.md`, the one page every crew member reads first - test, lint, typecheck and build commands, services, docs per role, no-go areas, git, deploy and release rules, and the optional Board section. Use when a project has no project.md, when it is stale, or when commands or deploy rules change.
---

# Project profile: write `.claude/crew/project.md`

Every crew agent starts with "read the project's `CLAUDE.md` and `.claude/crew/project.md` first". This skill writes that page from what is really in the repo. It is checked into the project, so it must never hold a secret.

## 1. Start
- Run `date -u` and `git branch --show-current`; note both.
- If `.claude/crew/project.md` exists, read it. You are updating it: keep every line marked `(owner)` exactly as it is, and change other lines only when the repo says something different.
- Read `${CLAUDE_PLUGIN_ROOT}/skills/project-profile/template.md`. The new page follows its sections and order.

## 2. Gather facts (read, don't guess)
Look at whichever of these exist:
- `CLAUDE.md`, `README*`, `CONTRIBUTING*`, `docs/` (list the tree, read the index pages).
- Command sources: `package.json` scripts, `Makefile`, `justfile`, `Taskfile*`, `pyproject.toml`, `Cargo.toml`, `go.mod`, `composer.json`, `scripts/`. The lockfile tells you the package manager.
- CI: `.github/workflows/*`, `.gitlab-ci.yml` and similar. CI's steps are the most reliable list of what "green" means.
- Services: `docker-compose*.yml`, `compose*.yml`, dev scripts. Env: `.env*.example` files (variable names only, never values). Never open `.env`, `.env.local` or any other real env, key or credential file.
- Git: `git remote -v` (the GitHub `owner/repo`), the default branch (`git symbolic-ref refs/remotes/origin/HEAD`), `.gitignore`.
- Crew setup: `.claude/settings.json` (only `agent`, `worktree`, and `env.CLAUDE_CODE_SUBAGENT_MODEL` / `_FORCE`; other `env` values can be keys, so never copy or repeat them), `.worktreeinclude`, `.claude/agent-memory/`.

For each command, record where you found it (`file:line`) and its status:
- `ran ok` only if you ran it in this session and it passed;
- `found, not run` if you only saw it;
- `unverified` if a doc mentions it but no file defines it.

Run only harmless checks (`ls`, `git remote -v`, `--version`). Don't run tests, builds or service scripts unless the person asked you to; never run anything that deploys, migrates a shared database, deletes data or needs real secrets.

## 3. Write the page
Fill in `template.md`:
- **Project**: name, one line on what it is, the main stack, which version or mode is current if there are several.
- **Commands**: install, test, lint, typecheck, format, build, run locally, services up and down; each with its status and source. Note env variables the suite needs (names only) and how tests skip without services.
- **Docs per role**: the files each crew member reads first. Leave a role out when nothing applies.
- **No-go areas**: production hosts and data, personal folders, secret folders, generated output, vendored code, files another tool or team owns, anything `CLAUDE.md` forbids.
- **Git and PRs**: default branch, branch naming, "only the manager commits", PRs only, who merges, required checks.
- **Deploy and release**: what triggers a release or deploy (for example a merge to main), who may deploy, how rollback works, what must never run in automation.
- **Work folders**: where agents put scratch files (default `$TMPDIR/crew-<agent>/`).
- **Board** (optional): see section 4.

Rules for the page:
- No secrets, tokens, env values, personal data, IP addresses or absolute home paths. Use `~` or repo-relative paths.
- Keep it under about 150 lines; link to docs instead of copying them.
- Mark anything you couldn't confirm `TODO(verify)`.
- Write the update date from `date -u` at the top.

## 4. The Board section (optional)
The Crew Room board reads `## Board` from this file and puts the values into command lines, so each value must match a strict pattern or it is ignored. Write only the keys the owner wants polled; leave the others out entirely (no placeholders, no trailing comments, one `- key: value` per line, nothing else in the section).

| Key | Format | Example |
|---|---|---|
| `github` | `owner/repo` | `acme/shop` |
| `branches` | comma list of branch names (default `main`) | `main, feat/checkout` |
| `deploy-ssh` | `user@host` (no port) | `deploy@shop-box` |
| `deploy-result` | absolute or `~` path, no spaces | `/var/lib/shop/result` |
| `deploy-log` | absolute or `~` path, no spaces | `~/shop/deploy.log` |
| `deploy-containers` | comma list of container names | `shop-api-1, shop-worker-1` |

- Keep `## Board` as the last section: the next `## ` heading ends it, and any `word: value` line inside it is read as a key.
- The deploy poller runs only when both `deploy-ssh` and `deploy-result` are set and valid.
- `deploy-ssh` names a host in a checked-in file. Prefer an SSH config alias (defined in the owner's `~/.ssh/config`) over an IP address or internal domain, and ask the owner before writing any host.
- The exact parser is `board/lib/project-config.ts` in the toon-crew plugin; check it if a value is ignored.

## 5. Crew setup checks (report, don't change)
Check these and list each as ok or a recommendation for the owner. Don't edit settings files yourself.
- Builders run in git worktrees. `.claude/settings.json` should set `"worktree": {"baseRef": "head"}`, or their worktrees start from the default branch instead of the working branch.
- `.worktreeinclude` lists the gitignored files builders need (for example `.env`; check the names in the list only, never open those files); `.claude/worktrees/` is in `.gitignore`.
- `env.CLAUDE_CODE_SUBAGENT_MODEL` is `sonnet` (optional). It only covers agents without a `model` of their own, such as general-purpose, so they don't run on the main model; it doesn't change crew agents, which all set one. `CLAUDE_CODE_SUBAGENT_MODEL_FORCE` should not be set.
- Doraemon is opt-in per project: the project's `.claude/settings.json` sets `"agent": "toon-crew:doraemon"` (the owner edits it; the guard blocks the crew), or a session starts with `claude --agent toon-crew:doraemon`. Report whether it is set.
- `.claude/agent-memory/` is checked in (project memory is meant to be shared). Plugin agents use `toon-crew-<name>/` folders there; old `<name>/` folders from project-level agents need copying across (see `docs/how-it-works.md` in the claude-crew repo).

## 6. Report
```
Profile: <created | updated> .claude/crew/project.md   Time: <date -u>
Commands: <n ran ok, n found not run, n unverified>
Changed: <section - what changed> (updates only)
TODO(verify): <item - where to look>
Crew setup: <check - ok | recommendation>
Questions for the owner: <board hosts, deploy rules, no-go areas you're unsure of>
```
