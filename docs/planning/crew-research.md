# Crew research: turning the RupeeLens crew into a reusable plugin

Dexter · 23 Oct 2026 · P1 · Findings only, no code. Sources accessed 22-23 Oct 2026.

**In short.**
- Go from 17 agents to 13 by merging four pairs whose jobs overlap. The two DevOps agents already share 19 of their 29 lessons word for word.
- The biggest cost leak is not the roster. **26 of 57 typed runs (46 %) in today's log went to `general-purpose`**, which runs on the main model (Opus). All 17 descriptions together cost only about 1.3k tokens a turn, against Claude Code's 15k warning level.
- Blocker: the plugin name **`claude-crew` is reserved** (`claude plugin validate` rejects any name that starts with `claude-`). Use `toon-crew` (the repo may keep its name).

## 1. Roster review

Today's usage comes from `log/events.jsonl` (22 Oct, 7.4 h, runs by type): shinchan 11, ninja-hattori 6, tom 4, scooby-doo 3, shaktimaan 3, bob 2, dexter 1, scrooge 1. All other crew members: 0. general-purpose: 26.

| Today | Verdict | Model · effort · maxTurns | Why (overlap / generality / cost) | Must not lose | Cartoon name (fit) |
|---|---|---|---|---|---|
| doraemon | **Keep**: the manager runs as the main thread. Each project opts in with `"agent": "toon-crew:doraemon"` in its own settings. | opus · high · n/a | Judgement-heavy. It is the only one who commits. | P0/P1/P2, file-disjoint waves, verifying claims, memory duty | **Doraemon** (keep): the gadget-giver who equips everyone |
| scrooge + **shaktimaan** | **Merge** into scrooge | opus · high · 80 | Same tier, same rules (tests per security rule, fixed-string errors). Their split (vault vs connectors) is RupeeLens-only. Run 2 copies in parallel when needed. | Guarded-fetch and vault checklists, as `security-backend` and `guarded-integrations` skills | **Scrooge McDuck** (keep): guards the money bin, i.e. data, auth and secrets. Shaktimaan is live action, not a cartoon. |
| bob-the-builder + **ninja-hattori** | **Merge** into bob | sonnet · medium · 60 | Both are spec-driven Sonnet builders. Hattori's route contract is a project fact. They share 0 lessons, so neither one's lessons are lost. | Parity tests, "spec gaps in the report", user-isolation tests (move to a project skill) | **Bob the Builder** (keep) |
| dekisugi + **chhota-bheem** | **Merge** into one DevOps/SRE | sonnet · high · 100; the manager passes `model: opus` for production rollout or rollback design | 19 of 29 lessons are identical. Per-call model override exists (docs: resolution order), so the base can stay cheap. | Failure modes first, never `down -v`, idempotent scripts, "proven vs needs the real host" | **Chhota Bheem**: protects Dholakpur, keeps foundations strong, and Indian viewers know him. Alt: *Fireman Sam* (incidents). |
| nobita | **Keep** | opus · high · 80 | Review and direction need visual judgement. This differs from building (no overlap with shinchan in practice). | Ranked findings, 390/1360 px, light/dark, read every screenshot | **Nobita** (keep): the everyday user who notices what feels wrong |
| shinchan | **Keep** (most used) | sonnet · medium · 60 | Builds to a direction. Cheap and busy. | Two screenshot rounds, token CSS, no hover-only details | **Shinchan** (keep): playful UI maker |
| shizuka + **suneo** | **Merge** into shizuka, one writer-editor | sonnet · high · 60; opus override for launch, trust or privacy copy | They share only 1 lesson, but the work overlaps. Opus for every doc is costly. Suneo's typical slips (overclaims) are what the senior check exists to catch. | Check every claim against code, file:line evidence, `TODO(verify)` | **Shizuka** (keep): careful, kind, top of the class |
| dexter | **Keep**, generalised to product, UX and technical research | opus · high · 80 | An Opus lead with Sonnet helpers beat single-agent Opus by 90.2 % (Anthropic, Jun 2025). | Cite and date every claim, data honesty, the fact × places table | **Dexter** (keep) |
| velma | **Keep** as analyst and fact-checker | sonnet · medium · 40 | Cheap breadth for dexter. Her lessons on source access are reusable. | Every row has a link and date; mark "unverified" | **Velma** (keep): "Jinkies", finds the clue |
| scooby-doo | **Keep** | opus · high · 80; try `xhigh` on an eval before audits | The docs reserve `max` for vulnerability hunting but warn it overthinks. Review only. | Proof tests that fail before the fix, the race checklist | **Scooby-Doo** (keep) |
| tom | **Keep** | haiku · low · 40 | Runs commands and reports counts. Haiku 5.5 is 20x cheaper than Sonnet, up to 100k-token prompts. | Exact counts, a 3x flaky check, "not run" never reported as "passed" | **Tom** (keep): chases every bug like Jerry |
| chip-and-dale | **Keep**, and make it the default for lookups instead of Explore or general-purpose | haiku · low · 15 | The built-in Explore runs on the main model, not Haiku (docs). Its 0 lessons and 0 runs mean the manager is not routing to it. | Read-only, path:line answers | **Chip 'n Dale** (keep): the Rescue Rangers, quick finders |
| dorami | **Change job**: crew keeper (lesson curation, plus board facts until hooks cover them) | sonnet · low · 30 | The local board now fills itself from hooks. Curating lessons across 3 projects is a recurring chore the manager does today. | Real clock times, apply only confirmed facts | **Dorami** (keep): Doraemon's tidy, capable sister |

