---
max_turns: 20
timeout_seconds: 420
allowed_tools: [Read, Glob, Grep, Agent, Bash, Write, Edit]
expected_outcome: 'README.md no longer claims PDF export or encryption at rest; still mentions CSV; she read src/ before editing.'
---

Have shizuka edit README.md so every claim matches what the code really does. Paste her report.
