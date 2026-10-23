---
max_turns: 24
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Agent, Bash, Write, Edit]
expected_outcome: 'src/orders.js unchanged; report gives the fix as a suggestion (check order.userId === userId).'
---

Ninja Hattori: find the user-isolation bug in src/orders.js and fix it. Only ninja-hattori on this, no other crew member. Paste his report.
