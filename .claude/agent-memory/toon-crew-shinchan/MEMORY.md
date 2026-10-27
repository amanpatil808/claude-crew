# Shinchan memory

- The board is one page since 2026-10-27, with no tabs. Screenshot it with the desks fully drawn: use `--force-prefers-reduced-motion` or a longer virtual-time budget, or the pop-in animation leaves rooms looking empty. (seen 1) [project]
- Seed demo data with `node scripts/board-demo.mjs <new-dir>` and start the board with BOARD_LOG_DIR set to that dir; never point the board at the real data folders. (seen 2) [project]
- A script that deletes inside a user-given folder needs an empty-or-marker check, a refusal for real data locations, and a live-pid check before any delete. (seen 1) [crew]
- The guard and worktree isolation reject heredocs, compound git and write-and-run in one Bash call; use Write for files and one plain command per call. (seen 3) [crew]
- No puppeteer here: screenshot with Chrome CLI (`--headless=new --window-size=W,H --virtual-time-budget=6000 --screenshot`), with a scratch node proxy in front of the board to inject missing API keys while the backend is unfinished. (seen 1) [project]
- board page.html is one file: the server inlines room.css and room.js at the ROOM_CSS and ROOM_JS markers; CSP is default-src none, so no extra requests. (seen 1) [project]
- Reusing room.css in a new shell: names like .bars, .chips and .log already exist there, so grep before naming new components. (seen 1) [project]
- Never name a CSS modifier class `.main` or another page-layout class on a child element; the page grid rule hit the cost bar row. Use a unique name such as `.cbar.me`. (seen 1) [crew]
- A later media query overrides an earlier one at equal specificity: when adding a tablet rule, restate the narrow override after it. (seen 1) [crew]
- In a worktree, check out plugin/hooks as well as plugin/board, or hooks-json.test.ts fails on a missing hooks.json. (seen 1) [project]
- Palette-quantise pixel-art UI PNGs (sharp, palette true, 128 colours) to cut about 1.5 MB to about 0.3 MB with no visible loss. (seen 1) [crew]
