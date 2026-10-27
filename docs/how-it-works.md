# How the toon crew works

For the owner, and for anyone who has installed the `toon-crew` plugin. After reading this you can follow a piece of work from your request to a merged pull request, and know where the crew keeps its notes.

## 1. The flow

Doraemon is the main agent. You talk to him; he talks to everyone else. Follow the numbers from top to bottom. The right-hand lane shows what the board records at each step.

```mermaid
flowchart TD
    S1(["(1) 👤 You ask<br/>for something"])
    S2(["(2) Doraemon (manager)<br/>reads project.md<br/>and his memory"])
    S3["(3) He plans waves and<br/>gives every task<br/>P0, P1 or P2"]
    S4["(4) He queues each task<br/>on the board<br/>(toon-crew:task)"]
    S5["(5) He writes the contract<br/>and commits it"]
    S6["(6) He briefs the crew,<br/>2 to 4 at a time"]

    subgraph CREW["(7) The crew works"]
        BE(["Backend<br/>kevin: lead, own worktree<br/>bob: developer, own worktree"])
        FE(["Frontend<br/>nobita: UX review<br/>shinchan: screens, own worktree"])
        DV(["DevOps<br/>mike-wazowski: CI, own worktree<br/>sulley: SRE, own worktree"])
        SE(["Security<br/>ninja-hattori: review"])
        QA(["QA<br/>joe-gardner: checks<br/>twenty-two: exploratory"])
        RS(["Research<br/>dekisugi: lead<br/>olaf: analyst"])
        DC(["Documentation<br/>shizuka: technical writer"])
        HP(["Helpers<br/>stuart: code search"])
    end

    S8["(8) The crew hand back<br/>(a short report each)"]
    S9{"(9) Doraemon verifies:<br/>runs the tests,<br/>reads the diffs"}
    S10["(10) He commits the work<br/>(only he commits)"]
    S11["(11) He adds lessons to<br/>that agent's memory"]
    S12["(12) He opens a draft PR<br/>and tells you the branch<br/>and PR number"]
    S13{"(13) CI checks<br/>all green?"}
    S14{"(14) You say OK?"}
    S15(["(15) Mike Wazowski merges<br/>(Sulley for a production<br/>rollout) after your confirm"])
    FIX{{"Back to step (6)<br/>with a fix brief<br/>(the loop repeats)"}}
    S16["(16) Release and deploy,<br/>if the project's rules<br/>say a merge does it"]

    S1 --> S2 --> S3 --> S4 --> S5 --> S6 --> CREW --> S8 --> S9
    S9 -->|"fails"| FIX
    S9 -->|"passes"| S10 --> S11 --> S12 --> S13
    S13 -->|"a check fails"| FIX
    S13 -->|"green"| S14
    S14 -->|"changes wanted"| FIX
    S14 -->|"yes"| S15 --> S16

    K1(["Task queued<br/>(Queued list)"])
    K2(["Assign: the task<br/>goes Active"])
    K3(["Hand-back: the task<br/>is done"])
    K4(["Commit logged"])
    K5(["PR opened"])
    K6(["PR merged"])

    S4 -.->|"board.sh task add"| K1
    S6 -.->|"hook"| K2
    S8 -.->|"hook"| K3
    S10 -.->|"hook"| K4
    S12 -.->|"hook"| K5
    S15 -.->|"hook"| K6

    BE ~~~ QA
    FE ~~~ RS
    DV ~~~ DC
    SE ~~~ HP

  classDef mgmt fill:#58a6ff,stroke:#1f6feb,color:#111,stroke-width:2px
  classDef backend fill:#e3b341,stroke:#9a6700,color:#111,stroke-width:2px
  classDef frontend fill:#ff7b72,stroke:#cf222e,color:#111,stroke-width:2px
  classDef devops fill:#39c5cf,stroke:#0e7490,color:#111,stroke-width:2px
  classDef security fill:#8e9cf5,stroke:#4c5bd4,color:#111,stroke-width:2px
  classDef qa fill:#bc8cff,stroke:#8250df,color:#111,stroke-width:2px
  classDef research fill:#f0883e,stroke:#bc4c00,color:#111,stroke-width:2px
  classDef docs fill:#f778ba,stroke:#bf3989,color:#111,stroke-width:2px
  classDef helpers fill:#c9b97a,stroke:#8a7a3a,color:#111,stroke-width:2px
  classDef crew fill:#b1bac4,stroke:#57606a,color:#111,stroke-width:2px
  classDef data fill:#9aa5b1,stroke:#57606a,color:#111,stroke-width:2px
  classDef board fill:#56d364,stroke:#1a7f37,color:#111,stroke-width:2px
  classDef ext fill:#c5ccd4,stroke:#57606a,color:#111,stroke-width:2px,stroke-dasharray:5 3
    classDef fix fill:#ffa198,stroke:#cf222e,color:#111,stroke-width:2px,stroke-dasharray:5 3
    class S1 ext
    class S2,S3,S4,S5,S6,S8,S10,S11,S12 mgmt
    class S9,S13,S14 crew
    class FIX fix
    class S15,S16 devops
    class K1,K2,K3,K4,K5,K6 board
    class BE backend
    class FE frontend
    class DV devops
    class SE security
    class QA qa
    class RS research
    class DC docs
    class HP helpers
    style CREW fill:transparent,stroke:#8b949e,color:#8b949e
    %% dotted edges = what the board records
    linkStyle 18,19,20,21,22,23 stroke:#2da44e,stroke-width:2px
```

