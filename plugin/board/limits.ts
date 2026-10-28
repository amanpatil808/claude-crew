// Claude Code hook entry (Stop, SubagentStop, SessionEnd; async): copies the plan's newest rate-limit reading, which
// the toon-crew mod (plugin/hooks/plan-mod.mjs) left in the TOON_CREW_LIMITS environment variable, into limits.json in
// the plugin's data folder. The mod cannot learn that folder; this hook gets it as CLAUDE_PLUGIN_DATA.
// It reads nothing else: not stdin, not the transcript, no other variable. It always exits 0 and prints nothing.
import { readFileSync, renameSync, writeFileSync, chmodSync } from "node:fs";
import { dirname } from "node:path";
import { limitsReading, LIMITS_ENV, LIMITS_FILE, type LimitsReading } from "./lib/events.ts";
import { ensureDir } from "./lib/private-fs.ts";

const current = (file: string): LimitsReading | null => {
  try { return limitsReading(JSON.parse(readFileSync(file, "utf8"))); } catch { return null; }
};

// Writes the reading in `raw` when it passes the allow-list and is newer than the file's. Only the checked reading
// is written, never `raw` itself. True when the file changed.
export function saveLimits(raw: unknown, file = LIMITS_FILE): boolean {
  if (typeof raw !== "string" || !raw || raw.length > 4096) return false;
  let reading: LimitsReading | null;
  try { reading = limitsReading(JSON.parse(raw)); } catch { return false; }
  if (!reading) return false;
  const before = current(file);
  // Several sessions write here: an older reading never replaces a newer one, and an equal one is not rewritten.
  if (before && (before.at > reading.at || JSON.stringify(before) === JSON.stringify(reading))) return false;
  ensureDir(dirname(file));
  // A temp file and a rename, so the board never reads a half-written file. Owner-only, like the event log.
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(reading) + "\n", { mode: 0o600 });
  chmodSync(tmp, 0o600);
  renameSync(tmp, file);
  return true;
}

if (import.meta.main) {
  try { saveLimits(process.env[LIMITS_ENV]); } catch { /* never fail the session over a reading */ }
  process.exit(0);
}