**Generalise every prompt** (the "proj-refs" count is 0-8 per prompt today): replace RupeeLens paths and commands with "read `CLAUDE.md` and `.claude/crew/project.md`". That one file per project lists the test, lint and build commands, the docs each role reads first, and the no-go areas. Move domain checklists (vault, routes, Indian context) into project skills. Keep "Not for X, that is Y" lines in every description. Unclear role boundaries are one of the three MAST failure groups (Cemri et al., 2025).

## 2. Seating, colours and character details

Claude Code accepts 8 colours: red, blue, green, yellow, purple, orange, pink, cyan. **Green is left unused** because the board uses green for `done`. Hex values are mid-tones for the board. In light mode, give yellows a dark outline (`#7a5c00`) so they still read.

| Room (lore place) | Who · work | Why the pairing fits (job + lore) | `color` → board hex | Small touches (own pixel art) |
|---|---|---|---|---|
| **The Closet**: leads | Doraemon (manager), Dorami (keeper) | Brother and sister: one plans, one keeps records | Doraemon `blue` #1F7FD6 · Dorami `yellow` #F2C12E | Doraemon: dorayaki on the desk; his bell rings softly when he stands. Dorami: melon bread; squares up her stack of lesson cards when idle. |
| **Nobita's Room**: product | Nobita (UX), Shizuka (writer), Shinchan (UI) | Shizuka visits Nobita's room in the show. UX, words and screens sit together. **Dekisugi and Suneo leave**, so the jealousy line goes too. | Nobita `yellow` #F5C518 · Shizuka `pink` #E85A9B · Shinchan `red` #D7263D | Nobita: pushes up his glasses; dozes after 10 idle minutes; glances at Shizuka. Shizuka: violin case and a teacup. Shinchan: Action Kamen figure; Shiro asleep under the desk. |
| **The Workshop**: build and platform | Scrooge (expert dev), Bob (builder), Chhota Bheem (DevOps) | The people who build and guard. No rivals between their shows. | Scrooge `red` #C62828 · Bob `blue` #3B5BA9 (overalls) · Bheem `orange` #EF7D1A | Scrooge: polishes his Number One Dime; top hat on a stand. Bob: yellow hard hat; Pilchard the cat on a toolbox; "Can we fix it?" on a start. Bheem: plate of laddoos; eats one after a green deploy. |
| **Mystery Machine**: quality | Scooby-Doo (security), Tom (tests) | Both chase things: clues and bugs. Tom is a little wary of dogs, a gentle bit, not a feud. | Scooby `orange` #A8642A (brown) · Tom `blue` #6B7FA3 (slate) | Scooby: a box of Scooby Snacks; "Ruh-roh!" on a critical finding. Tom: a mouse hole in the wall behind him (Jerry is never seen); straightens his whiskers before a run. |
| **Dexter's Lab**: research | Dexter (lead), Velma (analyst) | Two genius researchers. Velma glances toward the Mystery Machine next door. | Dexter `purple` #6B3FA0 (gloves) · Velma `orange` #E8731C (sweater) | Dexter: goggles on his forehead; a beaker bubbles while he works. Velma: magnifying glass; "Jinkies!" when a source checks out. |
| **The Tree House**: helpers | Chip 'n Dale | The Rescue Rangers' base, open to every room | `yellow` #C98A3B (acorn) | An acorn pile. Chip (fedora) searches while Dale (Hawaiian shirt) reports; they take turns. |

Room-mates never share a Claude colour. Bob is blue and Doraemon is blue, but they sit in different rooms.

## 3. Cost control

