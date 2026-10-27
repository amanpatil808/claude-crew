---
name: brief-rules
description: Briefing lessons from the 1.0.0 release run, covering read-only roles, worktree bases and checking a fix before prescribing it
metadata:
  type: feedback
---

- Never brief a read-only role (joe-gardner, twenty-two, stuart, nobita, dekisugi, olaf, ninja-hattori) to edit a repo file. The guard blocks it, and having another role apply the text looks like laundering. Have them report, and send the edit to a writer role. [crew] (seen 1)
- Worktree builders start from main when no `worktree.baseRef` is set. Their "failures" may already be fixed on the branch, so always re-run checks after bringing work into the branch. [crew] (seen 2)
- Before prescribing a fix, read the reference file the brief points at. An eval case.yaml fix was wrong because the cases use a case.yaml + prompt.md split. [crew] (seen 1)

- When bringing a worktree's files into the branch, list the paths literally. zsh doesn't word-split an unquoted `$VAR`, so a loop over a multi-line variable becomes one path, and `mkdir -p $(dirname ...)` then creates empty folders with the files' names. `find -delete` is guard-blocked; use `rmdir` with the explicit paths. [project] (seen 1)

- Before shipping a metric built from cumulative counters, test it against a real long-lived session, not only fresh demo data. The 0.3.3 cost "Today" put a whole session's lifetime ($787, 2.75B cache reads) into today because the first snapshot had nothing to subtract. Bucket by event timestamps, and show cache reads apart from other tokens. [crew] (seen 1)

- Queue the WHOLE plan on the board at planning time, including later waves, reviews, QA and merges, not each piece right before dispatch. Otherwise Queued is always empty; the owner reported it as broken on 2026-10-28. [project] (seen 1)

**Why:** each of these cost an extra round on 2026-10-27.
**How to apply:** check all three while writing a brief.
