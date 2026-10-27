// Shapes the event log into the short, meaningful view the Crew Room shows: one line per person,
// only real outcomes in the feed, at most three facts on top. Noise is dropped here, not in the page.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { BoardEvent } from "./events.ts";
import { isOverride } from "./model.ts";
import { crewFrom, roleFor, typesById, type AgentInfo, type CrewMember, type Role, type RoleCard } from "./crew.ts";
import { deriveTasks } from "./tasks.ts";

export interface RoomMember extends AgentInfo { id: string; project?: string; status: "working" | "done" | "idle"; copies?: number; copyIds?: string[]; stale?: true; line: string; ref?: string; since?: string; task?: string; lastHandback?: string; lastContactAt?: string; modelOverride?: string; ranOn?: string; fileModel?: string }
// What the hover card shows beyond the status line: the latest assignment and the latest hand-back summary per role.
export interface RoleNotes { task?: string; taskAt?: string; handback?: string; handbackAt?: string; contactAt?: string; asked?: string; declaredModel?: string; effectiveModel?: string }
// `say` is the short line a character speaks on the board; `from` is the speaker's role when it is not `role` itself.
export interface RoomFeedItem { id: string; ts: string; project?: string; tone: "start" | "done" | "pr" | "deploy" | "bad" | "assign" | "clone"; text: string; role?: string; from?: string; say?: string;
  // Only on a clone moment: another copy of a role that already runs in the project (n = copies after this start).
  kind?: "clone"; n?: number; agentId?: string }
