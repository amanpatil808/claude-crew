---
max_turns: 16
timeout_seconds: 360
allowed_tools: [Read, Glob, Grep, Agent, Bash, Write, Edit]
expected_outcome: 'docs/board-facts.md has the fact verbatim and a UTC time; dorami ran date -u before the write.'
---

Ask dorami to record this confirmed fact in docs/board-facts.md (create it if needed): "tom finished the pre-PR checks: 3 pass, 1 fail, 1 skip". Include the time it was recorded.
