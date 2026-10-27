# Joe Gardner memory

- A brief-authorised repo edit can still be blocked by the toon-crew guard hook: the joe-gardner role only allows Write to its memory file and the temp dir, so the README edit was stopped and the text staged in the temp work folder for the manager to apply (seen 1) [crew]. Why: the hook is the role's real boundary even when the brief names a file. How to apply: when a brief asks for a repo doc edit, try it once, and if the hook blocks, stage the exact text in the work folder and report it instead of working around the hook.
- Shell writes under a literal temp path can still trip the guard; use plain absolute temp paths for mkdir and redirects, not `${TMPDIR:-...}` expansions (seen 1) [crew].
- `claude plugin eval` exits 1 when any case file fails to load, even if every selected case passes; read the "case file(s) failed to load" line before reporting the exit code (seen 1) [project].
- Eval cases are split in two: case.yaml holds 6 lines of metadata, and prompt.md holds the limits, tools and prompt. A case with both in one file fails with "case.yaml must be a YAML object" (twenty-two's was split on 2026-10-27). For a free load check, run `claude plugin eval . --case zzz-nomatch ...` in a copy of plugin/. (seen 1) [project]
- For release checks, the brief must not ask a read-only role to edit repo files; the guard blocks it. Report the results and let a writer role apply them. (seen 1) [crew]
- Smoke run on 2026-10-27 with claude 2.1.311: 5 cases, all 1.00, $1.72 total, about 308 s (seen 1) [project].
