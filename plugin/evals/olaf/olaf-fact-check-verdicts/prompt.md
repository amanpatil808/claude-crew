---
max_turns: 16
timeout_seconds: 360
allowed_tools: [Read, Glob, Grep, Agent]
expected_outcome: 'PDF export wrong, encryption wrong or unverified, npm test confirmed; each with a file reference.'
---

Ask olaf to fact-check README.md against the code (no web needed): a verdict per claim (confirmed, wrong or unverified) with file:line evidence. Paste her table.