Colours: the same palette is used in every diagram in this repo. Dashed grey is you (or something outside the plugin, such as GitHub), blue is Doraemon's own work, grey diamonds are checks, red with a dashed edge is the loop back, and green is the Crew Room board. The crew boxes use one colour per team: Backend gold, Frontend red, DevOps cyan, Security indigo, QA purple, Research orange, Documentation pink, Helpers khaki. Steps 15 and 16 are DevOps cyan too. The green dotted lines are the board's feed. "Hook" means the plugin's hooks write one line to the event log; the board reads it (section 3 says how). Step 4 is not a hook: `board.sh task add` writes the queued task itself.

What to know:
- **P0, P1, P2.** P0 blocks a release or the critical path. P1 is important next. P2 is nice to have. Doraemon gives every task one.
- **Assigned by skill, not by who is free.** If the right role is busy, the task waits, or a second copy of the same role takes it on different files.
- **Only Doraemon commits.** Builders leave their changes uncommitted in the worktree and name it in the hand-back. Doraemon reviews the diff, brings it into the working branch and commits it. He checks the memory notes for secrets and commits them with the work.
- **Only Doraemon starts crew agents.** Dekisugi may start `toon-crew:olaf` or `toon-crew:stuart` for narrow questions. The guard refuses every other case.
- **Nobody merges without you.** Only Mike Wazowski and Sulley may merge, and only a pull request you approved. The guard asks you to confirm each merge. You can always merge yourself on GitHub.
- **What step 16 means depends on the project.** The plugin does not deploy anything. If a project's `project.md` says a merge to `main` releases and deploys, that happens after step 15; Sulley handles production rollouts and rollbacks.
- **Reviewers and testers.** Nobita and Ninja Hattori review, Joe Gardner and Twenty-Two test; none of them edits your code. Doraemon briefs them in step 6 like any other role.

Words used here:
- **Crew**: the agents in this plugin. Each has one job. Call them as `toon-crew:<id>`.
- **Wave**: a group of tasks that can run at the same time because no two of them touch the same file.
- **Hand-back**: the report an agent gives when it finishes.
- **Worktree**: a separate copy of the repo on disk, so a builder cannot disturb your working folder.
- **Board**: the local status page. It shows who is doing what.

Sections 4, 5 and 6 describe **board v2**: the project picker, the Active and Queued lists and `board.sh task`. It is built (the contract is `docs/planning/board-v2-contract.md`), but it needs plugin version 0.3.0 or later. To check your install, run `board.sh task list`: an older plugin prints a usage line and exits with an error instead of a list.

Sources: `plugin/agents/doraemon.md` ("When invoked", "Assigning work", "Worktrees", "Verifying hand-backs", "Committing and PRs", "Memory duty"), `plugin/skills/task/SKILL.md`, `plugin/board/hook.ts` (commit and PR events), `docs/roster.md` ("Safety by design").


## 2. Teams and roles

