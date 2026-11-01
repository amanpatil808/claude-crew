---
name: cost-baseline
description: Baseline of Doraemon's plan share before 0.3.14 (hand-back files, compact reminder, compact instructions); owner wants proof of a 30% saving
metadata:
  type: project
---

Baseline on 2026-11-01, before 0.3.14: Doraemon (main session) was 64.6% of the weighted usage in the 5-hour and weekly windows. Source: Bob's independent recount of the transcripts; the board showed 68.3% because some agents were still running. His usage was 51.7% cache reads, 44.4% cache writes and 4% output. This session had run since 2026-10-28.

**Why:** the owner said "let's test this and see if it saves 30%". The extra ideas (start-of-session hook, Sonnet checker, script-run waves) are on hold until this result is in.

**How to apply:** about a week after 0.3.14 is installed, compare Doraemon's share on the plan panel, and re-run a transcript recount like Bob's. Success is about a 30% drop in his weighted usage per working day, not just a lower share (shares move when other agents' usage changes). Report the numbers before proposing anything else.
