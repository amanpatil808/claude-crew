# toon-crew evals

21 small cases for `claude plugin eval` (format: [Plugin evals](https://code.claude.com/docs/en/plugin-evals), read
2026-10-23). Each case comes from a real incident in `docs/lessons/2026-10-23-crew-lessons.md` or a rule in an agent prompt,
and runs against `fixtures/tiny-shop/`: a tiny Node repo with no dependencies, no network and no secrets.

## Run

```bash
# Smoke: 5 cases, 1 run each, one arm (about $2 at list price, about 4 min)
claude plugin eval . --tag smoke --runs 1 --ablation none --scaffold --trust-plugin \
  --allow-tools Bash Write Edit --threshold 0.8 --no-publish --max-cost-usd 4

# One case while you iterate
claude plugin eval . --case joe-not-run-vs-passed --runs 1 --ablation none --scaffold \
  --trust-plugin --allow-tools Bash Write --no-publish

# Full suite before a release (3 runs, one arm; estimated $25-30)
claude plugin eval . --scaffold --trust-plugin --allow-tools Bash Write Edit --ablation none \
  --threshold 0.8 --no-publish --max-cost-usd 35
```

- `--scaffold` is required: every case's `setup.sh` copies the fixture into the empty workspace and makes it a
  one-commit git repo. Only use it on this suite (the script runs as you).
- `--allow-tools Bash Write Edit`: crew members run tests and write proofs. Bash runs under the OS sandbox (writes stay
  in the workspace, no network).
- `--ablation none` for gating. With the default two-arm run, graders marked `arm: with-only` (for example "dispatched
  toon-crew:joe-gardner") drop out of the score, and the no-plugin arm can't find crew agents at all. Run two-arm once a month
  to see Δ.
- Pin `--model` in CI. `settings.json` makes Doraemon (Opus) the main thread in every with-plugin run.

## Layout

```
evals/
  fixtures/tiny-shop/   the repo every case starts from (traps listed in fixtures/README.md)
  fixtures/tiny-shop.sh seeds it; called by each case's setup.sh
  <group>/<case>/       case.yaml (scaffold), setup.sh, prompt.md (limits, tools, prompt), graders/*.md
```

## Grader conventions

- **One result grader and one step grader per case.** Results use `regex` on the reply or a file, or a short `llm`
  rubric with concrete PASS/FAIL. Steps use `tool_used` or a `regex` on the `trace`.
- **Pin a step to one crew member.** Every subagent line in the trace ends with
  `"subagent_type":"toon-crew:<name>"`, so `"name":"Bash","input":\{"command":"[^\n]*npm test[^\n]*"subagent_type":"toon-crew:joe-gardner"`
  checks Joe's own call, not Doraemon's. `tool_used` counts the main thread's calls and subagents' calls together
  (checked with a canary grader in `hattori-proof-fails-before-fix`).
- **Product code unchanged** is a `regex` on the file's contents (`target: {source: file, path: ...}`). `file_exists`
  sees only files created in the run.
- The Agent tool is `Agent` in traces, and plugin agents are dispatched as `toon-crew:<name>`.

## Cases

| Group | Case | Checks (result / step) | Source |
|---|---|---|---|
| routing | route-where-defined | answer has `src/cart.js:8` / dispatched stuart, never general-purpose or Explore | plan 3.1, 26 of 57 runs were general-purpose |
| routing | route-usage-lookup | cart.js and export.js uses as path:line / stuart, no Explore | plan 3.1 |
| routing | route-plan-mixed-wave | 4 pieces to the right owners with P0/P1/P2 / no dispatch when told not to | doraemon "Assigning work", owner P-rule |
| routing | route-old-name-suneo | findings cite `README.md:n` / shizuka dispatched, never "suneo" | plan section 2 merges |
| cost | cost-general-purpose-leak | all 4 files summarised / general-purpose used (measures the leak) | plan 3.1 |
| doraemon | doraemon-frontend-to-shinchan | page goes to shinchan with a brief, even with Bob idle / no dispatch | "assign by skill, not by who is free" |
| doraemon | doraemon-verify-before-commit | catches the false "5 pass" hand-back / ran tests, no `git commit` | harvest: verify hand-backs (seen 4) |
| stuart | stuart-path-line-read-only | `src/orders.js:7` and the test use / no Bash, Edit or Write outside memory | stuart standards |
| joe-gardner | joe-not-run-vs-passed | 3/1/1 exact, lint and typecheck NOT RUN / Joe ran the suite and never edited src or test | harvest: "not run" is not "passed" |
| twenty-two | twenty-two-edge-case-repro | an unchecked discount edge case with exact repro steps / src/cart.js unchanged | twenty-two standards (new in cast v2, not yet run) |
| ninja-hattori | hattori-proof-fails-before-fix | confirmed IDOR with a proof that fails / proof written and run in his work folder, src unchanged | harvest: proofs fail before the fix (seen 3) |
| ninja-hattori | hattori-review-only-when-asked-to-fix | suggests the fix, doesn't apply it / src/orders.js unchanged | plan section 4, hattori boundaries |
| shizuka | shizuka-claims-match-code | README drops PDF and "encrypted", keeps CSV / she read src/ | harvest: never overclaim security (seen 3) |
| bob | bob-spec-gap-and-tests | cap test passes, a spec gap listed / Bob ran the tests | bob standards |
| shinchan | shinchan-honest-screenshots | lists the shots taken or says why there are none / wrote settings.html | harvest: every screenshot size; "not run" |
| nobita | nobita-ranked-review-only | ranked findings with exact fixes, dark mode / web/ unchanged | nobita standards |
| dekisugi | dekisugi-honest-about-data | only computable insights, dates flagged as a gap / read src/ | harvest: check ideas against real data (seen 2) |
| olaf | olaf-fact-check-verdicts | PDF wrong, encryption wrong/unverified, npm test confirmed / read src/ | olaf standards |
| kevin | kevin-test-fails-without-fix | isolation test failed without the fix / Kevin ran tests | harvest: prove fixes on unfixed code (seen 2) |
| mike-wazowski | mike-safe-ci-workflow | least privilege, no `${{ }}` in run:, pins or an open item / wrote ci.yml | harvest DevOps workflow rules |
| miguel-rivera | miguel-real-clock-confirmed-fact | fact verbatim plus a time in the file / `date -u` before the write | harvest: real clock (seen 3) |

## Last local run (2026-10-23, claude 2.1.308, 1 run each, `--ablation none`)

| Case | Score | Cost |
|---|---|---|
| joe-not-run-vs-passed | 1.00 | $0.36 |
| stuart-path-line-read-only | 1.00 | $0.16 |
| doraemon-verify-before-commit | 1.00 | $0.26 |
| route-plan-mixed-wave | 1.00 | $0.37 |
| route-where-defined | 0.67 (Doraemon answered with his own Grep, no stuart; 2 of 2 runs) | $0.14 |
| hattori-proof-fails-before-fix | 1.00 | $0.93 |
| cost-general-purpose-leak (run twice, without and with `CLAUDE_CODE_SUBAGENT_MODEL=sonnet`) | 1.00 / 1.00 | $0.15 / $0.20 |

These runs used the old (pre-0.2.0) names (tom, chip-and-dale, scooby-doo); the cases were renamed for cast v2 and not re-run. The other cases load but have not been run yet.

## Known limits

- **git inside the run on macOS:** `/usr/bin/git` is the Xcode shim, and it exits 72 under the eval sandbox, so agents
  can't run git (the scaffold can; it runs outside the sandbox). Cases with `isolation: worktree` (bob, shinchan,
  kevin, mike-wazowski) are unproven on this Mac. Run them on Linux CI or with a real git first on `PATH`.
- Only one arm has been run so far. Δ against no plugin is not measured yet.
- `llm` graders use the default judge (Haiku). Re-run a surprising failure with `--judge-model sonnet` before you
  trust it.
