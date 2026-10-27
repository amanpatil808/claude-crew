# Shinchan memory

- To screenshot a Crew Room tab, click the tab in puppeteer instead of trusting the URL hash; the tab choice persists in localStorage. (seen 1) [project]
- Seed demo data with `node scripts/board-demo.mjs <new-dir>` and start the board with BOARD_LOG_DIR set to that dir; never point the board at the real data folders. (seen 1) [project]
- A script that deletes inside a user-given folder needs an empty-or-marker check, a refusal for real data locations, and a live-pid check before any delete. (seen 1) [crew]
- Write a script with the Write tool, then run it in a separate call; the guard blocks write-and-run in one Bash command. (seen 2) [crew]
- Palette-quantise pixel-art UI PNGs (sharp, palette true, 128 colours) to cut about 1.5 MB to about 0.3 MB with no visible loss. (seen 1) [crew]
