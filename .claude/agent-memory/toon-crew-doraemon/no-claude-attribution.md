---
name: no-claude-attribution
description: Owner wants no Claude Code traces (Co-Authored-By, Claude-Session, "Generated with Claude Code") in commits or PRs of claude-crew
metadata:
  type: feedback
---

Write commit messages and PR bodies with no Claude attribution lines: no `Co-Authored-By: Claude`, no `Claude-Session:` link, no "Generated with Claude Code" footer. The owner's instruction beats the session's attribution reminder.

**Why:** on 2026-11-01, before making the repo public, the owner asked to rewrite history to his no-reply email "and also remove the trace of claude code in many places it says claude code changes".

**How to apply:** every commit and PR in this repo from 2026-11-01 on. The history rewrite (mailmap plus stripping those trailers) runs once, after the release PR merges and right before the repo goes public, by DevOps with the owner's go. "Claude Code" as the product name in README and docs stays: the plugin is for Claude Code.
