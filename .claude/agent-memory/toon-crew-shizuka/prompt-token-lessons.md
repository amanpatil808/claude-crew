---
name: prompt-token-lessons
description: Lessons from the 2026-11-02 prompt token trim of plugin/agents/*.md (what the guard and skills allow)
metadata:
  type: project
---

- Read-only roles can Write only their own MEMORY.md, not topic files (plugin/hooks/guard.mjs:1143-1150), so "move detail into topic files" cannot be told to them as an action; tell them to flag it under Lessons. (seen 1) [project]
- The task skill says "run exactly one command, never chain" (plugin/skills/task/SKILL.md), so a doc cannot tell Doraemon to batch `task add` lines until the skill changes; say what is needed instead. (seen 1) [project]
- The guard blocks writing a script and running it in one Bash call, and inline code that mentions agent-memory or plugin files: write the script with Write, run it in a second call, use Edit for memory text. (seen 1) [project]
- Trimming "read X" steps adds words: bytes went up about 300 per agent file while runtime reads went down. Report bytes before and after, and say which way the saving goes. (seen 1) [crew]
- Claude Code's Edit needs a prior Read of the file; "never Read a memory file" wording needs a partial-read check. TODO(verify). (seen 1) [crew]
