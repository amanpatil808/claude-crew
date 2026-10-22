# toon-crew roster (v0.3)

Thirteen agents, one job each. In a project they are called `toon-crew:<id>` (for example `toon-crew:chip-and-dale`). Every agent reads the project's `CLAUDE.md` and `.claude/crew/project.md` first, and only Doraemon commits.

## The crew

| Id | Name (show) | Job | Model · effort · max turns | Colour | Room |
|---|---|---|---|---|---|
| `doraemon` | Doraemon (Doraemon) | Manager and main agent: plans waves, assigns by skill, verifies, commits, opens PRs | opus · high · none set | blue | The Closet |
| `dorami` | Dorami (Doraemon) | Crew keeper: weekly lessons pass, confirmed board facts | sonnet · low · 30 | yellow | The Closet |
| `nobita` | Nobita (Doraemon) | UX lead: journey reviews with ranked findings, design direction (reviews only) | opus · high · 80 | yellow | Nobita's Room |
| `shizuka` | Shizuka (Doraemon) | Writer and editor: docs, release notes, launch copy, drafts, proofreading | sonnet · high · 60 | pink | Nobita's Room |
| `shinchan` | Shinchan (Crayon Shin-chan) | UI builder: screens to a design, token CSS, two screenshot rounds | sonnet · medium · 60 | red | Nobita's Room |
| `scrooge` | Scrooge McDuck (DuckTales) | Expert backend: data, auth, secrets, connectors, guardrails, workers | opus · high · 80 | red | The Workshop |
| `bob-the-builder` | Bob the Builder (Bob the Builder) | Builder: modules and routes from specs, ports with parity tests, lint and type fixes | sonnet · medium · 60 | blue | The Workshop |
| `chhota-bheem` | Chhota Bheem (Chhota Bheem) | DevOps and SRE: local stack, CI, Docker, deploys, rollouts and rollbacks | sonnet · high · 100 | orange | The Workshop |
| `scooby-doo` | Scooby-Doo (Scooby-Doo) | Security reviewer: attack-style reviews with proof tests (review only) | opus · high · 80 | orange | Mystery Machine |
| `tom` | Tom (Tom and Jerry) | Tester: every suite three times, no-services run, lint, typecheck, exact counts | haiku · low · 40 | blue | Mystery Machine |
| `dexter` | Dexter (Dexter's Laboratory) | Research lead: product, UX and technical research with cited, dated sources | opus · high · 80 | purple | Dexter's Lab |
| `velma` | Velma (Scooby-Doo) | Analyst and fact-checker: evidence tables, a link and date per row | sonnet · medium · 40 | orange | Dexter's Lab |
| `chip-and-dale` | Chip 'n Dale (Chip 'n Dale: Rescue Rangers) | Quick lookups for any role, answered with path:line (the default for lookups) | haiku · low · 15 | yellow | The Tree House |

Room-mates never share a colour. Green is not used by any agent: the board keeps it for "done".

### Escalation per call
The manager keeps cheap defaults and passes `model: opus` for one run when it matters:
- chhota-bheem for production rollout or rollback design;
- shizuka for launch, trust or privacy copy;
- any role after two failed reviews.

### Safety by design
- **Own worktree** (`isolation: worktree`): scrooge, bob-the-builder, chhota-bheem, shinchan. Projects should set `"worktree": {"baseRef": "head"}` so those worktrees start from the working branch.
- **Read-only roles** (chip-and-dale, nobita, scooby-doo, tom, velma) and dexter: a fixed `tools` list plus `disallowedTools: Edit, MultiEdit, NotebookEdit`.
  - chip-and-dale: Read, Grep, Glob. nobita, scooby-doo, tom: add Bash and Write (nobita and scooby-doo also Skill; nobita the web tools). velma: Read, Grep, Glob, Write and the web tools. dexter: the same plus Agent, with no Bash.
  - `memory: project` turns on Read, Write and Edit "automatically" so an agent can keep its memory, and the docs don't say whether `disallowedTools` overrides that. Plugin agents also can't limit Write to one path. So each prompt says: update memory by reading the file and writing it back whole, and write only to the memory file and your own work folder (plus a doc the brief names). A guard-hook rule keyed on the agent type is planned to enforce this (not in `hooks/` yet, 23 Oct).
- **No spawning:** every agent except doraemon and dexter has the Agent tool removed. Dexter may hand narrow questions to velma or chip-and-dale.

## Memory folders

Plugin agents keep project memory in `.claude/agent-memory/toon-crew-<id>/MEMORY.md` (for example `toon-crew-tom/`), not in `<id>/`. That folder is checked into each project, like the old one.

**Moving from project-level agents to the plugin**, once per project, in a PR the owner merges:
1. For each of the 13 ids, copy `.claude/agent-memory/<id>/MEMORY.md` to `.claude/agent-memory/toon-crew-<id>/MEMORY.md`.
2. Fold the four retired roles into their new owner: append `dekisugi/` to `toon-crew-chhota-bheem/`, `suneo/` to `toon-crew-shizuka/`, `ninja-hattori/` to `toon-crew-bob-the-builder/` and `shaktimaan/` to `toon-crew-scrooge/`. Merge duplicate bullets into one with a `(seen n)` count instead of keeping both.
3. Check the merged files stay under 200 lines and hold no secrets, then remove the old `<id>/` folders in the same PR.

## Framed pictures: retired characters

Four characters left the active crew when their jobs were merged. They hang as framed pictures on the Crew Room wall, and old references to them map to the role that took over.

| Retired (show) | Was | Now part of | What moved |
|---|---|---|---|
| Shaktimaan (Shaktimaan) | Guardrails, connectors, background worker | `scrooge` | Guarded fetch, MCP and scope rules, worker and commit-time checks, now the `guarded-integrations` skill, which scrooge and scooby-doo preload |
| Ninja Hattori (Ninja Hattori) | API resource routes | `bob-the-builder` | Route contract work, spec-gap reporting, user-isolation tests; route and isolation rules also live in the `security-backend` skill |
| Dekisugi (Doraemon) | Senior DevOps / SRE: release pipelines, rollouts, rollback | `chhota-bheem` | Failure modes first, never `down -v`, backups before schema changes, "proven vs needs the real host"; opus per call for production rollouts |
| Suneo (Doraemon) | Junior writer: drafts, glossaries, proofreading | `shizuka` | First drafts, indexes, glossaries, proofreading with file:line fixes, `TODO(verify)` marks |

## Skills the crew uses

| Skill | Used by | What it holds |
|---|---|---|
| `project-profile` | doraemon (first run, or when stale) | Writes `.claude/crew/project.md`: commands, docs per role, no-go areas, git, deploy rules, optional Board section |
| `security-backend` | scrooge and scooby-doo (preloaded), bob-the-builder (for routes and personal data) | Data scoping, isolation tests, sessions, sign-in, encryption, consent, export and delete, safe errors |
| `guarded-integrations` | scrooge and scooby-doo (preloaded), bob-the-builder (for outbound calls) | Allow-listed HTTP and MCP, scopes, paging caps, redaction, workers, commit-time re-checks |
| `crew-lessons` | dorami (weekly) | The lessons harvest and promotion procedure |
