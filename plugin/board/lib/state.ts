// Builds the one JSON document /api/state serves, so it can be tested without a server.
import { QUIET_KINDS, readEvents, type BoardEvent } from "./events.ts";
import { crewFrom, listRoles, loadRoles, type Role } from "./crew.ts";
import { buildRooms, managerActive, managerProject, mainBusy, projectFacts, roomFacts, type RoomFact, roomFeed, roomMembers, roleNotes, roomTalks } from "./room.ts";
import { emptySnapshot, loadSnapshot, type Snapshot } from "./pollers.ts";
import { readRegistry, type Project } from "./projects.ts";
import { RETIRED } from "./roster.ts";
import { activeByProject, costTaskOf, deriveTasks } from "./tasks.ts";
import { deriveNeeds } from "./needs.ts";
import { getOwn, putOwn } from "./records.ts";
// Types only (erased at run time), so these lines never make cost.ts or plan.ts required.
import type { CostOptions, CostState } from "./cost.ts";
import type { PlanOptions, PlanState } from "./plan.ts";

// lib/cost.ts buildCost(events, now, opts): the cost ledger. Optional, so the board works without it.
// `taskOf` maps an agent id to the one task its usage counts toward (see costTaskOf: only tasks still shown).
export type BuildCost = (events: readonly BoardEvent[], now: number, opts?: CostOptions) => CostState;

export async function loadBuildCost(): Promise<BuildCost | null> {
  try {
    const m: Record<string, unknown> = await import("./cost.ts");
    const fn = m.buildCost;
    return typeof fn === "function" ? (events, now, opts) => fn(events, now, opts) : null;
  } catch { return null; }
}
// Loaded once with the module (cost.ts must not import this file, or this await never settles).
const buildCost = await loadBuildCost();

// `cost` is null until lib/cost.ts exists; a throwing ledger gives null too, never a dead /api/state.
export function costOf(events: BoardEvent[], roles: Map<string, Role>, now: number, fn: BuildCost | null = buildCost): CostState | null {
  if (!fn) return null;
  try { return fn(events, now, { roles, taskOf: costTaskOf(events, roles, now) }) ?? null; } catch { return null; }
}

// lib/plan.ts buildPlan(events, now, opts): the plan panel. Optional in the same way (it must not import this file).
export type BuildPlan = (events: readonly BoardEvent[], now: number, opts?: PlanOptions) => PlanState;

// `from` is for tests only (a module that throws on import, or exports no function); the board passes nothing.
export async function loadBuildPlan(from = "./plan.ts"): Promise<BuildPlan | null> {
  try {
    const m: Record<string, unknown> = await import(from);
    const fn = m.buildPlan;
    return typeof fn === "function" ? (events, now, opts) => fn(events, now, opts) : null;
  } catch { return null; }
}
const buildPlan = await loadBuildPlan();

// `plan` is null until lib/plan.ts exists, or when it throws: the page then shows the dollar ledger.
export function planOf(events: BoardEvent[], roles: Map<string, Role>, now: number, fn: BuildPlan | null = buildPlan): PlanState | null {
  if (!fn) return null;
  try { return fn(events, now, { roles }) ?? null; } catch { return null; }
}

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
  // Keyed by project name, which is any folder's name: putOwn / getOwn, so "__proto__" is an ordinary key.
  const snapshots: Record<string, Snapshot> = {};
  for (const p of registry) {
    const snap = loadSnapshot(p);
    putOwn(snapshots, p.name, snap);
    const row = projects.find((x) => x.name === p.name);
    if (row) row.polled = !!(snap.polledAt.github || snap.polledAt.box);
  }
  // Every registered project's own Live version and Branch, so the page can show the project it is looking at.
  const factsByProject: Record<string, RoomFact[]> = {};
  for (const p of registry) putOwn(factsByProject, p.name, projectFacts(getOwn(snapshots, p.name)?.deploy, p.path));
  const snap = (focus && getOwn(snapshots, focus)) || emptySnapshot();
  const focusPath = registry.find((p) => p.name === focus)?.path;
  const members = roomMembers(crew, roles.map((r) => r.id), mainBusy(events, now), roleNotes(events, roleMap), roles, managerProject(events));
  const room = {
    roles, retired: RETIRED, members,
    feed: roomFeed(events, roleMap), talks: roomTalks(events, roleMap, now),
    managerActive: managerActive(events, now), facts: roomFacts(members, snap.deploy, focusPath),
  };
  const rooms = buildRooms(events, registry, roleMap, roles, now);
  const needsYou = deriveNeeds(events, roleMap, registry, snapshots, now);
  const cost = costOf(events, roleMap, now);
  const plan = planOf(events, roleMap, now);
  // usage and needs-you are bookkeeping: they must not push real history out of the last 300.
  const history = events.filter((e) => !QUIET_KINDS.has(e.kind)).slice(-300).reverse();
  return { now: new Date(now).toISOString(), projects, focus: focus ?? null, crew, tasks, events: history, room, rooms, factsByProject, snapshots, needsYou, cost, plan, ...snap };
}

