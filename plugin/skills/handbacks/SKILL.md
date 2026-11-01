---
description: Find or list crew hand-back files (full reports and short summaries) for this project. Use when the manager writes a brief (to get the hand-back folder) or catches up after /clear or in a new session (to list the newest summaries).
argument-hint: 'dir | list [--agent <id>] [--limit <n>]'
---

Run exactly one command built from the action below, and show its output.

```
CLAUDE_PLUGIN_DATA="${CLAUDE_PLUGIN_DATA}" bash "${CLAUDE_PLUGIN_ROOT}/board/board.sh" handbacks <args> --project "${CLAUDE_PROJECT_DIR}"
```

Replace `<args>` with one of:
- `dir` prints this project's hand-back folder. Brief paths are `<folder>/full/<agent>/<YYYYMMDD-HHMM>-<slug>.md` and `<folder>/summaries/<agent>/<YYYYMMDD-HHMM>-<slug>.md`.
- `list [--agent <id>] [--limit <n>]` prints the newest summaries first (path and first lines).

The action given to the skill is: $ARGUMENTS

Rules:
- `<id>` is a crew id such as `kevin`; `<n>` is a number. Refuse, and run nothing, if any argument contains a backtick, `$(`, `;`, `$`, `\`, `&`, `|`, `<`, `>`, a quote or a newline.
- Never build a second command or chain commands.

Notes for the reply:
- To read a summary or a full report, use the Read tool on the printed path.
- The command passes the hooks' data folder explicitly because the main session's Bash does not have it set.
