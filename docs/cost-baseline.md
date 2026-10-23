# toon-crew cost baseline

Dekisugi · 2026-10-23 · plugin 0.1.0 (`063ffd0`), claude 2.1.308, macOS. Every figure is marked **measured** (from a
command or an eval trace on this Mac) or **estimated** (worked out from measured tokens and list prices). Prices are
Anthropic list prices per million tokens: Opus $4 in / $20 out, Sonnet $2 / $10, Haiku $0.10 / $0.50. A cache read
costs 5% of the input price (10% on Haiku); a cache write costs 1.25x the input price for 5 minutes, or 2x for 1 hour
(`docs/planning/crew-research.md` section 3). Eval costs are list-price estimates from `claude plugin eval`, not plan
usage.

**Names:** measured on 23 Oct 2026 under the old agent names; ids below are the cast-v2 names
(`docs/planning/cast-v2.md`), numbers unchanged. Eval case and grader ids are the renamed ones in `plugin/evals/`.

**Plugin 0.2.1 changed tools after this baseline:** `Agent` is now disallowed for every read-only role except
dekisugi, and the guard limits who may spawn. The cost figures below were not re-measured; the tool rows in section 2
were updated on 23 Oct 2026.

Total spent on this baseline: **$2.72** (8 agent runs, 1 run each, one arm).

## 1. Always-on context

| What | Tokens | How | Kind |
|---|---|---|---|
| Plugin descriptions (13 agents + 6 skills) | ~1,941 per session | `claude --plugin-dir . plugin details toon-crew` | measured |
| Doraemon's prompt as the main thread (`settings.json` `agent: toon-crew:doraemon`) | ~2,600 more | same command, Doraemon "on-invoke" | measured (count), estimated (that it is always on) |
| Hooks (7 events) | 0 model tokens | same command ("harness-only") | measured |
| Whole first request of a Doraemon session (Claude Code base + tools + plugin) | 17,131, written to the 1-hour cache | `route-where-defined` trace, `cache_creation.ephemeral_1h_input_tokens` | measured |

What that costs:
- **Each new Doraemon session pays about $0.14 before it does anything** (17,131 tokens x $8/M for a 1-hour Opus cache
  write). Measured: the cheapest run, a one-Grep answer, cost $0.142.
- The plugin's own share, about 4.5k tokens, adds about $0.036 per session (first write) and about $0.001 per later
  turn (cache read). Estimated.
- Not yet measured: the same first request without the plugin. Run `route-where-defined` two-arm once to get it.

## 2. Per-agent model and effort

