# toon-crew roster (cast v2, v0.4)

Fifteen agents in nine teams, one job each. In a project they are called `toon-crew:<id>` (for example `toon-crew:stuart`). Every agent reads the project's `CLAUDE.md` and `.claude/crew/project.md` first, and only Doraemon commits. Source of truth for names and settings: `docs/planning/cast-v2.md`.

The `(v0.4)` at the end of each agent description is the prompt version. It is separate from the plugin version in `plugin/.claude-plugin/plugin.json` (0.2.2).

## Teams

| Team | Members | Titles |
|---|---|---|
| Management | doraemon, miguel-rivera | Engineering Manager; Knowledge Manager (lessons, crew records) |
| Frontend Team | nobita, shinchan | UX & Design Lead; Frontend Developer |
| Backend Team | kevin, bob | Backend Lead (data, auth, APIs, integrations, guardrails); Backend Developer |
| DevOps Team | mike-wazowski, sulley | DevOps Engineer (CI, builds, Docker, local stack); SRE (deploys, rollouts, rollbacks, backups, monitoring, incidents) |
| Security Team | ninja-hattori | Security Engineer (review only) |
| QA Team | joe-gardner, twenty-two | QA Engineer (every check, exact counts); Exploratory Tester (edge cases, odd paths, browser walk-throughs) |
| Research Team | dekisugi, olaf | Research Lead; Research Analyst |
| Documentation Team | shizuka | Technical Writer |
| Helpers | stuart | Code Search Assistant (quick lookups, path:line) |

## The crew

| Id | Name (show) | Title, team: job | Model · effort · max turns | Colour |
|---|---|---|---|---|
| `doraemon` | Doraemon (Doraemon) | Engineering Manager, Management: main agent; plans waves, assigns by team and title, verifies, commits, opens PRs | opus · high · none set | blue |
| `miguel-rivera` | Miguel Rivera (Coco) | Knowledge Manager, Management: weekly lessons pass, confirmed crew records | sonnet · low · 30 | orange |
| `nobita` | Nobita (Doraemon) | UX & Design Lead, Frontend: journey reviews with ranked findings, design direction (reviews only) | opus · high · 80 | yellow |
| `shinchan` | Shinchan + Shiro (Crayon Shin-chan) | Frontend Developer, Frontend: screens to a design, token CSS, two screenshot rounds | sonnet · medium · 60 | red |
| `kevin` | Kevin (Minions) | Backend Lead, Backend: data, auth, secrets, APIs, integrations, guardrails, background jobs | opus · high · 80 | yellow |
| `bob` | Bob (Minions) | Backend Developer, Backend: modules and routes from specs, ports with parity tests, lint and type fixes | sonnet · medium · 60 | blue |
| `mike-wazowski` | Mike Wazowski (Monsters University) | DevOps Engineer, DevOps: CI, builds, Docker and images, local stack, setup scripts | sonnet · high · 100 | cyan |
| `sulley` | Sulley (Monsters University) | SRE, DevOps: deploys, rollouts, rollbacks, backups, monitoring, incidents | sonnet · high · 100 | purple |
| `ninja-hattori` | Ninja Hattori + Shishimaru (Ninja Hattori-kun) | Security Engineer, Security: attack-style reviews with proof tests (review only) | opus · high · 80 | blue |
| `joe-gardner` | Joe Gardner (Soul) | QA Engineer, QA: every suite three times, no-services run, lint, typecheck, exact counts | haiku · low · 40 | purple |
| `twenty-two` | 22 (Soul) | Exploratory Tester, QA: edge cases, odd paths, browser walk-throughs, exact repro steps (never fixes) | sonnet · medium · 40 | cyan |
| `dekisugi` | Dekisugi (Doraemon) | Research Lead, Research: product, UX and technical research with cited, dated sources | opus · high · 80 | orange |
| `olaf` | Olaf (Frozen) | Research Analyst, Research: evidence tables and fact-checks, a link and date per row | sonnet · medium · 40 | cyan |
| `shizuka` | Shizuka (Doraemon) | Technical Writer, Documentation: docs, release notes, launch copy, drafts, proofreading | sonnet · high · 60 | pink |
| `stuart` | Stuart (Minions) | Code Search Assistant, Helpers: quick read-only lookups answered with path:line (the default for lookups) | haiku · low · 15 | yellow |

