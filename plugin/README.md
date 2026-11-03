# toon-crew

toon-crew is a Claude Code plugin. A manager agent plans your request and briefs 14 specialists a few at a time: backend, frontend, DevOps, security, QA, research and docs. Each does one job. One request in, a reviewed pull request out, and nothing merges without your yes.

It is an unofficial fan project: the characters belong to their owners, and the code is MIT licensed.

## Install

In Claude Code, inside any project:

```
/plugin marketplace add amanpatil808/claude-crew
/plugin install toon-crew@crew
/reload-plugins
```

Needs Claude Code 2.1.295 or later and Node 24.2 or later.

## Turn the manager on (opt-in)

Installing the plugin does not change your session. To work with the crew in a project, add `"agent": "toon-crew:doraemon"` to that project's `.claude/settings.json`, or start one session with `claude --agent toon-crew:doraemon`. The manager runs on Opus, so a crew session uses more of your plan than a plain chat. Remove the line to switch it off.

## What it changes on your machine

- **One environment variable.** The plan-usage mod (`hooks/plan-mod.mjs`) sets `TOON_CREW_LIMITS` to your plan's usage percentages and reset times. Nothing else.
- **One data folder.** Events, hand-backs and `limits.json` go to the plugin's data folder, readable only by you.
- **Your own `gh` and `ssh`, opt-in.** Only after `/toon-crew:project board on` and a Board section in `project.md`, and only while the optional Crew Room page is running. Results stay local.
- **No network calls of its own.** The plugin has no server. Claude Code talks to Anthropic as usual.

Details: [what it changes](https://github.com/amanpatil808/claude-crew#what-it-changes-on-your-machine) and the [privacy page](https://github.com/amanpatil808/claude-crew/blob/main/docs/privacy.md).

## The guard

A hook checks risky tool calls before they run. It asks you before a merge or a push to `main`, and refuses force pushes and recursive deletes. It is a seatbelt, not a sandbox, and it does not check commands you type yourself. [What it asks and refuses](https://github.com/amanpatil808/claude-crew/blob/main/docs/guards.md).

## More

- [Full README](https://github.com/amanpatil808/claude-crew#readme)
- [Setup, update and uninstall](https://github.com/amanpatil808/claude-crew/blob/main/docs/setup.md)
- [How it works](https://github.com/amanpatil808/claude-crew/blob/main/docs/how-it-works.md)
- [Report a problem](https://github.com/amanpatil808/claude-crew/issues)
