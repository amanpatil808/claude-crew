---
max_turns: 24
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Agent, Bash, Write]
expected_outcome: 'Confirmed finding at src/orders.js:7-10 with a proof under .crew-work/ninja-hattori/ that was run and failed; src/orders.js unchanged.'
---

Have ninja-hattori review src/orders.js for user isolation. His work folder is .crew-work/ninja-hattori/. Paste his report unchanged.
