// Every file location in one place, each overridable by env so tests can point at a temp folder
// and the real log is never touched by them.
import { homedir } from "node:os";
import { join, resolve } from "node:path";

// This file lives in <plugin>/board/lib, so the plugin root is two levels up (also the fallback outside a plugin).
const BOARD_DIR = resolve(import.meta.dirname, "..");

export const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || resolve(BOARD_DIR, "..");
// Log and state live in the plugin's data folder, never in the repo; ~/.toon-crew is for a hand-started board.
export const DATA_DIR = process.env.BOARD_LOG_DIR || process.env.CLAUDE_PLUGIN_DATA || join(homedir(), ".toon-crew");
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
