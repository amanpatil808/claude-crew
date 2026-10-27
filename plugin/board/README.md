# Crew Room board

A local page that shows the whole crew across every project you work on: who is working where, hand-backs, and (per project, optional) CI, pull requests, commits and deploys. It listens on `127.0.0.1` only and reads an event log the plugin's hooks write.

Diagrams of how the board fits into the plugin and the crew's workflow: see [How it works](../../README.md#how-it-works) in the main README.

## Start it

```bash
CLAUDE_PLUGIN_DATA="${CLAUDE_PLUGIN_DATA}" bash "${CLAUDE_PLUGIN_ROOT}/board/board.sh" start
```

This is the exact command a `/toon-crew:board` skill should run (in the skill text, `${CLAUDE_PLUGIN_ROOT}` and `${CLAUDE_PLUGIN_DATA}` are filled in). It prints `{"pid":..,"port":..}`; open `http://127.0.0.1:<port>`. The port is the first free one from 8811 (`BOARD_PORT=8830` starts the search there).

Other commands: `board.sh stop`, `board.sh status`, `board.sh export [--dry]`, `board.sh task ...` (below), `board.sh test`.

## Where things live

| What | Where |
|---|---|
| Events, snapshots, `server.json`, `server.log` | `$CLAUDE_PLUGIN_DATA`, or `~/.toon-crew` when started by hand (override: `BOARD_LOG_DIR`) |
| Project registry (written by the hooks) | `$CLAUDE_PLUGIN_DATA/projects.json`: `[{ path, name, firstSeen, lastSeen }]` |
| Agent definitions (model, effort, colour, turns, version) | `$CLAUDE_PLUGIN_ROOT/agents/*.md` |
| Per-project poller state | `<data>/projects/<project-key>/` |

If the hooks and `board.sh` see different data folders, the board shows nothing. Always start it with the command above.

## Projects and optional pollers

Every event carries `project` (the registry name for `CLAUDE_PROJECT_DIR`, else the folder name). A project is polled only if its `.claude/crew/project.md` has a `## Board` section:

```markdown
## Board
- github: owner/repo
- branches: main, feat/x
- deploy-ssh: user@host
- deploy-result: /var/lib/app/result
- deploy-log: ~/app/deploy.log
- deploy-containers: app-api-1, app-worker-1
```

`github` turns on CI, PR and commit polling (needs `gh`); `deploy-ssh` plus `deploy-result` turns on the deploy check (read-only ssh). Values are checked against strict patterns. No section, no poller.

**Approval.** `project.md` is checked into the repo, so a cloned repo must not make the board run `gh` or `ssh`. A project is polled only if its row in `projects.json` has `"board": true` (set by hand; default off). `deploy-ssh` may not start with `-`, and the ssh command passes `--` before the host. Projects with the same name are shown as `name (parent-folder)`, and each project's state folder is keyed by a hash of its path. A `projects.json` that is not valid JSON is copied to `projects.json.bak`, a warning is logged, and no projects are shown until it is fixed. Board data files are created `0600`, folders `0700`.

## `/api/state` (additions for the screen)

`projects[]` (`{ path, name, firstSeen?, lastSeen?, working, polled }`; `working` is the project's number of active tasks), `focus` (project of the newest event), `snapshots` (per project name: `ci`, `prs`, `commits`, `deploy`, `errors`, `polledAt`, `problems`), top-level `ci/prs/commits/deploy/errors/polledAt/problems` (the focus project's), `room.members[].project`, `room.roles[].color`, `room.retired[]` (`{ id, name, show, mergedInto }`).

`rooms` is `{ [projectName]: { members, managerBusy, managerActive } }`: each project has its own crew, built from that project's events only (same fields as `room.members`; `project` is always set). A role is `working` when the project has an active task for it or one of its agents runs there, else `done`/`idle`. Doraemon's `managerBusy`/`managerActive` come from that project's own heartbeat and turn-end events. Included: every registered project and every project with an event in the last 7 days. `room` (one merged room) stays for compatibility.

Example (made-up):

```json
"rooms": { "shop": { "managerBusy": true, "managerActive": true, "members": [
  { "id": "doraemon", "status": "working", "line": "Working now", "project": "shop" },
  { "id": "bob", "status": "working", "line": "add cart route", "project": "shop" },
  { "id": "kevin", "status": "idle", "line": "Idle", "project": "shop" } ] },
  "blog": { "managerBusy": false, "managerActive": false, "members": [
  { "id": "bob", "status": "done", "line": "Fixed feed", "project": "blog" } ] } }
```

## Tasks

Tasks are derived from the event log (kinds `task-queue`, `task-start`, `task-done`, `task-drop`, plus `assign` and `agent-stop`); nothing else is stored. The manager queues work with:

```bash
board.sh task add --role <id> [--priority P0|P1|P2] [--ref <branch|PR>] "<text>"
board.sh task start <id>          # queued -> active
board.sh task done <id> [--ref <branch|PR>]
board.sh task drop <id>           # hidden from the board
board.sh task list [--all] [--json]
```

- `add` prints `queued t-<ms>-<hex>`. The role must be a roster id (an unknown one is refused and the ids are listed). The text is redacted, then clipped to 120 characters.
- The project is the registry name for `CLAUDE_PROJECT_DIR`, else the current folder. `list` shows that project; `--all` shows every project.
- An `assign` to role R in project P makes the oldest queued task for (P, R) active; with none queued, the assign itself becomes an active task (its text, no priority). Tasks are bound to agents: the first `agent-start` of role R in project P after an assign binds the newest unbound active task for (P, R) to that agent id (a resume binds the task it re-opens to the resumed agent). An `agent-stop` finishes the task bound to its agent id; only an agent with no bound task at all falls back to the oldest unbound active task for (P, R). One missed stop therefore no longer shifts every later stop onto the wrong task. Safety net: an active task with no activity for 6 hours (`STALE_AFTER_MS` in `lib/tasks.ts`) is shown as done with `stale: true`; activity is the task's start or, once bound, any event carrying its agent id (`doneAt` = last activity + 6 h). `/api/state` measures to the wall clock; `deriveTasks` without a `now` measures to the newest event in the log.
- `/api/state` gets `tasks: { active, queued, done }` across all projects: `active` oldest first, `queued` by priority (P0, P1, P2, none) then oldest, `done` the last 10 newest first. A task is `{ id, project, role, priority?, text, state, queuedAt?, startedAt?, doneAt?, ref? }`. The page filters by project. An active task may carry `modelOverride` (the assign's `model`, only when it differs from the agent file's). Task rules: an assign with `toId` (a SendMessage resume) never makes a task, it re-opens that role's latest done task in the same project if it finished within 30 minutes, else nothing; an assign within 5 s after the same role's stop in the same project, with no agent-start between, is ignored (a foreground Agent call reports after the stop).
- `room.feed[]` items carry `project` (from the event, absent when the event had none). `/api/state.factsByProject` is `{ [projectName]: RoomFact[] }` for every registered project: `Live` (from that project's deploy snapshot) and `Branch` (from its path), e.g. `{ "shop": [{ "label": "Live", "value": "v1.4.0", "tone": "ok" }, { "label": "Branch", "value": "feat/cart" }] }`. The top-level `room.facts` (the focus project, with `Working`) is unchanged.

## Test

`board/board.sh test` (or `node --no-warnings --test board/test/*.test.ts`). Tests use a throwaway data folder.
