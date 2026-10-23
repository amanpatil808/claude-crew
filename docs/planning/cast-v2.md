# Cast v2: the owner's favourites (approved 23 Oct 2026)

Single source of truth for the engineering crew rename. Every file (agents, roster, board, guards, evals, docs,
project memory) must match this table. The Social Media team comes later as a separate plugin (not in this change).

## The crew (15)

| id | Name (show) | Team | Title | model | effort | maxTurns | colour |
|---|---|---|---|---|---|---|---|
| `doraemon` | Doraemon (Doraemon) | Management | Engineering Manager | opus | high | (none) | blue |
| `miguel-rivera` | Miguel Rivera (Coco) | Management | Knowledge Manager | sonnet | low | 30 | orange |
| `nobita` | Nobita (Doraemon) | Frontend Team | UX & Design Lead | opus | high | 80 | yellow |
| `shinchan` | Shinchan + Shiro (Crayon Shin-chan) | Frontend Team | Frontend Developer | sonnet | medium | 60 | red |
| `kevin` | Kevin (Minions) | Backend Team | Backend Lead | opus | high | 80 | yellow |
| `bob` | Bob (Minions) | Backend Team | Backend Developer | sonnet | medium | 60 | blue |
| `mike-wazowski` | Mike Wazowski (Monsters University) | DevOps Team | DevOps Engineer (CI, builds, Docker, local stack) | sonnet | high | 100 | cyan |
| `sulley` | Sulley (Monsters University) | DevOps Team | SRE (deploys, rollouts, rollbacks, backups, monitoring, incidents) | sonnet | high | 100 | purple |
| `ninja-hattori` | Ninja Hattori + Shishimaru (Ninja Hattori-kun) | Security Team | Security Engineer (review only) | opus | high | 80 | blue |
| `joe-gardner` | Joe Gardner (Soul) | QA Team | QA Engineer (runs every check, exact counts) | haiku | low | 40 | purple |
| `twenty-two` | 22 (Soul) | QA Team | Exploratory Tester (edge cases, odd paths, browser walk-throughs; reports, never fixes) | sonnet | medium | 40 | cyan |
| `dekisugi` | Dekisugi (Doraemon) | Research Team | Research Lead | opus | high | 80 | orange |
| `olaf` | Olaf (Frozen) | Research Team | Research Analyst | sonnet | medium | 40 | cyan |
| `shizuka` | Shizuka (Doraemon) | Documentation Team | Technical Writer | sonnet | high | 60 | pink |
| `stuart` | Stuart (Minions) | Helpers | Code Search Assistant (quick lookups, path:line) | haiku | low | 15 | yellow |

Green is never used (the board keeps it for "done"). Room-mates never share a colour.

## Rules carried over
- Read-only roles (guard enforced): `ninja-hattori`, `joe-gardner`, `twenty-two`, `nobita`, `dekisugi`, `olaf`, `stuart`.
  Docs exceptions: `dekisugi`, `olaf` → `docs/research/**`; `nobita` → `docs/design/**` and `docs/research/**`.
- Knowledge Manager rules (were Dorami's): `miguel-rivera` may push only `crew-lessons/*` to amanpatil808/claude-crew
  and open PRs there.
- Worktree isolation: `kevin`, `bob`, `shinchan`, `mike-wazowski`, `sulley`.
- Only `doraemon` commits; `doraemon` and `dekisugi` may spawn (dekisugi only `olaf` or `stuart`).
- Escalate per call: `sulley` to opus for production rollout/rollback design; `shizuka` to opus for launch, trust or
  privacy copy; any role after two failed reviews.

## Retired (framed pictures, "Now with …")
| Old | Now with |
|---|---|
| dorami | miguel-rivera |
| scrooge (and shaktimaan) | kevin |
| bob-the-builder (and ninja-hattori's old routes role) | bob |
| chhota-bheem (and dekisugi's old SRE role) | mike-wazowski (DevOps) / sulley (SRE) |
| scooby-doo | ninja-hattori |
| tom | joe-gardner |
| dexter | dekisugi |
| velma | olaf |
| chip-and-dale | stuart |
| suneo | shizuka |

Note: `dekisugi` and `ninja-hattori` come back as active crew in new jobs; old events typed `dekisugi`/`ninja-hattori`
from before 23 Oct belong to their old jobs, which is acceptable to show under the new owners.

## Memory folders (each project)
`.claude/agent-memory/toon-crew-<old>/` → `toon-crew-<new>/` using the table above; chhota-bheem's lessons split
between mike-wazowski (CI, builds, Docker, local stack) and sulley (deploys, rollouts, rollbacks, backups, the box);
twenty-two starts empty (or with tom's exploratory/browser lessons if any).
