# toon-crew cost baseline

Dexter · 2026-10-23 · plugin 0.1.0 (`063ffd0`), claude 2.1.308, macOS. Every figure is marked **measured** (from a
command or an eval trace on this Mac) or **estimated** (worked out from measured tokens and list prices). Prices are
Anthropic list prices per million tokens: Opus $4 in / $20 out, Sonnet $2 / $10, Haiku $0.10 / $0.50. A cache read
costs 5% of the input price (10% on Haiku); a cache write costs 1.25x the input price for 5 minutes, or 2x for 1 hour
(`docs/planning/crew-research.md` section 3). Eval costs are list-price estimates from `claude plugin eval`, not plan
usage.

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
enabled" when memory is on, and they don't limit those writes to the memory folder.

| Agent | Model | Effort | maxTurns | Isolation | Declared tools | Tools in practice | Prompt | Eval cost (measured) |
|---|---|---|---|---|---|---|---|---|
| doraemon (main) | opus | high | - | - | all | all | ~2.6k | $0.14-0.37 per run as manager; ~$0.45 (est. split) in the Scooby run |
| dorami | sonnet | low | 30 | - | all but Agent | same | ~1.3k | not run |
| nobita | opus | high | 80 | - | Read, Grep, Glob, Bash, Write, WebFetch, WebSearch, Skill | **+ Edit** | ~1.2k | not run |
| shizuka | sonnet | high | 60 | - | all but Agent | same | ~1.5k | not run |
| shinchan | sonnet | medium | 60 | worktree | all but Agent | same | ~1.4k | not run |
| scrooge | opus | high | 80 | worktree | all but Agent | same | ~1.5k | not run |
| bob-the-builder | sonnet | medium | 60 | worktree | all but Agent | same | ~1.5k | not run |
| chhota-bheem | sonnet | high | 100 | worktree | all but Agent | same | ~1.8k | not run |
| dexter | opus | high | 80 | - | all | all | ~1.2k | not run |
| velma | sonnet | medium | 40 | - | Read, Grep, Glob, Write, WebSearch, WebFetch | **+ Edit** | ~1.0k | not run |
| scooby-doo | opus | high | 80 | - | Read, Grep, Glob, Bash, Write, Skill | **+ Edit** | ~1.5k | ~$0.48 (est. split of $0.93) |
| tom | haiku | low | 40 | - | Read, Grep, Glob, Bash, Write | **+ Edit** | ~1.2k | $0.008 |
| chip-and-dale | haiku | low | 15 | - | Read, Grep, Glob | **+ Write, Edit** | ~0.6k | $0.002 |

So **five roles meant to be read-only by tools (plan section 4) can edit files.** Only their prompts and the plugin's
guard hook stop them. In the runs so far none of them did (the `only-read-tools`, `tom-never-fixes` and
`product-code-unchanged` graders passed).

Model choice per call: a `model` that Doraemon passes on an Agent call beats the agent's frontmatter, which beats
`CLAUDE_CODE_SUBAGENT_MODEL` (docs, since v2.1.251). Doraemon passed `model: haiku` for Tom and for general-purpose,
and passed nothing for chip-and-dale and Scooby-Doo (measured, trace `Agent` inputs). The Crew Room should log this
`model` field, or a role's real model can differ from its file without anyone seeing it.

## 3. Per-task cost from the eval COST column (measured)

One run each, `--ablation none`, main thread = Doraemon on Opus. The specialist's share comes from `modelUsage` in the
trace when it ran on another model. For Scooby-Doo (also Opus) it is split by message share (estimated).

| Case | What happened | Total | Doraemon (Opus) | Specialist |
|---|---|---|---|---|
| route-where-defined | Doraemon answered with one Grep himself | $0.14 | $0.14 | - |
| cost-general-purpose-leak (no env) | general-purpose, Doraemon passed `model: haiku` | $0.15 | $0.143 | $0.002 (Haiku) |
| chip-path-line-read-only | chip-and-dale lookup | $0.16 | $0.160 | $0.002 (Haiku) |
| cost-general-purpose-leak (env sonnet) | general-purpose, no model passed | $0.20 | $0.150 | $0.047 (Sonnet) |
| doraemon-verify-before-commit | Doraemon re-ran the tests, refused to commit | $0.26 | $0.26 | - |
| tom-not-run-vs-passed | Tom ran 3 suites, lint and typecheck; Doraemon re-checked once | $0.36 | $0.350 | $0.008 (Haiku) |
| route-plan-mixed-wave | 4-piece plan, 21 turns, no dispatch | $0.37 | $0.37 | - |
| scooby-proof-fails-before-fix | Scooby wrote and ran 10 proof tests for an 11-line file | $0.93 | ~$0.45 | ~$0.48 (Opus) |

Mean $0.32 per task; judge calls under $0.003 per run.

What it shows:
- **The manager is the cost.** With a Haiku or Sonnet specialist, Doraemon is 76-99% of each run (Tom's case: $0.350
  against $0.008). Haiku roles are close to free; the per-task floor is Doraemon's ~$0.14 start plus his turns.
- **Delegation doesn't save money on tiny lookups.** A chip-and-dale round trip cost $0.16; Doraemon's own Grep cost
  $0.14. It pays off only when the search is long (many reads that would otherwise sit in Opus context).
- **Opus specialists set the high end.** Scooby-Doo's thorough review was the one run near $1.

Expected cost for roles not run yet (estimated): a run of Tom's size (about 180k tokens through the cache, 7k out)
costs about $0.01 on Haiku, $0.15 on Sonnet and $0.30 on Opus, plus $0.15-0.35 for Doraemon. So a builder (Sonnet,
worktree) task is about $0.30-0.60, and a Scrooge, Nobita or Dexter (Opus) task about $0.50-1.20.

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
- `CLAUDE_CODE_SUBAGENT_MODEL` never overrides frontmatter (Tom stays Haiku, Dexter stays Opus), so it can't silently
  downgrade a role. `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1` would, so don't set it.

## 5. Re-measure

- After any prompt or model change: `claude plugin eval . --tag smoke --runs 1 --ablation none ...` (see
  `evals/README.md`) and compare the COST column with section 3.
- Always-on: `claude --plugin-dir . plugin details toon-crew` (a local path is not accepted as the name).
- Per-role split: in each run's `trace.jsonl`, the last line's `modelUsage` gives exact cost per model. Lines with
  `"subagent_type":"toon-crew:<name>"` say who spent it. Per-message `usage` lines undercount (they summed to about half
  of the reported cost in the Scooby run), so use them only for shares.
- Weekly in real projects: `/usage` (share by subagent and plugin) once the crew runs there.
