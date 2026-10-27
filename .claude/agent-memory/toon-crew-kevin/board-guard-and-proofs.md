---
name: board-guard-and-proofs
description: How to work around the toon-crew guard hook in Bash, and how to prove board security fixes fail on old code (shims, child processes, timeouts)
metadata:
  type: feedback
---

- In Bash, never use heredocs, shell variables as program arguments, or the word "function" in a grep pattern. Why: the toon-crew guard blocks them as "shell function definitions" or as "a computed argument". Use the Edit/Write tools and literal absolute paths instead. (seen 3) [project]
- When a fix adds an export, the new test fails at import on old code, so it proves nothing about behaviour. Also run the behaviour tests on a `git archive <old sha>` copy in the scratchpad, with only the missing exports added, to show each one fails on old logic. (seen 1) [crew]
- An HTTP test against a handler that may throw needs a request timeout (`request({timeout})` plus `destroy` on "timeout"). Why: an uncaught throw never answers, so node:test hangs instead of failing. (seen 1) [crew]
- Measure memory, hangs (FIFO open) and peak RSS in a child process (`process.resourceUsage().maxRSS`, `spawnSync` with a timeout), and assert extra RSS over a 0-byte baseline. Why: the test runner's own heap hides the signal. (seen 1) [crew]
- Records keyed by outside names (project, task id) go through lib/records.ts putOwn/getOwn, not `o[k] = v`. Why: "__proto__" replaces the prototype, and Object.create(null) breaks deepEqual tests. (seen 1) [project]
- server.ts listens only under `import.meta.main`, and handle(req, res, state) takes an injectable builder, so tests import it without starting a server. (seen 1) [project]
