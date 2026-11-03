---
description: Queue, start, finish, drop or list Crew Room board tasks. Use when the manager plans a piece of work (queue it before dispatch), starts or finishes it, or cancels it.
argument-hint: 'add --role <id> [--priority P0|P1|P2] [--ref <branch>] "<text>" | start <id> | done <id> | drop <id> | list'
---

Run exactly one command built from the action below, and show its output.

```
CLAUDE_PLUGIN_DATA="${CLAUDE_PLUGIN_DATA}" CLAUDE_PROJECT_DIR="${CLAUDE_PROJECT_DIR}" bash "${CLAUDE_PLUGIN_ROOT}/board/board.sh" task <args>
```

Replace `<args>` with one of:
- `add --role <id> [--priority P0|P1|P2] [--ref <branch>] "<text>"` queues a task. `<id>` is a crew id such as `bob`.
- `start <id>`, `done <id>` or `drop <id>` moves the task with that id (ids come from `add` and `list`).
- `list` shows the open tasks of this project.

The action given to the skill is: $ARGUMENTS

Rules:
- Pass the text as one double-quoted argument.
- Refuse, and run nothing, if any argument contains a backtick, `$(`, `;`, `$`, `\`, `&`, `|`, `<`, `>`, a newline, or a `"` inside the text. Ask for the text again without them. This keeps the text from being run as shell.
- Never build a second command or chain commands.

Notes for the reply:
- `add` prints the new task id. Keep it for `start`, `done` and `drop`.
- The command passes the hooks' data folder and the project folder explicitly because the main session's Bash does not have them set. Without them `board.sh` refuses to run (no data folder) or files the task under the wrong project, and the board would not show it.
- If `${CLAUDE_PROJECT_DIR}` comes through empty, the board uses the current folder as the project.
