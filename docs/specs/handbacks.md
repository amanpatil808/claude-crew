# Hand-back files (contract, 0.3.14)

The owner's rule: every crew agent writes two files per task, a full report and a short summary, in two separate folders. Only the summary comes back into Doraemon's conversation. Doraemon reads the summaries whenever he needs them, even after `/clear`. When something looks missing, he reads the full report (and anything else he needs).

## Where

Per project, under the plugin's data folder (private to the owner's machine, never in git, survives `/clear` and new sessions):

```
<CLAUDE_PLUGIN_DATA>/projects/<project key>/handbacks/
  full/<agent id>/<YYYYMMDD-HHMM>-<slug>.md        the complete report: everything the agent would have said
  summaries/<agent id>/<YYYYMMDD-HHMM>-<slug>.md   the short summary (format below)
```

- `<project key>` is the same key the board uses (`projectStateDir(key)` in plugin/board/lib/paths.ts).
- `<agent id>` is the crew id (`kevin`, `joe-gardner`, ...). A second copy of a role uses the same folder.
- `<slug>`: lower-case a-z, 0-9 and `-`, at most 40 characters, from the task.
- Both files of one task share the same name. Files are owner-only (0600), folders 0700.
- Doraemon puts both exact paths in every brief. The agent never invents the folder.

## Summary file (also the agent's final message to Doraemon)

At most 12 lines:

```
Verdict: done | blocked | needs decision
Task: <one line>
Files: <changed files, comma separated, or "none">
Checks: <suite: pass/fail/skip counts>, lint, typecheck (or "not run: why")
Worktree: <path or "none">
Risks: <1-2 lines, highest first, or "none">
Decisions: <question for the owner or Doraemon, or "none">
Full report: <absolute path of the full file>
```

## Full report

Everything the role's own report format asks for (findings, evidence, screenshots paths, lessons, open questions), with no length limit.

## Who may write

- Every crew role may create and edit `.md` files only inside its OWN `full/<agent id>/` and `summaries/<agent id>/` folders, including the read-only roles. Nothing else under the data folder.
- The guard enforces it by realpath, refuses symlinks and other roles' folders, and keeps every other rule.

## Tools

- `board.sh handbacks dir --project <dir>`: prints the project's handbacks folder (Doraemon uses it to write briefs; his Bash has no CLAUDE_PLUGIN_DATA).
- `board.sh handbacks list --project <dir> [--agent <id>] [--limit n]`: newest summaries first (path and first lines).
- The board server deletes hand-back files older than 60 days once a day.
