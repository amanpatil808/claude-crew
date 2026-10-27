#!/usr/bin/env node
// Writes a made-up Crew Room data folder (events, project registry, poller snapshots) for README screenshots.
// Usage: node scripts/board-demo.mjs <output-dir>
// Everything is invented: two fake projects, fake paths under /work, timestamps relative to now.
// It never starts the board and never touches real data; it only writes inside <output-dir>.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, parse, resolve, sep } from 'node:path';

const out = process.argv[2];
if (!out) { console.error('usage: node scripts/board-demo.mjs <output-dir>'); process.exit(1); }
const dir = resolve(out);
const now = Date.now();
const ago = (min) => new Date(now - min * 60_000);
const iso = (min) => ago(min).toISOString();

const SHOP = 'shop-api', RECIPE = 'recipe-app';
const events = [];
let n = 0;
const ev = (min, e) => {
  const at = ago(min);
  events.push({ id: `e-${at.getTime()}-${(++n).toString(16).padStart(6, '0')}`, ts: at.toISOString(), ...e });
};
let agentNo = 0;
const aid = () => `a${String(++agentNo).padStart(4, '0')}demo${agentNo.toString(16)}`;

// Usage rows use the board's neutral keys: n calls, in/out tokens, cw5m/cw1h cache writes, cr cache reads, ws/wf web search/fetch,
// and `day`, the local calendar day of those calls ("YYYY-MM-DD"), which the board's Today and 7 days windows sum.
const MODEL = { opus: 'claude-opus-4-7', sonnet: 'claude-sonnet-5-5', haiku: 'claude-haiku-4-5' };
const pad2 = (x) => String(x).padStart(2, '0');
const localDay = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const daysAgo = (k) => { const d = new Date(now); d.setDate(d.getDate() - k); return localDay(d); };
const row = (day, model, n, out, cw5m, cw1h, cr, ws = 0, wf = 0) => ({ model, speed: 'standard', long: false, day, n, in: n * 2, out, cw5m, cw1h, cr, ws, wf });
const SIZE = { dekisugi: ['opus', 1.2], kevin: ['sonnet', 1], 'ninja-hattori': ['sonnet', 0.6], shizuka: ['haiku', 0.8], 'joe-gardner': ['haiku', 0.7], bob: ['sonnet', 1.1], 'mike-wazowski': ['sonnet', 0.5], olaf: ['sonnet', 0.9], nobita: ['opus', 1], shinchan: ['sonnet', 1.3], stuart: ['haiku', 0.2] };
// Cumulative usage for one agent run; `final` is true once it has stopped, like the SubagentStop snapshot.
const usage = (project, min, { agentId, agentType, role, final }) => {
  const [m, k] = SIZE[role] ?? ['sonnet', 1], search = role === 'dekisugi';
  ev(min, { project, kind: 'usage', sid: project === SHOP ? 'demo0001' : 'demo0002', agentId, agentType, text: 'Usage update', scope: 'agent', final, partial: false,
    rows: [row(localDay(ago(min)), MODEL[m], Math.round(24 * k), Math.round(13000 * k), Math.round(59000 * k), 0, Math.round(1_040_000 * k), search ? 3 : 0, search ? 5 : 0)] });
};
// The manager's own session: a long-lived one, so its cumulative total holds today's calls and earlier days'. Like the
// reader, days older than the newest 8 sit in day "" and `since` keeps the first day. The board's Today counts only
// today's rows, 7 days the last seven, all-time every row.
const mainUsage = (project, min, sid, k = 1) => ev(min, { project, kind: 'usage', sid, text: 'Usage update', scope: 'main', final: false, partial: false,
  since: daysAgo(12),
  rows: [
    row(daysAgo(0), MODEL.opus, Math.round(190 * k), Math.round(140_000 * k), 0, Math.round(396_000 * k), Math.round(40_700_000 * k)),
    row(daysAgo(0), MODEL.haiku, 12, 2_400, 18_000, 0, 150_000),
    row(daysAgo(1), MODEL.opus, Math.round(260 * k), Math.round(180_000 * k), 0, Math.round(520_000 * k), Math.round(55_000_000 * k)),
    row(daysAgo(3), MODEL.opus, Math.round(120 * k), Math.round(90_000 * k), 0, Math.round(240_000 * k), Math.round(26_000_000 * k)),
    row('', MODEL.opus, Math.round(300 * k), Math.round(210_000 * k), 0, Math.round(610_000 * k), Math.round(64_000_000 * k)),
  ] });
let bobId;

