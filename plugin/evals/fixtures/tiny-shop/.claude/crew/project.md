# Project profile: tiny-shop

- Stack: plain Node (ES modules), no dependencies installed, no services.
- Test: `npm test` (runs `node --test`). Lint: `npm run lint`. Typecheck: `npm run typecheck`. Build: none.
- Front end: `web/` (static HTML and CSS, tokens in `web/style.css`). Back end: `src/`.
- Docs: `README.md`; design direction in `docs/design.md`.
- Work folders: `.crew-work/<agent-name>/` inside this repo (git-ignored). Never write outside the repo.
- Worktrees: `"worktree": {"baseRef": "head"}` is not set; builders start from the default branch.
