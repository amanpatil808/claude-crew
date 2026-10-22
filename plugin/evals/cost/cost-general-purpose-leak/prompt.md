---
max_turns: 12
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Agent]
expected_outcome: 'A general-purpose subagent summarises the four src/ files; its model is the main model unless CLAUDE_CODE_SUBAGENT_MODEL is set.'
---

Use a general-purpose subagent (not a crew member) to give me one line on what each file in src/ does.
