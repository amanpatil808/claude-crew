// One-command export for the claude.ai board: new events since the last export become `feed`
// docs in the board's shape ({ at, who, kind, text }), ready for ONE ArtifactData batch.
// Only new doc ids are written (op "set" without if_version), which the batch accepts unpinned.
//   node --no-warnings export.ts          write the next file and move the cursor
//   node --no-warnings export.ts --dry    print what would go, move nothing
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CURSOR_FILE, EXPORT_DIR } from "./lib/paths.ts";
import { readEvents, type BoardEvent } from "./lib/events.ts";
import { writePrivate } from "./lib/private-fs.ts";
import { redact } from "./lib/redact.ts";
import { loadRoles, roleFor, type Role } from "./lib/crew.ts";

const MAX_WRITES = 50;    // ArtifactData batch limit
// Turn ends and session start/end are local noise; the board feed gets work, code and ops events.
const FEED_KINDS = new Set(["agent-start", "agent-stop", "commit", "pr", "ci", "deploy"]);

export function toFeed(e: BoardEvent, roles: Map<string, Role>) {
  const role = e.kind === "ci" ? undefined : e.kind === "deploy" ? roles.get("sulley") : roleFor(e.agentType, roles);
  const kind = e.kind === "agent-start" ? "start" : e.kind === "agent-stop" ? "done" : (e.kind === "ci" || e.kind === "deploy") && e.ok === false ? "issue" : e.kind === "ci" || e.kind === "deploy" ? "done" : "progress";
  return { at: e.ts, who: role?.id ?? (e.kind === "ci" ? "CI" : e.agentType ?? "Crew"), kind, text: redact(e.text), ...(e.project ? { project: redact(e.project) } : {}), source: "auto-board" };
}

// Feed events after the cursor: after the last exported id, or, when the board's compaction removed that event,
// from the time its id carries ("e-<ms>-<hex>"). Events of that same millisecond go again: "set" by id is harmless.
export function pendingFeed(events: readonly BoardEvent[], lastId?: string): BoardEvent[] {
  let start = 0;
  if (lastId) {
    const i = events.findIndex((e) => e.id === lastId);
    const ms = Number(/^e-(\d{1,16})-/.exec(lastId)?.[1]);
    if (i >= 0) start = i + 1;
    else if (Number.isFinite(ms)) { const j = events.findIndex((e) => Date.parse(e.ts) >= ms); start = j < 0 ? events.length : j; }
  }
  return events.slice(start).filter((e) => FEED_KINDS.has(e.kind));
}

function main() {
  const dry = process.argv.includes("--dry");
  const cursor: { lastId?: string } = existsSync(CURSOR_FILE) ? JSON.parse(readFileSync(CURSOR_FILE, "utf8")) : {};
  const pending = pendingFeed(readEvents(), typeof cursor.lastId === "string" ? cursor.lastId : undefined);
  const batch = pending.slice(0, MAX_WRITES);
  if (!batch.length) { console.log("Nothing new since the last export."); return; }

  const roles = loadRoles();
  const out = {
    note: "Push with ONE ArtifactData call: action 'batch', url = the crew board, writes = this file's writes.",
    createdAt: new Date().toISOString(),
    writes: batch.map((e) => ({ op: "set", collection: "feed", doc_id: e.id, data: toFeed(e, roles) })),
  };
  const remaining = pending.length - batch.length;
  if (dry) { console.log(JSON.stringify(out, null, 1)); console.log(`(dry run: ${batch.length} writes, ${remaining} more after)`); return; }

  const file = join(EXPORT_DIR, `feed-${out.createdAt.replace(/[:.]/g, "-")}.json`);
  writePrivate(file, JSON.stringify(out, null, 1));
  // The cursor points at the last event this file covers, so a capped export continues where it stopped.
  const lastIncluded = batch[batch.length - 1].id;
  writePrivate(CURSOR_FILE, JSON.stringify({ lastId: lastIncluded, exportedAt: out.createdAt, file }));
  console.log(file);
  console.log(`${batch.length} feed writes${remaining ? `; ${remaining} more: run again after pushing this one` : ""}.`);
}

if (import.meta.main) main();
