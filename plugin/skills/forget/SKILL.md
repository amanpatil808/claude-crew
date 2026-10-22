---
description: Remove a project from the toon-crew project registry (the Crew Room's project list). With no argument, lists the registered projects.
argument-hint: "[project path or name]"
disable-model-invocation: true
---

Run exactly this command and show its output to the user. Pass the argument as a single literal value.

```
node --no-warnings "${CLAUDE_PLUGIN_ROOT}/hooks/projects.mjs" forget "${CLAUDE_PLUGIN_DATA}" "$ARGUMENTS"
```

Notes for the reply:
- With no argument the command lists registered projects; ask the user which one to forget.
- The entry comes back the next time a session opens in that project.
- This only edits the registry file; it never touches the project itself.
