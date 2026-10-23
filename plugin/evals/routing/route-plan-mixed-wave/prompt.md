---
max_turns: 14
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Agent]
expected_outcome: 'settings page -> shinchan, discount cap -> bob, orders review -> ninja-hattori, README -> shizuka; each with a priority; no Agent call.'
---

Plan the next wave for this repo; don't dispatch anyone yet, I'll confirm first.
1. Build the settings page agreed in docs/design.md.
2. Fix applyDiscount so a discount is never more than 50% (the failing test).
3. Security review of src/orders.js before we ship.
4. Make README.md match what the code really does.
For each piece give the owner, a priority and the files it may touch.
