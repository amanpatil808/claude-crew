---
name: docs-diagram-lessons
description: Checks before drawing architecture diagrams for claude-crew, and how to validate Mermaid locally
metadata:
  type: project
---

- Before documenting a feature the brief names, grep the checked-out branch for it: the installed plugin cache and the marketplace clone under `~/.claude/plugins` can be newer than the working branch (the `task` skill and `board.sh task` existed there, not on this branch). Draw only what the branch's code has and flag the gap. (seen 1) [crew]
- Validate Mermaid with `npx -y @mermaid-js/mermaid-cli@11.4.0 -p pp.json -i x.mmd -o x.svg`; if puppeteer finds no browser, point `pp.json` `executablePath` at the system Chrome. (seen 1) [crew]
- Parsing is not readability: render to PNG (`-o x.png -w 1400`) and look. Edges into a subgraph and a stack of one-node-per-team boxes make tangled or 2000px-tall charts; point edges at a node inside, use `flowchart LR`, and fold lists into one multi-line node. (seen 1) [crew]
- Mermaid ignores a subgraph's `direction` when any edge touches the subgraph or a node in it (it renders as a 4000px column). For a layout diagram, use a separate block with no external edges and `~~~` to stack nodes; show "what feeds it" in a second small LR flowchart. Declaration order reverses left-to-right placement. (seen 1) [crew]
- When the guard hook blocks a Bash call with an "internal error", the command text broke its regex (an `sed` or heredoc with `|` and paths); redo the edit with the Edit tool instead of Bash. BSD sed on macOS also rejects `sed -i 's/..'` without a backup suffix. (seen 1) [crew]
- Do not put a CI status badge in a private repo's README: workflow badges there are unverified to render; use static shields for version and requirements and bump the version badge on each release. (seen 1) [project]
- After a rebase, re-grep README for duplicate headings: upstream had already added a short "## How it works" and `docs/how-it-works.md` (16-step flow); merge, don't duplicate. (seen 1) [project]
- Mermaid colour that reads on GitHub light and dark: mid-tone fill, `color:#111`, darker stroke, `stroke-width:2px`; transparent subgraph fills with `#8b949e` titles; one shared classDef block pasted in every diagram. `linkStyle` indices count every edge including invisible `~~~` ones in order of appearance, so put `~~~` lines last. Dark-mode PNGs also show edge labels as grey boxes, which is fine. (seen 1) [crew]
- Team colours in `plugin/agents/*.md` are per agent, not per team (security/management both blue, backend/helpers/frontend mix yellow); map to one hue per team and say so in the report. `stateDiagram-v2` accepts classDef/class by state name. (seen 1) [project]
- A team grid inside a subgraph that has in/out edges renders as a 2000px column; draw it as a separate edge-free block with `A ~~~ B` pairs (columns of 2, rows of 4 in `flowchart TD`) and keep a single node in the main flow. (seen 1) [crew]
- The guard blocks a Bash call that writes a script and runs it in one command; write the script with the Write tool, run it in a second call (inline `python3 - <<EOF` that edits a file is allowed). (seen 1) [crew]
- Crew Room "working" means an agent is running (agent-start without agent-stop); the assign event only supplies the task line (`plugin/board/lib/room.ts`). (seen 1) [project]
- When splitting a long README into docs/, grep the whole repo for `README.md#` anchors first (docs/guards.md, docs/how-it-works.md and plugin/board/README.md linked into it) and fix them in the same pass; a script that parses headings (GitHub slug rules) and checks every `](..)`, `src` and `srcset` catches the rest. (seen 1) [project]
- To fit a line budget, Mermaid `node:::class` inline styling saves one line per `class` statement, and a 9-row team table beats a colour-key diagram (about 11 lines vs 27, since every classDef costs a line). (seen 1) [crew]
- The old board flow diagram said "15 agents in 8 teams"; docs/roster.md lists nine teams. Check counts in moved diagrams against the roster instead of copying them. (seen 1) [project]
- Scratchpad files can be overwritten by another agent running in parallel; give helper scripts a distinctive name and re-run after a "changed on disk" notice. (seen 1) [crew]
- Before renaming a README heading, grep other docs for its anchor (`docs/faq.md` links `README.md#limits`; `docs/guards.md` points at "the Guards paragraph in How it works"); if you may not edit those files, keep the old heading text. (seen 1) [project]
- A "never stored" node in a Mermaid diagram: red classDef plus a dotted `-.-x` edge renders fine; 2 diagrams, 2 GitHub alerts and a 4-step list fit a 150-line README. (seen 1) [crew]
- README memory facts and sources: shell writes into agent-memory blocked `plugin/hooks/guard.mjs:316`; secret scan on memory Edit/Write `guard.mjs:1143` (`findSecret` covers keys, tokens, passwords, emails, phones, cards, not home paths); lessons flag defaults off `plugin/hooks/projects.mjs:64`; data folder `plugin/board/lib/paths.ts:11-17`. (seen 1) [project]