Fifteen agents in nine teams. The model tier is the `model` in each agent file.

| Team | Id | Role | Model |
|---|---|---|---|
| Management | `doraemon` | Engineering Manager: plans, briefs, verifies, commits, opens PRs | opus |
| Management | `miguel-rivera` | Knowledge Manager: lessons pass (started by hand) | sonnet |
| Frontend | `nobita` | UX & Design Lead: journey reviews, design direction (review only) | opus |
| Frontend | `shinchan` | Frontend Developer: screens to a design | sonnet |
| Backend | `kevin` | Backend Lead: data, auth, secrets, APIs, integrations, background jobs | opus |
| Backend | `bob` | Backend Developer: modules and routes from a spec | sonnet |
| DevOps | `mike-wazowski` | DevOps Engineer: CI, builds, Docker, local stack; carries out merges | sonnet |
| DevOps | `sulley` | SRE: deploys, rollouts, rollbacks, backups, incidents; carries out merges | sonnet |
| Security | `ninja-hattori` | Security Engineer: attack-style reviews with proof tests (review only) | opus |
| QA | `joe-gardner` | QA Engineer: runs every check, exact counts | haiku |
| QA | `twenty-two` | Exploratory Tester: odd paths, exact repro steps | sonnet |
| Research | `dekisugi` | Research Lead: cited, dated recommendations | opus |
| Research | `olaf` | Research Analyst: evidence tables, fact-checks | sonnet |
| Documentation | `shizuka` | Technical Writer: docs, release notes, proofreading | sonnet |
| Helpers | `stuart` | Code Search Assistant: read-only lookups answered with path:line | haiku |

Good to know:
- **Own worktree:** kevin, bob, shinchan, mike-wazowski, sulley.
- **Read-only roles** (the guard blocks edits to your code): ninja-hattori, joe-gardner, twenty-two, nobita, dekisugi, olaf, stuart. They write only to their own memory file, temporary folders and, for some, a docs folder.
- **Escalation.** Doraemon passes no model when he starts an agent, except `opus` for one run: sulley on production rollout or rollback design, shizuka on launch, trust or privacy copy, and any role after two failed reviews.

More detail (colours, retired characters, the memory folder move from old names): [roster.md](roster.md).

## 3. Where things live

```mermaid
flowchart LR
    subgraph PROJ["Your project folder"]
        CM[("CLAUDE.md")]
        PM[(".claude/crew/project.md")]
        MEM[(".claude/agent-memory/<br/>toon-crew-id/MEMORY.md")]
    end
    subgraph PLUG["The plugin"]
        AG(["agents and skills"])
        HK["hooks"]
    end
    subgraph DATA["Plugin data folder"]
        EV[("events.jsonl")]
        REG[("projects.json")]
    end
    BD["Board<br/>127.0.0.1 only"]

    AG -->|"read first"| CM
    AG -->|"read first"| PM
    AG -->|"keep lessons"| MEM
    HK -->|"one line per event"| EV
    HK -->|"register project"| REG
    EV --> BD
    REG --> BD

  classDef mgmt fill:#58a6ff,stroke:#1f6feb,color:#111,stroke-width:2px
  classDef backend fill:#e3b341,stroke:#9a6700,color:#111,stroke-width:2px
  classDef frontend fill:#ff7b72,stroke:#cf222e,color:#111,stroke-width:2px
  classDef devops fill:#39c5cf,stroke:#0e7490,color:#111,stroke-width:2px
  classDef security fill:#8e9cf5,stroke:#4c5bd4,color:#111,stroke-width:2px
  classDef qa fill:#bc8cff,stroke:#8250df,color:#111,stroke-width:2px
  classDef research fill:#f0883e,stroke:#bc4c00,color:#111,stroke-width:2px
  classDef docs fill:#f778ba,stroke:#bf3989,color:#111,stroke-width:2px
  classDef helpers fill:#c9b97a,stroke:#8a7a3a,color:#111,stroke-width:2px
  classDef crew fill:#b1bac4,stroke:#57606a,color:#111,stroke-width:2px
  classDef data fill:#9aa5b1,stroke:#57606a,color:#111,stroke-width:2px
  classDef board fill:#56d364,stroke:#1a7f37,color:#111,stroke-width:2px
  classDef ext fill:#c5ccd4,stroke:#57606a,color:#111,stroke-width:2px,stroke-dasharray:5 3
    class CM,PM,MEM,EV,REG data
    class AG mgmt
    class HK,BD board
    style PROJ fill:transparent,stroke:#8b949e,color:#8b949e
    style PLUG fill:transparent,stroke:#58a6ff,color:#8b949e
    style DATA fill:transparent,stroke:#8b949e,color:#8b949e
    linkStyle 3,4 stroke:#2da44e,stroke-width:2px
```

