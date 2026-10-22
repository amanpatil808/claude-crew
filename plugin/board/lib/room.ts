// Shapes the event log into the short, meaningful view the Crew Room shows: one line per person,
// only real outcomes in the feed, at most three facts on top. Noise is dropped here, not in the page.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { BoardEvent } from "./events.ts";
import { roleFor, typesById, type AgentInfo, type CrewMember, type Role } from "./crew.ts";

export interface RoomMember extends AgentInfo { id: string; project?: string; status: "working" | "done" | "idle"; line: string; ref?: string; since?: string; task?: string; lastHandback?: string; lastContactAt?: string; modelOverride?: string }
// What the hover card shows beyond the status line: the latest assignment and the latest hand-back summary per role.
export interface RoleNotes { task?: string; taskAt?: string; handback?: string; handbackAt?: string; contactAt?: string; modelOverride?: string }
// `say` is the short line a character speaks on the board; `from` is the speaker's role when it is not `role` itself.
export interface RoomFeedItem { id: string; ts: string; tone: "start" | "done" | "pr" | "deploy" | "bad" | "assign"; text: string; role?: string; from?: string; say?: string }
export interface RoomFact { label: string; value: string; tone?: "ok" | "bad" | "run" }

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);
// "tom finished: Ran all suites" -> "Ran all suites"; empty when the agent gave no summary.
const summary = (text: string) => { const i = text.indexOf(":"); return i < 0 ? "" : text.slice(i + 1).trim(); };
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

export function roomMembers(crew: CrewMember[], roleIds: string[], managerBusy = false, notes: Map<string, RoleNotes> = new Map(), cards: AgentInfo & { id: string }[] = [], managerAt?: string): RoomMember[] {
  // Doraemon has no start/stop of his own: he works while the main session is busy, and manages while any of the crew works
  const others = [...new Set(crew.filter((c) => c.status === "working" && c.roleId && c.roleId !== MANAGER && c.agentType !== "agent").map((c) => c.mascot ?? c.agentType))];
  return roleIds.map((id) => {
    const n = notes.get(id), c = cards.find((x) => x.id === id);
    const extra = { task: n?.task, lastHandback: n?.handback, lastContactAt: n?.contactAt, modelOverride: n?.modelOverride, model: c?.model, effort: c?.effort, color: c?.color, maxTurns: c?.maxTurns, version: c?.version, stage: c?.stage };
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
    if (e.kind === "assign") { const r = e.to ? roleFor(e.to, roles) : undefined; if (r) Object.assign(note(r.id), { task: clip(e.text, 70), taskAt: e.ts, contactAt: e.ts, modelOverride: e.model }); }
    else if (e.kind === "agent-start") { const r = roleFor(e.agentType && e.agentType !== "agent" ? e.agentType : undefined, roles); if (r && e.agentType && e.agentType !== "agent") note(r.id).contactAt = e.ts; }
    else if (e.kind === "agent-stop") {
      const type = e.agentType ?? (e.agentId ? types.get(e.agentId) : undefined), r = type ? roleFor(type, roles) : undefined;
      if (r && type !== "agent") Object.assign(note(r.id), { handback: clip(summary(e.text), 70), handbackAt: e.ts, task: undefined, modelOverride: undefined });
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
  const types = typesById(events);
  for (const e of events) {
    // A stop without its own type (resumed agents) takes the type from the agent's earlier start.
    const type = e.agentType && e.agentType !== "agent" ? e.agentType : e.agentId ? types.get(e.agentId) : undefined;
    const r = type ? roleFor(type, roles) : undefined, who = r?.mascot;
    if (e.kind === "assign") {
      const to = e.to ? roleFor(e.to, roles) : undefined, from = e.from ? roleFor(e.from, roles) : undefined;
      if (to && from) out.push({ id: e.id, ts: e.ts, tone: "assign", role: to.id, from: from.id, say: e.text, text: `${from.mascot} → ${to.mascot}: ${e.text}` });
    } else if (e.kind === "agent-start" && who && e.agentId && !started.has(e.agentId)) {
      started.add(e.agentId);
      out.push({ id: e.id, ts: e.ts, tone: "start", role: r?.id, text: `${who} started` });
    } else if (e.kind === "agent-stop" && who) {
      if (e.agentId) started.delete(e.agentId);
      const s = summary(e.text);
      out.push({ id: e.id, ts: e.ts, tone: "done", role: r?.id, say: s ? clip(s, 70) : "Done!", text: `${who} handed back${s ? ": " + clip(s, 70) : ""}` });
    } else if (e.kind === "pr") out.push({ id: e.id, ts: e.ts, tone: "pr", text: e.text });
    else if (e.kind === "deploy") out.push({ id: e.id, ts: e.ts, tone: e.ok === false ? "bad" : "deploy", text: clip(e.text.replace(/^Deploy ok ([^\s:]+).*/, "Deployed $1 ok"), 70) });
    else if (e.kind === "ci" && e.ok === false) out.push({ id: e.id, ts: e.ts, tone: "bad", text: clip(e.text, 70) });
  }
  return out.slice(-25).reverse();
}

function currentBranch(projectDir?: string): string {
  if (!projectDir) return "";
  try { return readFileSync(join(projectDir, ".git", "HEAD"), "utf8").trim().replace(/^ref: refs\/heads\//, ""); } catch { return ""; }
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