From `agents/*.md` frontmatter (measured). Prompt tokens are the "on-invoke" figures from `plugin details`. The
"Tools in practice" column adds what `memory: project` turns on by itself. The
[Subagents docs](https://code.claude.com/docs/en/sub-agents) (read 2026-10-23) say Read, Write and Edit are "automatically
enabled" when memory is on, and they don't limit those writes to the memory folder. Only stuart was checked live; the
other "+ Edit" cells follow the docs and were not re-measured.

| Agent | Model | Effort | maxTurns | Isolation | Declared tools | Tools in practice | Prompt | Eval cost (measured) |
|---|---|---|---|---|---|---|---|---|
| doraemon (main) | opus | high | - | - | all | all | ~2.6k | $0.14-0.37 per run as manager; ~$0.45 (est. split) in the Ninja Hattori run |
| miguel-rivera | sonnet | low | 30 | - | all but Agent | same | ~1.3k | not run |
| nobita | opus | high | 80 | - | Read, Grep, Glob, Bash, Write, WebFetch, WebSearch, Skill | **+ Edit** | ~1.2k | not run |
| shizuka | sonnet | high | 60 | - | all but Agent | same | ~1.5k | not run |
| shinchan | sonnet | medium | 60 | worktree | all but Agent | same | ~1.4k | not run |
| kevin | opus | high | 80 | worktree | all but Agent | same | ~1.5k | not run |
| bob | sonnet | medium | 60 | worktree | all but Agent | same | ~1.5k | not run |
| mike-wazowski / sulley (one role then) | sonnet | high | 100 | worktree | all but Agent | same | ~1.8k | not run |
| dekisugi | opus | high | 80 | - | Read, Grep, Glob, Write, WebSearch, WebFetch, Agent | **+ Edit** | ~1.2k | not run |
| olaf | sonnet | medium | 40 | - | Read, Grep, Glob, Write, WebSearch, WebFetch | **+ Edit** | ~1.0k | not run |
| ninja-hattori | opus | high | 80 | - | Read, Grep, Glob, Bash, Write, Skill | **+ Edit** | ~1.5k | ~$0.48 (est. split of $0.93) |
| joe-gardner | haiku | low | 40 | - | Read, Grep, Glob, Bash, Write | **+ Edit** | ~1.2k | $0.008 |
| stuart | haiku | low | 15 | - | Read, Grep, Glob | **+ Write** (measured, 2.1.309; this table first listed Edit too) | ~0.6k | $0.002 |

Stuart, measured: `claude -p --plugin-dir ./plugin --agent toon-crew:stuart` on Claude Code 2.1.309 listed Read, Write,
Grep, Glob. So `memory:` re-adds Write, but not Edit, in this version.

So **roles meant to be read-only by tools (plan section 4) can still write files.** In the runs so far none of them
wrote outside their memory (the `only-read-tools`, `joe-never-fixes` and `product-code-unchanged` graders passed).

**The guard is the write lock for read-only roles.** Their tool lists can't stop Write while `memory:` is on, so the
plugin guard does: a read-only role may write only its own `.claude/agent-memory/toon-crew-<id>/MEMORY.md`, the temp
folder or session scratchpad, and its doc folders (`docs/research/` for dekisugi and olaf; `docs/design/` and
`docs/research/` for nobita). Edit-type tools are refused for them too.

Model choice per call: a `model` that Doraemon passes on an Agent call beats the agent's frontmatter, which beats
`CLAUDE_CODE_SUBAGENT_MODEL` (docs, since v2.1.251). Doraemon passed `model: haiku` for Joe Gardner and for general-purpose,
and passed nothing for Stuart and Ninja Hattori (measured, trace `Agent` inputs). Since 0.2.1 the Crew Room records the
declared and the effective model for each spawn and shows an "override" badge when the call's model differs from the
file's, and Doraemon's prompt says never to pass `model` except for the listed escalations.

## 3. Per-task cost from the eval COST column (measured)

One run each, `--ablation none`, main thread = Doraemon on Opus. The specialist's share comes from `modelUsage` in the
trace when it ran on another model. For Ninja Hattori (also Opus) it is split by message share (estimated).

| Case | What happened | Total | Doraemon (Opus) | Specialist |
|---|---|---|---|---|
| route-where-defined | Doraemon answered with one Grep himself | $0.14 | $0.14 | - |
| cost-general-purpose-leak (no env) | general-purpose, Doraemon passed `model: haiku` | $0.15 | $0.143 | $0.002 (Haiku) |
| stuart-path-line-read-only | Stuart lookup | $0.16 | $0.160 | $0.002 (Haiku) |
| cost-general-purpose-leak (env sonnet) | general-purpose, no model passed | $0.20 | $0.150 | $0.047 (Sonnet) |
| doraemon-verify-before-commit | Doraemon re-ran the tests, refused to commit | $0.26 | $0.26 | - |
| joe-not-run-vs-passed | Joe Gardner ran 3 suites, lint and typecheck; Doraemon re-checked once | $0.36 | $0.350 | $0.008 (Haiku) |
| route-plan-mixed-wave | 4-piece plan, 21 turns, no dispatch | $0.37 | $0.37 | - |
| hattori-proof-fails-before-fix | Ninja Hattori wrote and ran 10 proof tests for an 11-line file | $0.93 | ~$0.45 | ~$0.48 (Opus) |

Mean $0.32 per task; judge calls under $0.003 per run.

What it shows:
- **The manager is the cost.** With a Haiku or Sonnet specialist, Doraemon is 76-99% of each run (Joe Gardner's case: $0.350
  against $0.008). Haiku roles are close to free; the per-task floor is Doraemon's ~$0.14 start plus his turns.
- **Delegation doesn't save money on tiny lookups.** A Stuart round trip cost $0.16; Doraemon's own Grep cost
  $0.14. It pays off only when the search is long (many reads that would otherwise sit in Opus context).
- **Opus specialists set the high end.** Ninja Hattori's thorough review was the one run near $1.

Expected cost for roles not run yet (estimated): a run of Joe Gardner's size (about 180k tokens through the cache, 7k out)
costs about $0.01 on Haiku, $0.15 on Sonnet and $0.30 on Opus, plus $0.15-0.35 for Doraemon. So a builder (Sonnet,
worktree) task is about $0.30-0.60, and a Kevin, Nobita or Dekisugi (Opus) task about $0.50-1.20.

Suite cost (estimated): 20 cases x 3 runs, one arm, at about $0.45 per run is about **$27**. The default two-arm run
adds about $9 for the no-plugin arm. The `smoke` tag at 1 run is about $2.

## 4. The general-purpose leak, before and after `CLAUDE_CODE_SUBAGENT_MODEL=sonnet`

Same case (`cost-general-purpose-leak`: "use a general-purpose subagent to describe each file in src/"), run once with
the variable unset and once with it exported. The variable reaches the eval child (`CLAUDE_CODE_*` is on its env
allowlist).

| Setup | Who spawned it | general-purpose model | Subagent cost | Run total | Kind |
|---|---|---|---|---|---|
| demo-app 22 Oct: main session on Opus, no Doraemon, no variable | main session | Opus (inherits the main model) | ~$0.09 | - | estimated (same tokens at Opus price) |
| toon-crew, variable unset | Doraemon | Haiku (Doraemon passed `model: haiku`) | $0.002 | $0.145 | measured |
| toon-crew, variable = sonnet | Doraemon | Sonnet (no model passed, so the default applied) | $0.047 | $0.197 | measured |

Reading it:
- **The variable fixes the leak where it happened:** a plain main session that spawns general-purpose. There it halves
  the subagent's price (Opus to Sonnet). On 22 Oct, 26 of 57 runs were general-purpose on Opus; at this case's size
  that is about $1.2 a day saved (estimated). Real runs were longer (median 2.4-7.5 min), so the saving is larger.
- **With Doraemon as the main thread it is a floor, not a saving.** Doraemon already picks cheap models per call;
  when he passes none, the variable decides. One run each is noise, so the $0.05 gap between the two rows is not
  proof that the variable raises cost. It shows the variable only matters when no model is passed.
- `CLAUDE_CODE_SUBAGENT_MODEL` never overrides frontmatter (Joe Gardner stays Haiku, Dekisugi stays Opus), so it can't silently
  downgrade a role. `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1` would, so don't set it.

## 5. Re-measure

- After any prompt or model change: `claude plugin eval . --tag smoke --runs 1 --ablation none ...` (see
  `evals/README.md`) and compare the COST column with section 3.
- Always-on: `claude --plugin-dir . plugin details toon-crew` (a local path is not accepted as the name).
- Per-role split: in each run's `trace.jsonl`, the last line's `modelUsage` gives exact cost per model. Lines with
  `"subagent_type":"toon-crew:<name>"` say who spent it. Per-message `usage` lines undercount (they summed to about half
  of the reported cost in the Ninja Hattori run), so use them only for shares.
- Weekly in real projects: `/usage` (share by subagent and plugin) once the crew runs there.
