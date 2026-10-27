---
name: branch-from-origin
description: Fetch and branch from origin/main, not local main; local main in this repo lagged origin by many merged PRs
metadata:
  type: feedback
---

Run `git fetch` and branch from `origin/main` before the first wave; never trust local `main`. [crew] (seen 1)

**Why:** on 2026-10-27, local main was 15 commits behind origin (plugin 0.2.2 vs 0.3.2). Shizuka's first diagrams described the old version, which cost a whole extra round.

**How to apply:** at step 2 of every job, compare `git log main..origin/main` and rebase if it isn't empty. Also brief writers to grep the branch for a feature before documenting it, because the installed plugin cache can be newer than the branch.

Related: board tests in plugin/board/test/tasks.test.ts (67, 69, 70, 72) failed locally on origin/main on 2026-10-27, even though CI on main passed the day before. They look date-dependent. [project]
