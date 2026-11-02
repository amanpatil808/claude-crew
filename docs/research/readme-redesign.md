# README redesign: research for the go-live README

By Dekisugi (Research Lead), 2026-11-01. For Nobita (design direction) and Shizuka (copy). Sources were accessed on 2026-11-01 unless a row says otherwise.

## Summary
- The best 2025-26 agent-tool READMEs work as landing pages. They are short (claude-code is about 74 lines, codex about 85, goose about 70), show one visual and then one install block on the first screen, and leave the detail to docs. The long ones (crush and crewAI, 600+ lines) read as dated.
- None of the 13 READMEs we checked puts a Mermaid diagram on the landing page. "How it works" is told with a picture (a GIF, screenshot or SVG) or not at all. Our grey Mermaid flowchart is the one strongly "corporate" element on the page.
- Ours feels scattered for three reasons. The hero sits third, under "Meet the crew". It has 6 H2 sections with 3 tables, plus deep detail (waves, copies, file paths). And two selling points barely appear: plan usage, and hand-back files.

## What the current README does (README.md, 89 lines, read 2026-11-01)
| Lines | What | Problem |
|---|---|---|
| 1-4 | Title, tagline, 3 badges | Good. The tagline runs to 17 words. |
| 6-9 | "Why toon-crew", 3 bullets | Good content, but it is text where cards and pictures would show it |
| 10-18 | Quick start | The private-repo caveat (line 11) is the first thing a visitor reads |
| 19-32 | Meet the crew: hero image + 9-row team table | The hero is below the fold, and 9 rows come before any "how" |
| 33-52 | Mermaid flowchart with 5 classDefs, emoji, dashed borders | Looks like a process manual (see "Why ours looks old") |
| 58-62 | Waves, twins, queue, Crew meter | Internals. They belong in docs/how-it-works.md |
| 63-72 | Memory table of file paths | Detail for docs, not for a first visit |
| 73-87 | Commands, Good to know | Fine. Keep them, made shorter |

