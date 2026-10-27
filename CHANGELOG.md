# Changelog

All notable changes to toon-crew. Versions follow `version` in `.claude-plugin/plugin.json`; projects pin to a version and update on purpose.

## 0.3.2 - unreleased

- Board: every project has its own crew room. Picking a project shows only its crew; "All projects" stacks one room per project, busiest first, so two Doraemons (or two Bobs) can work at once. Nothing is dimmed any more. `/api/state.rooms` gives each project its members and manager state.

## 0.3.1 - unreleased

- Board: the animated Crew Room is back with Active/Queued and the picker. The page has two tabs, Live and Crew Room. The Crew Room has the pixel office with walking characters, speech bubbles, hover cards, the wall of framed former crew and a Motion button; the Live tab is the plain text view. Both tabs share the project picker and the Active and Queued panels.
- Board tasks: a task is bound to the agent that started it and that agent's stop finishes it, so one missed stop no longer leaves the newest task Active forever; a task with no activity (its own or its agent's) for 6 hours shows as done (stale).
- Docs: `docs/how-it-works.md` opens with one numbered flow diagram of the whole crew, from your request to the release, with the board's feed alongside.

## 0.3.0 - unreleased

Board v2.

- Board: one simple page. A project picker at the top (other projects are greyed) and five lists: Active, Queued, Crew, Recent and Facts. The pixel room and the Live tab are retired.
- Tasks: `board.sh task add|start|done|drop|list` queues work per role and project. An assign makes the oldest queued task for that role active; the role's hand-back finishes it. A resume (SendMessage) re-opens the latest done task if it finished within 30 minutes.
- New skill `toon-crew:task`: runs `board.sh task ...` for Doraemon, who now queues each planned piece with it.
- Per-project feed and facts: each feed item carries its project, and `/api/state.factsByProject` gives Live and Branch for every registered project.
- Docs: `docs/how-it-works.md` (the flow, roles, memory, several projects, tasks, using the board); README points to it.

## 0.2.2 - unreleased

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
