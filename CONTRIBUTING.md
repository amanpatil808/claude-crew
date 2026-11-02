# Contributing to toon-crew

Thanks for helping. Bug reports and ideas: [open an issue](https://github.com/amanpatil808/claude-crew/issues). Security problems: see [SECURITY.md](SECURITY.md), not an issue.

## Set up
There is nothing to install: no `package.json`, no dependencies. You need Node 24.2+ and Claude Code 2.1.295+. The plugin lives in `plugin/`; docs, scripts and CI are at the repo root. Try your change in a session with `claude --plugin-dir ./plugin`.

## Run the checks
CI runs these (`.github/workflows/ci.yml`); run them before you open a pull request:

```
node scripts/check-structure.mjs
claude plugin validate . --strict
claude plugin validate ./plugin --strict
node --test tests/hooks/*.test.mjs
node --no-warnings --test tests/board/*.test.ts
```

CI also scans every commit for secrets with gitleaks. There is no linter or type checker.

## Branches and pull requests
- Branch from `main`: `feat/...`, `fix/...` or `docs/...`.
- Open a pull request; never push to `main` or force-push.
- Keep a pull request to one change, and say in it what you ran and what you did not.
- A release changes `version` in `plugin/.claude-plugin/plugin.json`, the README version badge and the top `CHANGELOG.md` heading together; the structure check fails if they disagree.
- The maintainer merges, after CI is green.

## Ground rules
- Docs must match the code: check every command, path and name before you write it.
- Never commit secrets, personal data or real event logs.
- Character names and art belong to their owners; see [NOTICE](NOTICE). The code is under the [MIT licence](LICENSE).
- By sending a pull request you agree that your contribution is licensed under the same MIT licence.