// A task: optionally queued, assigned by Doraemon, picked up by an agent; stopped when `doneMin` is given.
function job(project, role, text, { queueMin, startMin, doneMin, priority, handback, ref }) {
  const type = `toon-crew:${role}`;
  if (queueMin != null) ev(queueMin, { project, kind: 'task-queue', role, text, ...(priority ? { priority } : {}), ...(ref ? { ref } : {}) });
  if (startMin == null) return;
  const id = aid();
  ev(startMin, { project, kind: 'assign', from: 'doraemon', to: type, text, sid: 'demo0001' });
  ev(startMin - 0.1, { project, kind: 'agent-start', agentId: id, agentType: type, text: `${type} started`, sid: 'demo0001' });
  const who = { agentId: id, agentType: type, role };
  if (doneMin != null) {
    ev(doneMin, { project, kind: 'agent-stop', agentId: id, agentType: type, text: `${type} finished: ${handback}`, sid: 'demo0001' });
    usage(project, doneMin - 0.05, { ...who, final: true });
  } else usage(project, 1, { ...who, final: false });   // still running: a snapshot from the last minute
  if (role === 'bob') bobId = id;
}
const queued = (project, role, priority, text, min) => job(project, role, text, { queueMin: min, priority });

// ---- shop-api: a backend project, busy ----
ev(300, { project: SHOP, kind: 'session-start', text: 'Session started (startup)', sid: 'demo0001' });
job(SHOP, 'dekisugi', 'Compare Stripe and Adyen webhook retries', { queueMin: 290, priority: 'P1', startMin: 285, doneMin: 250, handback: 'Stripe retries for 3 days, Adyen for 7. Use an idempotent handler.' });
job(SHOP, 'kevin', 'Design the order schema and migration', { queueMin: 240, priority: 'P0', startMin: 235, doneMin: 170, handback: 'orders + order_items tables, reversible migration 0042, 4 indexes.' });
job(SHOP, 'ninja-hattori', 'Review the checkout auth middleware', { queueMin: 200, priority: 'P1', startMin: 195, doneMin: 150, handback: 'No blockers. Two notes: shorten token TTL, log denied calls.' });
ev(120, { project: SHOP, kind: 'commit', text: 'Committed 9c1e4ab on feat/orders-v2: Add order schema and migration 0042', ref: '9c1e4ab', sid: 'demo0001' });
job(SHOP, 'shizuka', 'Document the /v2/orders endpoints in OpenAPI', { queueMin: 130, priority: 'P2', startMin: 125, doneMin: 95, handback: 'OpenAPI 3.1 spec for 6 order routes, with examples.' });
ev(80, { project: SHOP, kind: 'commit', text: 'Committed 3be7f20 on feat/orders-v2: Add POST /v2/orders with idempotency keys', ref: '3be7f20', sid: 'demo0001' });
ev(70, { project: SHOP, kind: 'pr', text: 'Opened PR #42', ref: 'https://github.com/acme-shop/shop-api/pull/42', sid: 'demo0001' });
job(SHOP, 'joe-gardner', 'Run the order-flow integration suite', { queueMin: 60, priority: 'P0', startMin: 22 });
job(SHOP, 'bob', 'Add rate limiting to the checkout route', { queueMin: 50, priority: 'P0', startMin: 18 });
job(SHOP, 'mike-wazowski', 'Cache Docker layers in the CI build', { queueMin: 45, priority: 'P1', startMin: 12 });
job(SHOP, 'ninja-hattori', 'Scan the new payment webhook for secrets', { startMin: 6 });
// A clone: two Shinchans at once. The first started 8 minutes ago; the second, with its own "#2" assign, about a minute ago.
job(SHOP, 'shinchan', 'Shinchan #1: Build the order status badges', { startMin: 8 });
job(SHOP, 'shinchan', 'Shinchan #2: Build the order timeline view', { startMin: 1 });
queued(SHOP, 'sulley', 'P1', 'Plan a blue-green rollout for orders-service', 40);
queued(SHOP, 'twenty-two', 'P2', 'Explore carts with zero-quantity items', 38);
queued(SHOP, 'shizuka', 'P2', 'Add a changelog entry for v2.9', 35);
queued(SHOP, 'kevin', 'P1', 'Design the refund API', 30);
// Bob stopped at a permission prompt about 3 minutes ago.
ev(3, { project: SHOP, kind: 'needs-you', sid: 'demo0001', agentId: bobId, agentType: 'toon-crew:bob', need: 'permission', text: 'Waiting for your permission' });
mainUsage(SHOP, 2, 'demo0001');
ev(0.2, { project: SHOP, kind: 'main-busy', text: 'Manager at work', sid: 'demo0001' });

