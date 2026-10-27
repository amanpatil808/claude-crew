// Shapes the event log into the short, meaningful view the Crew Room shows: one line per person,
// only real outcomes in the feed, at most three facts on top. Noise is dropped here, not in the page.
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { agentIdOf, type BoardEvent } from "./events.ts";
import { safeTranscript, transcriptRoot } from "./usage.ts";
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

export function roomFeed(events: BoardEvent[], roles: Map<string, Role>, probe: Probe = transcriptLife): RoomFeedItem[] {
  const out: RoomFeedItem[] = [];
  const started = new Set<string>();   // repeated starts of the same agent say nothing new
  const running = new Map<string, Map<string, number>>();   // "project\0role" -> running agent id -> start time
  const types = typesById(events), seen = lifeTracker(probe);
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
      // A start while the same role already runs in this project is a clone (ghosts, see lifeTracker, do not count).
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
// The fallback when an agent's transcript cannot be found (see lifeTracker):
// an agent with a start, no stop and no sign of life for GHOST_MS is not running (its session was killed or closed).
// Signs of life are the agent's own events only (start, assign to it, stop, needs-you, usage, anything with its id).
// Its session's other events (turn end, commit, heartbeat) are not: a busy session would keep a stopped agent forever.
export const GHOST_MS = 45 * 60_000;
export function contactTracker() {
  const own = new Map<string, number>(), sidOf = new Map<string, string>();
  const last = (agentId: string) => own.get(agentId) ?? 0;
  return {
    see(e: BoardEvent) {
      const t = Date.parse(e.ts);
      if (!(t >= 0)) return;
      const who = e.agentId ?? e.toId;
      if (e.agentId && e.sid) sidOf.set(e.agentId, e.sid);
      if (who && !(last(who) >= t)) own.set(who, t);
    },
    last,
    own: last,
    sid: (agentId: string) => sidOf.get(agentId),
    ghost: (agentId: string, now: number) => now - last(agentId) > GHOST_MS,
  };
}

// ---- Liveness from the agent's own transcript ----
// An agent stopped by the user (interrupt, TaskStop) never fires SubagentStop, so its start stays "running".
// Claude Code writes every subagent to <root>/<project-slug>/<session uuid>/subagents/agent-<agentId>.jsonl
// (checked on CLI 2.1.310): the event's sid (the session uuid's first 8 characters) and agentId find it, so no
// path is ever stored in the log. Only the file's mtime is read (lstat), never its content.
// Nothing is written while a tool call runs (measured: a 200 s Bash left the mtime untouched), and a foreground
// Bash call may run up to 10 minutes, so ALIVE_MS is that limit plus 2 minutes for a long model reply.
export const ALIVE_MS = 12 * 60_000;
// The transcript is written async: a start younger than this may have no file yet.
export const MISSING_GRACE_MS = 2 * 60_000;
// One lstat per agent per poll: answers are reused this long.
export const PROBE_TTL_MS = 10_000;
// none: no usable locator (old event, unknown session, a symlink, a second name, outside the root, too many
// folders for one sid): GHOST_MS rules.
export type Life = { kind: "none" } | { kind: "missing" } | { kind: "seen"; mtime: number };
export type Probe = (agentId: string, sid: string | undefined) => Life;
const NONE: Life = { kind: "none" }, MISSING: Life = { kind: "missing" };
const SID = /^[0-9a-f]{8}$/;
const SESSION_DIR = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX_SESSIONS = 20_000, MAX_CACHED = 4_096;

// sid -> session folders, one pass over the root. Dirent types come from readdir without following links,
// so a symlinked project or session folder is never entered.
function scanSessions(root: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  let n = 0;
  try {
    for (const p of readdirSync(root, { withFileTypes: true })) {
      if (!p.isDirectory()) continue;
      let kids;
      try { kids = readdirSync(join(root, p.name), { withFileTypes: true }); } catch { continue; }
      for (const k of kids) {
        if (!k.isDirectory() || !SESSION_DIR.test(k.name)) continue;
        const sid = k.name.slice(0, 8), dirs = out.get(sid) ?? [];
        dirs.push(join(root, p.name, k.name)); out.set(sid, dirs);
        if (++n >= MAX_SESSIONS) return out;
      }
    }
  } catch { /* no root: every agent has no locator */ }
  return out;
}

// A missing file is "missing" only when nothing odd is on the path; a symlink, a second name or a path that
// leaves the root is no locator at all, so it can neither keep a ghost alive nor drop a live agent.
const absent = (e: unknown): Life => ((e as { code?: string }).code === "ENOENT" ? MISSING : NONE);
function fileLife(dir: string, agentId: string, root: string): Life {
  // The session and subagents folders must be real folders now, not only when indexed: a folder swapped for a
  // symlink (even one into the root) could borrow another session's file.
  for (const d of [dir, join(dir, "subagents")]) {
    try { if (!lstatSync(d).isDirectory()) return NONE; } catch (e) { return absent(e); }
  }
  const path = join(dir, "subagents", `agent-${agentId}.jsonl`);
  let st;
  try { st = lstatSync(path); } catch (e) { return absent(e); }
  if (!st.isFile() || st.nlink !== 1 || !safeTranscript(path, root)) return NONE;
  return { kind: "seen", mtime: st.mtimeMs };
}

// The same session uuid has a folder under every project slug its cwd took (worktrees, /private/tmp), so the sid
// prefix can name several folders. The agentId is unique: the folder holding its file is the one, and if several
// do, the newest write decides. With no file anywhere, one odd path (symlink, second name) means no locator.
const MAX_DIRS = 32;
function locate(dirs: string[], agentId: string, root: string): Life {
  if (!dirs.length || dirs.length > MAX_DIRS) return NONE;
  let best: { kind: "seen"; mtime: number } | undefined, odd = false;
  for (const d of dirs) {
    const l = fileLife(d, agentId, root);
    if (l.kind === "seen") { if (!best || l.mtime > best.mtime) best = l; }
    else if (l.kind === "none") odd = true;
  }
  return best ?? (odd ? NONE : MISSING);
}

export function transcriptProbe(opts: { root?: () => string; clock?: () => number; ttlMs?: number } = {}): Probe {
  const rootOf = opts.root ?? transcriptRoot, clock = opts.clock ?? Date.now, ttl = opts.ttlMs ?? PROBE_TTL_MS;
  const cache = new Map<string, { at: number; life: Life }>();
  let index: { at: number; root: string; dirs: Map<string, string[]> } | undefined;
  return (agentId, sid) => {
    if (!agentIdOf(agentId) || typeof sid !== "string" || !SID.test(sid)) return NONE;
    const now = clock(), root = rootOf(), key = `${root}\0${sid}\0${agentId}`, hit = cache.get(key);
    if (hit && now - hit.at < ttl) return hit.life;
    // Session folders never move, so the index is rebuilt only for a sid it does not know yet, at most once per ttl.
    if (!index || index.root !== root || (!index.dirs.has(sid) && now - index.at >= ttl)) index = { at: now, root, dirs: scanSessions(root) };
    let life = locate(index.dirs.get(sid) ?? [], agentId, root);
    // A known session can gain a folder under a new slug later (a new worktree cwd): rescan before calling it missing.
    if (life.kind === "missing" && now - index.at >= ttl) {
      index = { at: now, root, dirs: scanSessions(root) };
      life = locate(index.dirs.get(sid) ?? [], agentId, root);
    }
    if (cache.size >= MAX_CACHED) cache.clear();
    cache.set(key, { at: now, life });
    return life;
  };
}
// Shared by the feed and every room, so one poll stats each agent once.
const transcriptLife = transcriptProbe();

// The decision, pure given the probe: an agent with a transcript is alive while it wrote in the last ALIVE_MS
// (or had its own event then); a missing file after MISSING_GRACE_MS is gone; no locator falls back to GHOST_MS.
// An open needs-you of the agent (a permission dialog writes nothing) keeps it for GHOST_MS, as before.
export function lifeTracker(probe: Probe) {
  const contact = contactTracker(), waits = new Map<string, number>();
  const life = (agentId: string) => probe(agentId, contact.sid(agentId));
  return {
    see(e: BoardEvent) {
      contact.see(e);
      const t = Date.parse(e.ts);
      if (e.agentId && t >= 0) { if (e.kind === "needs-you") waits.set(e.agentId, t); else waits.delete(e.agentId); }
    },
    // The time of the agent's last sign of life, for "Lost contact" against a later hand-back.
    last(agentId: string): number {
      const l = life(agentId);
      return l.kind === "seen" ? Math.max(l.mtime, contact.own(agentId)) : l.kind === "missing" ? contact.own(agentId) : contact.last(agentId);
    },
    ghost(agentId: string, now: number): boolean {
      const l = life(agentId);
      if (l.kind === "none") return contact.ghost(agentId, now);
      const wait = waits.get(agentId);
      if (wait !== undefined && now - wait <= GHOST_MS) return false;
      if (l.kind === "missing") return now - contact.own(agentId) > MISSING_GRACE_MS;
      return now - Math.max(l.mtime, contact.own(agentId)) > ALIVE_MS;
    },
  };
}

// crew.running counts crew agents (copies included, the manager's main session excluded); cap is the heavy-load wave width (6-8) and light the light-load width (2-4) in Doraemon's wave rule.
export interface CrewLoad { running: number; cap: number; light: number; roles: number }
export interface ProjectRoom { members: RoomMember[]; managerBusy: boolean; managerActive: boolean; crew: CrewLoad }
export const CREW_CAP = 8;
export const CREW_LIGHT = 4;
// Same horizon as tasks.ts STALE_AFTER_MS: a ghost shows "Lost contact" this long, then plain idle.
export const STALE_AGENT_MS = 6 * 3_600_000;
export const ROOM_WINDOW_MS = 7 * 24 * 3_600_000;

export function roomFor(project: string, events: BoardEvent[], roles: Map<string, Role>, cards: RoleCard[], now = Date.now(), probe: Probe = transcriptLife): ProjectRoom {
  const mine = events.filter((e) => e.project === project), busy = mainBusy(mine, now);
  const active = deriveTasks(mine, roles, now).active;   // tasks are the source of truth for "working"
  const seen = lifeTracker(probe);
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
    // "Lost contact" only when no copy lives and the role's newest news is the ghost: a hand-back after it still shows done.
    const lostAt = Math.max(0, ...lost.map((c) => seen.last(c.agentId)));
    const doneAt = Math.max(0, ...all.filter((c) => c.roleId === m.id && c.status === "done").map((c) => Date.parse(c.finishedAt ?? "") || 0));
    const recent = now - lostAt <= STALE_AGENT_MS;
    const gone = !ids.length && lost.length && m.status !== "working" && lostAt >= doneAt ? { status: "idle" as const, line: recent ? "Lost contact" : "Idle", ...(recent ? { stale: true as const } : {}), since: undefined } : {};
    const out: RoomMember = { ...m, project, copies: ids.length, ...(ids.length ? { copyIds: ids } : {}), ...(t && m.status !== "working" ? { status: "working" as const, line: t.text, since: t.startedAt, ref: t.ref ?? m.ref } : {}), ...gone };
    // Copies are live running agents only: a desk that is not working never draws a twin.
    return out.status === "working" ? out : { ...out, copies: 0, copyIds: [] };
  });
  return { members, managerBusy: busy, managerActive: managerActive(mine, now), crew: { running: live.length, cap: CREW_CAP, light: CREW_LIGHT, roles: new Set(live.map((c) => c.roleId)).size } };
}

// A room for every registered project and every project with an event in the last 7 days.
export function buildRooms(events: BoardEvent[], registry: { name: string }[], roles: Map<string, Role>, cards: RoleCard[], now = Date.now(), probe: Probe = transcriptLife): Record<string, ProjectRoom> {
  const names = new Set(registry.map((p) => p.name));
  for (const e of events) if (e.project && now - Date.parse(e.ts) <= ROOM_WINDOW_MS) names.add(e.project);
  return Object.fromEntries([...names].map((n) => [n, roomFor(n, events, roles, cards, now, probe)]));
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
