// Builds the one JSON document /api/state serves, so it can be tested without a server.
import { readEvents, type BoardEvent } from "./events.ts";
import { crewFrom, listRoles, loadRoles } from "./crew.ts";
import { buildRooms, managerActive, managerProject, mainBusy, projectFacts, roomFacts, type RoomFact, roomFeed, roomMembers, roleNotes, roomTalks } from "./room.ts";
import { emptySnapshot, loadSnapshot, type Snapshot } from "./pollers.ts";
import { readRegistry, type Project } from "./projects.ts";
import { RETIRED } from "./roster.ts";
import { activeByProject, deriveTasks } from "./tasks.ts";

export interface ProjectSummary extends Project { working: number; polled: boolean }

// Registered projects first, then any project name that only appears in events (a hook that ran before the registry did).
export function projectList(events: BoardEvent[], registry: Project[], working: Map<string, number>): ProjectSummary[] {
  const known = new Set(registry.map((p) => p.name));
  const extra = [...new Set(events.map((e) => e.project).filter((n): n is string => !!n && !known.has(n)))].map((name) => ({ name, path: "" }));
  return [...registry, ...extra].map((p) => ({ ...p, working: working.get(p.name) ?? 0, polled: false }));
}

export function buildState(now = Date.now()) {
  const events = readEvents(), roleMap = loadRoles(), crew = crewFrom(events, roleMap), roles = listRoles();
  const registry = readRegistry();
  const tasks = deriveTasks(events, roleMap, now);   // the wall clock, so a quiet live board goes stale
  // "working" is the project's active tasks (an assign makes one, the agent's stop ends it).
  const projects = projectList(events, registry, activeByProject(tasks));
  // Focus: the project that produced the newest event (else the first registered one). Top-level ci/prs/commits/deploy
  // describe it; `snapshots` has every project's own.
  const focus = [...events].reverse().find((e) => e.project)?.project ?? registry[0]?.name;
  const snapshots: Record<string, Snapshot> = {};
  for (const p of registry) {
    const snap = loadSnapshot(p);
    snapshots[p.name] = snap;
    const row = projects.find((x) => x.name === p.name);
    if (row) row.polled = !!(snap.polledAt.github || snap.polledAt.box);
  }
  // Every registered project's own Live version and Branch, so the page can show the project it is looking at.
  const factsByProject: Record<string, RoomFact[]> = {};
  for (const p of registry) factsByProject[p.name] = projectFacts(snapshots[p.name]?.deploy, p.path);
  const snap = (focus && snapshots[focus]) || emptySnapshot();
  const focusPath = registry.find((p) => p.name === focus)?.path;
  const members = roomMembers(crew, roles.map((r) => r.id), mainBusy(events, now), roleNotes(events, roleMap), roles, managerProject(events));
  const room = {
    roles, retired: RETIRED, members,
    feed: roomFeed(events, roleMap), talks: roomTalks(events, roleMap, now),
    managerActive: managerActive(events, now), facts: roomFacts(members, snap.deploy, focusPath),
  };
  const rooms = buildRooms(events, registry, roleMap, roles, now);
  return { now: new Date(now).toISOString(), projects, focus: focus ?? null, crew, tasks, events: events.slice(-300).reverse(), room, rooms, factsByProject, snapshots, ...snap };
}

