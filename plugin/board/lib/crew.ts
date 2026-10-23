// Turns the event log into "who is working now" and maps agent types to the board's role ids,
// so the local page and the claude.ai export name agents the same way the board does.
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { AGENTS_DIR } from "./paths.ts";
import { ALIASES, ROSTER } from "./roster.ts";
import type { BoardEvent } from "./events.ts";

export interface Role { id: string; mascot: string; role: string }
export interface CrewMember { agentId: string; agentType: string; roleId?: string; mascot?: string; project?: string; status: "working" | "done"; startedAt?: string; finishedAt?: string; last: string }

// "Bob the Builder" -> "bob-the-builder", "Chip & Dale" -> "chip-and-dale": the agent file names.
export const slug = (s: string) => s.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// Keyed by role id, which is the agent file name.
export function loadRoles(): Map<string, Role> {
  return new Map(ROSTER.map((r) => [r.id, { id: r.id, mascot: r.mascot, role: r.title }]));
}

// Helper copies ("chhota-bheem-2"), plugin-scoped names ("toon-crew:tom") and retired names
// ("tom" counts for joe-gardner, "chhota-bheem" for mike-wazowski) all map to their current role.
export function roleFor(agentType: string | undefined, roles: Map<string, Role>): Role | undefined {
  if (!agentType) return roles.get("doraemon");
  const base = slug(agentType.split(":").pop() ?? agentType).replace(/-\d+$/, "");
  return roles.get(ALIASES[base] ?? base);
}

// agent id -> agent type, from any event that names both. Stops of resumed agents often carry no type of their own.
export function typesById(events: BoardEvent[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const e of events) if (e.agentId && e.agentType && e.agentType !== "agent") map.set(e.agentId, e.agentType);
  return map;
}

export function crewFrom(events: BoardEvent[], roles: Map<string, Role>): CrewMember[] {
  const byAgent = new Map<string, CrewMember>(), types = typesById(events);
  for (const raw of events) {
    // A message to an agent that is already known wakes it (Claude Code resumes it without a start hook).
    const e = raw.kind === "assign" && raw.toId && types.has(raw.toId) ? { ...raw, kind: "agent-start" as const, agentId: raw.toId, agentType: types.get(raw.toId) } : raw;
    if ((e.kind !== "agent-start" && e.kind !== "agent-stop") || !e.agentId) continue;
    const r = roleFor(e.agentType && e.agentType !== "agent" ? e.agentType : types.get(e.agentId) ?? e.agentType, roles);
    const m = byAgent.get(e.agentId) ?? { agentId: e.agentId, agentType: types.get(e.agentId) ?? e.agentType ?? "agent", roleId: r?.id, mascot: r?.mascot, status: "working" as const, last: "" };
    if (e.project) m.project = e.project;
    if (e.kind === "agent-start") { m.status = "working"; m.startedAt = e.ts; m.finishedAt = undefined; }
    else { m.status = "done"; m.finishedAt = e.ts; }
    m.last = e.text;
    byAgent.set(e.agentId, m);
  }
  // Working first, then the most recently finished.
  return [...byAgent.values()].sort((a, b) => (a.status === b.status ? (b.finishedAt ?? b.startedAt ?? "").localeCompare(a.finishedAt ?? a.startedAt ?? "") : a.status === "working" ? -1 : 1));
}

// The agent file is the single source of truth for model, effort, colour, turns and the "(v0.2, training)" tag.
export interface AgentInfo { model?: string; effort?: string; color?: string; maxTurns?: number; version?: string; stage?: string }
const MODELS = ["opus", "sonnet", "haiku", "fable"];
const modelWord = (s: unknown) => MODELS.find((m) => String(s ?? "").toLowerCase().includes(m));
const infoCache = new Map<string, { mtime: number; info: AgentInfo }>();   // by file, reparsed only when it changes

export function readAgentInfo(file: string): AgentInfo {
  try {
    const mtime = statSync(file).mtimeMs, hit = infoCache.get(file);
    if (hit && hit.mtime === mtime) return hit.info;
    const head = readFileSync(file, "utf8").split(/^---\s*$/m)[1] ?? "";
    const field = (k: string) => head.match(new RegExp(`^${k}:[ \t]*(.*)$`, "m"))?.[1].trim();
    const tag = field("description")?.match(/\((v\d[\w.]*)(?:,\s*([^)]+))?\)\s*$/);
    const turns = Number(field("maxTurns"));
    const info: AgentInfo = { model: modelWord(field("model")), effort: field("effort") || undefined, color: field("color") || undefined, maxTurns: turns > 0 ? turns : undefined, version: tag?.[1], stage: tag?.[2]?.trim() };
    infoCache.set(file, { mtime, info });
    return info;
  } catch { return {}; }
}

// Role cards for the Crew Room: just the fields the page draws, in desk order. A role with no agent file still gets a card.
export interface RoleCard extends AgentInfo { id: string; mascot: string; name: string; show: string; role: string; team: string; title: string; order: number }
export function listRoles(agentsDir = AGENTS_DIR): RoleCard[] {
  return ROSTER.map((r) => ({ ...(existsSync(join(agentsDir, `${r.id}.md`)) ? readAgentInfo(join(agentsDir, `${r.id}.md`)) : {}), ...r })).sort((a, b) => a.order - b.order);
}
