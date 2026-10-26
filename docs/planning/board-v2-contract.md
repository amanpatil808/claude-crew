# Board v2 and crew docs (contract, 26 Oct 2026)

Owner's asks:
1. Proper crew docs with a diagram of how the crew works.
2. A simpler live board.
3. New sections for **Active** and **Queued** tasks.
4. With several projects running, pick one project. Its work is shown in full; other projects stay visible but greyed out.

Each project has its own crew: Doraemon in project 1 and Doraemon in project 2 are separate sessions with separate memory (`.claude/agent-memory/` in each repo). The board is one local page for all projects, and every event already carries `project`.

## Tasks (new)
A task is one piece of work for one role in one project.

```ts
interface BoardTask {
  id: string;            // "t-<ms>-<hex>", doc_id-safe
  project: string;       // registry name, same as BoardEvent.project
  role: string;          // role id, e.g. "kevin"
  priority?: "P0" | "P1" | "P2";
  text: string;          // one line, redacted, max 120 chars
  state: "queued" | "active" | "done" | "dropped";
  queuedAt?: string; startedAt?: string; doneAt?: string;   // UTC ISO
  ref?: string;          // branch or PR, when known
}
```

How each state is reached (all derived from the event log; nothing else is stored):
- **queued:** the manager runs `board.sh task add --role <id> [--priority P1] "<text>"`. This writes a `task-queue` event. The project comes from `CLAUDE_PROJECT_DIR`, else the current folder's registry name.
- **active:**
  - An `assign` event to role R in project P makes the oldest queued task for (P, R) active.
  - If no task is queued for (P, R), the assign itself becomes an active task (text = the assign text, no priority).
  - `board.sh task start <id>` also makes a task active.
- **done:** the matching `agent-stop`, or `board.sh task done <id>`.
- **dropped:** `board.sh task drop <id>`. Dropped tasks are hidden.

## `/api/state` additions
- `tasks: { active: BoardTask[], queued: BoardTask[], done: BoardTask[] }`, all projects:
  - active: oldest first.
  - queued: by priority (P0, P1, P2, none), then oldest first.
  - done: the last 10, newest first.
  - The page filters by project.
- `projects[]` keeps its current shape; `working` counts active tasks.

## Page (Nobita sets the direction; Shinchan builds it)
- **Project picker** at the top. It defaults to the `?project=` query, then the last pick, then `focus`.
  - The picked project is shown in full.
  - Each other project shows as a greyed chip with its active count; picking it switches the view.
  - An "All projects" choice stays available.
- **Sections, in order:** Active, Queued, Crew (who is working), Recent (feed, outcomes only), Facts (Live, Branch).
- The page must be simpler than today's. Drop anything decorative that doesn't tell the owner who is doing what.

## Docs (Shizuka)
- `docs/how-it-works.md`, with Mermaid diagrams:
  - The flow: owner → Doraemon → waves → crew → hand-back → verify → commit → PR → Mike merges on the owner's OK.
  - Where things live: memory per project, the board shared across projects, hooks writing events.
  - How several projects stay separate.
- Linked from the root `README.md`.
