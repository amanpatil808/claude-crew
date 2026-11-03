// toon-crew project registry: ${CLAUDE_PLUGIN_DATA}/projects.json, an array of
// { path, name, firstSeen, lastSeen, board, lessons }. Holds paths, timestamps and two opt-in flags
// (board, lessons: default false), never secrets.
//   node projects.mjs register                          SessionStart hook (JSON on stdin; data dir from env)
//   node projects.mjs forget <dataDir> [target]         remove one project by path or name; no target lists
//   node projects.mjs set <dataDir> <target> [board|lessons on|off]   set an opt-in flag; no flag shows both
// Writes are atomic (temp file + rename) and serialised with a lock directory.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FILE = 'projects.json';

export function readProjects(dataDir) {
  if (!usableDataDir(dataDir)) return [];
  let text;
  try { text = fs.readFileSync(path.join(dataDir, FILE), 'utf8'); } catch { return []; }
  try {
    const list = JSON.parse(text);
    return Array.isArray(list) ? list.filter((p) => p && typeof p.path === 'string') : [];
  } catch {
    // Never overwrite a registry we cannot read: keep a copy (.bak, first copy wins), warn, then start fresh.
    const bak = path.join(dataDir, `${FILE}.bak`);
    try { if (!fs.existsSync(bak)) fs.copyFileSync(path.join(dataDir, FILE), bak); } catch { /* best effort */ }
    console.error(`toon-crew: ${FILE} is unreadable; a copy was kept as ${FILE}.bak and a fresh list was started.`);
    return [];
  }
}
// Folder names are untrusted text that Claude reads back: control characters become visible escapes
// (\n, \x1b), and the length is capped.
const clean = (s, max = 80) => String(s).replace(/[\u0000-\u001f\u007f]/g, (c) => ({ '\n': '\\n', '\r': '\\r', '\t': '\\t' }[c] ?? `\\x${c.charCodeAt(0).toString(16).padStart(2, '0')}`)).slice(0, max);
const FLAGS = ['board', 'lessons'];

function sleepMs(ms) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }

// The data folder is used only when absolute: a relative one would resolve against the session's (or caller's)
// folder and put the registry inside a project.
export const usableDataDir = (dataDir) => typeof dataDir === 'string' && path.isAbsolute(dataDir);
const NOT_ABSOLUTE = 'the data folder must be an absolute path';

// Run `fn` while holding <dataDir>/.projects.lock (a directory: mkdir is atomic). A lock older than 10s is stale.
export function withLock(dataDir, fn) {
  if (!usableDataDir(dataDir)) throw new Error(NOT_ABSOLUTE);
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const lock = path.join(dataDir, '.projects.lock');
  for (let tries = 0; ; tries++) {
    try { fs.mkdirSync(lock); break; } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      try { if (Date.now() - fs.statSync(lock).mtimeMs > 10_000) fs.rmdirSync(lock); } catch { /* raced */ }
      if (tries > 100) throw new Error('registry lock busy');
      sleepMs(25);
    }
  }
  try { return fn(); } finally { try { fs.rmdirSync(lock); } catch { /* already gone */ } }
}

