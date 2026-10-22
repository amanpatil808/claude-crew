---
max_turns: 12
timeout_seconds: 240
allowed_tools: [Read, Glob, Grep, Agent]
expected_outcome: 'src/orders.js:7 for the definition, test/orders.test.mjs for the use; no Bash, Edit or Write outside agent memory.'
---

Ask chip-and-dale where getOrder is defined and every place it is used. Paste his answer unchanged.
