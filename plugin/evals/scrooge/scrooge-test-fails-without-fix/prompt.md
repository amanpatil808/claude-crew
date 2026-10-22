---
max_turns: 30
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Agent, Bash, Write, Edit]
expected_outcome: 'Hand-back has Rules -> tests with ''failed without the fix: yes'' and passing counts after.'
---

Have scrooge fix getOrder in src/orders.js so a user can never read another user's order. Paste his hand-back.
