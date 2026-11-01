---
description: Add or update a "Compact instructions" section in this project's CLAUDE.md, so /compact and auto-compact keep what the crew needs (branch, PRs, board tasks, pending decisions). Shows the text and asks before writing.
disable-model-invocation: true
---

Set up crew-friendly "Compact instructions" in this project's `CLAUDE.md`. Claude Code documents a "Compact instructions" section in CLAUDE.md as the way to control what is kept when it summarizes a long conversation (https://code.claude.com/docs/en/costs#manage-context-proactively and https://code.claude.com/docs/en/how-claude-code-works#when-context-fills-up). A plugin cannot supply this text itself, so this skill writes it into the project file, where the owner can edit it.

The default section is exactly this:

```markdown
## Compact instructions

When compacting, always keep:
- the current git branch, and open PR numbers with their state
- running and queued board tasks
- the owner's pending decisions, and their exact words for any approval
- the paths of the latest hand-back summaries
- file paths and commands still needed for the current work

Drop old test output, diffs, screenshots and full hand-back reports (they live in files). End with the next step.
```

Steps:
1. Look for `CLAUDE.md` in the project root (`${CLAUDE_PROJECT_DIR}`). Read it all. Look for a heading called "Compact instructions" (any heading level, any capital letters). The section runs to the next heading of the same or a higher level.
2. Show the user the default section above. If the section already exists, show their current text next to it.
3. Ask before writing. Offer only the choices that fit:
   - No `CLAUDE.md` yet: "Create CLAUDE.md with this section?" Create the file only on a yes.
   - File exists, no such section: "Add this section at the end of CLAUDE.md?"
   - Section exists: "Keep yours as it is", "add the default lines under yours", or "replace yours with the default". Replace only when the user picks replace. Never merge or reword their text on your own.
4. Write with the Edit tool, only inside that section (or at the end of the file for a new one). Do not change any other section, spacing or heading. Show what changed.
5. Tell the user:
   - The text is plain Markdown in `CLAUDE.md`; edit it any time, for example to add things this project must never lose.
   - The edit is certain to apply from the next session you start. The Claude Code docs do not say whether a session that is already open picks it up.
   - Claude Code re-reads the project-root `CLAUDE.md` from disk after a compaction ("What survives compaction": https://code.claude.com/docs/en/context-window#what-survives-compaction).
   - For a one-off, `/compact` accepts a focus, for example `/compact focus on the open PRs`.

Rules:
- If the user says no, change nothing and say so.
- Do not touch files other than `CLAUDE.md`. Do not commit.