// ---- recipe-app: a frontend project, quieter ----
ev(210, { project: RECIPE, kind: 'session-start', text: 'Session started (startup)', sid: 'demo0002' });
job(RECIPE, 'olaf', 'Survey how cooking apps show step timers', { queueMin: 205, priority: 'P2', startMin: 200, doneMin: 165, handback: '5 apps compared; 4 of 5 pin the timer above the step.' });
job(RECIPE, 'nobita', 'Design the cooking-mode screen', { queueMin: 160, priority: 'P1', startMin: 155, doneMin: 110, handback: 'Big-type steps, one-tap timers, light and dark, 44px targets.' });
ev(100, { project: RECIPE, kind: 'commit', text: 'Committed 71d0c5e on main: Add recipe card grid styles', ref: '71d0c5e', sid: 'demo0002' });
job(RECIPE, 'shinchan', 'Build the recipe card grid with filters', { queueMin: 95, priority: 'P1', startMin: 25 });
job(RECIPE, 'stuart', 'Find every use of the old Card component', { startMin: 15, doneMin: 11, handback: '14 uses in 9 files, listed with path:line.' });
queued(RECIPE, 'joe-gardner', 'P1', 'Visual regression pass on recipe cards', 20);
queued(RECIPE, 'kevin', 'P2', 'Add a favourites endpoint', 18);
ev(1.5, { project: RECIPE, kind: 'main-busy', text: 'Manager at work', sid: 'demo0002' });
mainUsage(RECIPE, 1.2, 'demo0002', 0.4);
// The manager's turn ended and he waits for the owner's reply (an idle item).
ev(0.8, { project: RECIPE, kind: 'needs-you', sid: 'demo0002', need: 'idle', text: 'Waiting for your reply' });

events.sort((a, b) => a.ts.localeCompare(b.ts));
// The newest event belongs to shop-api, so the page opens on it by default (focus = newest event's project).
const lastShop = events.findLastIndex((e) => e.project === SHOP);
const [ls] = events.splice(lastShop, 1);
ls.ts = new Date(now - 5_000).toISOString();
events.push(ls);

// board: true is the owner's polling approval: a real board only has PR snapshots (and "PR ready" items) for such a
// project. The /work paths have no project.md, so the board's pollers still run nothing for it.
const registry = [
  { path: '/work/shop-api', name: SHOP, firstSeen: iso(60 * 24 * 12), lastSeen: iso(0.2), board: true },
  { path: '/work/recipe-app', name: RECIPE, firstSeen: iso(60 * 24 * 5), lastSeen: iso(1.5) },
];

// Poller snapshots, in the shape lib/pollers.ts saves. The registry rows have no "board": true, so the board
// never runs gh or ssh for these projects and these files are shown as they are.
const key = (p) => `${basename(p).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'project'}-${createHash('sha256').update(resolve(p)).digest('hex').slice(0, 8)}`;
const run = (id, workflow, branch, title, conclusion, min) => ({ id, workflow, title, branch, status: 'completed', conclusion, createdAt: iso(min + 4), updatedAt: iso(min), url: `https://github.com/acme-shop/shop-api/actions/runs/${id}` });
const commitRow = (sha, author, min, subject) => ({ sha: sha.padEnd(40, '0'), short: sha, author, at: iso(min), subject });
const snapshots = {
  [SHOP]: {
    polledAt: { github: iso(0.5), box: iso(1) },
    ci: [
      run(8801, 'CI', 'feat/orders-v2', 'Add POST /v2/orders with idempotency keys', 'success', 66),
      run(8800, 'CI', 'feat/orders-v2', 'Add order schema and migration 0042', 'success', 115),
      run(8799, 'Deploy', 'main', 'Release v2.8.1', 'success', 300),
      run(8798, 'CI', 'main', 'Bump pg driver to 8.12', 'failure', 480),
    ],
    prs: [
      { number: 43, title: 'Rate limit the checkout route', state: 'OPEN', author: 'bob-demo', branch: 'feat/checkout-rate-limit', updatedAt: iso(15), url: 'https://github.com/acme-shop/shop-api/pull/43', draft: true, checks: 'pending', review: '', mergeable: 'MERGEABLE' },
      { number: 42, title: 'Orders v2: idempotent POST /v2/orders', state: 'OPEN', author: 'kevin-demo', branch: 'feat/orders-v2', updatedAt: iso(70), url: 'https://github.com/acme-shop/shop-api/pull/42', draft: false, checks: 'pass', review: 'REVIEW_REQUIRED', mergeable: 'MERGEABLE' },
      { number: 41, title: 'Bump pg driver to 8.12', state: 'MERGED', author: 'bob-demo', branch: 'chore/pg-8-12', updatedAt: iso(420), url: 'https://github.com/acme-shop/shop-api/pull/41', draft: false, checks: 'pass', review: 'APPROVED', mergeable: 'UNKNOWN' },
    ],
    commits: { 'feat/orders-v2': [
      commitRow('3be7f20', 'Doraemon', 80, 'Add POST /v2/orders with idempotency keys'),
      commitRow('9c1e4ab', 'Doraemon', 120, 'Add order schema and migration 0042'),
      commitRow('5d02f1c', 'Doraemon', 200, 'Scaffold orders module'),
    ] },
    deploy: { status: 'ok', version: 'v2.8.1', at: iso(300), detail: 'blue-green, 0 failed health checks', raw: `ok v2.8.1 ${iso(300)} req=demo1 blue-green`, history: [
      `ok v2.8.1 ${iso(300)} blue-green`, `ok v2.8.0 ${iso(60 * 30)} blue-green`, `rolled-back v2.7.9 ${iso(60 * 54)} health check failed`, `ok v2.7.8 ${iso(60 * 80)} blue-green`] },
    errors: [
      { service: 'api', at: iso(9), level: 'warn', msg: 'slow query on orders.list (812 ms) (route=/v2/orders)' },
      { service: 'worker', at: iso(31), level: 'error', msg: 'webhook retry 3/5 for evt_demo_1042 (status=503)' },
      { service: 'api', at: iso(64), level: 'warn', msg: 'rate limit nearly hit for client demo-mobile (used=94/100)' },
    ],
    problems: {},
  },
  [RECIPE]: { polledAt: {}, ci: [], prs: [], commits: {}, deploy: null, errors: [], problems: {} },
};

