# Guards: what the toon-crew guard allows, asks and blocks

For anyone who has installed the `toon-crew` plugin and wants to know exactly what the guard does. The README has the short version (the "Is it safe to let it run?" item in the [FAQ](../README.md#faq)). This page has the full rule list.

> [!WARNING]
> The guard is a seatbelt, not a sandbox. It reads the text of a tool call before it runs. It catches mistakes and lazy bypasses. A determined agent with a shell can still get around any text check, for example by writing a script file and running it. For roles that have Bash, Claude Code's own sandbox is the real boundary.

## How it works

`plugin/hooks/guard.mjs` is a PreToolUse hook. Claude Code runs it before each call to one of these tools: Bash, Monitor (it runs shell commands too), Edit, Write, MultiEdit, NotebookEdit, Agent (and its old name Task), SendMessage, CronCreate, Workflow, RemoteTrigger, Read, Grep and any `mcp__*` tool.

For each call it gives one of three answers:

| Answer | What you see |
|---|---|
| Allow | Nothing. The call runs. |
| Ask | Claude Code's own approval prompt, with a one-line reason. You decide. |
| Block | The call does not run. The agent gets a one-line reason. |

**It fails closed.** If the guard cannot read its input, hits an internal error, or cannot parse something that touches git, gh, rm, docker, settings or memory files, it blocks. The hook also sets `"onFailure": "block"` (which is why the plugin needs Claude Code 2.1.295 or later), so a crash or a 10-second timeout blocks the call instead of letting it through.

## Who is who

- **The manager (Doraemon)** is the main session. It may run most things, but it may not push to `main`, merge or approve a pull request. It is the only one who starts crew agents, and the only one who may use SendMessage, CronCreate, Workflow and RemoteTrigger.
- **The DevOps Team** is `toon-crew:mike-wazowski` and `toon-crew:sulley`. They are the only callers who get an "ask" (instead of a refusal) for pushes to `main`, merges and pull request approvals. The exact plugin names are required: a project agent with the same bare name (`sulley`) gets nothing.
- **Miguel Rivera** (the knowledge manager) may only push `crew-lessons/<name>` branches and open a pull request on the crew repo.
- **Read-only roles** are ninja-hattori, joe-gardner, twenty-two, nobita, dekisugi, olaf and stuart. See the table below. Nobita is the one exception for files: he may edit style and visual files (he builds styles; Shinchan builds behaviour), and nothing else.
- **Everyone else** is the rest of the crew, or any other agent. The general rules apply.

## The rules

| Rule | What happens |
|---|---|
| Push to `main` or `master` | Mike Wazowski and Sulley: you are asked. Everyone else, the manager and the main thread included: refused. Covers `git push origin main`, `HEAD:main`, `refs/heads/main`, a bare `git push` whose real destination (`@{push}`) is `main`, and pushes through an alias or xargs. `--delete main`, `:main`, `--all`, `--mirror` and `--prune` are refused for everyone. |
| Force push | Refused for everyone, on any branch: `--force`, `-f` (also `-fu`), `--force-with-lease`, `--force-if-includes`, any unique abbreviation (`--force-w`, `--mir`) and `+refspec`. |
| Git config tricks | Refused: `git -c alias.*`, `remote.*.push`, `push.*`, `core.sshCommand`, `url.*.insteadOf`; `git config` writes of the same keys (also through `--file` or `-f`); the `GIT_CONFIG_*` environment overrides; `--git-dir`, `--work-tree` or `GIT_DIR` on a push or an unknown subcommand. Repo aliases are resolved first. Before a bare push, `remote.<name>.push` rules are applied (`+` counts as a force push) and a push target the guard cannot verify asks you. `core.hooksPath` asks you. |
| Merge | `gh pr merge`, `gh api .../pulls/N/merge`, `.../merges` and the GraphQL `mergePullRequest`. Mike Wazowski and Sulley: you are asked, once per merge. Everyone else, the manager and Miguel Rivera included: refused. `--admin` and `--auto` merges are refused for everyone. |
| Pull request approvals, workflow runs, repo edits | `gh pr review --approve`, `gh workflow run`, `gh repo edit` and workflow dispatches: the DevOps Team is asked, everyone else is refused. |
| Other MCP tools | A tool with merge, push, delete, destroy, drop, force, remove or wipe in its name asks you. An auto-merge tool is refused. Merge and approval tools follow the merge rule above. |
| GitHub destruction | Refused: `gh repo delete`, `gh api -X DELETE repos/o/r` (also a full URL, or `curl` with `gh auth token`), moving or deleting `refs/heads/main`, branch protection changes, `gh alias`, `gh auth token`. |
| Credential reads | Refused for every role: reading `~/.config/gh` or `~/.git-credentials`, by Bash, Read or Grep. A search rooted above those folders is refused too. |
| Recursive delete | Refused: `rm -r`, `rm -rf`, `find -delete`, `rsync --delete`, `git clean -x`, `docker run ... rm -rf`, unless every target is inside the system temp folder, the session scratchpad, or a real (not symlinked) `tmp/`, `.tmp/`, `scratch/` or `.scratch/` folder in the project. A project that itself sits in a temp folder gets no temp-folder exemption. `cd` into an unknown variable, `cd` inside `( )`, `mv` into scratch and `ln` inside scratch are blocked, because they make a later delete look legal. |
| Docker data | Refused (docker, docker-compose, podman): `down -v` or `--volumes`, `compose rm -v`, `rm -v` (`container rm/remove -v`), `volume rm`, `volume prune`, `system prune --volumes`, and `rm -r`, `rmdir`, `find -delete`, `shred`, `mkfs` or `dd if=` inside `run`, `create` or `exec`. Allowed: the `--rm` flag of `run` and `create`, which only removes the container that command makes when it exits. |
| Protected files | Refused, for Edit and Write and for shell writes (`>`, `tee`, `cp`, `mv`, `ln`, `sed -i`, `dd of=`, and `python`, `node` or `perl` with `-c` or `-e`): `.claude/settings*.json`, the installed plugin under `~/.claude/plugins` (a checkout you load with `--plugin-dir` stays editable), `.git/config`, `.git/hooks`, a `config` or `hooks/` file inside a git-dir-looking folder, `~/.claude.json` and `.mcp.json`. |
| Project crew config | Edit, Write and shell writes to a project's `.claude/hooks`, `.claude/agents`, `.claude/skills` or `.claude/commands` ask you. |
| Memory files | Refused: shell writes into any `agent-memory*` folder, and file writes whose resulting text holds a token, key, private key, URL password, `password=` value, UPI id, email address, card number (Luhn-valid) or phone number (Indian 10-digit with `0`, `+91`, spaces, dots or dashes; or international). |
| Read-only roles | Edit, MultiEdit and NotebookEdit refused, except Nobita's style files below. Tree-changing git refused (reset, checkout, restore, apply, am, stash, clean, commit, merge, rebase, cherry-pick, revert, pull, rm, mv, add), and so are `git push`, `patch` and inline-code file writes outside temp. Write is allowed only to the role's own `.claude/agent-memory/toon-crew-<id>/MEMORY.md`, the system temp folder or session scratchpad, and its deliverable folders: `docs/research/` for dekisugi, olaf and nobita. Paths are resolved to their real location, so `..` and symlinks cannot escape. The memory secret scan applies to all of these. Shell writes are allowed only into temp. |
| Nobita's style files | Nobita may Edit and Write style and visual files in his own checkout (his worktree, or the project): `.css`, `.scss`, `.sass`, `.less`, `.svg`, images (`.png`, `.jpg`, `.gif`, `.webp`, `.avif`, `.ico`), design-token data (`tokens.json`, `theme.json`, `.yaml`, `.yml`), and anything in `docs/design/`. Never JS, TS or HTML (so not `tokens.ts` or `theme.js`), tests, hooks, config or CI; nothing in a dot folder (`.claude/`, `.github/`), `node_modules/` or a test folder, and no `*.test.*`, `*.spec.*` or `*.stories.*` file, whatever its type. Documents in `docs/design/` get the secret scan. He stays read-only in every other way: shell writes only into temp, no commit, push or merge, no relay tools. |
| Spawning | Only the main session (the manager) starts crew agents. Dekisugi may start only `toon-crew:olaf` or `toon-crew:stuart`, written with the prefix (a bare `olaf` could match a project agent with more tools). Every other crew role is refused. Agents that are not crew are not limited. |
| Relay tools | SendMessage, CronCreate, Workflow and RemoteTrigger are refused for every crew role except the manager. |
| Knowledge manager pushes | Miguel Rivera may only run `git push origin crew-lessons/<name>` and `gh pr create -R amanpatil808/claude-crew`, and only when `origin` is the crew repo. No merges, no other pushes. The guard accepts both `miguel-rivera` and `toon-crew:miguel-rivera` as his name. |

## What the plugin's own code reads

The credential rule above limits the crew. The plugin's own code (hooks, board, mod) holds itself to the same line:

- **No credentials.** It never opens `~/.config/gh`, `~/.git-credentials`, `~/.ssh`, the keychain, `.env` files or `~/.claude.json` on its own. (The one exception is an agent's own edit: before an Edit runs, the guard reads that file's current text to scan the result for secrets, and keeps nothing.) When you opt a project in to board polling, the board runs your own `gh` and `ssh`, which use their own logins. Every `ssh` call has `BatchMode=yes` and `StrictHostKeyChecking=yes`, so it never prompts.
- **One setting from `~/.claude/settings.json`.** The compact reminder (`plugin/board/remind.ts`) reads `autoCompactWindow`, to leave out the `/autocompact` tip once you have set it. That file can also hold keys in its `env` block, so the read is narrowed: Claude Code's own config folder only (an absolute `CLAUDE_CONFIG_DIR`, else `~/.claude`), a regular file up to 256 KB (a pipe or a bigger file is skipped), and one number kept. Nothing from it is logged, written or shown.
- **Transcripts, numbers only.** The board reads Claude Code's transcripts under `~/.claude/projects/` for token counts, model names and times, never message text or tool output (`plugin/board/lib/usage.ts`).
- **Only its own folders.** `board.sh` builds paths only under the plugin root and the data folder (`$CLAUDE_PLUGIN_DATA`, absolute). It has no home-folder fallback, and its `stop` signals a pid from `server.json` only when that process's whole command line is the one `start` launches (`node --no-warnings /…/board/server.ts`, from any plugin version's folder). The hooks write only under `$CLAUDE_PLUGIN_DATA`; the developer override `BOARD_LOG_DIR` is read by `board.sh` alone.
- **Agent instructions follow the same line.** The project-profile skill reads `.env*.example` names only, and from `.claude/settings.json` only `agent`, `worktree` and the subagent-model setting.

Tests: `tests/board/board-sh.test.ts`, `tests/board/data-dir.test.ts`, `tests/board/remind.test.ts` and `tests/hooks/plugin-text.test.mjs`. The last one fails if any file the plugin ships says to pipe a download into a shell, run a remote package (`npx`), install a tool, or skip a trust prompt.

## Hand-back files

Each crew agent writes a full report and a short summary per task into the plugin's data folder (`$CLAUDE_PLUGIN_DATA`), so the main session can reread them after `/clear`. The guard lets every crew role, the read-only ones included, Write or Edit exactly these files, and nothing else in the data folder:

```
$CLAUDE_PLUGIN_DATA/projects/<project key>/handbacks/full/<its own id>/<name>.md
$CLAUDE_PLUGIN_DATA/projects/<project key>/handbacks/summaries/<its own id>/<name>.md
```

`<name>` is lower-case letters, digits and `-`, up to 60 characters. Another role's folder, any other file type, a `..` in the path, a symlink or hard link anywhere below the data folder, and NotebookEdit are refused for crew roles. So `events.jsonl`, `limits.json` and `projects.json` stay hook-only. The Write tool creates missing folders. If `CLAUDE_PLUGIN_DATA` is not set when the hook runs, nothing new is allowed. `board.sh handbacks dir|list` prints a project's folder and its newest summaries (`--project` must be an existing absolute folder, `--limit` a whole number from 1 to 200), and the board deletes hand-back files older than 60 days once a day.

### The data folder from the shell

A crew role (every role except the manager) may only **read** the data folder from Bash or Monitor. If a command line names the folder, it is refused unless every command on the line is `cat`, `head`, `tail`, `ls`, `grep` or `wc`, with no redirection except to `/dev/null`. So `cat <its hand-back file>` and `ls <folder> | wc -l` work. `cat <file> > /tmp/copy`, `cat <file> | sh` and `ls <folder> && git status` are refused, so split them into separate calls.

A command line names the folder when it contains any of these:

- **The variable.** `CLAUDE_PLUGIN_DATA` in any spelling the shell reads the same way: `$CLAUDE_PLUGIN_DATA`, `"${CLAUDE_PLUGIN_DATA}"`, split by quotes, escaped with `\`, written as `$'...'`, or inside a here-doc or `$(...)`. This counts whether or not the variable is set.
- **The path.** The folder's path or real path in any letter case, also written as `~/...`, `$HOME/...` or `${HOME}/...`, and also when it is glued to an option (`-C/path`).
- **A path that leads there.** Any word, or path inside a word (inline `python`, `node`, `perl` or `ruby` code included), that resolves into the folder. Relative paths are resolved from the current folder after each `cd`, and symlinks that point into the folder are followed.

So these are all refused, along with `>`, `cp`, `tee`, `rm`, `mv` and `sed -i`, which were refused before: `echo x > $CLAUDE_PLUGIN_DATA/events.jsonl`, `D=<folder>; echo x > $D/x`, `cd <folder>` followed by anything, `touch`, `mkdir -p`, `chmod`, `chown`, `sort -o`, `git -C <folder> init`, `tar -C <folder>`, `python3 -c "open('<folder>/x','w')"`, a here-doc that writes a script naming the folder, `ls <folder> | xargs rm`, and `board.sh` run with `CLAUDE_PLUGIN_DATA=...`. The manager, the main session and agents that are not crew keep their earlier rules.

**This is a seatbelt, not a sandbox, here too.** The guard reads the command's text. It does not catch:

- a path built while the command runs, for example with `printf`, `base64 -d`, string joins in inline code, or a variable that holds only part of the path;
- a script written to another place in an earlier call and then run (`bash /tmp/w.sh`);
- a program that finds the folder by itself, for example from its own environment. When this was written (2026-11-01), Claude Code did not set `CLAUDE_PLUGIN_DATA` in an agent's shell;
- moving or replacing a folder that holds the data folder, unless that folder is under `~/.claude/plugins`, which stays protected.

The Write and Edit rules above do not depend on the text, because those tools name their file directly.

## What the guard looks through

It reads past quoting, `$'..'`, `${IFS}`, `{a,b}` expansion, `&&`, `;` and `|` chains, subshells, `env`, `sudo`, `xargs` and `env -S` wrappers, `git -C`, `bash -c`, `eval`, `$(...)`, here-strings, pipes into a shell, `find -exec`, and inline `python`, `node` or `perl` code given with `-c` or `-e`. It blocks shell functions and aliases that mention these programs, and programs named by a variable. A script that is written and run in the same command is blocked. `projects.mjs set` from a shell asks you.

Wildcards, look-alike letters (also written as `$'\x..'` escapes) and pattern syntax in a write target are checked against every protected file, as if dot files always match. Near a protected folder, the guard refuses instead of guessing. Unpacking an archive or copying from a file list (`tar -x`, `unzip`, `ditto -x`, `pax -r`, `cpio -i`, `7z x`, `rsync --files-from`) is refused for every caller when the destination is at or above a protected root, such as the project root, `~/.claude` or your home folder. Unpack into a subfolder such as `./build` instead.

## What the guard cannot do

- **It cannot see inside a script file.** If a role writes `/tmp/w.sh` and then runs `bash /tmp/w.sh`, the guard sees only the second command.
- **It cannot see a path that is built while a command runs.** This applies to the plugin data folder too (see [The data folder from the shell](#the-data-folder-from-the-shell)).
- **It cannot see what a tool does by itself.** It checks the call, not what the program does afterwards.
- **It does not check your own commands.** Commands you type with `!` and actions on GitHub's website skip the guard, so you can always merge yourself.
- **A tool list alone does not make a role read-only.** Turning on `memory: project` adds Write back to an agent's tools. On Claude Code 2.1.309, Stuart (declared Read, Grep, Glob) got Read, Write, Grep and Glob. So for read-only roles, the guard is the lock on writes.
- **It does not read files outside the matched tools.** Glob is not matched.

## Where to look in the code

- Rules: `plugin/hooks/guard.mjs`, with inline-code parsing in `plugin/hooks/inline-writes.mjs`.
- Which tools it runs on, the timeout and `onFailure`: `plugin/hooks/hooks.json`.
- Tests: `tests/hooks/*.test.mjs`. Run them with `node --test tests/hooks/*.test.mjs`.
- The roles and their settings: [how it works, section 2](how-it-works.md#2-teams-and-roles).