| What | Where | Who uses it |
|---|---|---|
| Project facts: commands, docs per role, no-go areas, deploy rules | `.claude/crew/project.md` (written by the `project-profile` skill) | Every agent reads it first, with `CLAUDE.md` |
| Memory: lessons for this project, one folder per agent | `.claude/agent-memory/toon-crew-<id>/MEMORY.md`, checked into the project | The agent reads it at the start; Doraemon adds lessons from each hand-back |
| The event log: starts, finishes, assignments, commits, PRs | `events.jsonl` in `$CLAUDE_PLUGIN_DATA` (`~/.toon-crew` if the board is started by hand) | Written by the plugin's hooks; read by the board |
| The project list | `projects.json` in the same folder: path, name, first and last seen | Written when a session starts; read by the board and the lessons pass |
| The board | a local page on `127.0.0.1`, started with the `board` skill | You |

How the hooks work:
- A session start, a subagent start or stop, a Bash, Agent or SendMessage call, and a turn end each send one small message to `board/hook.ts`. It appends at most one line to `events.jsonl`.
- The hooks run in the background (`async`), so they cannot slow a session. They add no model tokens.
- Log lines are short and redacted. An assignment keeps only the task's short description, never the full prompt, and a hand-back is cut to 160 characters.
- A separate hook, the guard (`guard.mjs`), checks every risky call before it runs. It is a seatbelt, not a sandbox: [guards.md](guards.md) lists what it blocks.
- The board starts with `/toon-crew:board`. Polling a project's CI, PRs or deploys is off until you run `/toon-crew:project board on` in that project, and needs a `## Board` section in its `project.md`.

Sources: `plugin/hooks/hooks.json`, `plugin/board/hook.ts`, `plugin/board/lib/paths.ts`, `plugin/board/README.md`, `plugin/skills/{board,project}/SKILL.md`.

## 4. Several projects

Each project runs its own crew. Doraemon in project 1 and Doraemon in project 2 are separate sessions with separate memory. They never share work.

```mermaid
flowchart TB
    subgraph P1["Project 1"]
        S1(["Doraemon session and crew"])
        M1[(".claude/agent-memory/")]
    end
    subgraph P2["Project 2"]
        S2(["Doraemon session and crew"])
        M2[(".claude/agent-memory/")]
    end
    S1 --- M1
    S2 --- M2
    S1 -->|"events with project 1"| EV[("events.jsonl<br/>one file")]
    S2 -->|"events with project 2"| EV
    EV --> BD["One board for all projects"]

  classDef mgmt fill:#58a6ff,stroke:#1f6feb,color:#111,stroke-width:2px
  classDef backend fill:#e3b341,stroke:#9a6700,color:#111,stroke-width:2px
  classDef frontend fill:#ff7b72,stroke:#cf222e,color:#111,stroke-width:2px
  classDef devops fill:#39c5cf,stroke:#0e7490,color:#111,stroke-width:2px
  classDef security fill:#8e9cf5,stroke:#4c5bd4,color:#111,stroke-width:2px
  classDef qa fill:#bc8cff,stroke:#8250df,color:#111,stroke-width:2px
  classDef research fill:#f0883e,stroke:#bc4c00,color:#111,stroke-width:2px
  classDef docs fill:#f778ba,stroke:#bf3989,color:#111,stroke-width:2px
  classDef helpers fill:#c9b97a,stroke:#8a7a3a,color:#111,stroke-width:2px
  classDef crew fill:#b1bac4,stroke:#57606a,color:#111,stroke-width:2px
  classDef data fill:#9aa5b1,stroke:#57606a,color:#111,stroke-width:2px
  classDef board fill:#56d364,stroke:#1a7f37,color:#111,stroke-width:2px
  classDef ext fill:#c5ccd4,stroke:#57606a,color:#111,stroke-width:2px,stroke-dasharray:5 3
    class S1,S2 mgmt
    class M1,M2,EV data
    class BD board
    style P1 fill:transparent,stroke:#8b949e,color:#8b949e
    style P2 fill:transparent,stroke:#8b949e,color:#8b949e
    linkStyle 2,3 stroke:#2da44e,stroke-width:2px
```

