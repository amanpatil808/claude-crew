# Changelog

All notable changes to toon-crew. Versions follow `version` in `plugin/.claude-plugin/plugin.json`; projects pin to a version and update on purpose.

## 0.3.12 - 28 Oct 2026

### Fixed

- A merged, created or closed PR now shows on the board within a few seconds: after the crew runs `gh pr` or `git push`, the board checks GitHub straight away (the regular check is every 20 seconds, down from 60).
- The board no longer downloads its whole state every 2 seconds. When nothing has changed, the server answers "not modified" and the page doesn't redraw.
- Project chips keep one fixed order. Selecting a project or a change in activity no longer moves them.

## 0.3.11 - 28 Oct 2026

### Changed

- Nobita (UX & Design Lead) builds styles as well as reviewing: he may edit CSS, SVG, images, design-token data and docs/design in his own worktree, and nothing else. Shinchan builds behaviour and logic. Doraemon splits UI work by file between them, in parallel.

### Security

- Read-only roles can no longer push to git (a plain push to a feature branch was allowed before).

## 0.3.10 - 28 Oct 2026

### Fixed

- Working characters move again (pace, bob, typing, desk light at their 0.3.7 speed); done and idle desks stay still.
- Natural paths: characters went down, up, across, down and up on every cross-room trip. Now they go straight up the aisle, out the top door, across and in; short walks inside a room go straight.
- A working copy stays seated while its twin walks off.

### Changed

- Mike and Sulley travel between rooms by closet door (step in, step out at the destination) and walk only inside their own room.

## 0.3.9 - 28 Oct 2026

### Changed

- Doraemon runs 2-4 crew at once for light work and up to 6-8 for heavy work (many independent pieces on separate files), defaulting to the small end. The crew meter shows 8 slots with a marker after 4 and turns amber only above 8.
- Nobody vanishes mid-trip: every character travels the whole route in view, in their own style, over about 3-5.5 s.
- Calmer motion: looping animations run at half speed, walking is 40% slower, and nothing changes more than about 3 times a second.
- Copy light: Doraemon flies to the desk and makes the twin there; when one copy finishes, only that copy walks to him to hand in its report, then poofs.

### Fixed

- Dorayaki appeared on every finished desk; it is Doraemon's alone now.

## 0.3.8 - 28 Oct 2026

### Changed

- Calmer floor: one "working" signal per desk (slower typing, no pacing or bobbing, steady LEDs, the bell rings once); no blinking rack or looping hall door; steady Live and Running dots; softer floor patterns.
- Needs you puts each item's next step or GitHub link right under it, so the strip is shorter.
- Below 1100 px the floor comes before the side cards.
- 16 px between the two plates in a room; no "N working" sign on room walls.
- Travel poses and the copter blade change at most about 4 times a second; softer spins.
- The copy-light bubble stays inside its room.

## 0.3.7 - 28 Oct 2026

### Fixed

- Stopped agents in busy sessions no longer stay "working" for hours. A session can have folders under several project slugs (for example a worktree or /private/tmp); the board now searches all of them for the agent's own log, and the 45-min fallback counts only the agent's own activity.

## 0.3.6 - 28 Oct 2026

Update with `/plugin marketplace update crew`, `/plugin update toon-crew@crew`, then `/reload-plugins` or a new session, and restart the board.

### Fixed

- Agents stopped by the user (interrupt or TaskStop) no longer stay "working": the board checks each agent's own transcript and drops it after about 12 quiet minutes. Phantom twins and the inflated crew meter are gone.
- Twins and the ×n badge only show on working desks; idle desks have no copies.
- The bamboo copter is Doraemon's alone; other working desks show a small prop from their own film.
- Turning Animation off cancels queued trips and pending copy-light reveals.
- A role the server reports as working never shows Resting.

### Changed

- Doraemon flies at a calmer pace (about 2.5 s) and never vanishes: he flies the whole route, and stays at his desk with Animation off.
- The copy light waits at most 1.2 s for Doraemon, so the ×n badge appears sooner.
- "Lost contact" no longer says "45+ min".

