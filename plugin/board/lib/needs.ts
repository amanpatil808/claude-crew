// "Needs you": what the owner is the blocker for right now. Derived on each /api/state from the event log and
// the PR snapshots (nothing extra is stored), with an injected clock so every rule is testable.
import type { BoardEvent, Need } from "./events.ts";
import { roleFor, typesById, type Role } from "./crew.ts";
import type { Pr } from "./sources.ts";
import { getOwn } from "./records.ts";

export type NeedKind = Need | "pr";
export interface NeedItem {
  id: string; kind: NeedKind; text: string; since: string; project?: string;
  role?: string;      // the waiting role's id, when known
  ref?: string;       // pr: the PR's https URL
  number?: number;    // pr: the PR number (kept out of text)
  stale?: true;       // a wait with no clear for STALE_AFTER_MS: shown, but marked old
}

export const STALE_AFTER_MS = 30 * 60_000;
export const DROP_AFTER_MS = 2 * 3_600_000;
const MANAGER = "doraemon";

// Fixed phrases only: nothing from Claude Code's notification and no counts ever reach the text.
const WAITS: Readonly<Record<Need, string>> = {
  permission: "is waiting for your permission", input: "is waiting for your answer",
  idle: "is waiting for your reply", "agent-input": "is waiting for your input",
};
const isNeed = (v: unknown): v is Need => typeof v === "string" && Object.hasOwn(WAITS, v);

// One waiter is one (session, agent) pair; the main session has no agent id.
const waiter = (e: BoardEvent) => `${e.sid}\0${e.agentId ?? ""}`;

// A wait opens on a needs-you event and clears on the next event of the same waiter (the session moved on,
// so the owner answered), on that session's end, or after DROP_AFTER_MS. A newer wait of the same waiter
// replaces the older one: Claude Code shows one prompt at a time. Usage events never clear anything:
// they are written by the Stop hook, which also runs while a dialog is still open in another agent.
export function eventNeeds(events: BoardEvent[], roles: Map<string, Role>, now: number): NeedItem[] {
  const open = new Map<string, BoardEvent>(), types = typesById(events);
  for (const e of events) {
    if (!e.sid || e.kind === "usage") continue;
    if (e.kind === "needs-you") { if (isNeed(e.need)) open.set(waiter(e), e); continue; }
    for (const [key, w] of open) if (w.sid === e.sid && (e.kind === "session-end" || w.agentId === e.agentId)) open.delete(key);
  }
  const out: NeedItem[] = [];
  for (const e of open.values()) {
    const age = now - Date.parse(e.ts);
    if (!(age <= DROP_AFTER_MS) || !isNeed(e.need)) continue;
    const type = e.agentType && e.agentType !== "agent" ? e.agentType : e.agentId ? types.get(e.agentId) : undefined;
    // roleFor(undefined) is the manager, so only the main session (no agent id) is ever named as him.
    const role = e.agentId ? (type ? roleFor(type, roles) : undefined) : roles.get(MANAGER);
    const who = role ? (role.id === MANAGER ? "The manager" : role.mascot) : "A crew member";
    out.push({
      id: `n-${e.id}`, kind: e.need, text: `${who} ${WAITS[e.need]}`, since: e.ts,
      ...(e.project ? { project: e.project } : {}), ...(role ? { role: role.id } : {}), ...(age > STALE_AFTER_MS ? { stale: true as const } : {}),
    });
  }
  return out;
}

const PR_PATH = /^\/[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}\/pull\/([1-9]\d{0,9})$/;

// The page's link: exactly https://github.com/<owner>/<repo>/pull/<this PR's number>, else none. The URL is parsed,
// and must print back unchanged, so no port, credentials, query, hash, dot segments or escapes can ride along.
export function prRef(url: unknown, number: number): string | undefined {
  if (typeof url !== "string") return undefined;
  let u: URL;
  try { u = new URL(url); } catch { return undefined; }
  if (u.protocol !== "https:" || u.hostname !== "github.com" || u.port || u.username || u.password || u.search || u.hash || u.href !== url) return undefined;
  const m = PR_PATH.exec(u.pathname);
  return m && Number(m[1]) === number ? url : undefined;
}

// A PR waits on the owner when it is open, not a draft, its checks all passed and no reviewer asked for
// changes (then it waits on the crew). Only projects the owner approved for polling (board: true) count,
// so a snapshot left behind after polling was turned off shows nothing. Older snapshots have no checks: no item.
export function prNeeds(projects: { name: string; board?: boolean }[], snapshots: Record<string, { prs?: Partial<Pr>[] } | undefined>): NeedItem[] {
  const out: NeedItem[] = [];
  for (const p of projects) {
    if (p.board !== true) continue;
    for (const pr of getOwn(snapshots, p.name)?.prs ?? []) {
      if (pr.state !== "OPEN" || pr.draft !== false || pr.checks !== "pass" || pr.review === "CHANGES_REQUESTED") continue;
      if (typeof pr.number !== "number" || !Number.isSafeInteger(pr.number) || typeof pr.updatedAt !== "string") continue;
      const ref = prRef(pr.url, pr.number);
      out.push({
        id: `n-pr-${p.name}-${pr.number}`, kind: "pr", text: `PR ready for you: checks green${pr.review === "REVIEW_REQUIRED" ? ", review required" : ""}`,
        since: pr.updatedAt, project: p.name, number: pr.number, ...(ref ? { ref } : {}),
      });
    }
  }
  return out;
}

// Oldest first: the longest wait is the most urgent.
export function deriveNeeds(events: BoardEvent[], roles: Map<string, Role>, projects: { name: string; board?: boolean }[], snapshots: Record<string, { prs?: Partial<Pr>[] } | undefined>, now: number): NeedItem[] {
  return [...eventNeeds(events, roles, now), ...prNeeds(projects, snapshots)]
    .sort((a, b) => (Date.parse(a.since) || 0) - (Date.parse(b.since) || 0) || a.id.localeCompare(b.id));
}
