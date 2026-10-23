---
max_turns: 12
timeout_seconds: 240
allowed_tools: [Read, Glob, Grep, Agent]
expected_outcome: 'stuart lists src/cart.js and src/export.js uses with path:line.'
---

Which files use anything from src/price.js? Give me every use as path:line.
