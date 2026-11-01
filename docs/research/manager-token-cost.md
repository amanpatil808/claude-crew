# Cutting the manager's (Doraemon's) share of plan usage

Research by Dekisugi, 2026-11-01. All sources were read on 2026-11-01 unless marked. Savings are rough estimates with the method shown. They overlap, so do not add them up.

## 1. What actually costs money (the short version)

- **Every request re-sends the whole conversation.** Claude Code makes one API request per turn and another per tool call, and each one carries the full history. With caching, that history is re-read at the cached rate, so "a one-line question in a session that has been open all day still draws usage for the whole conversation" ([costs, "Why usage climbs"](https://code.claude.com/docs/en/costs#why-usage-climbs-in-a-long-session)).
- **Prices for Opus 5.5** ([API pricing](https://platform.claude.com/docs/en/about-claude/pricing)): input $4, 5-minute cache write $5, 1-hour cache write $8, cache read $0.20 (0.05x input), output $20 per million tokens. Sonnet 5.5 costs half on every line. The board's `plugin/board/lib/prices.ts` uses the same numbers.
- **On a subscription, the main session caches for 1 hour.** Subagents, compaction and forks cache for 5 minutes ([prompt caching, "Which TTL each request gets"](https://code.claude.com/docs/en/prompt-caching#which-ttl-each-request-gets)). So for Doraemon, **writing one token to the cache costs as much as reading it 40 times** ($8 / $0.20).
- **What the board measured:** Doraemon is about 68% of plan usage. By the coordinator's recount of today's windows, his weighted usage is 51.7% cache reads, 44.4% cache writes and 4% output. Reads grow with context size times the number of requests. Writes come from (a) new content entering the context, written once, and (b) **rebuilds**, where the whole context is rewritten after a cache miss.
- **Inference (estimate):** with 51.7 : 44.4 weighted and a 40x price ratio, Doraemon reads only about 47 tokens for every token he writes. A long session that only appended new content would read each token hundreds of times. So rebuilds, not new content, probably make up most of the writes. The owner can check this today: `/usage` shows a `Prompt cache (main)` line with the miss count and, from v2.1.260, the likely cause ([costs, "Prompt cache statistics"](https://code.claude.com/docs/en/costs#prompt-cache-statistics)).

### What makes Claude Code rewrite the whole context (cache writes)
Source: [prompt caching, "Actions that invalidate the cache"](https://code.claude.com/docs/en/prompt-caching#actions-that-invalidate-the-cache).

| Trigger | Happens here? | What reduces it |
|---|---|---|
| **Idle longer than the cache lifetime (1 hour on the main session).** The next message, even "go", rewrites everything. | Yes. One session ran from 2026-10-28 to 2026-11-01, so it saw overnight and meal gaps. A 500K context rewritten costs about 500K x $8/M = $4 at API price, the same as 40 full re-reads. | Run `/clear` (free) or `/compact` before a long break. `/usage` itself suggests "Compact before you step away". Keep `idleCompaction` on, its default; it compacts idle 1-hour sessions. |
| Model switch: `/model`, the `opusplan` plan toggle, fast mode on or off, a skill with its own `model` | Possible (owner switches); no toon-crew skill sets `model` (checked by grep) | Pick the model at session start; never toggle `opusplan` in a long session |
| Many screenshots: Claude Code drops a batch of old images and reprocesses from the earliest dropped one onward | Yes, Doraemon reads screenshots | Let Nobita or Twenty-two read screenshots and hand back words |
| Compaction (auto or `/compact`) | Yes | Cheap while the cache is warm, costly when cold; compact at task breaks, not after a long gap |
| Adding or removing MCP servers or tool definitions, `/reload-plugins` that needs a full re-read | Rarely. Plugin agents, skills and hooks keep the cache. | Don't change plugins or MCP in a long session; restart between features instead |
| Effort change | No: on Opus 5.5 with a subscription, changing effort keeps the cache | Nothing to do |
| Claude Code upgrade | Only on the first turn after a restart | Nothing to do |

## 2. Ranked ideas

| # | Idea | Expected saving on Doraemon's share (estimate) | Effort | Risk to quality | Source |
|---|---|---|---|---|---|
| 1 | **No cold returns.** Before any break over about an hour, run `/clear` (if the feature is at a natural stop) or `/compact`. Never reply "go" or "status" to a big context that has been idle for hours. | 15-35%. Most of the 44% in writes looks like rebuilds (see the inference in section 1); this removes the idle ones. Confirm with the `/usage` miss count. | None (a habit) | Low. `/compact` keeps a summary; `/clear` loses only what isn't already in files. | [prompt caching](https://code.claude.com/docs/en/prompt-caching#cache-lifetime), [costs](https://code.claude.com/docs/en/costs#why-usage-climbs-in-a-long-session) |
| 2 | **Cap the context.** Run `/autocompact 200k`, or set `"autoCompactWindow": 200000` in the owner's user settings. Opus 5.5 otherwise waits until about **967K** tokens. | 30-45%. A session that grows from about 40K up to its cap averages about half the cap: about 500K by default against about 120K at 200K. That cuts reads (52% of usage) by 60-75%, and every remaining rebuild costs at most 200K x $8/M. | None (a setting) | Medium. More compactions mean more lost detail. Add a "Compact instructions" section to CLAUDE.md: keep branch, PR, wave plan and open checks. | [model config, "Default auto-compact thresholds"](https://code.claude.com/docs/en/model-config#default-auto-compact-thresholds), [costs](https://code.claude.com/docs/en/costs#manage-context-proactively) |
| 3 | **One session per feature or wave, with state kept in files.** `/rename`, then `/clear` when a PR opens or a wave is committed. The next session reads `project.md`, the board's task queue and the PR. | 10-25% on top of #2: each session starts at about 30-50K instead of carrying old waves | Low (a habit) | Low to medium: whatever isn't in a file or commit is lost | [costs, "Clear between tasks"](https://code.claude.com/docs/en/costs#manage-context-proactively), [context engineering, structured notes](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) |
| 4 | **Keep bulky content out of Doraemon.** (a) Hand-backs: the full report goes to a file and the agent returns 5-10 lines plus the path. (b) Test runs go to Joe Gardner (Haiku), who returns counts. (c) Screenshots go to Nobita or Twenty-two. (d) Diffs: `git diff --stat` first, then only the hunks that matter; he still reads security-critical code in full. | 10-25%. Every token kept out saves its write once ($8/M) plus a read on each later request. Hand-backs of 40-100 lines are about 1-2.5K tokens; test output and images are larger. | Low (edit doraemon.md's rules and the hand-back formats) | Medium for (d): verifying is his core job. Low for (a)-(c). | [costs, "Delegate verbose operations"](https://code.claude.com/docs/en/costs#delegate-verbose-operations-to-subagents), [multi-agent research, "artifact systems"](https://www.anthropic.com/engineering/multi-agent-research-system), [sub-agents](https://code.claude.com/docs/en/sub-agents) |
| 5 | **Ask for status on the board, not from Doraemon.** The Crew Room already shows queue, running and done. | 3-10%. Each "status" or "satus" turn is at least one full-context request (more with `git status` and other tool calls), and it is a full rebuild if he has been idle. | None | None | [costs, "Why usage climbs"](https://code.claude.com/docs/en/costs#why-usage-climbs-in-a-long-session) |
| 6 | **Make `/clear` painless:** a plugin `SessionStart` hook (matchers `clear`, `compact`, `startup`) that injects a short crew state (branch, PR, queued and running tasks from the board) as `additionalContext` | Enables #1-#3; no saving of its own | Medium (Kevin; the board already has the task data) | Low. Keep the injected state under about 1K tokens. | [hooks, SessionStart](https://code.claude.com/docs/en/hooks), [context window, "What survives compaction"](https://code.claude.com/docs/en/context-window#what-survives-compaction) |
| 7 | **Try Sonnet 5.5 as the main session for one feature**, with Opus kept for judgement calls through a reviewer subagent | Up to about 50% of Doraemon's API-price weight (Sonnet is half price on every line). Whether plan limits weight models by price is **unverified**. | Low to try (`/model sonnet` at session start, never mid-session) | **High.** Opus is there because a wrong verification looks right. Try it as a measured experiment, not as a new default. | [pricing](https://platform.claude.com/docs/en/about-claude/pricing), [costs, "Choose the right model"](https://code.claude.com/docs/en/costs#choose-the-right-model) |
| 8 | Lower Doraemon's `effort: high` to the Opus 5.5 default (`medium`) for routine turns (`/effort medium`; the cache is kept) | 1-3%: output is only 4% of his usage | None | Medium on planning turns; keep high for planning | [model config, effort](https://code.claude.com/docs/en/model-config), [prompt caching, "Changing effort level"](https://code.claude.com/docs/en/prompt-caching#changing-effort-level) |

**Realistic target if #1-#5 are done (estimate):** Doraemon's weighted usage falls by about 40-60%, so his share of the plan falls from about 68% towards 45-55%. The crew's own share then rises as a percentage even though total usage falls.

## 3. The owner's two ideas, judged honestly

**(a) A "small manager" subagent under Doraemon: helps only in one specific form.**
- *Doesn't help as a relay layer.* A subagent's final report still lands in Doraemon's context, so a deputy that passes builder reports up adds its own tokens on top. Subagents also start without the parent's cache and cache for only 5 minutes, so a deputy that waits on builders keeps rebuilding ([prompt caching, "Subagents and the cache"](https://code.claude.com/docs/en/prompt-caching#subagents-and-the-cache)). Today only Doraemon may spawn crew (`plugin/hooks/guard.mjs` lines 36-38 and 1183), so a deputy that briefs builders also needs a guard change.
- *Helps as a reader or verifier.* A Sonnet "verifier" reads a worktree diff, the test output and the hand-back, checks the claims and returns a pass or fail plus the 5 lines that matter. This is idea #4 with a role attached: worth it once #1-#5 are done, if diff and test reading still dominate. Anthropic's research system uses this pattern: an Opus lead with Sonnet workers that return short results or file references ([multi-agent research](https://www.anthropic.com/engineering/multi-agent-research-system)).

**(b) LangGraph, a vector database or an "AI memory store": doesn't help here.**
- The cost driver is Claude Code re-sending Doraemon's own conversation on every request. A database can't shorten that conversation; only `/clear`, compaction or putting less into it can.
- LangGraph is a framework for building your own agent application in Python or JS ([LangGraph overview](https://docs.langchain.com/oss/python/langgraph/overview)). It doesn't run inside Claude Code or change what Claude Code sends. Adopting it would mean rewriting the crew outside Claude Code.
- A vector DB or memory MCP *adds* tokens: its tool listing, plus every retrieved chunk appended to the context. The crew already has the cheap version of "memory": plain files (`project.md`, `MEMORY.md`, the board's task log), loaded only when needed. Anthropic's guidance favours this just-in-time file approach, and Claude Code uses grep and files instead of an embedding index ([context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)).

## 4. Don't do
- **Don't set the 5-minute cache** (`FORCE_PROMPT_CACHING_5M` or `promptCacheTtl: 5m`) for Doraemon. He often waits more than 5 minutes for background agents, so nearly every return would become a full rewrite.
- **Don't use `opusplan` for a long manager session.** Each plan-mode toggle is a model switch, and the switch re-reads the whole context uncached ([prompt caching](https://code.claude.com/docs/en/prompt-caching#switching-models)).
- **Don't switch `/model` or fast mode mid-session.** Each switch costs one full uncached turn.
- **Don't use the advisor tool as a cheap Opus check.** Each call reads the whole transcript uncached at the advisor's price (team memory, checked 2026-10-28).
- **Don't widen waves to save manager turns.** Multi-agent work costs about 15x a chat ([multi-agent research](https://www.anthropic.com/engineering/multi-agent-research-system)); keep waves 2-4 wide.
- **Don't add LangGraph, a vector DB or memory MCPs** to fix this (section 3b).
- **Don't turn off `idleCompaction`.** It is what shrinks a big idle session before the cold rewrite.

## 5. What the owner can do today, with no code
1. Before lunch, overnight or any break over about an hour: `/compact` (or `/clear` if the wave is committed). Don't reply to a big idle session.
2. Run `/autocompact 200k` once. It is saved per model; `/autocompact auto` undoes it.
3. When a PR opens or a wave is committed: `/rename <feature>`, then `/clear`.
4. Check progress on the Crew Room board instead of typing "status".
5. Run `/usage` at the end of each day: read the `Prompt cache (main)` misses and likely cause, check the attribution, and press `f` to apply the suggestions you agree with.
6. Pick the model once at session start; never toggle `/model`, fast mode or `opusplan` in a long session.

## Unverified / open
- **Whether plan limits weight Opus above Sonnet** per token as the API prices do. The Max help article ([support 11145838](https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-or-max-plan.md)) gives no formula. The costs page confirms that cache re-reads draw usage "at the cached token rate".
- **The share of writes that are rebuilds** is inferred from one recount, and the brief's 7-day figure (3.7M "other" tokens) suggests a smaller write share. `/usage` miss counts would settle it.
- **Whether `autoCompactWindow` in doraemon.md's frontmatter applies when he is the main agent.** The docs list it as a subagent field. Use the owner's settings or `/autocompact` instead.
- The saving ranges assume Doraemon's context grows steadily from about 40K up to its cap. Per-request context sizes from the board's usage rows would firm them up.
