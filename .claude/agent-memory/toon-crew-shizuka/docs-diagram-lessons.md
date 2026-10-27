---
name: docs-diagram-lessons
description: Checks before drawing architecture diagrams for claude-crew, and how to validate Mermaid locally
metadata:
  type: project
---

- Before documenting a feature the brief names, grep the checked-out branch for it: the installed plugin cache and the marketplace clone under `~/.claude/plugins` can be newer than the working branch (the `task` skill and `board.sh task` existed there, not on this branch). Draw only what the branch's code has and flag the gap. (seen 1) [crew]
- Validate Mermaid with `npx -y @mermaid-js/mermaid-cli@11.4.0 -p pp.json -i x.mmd -o x.svg`; if puppeteer finds no browser, point `pp.json` `executablePath` at the system Chrome. (seen 1) [crew]
- Parsing is not readability: render to PNG (`-o x.png -w 1400`) and look. Edges into a subgraph and a stack of one-node-per-team boxes make tangled or 2000px-tall charts; point edges at a node inside, use `flowchart LR`, and fold lists into one multi-line node. (seen 1) [crew]
- After a rebase, re-grep README for duplicate headings: upstream had already added a short "## How it works" and `docs/how-it-works.md` (16-step flow); merge, don't duplicate. (seen 1) [project]
- Crew Room "working" means an agent is running (agent-start without agent-stop); the assign event only supplies the task line (`plugin/board/lib/room.ts`). (seen 1) [project]
