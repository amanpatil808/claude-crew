# README teardown: 15 popular READMEs, and what toon-crew's should copy

By Dekisugi (Research Lead), 2026-11-01, for Shizuka (copy) and Nobita (visuals). This goes further than [readme-redesign.md](readme-redesign.md). Every README below was fetched raw on 2026-11-01, and star counts come from the GitHub API on the same day. Olaf scanned 8 of the repos. I re-checked shadcn/ui, ollama and tldraw against the raw files and corrected one row (ollama's first install command is on line 16, not line 11). Line counts marked "~" are estimates, because the fetch tool summarises.

## Verdict on ours (README.md at c7fd99a, 119 lines)
The facts are good and honest. The page is laid out like a manual. You reach the hero GIF at **line 73**, under the 4th H2. Before it come a 72-word bold pitch, a fan-project disclaimer, a cost caveat, a diagram and four illustrated cards. The page has **10 images in 3 visual styles** (an SVG diagram, illustrated PNG cards and a pixel-art GIF), **3 tables**, **8 H2s and 3 H3s**, and it says the guard 4 times. The best READMEs open with name, tagline, picture and install, keep to one visual style, and send the rest to docs.

## Comparison table
| Repo (stars) | Lines | First ~15 lines | Install | Features shown as | Images | `<details>` | Leaves out |
|---|---|---|---|---|---|---|---|
| [anthropics/claude-code](https://raw.githubusercontent.com/anthropics/claude-code/main/README.md) (154k) | 74 | H1, 2 badges, a 2-sentence pitch (~47 words), bold docs link, `demo.gif` at line 11 | "Get started" at line 13: a NOTE callout, then 5 methods (curl first) | none: Plugins is 3 lines and links out | 1 GIF + 2 badges | 0 | features, config, FAQ, TOC: all on the docs site |
| [openai/codex](https://raw.githubusercontent.com/openai/codex/main/README.md) (133k) | ~90 | centred bold name, a 12-word pitch, splash image at 80% width, links to IDE, desktop and web | "Quickstart" at line 12; curl at line 18; npm and brew below | none | 1 | 1: release binaries per platform | badges, features, TOC |
| [block/goose](https://raw.githubusercontent.com/block/goose/main/README.md) (56k; now aaif-goose) | 63 | H1, an italic tagline (~20 words), 5 badges + Trendshift | "Get started" at line 31: a download link, then 1 curl block | 4 prose paragraphs | 6 badges | 0 | screenshots, feature list; a humour section adds personality |
| [sst/opencode](https://raw.githubusercontent.com/sst/opencode/dev/README.md) (224k; now anomalyco) | 116 | `<picture>` logo (light/dark), a 6-word tagline, 3 badges, 22 language links | "Installation" (H3) at line 46: 1 block of 8 commented one-liners, then a TIP | 2 bold-label bullets (build/plan agents) | logo + TUI screenshot + 3 badges | 0 | config ("head over to our docs"); an "is not affiliated" note sits at the end |
| [Aider-AI/aider](https://raw.githubusercontent.com/Aider-AI/aider/main/README.md) (50k) | ~180 | logo, H1 headline, an 18-word tagline, screencast SVG, 5 badges | "Getting Started": 1 block, about 6 commands | 9 icon "cards" (H3 + 32px icon + 1 line) | ~16 SVG | 0 | ends with ~36 testimonials (the longest section) |
| [cline/cline](https://raw.githubusercontent.com/cline/cline/main/README.md) (71k) | ~236 | 80px logo, H1, an 11-word tagline, a nav table (Docs, Discord...) | `npm i -g cline` at line 50 | a 2x2 product-card table, then one H2 per capability | 1 (logo) | 0 | badges, screenshots |
| [astral-sh/uv](https://raw.githubusercontent.com/astral-sh/uv/main/README.md) (91k) | ~321 | H1, 3 badges, an 11-word tagline, a light/dark benchmark chart + caption | "Installation" at line 44: curl, PowerShell, pip, pipx | "Highlights": 11 plain bullets; Features by subcommand | chart + 3 badges + footer logo | 0 | TOC, GIF |
| [browser-use/browser-use](https://raw.githubusercontent.com/browser-use/browser-use/main/README.md) (120k) | ~380 | HTML comment, `<picture>` logo, `<picture>` agent art, 1 badge | mid-page, as a "which one do I need?" picker of 3 paths | bullets + FAQ | ~19 | 11 (FAQ) | TOC; a wall of 11 badge-links |
| [ollama/ollama](https://raw.githubusercontent.com/ollama/ollama/main/README.md) (186k) | ~410 | logo, H1, a short tagline, **0 badges** | "Download" (H2) is the first section; curl at line 16, one H3 per OS | none | 1 (logo) | 0 | badges, demo, pitch; 200+ lines of community links |
| [astral-sh/ruff](https://raw.githubusercontent.com/astral-sh/ruff/main/README.md) (50k) | ~350 | H1, 6 badges, Docs/Playground links, an 11-word tagline, a benchmark chart | under Getting Started: uvx, uv, pip, pipx, curl | ~10 emoji bullets | chart + 6 badges | 0 | the only one of the 15 with a TOC; has testimonials |
| [oven-sh/bun](https://raw.githubusercontent.com/oven-sh/bun/main/README.md) (96k) | ~455 | logo, HTML h1, 3 badges, a nav link row | "Install" (H2): one block per method | prose + code | 4 | 0 | screenshots; Guides is a 200-line link index |
| [shadcn-ui/ui](https://raw.githubusercontent.com/shadcn-ui/ui/main/README.md) (127k) | **17** | H1, a 3-sentence tagline, 1 hero image | **none**: links to the docs site | none | 1 | 0 | everything except Documentation, Contributing, License |
| [charmbracelet/gum](https://raw.githubusercontent.com/charmbracelet/gum/main/README.md) (25k) | ~400 | H1, logo, 3 badges, a 6-word tagline | "Installation": 1 block | one H2 per command, each with its own GIF | ~20 (GIFs) | 3: per-distro install | TOC |
| [BurntSushi/ripgrep](https://raw.githubusercontent.com/BurntSushi/ripgrep/master/README.md) (70k) | ~450 | title, a 7-line plain pitch, 3 badges | late, about 27 small blocks | "Why should I / shouldn't I use it" bullets + benchmark tables | 1 screenshot + 3 badges | 0 | logo, GIF; it states its own downsides |
| [tldraw/tldraw](https://raw.githubusercontent.com/tldraw/tldraw/main/README.md) (51k) | ~150 | `<picture>` wordmark, 4 badges, a centred h3 tagline, Docs/Examples links | "Quick start": `npm i tldraw` at line 46 | 7 bold-label bullets | 7 (incl. star chart, contributors) | 0 | TOC; ends with a **Trademarks** section after License |
| **toon-crew today** | 119 | h1, 4 unlinked badges, a 72-word bold pitch, fan disclaimer, install at 13 | 3 commands at line 13 (good) | 4 illustrated cards in a 2x2 table | 10 in 3 styles | 1 | nothing: setup, troubleshooting and update are all inline |

## The 10 patterns the great ones share (counted over the 15)
1. **A short line says what it is, in its category's words.** 7 of 15 taglines are 12 words or fewer: codex, uv, cline, opencode, tldraw, ruff and gum. Examples: "The open source AI coding agent." (opencode); "An extremely fast Python package and project manager, written in Rust." (uv). The long-pitch exception is claude-code, which makes up for it with the GIF right below.
2. **If there is a picture, it comes before install, in the first ~45 lines** (claude-code line 11, codex line 3, uv lines 9-15, opencode line 42, aider, tldraw, shadcn). It is usually real output: a GIF, a screenshot or a chart.
3. **One picture, one style.** 11 of 15 have a single hero or only a logo. Only gum, aider, browser-use and tldraw use many images, and gum and aider each keep to one style.
4. **Install is one copy-paste block under a plain "Get started", "Quickstart" or "Install" heading**, and the main method comes first. Everything else goes in `<details>` (codex, gum) or a callout (claude-code NOTE, opencode TIP).
5. **4 badges or fewer** (11 of 15), usually linked (claude-code, opencode, goose; not checked for every repo). The ones with no badges at all (codex, cline, ollama, shadcn) look cleanest.
6. **Features as short bold-label bullets or one heading per capability**, never paragraphs of marketing (uv Highlights, tldraw, opencode, cline). Picture cards appear only in aider (icons) and cline (text only).
7. **Docs live elsewhere.** When there is a docs site, the README stays short: claude-code 74, goose 63, codex ~90, opencode 116, shadcn 17. Config, troubleshooting, update steps and FAQs are links.
8. **No hand-made TOC** (14 of 15; only ruff has one) and **no emoji in headings** (14 of 15; goose's humour heading is the exception). GitHub builds an outline from the headings ([About READMEs](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-readmes), accessed 2026-11-01).
9. **Plain, boring heading names**: Get started / Quickstart, Documentation, Contributing, License. None of the 15 uses "Good to know" or "What you get".
10. **Caveats come after value, in one place.** Legal, affiliation and data notes sit at the end: claude-code's "Data collection" section, opencode's "not affiliated" paragraph, tldraw's "Trademarks" after License. The one caveat that sits up top is a single callout inside Get started (claude-code's NOTE).

Also worth stealing: goose's one-line humour section (personality without noise), and ripgrep's honesty about its own downsides ("Why shouldn't I use ripgrep?"). Both match our "seatbelt, not a sandbox" voice.

## Recommended order for toon-crew (target 70-85 lines)
| # | Heading | Lines | Content | Pattern |
|---|---|---|---|---|
| 1 | (centred header, no heading text beyond the name) | 9 | name, a tagline of 8 words or fewer, 4 **linked** badges (CI checks the version badge: `scripts/check-structure.mjs:73-75`) | 1, 5 |
| 2 | (pitch + hero) | 4 | a pitch of 2 sentences or fewer (40 words max), then the hero GIF with a caption | 2, 3 |
| 3 | `## Get started` | 12 | the 3 `/plugin` lines, "Then ask Doraemon for anything.", one `> [!NOTE]` on the main agent and plan use | 4, 10 |
| 4 | `## What the crew does` | 7 | 5 bold-label bullets: crew, guard, hand-backs, board + plan usage, you approve merges | 6 |
| 5 | `## How it works` | 6 | 4 numbered one-liners (today's lines 26-29, trimmed). No diagram | 3, 7 |
| 6 | `## The crew` | 15 | one line + today's `<details>` team table (keep it as is) | |
| 7 | `## Commands` | 7 | 4 rows: board, handbacks, project, compact-setup | 7 |
| 8 | `## Limits` | 5 | seatbelt not a sandbox; board local only; tested on macOS, Windows untested. ripgrep-style honesty | 10 |
| 9 | `## Documentation` | 6 | a list: Setup (update, uninstall, troubleshooting, turn Doraemon off), How it works, Guards, Crew Room, Changelog | 7 |
| 10 | `## Contributing` | 2 | issues link, CONTRIBUTING, SECURITY (one line each) | 9 |
| 11 | `## License and characters` | 3 | MIT for code only; the characters belong to their owners, unofficial fan project, NOTICE (as tldraw's Trademarks) | 10 |

## Skeleton: our first screen, word for word (facts from README, CHANGELOG 0.3.9/0.3.13/0.3.14 and setup.md)
```html
<div align="center">
<h1>toon-crew</h1>
<p><b>Turn Claude Code into an AI engineering team.</b></p>
<p>
<a href="CHANGELOG.md"><img alt="version 0.3.14" src="https://img.shields.io/badge/version-0.3.14-blue?style=flat-square"></a>
<a href="https://code.claude.com/docs/en/overview"><img alt="Claude Code 2.1.295+" src="https://img.shields.io/badge/Claude_Code-2.1.295%2B-orange?style=flat-square"></a>
<a href="docs/setup.md#requirements"><img alt="Node 24.2+" src="https://img.shields.io/badge/Node-24.2%2B-green?style=flat-square"></a>
<a href="LICENSE"><img alt="MIT licence" src="https://img.shields.io/badge/licence-MIT-lightgrey?style=flat-square"></a>
</p>
</div>

A manager agent, Doraemon, plans your request and briefs a crew of 14 specialists, a few at a time. A guard asks before risky commands, every task ends with a written hand-back, and no pull request merges without your yes.

<p align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/hero-dark.gif"><img src="docs/images/hero-light.gif" alt="(keep today's alt text)" width="820"></picture><br><sub>The Crew Room board: who is working, what is queued and how much of your plan is left (demo data)</sub></p>

## Get started
In Claude Code, inside any project:

```
/plugin marketplace add amanpatil808/claude-crew
/plugin install toon-crew@crew
/reload-plugins
```

Then ask Doraemon for anything. On your first request he writes `.claude/crew/project.md`; read it before you commit it.

> [!NOTE]
> Doraemon becomes your main agent wherever the plugin is on. He runs on Opus and delegates, so a crew uses more of your plan than a plain chat. [How to turn him off](docs/setup.md#troubleshooting).
```
Feature bullets for section 4 (all true at 0.3.14):
- **A crew, not one agent.** Doraemon plans; 14 specialists each do one job: backend, frontend, DevOps, security, QA, research, docs.
- **A guard on risky steps.** It asks before merges, pushes to `main` and other risky commands, and refuses the worst.
- **A hand-back for every task.** A short summary and a full report on disk, so nothing is lost after `/clear`.
- **A live board, if you want it.** `/toon-crew:board` shows desks, the queue and your 5-hour and weekly plan usage.
- **You stay in charge.** Nothing merges without your yes; the DevOps Team merges after you approve.

## Cut list (blunt)
| Today (line) | Problem | Do |
|---|---|---|
| 6: 72-word bold paragraph | A pitch should be about 12 words. Bold on a whole paragraph reads as shouting | Tagline (8 words) + a 2-sentence pitch |
| 6: "runs 14 specialists in parallel" | Overstated: Doraemon runs 2-4 at once, up to 6-8 for heavy work (CHANGELOG 0.3.9) | "14 specialists, a few at a time" |
| 8: fan-project disclaimer before install | Caveat before value. Every top README puts legal text at the end | Move to `## License and characters` (tldraw pattern); owner decision, see below |
| 21: cost and main-agent caveat as a plain paragraph | Good content, weak form | One `> [!NOTE]` (claude-code pattern) |
| 24: architecture SVG | A second visual style; "how it works" is told twice (diagram + 4 steps) | Move to docs/how-it-works.md; keep the 4 steps |
| 31-51: 4 illustrated PNG cards in a table | A third style, mock-ups rather than real output; at 380 px the text in them is small | Replace with 5 bullets; move card images into guards.md and crew-room.md |
| 70-73: hero GIF in the 4th section | The best asset is 6 screens down | Put it right under the pitch |
| 75-85: 6 commands | `task` is run by Doraemon; `forget` is rare | Keep 4; the rest go to docs |
| 87-110: Good to know + 3 H3s | ~25 lines that repeat docs/setup.md (Requirements, Update and uninstall, Troubleshooting already exist there) | One `## Limits` (3 bullets) + links |
| 3: unlinked badges | Top READMEs link their badges | Link each one (skeleton) |
| Repeats | The guard is said 4 times (6, 28, 43-45, 88), turning Doraemon off 3 times (21, 93-94, 106), the merge rule twice (6, 29) | Each fact once |
| Headings | "What you get" and "Good to know" are blog-style | Plain names (pattern 9) |

Keep: install on screen 1 with the three exact commands, the `<details>` crew table, light/dark `<picture>` on every image, the honest "seatbelt, not a sandbox" line, and the privacy facts (moved to Limits or docs).

## Doc drift found on the way (for Shizuka)
- docs/how-it-works.md:396 says "The board has no cost or token tracking yet", but CHANGELOG 0.3.13 added the Plan usage panel.
- docs/setup.md has no "Turn Doraemon off" heading; the skeleton links to `#troubleshooting` (line 107 covers it). Add a heading if you want a cleaner anchor.

## Open questions for the owner
1. Can the fan-project line move to the end? It is the IP-risk notice for Doraemon, Pixar and Disney characters; a legal view may want it up top. If so, keep it as one `<sub>` line under the hero, not a paragraph.
2. Drop the 4 card images entirely, or keep them in docs only? (Nobita made them at c7fd99a.)
3. Keep the Node badge (the hooks need Node) or cut to 3 badges? The version badge must stay for CI.
