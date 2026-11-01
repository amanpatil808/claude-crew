<div align="center">
<h1>toon-crew</h1>
<p><b>Your AI engineering team in Claude Code: one manager, 14 specialists, a live board.</b></p>
<p><img alt="version 0.3.14" src="https://img.shields.io/badge/version-0.3.14-blue?style=flat-square"> <img alt="Claude Code 2.1.295+" src="https://img.shields.io/badge/Claude_Code-2.1.295%2B-orange?style=flat-square"> <img alt="Node 24.2+" src="https://img.shields.io/badge/Node-24.2%2B-green?style=flat-square"></p>
</div>

<p align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/hero-dark.gif"><img src="docs/images/hero-light.gif" alt="The Crew Room board: each team in its own room, crew at their desks with their task, and the plan usage panel on the right. Demo data." width="820"></picture><br><sub>The Crew Room: your crew at work, live (demo data)</sub></p>

## Quick start
In Claude Code, inside any project:

```
/plugin marketplace add amanpatil808/claude-crew
/plugin install toon-crew@crew
/reload-plugins
```

Then ask Doraemon for anything. He is your main agent from now on. On your first request he writes `.claude/crew/project.md`: read it before you commit it. To watch the crew, run `/toon-crew:board` and open `http://127.0.0.1:<port>` (it prints the port).

<details>
<summary>Install fails with a clone error?</summary>

This repo is private. Run `gh auth status`: it must be green. Or set up an SSH key. Then run the commands again.

</details>

## What you get
<table>
<tr>
<td width="50%" valign="top">
<b>A crew, not one agent</b><br>
Doraemon plans; 14 specialists each do one job.
</td>
<td width="50%" valign="top">
<b>Guards ask before risky steps</b><br>
Risky commands ask you first; the worst are refused.
</td>
</tr>
<tr>
<td width="50%" valign="top">
<picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/plan-panel-dark.png"><img src="docs/images/plan-panel-light.png" alt="Plan usage panel with the 5-hour and weekly limits, then each crew member's share. Demo data." width="440"></picture><br>
<b>A live board, plus plan usage</b><br>
Who works, what is queued, plan usage (Pro or Max).
</td>
<td width="50%" valign="top">
<b>Hand-back files, nothing lost</b><br>
Every crew member leaves a written report you can reread.
</td>
</tr>
</table>

<p align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/needs-you-dark.png"><img src="docs/images/needs-you-light.png" alt="The board's Needs you list with two items: pull request 42 is ready for your review, and Bob is waiting for your permission. Demo data." width="820"></picture><br><sub>When the crew needs you, the board says so (demo data)</sub></p>

## How it works
<p align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/how-it-works-dark.svg"><img src="docs/images/how-it-works-light.svg" alt="Four comic panels: you ask Doraemon for a dark mode toggle; he queues it for Nobita, Shinchan and Joe; they work at their desks while the guard watches; a pull request is ready, you say merge, and Mike and Sulley merge it." width="820"></picture></p>

1. **You ask in plain words.** You talk to Doraemon only.
2. **Doraemon plans and briefs.** He queues each piece on the board and briefs the right specialist.
3. **The crew works in parallel.** Doraemon checks every result; the guard asks you before risky steps.
4. **You say merge, DevOps merges.** Doraemon opens a pull request; Mike or Sulley merges it after you approve.

## Meet the crew
Fifteen crew members in nine teams, one job each. Doraemon is the manager; you talk to him.

<details>
<summary>All 15 crew members</summary>

| Team | Members | What they do |
|---|---|---|
| Management | Doraemon, Miguel Rivera | Plan, brief, commit; keep lessons |
| Frontend | Nobita, Shinchan | Design direction, styles and reviews (Nobita); behaviour and logic (Shinchan) |
| Backend | Kevin, Bob | Data, logins, APIs, integrations |
| DevOps | Mike Wazowski, Sulley | CI, builds, deploys, merges |
| Security | Ninja Hattori | Attack-style reviews with proof tests |
| QA | Joe Gardner, 22 | Every check, every edge case |
| Research | Dekisugi, Olaf | Cited research and fact-checks |
| Documentation | Shizuka | Docs, release notes, launch copy |
| Helpers | Stuart | Quick code lookups |

</details>

## Commands
| Command | What it does |
|---|---|
| `/toon-crew:board [start\|stop\|status]` | Starts, stops or checks the board |
| `/toon-crew:task add\|start\|done\|drop\|list` | Queues and moves tasks on the board |
| `/toon-crew:project [board\|lessons] [on\|off]` | Allows or stops CI and deploy checks, or the lessons pass (both start off) |
| `/toon-crew:forget [name or path]` | Removes a project from the board's list |
| `/toon-crew:handbacks [dir\|list]` | Shows the hand-back folder, or lists the newest summaries |
| `/toon-crew:compact-setup` | Adds editable "Compact instructions" to your CLAUDE.md, after you approve the text |

Crew members use the rest automatically; `/toon-crew:crew-lessons` is for the repo owner only.

## Good to know
- **The guard is a seatbelt, not a sandbox.** An agent with a shell can get around it. Keep Claude Code's sandbox on.
- **The board is local only.** It listens on `127.0.0.1`, has no login and no buttons, and shows India time (IST).
- **Requirements:** Claude Code 2.1.295+, Node 24.2+ and git access to this private repo.
- **Private and unlicensed.** The plugin has no server and sends nothing by itself.

[Setup](docs/setup.md) · [How it works](docs/how-it-works.md) · [Guards](docs/guards.md)
