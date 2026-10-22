// The project registry (${CLAUDE_PLUGIN_DATA}/projects.json) is written by the plugin's hooks; the board only reads it.
// Accepts a bare array or { projects: [...] }, and skips malformed rows.
import { copyFileSync, existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename, dirname, join, resolve, sep } from "node:path";
import { PROJECT_NOTES, REGISTRY_FILE } from "./paths.ts";

// `board: true` is the owner's approval for polling this project's Board section (gh, ssh); off by default,
// because project.md is checked into the repo and a cloned repo must not make the board run commands.
export interface Project { path: string; name: string; firstSeen?: string; lastSeen?: string; board?: boolean }

const isRow = (x: unknown): x is Project => !!x && typeof x === "object" && typeof (x as Project).path === "string" && typeof (x as Project).name === "string";

// Names end up in listings and prompts: control characters (a newline) are shown escaped, length is capped.
export const safeName = (s: string) => s.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`).slice(0, 80);

const warned = new Set<string>();
// A registry that does not parse is kept as <file>.bak (once) and reported, never overwritten or ignored quietly.
function keepCorrupt(file: string, why: unknown) {
  if (warned.has(file)) return;
  warned.add(file);
  try { if (!existsSync(`${file}.bak`)) copyFileSync(file, `${file}.bak`); } catch { /* read-only folder: the warning still shows */ }
  console.error(`crew board: ${file} is not valid JSON (${String((why as Error)?.message ?? why).slice(0, 80)}); kept a copy as ${file}.bak and showing no projects until it is fixed`);
}

// Two projects that share a name (case and punctuation aside: "My App" / "my-app", two "api" folders) get
// the parent folder as a hint, and a short path hash if even that clashes.
export function disambiguate(rows: Project[]): Project[] {
  const slug = (n: string) => n.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const count = new Map<string, number>();
  for (const r of rows) count.set(slug(r.name), (count.get(slug(r.name)) ?? 0) + 1);
  const hinted = rows.map((r) => (count.get(slug(r.name)) ?? 0) > 1 ? { ...r, name: `${r.name} (${basename(dirname(resolve(r.path))) || "/"})` } : r);
  const again = new Map<string, number>();
  for (const r of hinted) again.set(slug(r.name), (again.get(slug(r.name)) ?? 0) + 1);
  return hinted.map((r) => (again.get(slug(r.name)) ?? 0) > 1 ? { ...r, name: `${r.name} #${projectKey(r.path).split("-").pop()}` } : r);
}

export function readRegistry(file = REGISTRY_FILE): Project[] {
  if (!existsSync(file)) return [];
  let raw: unknown;
  try { raw = JSON.parse(readFileSync(file, "utf8")); } catch (err) { keepCorrupt(file, err); return []; }
  const rows = Array.isArray(raw) ? raw : (raw as { projects?: unknown })?.projects;
  if (!Array.isArray(rows)) return [];
  return disambiguate(rows.filter(isRow).map((p) => ({ ...p, name: safeName(p.name), board: p.board === true })));
}

// Name for a folder: the registered project that contains it (deepest wins), else the folder's own name.
export function projectName(dir: string | undefined, registry: Project[] = readRegistry()): string | undefined {
  if (!dir) return undefined;
  const d = resolve(dir);
  const hit = registry
    .filter((p) => d === resolve(p.path) || d.startsWith(resolve(p.path) + sep))
    .sort((a, b) => b.path.length - a.path.length)[0];
  return hit?.name || basename(d) || undefined;
}

// A folder-safe key for a project's own state files: readable slug plus a hash of the full path,
// so "~/work/api" and "~/oss/api" (or "My App" and "my-app") never share a state folder.
export const projectKey = (path: string) =>
  `${basename(path).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "project"}-${createHash("sha256").update(resolve(path)).digest("hex").slice(0, 8)}`;

export const notesFile = (p: Project) => join(p.path, PROJECT_NOTES);