- The plugin and the board are installed once. Memory, `project.md` and sessions belong to each project.
- Every event the hooks write carries the project name, so the board can tell them apart.
- The only thing that crosses projects is a lesson: with `/toon-crew:project lessons on`, the lessons pass (owner-only, started by hand) reads a project's memory. Only rules tagged `[crew]` move up, and only through a pull request you review. `[project]` facts stay in their project.
- **The project picker.** Under the tab bar sits a row of chips labelled PROJECT: one chip per project, then **All projects**. The picked chip is bold, with a darker border and a shadow. Every chip shows how many tasks are active in that project ("2 active"). One click switches, and the page address gets `?project=<name>`. The pick applies to both tabs (section 6): the Active and Queued panels, the Crew Room's desks and counts, and the Live tab's log, deploys, CI and errors. With **All projects**, each task row also names its project.
- **Which project is picked first.** In this order: the `?project=` value in the page address, the project you picked last time (the page keeps it in your browser), the project with the newest event, then **All projects**. While the page stays open it keeps your pick.

Sources: `plugin/board/README.md`, `plugin/skills/crew-lessons/SKILL.md`, `plugin/board/room.js` (picker order, chips, address), `plugin/board/room.css` (chip styles), `plugin/board/lib/state.ts` (newest event).

## 5. Active and queued tasks

A task is one piece of work for one role in one project. The board works it out from the event log; nothing else is stored.

```mermaid
stateDiagram-v2
    [*] --> queued : board.sh task add
    [*] --> active : an assign with nothing queued
    queued --> active : an assign to that role, or task start
    active --> done : the agent stops, or task done
    queued --> done : task done
    queued --> dropped : task drop
    active --> dropped : task drop
    done --> active : a resume within 30 minutes
    done --> [*]
    dropped --> [*]

    classDef queuedState fill:#e3b341,stroke:#9a6700,color:#111
    classDef activeState fill:#58a6ff,stroke:#1f6feb,color:#111
    classDef doneState fill:#56d364,stroke:#1a7f37,color:#111
    classDef droppedState fill:#ff7b72,stroke:#cf222e,color:#111
    class queued queuedState
    class active activeState
    class done doneState
    class dropped droppedState
```

The commands (run them as shown in section 6):

```bash
board.sh task add --role <id> [--priority P0|P1|P2] [--ref <branch|PR>] "<text>"
board.sh task start <id>
board.sh task done <id> [--ref <branch|PR>]
board.sh task drop <id>
board.sh task list [--all] [--json]
```

- **Queued.** `add` prints `queued t-<number>-<hex>`; that is the task id. The role must be one of the 15 crew ids, or `add` refuses and lists them. `--priority` is optional; any other value is refused. The text is one line: extra spaces are folded, secrets are redacted, then it is cut to 120 characters. A longer text is cut, not refused. `--ref` (a branch or PR) is cut to 80.
- **Active.** An assign (Doraemon starting that role in that project) takes the **oldest** queued task for that role and project, whatever its priority. If nothing is queued, the assign itself becomes an active task, with its short description as the text and no priority. `task start <id>` does the same for one queued task by hand.
- **Done.** The role's stop event finishes the oldest active task for that role in that project. `task done <id>` does it by hand, for a queued or an active task.
- **Dropped.** `task drop <id>` works on a queued or an active task and hides it. `task start` works only on a queued task. A task that is already done or dropped is refused with "is already done" (or "dropped"), and an unknown id with "no task".
- **Resume.** A message to an existing agent (SendMessage) does not make a new task. If that role finished a task in the same project within the last 30 minutes, the latest one goes back to active. Otherwise nothing changes.
- **Late assign.** An assign that arrives within 5 seconds after the same role stopped in the same project is ignored, unless that role started again in between. A foreground agent call reports its assign just after the agent has stopped; without this rule it would show as a second task.
- **Order.** Active tasks are oldest first. Queued tasks are by priority (P0, P1, P2, then none), then oldest first. The board keeps the last 10 done tasks, newest first.
- **Where you see them.** Both tabs show the Active and Queued panels. The done tasks are in `board.sh task list` and in `/api/state`; the page lists no done tasks. The Live tab's Agent log shows the finish as a "done" line (section 6).
- **Model override.** An active task shows `model override: <name>` when the call asked for a model that differs from the agent file's.

