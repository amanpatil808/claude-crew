// The JSONL event log: one line per event, appended with a single write so concurrent hooks
// (several subagents finishing at once) never interleave half-lines.
import { existsSync, readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { EVENTS_FILE } from "./paths.ts";
import { appendPrivate } from "./private-fs.ts";
import { redactDeep } from "./redact.ts";

export type EventKind = "agent-start" | "agent-stop" | "commit" | "pr" | "turn-end" | "session-start" | "session-end" | "ci" | "deploy" | "main-busy" | "assign";

export interface BoardEvent {
  id: string;          // also the board's feed doc_id, so it uses only doc_id-safe characters
  ts: string;          // UTC ISO, taken when the hook or poller fires
  kind: EventKind;
  text: string;        // one human line, already redacted
  project?: string;    // project name (registry or folder name) the event came from
  sid?: string;        // first 8 chars of the session id: enough to tell sessions apart (not "session": redaction masks that key)
  agentId?: string;
  agentType?: string;
  from?: string;       // assign: who gave the work ("doraemon" for the main session)
  to?: string;         // assign: the agent type receiving it
  toId?: string;       // assign via SendMessage: the receiving agent id, so a resumed agent counts as working again
  model?: string;      // assign: the Agent tool's model override for this run, when it gave one
  ref?: string;        // commit SHA, PR URL, CI run id or deploy version, for dedupe and links
  ok?: boolean;        // CI/deploy outcome
}

export function newId(at: Date): string {
  return `e-${at.getTime()}-${randomBytes(3).toString("hex")}`;
}

export function appendEvent(e: Omit<BoardEvent, "id" | "ts">, at = new Date()): BoardEvent {
  // id and ts are ours and skip redaction (a 13-digit id could pass for a card number).
  const event: BoardEvent = { ...redactDeep(e), id: newId(at), ts: at.toISOString() };
  appendPrivate(EVENTS_FILE, JSON.stringify(event) + "\n");
  return event;
}

// Skips a torn or hand-edited line instead of failing the whole page.
export function readEvents(file = EVENTS_FILE): BoardEvent[] {
  if (!existsSync(file)) return [];
  const out: BoardEvent[] = [];
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch { /* ignore a broken line */ }
  }
  return out;
}