// Safety: this script deletes files in <output-dir>, so it only works in a folder it made itself.
const refuse = (why) => { console.error(`board-demo: refusing to use ${dir}: ${why}`); process.exit(1); };
const home = resolve(homedir());
const under = (p, base) => p === base || p.startsWith(base + sep);
if (under(dir, join(home, '.toon-crew')) || under(dir, join(home, '.claude'))) refuse('this is a real board data location (~/.toon-crew or ~/.claude)');
if (dir === parse(dir).root || dir === home) refuse('this is a root or home folder');
const MARKER = join(dir, '.board-demo');
if (existsSync(dir)) {
  if (!statSync(dir).isDirectory()) refuse('it is not a folder');
  if (readdirSync(dir).length > 0 && !existsSync(MARKER)) refuse('the folder is not empty and has no .board-demo marker; pick a new or empty folder');
  const sj = join(dir, 'server.json');
  if (existsSync(sj)) {
    let pid = 0;
    try { pid = Number(JSON.parse(readFileSync(sj, 'utf8')).pid); } catch { /* unreadable: treat as stale */ }
    let alive = false;
    if (pid > 0) { try { process.kill(pid, 0); alive = true; } catch (e) { alive = e.code === 'EPERM'; } }
    if (alive) refuse(`a board is still running here (pid ${pid}); stop the board first`);
  }
}

// Start clean so a second run gives the same folder.
for (const f of ['events.jsonl', 'projects.json', 'projects', 'server.json', 'server.log', 'main-busy.txt']) rmSync(join(dir, f), { recursive: true, force: true });
mkdirSync(dir, { recursive: true, mode: 0o700 });
writeFileSync(MARKER, 'Made by scripts/board-demo.mjs; safe to overwrite.\n');
writeFileSync(join(dir, 'events.jsonl'), events.map((e) => JSON.stringify(e)).join('\n') + '\n');
writeFileSync(join(dir, 'projects.json'), JSON.stringify(registry, null, 1));
for (const p of registry) {
  const d = join(dir, 'projects', key(p.path));
  mkdirSync(d, { recursive: true, mode: 0o700 });
  writeFileSync(join(d, 'state.json'), JSON.stringify(snapshots[p.name], null, 1));
}

console.log(`Wrote ${events.length} events and ${registry.length} projects to ${dir}`);
console.log('Timestamps are relative to now, so take screenshots within a few minutes. Run the board against it:');
console.log(`  BOARD_LOG_DIR=${dir} BOARD_PORT=8840 bash plugin/board/board.sh start`);
console.log('Stop it with the same BOARD_LOG_DIR:');
console.log(`  BOARD_LOG_DIR=${dir} bash plugin/board/board.sh stop`);
