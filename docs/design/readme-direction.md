# README direction (go-live)

> Superseded on 2026-11-01 by the teardown in `docs/research/readme-teardown.md`: the README now has 2 pictures (architecture diagram, board.gif), no picture cards, and a left-aligned header. Kept for the capture notes.

By Nobita, 2026-11-01. For Shizuka (copy) and Shinchan (captures). Builds on `docs/research/readme-redesign.md`.
Goal: the README reads like a landing page in one visual language, the Crew Room board. Pixel board, comic and cards share its palette; no Mermaid, no emoji, no grey boxes.

## Page order (9 sections, 90-110 lines)
| # | Section | Lines | Shows |
|---|---|---|---|
| 1 | Header, centred | ~6 | `toon-crew` as `<h1>`, a value line of 15 words or fewer in bold, then the 3 badges on one line |
| 2 | Hero | ~5 | The board loop (GIF), 820 wide, then one `<sub>` caption: "The Crew Room: your crew at work, live (demo data)" |
| 3 | Install | ~10 | The 3 `/plugin` commands in one code block, then "Then ask Doraemon for anything." One `<details>` for the private-repo and `gh auth` note |
| 4 | What you get | ~18 | The 4 feature cards (layout below) |
| 5 | How it works | ~10 | The comic (820 wide), then 4 numbered one-line steps that repeat the panel captions |
| 6 | Meet the crew | ~12 | One sentence, then the team table inside `<details><summary>All 15 crew members</summary>` |
| 7 | Commands | ~9 | The current 4-row table, unchanged |
| 8 | Good to know | ~6 | 4 bullets: seatbelt not sandbox, local-only board, requirements, privacy |
| 9 | Footer | ~2 | `[Setup](docs/setup.md) · [How it works](docs/how-it-works.md) · [Guards](docs/guards.md)` |

Move out: the Memory table and the parallel-work bullets go to `docs/how-it-works.md`. Each fact lives in one place only.

## Feature cards (section 4)
A 2x2 `<table>`, no header row. Each cell: `<td width="50%" valign="top">`, then a `<picture>` (light and dark) with `width="380"`, `<br>`, a `<b>` title, `<br>`, one plain line of 12 words or fewer. No CSS, no class, no style. GitHub draws the table borders; that is fine, it reads as a grid of cards.

| Cell | Title | Image | One line (Shizuka may reword) |
|---|---|---|---|
| top left | A crew, not one agent | `card-crew` | Doraemon plans; 14 specialists each do one job. |
| top right | Guards ask before risky steps | `card-guard` | Risky commands ask you first; the worst are refused. |
| bottom left | A live board, plus plan usage | `card-plan` | See who is working, what is queued and how much plan is left. |
| bottom right | Hand-back files, nothing lost | `card-handback` | Every crew member leaves a written report you can reread. |

The guard line matches `docs/guards.md` (some steps ask, some are refused). Never call the guard a sandbox or say "secure".

## Badges (3, no more)
version (must stay `img.shields.io/badge/version-X.Y.Z-blue`, `scripts/check-structure.mjs` reads it), Claude Code 2.1.295+, Node 24.2+. Add `?style=flat-square` to all three so they match the board's square chips. No stars, downloads or CI badge before launch.

## Spacing and type
- `##` for the 9 sections only; no `###` on the page, no `<hr>`, no emoji in headings, no hand-made table of contents.
- One blank line between blocks; never stack `<br><br>`. Images: hero and comic `width="820"`, cards `width="380"`, all centred with `<p align="center">` except card cells.
- Text inside images is 13 px or larger at 820 px wide. Captions under images use `<sub>`, one line.

## Light and dark
- Use `<picture>` with `<source media="(prefers-color-scheme: dark)">` for every image (it follows the OS theme, as the current README already does). Do not mix in `#gh-dark-mode-only`.
- Every image carries its own opaque background in board colours, so a mismatch with GitHub's theme still looks deliberate. Light: bg `#f6efd9`, panel `#fffaf0`, ink `#2b2340`, room edge `#14284b`, sign `#fff3c4`, accent `#0b6a84`. Dark: bg `#0d0b1f`, panel `#17143a`, ink `#f2ecff`, edge `#7a72c8`, sign `#f3dd92`, accent `#22d3ee`.
- Hero motion: add two more `<source>` lines before the dark one, `(prefers-reduced-motion: reduce) and (prefers-color-scheme: dark)` then `(prefers-reduced-motion: reduce)`, pointing at the still PNGs. Check on GitHub after the first push that the sanitizer keeps both.

## The comic (done): `docs/images/how-it-works-light.svg`, `how-it-works-dark.svg`
820x578, about 162 KB each. Four panels, 2x2: 1 "You ask in plain words", 2 "Doraemon plans and briefs", 3 "The crew works in parallel", 4 "You say merge, DevOps merges". The sprites are the board's own desks and avatars, captured from the live board and embedded as WebP; no scripts, no animation, no external fonts (system font stack; tested with a wide fallback font). On a 390 px phone the captions shrink to about 7 px, so the numbered steps under the image carry the meaning there.
Alt text: "Four comic panels: you ask Doraemon for a dark mode toggle; he queues it for Nobita, Shinchan and Joe; they work at their desks while the guard watches; a pull request is ready, you say merge, and Mike and Sulley merge it."

## Captures for Shinchan (demo data only, `scripts/board-demo.mjs`)
Board at a 1360x1400 CSS viewport, device scale 1 for the GIF and 2 for PNGs, reduced motion off for the GIF and on for stills, project `shop-api`. Boxes are CSS px in page coordinates (measured 2026-11-01; re-measure if the layout moved).
| File (light and dark each) | Crop box (x, y, w, h) | Output | Budget |
|---|---|---|---|
| `hero-{light,dark}.gif` | 24, 400, 1312, 760: floor header and crew meter, room rows 1-2, top of Plan usage | 1200x695, 12 fps, 8 s, loops; fall back to 1000x579 at 10 fps | under 4 MB each |
| `hero-{light,dark}.png` (still, first frame) | same | 1200x695 | under 600 KB |
| `card-crew-{light,dark}.png` | 72, 468, 522, 294: Management and Frontend rooms | 960x540 | under 250 KB |
| `card-plan-{light,dark}.png` | 904, 408, 424, 239: Plan usage header, 5-hour and weekly bars | 960x540 (pad with panel colour to 16:9) | under 250 KB |
| `card-guard-{light,dark}.png` | Claude Code's approval prompt for Mike's `gh pr merge 42`, terminal 48 columns, 16 px font, crop 480x270 | 960x540 | under 250 KB |
| `card-handback-{light,dark}.png` | A short hand-back summary file open in the terminal or editor, 16 px font, crop 480x270 | 960x540 | under 250 KB |
Loop content: one task goes from Queued to Active, a desk lights up, Doraemon walks a brief over. One calm loop, nothing flashes, the first and last frames match. No real paths, names or tokens in any frame.

## Alt text (Shizuka owns the final words)
- Hero: "The Crew Room board: each team in its own room, crew at their desks with their task, and the plan usage panel on the right."
- Cards: crew "Two board rooms with Doraemon, Miguel, Nobita and Shinchan at their desks"; plan "Plan usage panel with the 5-hour and weekly limits"; guard "Claude Code asking you to approve a merge"; hand-back "A crew member's short hand-back report".
