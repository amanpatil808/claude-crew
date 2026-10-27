# What toon-crew does and does not do

For anyone deciding whether to install `toon-crew`, or checking what it will and will not touch. The README has the four most important limits ([Good to know](../README.md#good-to-know)); this page has the full list, then what the plugin keeps and sends. For the plugin's guard rules, see [guards.md](guards.md).

## What it does

- Gives every Claude Code session in a project a manager, **Doraemon**, who plans work in waves, gives each task a priority (P0, P1 or P2), briefs the crew, checks every hand-back and opens the pull request.
- Runs five builders (Kevin, Bob, Shinchan, Mike Wazowski, Sulley) in their **own git worktrees**, so they do not touch your working folder. Builders never commit; Doraemon reviews and commits.
- Keeps seven roles **read-only** (Nobita, Ninja Hattori, Joe Gardner, 22, Dekisugi, Olaf, Stuart). The guard enforces it.
- Checks risky Bash, file, agent and MCP calls with the **guard** before they run, and fails closed: if it cannot decide, it blocks.
- Asks you before Mike Wazowski or Sulley merges a pull request, pushes to `main`, or edits a project's `.claude/hooks`, `agents`, `skills` or `commands`.
- Shows the **Crew Room** on `127.0.0.1`: tasks, desks, hand-backs, and (if you opt in) CI runs, pull requests, commits, deploys and app errors.
- Keeps one memory folder per agent in your project (`.claude/agent-memory/toon-crew-<id>/`), checked into your repo, and one shared project page (`.claude/crew/project.md`) every agent reads first.
- Redacts secrets, one-time codes, addresses and emails from board log lines before they reach disk or the page, and blocks secrets and personal numbers from being written into memory files.
- Records which projects you use in a small list you control (`/toon-crew:forget`).

## What it does not do

**Safety**

- **The guard is not a sandbox.** It cannot see inside a script file (`bash /tmp/w.sh`), or what a tool does by itself. See [guards.md](guards.md).
- **Your own commands are not checked.** Commands you type with `!` and actions on GitHub's website skip the guard, so you can always merge yourself.
- **A role's tool list does not make it read-only.** Turning on memory adds Write back to a role's tools. The guard is the lock.

**Merging and deploying**

- **Nobody merges on their own.** There is no auto-merge and no admin merge, for any role. Doraemon never merges. Only Mike Wazowski and Sulley may, after you approve that pull request, and the guard asks you each time.
- **Nobody but Mike Wazowski and Sulley may push to `main`.** For them it asks you; for everyone else, Doraemon included, it is refused.
- **The plugin does not deploy anything.** A deploy happens only if your project's own rules make a merge deploy.

**The board**

- **It does not start by itself.** Run `/toon-crew:board`. It keeps running after your session ends, until you stop it.
- **No remote view, no login, no buttons.** It is localhost and read-only. It cannot assign or move tasks.
- **Polling is off until you turn it on** for a project, and a project's own files cannot turn it on. It supports GitHub (through `gh`) and one SSH deploy host only. No GitLab, no cloud provider APIs. Commits are read from local refs; it does not fetch.
- **Deploy status needs a result file in a fixed format**, and app errors come from the `docker logs` of the containers you name.
- **Done tasks are not listed on the page**, only in `/toon-crew:task list` and the board's `/api/state`.
- **The event log is not rotated.** It grows, and the board reads all of it on each refresh. How large it gets in practice has not been measured.
- **No cost or token tracking** on the board yet.
- **Times are India time only.**

**Lessons and memory**

- **Projects never share memory.** Only rules tagged `[crew]` move up, through a pull request the owner merges.
- **The lessons pass is owner-only and manual.** It opens a pull request on this repo from the owner's checkout and needs `gitleaks`. There is no schedule.

**Status and platform**

- **The evals are not run in CI.** CI runs the structure check, strict validation, the hook and board tests and a secrets scan. The eval cases are run by hand and have not been re-measured since the cast was renamed.
- **No Windows or Linux desktop setup is documented.** `board.sh` is bash. CI runs on Ubuntu; the evals ran on macOS.
- **This repo is private and unlicensed.** There is no public install and no licence to reuse the code.
- **Uninstalling removes the plugin's data folder** (event log, project list) by Claude Code's default.

## Privacy and your data

- **The plugin has no server and sends nothing by itself.** Claude Code talks to Anthropic as it always does. The board runs on your machine.
- **The event log and project list** live in the plugin's data folder (`$CLAUDE_PLUGIN_DATA`, or `~/.toon-crew` when you start the board by hand). Files are mode 0600 and folders 0700. Log lines are short and redacted: an assignment keeps only the task's short description, never the full prompt, and a hand-back is cut to 160 characters.
- **The project list** holds each project's path, name, first and last seen, and two opt-in flags. It never holds secrets. `/toon-crew:forget` removes a project.
- **Memory and `project.md` live in your project** and are meant to be checked in. Keep secrets out; the guard blocks the obvious ones.
- **Polling talks to GitHub and your deploy host only if you opt a project in.** It runs `gh` and a read-only `ssh` on your machine.
- **Lessons leave a project only through a pull request** that the owner of this repo reviews and merges. Only `[crew]` rules move; `[project]` facts stay.
