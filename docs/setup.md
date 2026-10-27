# Set up, update and develop

For anyone who is installing `toon-crew`, tuning it for a project, updating it, or working on the plugin itself. The quick install is in the [README](../README.md#quick-start); this page has everything after it.

## Requirements

- **Claude Code 2.1.295 or later.** The guard hook uses `"onFailure": "block"`, which older versions do not support.
- **Node 24.2 or later.** The board scripts are TypeScript run directly by Node, and the board's hook uses `import.meta.main`, which Node added in 24.2.
- **git access to this private repo**, to install (`gh auth status` is green, or an SSH key is set up).
- **`gh`**, only if you turn on CI and pull request polling.
- **`gitleaks`**, only for the owner's lessons pass.
- There is nothing to `npm install`: the plugin has no dependencies.

## What happens on first run

1. **You talk to Doraemon.** The plugin makes him the main agent in every session (`"agent": "toon-crew:doraemon"`). If you have your own `agent` setting, yours wins.
2. **Your project is registered.** At session start the plugin records the project's path and name in its own data folder. Polling and the lessons pass are both off.
3. **He writes a project profile.** When you first ask for real work and `.claude/crew/project.md` is missing or stale, Doraemon runs the `project-profile` skill. It writes that page from what is in your repo: test and build commands, docs per role, no-go areas, deploy rules. It is checked into your project, so read it before you commit it.
4. **Nothing else starts by itself.** The board is not running yet. Open it with `/toon-crew:board` (see the [README](../README.md#quick-start)).

## Per-project setup

Most projects need nothing. Two optional steps help.

### Recommended: make builders start from your branch

Plugin settings can only set `agent` and `subagentStatusLine`; Claude Code drops every other key. So anything else goes in each project's own `.claude/settings.json`:

```json
{
  "worktree": { "baseRef": "head" },
  "env": { "CLAUDE_CODE_SUBAGENT_MODEL": "sonnet" }
}
```

- `worktree.baseRef: head` (recommended): builders that work in their own worktree (kevin, bob, shinchan, mike-wazowski, sulley) start from your working branch, not the default branch.
- `CLAUDE_CODE_SUBAGENT_MODEL` (optional): this does **not** make the crew cheaper. Claude Code picks a subagent's model in this order: the `model` passed on the call, then the agent file's `model`, then this variable, then the main session's model. Every crew agent sets its own `model`, so the variable only reaches agents without one, such as the built-in general-purpose agent.
- Do not set `CLAUDE_CODE_SUBAGENT_MODEL_FORCE`. It makes Claude Code ignore every agent file's `model` and every per-call model, so it would quietly move every crew role onto one model.
- Optional, your choice: `/model opusplan` runs the main session on Opus in plan mode and on Sonnet the rest of the time.

> [!NOTE]
> The guard blocks Claude from editing `.claude/settings*.json`, so make these edits yourself.

### Optional: show CI, pull requests, commits and deploys on the board

Two things are needed, and both are yours to decide. Run this in the project:

```
/toon-crew:project board on
```

Then add a `## Board` section to the project's `.claude/crew/project.md` (the `project-profile` skill can write one):

```markdown
## Board
- github: owner/repo
- branches: main, feat/x
```

`github` turns on CI, pull request and commit polling through `gh`. The `deploy-ssh`, `deploy-result`, `deploy-log` and `deploy-containers` keys turn on a read-only deploy check over ssh. All keys and their formats are in [plugin/board/README.md](../plugin/board/README.md). With no section, or with the flag off, nothing is polled.

## Update and uninstall

`version` in `plugin/.claude-plugin/plugin.json` pins each project to a release, so nothing changes until you ask:

```
/plugin marketplace update crew
/plugin update toon-crew@crew
```

Then `/reload-plugins`. Read [CHANGELOG.md](../CHANGELOG.md) first. To remove the plugin, use `/plugin` and uninstall `toon-crew`; Claude Code's default also deletes the plugin's data folder.

## Develop

The installable plugin lives in `plugin/` (agents, skills, hooks, board, evals, settings). The marketplace entry points at `./plugin`, so `docs/`, CI files and planning notes are not copied into installs. The repo root holds the marketplace file, docs, scripts and CI.

```
node --test plugin/hooks/test/*.test.mjs                 # guard, review proofs and registry tests
node --no-warnings --test plugin/board/test/*.test.ts    # board tests
node scripts/check-structure.mjs                         # manifest, marketplace, hooks checks
claude plugin validate . --strict                        # marketplace
claude plugin validate ./plugin --strict                 # plugin
claude --plugin-dir ./plugin                             # try the plugin in a session
```
