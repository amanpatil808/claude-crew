# <Project name>: crew notes

Updated <YYYY-MM-DD HH:MM> UTC by <agent>. Every crew member reads this page and `CLAUDE.md` before starting.
Lines marked `(owner)` were set by the owner; agents keep them as they are.

## Project
- What it is: <one line>
- Stack: <languages, frameworks, database>
- Current version or mode: <e.g. "2.0 (apps/, packages/); legacy backend/ is frozen">

## Commands
| Job | Command | Status | Source |
|---|---|---|---|
| Install | `<cmd>` | ran ok / found, not run / unverified | `<file:line>` |
| Test (all) | `<cmd>` | | |
| Lint | `<cmd>` | | |
| Typecheck | `<cmd>` | | |
| Format | `<cmd>` | | |
| Build | `<cmd>` | | |
| Run locally | `<cmd>` | | |
| Services up / down | `<cmd>` / `<cmd>` | | |

- Env the suite needs (names only): <VAR_A, VAR_B; where the example file is>
- Without services: <tests skip cleanly / fail; how to tell>
- Green means: <the steps CI runs, from the workflow file>

## Docs per role
| Role | Read first |
|---|---|
| doraemon (Engineering Manager) | <plan, architecture, team rules> |
| miguel-rivera (Knowledge Manager) | <where lessons and crew records live> |
| kevin (Backend Lead) | <architecture, API spec, security notes> |
| bob (Backend Developer) | <API spec, route contract, legacy code> |
| mike-wazowski (DevOps Engineer) | <compose files, CI workflows, build scripts> |
| sulley (SRE) | <runbook, deploy and backup scripts, monitoring> |
| nobita, shinchan (UX & Design Lead, Frontend Developer) | <design direction, tokens, how to run with fake data> |
| shizuka (Technical Writer) | <README, user docs, which doc serves which version> |
| dekisugi, olaf (Research Lead, Research Analyst) | <product plan, data model> |
| ninja-hattori (Security Engineer) | <architecture, threat notes> |
| joe-gardner, twenty-two (QA Engineer, Exploratory Tester) | <this page's Commands section; main user journeys> |

## No-go areas
- <production hosts and data: never touched without the owner's approval in the session>
- <personal folders, real provider accounts>
- <secret and data folders, e.g. data/, secrets/>
- <generated output, e.g. dist/; vendored code, e.g. vendor/>

## Git and PRs
- Default branch: <main>. Branches: <feat/..., fix/...>.
- Only the manager commits. PRs only; the owner merges. Never push to the default branch or force-push.
- Required checks: <list>

## Deploy and release
- Trigger: <e.g. every merge to main releases and deploys>
- Who may deploy: <owner only / CI only>
- Rollback: <how>
- Never in automation: <e.g. `docker compose down -v`, deleting volumes>

## Work folders
- Scratch files go outside the repo: `$TMPDIR/crew-<agent>/` unless a brief says otherwise.

## Board
<!-- Optional. Replace this comment with one line per key the owner wants polled, and nothing else; keys and formats are in the project-profile skill, section 4. Delete the section if the board should poll nothing. -->