function writeProjects(dataDir, list) {
  const final = path.join(dataDir, FILE);
  const tmp = `${final}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(list, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tmp, final);
}

export function register(dataDir, projectPath, now = new Date()) {
  const abs = path.resolve(projectPath);
  const iso = now.toISOString();
  return withLock(dataDir, () => {
    const list = readProjects(dataDir);
    const hit = list.find((p) => p.path === abs);
    if (hit) hit.lastSeen = iso;
    else list.push({ path: abs, name: clean(path.basename(abs)), firstSeen: iso, lastSeen: iso, board: false, lessons: false });
    writeProjects(dataDir, list);
    return list;
  });
}

// Set an opt-in flag for a project (by path or name); an unregistered path is added first.
export function setFlag(dataDir, target, flag, value, now = new Date()) {
  if (!FLAGS.includes(flag)) throw new Error(`unknown flag "${flag}" (use ${FLAGS.join(' or ')})`);
  const abs = path.resolve(target);
  return withLock(dataDir, () => {
    const list = readProjects(dataDir);
    let hit = list.find((p) => p.path === abs || p.name === target);
    if (!hit && path.isAbsolute(target)) {
      const iso = now.toISOString();
      hit = { path: abs, name: clean(path.basename(abs)), firstSeen: iso, lastSeen: iso, board: false, lessons: false };
      list.push(hit);
    }
    if (!hit) return null;
    hit[flag] = value === true;
    writeProjects(dataDir, list);
    return hit;
  });
}

// Returns the removed entries ([] when nothing matched).
export function forget(dataDir, target) {
  const wanted = path.resolve(target);
  return withLock(dataDir, () => {
    const list = readProjects(dataDir);
    const keep = list.filter((p) => p.path !== wanted && p.name !== target);
    const removed = list.filter((p) => !keep.includes(p));
    if (removed.length) writeProjects(dataDir, keep);
    return removed;
  });
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  if (cmd === 'register') {
    const dataDir = process.env.CLAUDE_PLUGIN_DATA;
    if (!usableDataDir(dataDir)) return; // not an installed plugin's absolute data folder: nothing to do
    let raw = '';
    for await (const chunk of process.stdin) raw += chunk;
    let cwd = '';
    try { cwd = JSON.parse(raw).cwd ?? ''; } catch { /* no stdin JSON */ }
    const project = process.env.CLAUDE_PROJECT_DIR || cwd;
    if (project) register(dataDir, project);
    return;
  }
  if (cmd === 'forget') {
    const [dataDir, ...rest] = args;
    const target = rest.join(' ').trim();
    if (!dataDir) { console.error('usage: projects.mjs forget <dataDir> [path-or-name]'); process.exit(2); }
    if (!usableDataDir(dataDir)) { console.error(`toon-crew: ${NOT_ABSOLUTE}.`); process.exit(2); }
    const list = readProjects(dataDir);
    if (!target) {
      console.log(list.length ? 'Registered projects:' : 'No projects registered yet.');
      for (const p of list) console.log(`- ${clean(p.name)}  ${clean(p.path)}  (last seen ${clean(p.lastSeen)}; board ${p.board === true ? 'on' : 'off'}, lessons ${p.lessons === true ? 'on' : 'off'})`);
      return;
    }
    const removed = forget(dataDir, target);
    if (!removed.length) { console.error(`No registered project matches "${target}". Run with no argument to list them.`); process.exit(1); }
    for (const p of removed) console.log(`Forgot ${clean(p.name)} (${clean(p.path)}). It returns the next time a session opens there.`);
    return;
  }
  if (cmd === 'set') {
    const [dataDir, target, flag, value] = args;
    if (!dataDir || !target) { console.error('usage: projects.mjs set <dataDir> <path-or-name> [board|lessons on|off]'); process.exit(2); }
    if (!usableDataDir(dataDir)) { console.error(`toon-crew: ${NOT_ABSOLUTE}.`); process.exit(2); }
    if (!flag) { // show
      const p = readProjects(dataDir).find((x) => x.path === path.resolve(target) || x.name === target);
      if (!p) { console.error(`No registered project matches "${clean(target)}".`); process.exit(1); }
      console.log(`${clean(p.name)}: board ${p.board === true ? 'on' : 'off'}, lessons ${p.lessons === true ? 'on' : 'off'}`);
      return;
    }
    if (!FLAGS.includes(flag) || !['on', 'off'].includes(value)) { console.error('usage: set <dataDir> <path-or-name> board|lessons on|off'); process.exit(2); }
    const p = setFlag(dataDir, target, flag, value === 'on');
    if (!p) { console.error(`No registered project matches "${clean(target)}".`); process.exit(1); }
    console.log(`${clean(p.name)}: board ${p.board === true ? 'on' : 'off'}, lessons ${p.lessons === true ? 'on' : 'off'}`);
    return;
  }
  console.error('usage: projects.mjs register | forget <dataDir> [path-or-name] | set <dataDir> <path-or-name> [board|lessons on|off]');
  process.exit(2);
}

// Compare real paths: argv[1] keeps symlinks and doubled slashes that import.meta.url does not.
function isEntry() {
  try { return !!process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url)); } catch { return true; }
}
if (isEntry()) await main();
