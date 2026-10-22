# Plan: toon-crew, our crew as a reusable private plugin

Doraemon · 23 Oct 2026 · for the owner's approval. Built on Dexter's `crew-research.md` (roster, cost, lessons, names,
seating, colours), the Claude Code guide's doc checks (plugins, isolation, memory, hooks, cost tools) and today's audit.

## 0. Decisions needed from you
1. **Folder and repo:** local `~/Developer/claude-crew` (not iCloud), private GitHub `amanpatil808/claude-crew`. The
   plugin itself must be named **`toon-crew`** (Claude Code reserves names starting with `claude-`).
2. **Roster 17 → 13** (section 2): merge Shaktimaan→Scrooge, Ninja Hattori→Bob, Dekisugi→Chhota Bheem, Suneo→Shizuka.
3. **Retired characters** (Dekisugi, Suneo, Ninja Hattori, Shaktimaan): leave the Crew Room, or hang as framed pictures?
4. **Doraemon as the main agent:** opt-in per project (recommended) or default everywhere?
5. **Lessons to GitHub:** auto PR (hook) or manual `/toon-crew:lessons`? (section 5 recommends Dorami's weekly PR.)

## 1. What we have today (audit)
- 17 project agents (`.claude/agents/*.md`, all `memory: project`), 9 of them on Opus high.
- Used on 22 Oct: Shinchan 11, Ninja Hattori 6, Tom 4, Scooby-Doo 3, Shaktimaan 3, Bob 2, Dexter 2, Scrooge 1;
  **unused**: Dekisugi, Chhota Bheem, Nobita, Shizuka, Suneo, Velma, Chip 'n Dale.
- **Biggest cost leak:** 26 of 57 runs were `general-purpose` on the main model (Opus).
- Descriptions cost ~1.3k tokens a turn (fine). Memory 3-38 lines per agent, mostly RupeeLens facts.
- Crew Room board in `.claude/crew-board/` (Node, local, git-excluded), hooks in `.claude/settings.local.json`;
  bug: its redactor masks agent ids as phone numbers.
- 3 skills, all RupeeLens-specific (add-source, check-data, release): they stay in RupeeLens.

## 2. Roster (13), names, models, what each must keep
| Name (show) | Job | Model · effort · turns | Change | Must not lose |
|---|---|---|---|---|
| Doraemon | Manager (main thread) | opus · high | keep; generalised | P0/P1/P2, assign by skill, verify, only one who commits |
| Dorami | Crew keeper: lesson curation | sonnet · low · 30 | new job | real clock times, confirmed facts only |
| Nobita | UX lead / reviews | opus · high · 80 | keep | ranked findings, phone + desktop, light + dark |
| Shizuka (absorbs Suneo) | Writer-editor | sonnet · high · 60 (opus for launch/privacy copy) | merge, cheaper | every claim checked against code |
| Shinchan | UI builder | sonnet · medium · 60 | keep | two screenshot rounds, token CSS |
| Scrooge McDuck (absorbs Shaktimaan) | Expert backend: data, auth, vault, connectors, guardrails | opus · high · 80 | merge | tests per security rule; checklists move into skills |
| Bob the Builder (absorbs Ninja Hattori) | Builder from specs, routes | sonnet · medium · 60 | merge | parity + isolation tests, spec gaps reported |
| Chhota Bheem (absorbs Dekisugi) | DevOps / SRE | sonnet · high · 100 (opus per call for prod rollouts) | merge | failure modes first, never `down -v`, idempotent |
| Dexter | Research lead | opus · high · 80 | keep, generalised | cite and date every claim |
| Velma | Analyst / fact-checker | sonnet · medium · 40 | keep | link + date per row, "unverified" marks |
| Scooby-Doo | Security reviewer | opus · high · 80 | keep (review only) | proof tests that fail before the fix |
| Tom | Tester | haiku · low · 40 | keep | exact counts, 3× flaky runs, "not run" ≠ "passed" |
| Chip 'n Dale | Quick lookups | haiku · low · 15 | keep; **default for lookups** | read-only, path:line answers |
All prompts become project-neutral: each project gets `.claude/crew/project.md` (commands, docs to read, no-go areas).

## 3. Cost control (cheaper without losing capability)
1. **Close the leak:** set `CLAUDE_CODE_SUBAGENT_MODEL=sonnet` in each project (covers general-purpose); route lookups
   to Chip 'n Dale (Haiku) instead of Explore/general-purpose (both run on the main model).
2. **Route by model:** Opus only where a wrong answer looks right (manager, Nobita, Scrooge, Dexter, Scooby-Doo);
   Sonnet for building and writing; Haiku for running checks and lookups. Escalate per call (`model: opus`) after two
   failed reviews instead of keeping a role on Opus. Prices per M tokens: Opus $4/$20, Sonnet $2/$10, Haiku $0.10/$0.50.
3. **Effort:** default medium; high only for verification-heavy roles; test xhigh/max on evals first.
4. **Waves stay 2-4 agents wide** (multi-agent work costs ~15× chat tokens).
5. **Measure every week:** `/usage` (share per subagent/skill/plugin), `claude plugin details toon-crew` (always-on
   tokens), `claude plugin eval` (cost column). The Crew Room shows each run's model and, later, tokens per role.
6. **Guard against false savings:** every downgrade (e.g. Shizuka Opus→Sonnet) must pass the same eval cases first.

## 4. Safety and isolation
- `isolation: worktree` for builders (Bob, Shinchan, Scrooge, Chhota Bheem): each works in its own fresh checkout, so no
  more file clashes or hand-made worktrees; `worktree.baseRef: head` so they see the current branch; `.worktreeinclude`
  for `.env`-style files they need. The manager merges their branches.
- Read-only by tools: Scooby-Doo, Nobita, Velma, Chip 'n Dale (`disallowedTools: Edit, Write` where they must not edit).
- **Guards in `hooks/hooks.json` (PreToolUse, blocks with exit 2):** `git push` to main/master, `gh pr merge`,
  force-push, `rm -rf` outside the scratchpad, `docker compose down -v`, edits to settings/hooks files, and secrets
  (tokens, phone numbers) written into memory files.
- Plugin agents ignore `permissionMode`, `hooks`, `mcpServers`: all of that lives at plugin level.

## 5. Memory and lessons (how local learning reaches GitHub)
- **Any number of projects:** a SessionStart hook registers each project the crew runs in (path + name) in
  `${CLAUDE_PLUGIN_DATA}/projects.json`, so nothing is listed by hand; `/toon-crew:forget` removes one. Dorami's weekly
  pass and the Crew Room both read this list. "3 projects" below is only an example.
- **Two layers:** project facts stay in each project's `.claude/agent-memory/toon-crew-<name>/` (plugin agents get the plugin prefix) (`memory: project`, works for
  plugin agents). Crew rules live in the plugin's prompts and skills, under version control.
