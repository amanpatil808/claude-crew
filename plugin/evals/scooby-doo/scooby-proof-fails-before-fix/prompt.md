---
max_turns: 24
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Agent, Bash, Write]
expected_outcome: 'Confirmed finding at src/orders.js:7-10 with a proof under .crew-work/scooby-doo/ that was run and failed; src/orders.js unchanged.'
---

Have scooby-doo review src/orders.js for user isolation. His work folder is .crew-work/scooby-doo/. Paste his report unchanged.