Sources: `plugin/board/task.ts` (commands, refusals), `plugin/board/lib/tasks.ts` (priorities, 120 characters, 10 done, 30 minutes, 5 seconds, states, rules and order). Checked by running `board.sh task add|list|start|done|drop` against a throwaway data folder: the 150-character text came back as 120, `P9` and an unknown role were refused, and a second `start` or `done` said "already".

## 6. Using the board

Start it once; one board serves every project:

- Type `/toon-crew:board` (it takes `start`, `stop` or `status`; the default is `start`). It prints `{"pid":..,"port":..}`. Open `http://127.0.0.1:<port>`. The port is the first free one from 8811. The skill is set so that only you can run it (`disable-model-invocation: true`).
- Without the skill, run the command it runs: `CLAUDE_PLUGIN_DATA="${CLAUDE_PLUGIN_DATA}" bash "${CLAUDE_PLUGIN_ROOT}/board/board.sh" start`. Use the same data folder as the hooks, or the board shows nothing.

The page has two tabs, **Live** and **Crew Room**, and the page remembers which one you used last (`#room` in the address opens the Crew Room). Both tabs share the project picker (section 4) and the **Active** and **Queued** panels (section 5), so they always show the same tasks. The Live tab refreshes every 4 seconds; the Crew Room every 2 seconds, so its walks follow events closely. The Live tab's header says "Live" with the time, or "Server not answering; retrying…" if the board has stopped; the last data stays on screen.

### The Crew Room tab

A pixel-art office with a desk for each crew member, in rooms by team. It is the quick, friendly view: who is at work, who is free, and what just happened.

- **Header.** A row of counts for the picked project: Working and Queued (the same numbers as the panels), the live version, and the branch. The **Motion** button (MOTION ON or MOTION OFF) turns the animation on or off. Without a choice from you, it follows your device's reduced-motion setting, and the page remembers your choice.
- **Desks.** A character at a desk shows who is working, idle or done. Each project has its own room, so a room shows only that project's crew. A desk with nothing going on is dimmed and asleep.
- **Walkers and bubbles.** When Doraemon starts a role on a task, he walks the corridor to that desk with the task on a piece of paper, says its text in a speech bubble, and the role starts work. When a role hands back, it walks to Doraemon's desk with the result. Doraemon also looks in on someone who has worked for a while without contact. At most two characters walk at once (three when several project rooms are open). With Motion off, the same events show as short notes on the desks, with no walking.
- **Hover cards.** Hover over a desk (or focus it with the keyboard, or tap it) to open a small card: the role and team, how long it has been working or since it finished, its task, the model it runs on, and its last hand-back. Press Esc or click elsewhere to close it.
- **The wall.** "On the wall" shows framed pictures of the characters who left the crew, each with a plate saying who took over their job (see [roster.md](roster.md)).

### The Live tab

The plain, text view. Below the picker and the Active and Queued panels:

| Section | What it shows |
|---|---|
| **Crew** | One chip per role: "free", or "N active" with how long the current task has run, plus the number queued. |
| **Agent log** | Starts, finishes, assigns and task changes, newest first, in India time. The page says nothing is logged yet when the log is empty. |
| **Deploys and CI** | For the picked project: the last deploy (version, "ok" or "failed", time), recent CI runs, pull requests and the latest commits. |
| **App errors** | Warnings and errors from the containers named in the project's `deploy-containers` setting, redacted. |

Deploys, CI and app errors need polling, which the owner turns on per project (section 3). Without it those sections say nothing has been read yet. A pull request opened, merged, closed or reopened with `gh pr` in a session is logged by the hooks without polling.

