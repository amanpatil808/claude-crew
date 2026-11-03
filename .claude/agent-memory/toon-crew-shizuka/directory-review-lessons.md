---
name: directory-review-lessons
description: How to write the "what it changes on your machine" statement for directory policy holds, and which facts to cite
metadata:
  type: project
---

- A directory "policy hold" answer goes in the README as a short section; cite the code header that states the scope (plan-mod.mjs:6 says its only calls are `$.clock.now` and `$.env.set`). Why: reviewers check the claim against the file. (seen 1) [project]
- "No network calls of its own" holds only after a grep for outbound calls: the only hits are the board page's `fetch("/api/state")` to its own 127.0.0.1 server (room.js:1500) and gh/ssh via execFile (run.ts). Re-run the grep before repeating the claim. (seen 1) [project]
- Release bumps touch three places that `scripts/check-structure.mjs` compares: plugin.json version, README badge, top CHANGELOG heading. (seen 1) [project]
- Directory listing fields in plugin.json are `documentationUrl`, `supportUrl`, `privacyPolicyUrl` (plus `termsOfServiceUrl`, `icon`): https URLs, documented at code.claude.com/docs/en/plugins-reference#directory-listing-fields, validate clean from Claude Code 2.1.281 (CI min is 2.1.295). `homepage` is a normal field. Do not put them in marketplace.json (unknown field there). (seen 1) [project]
- Directory README rule: 40+ words outside code blocks in the plugin folder, no bundled-image paths in backticks, and the README must describe everything the plugin runs, sends or fetches; the plugin folder ships alone so every link is absolute github.com. (seen 1) [project]
- Privacy page facts: event text caps are in `plugin/board/hook.ts` (160 hand-back, 70 assign, 120 commit); events trim after 30 days only while the board server runs (`events.ts:306`, `server.ts:96`), which contradicts `docs/how-it-works.md:395` ("not rotated"); `/toon-crew:forget` edits the registry only. The guard Bash refuses listing the data folder with extra commands, so cite code, not a live `ls`. (seen 1) [project]
- A version bump also leaves `docs/privacy.md:3` ("describes version X"), the bug-report placeholder and `.gitleaks.toml:7` (history, keep); grep the old version after every bump and report files outside the brief's edit list. (seen 1) [project]
- The guard refuses Bash that edits files (heredoc, sed -i, python) for crew roles; use the Edit tool for changes and keep Bash to read-only checks. (seen 1) [crew]
- When a brief states a changelog fact about work done by another agent (for example "tests moved"), check the tree; say in the report if it is not yet true on the branch. (seen 1) [crew]
