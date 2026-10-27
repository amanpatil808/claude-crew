# claude-crew: crew notes

Updated 2026-10-27 14:10 UTC by doraemon. Every crew member reads this page and `CLAUDE.md` (none yet) before starting.
Lines marked `(owner)` were set by the owner; agents keep them as they are.

## Project
- What it is: the `toon-crew` Claude Code plugin (cartoon agent crew, Crew Room status board, safety guard hooks, shared lessons) plus its marketplace `crew`.
- Stack: Markdown agent and skill definitions; Node ESM hooks (`plugin/hooks/*.mjs`); board server in TypeScript run directly by Node (`plugin/board/*.ts`, `lib/*.ts`) with a plain HTML/CSS/JS page. No package manager, no lockfile.
- Current version: see `plugin/.claude-plugin/plugin.json` and `CHANGELOG.md`.

## Commands
| Job | Command | Status | Source |
|---|---|---|---|
| Install | none (no dependencies) | found, not run | repo has no `package.json` |
| Structure check | `node scripts/check-structure.mjs` | found, not run | `.github/workflows/ci.yml:34` |
| Validate plugin | `claude plugin validate . --strict` and `claude plugin validate ./plugin --strict` | found, not run | `.github/workflows/ci.yml:37-40` |
| Test (guard hooks) | `node --test plugin/hooks/test/*.test.mjs` | found, not run | `.github/workflows/ci.yml:45` |
| Test (board) | `node --no-warnings --test plugin/board/test/*.test.ts` | found, not run | `.github/workflows/ci.yml:53` |
| Secrets scan | `gitleaks detect --source . --config .gitleaks.toml --redact` | found, not run | `.github/workflows/ci.yml:70-74` |
| Lint / Typecheck / Format | none defined | unverified | TODO(verify) |
| Run locally (board) | `bash plugin/board/board.sh start` (also `stop`, `status`, `export`, `test`) | found, not run | `plugin/board/README.md` |

- Env: `CLAUDE_PLUGIN_DATA`, `CLAUDE_PLUGIN_ROOT`, `BOARD_PORT`, `BOARD_LOG_DIR` (board); no services needed.
- Green means: structure check, strict validate of marketplace and plugin, guard and board tests with 0 fail, 0 skipped, 0 todo, and gitleaks over all commits.

## Docs per role
| Role | Read first |
|---|---|
| doraemon (Engineering Manager) | `README.md`, `docs/planning/toon-crew-plan.md`, `docs/roster.md`, `CHANGELOG.md` |
| miguel-rivera (Knowledge Manager) | `docs/lessons/`, `.claude/agent-memory/`, `plugin/skills/crew-lessons/` |
| kevin, bob (Backend) | `plugin/hooks/`, `plugin/board/lib/`, `plugin/board/README.md` |
| mike-wazowski (DevOps Engineer) | `.github/workflows/ci.yml`, `scripts/check-structure.mjs`, `.gitleaks.toml` |
| nobita, shinchan (Frontend) | `docs/planning/crew-room-brief.md`, `plugin/board/page.html`, `room.css`, `room.js`, `docs/design/` |
| shizuka (Technical Writer) | `README.md`, `plugin/board/README.md`, `docs/roster.md`, `CHANGELOG.md` |
| dekisugi, olaf (Research) | `docs/planning/crew-research.md`, `docs/planning/cast-v2.md` |
| ninja-hattori (Security Engineer) | `plugin/hooks/guard.mjs`, `plugin/board/lib/redact.ts`, `private-fs.ts`, `server.ts` |
| joe-gardner, twenty-two (QA) | this page's Commands section; `plugin/evals/` |

## No-go areas
- Personal folders and real provider accounts; the user's live `~/.toon-crew` or `$CLAUDE_PLUGIN_DATA` event logs.
- Secrets of any kind (gitleaks runs over every commit).
- `docs/design/crew-characters/ref/` images are owner reference material (folder has its own `.gitignore`).

## Git and PRs
- Default branch: `main`. Branches: `feat/...`, `fix/...`, `docs/...`.
- Only the manager commits. PRs only; never push to `main` or force-push.
- Only the DevOps Team merges, and only with the owner's confirmation (`CHANGELOG.md`, v0.2.2).
- Required checks: the `ci` workflow (`plugin` job and `secrets` job).

## Deploy and release
- Release: bump `version` in the plugin manifest plus a `CHANGELOG.md` entry; users update with `/plugin update toon-crew@crew`.
- No server deploy.

## Work folders
- Scratch files go outside the repo: `$TMPDIR/crew-<agent>/` unless a brief says otherwise.
