---
description: Show or change this project's opt-in flags for the Crew Room board (board) and weekly lessons (lessons). Both are off until you turn them on.
argument-hint: "[board|lessons] [on|off]"
disable-model-invocation: true
---

Run exactly this command and show its output. The arguments are the flag and on/off, for example `board on`. With no arguments it shows the current flags for this project.

```
node --no-warnings "${CLAUDE_PLUGIN_ROOT}/hooks/projects.mjs" set "${CLAUDE_PLUGIN_DATA}" "${CLAUDE_PROJECT_DIR}" $ARGUMENTS
```

Notes for the reply:
- `board on` lets the Crew Room poll this project (gh, ssh); `lessons on` includes it in the weekly lessons pass. Both default to off.
- Only the owner decides these. Never turn a flag on unless the user asked for exactly that.
- The flags live in the plugin's project registry; nothing in the project itself changes.