No agent has green as its colour: the board uses green for "ok" (the Live status dot, a deploy that worked, a live version).

### Escalation per call
The manager keeps cheap defaults and passes `model: opus` for one run when it matters:
- sulley for production rollout or rollback design;
- shizuka for launch, trust or privacy copy;
- any role after two failed reviews.

### Safety by design
- **Own worktree** (`isolation: worktree`): kevin, bob, shinchan, mike-wazowski, sulley. Projects should set `"worktree": {"baseRef": "head"}` in their own `.claude/settings.json` (plugin settings can't set it) so those worktrees start from the working branch.
- **Read-only roles**: ninja-hattori, joe-gardner, twenty-two, nobita, dekisugi, olaf, stuart. Each has a fixed `tools` list plus `disallowedTools: Edit, MultiEdit, NotebookEdit` (and `Agent`, for all but dekisugi).
  - stuart: Read, Grep, Glob. joe-gardner, twenty-two: Read, Grep, Glob, Bash, Write. ninja-hattori: the same plus Skill. nobita: the same plus Skill and the web tools. olaf: Read, Grep, Glob, Write and the web tools. dekisugi: the same plus Agent, with no Bash.
  - `memory: project` adds tools back so an agent can keep its memory. On Claude Code 2.1.309, stuart got Read, Write, Grep, Glob: Write came back, Edit did not. So each prompt says: update memory by reading the file and writing it back whole.
  - **The guard is the lock on writes** for these roles. The plugin guard (`plugin/hooks/guard.mjs`, keyed on the hook's `agent_type`) blocks Edit-type tools and tree-changing git for them, and allows Write only to the agent's own `toon-crew-<id>/MEMORY.md`, the temp folder or session scratchpad, plus deliverable folders: `docs/research/` for dekisugi and olaf; `docs/design/` and `docs/research/` for nobita.
- **Knowledge Manager pushes**: miguel-rivera may push only `crew-lessons/*` branches to amanpatil808/claude-crew and open pull requests there; never main, never a merge.
- **Merging**: only the DevOps Team (mike-wazowski, sulley) may merge pull requests, and only after the owner approves that specific PR; the guard asks the owner to confirm each merge. Approving a pull request (`gh pr review --approve`) is also DevOps only, with the owner's confirmation. DevOps rights need the exact plugin names `toon-crew:mike-wazowski` and `toon-crew:sulley`; a project agent with the same bare name gets none. Everyone else is refused, including doraemon and miguel-rivera. `--admin` and `--auto` merges are refused for everyone. The owner can always merge himself: his own `!` commands and GitHub's website are not checked by the guard.
- **Spawning**: only doraemon (the main session) starts crew agents. dekisugi may start only `toon-crew:olaf` or `toon-crew:stuart`, with the prefix, for narrow questions. The guard refuses every other crew role, and bare names. Agents outside the crew are not limited.
- **Models**: Doraemon passes no `model` when spawning, except the escalations above. A per-call model beats the agent file, and the board shows `model override: <name>` on the task's row when the call's model differs from the file's.

## Memory folders

Plugin agents keep project memory in `.claude/agent-memory/toon-crew-<id>/MEMORY.md` (for example `toon-crew-joe-gardner/`). That folder is checked into each project.

**Moving each project to cast v2**, once, in a PR the owner merges:

| Old folder | New folder |
|---|---|
| `toon-crew-dorami/` (or `dorami/`) | `toon-crew-miguel-rivera/` |
| `toon-crew-scrooge/`, `shaktimaan/` | `toon-crew-kevin/` |
| `toon-crew-bob-the-builder/`, `ninja-hattori/` (old routes role) | `toon-crew-bob/` |
| `toon-crew-chhota-bheem/`, `dekisugi/` (old SRE role) | split: CI, builds, Docker, local stack -> `toon-crew-mike-wazowski/`; deploys, rollouts, rollbacks, backups, the host -> `toon-crew-sulley/` |
| `toon-crew-scooby-doo/` | `toon-crew-ninja-hattori/` |
| `toon-crew-tom/` | `toon-crew-joe-gardner/` (exploratory or browser lessons may go to `toon-crew-twenty-two/`) |
| `toon-crew-dexter/` | `toon-crew-dekisugi/` |
| `toon-crew-velma/` | `toon-crew-olaf/` |
| `toon-crew-chip-and-dale/` | `toon-crew-stuart/` |
| `suneo/` | `toon-crew-shizuka/` |
| (new) | `toon-crew-twenty-two/` starts empty |

Steps:
1. Copy (or append) each old `MEMORY.md` into its new folder. Folders without the `toon-crew-` prefix come from the earlier project-level agents.
2. Where two sources meet, merge duplicate bullets into one with a `(seen n)` count instead of keeping both.
3. Watch the two re-used ids: old `dekisugi/` and `ninja-hattori/` folders hold lessons from their old jobs (SRE and routes), so they go to sulley and bob, not to the new research lead and security engineer.
4. Check each merged file stays under 200 lines and holds no secrets, then remove the old folders in the same PR.

## Retired characters

These characters left the active crew. The Crew Room's wall shows them as framed pictures, each with a plate saying who took over; old references to them (memory folders, old board events) map to the role that took over.

| Retired | Was | Now with | What moved |
|---|---|---|---|
| Dorami | Crew keeper | miguel-rivera | Lessons pass, confirmed crew records, the only crew-repo push (lessons PRs) |
| Scrooge McDuck (and Shaktimaan) | Expert backend; guardrails, connectors, worker | kevin | Tests per security rule, the `security-backend` and `integrations` checklists |
| Bob the Builder (and Ninja Hattori's old routes role) | Builder; API routes | bob | Parity tests, spec gaps, user-isolation tests |
| Chhota Bheem (and Dekisugi's old SRE role) | DevOps and SRE | mike-wazowski, sulley | CI, builds and local stack to Mike; deploys, rollbacks, backups and incidents to Sulley; never `down -v` for both |
| Scooby-Doo | Security reviewer | ninja-hattori | Proof tests that fail before the fix, the race checklist |
| Tom | Tester | joe-gardner | Exact counts, three runs, "not run" is never "passed" |
| Dexter | Research lead | dekisugi | Cite and date every claim, the fact x places table |
| Velma | Analyst | olaf | A link and date per row, "unverified" marks |
| Chip 'n Dale | Quick lookups | stuart | Read-only, path:line answers, the default for lookups |
| Suneo | Junior writer | shizuka | Drafts, glossaries, proofreading, `TODO(verify)` |

Dekisugi and Ninja Hattori are active again in new jobs. Board events typed with their names from before 23 Oct belong to their old jobs and may show under the new owners.

## Skills the crew uses

| Skill | Used by | What it holds |
|---|---|---|
| `project-profile` | doraemon (first run, or when stale) | Writes `.claude/crew/project.md`: commands, docs per role, no-go areas, git, deploy rules, optional Board section |
| `security-backend` | kevin and ninja-hattori (preloaded), bob (for routes and personal data) | Data scoping, isolation tests, sessions, sign-in, encryption, consent, export and delete, safe errors |
| `integrations` | kevin and ninja-hattori (preloaded), bob (for third-party APIs) | Read-only by default, allow-lists and host pinning, scopes and keys, rate limits, paging caps, redaction, background jobs, commit-time re-checks |
| `crew-lessons` | miguel-rivera (weekly) | The lessons harvest and promotion procedure |
