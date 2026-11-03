# Privacy: what toon-crew stores, sends and how to delete it

For anyone who has installed, or is thinking of installing, the `toon-crew` plugin. This page describes version 1.0.2 and was checked against its code. If you find a gap, [open an issue](https://github.com/amanpatil808/claude-crew/issues); for a security problem, use [SECURITY.md](../SECURITY.md).

## The short version

- The plugin has no server and no account. It sends nothing to us or to anyone else by itself.
- It writes small files on your machine: an event log, a project list, hand-back reports and a few state files. Only you can read them (mode 0600, folders 0700).
- Your prompts and code still go to Anthropic through Claude Code, as they always do. The plugin does not change that.
- Two things use your own tools, and only if you opt in: `gh` (GitHub) and `ssh` (your deploy host).
- You can delete everything it stored. See [How to delete it](#how-to-delete-it).

## What it stores on your machine

**In the plugin's data folder.** Claude Code gives the plugin this folder; it is usually `~/.claude/plugins/data/toon-crew-crew/`. When you start the board by hand, `CLAUDE_PLUGIN_DATA` must be set to that folder as an absolute path; without it the board stops and writes nothing (there is no home-folder fallback since 1.0.2).

| File or folder | What is in it |
|---|---|
| `events.jsonl` | One short line per event: a session or agent started or finished, a hand-off from the manager, a queued task, a commit or pull request the crew made, "needs you" prompts. Each line has a time, the project name and an agent name. |
| `projects.json` | Each project's folder path, its name, first and last seen, and two opt-in flags (`board`, `lessons`). |
| `limits.json` | Your plan's usage percentages and reset times, if you use a Claude plan. |
| `projects/<project>/handbacks/` | The full report and 12-line summary each crew agent writes when it finishes a task. |
| `projects/<project>/` state files | Only when you opt in to board polling: the last GitHub and deploy readings. |
| `remind/`, `refresh/`, `main-busy.txt`, `handbacks-pruned.txt` | Small markers: a reminder state per session, which project's GitHub to re-read, and two timestamps. |
| `server.json`, `server.log` | The running board's process id and port, and its log, if you start the board. |
| `exports/`, `export-cursor.json` | Only if you run the `export` command by hand. |

**What a log line holds, and what it never holds.**
- It holds short text only: an agent's finished message cut to 160 characters, a hand-off's short description cut to 70, a queued task's short text, a commit subject cut to 120, and fixed phrases such as "Session started".
- It never holds your prompts, a full command, tool output, a notification's own words, or file contents.
- Usage lines hold token counts per model and day, not text. The hook reads Claude Code's session file for those numbers only.
- Before a line reaches disk, the board redacts secrets, one-time codes, phone and card numbers, addresses and emails. Redaction is a safety net, not a promise: do not rely on it for secrets you put in a task description.

**In your project folder.** `.claude/crew/project.md` (your commands, docs and rules, written on the first run) and `.claude/agent-memory/toon-crew-<id>/MEMORY.md` (lessons for each agent). These are meant to be committed, so they go wherever your repo goes. The guard blocks keys, tokens, passwords, emails, and phone and card numbers from memory files. It does not scan `project.md`, so read it before you commit it.

**One environment variable.** The plan-usage mod sets `TOON_CREW_LIMITS` inside Claude Code. It makes no other call: no files, processes or network.

## What leaves your machine

| What | Where it goes | When |
|---|---|---|
| Your conversation, files Claude reads, tool results | Anthropic, through Claude Code | Always, as in any Claude Code session. See Anthropic's own privacy terms. |
| `gh run list`, `gh pr list` | GitHub, with your own `gh` login | Only after `/toon-crew:project board on` and a `## Board` section in `project.md`, and only while the board page is open |
| One read-only `ssh` command | The deploy host you named in `project.md` | Same opt-in |
| Plugin install and update | Claude Code clones the marketplace from GitHub | When you install or update |

Nothing else. The board page listens on `127.0.0.1` only, rejects other host names, has no login and loads nothing from the internet. The `export` command writes a file on your disk; it sends nothing unless you push that file somewhere yourself. Polling results stay in the data folder.

## How to delete it

- **Everything in the data folder.** Uninstall: `claude plugin uninstall toon-crew@crew`. Claude Code deletes the data folder unless you add `--keep-data`. Or stop the board (`/toon-crew:board stop`) and delete the folder yourself.
- **One project from the list.** `/toon-crew:forget <name or path>`. This removes only the project-list entry; its events stay until they age out (30 days, trimmed while the board runs), and the project's own files are untouched.
- **Hand-backs.** Files older than 60 days are removed once a day. To remove them sooner, delete `projects/<project>/handbacks/` in the data folder.
- **Files in your project.** Delete `.claude/crew/` and `.claude/agent-memory/toon-crew-*` from your repo and commit that. History keeps old copies, as with any file.
- **Stop it collecting.** Turn the manager off (remove `"agent": "toon-crew:doraemon"`), or `claude plugin disable toon-crew@crew --scope project`. The hooks write events whenever the plugin is enabled, even with the manager off.

Sources: `plugin/board/lib/private-fs.ts:8-19` (modes), `plugin/board/lib/paths.ts:11-17` (data folder), `plugin/board/hook.ts:27,55,41,120-132,145` (what a line holds), `plugin/board/task.ts:49` (queued task text), `plugin/board/lib/events.ts:214-217` (redaction before write), `plugin/board/lib/usage.ts:1-3` (numbers only), `plugin/hooks/projects.mjs:1-3,57` (project list), `plugin/hooks/plan-mod.mjs:6` (one variable), `plugin/board/server.ts:38-40,90` (127.0.0.1, host check), `plugin/board/lib/run.ts:9` and `plugin/board/lib/sources.ts:46,55,67,90` (the only `gh`, `git`, `ssh` calls), `plugin/board/lib/pollers.ts:38` (opt-in), `plugin/board/lib/handbacks.ts:12` (60 days), `plugin/board/lib/events.ts:306` (30 days), `plugin/skills/forget/SKILL.md`.