**How a task gets queued.** Doraemon (or you) runs `board.sh task add`. The task shows under Queued for that role. When Doraemon next starts that role in the same project, the oldest queued task for it moves to Active, and the role's hand-back finishes it. Example:

```bash
board.sh task add --role kevin --priority P1 "Add the refunds table"
```

It prints `queued t-<number>-<hex>`. Here `board.sh` stands for `bash "${CLAUDE_PLUGIN_ROOT}/board/board.sh"`, run with `CLAUDE_PLUGIN_DATA` set to the hooks' data folder: with another folder the task goes into a different log and the board never sees it. The project is the registered name of `CLAUDE_PROJECT_DIR`, else the current folder's name, so run it from the project it is for. `board.sh task list` shows the queue for that project, and `--all` shows every project.

Two things to know:
- Tasks are optional. A role started with nothing queued still shows under Active, so the board works without anyone running `task add`.
- Doraemon queues each planned piece with the `toon-crew:task` skill, which runs `board.sh task ...` for him (`plugin/agents/doraemon.md:17`, `plugin/skills/task/SKILL.md`). You can still add tasks yourself with `board.sh task add`.

Sources: `plugin/skills/board/SKILL.md` (the skill, `disable-model-invocation: true`), `plugin/board/board.sh`, `plugin/board/README.md` ("Start it", "Tasks"), and `plugin/board/page.html` (tabs, Live sections, refresh rate) and `plugin/board/room.js` (tab memory and `#room`, Motion, walkers, hover card, wall, picker and panels).

## 7. Cost in three lines

- The manager is the cost: Doraemon runs on Opus and was 76 to 99 percent of each measured run, so he delegates reading and searching, keeps turns short and sends lookups to Stuart.
- Cheapest model that fits: Opus where a wrong answer looks right (judgement, design review, security), Sonnet for building and writing, Haiku for checks and lookups.
- Nobody passes a `model` on a call except the listed escalations, because a per-call model beats the agent file. The board shows `model override: <name>` on the task's row when one does.

Figures and how they were measured: [cost-baseline.md](cost-baseline.md) (taken before the cast v2 renames and not re-measured since). Keep waves 2 to 4 wide: many agents cost many times the tokens of one chat.

## 8. How the parts fit together

The plugin's files, the hooks, the board and where data moves between them. The solid arrows are calls and data; the dashed arrow is something you run by hand.

