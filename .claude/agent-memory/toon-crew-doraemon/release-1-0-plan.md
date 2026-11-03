---
name: release-1-0-plan
description: Owner tests everything first; first public release will be 1.0.0; until then versions stay 0.x.x and nothing is released
metadata:
  type: project
---

1.0.0 merged to main on 2026-11-02 (PR #23, merge 0e6e2a2) after the owner's "yes i am good le relase 1.0.0 now". Then, by his choice: rewrite history in place (no-reply email, Claude trailers out), make the repo public, protect main like a normal public repo, and look into listing it in Anthropic's plugin directory. The guard refuses force pushes for every role, so the owner runs the rewrite push himself.

Done 2026-11-02: history rewritten (owner pushed), repo public, v1.0.0 tag and release, 1.0.1 merged (PR #24: tests out of plugin/, TC icon, README "What it changes"), submitted to the Claude directory (claude.ai/directory/manage). Pending: main rulesets (guard blocks agents; owner applies from a desk via Settings → Rules, JSON in the session scratchpad), v1.0.1 tag (owner said only "merge"), flaky tests/board/refresh.test.ts (Bob, P1). The directory polls main about every 6 h, so every push to main becomes a new version to review: batch changes. 2026-11-03: owner does not want launch posts anywhere (Reddit, HN, X, awesome lists) for now; don't suggest them again unless he asks about growth.

**Why:** owner, 2026-11-01 night: "dont release anything we will have it test first and release 1.0.0 there then; lets use 0.x.x".

**How to apply:** keep PR #23 open as the 0.x work branch; finish fixes, checks and the README, then hand him a test plan. Ask before any merge, even after "merge" earlier in the day; the 1.0.0 bump, history rewrite and "make it public" come only on his word after his test.

README style he asked for at the same time: balance images and text, no wall of either, keep it tight, consistent wording between pictures and copy (see [[feedback-short-tested-docs]]).
