// Board data (events, state, server pid) can hold project names and log lines, so files are owner-only
// (0600) and folders 0700. The mode only applies when the file or folder is created; an older, looser
// file is tightened too.
import { appendFileSync, chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { insideNoDataDir } from "./paths.ts";

export class NoDataDirError extends Error {}
// The "no data folder" stand-in is never created, even where /dev/null is not a device file (Windows).
export function ensureDir(dir: string): void {
  if (insideNoDataDir(dir)) throw new NoDataDirError("no data folder");
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
