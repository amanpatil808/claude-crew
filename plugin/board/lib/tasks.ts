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
  stale?: true;             // shown as done: neither the task nor its agent had any event for STALE_AFTER_MS
}
export interface TaskLists { active: BoardTask[]; queued: BoardTask[]; done: BoardTask[] }

export const PRIORITIES: readonly Priority[] = ["P0", "P1", "P2"];
export const TASK_ID = /^t-\d+-[0-9a-f]{6}$/;
export const DONE_SHOWN = 10;
const RESUME_WINDOW_MS = 30 * 60_000;   // a SendMessage resume re-opens a task that finished this recently
const STALE_AFTER_MS = 6 * 3_600_000;   // an active task no agent is bound to, quiet this long, is shown as done
const LATE_ASSIGN_MS = 5_000;           // a foreground Agent call reports its assign just after the agent stopped

// An event id "e-<ms>-<hex>" names its task "t-<ms>-<hex>", so a task needs no id of its own on disk.
export const taskIdOf = (eventId: string) => `t${eventId.slice(1)}`;

// One line, redacted first and clipped after, so a cut can never leave half a secret.
export const taskText = (s: string, max = 120) => redact(s.replace(/\s+/g, " ").trim()).slice(0, max).trim();

const isPriority = (p: unknown): p is Priority => PRIORITIES.includes(p as Priority);

interface Entry { task: BoardTask; seq: number; agent?: string; seen?: string }   // agent: the agent id its start/stop events are matched on
const byTime = (key: "queuedAt" | "startedAt" | "doneAt") => (a: Entry, b: Entry) => (a.task[key] ?? "").localeCompare(b.task[key] ?? "") || a.seq - b.seq;

function all(events: BoardEvent[], roles: Map<string, Role>, now?: number): Entry[] {
  const types = typesById(events), tasks = new Map<string, Entry>();
  let seq = 0;
  const lastStop = new Map<string, string>();   // project+role -> its stop time, cleared by that role's next start
  // Oldest first, by when it reached its state; insertion order breaks same-millisecond ties.
  const mine = (project: string, role: string, state: TaskState, unbound = false) =>
    [...tasks.values()].filter((x) => x.task.state === state && x.task.project === project && x.task.role === role && (!unbound || !x.agent))
      .sort(byTime(state === "queued" ? "queuedAt" : "startedAt"));
  const oldest = (project: string, role: string, state: TaskState, unbound = false) => mine(project, role, state, unbound)[0];
  for (const e of events) {
    const project = e.project ?? "";
    const aid = e.agentId ?? e.toId;   // any event of an agent counts as activity for its bound tasks
    if (aid) for (const x of tasks.values()) if (x.agent === aid) x.seen = e.ts;
    if (e.kind === "task-queue" && e.role && roles.has(e.role)) {
      const id = taskIdOf(e.id);
      tasks.set(id, { seq: seq++, task: { id, project, role: e.role, ...(isPriority(e.priority) ? { priority: e.priority } : {}), text: e.text, state: "queued", queuedAt: e.ts, ...(e.ref ? { ref: e.ref } : {}) } });
    } else if (e.kind === "assign") {
      if (e.toId) {
        // A resume is the same job continuing: re-open the role's latest task if it just finished, else nothing.
        const rr = (e.to ? roleFor(e.to, roles) : undefined) ?? roleFor(types.get(e.toId), roles), ms = Date.parse(e.ts);
        // The task that agent had comes back; an agent with none gets the role's latest done task no agent is bound to.
        const recent = [...tasks.values()].filter((x) => x.task.state === "done" && x.task.project === project && ms - Date.parse(x.task.doneAt ?? "") <= RESUME_WINDOW_MS);
        const newest = (list: Entry[]) => list.sort((a, b) => -byTime("doneAt")(a, b))[0];
        // An agent that already owns a task never takes another one by role (it may still be running its own).
        const owns = [...tasks.values()].some((x) => x.agent === e.toId);
        const last = owns ? newest(recent.filter((x) => x.agent === e.toId)) : rr ? newest(recent.filter((x) => x.task.role === rr.id && !x.agent)) : undefined;
        if (last) { last.agent = e.toId; last.task.state = "active"; last.task.startedAt = e.ts; delete last.task.doneAt; delete last.task.modelOverride; }
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
      // The newest unbound task is the one just assigned; an older unbound one is a leftover and must not take this agent.
      const taken = e.agentId && [...tasks.values()].some((x) => x.agent === e.agentId && x.task.state === "active");
      const fresh = role && e.agentId && !taken ? mine(project, role.id, "active", true).pop() : undefined;
      if (fresh) { fresh.agent = e.agentId; fresh.seen = e.ts; }
    } else if (e.kind === "agent-stop") {
      const type = e.agentType && e.agentType !== "agent" ? e.agentType : e.agentId ? types.get(e.agentId) : undefined;
      const role = type ? roleFor(type, roles) : undefined;
      if (role) lastStop.set(`${project}\0${role.id}`, e.ts);
      // Its own task first; only with nothing bound to this agent at all, the oldest unbound one for the role.
      const own = e.agentId ? [...tasks.values()].filter((x) => x.agent === e.agentId) : [];
      const hit = own.find((x) => x.task.state === "active") ?? (role && !own.length ? oldest(project, role.id, "active", true) : undefined);
      if (hit) Object.assign(hit.task, { state: "done", doneAt: e.ts });
    } else if ((e.kind === "task-start" || e.kind === "task-done" || e.kind === "task-drop") && e.taskId) {
      const t = tasks.get(e.taskId)?.task;
      if (!t || t.state === "done" || t.state === "dropped") continue;
      if (e.kind === "task-start") { if (t.state === "queued") Object.assign(t, { state: "active", startedAt: e.ts }); }
      else if (e.kind === "task-done") Object.assign(t, { state: "done", doneAt: e.ts, ...(e.ref ? { ref: e.ref } : {}) });
      else t.state = "dropped";
    }
  }
  // Safety net, measured against `now` (default: the newest event in the log, so replays are stable).
  const ref = now ?? events.reduce((m, e) => Math.max(m, Date.parse(e.ts) || 0), 0);
  for (const x of tasks.values()) {
    // Last activity: the bound agent's latest event, or the start.
    const since = Math.max(Date.parse(x.task.startedAt ?? ""), x.agent && x.seen ? Date.parse(x.seen) : 0);
    if (x.task.state === "active" && since + STALE_AFTER_MS < ref)
      Object.assign(x.task, { state: "done", doneAt: new Date(since + STALE_AFTER_MS).toISOString(), stale: true });
  }
  return [...tasks.values()];
}

const RANK: Record<string, number> = { P0: 0, P1: 1, P2: 2 };

export function deriveTasks(events: BoardEvent[], roles: Map<string, Role> = loadRoles(), now?: number): TaskLists {
  const list = all(events, roles, now), pick = (s: TaskState) => list.filter((x) => x.task.state === s);
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