## 0.3.5 - 28 Oct 2026

Update with `/plugin marketplace update crew`, `/plugin update toon-crew@crew`, then `/reload-plugins` or a new session, and restart the board.

### Added

- Copy light: when Doraemon starts a second copy of a role, he beams his gadget at the desk and a twin pops in with a ×2 badge.
- Crew meter "Crew n / 4" in the floor header, with striped slots past the usual 4.
- Every character travels in their own film-inspired style (doors, banana pogo, smoke leap, snow slide, soul glide, petals, bubbles, peel slide); the bamboo copter is Doraemon's. 1-2 s per trip.
- README and how-it-works explain waves of 2-4, second copies and the queued plan.

### Changed

- One project at a time: the All view is gone and the picked project is a filled, ticked chip.
- Task times read plainly ("8m"); counts show once.

### Fixed

- The board no longer redraws and re-animates everything on each poll; only new items animate.
- Done and idle desks no longer bounce forever.
- Agents that started but never reported back for 45+ min show "Lost contact" instead of working forever.
- An assign binds the queued task whose text matches it, not just the oldest for that role.

## 0.3.4 - 28 Oct 2026

Update with `/plugin marketplace update crew`, `/plugin update toon-crew@crew`, then `/reload-plugins` or a new session, and restart the board.

### Fixed

- Cost "Today" counted a long session's whole history the first time the board saw it. Usage is now filed by the day of each call, so Today and 7 days only count calls made in that time.
- Queued was always empty because Doraemon queued each piece a moment before starting it. He now queues the whole plan up front.

### Changed

- Cost headline shows fresh tokens; cache reads (billed at about a tenth) are shown on their own line and column.
- Project chips wrap onto their own row instead of scrolling sideways.
- Every desk shows the crew member's title, model and effort level.

## 0.3.3 - 28 Oct 2026

The Crew Room is one page, with a cost ledger and a Needs you strip. Update with `/plugin marketplace update crew`, `/plugin update toon-crew@crew`, then `/reload-plugins` or a new session, and restart the board (`/toon-crew:board stop`, then `/toon-crew:board`).

### Added

- Needs you: an amber strip for permission and idle waits (from a new async Notification hook) and PRs that are ready for your review (projects with board polling on). Filtered to the picked project.
- Cost: token usage read from session transcripts (numbers only) and priced at Anthropic list prices, as an estimate. Today and 7 days, per agent and per task.
- Running and Queued task lists, a Ship card (deploy, CI, PRs, commits, app errors) and a log of finished tasks with hand-back, duration and cost.

### Changed

- One page: the Live tab and the wall of retired characters are gone.

### Fixed

- Hand-back lines no longer cut at the colon in "toon-crew:kevin".
- Security review fixes in the transcript reader, PR links and the board server (bounded memory, no FIFO hang, GitHub-only PR links, checked agent ids, a bad log line no longer stops the server).

## 0.3.2 - 27 Oct 2026 (not tagged)

Cleanup and docs ahead of 1.0.0. The version stays 0.3.2, so installed copies keep 0.3.2 until the next version bump. Needs Claude Code 2.1.295+ and Node 24.2+.

### Added

- README redesign: 81 lines, a hero image, a short "How it works" and a "Memory" section.
- Four user docs: `docs/how-it-works.md`, `docs/crew-room.md`, `docs/guards.md` and `docs/setup.md`.
- Real Crew Room screenshots and coloured diagrams.
- `scripts/board-demo.mjs`: writes a made-up Crew Room data folder, for screenshots.
- `LICENSE`: all rights reserved.
- A check that the version agrees in `plugin.json`, the README badge and the top CHANGELOG heading.
- CI job that validates the plugin and marketplace on Claude Code 2.1.295, the minimum version.
- CI runs the script tests (`scripts/*.test.mjs`).

### Changed

