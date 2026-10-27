---
description: Start, stop or check the Crew Room board, the live status page for the toon-crew agents. Use when the user asks to open, start, stop or check the board.
argument-hint: "[start|stop|status]"
disable-model-invocation: true
---

Run exactly one command, choosing the action from the user's request (default `start`), and show its output.

```
CLAUDE_PLUGIN_DATA="${CLAUDE_PLUGIN_DATA}" bash "${CLAUDE_PLUGIN_ROOT}/board/board.sh" start
```

Replace `start` with `stop` or `status` when asked. The action given to the skill is: $ARGUMENTS

Notes for the reply:
- `start` prints `{"pid":..,"port":..,"startedAt":..}`. Tell the user to open `http://127.0.0.1:<port>`.
- The hooks and this command use the same data folder (`${CLAUDE_PLUGIN_DATA}`), so events show up. Always start the board with this command, not by hand.
