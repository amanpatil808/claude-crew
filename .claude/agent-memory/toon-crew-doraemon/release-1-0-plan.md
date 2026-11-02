---
name: release-1-0-plan
description: Owner tests everything first; first public release will be 1.0.0; until then versions stay 0.x.x and nothing is released
metadata:
  type: project
---

Nothing is released (no merge to main, no public repo, no history rewrite) until the owner has tested the build himself. The first public release is 1.0.0; work before it stays on 0.x.x (0.3.15 now).

**Why:** owner, 2026-11-01 night: "dont release anything we will have it test first and release 1.0.0 there then; lets use 0.x.x".

**How to apply:** keep PR #23 open as the 0.x work branch; finish fixes, checks and the README, then hand him a test plan. Ask before any merge, even after "merge" earlier in the day; the 1.0.0 bump, history rewrite and "make it public" come only on his word after his test.

README style he asked for at the same time: balance images and text, no wall of either, keep it tight, consistent wording between pictures and copy (see [[feedback-short-tested-docs]]).