- Each bullet is "rule, then why" with `(seen n)` and a tag `[project]` or `[crew]`; repeats raise the count, never copy.
- **Weekly:** Dorami collects `[crew]` bullets seen in 2+ projects (or set by you), writes a failing eval case from the
  incident, edits the prompt/skill, runs `claude plugin eval`, bumps the version + CHANGELOG, and opens **one PR** on
  `claude-crew`. You merge; projects get it with `claude plugin update toon-crew@crew` (or auto-update, if you enable it).
- One-time: Dorami merges the lessons already learned in all 3 projects (project facts stay; crew rules move up).
- This replaces the earlier `memory: user` + symlink idea: the docs don't confirm symlinks or plugin-agent paths there.

## 6. Crew Room in the repo
- `board/` in the plugin: server, page, rooms. Hooks in `hooks/hooks.json` use `${CLAUDE_PLUGIN_ROOT}`; the event log
  and settings live in `${CLAUDE_PLUGIN_DATA}` (survives updates). **One board for all projects**, each event tagged
  with its project; the top strip shows which project each person is on.
- Start/stop: `/toon-crew:board` skill + launcher script (docs don't confirm a hook can keep a server running; we test
  a SessionStart start-if-not-running first).
- New seating (Dexter): The Closet (Doraemon, Dorami) · Nobita's Room (Nobita, Shizuka, Shinchan) · The Workshop
  (Scrooge, Bob, Chhota Bheem) · Mystery Machine (Scooby-Doo, Tom) · Dexter's Lab (Dexter, Velma) · Tree House
  (Chip 'n Dale). Rivals out of Nobita's room; room-mates never share a colour; green stays for "done".
- Colours (Claude `color` → board hex): Doraemon blue #1F7FD6 · Dorami yellow #F2C12E · Nobita yellow #F5C518 ·
  Shizuka pink #E85A9B · Shinchan red #D7263D · Scrooge red #C62828 · Bob blue #3B5BA9 · Chhota Bheem orange #EF7D1A ·
  Scooby-Doo orange #A8642A · Tom blue #6B7FA3 · Dexter purple #6B3FA0 · Velma orange #E8731C · Chip 'n Dale yellow #C98A3B.
- Small touches (own pixel art): Doraemon's dorayaki and bell, Dorami's melon bread and lesson cards, Nobita's glasses
  and naps (glancing at Shizuka), Shizuka's violin case, Shinchan's Action Kamen and Shiro, Scrooge's Number One Dime,
  Bob's hard hat and Pilchard, Bheem's laddoos after a green deploy, Scooby Snacks and "Ruh-roh!", Tom's mouse hole
  (Jerry never seen), Dexter's goggles and bubbling beaker, Velma's "Jinkies!", Chip and Dale's acorn pile.
- Fix: agent ids masked as phone numbers.

## 7. Quality gates
- `claude plugin validate` + `claude plugin eval` in the repo's CI: ~20 real cases to start (one result grader and one
  step grader per agent) plus routing cases ("find where X is defined" → Chip 'n Dale). gitleaks on every push.
- Releases: `version` in `plugin.json`, CHANGELOG, tag; projects pin to a version and update on purpose.

## 8. Phases, owners, time (≈ 2 days of crew work)
| Phase | What | Who | Time |
|---|---|---|---|
| 1 | Repo + plugin scaffold, marketplace, CI (validate, eval, gitleaks), guards in hooks.json | Chhota Bheem (DevOps), Scooby-Doo reviews guards | ½ day |
| 2 | 13 agents: merges, generalised prompts, models/effort/isolation/tools, `project.md` template, skills from checklists | Shizuka writes, Scrooge/Bob check their own role files, Doraemon reviews | ½ day |
| 3 | Evals (~20 cases) + cost baseline (`/usage`, plugin details) before/after | Tom, Dexter | ½ day |
| 4 | Crew Room into `board/`: multi-project, seating, colours, touches, bug fix | Shinchan (screen), Bob (data) | ½ day |
| 5 | Lessons: tags, one-time merge from 3 projects, weekly PR flow | Dorami | 2-3 h |
| 6 | Switch RupeeLens to the plugin (remove its copies via PR), then your other 2 projects | Doraemon, Tom | 2-3 h |
Each phase ends with Tom's checks; security-relevant phases (1, 4, 6) also with Scooby-Doo. Nothing merges without you.

## 9. Risks
- Plugin agents can't carry their own hooks/permissions: guards must be plugin-wide.
- Worktrees start clean: untracked files (`.env`, `node_modules`) need `.worktreeinclude` or setup steps.
- Merging roles can lose a skill silently: evals per merged role before the switch.
- Renames break old references (board log, memory folders): migration maps old names to new.
