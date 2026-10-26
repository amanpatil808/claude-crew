// Board tasks (queued / active / done / dropped), derived from the event log: nothing else is stored.
// Contract: docs/planning/board-v2-contract.md.
import type { BoardEvent } from "./events.ts";
import { loadRoles, roleFor, typesById, type Role } from "./crew.ts";
import { isOverride, normalizeModel } from "./model.ts";
import { redact } from "./redact.ts";

export type Priority = "P0" | "P1" | "P2";
export type TaskState = "queued" | "active" | "done" | "dropped";
export interface BoardTask {
  id: string; project: string; role: string; priority?: Priority; text: string; state: TaskState;
  queuedAt?: string; startedAt?: string; doneAt?: string; ref?: string;
  modelOverride?: string;   // active: the model the assign asked for, when it differs from the agent file's
}
export interface TaskLists { active: BoardTask[]; queued: BoardTask[]; done: BoardTask[] }

export const PRIORITIES: readonly Priority[] = ["P0", "P1", "P2"];
export const TASK_ID = /^t-\d+-[0-9a-f]{6}$/;
export const DONE_SHOWN = 10;
const RESUME_WINDOW_MS = 30 * 60_000;   // a SendMessage resume re-opens a task that finished this recently
const LATE_ASSIGN_MS = 5_000;           // a foreground Agent call reports its assign just after the agent stopped

// An event id "e-<ms>-<hex>" names its task "t-<ms>-<hex>", so a task needs no id of its own on disk.
export const taskIdOf = (eventId: string) => `t${eventId.slice(1)}`;

// One line, redacted first and clipped after, so a cut can never leave half a secret.
export const taskText = (s: string, max = 120) => redact(s.replace(/\s+/g, " ").trim()).slice(0, max).trim();

const isPriority = (p: unknown): p is Priority => PRIORITIES.includes(p as Priority);

interface Entry { task: BoardTask; seq: number }
const byTime = (key: "queuedAt" | "startedAt" | "doneAt") => (a: Entry, b: Entry) => (a.task[key] ?? "").localeCompare(b.task[key] ?? "") || a.seq - b.seq;

function all(events: BoardEvent[], roles: Map<string, Role>): Entry[] {
  const types = typesById(events), tasks = new Map<string, Entry>();
  let seq = 0;
  const lastStop = new Map<string, string>();   // project+role -> its stop time, cleared by that role's next start
  // Oldest first, by when it reached its state; insertion order breaks same-millisecond ties.
  const oldest = (project: string, role: string, state: TaskState) =>
    [...tasks.values()].filter((x) => x.task.state === state && x.task.project === project && x.task.role === role)
      .sort(byTime(state === "queued" ? "queuedAt" : "startedAt"))[0];
  for (const e of events) {
    const project = e.project ?? "";
    if (e.kind === "task-queue" && e.role && roles.has(e.role)) {
      const id = taskIdOf(e.id);
      tasks.set(id, { seq: seq++, task: { id, project, role: e.role, ...(isPriority(e.priority) ? { priority: e.priority } : {}), text: e.text, state: "queued", queuedAt: e.ts, ...(e.ref ? { ref: e.ref } : {}) } });
    } else if (e.kind === "assign") {
      if (e.toId) {
        // A resume is the same job continuing: re-open the role's latest task if it just finished, else nothing.
        const rr = (e.to ? roleFor(e.to, roles) : undefined) ?? roleFor(types.get(e.toId), roles), ms = Date.parse(e.ts);
        const last = rr ? [...tasks.values()].filter((x) => x.task.state === "done" && x.task.project === project && x.task.role === rr.id && ms - Date.parse(x.task.doneAt ?? "") <= RESUME_WINDOW_MS)
          .sort((a, b) => -byTime("doneAt")(a, b))[0] : undefined;
        if (last) { last.task.state = "active"; last.task.startedAt = e.ts; delete last.task.doneAt; delete last.task.modelOverride; }
        continue;
      }
      const role = e.to ? roleFor(e.to, roles) : undefined;
      if (!role) continue;
      const stoppedAt = lastStop.get(`${project}\0${role.id}`);
      if (stoppedAt && Date.parse(e.ts) - Date.parse(stoppedAt) <= LATE_ASSIGN_MS) continue;
      const asked = normalizeModel(e.model), over = isOverride(asked, normalizeModel(e.declaredModel)) ? { modelOverride: asked } : {};
      const queued = oldest(project, role.id, "queued");
      if (queued) Object.assign(queued.task, { state: "active", startedAt: e.ts, ...over });
      else { const id = taskIdOf(e.id); tasks.set(id, { seq: seq++, task: { id, project, role: role.id, text: e.text, state: "active", startedAt: e.ts, ...over } }); }
    } else if (e.kind === "agent-start") {
      const role = e.agentType && e.agentType !== "agent" ? roleFor(e.agentType, roles) : undefined;
      if (role) lastStop.delete(`${project}\0${role.id}`);
    } else if (e.kind === "agent-stop") {
      const type = e.agentType && e.agentType !== "agent" ? e.agentType : e.agentId ? types.get(e.agentId) : undefined;
      const role = type ? roleFor(type, roles) : undefined;
      if (role) lastStop.set(`${project}\0${role.id}`, e.ts);
      const hit = role ? oldest(project, role.id, "active") : undefined;
      if (hit) Object.assign(hit.task, { state: "done", doneAt: e.ts });
    } else if ((e.kind === "task-start" || e.kind === "task-done" || e.kind === "task-drop") && e.taskId) {
      const t = tasks.get(e.taskId)?.task;
      if (!t || t.state === "done" || t.state === "dropped") continue;
      if (e.kind === "task-start") { if (t.state === "queued") Object.assign(t, { state: "active", startedAt: e.ts }); }
      else if (e.kind === "task-done") Object.assign(t, { state: "done", doneAt: e.ts, ...(e.ref ? { ref: e.ref } : {}) });
      else t.state = "dropped";
    }
  }
  return [...tasks.values()];
}

const RANK: Record<string, number> = { P0: 0, P1: 1, P2: 2 };

export function deriveTasks(events: BoardEvent[], roles: Map<string, Role> = loadRoles()): TaskLists {
  const list = all(events, roles), pick = (s: TaskState) => list.filter((x) => x.task.state === s);
  return {
    active: pick("active").sort(byTime("startedAt")).map((x) => x.task),
    queued: pick("queued").sort((a, b) => (RANK[a.task.priority ?? ""] ?? 3) - (RANK[b.task.priority ?? ""] ?? 3) || byTime("queuedAt")(a, b)).map((x) => x.task),
    done: pick("done").sort((a, b) => -byTime("doneAt")(a, b)).slice(0, DONE_SHOWN).map((x) => x.task),
  };
}

// Any task, whatever its state (the CLI needs to find a dropped or older done one by id).
export const findTask = (events: BoardEvent[], id: string, roles: Map<string, Role> = loadRoles()): BoardTask | undefined =>
  all(events, roles).find((x) => x.task.id === id)?.task;

// Active tasks per project: what the project chip shows as "working".
export function activeByProject(tasks: TaskLists): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of tasks.active) if (t.project) m.set(t.project, (m.get(t.project) ?? 0) + 1);
  return m;
}