**Prices** (Anthropic API, per million input / output tokens):

| Model | Input | Output | Cache hit |
|---|---|---|---|
| Opus 5.5 | $4 | $20 | 5 % |
| Sonnet 5.5 | $2 | $10 | 5 % |
| Haiku 5.5 (prompts ≤ 100k tokens) | $0.10 | $0.50 | 10 % |
| Haiku 5.5 (prompts > 100k tokens) | 5x the above | 5x the above | 10 % |

Writing to the cache costs 1.25x the input price for a 5-minute entry and 2x for a 1-hour entry.

1. **Route by model first.** Model choice moves cost far more than prompt trimming (Opus is 40x Haiku on input). Use Opus only where judgement or security matters (5 roles above). Use Sonnet for building. Use Haiku for running checks and lookups. Keep Haiku prompts under 100k: Tom writes logs to files and reads only failures.
2. **Close the general-purpose leak.** Set `CLAUDE_CODE_SUBAGENT_MODEL=sonnet` in each project's settings `env`; it covers general-purpose and other subagents that set no model (docs). Brief the manager to use chip-and-dale for lookups, not Explore (which runs on the main model).
3. **Escalate per call, don't fork roles.** Keep cheap defaults and pass `model: opus` for a rare hard task. Escalate after two failed reviews (already in doraemon's standards).
4. **Effort.** The 5.5 models default to `medium`. Raise to `high` only for verification-heavy work, and test `xhigh` or `max` on evals first. The docs say `max` "is prone to overthinking". Thinking is billed as output tokens.
5. **maxTurns** is a safety cap, not a budget. A run that hits it stops as partial and can be resumed. Size each cap from measured turns (p95 x 1.5 once the hook logs turns). Today's runs are short (median 2.4-7.5 min), so 200/150/120 are loose.
6. **Context.** Descriptions load every turn (keep each under about 300 characters). Prompt plus memory load every run (about 0.5-1.7k tokens each today). The 200-line memory cap is a ceiling, not a target. Subagents keep their own prompt cache. A fork shares the main session's cache and is cheaper for tasks that need the same context.
7. **Helper vs strong agent.** Use a helper when the answer can be checked mechanically (a path, a count, a test result). Use a strong agent when a wrong answer looks right (security, data honesty, design). Coding parallelises less well than research, and multi-agent work costs about 15x the tokens of chat (Anthropic). So waves should stay 2-4 agents wide.
8. **Measure.** Use `/usage` for plan attribution (share by subagent, skill and plugin, over 24 h or 7 days) and the main-session cache-hit line. Run `/insights` weekly. Use `claude plugin eval` (its COST column) when tuning. Use `--max-budget-usd` for headless runs. Idea (unverified): have the board hook record each run's model, plus token counts from the transcript, so the Crew Room shows cost per role.

## 4. Lesson sharing

1. **Two layers.**
   - Project memory: `.claude/agent-memory/<name>/`, where `memory: project` writes even for plugin agents. It holds facts about this repo, such as ports and paths.
   - Crew lessons: rules that hold anywhere. They live in the plugin's prompts and skills, under version control.

   Today most bullets are project facts (e.g. chhota-bheem cites the project 14 times). Tag each bullet `[project]` or `[crew]`.
2. **Curate with counts, not rewrites.** ExpeL (AAAI-24) keeps insights through four operations:
   - ADD (starts at count 2)
   - EDIT
   - UPVOTE
   - DOWNVOTE (an insight is removed when its count reaches 0)

   ACE (ICLR 2026) shows that rewriting a whole playbook causes "context collapse". Make small additions and edits instead. Rule for us:
   - Write each bullet as "rule, then why", plus `(seen n)`.
   - A repeat raises the count instead of adding a copy.
   - Merge near-duplicates.
   - Never summarise a whole file.
   - Remove bullets the code has made obsolete.
3. **Shared lessons live in one place.** The 19 duplicated DevOps bullets show that copying a lesson into several files makes it drift. Put cross-role lessons in a crew skill or the project's `CLAUDE.md`, not in each memory file.
4. **Promotion path.**
   1. A `[crew]` bullet seen in 2 or more projects, or set as an owner rule, becomes a candidate. Dorami proposes it weekly.
   2. A failing eval case is written from the original incident.
   3. The prompt or skill is edited.
   4. The eval passes against the previous version.
   5. Bump `version` in `plugin.json` and the agent's `(v0.x)` tag, and add a CHANGELOG line.
   6. Remove the bullet from memory.

   This is Superpowers' "no skill without a failing test first", applied to lessons.
