# Security policy

## Report a vulnerability
Please report security problems privately. On the repository page, open the **Security** tab and choose **Report a vulnerability**. Do not open a public issue or pull request for a security problem.

Include what you found, the version (`plugin/.claude-plugin/plugin.json`), the steps to reproduce it, and what you think the impact is. Do not include real secrets or personal data.

## What is in scope
- **The guard** (`plugin/hooks/guard.mjs` and its helpers): a way to run, write or merge something it should ask about or refuse.
- **The hooks** (`plugin/hooks/`): a way to make them write secrets or personal data into the log, read outside their folder, or fail open.
- **The board** (`plugin/board/`): a way to reach it from outside your machine, write through it, or make it show unredacted secrets.

## What is not in scope
- The guard is a seatbelt, not a sandbox, and it does not check commands you type yourself. These limits are documented in [docs/guards.md](docs/guards.md#what-the-guard-cannot-do).
- Problems in Claude Code, GitHub or `gh` themselves: report those to their owners.

## Supported versions
Only the latest release gets fixes. Update with `/plugin update toon-crew@crew`.