## Examples (Olaf's scan; I re-fetched claude-code, browser-use and uv)
| Repo (stars) | Hero | Length | What to borrow |
|---|---|---|---|
| [anthropics/claude-code](https://github.com/anthropics/claude-code) (154k) | demo GIF | ~74 lines | GIF, then a one-line install, then everything else on a docs site. Only 2 badges |
| [openai/codex](https://github.com/openai/codex) (133k) | splash image | ~85 | No badges. Install on screen 1. Rare platforms folded into `<details>` |
| [anomalyco/opencode](https://github.com/anomalyco/opencode) (224k) | light/dark `<picture>` logo + TUI screenshot | ~125 | A themed logo. Install is the first section |
| [astral-sh/uv](https://github.com/astral-sh/uv) (91k) | light/dark benchmark chart | ~250 | Leads with proof (a chart) and a short "Highlights" list. 3 badges |
| [browser-use/browser-use](https://github.com/browser-use/browser-use) (120k) | light/dark logo + hero art | ~300 | Flat SVG diagrams in 4 variants (light, dark, and mobile of each). A "which one do I need?" picker. Avoid its 11 badges |
| [block/goose](https://github.com/block/goose) (56k) | title only | ~70 | Desktop download before the CLI. A small "goose humor" section gives it personality |
| [cline/cline](https://github.com/cline/cline) (71k) | small logo | ~240 | One card per surface (CLI, desktop, IDE). Headings named after capabilities. No badges |
| [charmbracelet/crush](https://github.com/charmbracelet/crush) (29k) | logo + demo image | ~600 | A warm voice ("coding bestie"). Don't copy its config manual inside the README |
| [ryoppippi/ccusage](https://github.com/ryoppippi/ccusage) (19k) | logo + real terminal screenshot | ~220 | A screenshot of real output. Avoid 7 badges and putting sponsors above the quick start |
| [google-gemini/gemini-cli](https://github.com/google-gemini/gemini-cli) (109k) | none | ~330 | Install comes first. Avoid emoji headings and a README that repeats the docs |
| [wshobson/agents](https://github.com/wshobson/agents) (42k), a Claude Code plugin | none | ~150 | The same `/plugin marketplace add` install as ours, with a "What's inside" table |
| [crewAIInc/crewAI](https://github.com/crewAIInc/crewAI) (60k), a multi-agent tool | big logo | ~650+ | Video thumbnails for tutorials. Avoid its length and 9 badges |
| [ghostty-org/ghostty](https://github.com/ghostty-org/ghostty) (63k) | logo + nav links | ~190 | Minimal, no badges, a roadmap table with check marks |

Star counts are from the GitHub API. Line counts other than claude-code's and codex's are estimates.

## What wins the first screen
1. **One line of value, then the picture.** GitHub's own README guidance lists what it does, why it's useful and how to start, in that order ([About READMEs](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-readmes)). claude-code, codex and opencode all show a picture and then install.
2. **Install in one copy-paste block, on screen 1.** This holds for 6 of the 13; only crewAI and browser-use bury it.
3. **Few badges, or none.** The newest-feeling pages (codex, cline, ghostty, wshobson) have none. The badge walls (crewAI, browser-use, ccusage) feel older. That is our judgement from the table, not measured data.
4. **No hand-made table of contents.** GitHub builds an "Outline" menu from the headings (same doc).
5. **Social proof only when it is real.** None of the agent tools uses testimonials. Stars and Trendshift badges come after launch. Don't fake them.

What makes a README feel scattered (from the examples): sections in no clear order of "what, see it, install, why, how", several tables that compete with each other, internals mixed with selling points, caveats before value, and more than one style of visual.

## Recommended section order (target 90-110 lines)
| # | Section | Lines | Content |
|---|---|---|---|
| 1 | Header, centred | ~6 | Name, a value line of 15 words or fewer, at most 3 badges (version, Claude Code, Node) |
| 2 | **Hero: the Crew Room board** | ~4 | Existing `hero-light/dark.jpg`, plus a 1-line caption. Later, a 6-10 s loop (see Visuals) |
| 3 | Install | ~10 | The 3 `/plugin` commands in one block, then "ask Doraemon anything". Caveats go in one `<details>` |
| 4 | What you get: 4 cards (2x2 HTML table) | ~16 | A crew, not one agent; Guards ask before risky steps; A live board plus plan usage; Hand-back files, so nothing is lost. Each card: a small crop or sprite, a bold title, one line |
| 5 | How it works | ~10 | One illustrated strip (option A below) and 4 numbered one-line steps |
| 6 | Meet the crew | ~12 | One sentence, with the 9-row team table folded inside a `<details>` |
| 7 | Commands | ~9 | The current 5-row table |
| 8 | Good to know | ~6 | Seatbelt not sandbox, local-only board, requirements, privacy |
| 9 | Footer | ~2 | At most 3 doc links (Setup, How it works, Guards) |

Move these to docs/how-it-works.md: the Memory table (lines 63-72) and the parallel-work bullets (58-62). This keeps the owner's rules: the hero board comes first, the crew is not first, the page is short, and detail lives in docs/.

## Visuals
**Why ours looks old.** The Mermaid block draws in Mermaid's default font (Trebuchet, per [Mermaid theming](https://mermaid.js.org/config/theming.html)), with grey and pastel classDef fills, emoji labels and numbered arrows. That is the look of an enterprise process chart, and it clashes with the cartoon board above it. GitHub also draws Mermaid late, in an iframe from its Viewscreen service ([GitHub blog, updated 2024-07-23](https://github.blog/developer-skills/github/include-diagrams-markdown-files-mermaid/)). Mermaid has newer "handDrawn" and "neo" looks, but GitHub does not say which Mermaid version it runs ([Creating diagrams](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/creating-diagrams)). Test it with an `info` block before relying on either look.

**Option A (recommended): a cartoon "comic strip" of how it works.** One wide PNG or SVG, 4 panels, using the crew's own sprites: (1) you type a request; (2) Doraemon at his desk writes briefs; (3) specialists at their desks, with the board showing "Crew 3/4"; (4) a pull request with a "you approve" button and the DevOps Team merging. Export it in light and dark versions. Why: it matches the hero, so the page has one visual language. It tells the story without a reading key. And no example in our table has anything like it, so it is memorable. It needs Nobita to draw the panels from the existing sprites (no new data).

**Option B: a hand-drawn (Excalidraw-style) SVG.** The same 4 steps as sketchy boxes and arrows in Excalifont. It looks current and informal, and it is quick to make and edit. The catch: an SVG inside `<img>` cannot load external fonts or run scripts, so fonts must be inlined as `data:` URLs or text turned into paths ([MDN, SVG as an image](https://developer.mozilla.org/en-US/docs/Web/SVG/Guides/SVG_as_an_image)). Excalidraw's export points at an external font by default ([excalidraw#1972](https://github.com/excalidraw/excalidraw/issues/1972)).

**Option C (cheapest): keep Mermaid, restyled.** Use `theme: base`, 4 nodes, no emoji, no grey fills and one accent colour, and try `look: handDrawn` once `info` confirms GitHub supports it. It still looks like Mermaid. Keep this for docs/how-it-works.md, which has 4 Mermaid diagrams, rather than the README.

**Hero motion (optional, phase 2).** claude-code's hero is a GIF. A 6-10 s loop of the board (desks lighting up, a task moving from Queued to Active) would show "live" better than a still. Use a GIF in the repo, kept small (aim for under 5 MB; that figure is our assumption). An MP4 upload also works: up to 10 MB on a free plan or 100 MB on a paid one, H.264 recommended ([Attaching files](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/attaching-files)). Respect reduced motion: one calm loop, no flashing.

## GitHub rendering limits to respect
- No CSS or JS. Scripts, inline styles and class/id attributes are removed ([github/markup](https://github.com/github/markup)). Layout comes only from `align`, `width`, `<table>`, `<details>`, `<picture>`, `<sub>` and `<br>`.
- `<picture>` with `prefers-color-scheme` is supported ([changelog, 2022-08-15](https://github.blog/changelog/2022-08-15-specify-theme-context-for-images-in-markdown-ga)). It follows the **OS** theme, not the GitHub theme ([community #210983, 2026-10-22](https://github.com/orgs/community/discussions/210983)). The `#gh-dark-mode-only` and `#gh-light-mode-only` URL suffixes follow the GitHub theme ([changelog, 2021-11-24](https://github.blog/changelog/2021-11-24-specify-theme-context-for-images-in-markdown/)). Pick one method and use it for every image.
- SVG in `<img>`: no scripts and no external fonts or images unless inlined (MDN, above). GitHub says SVG files don't support animation ([non-code files](https://docs.github.com/en/repositories/working-with-files/using-files/working-with-non-code-files)), so use GIF or MP4 for motion.
- Use relative image paths. GitHub cuts README content off after 500 KiB (About READMEs). Images in a private repo show only to people with read access (basic formatting docs).

## Don't do
- Don't use a Mermaid flowchart as the README's "how it works", or mix three visual styles (pixel board, Mermaid and emoji).
- No badge wall: 3 badges at most, and no fake social proof or star-history chart before launch.
- No caveat before value. The private-repo and `gh auth` note goes inside a `<details>` under Install.
- No internals on the landing page: file paths, waves and copies, model tiers.
- Don't repeat a fact. Each fact gets one place: the crew list in section 6, the guard in a card plus "Good to know", the board in the hero plus a card.
- No emoji headings, no hand-made TOC, no image text too small to read at 820 px wide.
- No more than one animated element, and nothing that flashes.

## Capture list (Dekisugi has no shell; for Shinchan or Twenty-two, using demo data)
1. The board loop, 6-10 s, desktop width, light and dark. 2. A crop of the plan usage panel. 3. A guard "ask" prompt in the terminal. 4. A hand-back summary file. Items 2-4 are for the cards.

## Open questions for the owner
1. **Character rights.** The crew draws on well-known studio characters (Doraemon, Minions, Pixar's Monsters, Inc. and Soul, Olaf). A public launch with them in the hero carries trademark and copyright risk. Do you want a legal check, or original look-alikes, before going public?
2. Will the repo be public at launch, and under which licence? The README says "Private and unlicensed", and Install warns about access.
3. Option A (comic strip, more work, most on-brand) or Option B (hand-drawn SVG, faster)?
4. A still hero now and a loop later, or wait for the loop?
5. Should the plan usage panel get its own card, or be folded into the "live board" card?