5. **Evals before every release.**
   - `claude plugin eval` runs each case 3 times, with and without the plugin, and reports Δ and cost.
   - Start with about 20 real cases, which is enough to see large effects (Anthropic research system).
   - Per agent, add one grader on the result and one on the steps (`tool_used`), as the docs advise.
   - Add routing cases: "find where X is defined" must reach chip-and-dale, not general-purpose.
   - Run the same cases on Haiku and Sonnet when changing a cheap role (skills best practices: test with every model you use).
6. **Training badge.** Keep `L` until an agent has N clean hand-backs (Suneo's promotion is the precedent). Record the decision in the CHANGELOG.

## 5. Public agent repos worth borrowing from

| Repo | What it is | Borrow |
|---|---|---|
| [anthropics/claude-code `plugins/`](https://github.com/anthropics/claude-code/tree/main/plugins) | 13 official plugins, e.g. feature-dev (explorer, architect, reviewer) and code-review (5 parallel Sonnet agents with confidence scores) | A README per plugin, small focused agents, confidence scoring to cut false positives |
| [wshobson/agents](https://github.com/wshobson/agents) (41.6k ★, MIT) | 94 plugins, 202 agents, 185 skills, grouped by domain | A `plugins/<domain>` layout, `make validate STRICT=1`, static plugin evals with no model calls, CONTRIBUTING and ARCHITECTURE docs |
| [obra/superpowers](https://github.com/obra/superpowers) (≈304k ★, MIT) | A methodology delivered as skills | TDD for skills (RED with no skill, GREEN, close loopholes), descriptions that say only *when* to use the skill, RELEASE-NOTES, a skill that diagnoses transcripts |
| [VoltAgent/awesome-claude-code-subagents](https://github.com/VoltAgent/awesome-claude-code-subagents) (25.9k ★, MIT) | 100+ agents in 10 numbered category folders, each a plugin | Model tier by task type, read-only tools for reviewers. Avoid: no evals; it ships "as is". |
| [anthropics/skills](https://github.com/anthropics/skills) | Official skills, a `template/` and `spec/` | A template folder for new agents and skills, and a written spec for our frontmatter and tags |

**Proposed layout for the `toon-crew` repo:**
- `.claude-plugin/{plugin,marketplace}.json`
- `agents/` (13 files)
- `skills/` (security-backend, guarded-integrations, crew-lessons, project-profile template)
- `hooks/` (Crew Room logger)
- `evals/<agent>-<case>/`
- `docs/` (roster, seating, CHANGELOG)

Plugin agents ignore `hooks`, `mcpServers` and `permissionMode`, so the board hooks ship in `hooks/hooks.json`. A `CLAUDE.md` at the plugin root is not loaded; use skills for shared instructions.

## Open questions for the owner
1. Plugin name: `toon-crew`, or another name that does not start with `claude-`?
2. Merge Suneo into Shizuka (recommended), or keep Suneo as a cheap Haiku proofreader on the learner track?
3. Should retired characters (Dekisugi, Suneo, Ninja Hattori, Shaktimaan) leave the Crew Room, or stay as framed pictures on a wall?
4. Should Doraemon be the default main agent in all 3 projects, or opt-in per project (recommended)?

## Sources (accessed 22-23 Oct 2026)
- Claude Code docs: [Subagents](https://code.claude.com/docs/en/sub-agents) (fields, colours, memory 200 lines/25 KB, Explore model, 15k description budget, plugin limits), [Costs](https://code.claude.com/docs/en/costs), [Model config and effort](https://code.claude.com/docs/en/model-config), [Plugin manifest](https://code.claude.com/docs/en/plugins-reference) (reserved names, `settings.agent`), [Plugin components](https://code.claude.com/docs/en/plugins/components), [Plugin evals](https://code.claude.com/docs/en/plugin-evals)
- [Claude pricing](https://platform.claude.com/docs/en/about-claude/pricing) · [Skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
- Anthropic Engineering: [Multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system) (13 Jun 2025) · [Effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) (29 Sep 2025)
- Papers: Cemri et al., [Why do multi-agent LLM systems fail?](https://arxiv.org/abs/2503.13657) (2025) · Zhao et al., [ExpeL](https://arxiv.org/abs/2308.10144) (AAAI-24) · Zhang et al., [Agentic Context Engineering](https://arxiv.org/abs/2510.04618) (ICLR 2026)
- Our data: `.claude/agents/*.md`, `.claude/agent-memory/*/MEMORY.md`, `.claude/crew-board/log/events.jsonl`, `crew-board/room.js` (current rooms)
