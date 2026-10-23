---
max_turns: 24
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Agent, Bash, Write, Edit]
expected_outcome: 'Hand-back names a worktree, shows npm test with the cap test passing, lists a spec gap (negative or >1 discounts).'
---

Have bob make applyDiscount respect the 50% business rule stated in src/cart.js, so the failing test passes. Paste his hand-back.
