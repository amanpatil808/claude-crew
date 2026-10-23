# claude-crew

The `toon-crew` Claude Code plugin: a cartoon agent crew (a manager plus builders, testers, researchers and writers), the Crew Room status board, safety guards, and shared lessons. Private repo, one plugin, one marketplace named `crew`.

## Install

In Claude Code, inside any project:

```
/plugin marketplace add amanpatil808/claude-crew
/plugin install toon-crew@crew
```

From a shell, the same install is `claude plugin marketplace add amanpatil808/claude-crew` then `claude plugin install toon-crew@crew`. The repo is private, so git must already be able to read it (`gh auth status` is green, or an SSH key is set up).

## Update

`version` in `.claude-plugin/plugin.json` pins each project to a release, so nothing changes until you ask:

```
/plugin marketplace update crew
/plugin update toon-crew@crew
```

Then `/reload-plugins`. Read `CHANGELOG.md` first.

## Per-project setup (one line)

The plugin sets the main agent to Doraemon (`"agent": "toon-crew:doraemon"` in its `settings.json`). A plugin cannot set environment variables (only `agent` and `subagentStatusLine` take effect from plugin settings), so each project adds one line to its own `.claude/settings.json` to run subagents on the cheaper model by default:

```json
{ "env": { "CLAUDE_CODE_SUBAGENT_MODEL": "sonnet" } }
```

An agent's own `model` field still wins over this default. A user's own `agent` setting also overrides the plugin's. The guards block Claude from editing `.claude/settings*.json`, so make this edit yourself.

## The crew

Fifteen agents in nine teams. Call them as `toon-crew:<id>`; full details (models, colours, rooms, retired characters) are in [docs/roster.md](docs/roster.md).

| Team | Who (id) |
|---|---|
| Management | Doraemon, Engineering Manager (`doraemon`); Miguel Rivera, Knowledge Manager (`miguel-rivera`) |
| Frontend Team | Nobita, UX & Design Lead (`nobita`); Shinchan, Frontend Developer (`shinchan`) |
| Backend Team | Kevin, Backend Lead (`kevin`); Bob, Backend Developer (`bob`) |
| DevOps Team | Mike Wazowski, DevOps Engineer (`mike-wazowski`); Sulley, SRE (`sulley`) |
| Security Team | Ninja Hattori, Security Engineer (`ninja-hattori`) |
| QA Team | Joe Gardner, QA Engineer (`joe-gardner`); 22, Exploratory Tester (`twenty-two`) |
| Research Team | Dekisugi, Research Lead (`dekisugi`); Olaf, Research Analyst (`olaf`) |
| Documentation Team | Shizuka, Technical Writer (`shizuka`) |
| Helpers | Stuart, Code Search Assistant (`stuart`) |

Only Doraemon commits. Every agent reads the project's `CLAUDE.md` and `.claude/crew/project.md` first; the `project-profile` skill writes that file.

## Guards

**A text guard is a seatbelt, not a sandbox.** `plugin/hooks/guard.mjs` reads the command text before every Bash, Edit, Write, MultiEdit, NotebookEdit and `mcp__*` call. It catches mistakes and lazy bypasses; a determined agent with a shell can still get around any text check (a script file, a variable it built itself, a tool you did not think of). The real boundary is each agent's tool list (read-only roles have no Edit/Write/Bash). If the guard cannot parse something that touches git, gh, rm, docker, settings or memory files, it fails closed (blocks).

