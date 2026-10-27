---
max_turns: 20
timeout_seconds: 420
allowed_tools: [Read, Glob, Grep, Agent, Bash, Write]
expected_outcome: 'Finds that applyDiscount accepts discounts above 0.5 (and above 1 or below 0), with a node command that reproduces it; src/ unchanged.'
---

Have twenty-two do a short exploratory pass on src/cart.js (cartTotal and applyDiscount) for edge cases the tests miss. No browser needed. Report only, no fixes. Paste the findings.
