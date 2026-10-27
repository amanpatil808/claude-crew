# Dekisugi memory

- Re-derive every file:line from the current file before citing a doc's line refs. Why: docs written against a working copy drift; docs/how-it-works.md room.js refs were off by 40+ lines. (seen 1) [crew]
- For a "what it does NOT do" list, grep plans for "later/planned", read CHANGELOG "unreleased" entries and the code's own header comments (limits are stated there). Why: cheapest reliable source of non-goals and not-built items. (seen 1) [crew]
- Check minimum-version claims in the official docs (Claude Code hooks/plugins reference, Node API "Added in" lines). Why: a single API (import.meta.main) can raise the real minimum above what a README says. (seen 1) [crew]
- Trust plugin/hooks/hooks.json (matcher) and the constants at the top of plugin/hooks/guard.mjs over README guard tables. Why: README lagged the code (Read/Grep matched, push-to-main refused for non-DevOps). (seen 1) [project]
- The plugin's settings.json sets Doraemon as main agent wherever the plugin is enabled; skill text saying "opt-in per project" is stale. Why: Claude Code applies plugin settings.json `agent` while enabled. (seen 1) [project]