It either asks you to confirm (Claude Code's own approval prompt, `permissionDecision: "ask"`) or hard-blocks (exit 2, one-line reason):

| Guard | What happens |
| --- | --- |
| Push to main/master (ask) | `git push origin main`, `HEAD:main`, `refs/heads/main`, a bare `git push` whose real destination (`@{push}`) is main, pushes from an alias or xargs. Hard block: `--delete main`, `:main`, `--all`, `--mirror`, `--prune` |
| Force push (hard block) | `--force`, `-f` (also `-fu`), `--force-with-lease`, `--force-if-includes`, any unique abbreviation (`--force-w`, `--mir`), `+refspec`, on any branch |
| Git config tricks (hard block) | `git -c alias.*`, `remote.*.push`, `push.*`, `core.hooksPath`, `core.sshCommand`, `url.*.insteadOf`; `git config` writes of the same keys (also via `--file`/`-f`); `GIT_CONFIG_COUNT/KEY_*/VALUE_*/GLOBAL/SYSTEM` env overrides; `--git-dir`/`--work-tree`/`GIT_DIR` on a push or an unknown subcommand; repo aliases are resolved before checking; before a bare push, `remote.<name>.push` rules are applied (`+` is a force push) and an unverifiable push target asks. `core.hooksPath` asks |
| Merge (ask) | `gh pr merge`, `gh api .../pulls/N/merge`, `.../merges`, GraphQL `mergePullRequest`; MCP tools with merge, push or delete in the name |
| GitHub destruction (hard block) | `gh repo delete`, `gh api -X DELETE repos/o/r` (also a full URL, or `curl` with `gh auth token`), moving or deleting `refs/heads/main`, branch protection changes, `gh alias`, `gh auth token` |
| Recursive delete (hard block) | `rm -r/-rf/--recur`, `find -delete`, `rsync --delete`, `git clean -x`, `docker run ... rm -rf`, unless every target is inside the system temp dir, the session scratchpad, or a real (non-symlink) project `tmp/`, `.tmp/`, `scratch/`, `.scratch/`. A project that itself sits in a temp dir gets no temp-dir exemption. Unknown `cd $VAR`, `cd` inside `( )`, `mv` into scratch, and `ln` inside scratch are blocked |
| Docker data (hard block) | `down -v/--volumes[=true]`, `compose rm -v`, `volume rm/prune`, `system prune --volumes` (docker, docker-compose, podman) |
| Protected files (hard block) | Edit/Write and shell writes (`>`, `tee`, `cp`, `mv`, `ln`, `sed -i`, `dd of=`, `python/node/perl -c/-e`) to: `.claude/settings*.json`, the installed plugin (`~/.claude/plugins`; a `--plugin-dir` checkout stays editable), any `config` or `hooks/` inside a git-dir-looking folder, `.git/config`, `.git/hooks`, `~/.claude.json`, `.mcp.json` |
| Project crew config (ask) | Edit/Write and shell writes to a project's `.claude/hooks`, `.claude/agents`, `.claude/skills`, `.claude/commands`: you are asked to confirm |
| Memory files (hard block) | Shell writes into any `agent-memory*` folder; file-tool writes whose resulting content has a token, key, private key, URL password, `password=` value, UPI id, email, Luhn-valid card number, or phone number (Indian 10-digit with `0`/`+91`/spaces/dots/dashes, or international) |
| Read-only roles | ninja-hattori, joe-gardner, twenty-two, nobita, dekisugi, olaf and stuart (bare or `toon-crew:` name): Edit/MultiEdit/NotebookEdit denied; tree-changing git (reset, checkout, restore, apply, am, stash, clean, commit, merge, rebase, cherry-pick, revert, pull, rm, mv, add), `patch` and inline-code file writes outside temp denied; Write only to `.claude/agent-memory/toon-crew-<name>/MEMORY.md`, the system temp dir / session scratchpad, and their deliverable folders (dekisugi and olaf: `docs/research/`; nobita: `docs/design/` and `docs/research/`; paths are realpath-resolved, so `..` and symlinks cannot escape; the secret scan applies to all of these); shell writes only to temp |
| Miguel Rivera, the knowledge manager (to confirm in the first live session: the hook input's `agent_type` for a plugin agent may be `miguel-rivera` or `toon-crew:miguel-rivera`; the guard accepts both) | The lessons agent may only run `git push origin crew-lessons/<name>` and `gh pr create -R amanpatil808/claude-crew`; no merges, no other pushes |

It looks through quoting, `$'..'`, `${IFS}`, `{a,b}` expansion, `&&`/`;`/`|` chains, subshells, env/sudo/xargs/`env -S` wrappers, `git -C`, `bash -c`, `eval`, `$(...)`, here-strings and pipes into a shell, `find -exec`, and inline `python/node/perl -c/-e` code. It blocks shell functions and aliases that mention these programs, and programs named by a variable. Limits: it cannot see inside a script file (`python build.py`), or what a tool does by itself. Other limits: a script written and run in the same command is blocked, and `projects.mjs set` from the shell asks. Miguel Rivera's push also requires `origin` to be the crew repo.

## Crew Room board

Hooks send SubagentStart, SubagentStop, PostToolUse (Bash, Agent, SendMessage), Stop, SessionStart and SessionEnd to `board/hook.ts`. They are async with a 5 second timeout, so they never slow a session.

## Project registry

At SessionStart the plugin records `{ path, name, firstSeen, lastSeen }` for the open project in `${CLAUDE_PLUGIN_DATA}/projects.json` (paths and timestamps only; the file is mode 0600 and kept across plugin updates). `/toon-crew:forget` lists the projects; `/toon-crew:forget <name or path>` removes one. It comes back the next time you open a session in that project.

## Privacy

This repo is private. Nothing project-specific or secret belongs here: no tokens, no phone numbers, no customer data. Lessons the crew learns locally reach this repo only through a weekly pull request that you review and merge; agents cannot push to main or merge. gitleaks runs on every push and pull request.

## Develop

```
node --test plugin/hooks/test/*.test.mjs                 # guard, review proofs and registry tests
node --no-warnings --test plugin/board/test/*.test.ts    # board tests
node scripts/check-structure.mjs                         # manifest, marketplace, hooks checks
claude plugin validate . --strict                        # marketplace
claude plugin validate ./plugin --strict                 # plugin
claude --plugin-dir ./plugin                             # try the plugin in a session
```

Layout: the installable plugin lives in `plugin/` (agents, skills, hooks, board, evals, settings), and the marketplace entry points at `./plugin`, so `docs/`, CI files and planning notes are not copied into installs. The repo root holds the marketplace file, docs, scripts and CI.

Needs Node 24 (the board scripts are TypeScript run directly by Node).