export interface RoomFact { label: string; value: string; tone?: "ok" | "bad" | "run" }

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);
// "toon-crew:tom finished: Ran all suites" -> "Ran all suites"; empty when the agent gave no summary.
// Cut at "finished:", not the first colon: namespaced agent types ("toon-crew:tom") carry a colon too.
const summary = (text: string) => text.match(/\bfinished:\s*(.*)$/s)?.[1].trim() ?? "";
const refIn = (text: string) => text.match(/\b(?:feat|fix|chore|docs)\/[\w./-]+/)?.[0] ?? text.match(/(?:PR |#)(\d+)/)?.[0];
// The main session is the manager's own chatter, and generic helpers say nothing about who did what.
const isNoise = (e: BoardEvent) => e.agentType === "agent" || !e.agentType;
const MANAGER = "doraemon";

// The manager (the main session) is busy from a heartbeat until his turn ends, for at most 10 minutes without one.
export function mainBusy(events: BoardEvent[], now = Date.now()): boolean {
  let busy = "", end = "";
  for (const e of events) { if (e.kind === "main-busy") busy = e.ts; else if (e.kind === "turn-end" && !e.agentId) end = e.ts; }
  return busy > end && now - Date.parse(busy) < 10 * 60_000;
}

// What the desk chip shows: the model it ran on, and the per-call model only when it differs from the agent file's.
// Events from before these fields existed fall back to the call's model, then the file's.
function modelFacts(n: RoleNotes | undefined, fileModel?: string): { ranOn?: string; modelOverride?: string; fileModel?: string } {
  const declared = n?.declaredModel ?? fileModel;
  return { ranOn: n?.effectiveModel ?? n?.asked ?? fileModel, ...(isOverride(n?.asked, declared) ? { modelOverride: n?.asked, fileModel: declared } : {}) };
}

export function roomMembers(crew: CrewMember[], roleIds: string[], managerBusy = false, notes: Map<string, RoleNotes> = new Map(), cards: (AgentInfo & { id: string; team?: string; title?: string })[] = [], managerAt?: string): RoomMember[] {
  // Doraemon has no start/stop of his own: he works while the main session is busy, and manages while any of the crew works
  const others = [...new Set(crew.filter((c) => c.status === "working" && c.roleId && c.roleId !== MANAGER && c.agentType !== "agent").map((c) => c.mascot ?? c.agentType))];
  return roleIds.map((id) => {
    const n = notes.get(id), c = cards.find((x) => x.id === id);
    const extra = { team: c?.team, title: c?.title, task: n?.task, lastHandback: n?.handback, lastContactAt: n?.contactAt, ...modelFacts(n, c?.model), model: c?.model, effort: c?.effort, color: c?.color, maxTurns: c?.maxTurns, version: c?.version, stage: c?.stage };
    if (id === MANAGER && (managerBusy || others.length)) return { id, status: "working" as const, line: managerBusy ? "Working now" : clip("Managing " + others.join(", "), 80), project: managerBusy ? managerAt : crew.find((c) => c.status === "working" && c.roleId !== MANAGER)?.project, ...extra };
    const mine = crew.filter((c) => c.roleId === id && c.agentType !== "agent");
    const busy = mine.find((c) => c.status === "working");
    const m = busy ?? mine[0];
    if (!m) return { id, status: "idle" as const, line: "Idle", ...extra };
    if (busy) return { id, status: "working" as const, line: n?.task ?? "Working now", ref: refIn(m.last), since: m.startedAt, project: m.project, ...extra };
    return { id, status: "done" as const, line: clip(summary(m.last) || "Handed back", 80), ref: refIn(m.last), since: m.finishedAt, ...extra };
  });
}

export function roleNotes(events: BoardEvent[], roles: Map<string, Role>): Map<string, RoleNotes> {
  const out = new Map<string, RoleNotes>(), types = typesById(events);
  const note = (id: string) => out.get(id) ?? out.set(id, {}).get(id)!;
  for (const e of events) {
    if (e.kind === "assign") { const r = e.to ? roleFor(e.to, roles) : undefined; if (r) Object.assign(note(r.id), { task: clip(e.text, 70), taskAt: e.ts, contactAt: e.ts, asked: e.model, declaredModel: e.declaredModel, effectiveModel: e.effectiveModel }); }
    else if (e.kind === "agent-start") { const r = roleFor(e.agentType && e.agentType !== "agent" ? e.agentType : undefined, roles); if (r && e.agentType && e.agentType !== "agent") note(r.id).contactAt = e.ts; }
    else if (e.kind === "agent-stop") {
      const type = e.agentType ?? (e.agentId ? types.get(e.agentId) : undefined), r = type ? roleFor(type, roles) : undefined;
      if (r && type !== "agent") Object.assign(note(r.id), { handback: clip(summary(e.text), 70), handbackAt: e.ts, task: undefined, asked: undefined, declaredModel: undefined, effectiveModel: undefined });
    }
  }
  return out;
}

// The project of the manager's latest heartbeat: where Doraemon is working right now.
export function managerProject(events: BoardEvent[]): string | undefined {
  for (let i = events.length - 1; i >= 0; i--) if (events[i].kind === "main-busy") return events[i].project;
  return undefined;
}

// The manager session is active while his once-a-minute heartbeat is under 3 minutes old.
export function managerActive(events: BoardEvent[], now = Date.now()): boolean {
  for (let i = events.length - 1; i >= 0; i--) if (events[i].kind === "main-busy") return now - Date.parse(events[i].ts) < 3 * 60_000;
  return false;
}

// Recent conversations for the board's speech bubbles: manager-to-crew assignments, newest last, last 10 minutes only.
export interface RoomTalk { id: string; ts: string; from: string; to: string; text: string }
export function roomTalks(events: BoardEvent[], roles: Map<string, Role>, now = Date.now()): RoomTalk[] {
  const out: RoomTalk[] = [];
  for (const e of events) {
    if (e.kind !== "assign" || !e.to || !e.from || now - Date.parse(e.ts) > 10 * 60_000) continue;
    const to = roleFor(e.to, roles), from = roleFor(e.from, roles);
    if (to && from) out.push({ id: e.id, ts: e.ts, from: from.id, to: to.id, text: e.text });
  }
  return out.slice(-10);
}

export function roomFeed(events: BoardEvent[], roles: Map<string, Role>): RoomFeedItem[] {
  const out: RoomFeedItem[] = [];
  const started = new Set<string>();   // repeated starts of the same agent say nothing new
  const running = new Map<string, Map<string, number>>();   // "project\0role" -> running agent id -> start time
  const types = typesById(events), seen = contactTracker();
  const push = (e: BoardEvent, item: Omit<RoomFeedItem, "id" | "ts" | "project">) => out.push({ id: e.id, ts: e.ts, ...(e.project ? { project: e.project } : {}), ...item });
  for (const e of events) {
    seen.see(e);
    // A stop without its own type (resumed agents) takes the type from the agent's earlier start.
    const type = e.agentType && e.agentType !== "agent" ? e.agentType : e.agentId ? types.get(e.agentId) : undefined;
    const r = type ? roleFor(type, roles) : undefined, who = r?.mascot;
    if (e.kind === "assign") {
      const to = e.to ? roleFor(e.to, roles) : undefined, from = e.from ? roleFor(e.from, roles) : undefined;
      if (to && from) push(e, { tone: "assign", role: to.id, from: from.id, say: e.text, text: `${from.mascot} → ${to.mascot}: ${e.text}` });
    } else if (e.kind === "agent-start" && who && e.agentId && !started.has(e.agentId)) {
      started.add(e.agentId);
      push(e, { tone: "start", role: r?.id, text: `${who} started` });
      // A start while the same role already runs in this project is a clone (ghosts, see GHOST_MS, do not count).
      const key = `${e.project ?? ""}\u0000${r?.id}`, live = [...(running.get(key) ?? new Map<string, number>())].filter(([id]) => id !== e.agentId && !seen.ghost(id, Date.parse(e.ts)));
      const next = new Map(live); next.set(e.agentId, Date.parse(e.ts)); running.set(key, next);
      if (live.length >= 1) push({ ...e, id: e.id + "-clone" }, { tone: "clone", kind: "clone", role: r?.id, n: next.size, agentId: e.agentId, text: `${who} cloned (${next.size} copies)` });
    } else if (e.kind === "agent-stop" && who) {
      if (e.agentId) { started.delete(e.agentId); for (const m of running.values()) m.delete(e.agentId); }
      const s = summary(e.text);
      push(e, { tone: "done", role: r?.id, say: s ? clip(s, 70) : "Done!", text: `${who} handed back${s ? ": " + clip(s, 70) : ""}` });
    } else if (e.kind === "pr") push(e, { tone: "pr", text: e.text });
    else if (e.kind === "deploy") push(e, { tone: e.ok === false ? "bad" : "deploy", text: clip(e.text.replace(/^Deploy ok ([^\s:]+).*/, "Deployed $1 ok"), 70) });
    else if (e.kind === "ci" && e.ok === false) push(e, { tone: "bad", text: clip(e.text, 70) });
  }
  return out.slice(-25).reverse();
}

// One project's own crew: the same members/notes logic, fed with that project's events only.
// An agent with a start, no stop and no sign of life for GHOST_MS is not running (its session was killed or closed).
// Signs of life: its own events (start, assign to it, stop, needs-you, usage) and its session's non-agent events
// (commit, PR, turn end...), but not the manager's heartbeat and usage, which tick on while a dead agent lingers.
export const GHOST_MS = 45 * 60_000;
export function contactTracker() {
  const own = new Map<string, number>(), sess = new Map<string, number>(), sidOf = new Map<string, string>();
  const bump = (m: Map<string, number>, k: string, t: number) => { if (!((m.get(k) ?? 0) >= t)) m.set(k, t); };
  const last = (agentId: string) => Math.max(own.get(agentId) ?? 0, sess.get(sidOf.get(agentId) ?? "") ?? 0);
  return {
    see(e: BoardEvent) {
      const t = Date.parse(e.ts);
      if (!(t >= 0)) return;
      const who = e.agentId ?? e.toId;
      if (e.agentId && e.sid) sidOf.set(e.agentId, e.sid);
      if (who) bump(own, who, t);
      else if (e.sid && e.kind !== "main-busy" && e.kind !== "usage") bump(sess, e.sid, t);
    },
    last,
    ghost: (agentId: string, now: number) => now - last(agentId) > GHOST_MS,
  };
}

// crew.running counts crew agents (copies included, the manager's main session excluded); cap is Doraemon's "waves 2-4 wide".
export interface CrewLoad { running: number; cap: number; roles: number }
export interface ProjectRoom { members: RoomMember[]; managerBusy: boolean; managerActive: boolean; crew: CrewLoad }
export const CREW_CAP = 4;
// Same horizon as tasks.ts STALE_AFTER_MS: a ghost shows "Lost contact" this long, then plain idle.
export const STALE_AGENT_MS = 6 * 3_600_000;
export const ROOM_WINDOW_MS = 7 * 24 * 3_600_000;

export function roomFor(project: string, events: BoardEvent[], roles: Map<string, Role>, cards: RoleCard[], now = Date.now()): ProjectRoom {
  const mine = events.filter((e) => e.project === project), busy = mainBusy(mine, now);
  const active = deriveTasks(mine, roles, now).active;   // tasks are the source of truth for "working"
  const seen = contactTracker();
  for (const e of mine) seen.see(e);
  const everyone = crewFrom(mine, roles);
  const working = everyone.filter((c) => c.status === "working" && c.roleId && c.roleId !== MANAGER && c.agentType !== "agent");
  const ghosts = working.filter((c) => seen.ghost(c.agentId, now));
  // Ghosts are left out of the crew entirely: not working, not counted, no clones.
  const all = everyone.filter((c) => !ghosts.includes(c));
  const live = working.filter((c) => !ghosts.includes(c)).sort((a, b) => (a.startedAt ?? "").localeCompare(b.startedAt ?? ""));
  const members = roomMembers(all, cards.map((r) => r.id), busy, roleNotes(mine, roles), cards, project).map((m) => {
    const ids = live.filter((c) => c.roleId === m.id).map((c) => c.agentId), lost = ghosts.filter((c) => c.roleId === m.id);
    // A role with a ghost keeps no task-based "working" either; its task stays active until tasks.ts's own stale rule.
    const t = lost.length ? undefined : active.find((x) => x.role === m.id);
    const recent = now - Math.max(0, ...lost.map((c) => seen.last(c.agentId))) <= STALE_AGENT_MS;
    const gone = !ids.length && lost.length && m.status !== "working" ? { status: "idle" as const, line: recent ? "Lost contact" : "Idle", ...(recent ? { stale: true as const } : {}), since: undefined } : {};
    return { ...m, project, copies: ids.length, ...(ids.length ? { copyIds: ids } : {}), ...(t && m.status !== "working" ? { status: "working" as const, line: t.text, since: t.startedAt, ref: t.ref ?? m.ref } : {}), ...gone };
  });
  return { members, managerBusy: busy, managerActive: managerActive(mine, now), crew: { running: live.length, cap: CREW_CAP, roles: new Set(live.map((c) => c.roleId)).size } };
}

// A room for every registered project and every project with an event in the last 7 days.
export function buildRooms(events: BoardEvent[], registry: { name: string }[], roles: Map<string, Role>, cards: RoleCard[], now = Date.now()): Record<string, ProjectRoom> {
  const names = new Set(registry.map((p) => p.name));
  for (const e of events) if (e.project && now - Date.parse(e.ts) <= ROOM_WINDOW_MS) names.add(e.project);
  return Object.fromEntries([...names].map((n) => [n, roomFor(n, events, roles, cards, now)]));
}

function currentBranch(projectDir?: string): string {
  if (!projectDir) return "";
  try { return readFileSync(join(projectDir, ".git", "HEAD"), "utf8").trim().replace(/^ref: refs\/heads\//, ""); } catch { return ""; }
}

// One project's Live version and Branch, from its own deploy snapshot and path (no "Working": that needs the focus).
export function projectFacts(deploy?: { status?: string; version?: string } | null, projectDir?: string): RoomFact[] {
  const facts: RoomFact[] = [];
  if (deploy?.version) facts.push({ label: "Live", value: deploy.version, tone: deploy.status === "ok" ? "ok" : "bad" });
  const b = currentBranch(projectDir);
  if (b) facts.push({ label: "Branch", value: b });
  return facts;
}

// Facts are about the project in focus: its live version and its checked-out branch.
export function roomFacts(members: RoomMember[], deploy?: { status?: string; version?: string } | null, projectDir?: string): RoomFact[] {
  const facts: RoomFact[] = [];
  if (deploy?.version) facts.push({ label: "Live", value: deploy.version, tone: deploy.status === "ok" ? "ok" : "bad" });
  facts.push({ label: "Working", value: String(members.filter((m) => m.status === "working").length), tone: "run" });
  const b = currentBranch(projectDir);
  if (b) facts.push({ label: "Branch", value: b });
  return facts;
}
