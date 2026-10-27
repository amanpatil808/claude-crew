# The Crew Room board

For anyone who has installed the `toon-crew` plugin and wants to know what the board shows, what feeds it and what to do when it looks wrong. The short version is in the [README](../README.md). The step-by-step walk-through is in [section 6 of how-it-works.md](how-it-works.md#6-using-the-board).

The board is one local page for all your projects. Start it with `/toon-crew:board`. Hooks write a short, redacted line for each event to a log, and the board reads that log. Below is the Live tab, then diagrams of what feeds the board and what is on the page.

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="images/live-dark.png">
    <img src="images/live-light.png" alt="The Live tab of the board: the project picker, the Active and Queued task panels, one chip per crew role, the agent log with the newest line first, and cards for deploys, CI and app errors. The screenshot shows demo data." width="900">
  </picture>
  <br>
  <sub>Live tab with demo data</sub>
</p>

Both board screenshots (this one and the Crew Room one in the README) show demo data, not a real project. To see it yourself, from a clone of this repo (the installed plugin has no `scripts/` folder), seed a new empty folder and start the board on it: `node scripts/board-demo.mjs /tmp/crew-demo` prints the exact `board.sh start` and `stop` commands. Running it again on the same folder re-seeds it. It refuses a non-empty folder it did not create, `~/.toon-crew`, anything under `~/.claude`, your home folder, and any folder whose board is still running.

## Good to know

- **One room per project.** Pick a project to see only its crew. **All projects** stacks the rooms, busiest first, and starts idle ones collapsed. Each room shows a project that is registered or has had an event in the last 7 days.
- **Working means an agent is running or the project has an active task for that role.** A desk with nothing going on is dimmed and asleep.
- **Hand-back lines** read "<name> handed back: <summary>", cut to 70 characters on the room and 160 in the Live tab's log.
- **Tasks are optional.** A role started with nothing queued still shows as Active.
- **Motion button.** It follows your device's reduced-motion setting until you choose. With Motion off, walks become short notes on the desks.
- **Local only.** The page listens on `127.0.0.1` (the first free port from 8811 to 8820), answers GET requests only and has no login and no buttons.
- **Times are India time (IST)** on the board. There is no time-zone setting.

Section 6 of [how-it-works.md](how-it-works.md#6-using-the-board) explains each part. API details are in [plugin/board/README.md](../plugin/board/README.md).

## What the board records

The green dotted lines are what the board records. A queued task sits in the Queued panel. When Doraemon assigns that role, the oldest queued task for it becomes active (an assignment with nothing queued becomes an active task itself). It is done when the agent stops, with that agent's one-line hand-back. A task nobody has touched for six hours is shown as done.

```mermaid
flowchart TD
  OWN(["👤 You"]) -->|"request"| DOR(["Doraemon (Management)<br/>main agent: plans file-disjoint waves,<br/>P0/P1/P2, writes briefs"])
  DOR -->|"queue each planned piece"| TSK["toon-crew:task skill<br/>board.sh task add, start, done, drop<br/>(board/task.ts)"]
  TEAMS(["The crew: 15 agents in 9 teams<br/>started by Doraemon as toon-crew:id"])

  DOR -->|"Agent tool: brief per role"| TEAMS
  TEAMS -->|"hand-back"| DOR
  DOR -->|"verifies each hand-back,<br/>git commit (only Doraemon)"| BR["feature branch"]
  BR -->|"gh pr create"| PR["🔀 pull request"]
  PR -->|"you approve that PR"| MG(["DevOps Team merges<br/>(guard asks you)"])
  MG --> MAIN["main"]

  subgraph BOARD["Crew Room board"]
    EVT[("events.jsonl")]
    ROOM["Crew Room page<br/>one room per project,<br/>Active and Queued panels"]
    POLL["optional pollers<br/>CI, PRs, commits, deploy"]
  end

  TSK -.->|"task-queue, task-start,<br/>task-done, task-drop events"| EVT
  DOR -.->|"assign event: who, one-line task"| EVT
  TEAMS -.->|"agent-start and agent-stop<br/>with a hand-back line"| EVT
  BR -.->|"commit event"| EVT
  PR -.->|"pr event"| EVT
  PR -.->|"CI and PR state from GitHub"| POLL
  POLL -.-> EVT
  EVT --> ROOM

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
  class OWN,BR,PR,MAIN ext
  class TEAMS crew
  class DOR mgmt
  class TSK,ROOM,POLL board
  class EVT data
  class BE backend
  class FE frontend
  class DV,MG devops
  class SE security
  class QA qa
  class RS research
  class DC docs
  class HP helpers
  style BOARD fill:transparent,stroke:#2da44e,color:#8b949e
  %% dotted edges = what the board sees
  linkStyle 8,9,10,11,12,13,14 stroke:#2da44e,stroke-width:2px
```

The teams, in the colours the diagrams use (green is the Crew Room board, grey is files and data):

```mermaid
flowchart TD
  BE(["Backend<br/>kevin, bob"]) ~~~ QA(["QA<br/>joe-gardner, twenty-two"])
  FE(["Frontend<br/>nobita, shinchan"]) ~~~ RS(["Research<br/>dekisugi, olaf"])
  DV(["DevOps<br/>mike-wazowski, sulley"]) ~~~ DC(["Documentation<br/>shizuka"])
  SE(["Security<br/>ninja-hattori"]) ~~~ HP(["Helpers<br/>stuart"])
  MG(["Management<br/>doraemon, miguel-rivera"])

  classDef mgmt fill:#58a6ff,stroke:#1f6feb,color:#111,stroke-width:2px
  classDef backend fill:#e3b341,stroke:#9a6700,color:#111,stroke-width:2px
  classDef frontend fill:#ff7b72,stroke:#cf222e,color:#111,stroke-width:2px
  classDef devops fill:#39c5cf,stroke:#0e7490,color:#111,stroke-width:2px
  classDef security fill:#8e9cf5,stroke:#4c5bd4,color:#111,stroke-width:2px
  classDef qa fill:#bc8cff,stroke:#8250df,color:#111,stroke-width:2px
  classDef research fill:#f0883e,stroke:#bc4c00,color:#111,stroke-width:2px
  classDef docs fill:#f778ba,stroke:#bf3989,color:#111,stroke-width:2px
  classDef helpers fill:#c9b97a,stroke:#8a7a3a,color:#111,stroke-width:2px
  classDef data fill:#9aa5b1,stroke:#57606a,color:#111,stroke-width:2px
  classDef board fill:#56d364,stroke:#1a7f37,color:#111,stroke-width:2px
  classDef ext fill:#c5ccd4,stroke:#57606a,color:#111,stroke-width:2px,stroke-dasharray:5 3
  class MG mgmt
  class BE backend
  class FE frontend
  class DV devops
  class SE security
  class QA qa
  class RS research
  class DC docs
  class HP helpers
```

## What feeds the board

```mermaid
flowchart LR
  HK["Claude Code hooks<br/>agent start and stop, assign,<br/>commit and PR events"]
  TK["/toon-crew:task<br/>queue, start, done, drop"]
  PO["Optional pollers<br/>(opt-in per project)<br/>gh: CI runs, PRs, commits<br/>read-only ssh: deploy, app errors"]
  EV[("events.jsonl<br/>in the plugin data folder")]
  SN[("poller snapshots")]
  RG[("projects.json<br/>(which projects exist)")]
  AF["📄 Agent files<br/>(names, titles, models)"]
  SV["Board server<br/>127.0.0.1 only<br/>GET /api/state"]
  PG["Board page<br/>Live tab and Crew Room tab<br/>(your browser remembers the tab,<br/>the project and Motion)"]

  HK -->|"one redacted line each"| EV
  TK -->|"task lines"| EV
  PO -->|"CI and PR events"| EV
  PO -->|"latest results"| SN
  EV --> SV
  SN --> SV
  RG --> SV
  AF --> SV
  SV -->|"refresh every 2 s (Crew Room)<br/>or 4 s (Live)"| PG

  classDef mgmt fill:#58a6ff,stroke:#1f6feb,color:#111,stroke-width:2px
  classDef backend fill:#e3b341,stroke:#9a6700,color:#111,stroke-width:2px
  classDef frontend fill:#ff7b72,stroke:#cf222e,color:#111,stroke-width:2px
  classDef devops fill:#39c5cf,stroke:#0e7490,color:#111,stroke-width:2px
  classDef security fill:#8e9cf5,stroke:#4c5bd4,color:#111,stroke-width:2px
  classDef qa fill:#bc8cff,stroke:#8250df,color:#111,stroke-width:2px
  classDef research fill:#f0883e,stroke:#bc4c00,color:#111,stroke-width:2px
  classDef docs fill:#f778ba,stroke:#bf3989,color:#111,stroke-width:2px
  classDef helpers fill:#c9b97a,stroke:#8a7a3a,color:#111,stroke-width:2px
  classDef data fill:#9aa5b1,stroke:#57606a,color:#111,stroke-width:2px
  classDef board fill:#56d364,stroke:#1a7f37,color:#111,stroke-width:2px
  classDef ext fill:#c5ccd4,stroke:#57606a,color:#111,stroke-width:2px,stroke-dasharray:5 3
  class HK,TK,PO,SV,PG board
  class EV,SN,RG,AF data
```

## What is on the page, and what feeds each part

```mermaid
flowchart TB
  subgraph PAGE["The board page (one page for all your projects)"]
    direction TB
    subgraph LT["Live tab"]
      direction TB
      CC["Crew chips: free or N active<br/>Fed by: tasks"]
      AL["Agent log, India time<br/>Fed by: events"]
      CI["Deploys and CI card: last deploy,<br/>CI runs, pull requests, commits<br/>Fed by: pollers"]
      ER["App errors card<br/>Fed by: pollers"]
      CC ~~~ AL ~~~ CI ~~~ ER
    end
    subgraph RT["Crew Room tab"]
      direction TB
      HR["Hero counts: Working, Queued,<br/>Live version, Branch + Motion button<br/>Fed by: tasks, deploy poller,<br/>the project's current branch"]
      RM["One room per project: nine team rooms<br/>Fed by: that project's events and tasks"]
      DK["Desks: character, name plate, task line,<br/>hand-back line, hover card<br/>Fed by: tasks, agent start and stop events"]
      WK["Walkers and speech bubbles<br/>Fed by: assign and hand-back events"]
      WL["On the wall: framed former crew<br/>Fed by: a built-in list"]
      HR ~~~ RM ~~~ DK ~~~ WK ~~~ WL
    end
    subgraph TOP["On both tabs, at the top"]
      direction LR
      TB["Tab bar<br/>Live | Crew Room"]
      PK["Project picker<br/>one chip per project<br/>plus All projects<br/>Fed by: project list, tasks"]
      PN["Active and Queued panels<br/>Fed by: tasks"]
    end
  end

  classDef mgmt fill:#58a6ff,stroke:#1f6feb,color:#111,stroke-width:2px
  classDef backend fill:#e3b341,stroke:#9a6700,color:#111,stroke-width:2px
  classDef frontend fill:#ff7b72,stroke:#cf222e,color:#111,stroke-width:2px
  classDef devops fill:#39c5cf,stroke:#0e7490,color:#111,stroke-width:2px
  classDef security fill:#8e9cf5,stroke:#4c5bd4,color:#111,stroke-width:2px
  classDef qa fill:#bc8cff,stroke:#8250df,color:#111,stroke-width:2px
  classDef research fill:#f0883e,stroke:#bc4c00,color:#111,stroke-width:2px
  classDef docs fill:#f778ba,stroke:#bf3989,color:#111,stroke-width:2px
  classDef helpers fill:#c9b97a,stroke:#8a7a3a,color:#111,stroke-width:2px
  classDef data fill:#9aa5b1,stroke:#57606a,color:#111,stroke-width:2px
  classDef board fill:#56d364,stroke:#1a7f37,color:#111,stroke-width:2px
  classDef ext fill:#c5ccd4,stroke:#57606a,color:#111,stroke-width:2px,stroke-dasharray:5 3
  class CC,AL,CI,ER board
  class HR,RM,DK,WK,WL board
  class TB,PK,PN mgmt
  style PAGE fill:transparent,stroke:#8b949e,color:#8b949e
  style LT fill:transparent,stroke:#2da44e,color:#8b949e
  style RT fill:transparent,stroke:#2da44e,color:#8b949e
  style TOP fill:transparent,stroke:#58a6ff,color:#8b949e
```

## Troubleshooting

- **The board is empty.** The hooks and the board must use the same data folder. Start the board with `/toon-crew:board`, not by hand.
- **The board shows a project but no CI or deploys.** Polling is off until you run `/toon-crew:project board on` and the project's `project.md` has a `## Board` section. See [Show CI, pull requests, commits and deploys on the board](setup.md#optional-show-ci-pull-requests-commits-and-deploys-on-the-board).
- **Nothing is logged at all.** Check your Node version with `node --version`. The board's hook needs 24.2 or later. (On older Node it likely loads but writes no events; that has not been tested.)
- **A builder's worktree started from the wrong branch.** Set `"worktree": { "baseRef": "head" }` in the project's `.claude/settings.json` (see [Per-project setup](setup.md#per-project-setup)).
- **A read-only agent wrote a file.** It can write only its own memory file, temp folders and its docs folder. See [guards.md](guards.md).
- **The guard blocked something you want.** Run that command yourself with `!`, or on GitHub's website. The guard does not check your own commands.
