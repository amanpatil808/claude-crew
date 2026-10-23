# Changelog

All notable changes to toon-crew. Versions follow `version` in `.claude-plugin/plugin.json`; projects pin to a version and update on purpose.

## 0.2.1 - 23 Oct 2026: fixes from the Claude Code docs review

- Guard: new spawn rule. Only Doraemon (the main session) starts crew agents; Dekisugi may start only `toon-crew:olaf` or `toon-crew:stuart` (prefixed names only); other crew roles may not spawn. Agents outside the crew are unchanged.
- Guard fails closed: unreadable input or an internal error now blocks (exit 2, not exit 1). The guard hook sets `"onFailure": "block"`, so **Claude Code 2.1.295 or later is needed**.
- Guard matcher now also covers `Agent` and `Monitor` (Monitor runs shell commands).
- Read-only roles: `Agent` added to `disallowedTools` for stuart, joe-gardner, nobita, olaf and ninja-hattori. `memory:` adds Write back to their tools (seen on 2.1.309), so the guard is the lock on their writes.
- Doraemon never passes `model` when spawning, except the listed escalations (a per-call model beats the agent file).
- Board: records the declared and the effective model per spawn, and shows an "override" badge when they differ.
- Async board hooks no longer set a timeout (Claude Code doesn't enforce it on async hooks); `scripts/check-structure.mjs` requires timeouts only on blocking hooks.
- Docs: README corrects the `CLAUDE_CODE_SUBAGENT_MODEL` advice (it only affects agents without a model, so it doesn't make the crew cheaper) and says which settings go in each project; cost baseline and roster updated.

## 0.2.0 - 23 Oct 2026

Cast v2: the engineering crew re-cast with the owner's favourite cartoons (see `docs/planning/cast-v2.md`). 15 agents, every prompt tag now `(v0.4)`.

- New ids: miguel-rivera (Knowledge Manager, was dorami), kevin (Backend Lead, was scrooge), bob (Backend Developer, was bob-the-builder), ninja-hattori (Security Engineer, was scooby-doo), joe-gardner (QA Engineer, was tom), dekisugi (Research Lead, was dexter), olaf (Research Analyst, was velma), stuart (Code Search Assistant, was chip-and-dale).
- DevOps split in two: mike-wazowski (DevOps Engineer: CI, builds, Docker, local stack) and sulley (SRE: deploys, rollouts, rollbacks, backups, monitoring, incidents), both from chhota-bheem.
- New: twenty-two, Exploratory Tester on the QA Team (edge cases, odd paths, browser walk-throughs; exact repro steps; never fixes).
- Every description starts with title and team and routes with the new names; Doraemon assigns by team and title.
- Skills: generic `integrations` replaces the project-specific `guarded-integrations`; `security-backend` trimmed to generic rules; crew-lessons and the project-profile template use the new names.
- Evals: cases renamed to the new ids (for example `joe-not-run-vs-passed`, `hattori-proof-fails-before-fix`, `stuart-path-line-read-only`), plus `twenty-two-edge-case-repro`.
- Retired characters hang as framed pictures; `docs/roster.md` maps old memory folders to new ones.

## 0.1.0 - 23 Oct 2026

First scaffold.

- Plugin manifest and a `crew` marketplace (`/plugin marketplace add amanpatil808/claude-crew`, `/plugin install toon-crew@crew`).
- Default main agent `toon-crew:doraemon` through the plugin `settings.json`.
- Safety guards (PreToolUse hook `hooks/guard.mjs`): any force push, `gh repo delete`, `rm -rf` outside tmp/scratch, `docker compose down -v` and `docker volume rm`, edits to `.claude/settings*.json`, secrets and phone numbers written into `agent-memory` files. `gh pr merge` and git push to main/master ask the owner to confirm instead of blocking.
- Guard hardening after the security review: symlink-safe entry (the guard always runs), protected plugin/hook/agent/skill/git-config files, git config and alias tricks, unique-prefix long options, `@{push}` lookups, GitHub API merge/delete/ref rules, scratch dirs must be real directories, delete-by-move and delete-by-link, interpreter and obfuscation handling, shell writes into agent-memory, broader secret patterns (phones, URL passwords, UPI ids, emails, cards), `mcp__*` merge/push/delete asks, Dorami limited to lesson pushes, fail-closed on internal errors. The registry keeps a copy of an unreadable file instead of overwriting it.
- Read-only role write rule, per-project `board`/`lessons` opt-in flags with `/toon-crew:project`, corrupt-registry backup (`.bak`), escaped names in the forget listing.
- Re-check fixes: alternate git dirs (`--git-dir`, `GIT_DIR`), `git config --file`, `remote.<name>.push` rules for bare pushes, interpreter here-docs, script-then-run, read-only roles blocked from tree-changing git/patch/inline writes, plugin source editable under `--plugin-dir`, rebuildable output folders deletable, Dorami's origin check.
- Layout: the installable plugin lives in `plugin/`; the marketplace points at `./plugin`.
- Board event hooks (`board/hook.ts`) for SubagentStart, SubagentStop, PostToolUse, Stop, SessionStart and SessionEnd.
- Project registry (`${CLAUDE_PLUGIN_DATA}/projects.json`) filled at SessionStart, and `/toon-crew:forget`.
- CI: structure check, `claude plugin validate --strict`, guard and board tests, gitleaks.
