---
name: directory-review-lessons
description: How to write the "what it changes on your machine" statement for directory policy holds, and which facts to cite
metadata:
  type: project
---

- A directory "policy hold" answer goes in the README as a short section; cite the code header that states the scope (plan-mod.mjs:6 says its only calls are `$.clock.now` and `$.env.set`). Why: reviewers check the claim against the file. (seen 1) [project]
- "No network calls of its own" holds only after a grep for outbound calls: the only hits are the board page's `fetch("/api/state")` to its own 127.0.0.1 server (room.js:1500) and gh/ssh via execFile (run.ts). Re-run the grep before repeating the claim. (seen 1) [project]
- Release bumps touch three places that `scripts/check-structure.mjs` compares: plugin.json version, README badge, top CHANGELOG heading. (seen 1) [project]
- When a brief states a changelog fact about work done by another agent (for example "tests moved"), check the tree; say in the report if it is not yet true on the branch. (seen 1) [crew]