```mermaid
flowchart LR
  MP["marketplace.json<br/>(.claude-plugin/, marketplace crew)"] -->|"source: ./plugin"| SK

  subgraph PL["plugin/ : the toon-crew plugin (checked by .github/workflows/ci.yml)"]
    AG(["agents/*.md<br/>15 crew agents; settings.json<br/>makes Doraemon the main agent"])
    SK["skills/*<br/>board, task, project-profile, ..."]
    subgraph HK["hooks/hooks.json"]
      GD["hooks/guard.mjs<br/>+ inline-writes.mjs<br/>(PreToolUse)"]
      PJ["hooks/projects.mjs register<br/>(SessionStart)"]
      HT["board/hook.ts<br/>(session, subagent, Bash,<br/>Agent and SendMessage events)"]
    end
    subgraph BD["board/"]
      TK["task.ts<br/>(board.sh task ...)"]
      SRV["server.ts<br/>127.0.0.1 only"]
      PG["page.html + room.css + room.js<br/>one room per project"]
      PO["lib/pollers.ts<br/>optional; runs gh, git, ssh<br/>read-only"]
    end
    EV["evals/<br/>claude plugin eval cases"]
  end

  CC(["Claude Code session"])
  DATA[("$CLAUDE_PLUGIN_DATA<br/>events.jsonl, projects.json,<br/>per-project poller state")]
  CFG[("your project's<br/>.claude/crew/project.md<br/>section: ## Board")]

  CC <-->|"each risky tool call: allow, ask or block"| GD
  CC -->|"SessionStart"| PJ
  CC -->|"start, stop, tool events"| HT
  PJ -->|"records the project"| DATA
  HT -->|"appends events"| DATA
  SK -->|"/toon-crew:task"| TK
  TK -->|"appends task events"| DATA
  SK -->|"/toon-crew:board"| SRV
  DATA -->|"reads events and projects"| SRV
  SRV -->|"page, /api/state"| PG
  SRV -->|"runs in the same process"| PO
  CFG -->|"only if the project is opted in"| PO
  PO -->|"snapshots, CI and deploy events"| DATA
  EV -.->|"run by hand"| AG

  classDef mgmt fill:#58a6ff,stroke:#1f6feb,color:#111,stroke-width:2px
  classDef backend fill:#e3b341,stroke:#9a6700,color:#111,stroke-width:2px
  classDef frontend fill:#ff7b72,stroke:#cf222e,color:#111,stroke-width:2px
  classDef devops fill:#39c5cf,stroke:#0e7490,color:#111,stroke-width:2px
  classDef security fill:#8e9cf5,stroke:#4c5bd4,color:#111,stroke-width:2px
  classDef qa fill:#bc8cff,stroke:#8250df,color:#111,stroke-width:2px
  classDef research fill:#f0883e,stroke:#bc4c00,color:#111,stroke-width:2px
  classDef docs fill:#f778ba,stroke:#bf3989,color:#111,stroke-width:2px
  classDef helpers fill:#c9b97a,stroke:#8a7a3a,color:#111,stroke-width:2px
  classDef crew fill:#b1bac4,stroke:#57606a,color:#111,stroke-width:2px
  classDef data fill:#9aa5b1,stroke:#57606a,color:#111,stroke-width:2px
  classDef board fill:#56d364,stroke:#1a7f37,color:#111,stroke-width:2px
  classDef ext fill:#c5ccd4,stroke:#57606a,color:#111,stroke-width:2px,stroke-dasharray:5 3
  class MP,CC ext
  class AG,SK mgmt
  class GD security
  class PJ,HT,TK,SRV,PG,PO board
  class EV qa
  class DATA,CFG data
  style PL fill:transparent,stroke:#8b949e,color:#8b949e
  style HK fill:transparent,stroke:#4c5bd4,color:#8b949e
  style BD fill:transparent,stroke:#2da44e,color:#8b949e
  %% green = writes to the data folder, violet = run by hand
  linkStyle 4,5,7,13 stroke:#2da44e,stroke-width:2px
  linkStyle 14 stroke:#a371f7,stroke-width:2px
```

Claude Code loads the plugin from the marketplace, makes Doraemon the main agent, and runs the hooks around every session. The guard hook checks each risky tool call before it runs. The other hooks only write: a project list and a one-line-per-event log in the plugin's data folder. The `task` skill writes to the same log: Doraemon uses it to queue, start, finish or drop board tasks.

The Crew Room board is a separate local page. `board.sh start` runs `server.ts` on `127.0.0.1`; it reads the log and serves the page, which shows one room per project. Only if you opt a project in (`/toon-crew:project board on`) and the project's `project.md` has a `## Board` section does it also poll GitHub CI, pull requests, commits and a deploy host, read-only. CI (`.github/workflows/ci.yml`) runs the structure check, strict validation, the hook and board tests and gitleaks on the plugin. Evals are run by hand; CI does not run them.

## FAQ

**Do I have to run the board?**
No. The hooks write the log whether or not the board is running. The board only reads it.

**Why can a read-only agent still write a file?**
Turning on memory re-adds Write to an agent's tools. The guard is the lock: read-only roles can write only their own memory file, temp folders and their deliverable folders. See [guards.md](guards.md).

**Can the crew merge to main on its own?**
No. Only Mike Wazowski and Sulley may merge, only a pull request you approved, and the guard asks you to confirm each merge. A push to `main` asks you only when Mike Wazowski or Sulley makes it; for everyone else, Doraemon included, the guard refuses it.

**Does the crew in one project learn from another?**
Not directly. Memory stays in each project. If you turn on `lessons`, the owner can run the lessons pass by hand, which opens a pull request to this repo with rules that hold in any project; the owner decides what to merge.

**My builder's worktree started from the wrong branch.**
Add `"worktree": { "baseRef": "head" }` to the project's `.claude/settings.json`. Plugin settings cannot set it, and the guard stops the crew editing that file, so make the edit yourself. See [Per-project setup](../README.md#per-project-setup) in the README.
