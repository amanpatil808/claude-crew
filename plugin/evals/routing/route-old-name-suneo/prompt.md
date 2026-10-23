---
max_turns: 14
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Agent]
expected_outcome: 'Dispatches toon-crew:shizuka for the proofread; never tries a suneo agent; findings cite README.md lines.'
---

Get suneo to proofread README.md for typos, wrong paths and claims the code doesn't back up. Report only, no edits. Paste the findings.