- The lessons pass is manual: Miguel Rivera runs it only when the owner or manager starts it. Nothing schedules it.
- Agent descriptions no longer end in "(v0.4)".
- The Live tab's error panel names "your configured containers" instead of "api and worker".
- CI needs at least one passing test in each test step, so an empty test glob can no longer pass.

### Removed

- The pre-1.0 planning notes, the 0.1.0 cost baseline, the roster page and the board-v2 design. The last commit that has them is `0ca2aee`.

### Fixed

- Board task tests no longer depend on the date.

### Earlier in 0.3.2 (26 Oct 2026)

- Board: every project has its own crew room. Picking a project shows only its crew; "All projects" stacks one room per project, busiest first, so two Doraemons (or two Bobs) can work at once. Nothing is dimmed any more. `/api/state.rooms` gives each project its members and manager state.

## 0.3.1 - 26 Oct 2026 (not tagged)

- Board: the animated Crew Room is back with Active/Queued and the picker. The page has two tabs, Live and Crew Room. The Crew Room has the pixel office with walking characters, speech bubbles, hover cards, the wall of framed former crew and a Motion button; the Live tab is the plain text view. Both tabs share the project picker and the Active and Queued panels.
- Board tasks: a task is bound to the agent that started it and that agent's stop finishes it, so one missed stop no longer leaves the newest task Active forever; a task with no activity (its own or its agent's) for 6 hours shows as done (stale).
- Docs: `docs/how-it-works.md` opens with one numbered flow diagram of the whole crew, from your request to the release, with the board's feed alongside.

## 0.3.0 - 26 Oct 2026 (not tagged)

Board v2.

- Board: one simple page. A project picker at the top (other projects are greyed) and five lists: Active, Queued, Crew, Recent and Facts. The pixel room and the Live tab are retired.
- Tasks: `board.sh task add|start|done|drop|list` queues work per role and project. An assign makes the oldest queued task for that role active; the role's hand-back finishes it. A resume (SendMessage) re-opens the latest done task if it finished within 30 minutes.
- New skill `toon-crew:task`: runs `board.sh task ...` for Doraemon, who now queues each planned piece with it.
- Per-project feed and facts: each feed item carries its project, and `/api/state.factsByProject` gives Live and Branch for every registered project.
- Docs: `docs/how-it-works.md` (the flow, roles, memory, several projects, tasks, using the board); README points to it.

## 0.2.2 - 24 Oct 2026 (not tagged)

- Guard: the memory email check no longer flags package specs (`mermaid@11.4.1`, `@types/node@20.1.0`, prereleases), IPs or `git@host:path` remotes; a domain must end in a letters-only TLD. Real emails (`someone@gmail.com`, `a.b+c@company.co.in`) are still refused.
- Guard: only the DevOps Team (`mike-wazowski`, `sulley`) may merge pull requests, and the owner confirms each merge (ask). Everyone else is refused, Doraemon and the main thread included, on every route: `gh pr merge`, `gh api`/curl `pulls/<n>/merge` and `merges`, the GraphQL merge mutations, and MCP merge tools. `--admin` and auto-merge (`--auto`, `enablePullRequestAutoMerge`) are refused for every role. The owner's own `!` commands skip hooks, so the owner can always merge.
- Guard, merge hardening (security review): pushes to main/master follow the same rule (DevOps asked, everyone else refused), and so do REST contents writes and MCP file writes with no branch or main/master; `gh workflow run`, `gh repo edit`, workflow dispatches and PR approvals (`gh pr review --approve`, REST reviews with `event=APPROVE`, GraphQL `addPullRequestReview`/`submitPullRequestReview`, MCP review tools) are DevOps only. DevOps rights need the exact plugin name (`toon-crew:mike-wazowski`, `toon-crew:sulley`); bare or re-cased names are treated as other roles. Refused for every role: rulesets and branch-protection changes, `createCommitOnBranch`, GraphQL bodies from a file, stdin or a variable, curl `-K`/`--next`/`--variable`, write requests to a URL in a variable, `GH_CONFIG_DIR`/`GH_HOST`, unknown `gh` subcommands (aliases, extensions), gh behind `xargs`, `gh auth status --show-token`, `git credential fill`, and reading `~/.config/gh` or `~/.git-credentials` (the guard now also runs on Read and Grep). Launchers (`watch`, `script`, `tmux`, `screen`, `su -c`, `ssh`, `flock`, `unbuffer`, `parallel`) and pager/editor variables are checked like the command they run; `gh api` checks every positional and collapses `//` and `/./`; wget `--method`, httpie and xh methods are parsed. The merge prompt names the PR and repo when known.

