// Every file location in one place, each overridable by env so tests can point at a temp folder
// and the real log is never touched by them.
import { isAbsolute, join, resolve } from "node:path";

// This file lives in <plugin>/board/lib, so the plugin root is two levels up (also the fallback outside a plugin).
const BOARD_DIR = resolve(import.meta.dirname, "..");

export const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || resolve(BOARD_DIR, "..");

// Log and state live only in the plugin's data folder (BOARD_LOG_DIR when a developer names one), never in the repo
// and never in a folder the plugin picks itself. Claude Code sets CLAUDE_PLUGIN_DATA for every plugin hook, and
// board.sh refuses to run without it. With no absolute folder, every path below sits under /dev/null, a device file:
// each read and write fails (ENOTDIR, for root too) and the callers' own error handling turns that into "nothing".
export const NO_DATA_DIR = "/dev/null/toon-crew-no-data-folder";
export function dataDirOf(env: Record<string, string | undefined>): string | undefined {
  const d = env.BOARD_LOG_DIR || env.CLAUDE_PLUGIN_DATA || "";
  return isAbsolute(d) ? d : undefined;
}
export const DATA_DIR = dataDirOf(process.env) ?? NO_DATA_DIR;
export const LOG_DIR = DATA_DIR;
export const EVENTS_FILE = join(LOG_DIR, "events.jsonl");
export const CURSOR_FILE = join(LOG_DIR, "export-cursor.json");
export const EXPORT_DIR = join(LOG_DIR, "exports");
export const SERVER_FILE = join(LOG_DIR, "server.json");        // { pid, port } of the running page server
export const REGISTRY_FILE = process.env.BOARD_REGISTRY_FILE || join(LOG_DIR, "projects.json");   // written by the plugin's hooks

export const AGENTS_DIR = process.env.BOARD_AGENTS_DIR || join(PLUGIN_ROOT, "agents");
export const PROJECT_NOTES = join(".claude", "crew", "project.md");   // relative to a project's folder

// Poller snapshot and "already turned into events" memory are kept per project.
export const projectStateDir = (key: string) => join(LOG_DIR, "projects", key);
