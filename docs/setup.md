# Set up, update and develop

For anyone who is installing `toon-crew`, tuning it for a project, updating it, or working on the plugin itself. The quick install is in the [README](../README.md#quick-start); this page has everything after it.

## Requirements

- **Claude Code 2.1.295 or later.** The guard hook uses `"onFailure": "block"`, which older versions do not support.
- **Node 24.2 or later, with `node` on your PATH** (the hooks and the board both run it). The board scripts are TypeScript run directly by Node, and the board's hook uses `import.meta.main`, which Node added in 24.2.
- **`gh`**, only if you turn on CI and pull request polling.
- **`gitleaks`**, only for the owner's lessons pass.
- There is nothing to `npm install`: the plugin has no dependencies.

## What happens on first run

1. **You choose where the manager (Doraemon) runs.** Installing the plugin does not make it your main agent. You [turn the manager on per project](#turn-the-manager-on-or-off); until then the guard and the crew agents are available, but your session is a plain Claude Code chat.
2. **Your project is registered.** At session start the plugin records the project's path and name in its own data folder, which Claude Code gives the plugin as `$CLAUDE_PLUGIN_DATA`. It is usually `~/.claude/plugins/data/toon-crew-crew/` (plugin name, a dash, marketplace name); run `ls ~/.claude/plugins/data/` to check. The event log lives there too. Polling and the lessons pass are both off.
3. **The manager writes a project profile.** When you first ask for real work and `.claude/crew/project.md` is missing or stale, the manager runs the `project-profile` skill. It writes that page from what is in your repo: test and build commands, docs per role, no-go areas, deploy rules. It is checked into your project, so read it before you commit it.
4. **Nothing else starts by itself.** The board is not running yet. Open it with `/toon-crew:board` (see the [README](../README.md#crew-room-optional)).

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

## Turn the manager on or off

The manager is opt-in per project. It runs on Opus and delegates, so a crew session uses more of your plan than a plain chat; turning it on only where you want a crew keeps that cost to those projects.

**On.** Either of these:

- Add this to the project's `.claude/settings.json`. Edit the file yourself: the guard blocks the crew from it.

  ```json
  { "agent": "toon-crew:doraemon" }
  ```

- Or start one session with it: `claude --agent toon-crew:doraemon`.

**Off.** Remove the `agent` line from the project's `.claude/settings.json`, or start Claude Code without `--agent`. The guard and the crew agents stay available.

To switch off the whole plugin for one project (this also turns off the guard):

```
claude plugin disable toon-crew@crew --scope project
```

## Update and uninstall

`version` in `plugin/.claude-plugin/plugin.json` pins each project to a release, so nothing changes until you ask:

```
/plugin marketplace update crew
/plugin update toon-crew@crew
```

Then `/reload-plugins`. Read [CHANGELOG.md](../CHANGELOG.md) first. To remove the plugin, use `/plugin` and uninstall `toon-crew`, or run `claude plugin uninstall toon-crew@crew`. Claude Code also deletes the plugin's data folder unless you pass `--keep-data`. Your project's `.claude/crew/` and agent memory stay.

## Upgrading from 0.x

The memory folders are named `toon-crew-<id>`. Early versions used other names for the crew. The manager carries a map of the old names, and the board counts old events for the role that took over, so nothing breaks. Only a project that still holds old memory folders needs a one-time move.

<details>
<summary>Memory folder moves (old name to new)</summary>

Do this once per project, in a pull request you merge.

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

1. Copy (or append) each old `MEMORY.md` into its new folder. Folders without the `toon-crew-` prefix come from the earlier project-level agents.
2. Where two sources meet, merge duplicate bullets into one with a `(seen n)` count instead of keeping both.
3. Watch the two re-used ids: old `dekisugi/` and `ninja-hattori/` folders hold lessons from their old jobs (SRE and routes). Split old `dekisugi/` between mike-wazowski and sulley as the table says, and move old `ninja-hattori/` to bob. Neither goes to the new research lead or security engineer.
4. Check each merged file stays under 200 lines and holds no secrets, then remove the old folders in the same PR.

The retired characters and who took over each job are listed in [the Crew Room guide](crew-room.md#the-wall-retired-characters).

</details>

## Troubleshooting

- **The `/toon-crew:...` commands are missing.** Run `/reload-plugins`, then `/plugin` to check that `toon-crew` is installed and enabled.
- **The manager is not the main agent.** It is opt-in: the project's `.claude/settings.json` needs `"agent": "toon-crew:doraemon"`, or start with `claude --agent toon-crew:doraemon`. The plugin may also be disabled in this project (`claude plugin list` shows it). See [Turn the manager on or off](#turn-the-manager-on-or-off).
- **Install or update fails.** Claude Code clones the marketplace from GitHub, so you need `git` and a network. Check `claude --version` (2.1.295 or later) and run `/plugin marketplace update crew`.
- **The board is empty.** The hooks and the board must use the same [data folder](#what-happens-on-first-run). Start the board with `/toon-crew:board`. Started by hand without `CLAUDE_PLUGIN_DATA`, it reads `~/.toon-crew` instead.
- **The board shows a project but no CI or deploys.** Polling is off until you run `/toon-crew:project board on` and the project's `project.md` has a `## Board` section. See [Show CI, pull requests, commits and deploys on the board](#optional-show-ci-pull-requests-commits-and-deploys-on-the-board).
- **Nothing is logged at all.** Check `node --version`. The board's hook needs 24.2 or later. (On older Node it likely loads but writes no events; that has not been tested.)
- **A builder's worktree started from the wrong branch.** Add the `worktree` setting in [Recommended: make builders start from your branch](#recommended-make-builders-start-from-your-branch). Plugin settings cannot set it.
- **A read-only agent wrote a file.** That is allowed for its own memory file, temp folders and its docs folder. See [Guards](guards.md#the-rules).
- **The guard blocked something you want.** Run that command yourself with `!`, or on GitHub's website. The guard does not check your own commands.

## Other skills

The [README](../README.md#commands) lists the four skills you will use most. The rest:

| Skill | Who runs it | What it does |
|---|---|---|
| `task` | The manager (you can type it too) | Queues and moves board tasks: `add`, `start`, `done`, `drop`, `list` |
| `project-profile` | The manager, on first run or when `project.md` is stale | Writes `.claude/crew/project.md` |
| `security-backend` | Kevin and Ninja Hattori (Bob when a task needs it) | Checklist for code that holds personal data, logins or secrets |
| `integrations` | Kevin and Ninja Hattori (Bob when a task needs it) | Checklist for code that calls a third-party API |
| `forget` | You | Removes a project from the board's list; with no argument it lists the projects |
| `crew-lessons` | The repo owner, with Miguel Rivera | The shared-lessons pass; needs `gitleaks` |

Who loads which skill is in [How it works](how-it-works.md#skills-the-crew-uses).

## Develop

The installable plugin lives in `plugin/` (agents, skills, hooks, board, evals, settings). The marketplace entry points at `./plugin`, so `docs/`, CI files and scripts are not copied into installs. The repo root holds the marketplace file, docs, scripts and CI.

```
node --test tests/hooks/*.test.mjs                 # guard, review proofs and registry tests
node --no-warnings --test tests/board/*.test.ts    # board tests
node scripts/check-structure.mjs                         # manifest, marketplace, hooks checks
claude plugin validate . --strict                        # marketplace
claude plugin validate ./plugin --strict                 # plugin
claude --plugin-dir ./plugin                             # try the plugin in a session
```