## 0.2.1 - 23 Oct 2026: fixes from the Claude Code docs review

- Guard: new spawn rule. Only Doraemon (the main session) starts crew agents; Dekisugi may start only `toon-crew:olaf` or `toon-crew:stuart` (prefixed names only); other crew roles may not spawn. Agents outside the crew are unchanged.
- Guard fails closed: unreadable input or an internal error now blocks (exit 2, not exit 1). The guard hook sets `"onFailure": "block"`, so **Claude Code 2.1.295 or later is needed**.
- Guard matcher now also covers `Agent` and `Monitor` (Monitor runs shell commands).
- Read-only roles: `Agent` added to `disallowedTools` for stuart, joe-gardner, nobita, olaf and ninja-hattori. `memory:` adds Write back to their tools (seen on 2.1.309), so the guard is the lock on their writes.
- Security review (3 rounds): no subagent may write, move or replace the live plugin or a folder holding it, including through git in the plugin's checkout, exported `GIT_*` variables, `checkout-index --prefix`, unpacking and `patch`. Read-only roles with Bash may not write git config, branches, refs or archives outside temp; dangerous git config keys are refused for everyone. Crew other than Doraemon may not use SendMessage, CronCreate, Workflow or RemoteTrigger. Own-memory writes are tied to the current project. Known limit: a script file run from temp is not caught; the Claude Code sandbox is the real boundary for Bash.
- Doraemon never passes `model` when spawning, except the listed escalations (a per-call model beats the agent file).
- Board: records the declared and the effective model per spawn, and shows an "override" badge when they differ.
- Async board hooks no longer set a timeout (Claude Code doesn't enforce it on async hooks); `scripts/check-structure.mjs` requires timeouts only on blocking hooks.
- Docs: README corrects the `CLAUDE_CODE_SUBAGENT_MODEL` advice (it only affects agents without a model, so it doesn't make the crew cheaper) and says which settings go in each project; cost baseline and roster updated.

## 0.2.0 - 23 Oct 2026

Cast v2: the engineering crew re-cast with the owner's favourite cartoons (the plan is in git history). 15 agents, every prompt tag now `(v0.4)`.

- New ids: miguel-rivera (Knowledge Manager, was dorami), kevin (Backend Lead, was scrooge), bob (Backend Developer, was bob-the-builder), ninja-hattori (Security Engineer, was scooby-doo), joe-gardner (QA Engineer, was tom), dekisugi (Research Lead, was dexter), olaf (Research Analyst, was velma), stuart (Code Search Assistant, was chip-and-dale).
- DevOps split in two: mike-wazowski (DevOps Engineer: CI, builds, Docker, local stack) and sulley (SRE: deploys, rollouts, rollbacks, backups, monitoring, incidents), both from chhota-bheem.
- New: twenty-two, Exploratory Tester on the QA Team (edge cases, odd paths, browser walk-throughs; exact repro steps; never fixes).
- Every description starts with title and team and routes with the new names; Doraemon assigns by team and title.
- Skills: generic `integrations` replaces the project-specific `guarded-integrations`; `security-backend` trimmed to generic rules; crew-lessons and the project-profile template use the new names.
- Evals: cases renamed to the new ids (for example `joe-not-run-vs-passed`, `hattori-proof-fails-before-fix`, `stuart-path-line-read-only`), plus `twenty-two-edge-case-repro`.
- Retired characters hang as framed pictures; `docs/setup.md` (Upgrading from 0.x) maps old memory folders to new ones.

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
