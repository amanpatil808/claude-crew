// Board data (events, state, server pid) can hold project names and log lines, so files are owner-only
// (0600) and folders 0700. The mode only applies when the file or folder is created; an older, looser
// file is tightened too.
import { appendFileSync, chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
}

export function writePrivate(file: string, data: string): void {
  ensureDir(dirname(file));
  writeFileSync(file, data, { mode: 0o600 });
  chmodSync(file, 0o600);
}

export function appendPrivate(file: string, data: string): void {
  ensureDir(dirname(file));
  appendFileSync(file, data, { mode: 0o600 });
}
