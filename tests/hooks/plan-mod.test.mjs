// The toon-crew mod (plan-mod.mjs): what it keeps from Claude Code's session.measure, that it only ever reads the
// clock and sets its one environment variable, and that the reading it writes is one the board's allow-list accepts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// The board's modules resolve their data folder on import: point it at a throwaway one first.
process.env.CLAUDE_PLUGIN_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'crew-plan-mod-'));
const { readingOf, register } = await import('../../plugin/hooks/plan-mod.mjs');
const { limitsReading, LIMITS_ENV } = await import('../../plugin/board/lib/events.ts');

const NOW = Date.parse('2026-10-28T01:00:00Z');
const AT = '2026-10-28T01:00:00.000Z';
const SRC = fs.readFileSync(path.join(import.meta.dirname, '..', '..', 'plugin', 'hooks', 'plan-mod.mjs'), 'utf8');
const measure = (rateLimits, cost) => ({ context: { window: 200000 }, rateLimits, ...(cost === undefined ? {} : { cost }), changed: ['rateLimits'] });

test('a subscription: five_hour and seven_day become 5h and 7d with their reset times', () => {
  const r = readingOf(measure([
    { kind: 'five_hour', percentUsed: 23.5, resetsAt: '2026-10-28T04:00:00Z' },
    { kind: 'seven_day', percentUsed: 41.2, resetsAt: '2026-11-02T00:00:00.000Z' },
  ], { usd: 1.2 }), NOW);
  assert.deepEqual(r, { v: 1, at: AT, sub: true, w: [
    { id: '5h', pct: 23.5, end: '2026-10-28T04:00:00.000Z' }, { id: '7d', pct: 41.2, end: '2026-11-02T00:00:00.000Z' },
  ] });
  assert.deepEqual(limitsReading(r), r, 'the board accepts exactly what the mod writes');
});

test('per-token billing: no window after an answered request, or only a gateway spend limit', () => {
  assert.deepEqual(readingOf(measure([], { usd: 0.03 }), NOW), { v: 1, at: AT, sub: false, w: [] });
  assert.deepEqual(readingOf(measure([{ kind: 'spend_limit', percentUsed: 120, resetsAt: '2026-11-01T00:00:00Z' }]), NOW), { v: 1, at: AT, sub: false, w: [] });
  assert.deepEqual(limitsReading(readingOf(measure([], { usd: 0.03 }), NOW)), { v: 1, at: AT, sub: false, w: [] });
});

test('nothing known yet is no reading: no window and no cost, or a zero cost, or junk', () => {
  for (const e of [measure([]), measure([], { usd: 0 }), measure([], {}), measure('x'), null, 'x', 5, {}]) assert.equal(readingOf(e, NOW), null, JSON.stringify(e));
  assert.equal(readingOf(measure([{ kind: 'five_hour', percentUsed: 5 }]), Number.NaN), null, 'no clock, no reading');
});

test('odd windows are dropped or clamped; a bad reset time is null; each window once; no free text kept', () => {
  const r = readingOf(measure([
    { kind: 'five_hour', percentUsed: 140, resetsAt: 'soon', note: 'planted' },
    { kind: 'five_hour', percentUsed: 1, resetsAt: '2026-10-28T04:00:00Z' },
    { kind: 'seven_day', percentUsed: -2 },
    { kind: 'weekly_opus', percentUsed: 5 }, { kind: '__proto__', percentUsed: 5 }, { kind: 'constructor', percentUsed: 5 },
    { kind: 'seven_day', percentUsed: '50' }, null, 'five_hour',
  ]), NOW);
  assert.deepEqual(r, { v: 1, at: AT, sub: true, w: [{ id: '5h', pct: 100, end: null }, { id: '7d', pct: 0, end: null }] });
  assert.ok(!JSON.stringify(r).includes('planted'));
  assert.deepEqual(limitsReading(r), r);
});

// $.env.set reaches every process Claude Code starts after it (Bash commands, hooks, MCP servers), and the mod API has
// no narrower scope. So the value is pinned: a fixed shape, at most two windows, no text from the event, small.
test('the variable every later process sees: fixed keys, numbers and times only, under 200 bytes for any event', () => {
  const huge = 'x'.repeat(100_000);
  const e = { context: { window: 1e300, path: huge }, cost: { usd: 1e300, note: huge }, sessionId: huge, cwd: huge,
    rateLimits: Array.from({ length: 10_000 }, (_, i) => ({ kind: i % 2 ? 'five_hour' : 'seven_day', percentUsed: 99.99999, resetsAt: '2026-10-28T04:00:00.123456789Z', extra: huge })) };
  const r = readingOf(e, NOW);
  const text = JSON.stringify(r);
  assert.ok(text.length < 200, `${text.length} bytes`);
  assert.deepEqual(Object.keys(r), ['v', 'at', 'sub', 'w']);
  assert.equal(r.w.length, 2);
  for (const w of r.w) assert.deepEqual(Object.keys(w), ['id', 'pct', 'end']);
  assert.doesNotMatch(text, /xxx/);
});

// A `$` that records every call and fails the test on anything but $.clock.now and $.env.set.
function fake$() {
  const calls = [];
  const allowed = { clock: { now: async () => { calls.push(['clock.now']); return NOW; } }, env: { set: async (k, v) => { calls.push(['env.set', k, v]); } } };
  const $ = new Proxy({}, { get: (_, ns) => {
    if (!Object.hasOwn(allowed, ns)) throw new Error(`the mod reached $.${String(ns)}`);
    return new Proxy(allowed[ns], { get: (o, m) => { if (!Object.hasOwn(o, m)) throw new Error(`the mod reached $.${String(ns)}.${String(m)}`); return o[m]; } });
  } });
  return { $, calls };
}

test('register: one session.measure hook that sets only TOON_CREW_LIMITS and always passes the event on', async () => {
  const hooks = [];
  register((name, ...rest) => { hooks.push([name, rest]); return { catch() {} }; });
  assert.deepEqual(hooks.map(([n, rest]) => [n, rest.length]), [['session.measure', 1]], 'one hook, no matcher');
  const hook = hooks[0][1][0];
  const e = measure([{ kind: 'five_hour', percentUsed: 7, resetsAt: '2026-10-28T04:00:00Z' }], { usd: 1 });
  const { $, calls } = fake$();
  let passed;
  const out = await hook($, e, async (x) => { passed = x; return { changed: ['rateLimits'] }; });
  assert.equal(passed, e, 'the event goes on unchanged');
  assert.deepEqual(out, { changed: ['rateLimits'] });
  assert.equal(LIMITS_ENV, 'TOON_CREW_LIMITS');
  assert.deepEqual(calls.map((c) => c.slice(0, 2)), [['clock.now'], ['env.set', LIMITS_ENV]]);
  assert.deepEqual(limitsReading(JSON.parse(calls[1][2])), { v: 1, at: AT, sub: true, w: [{ id: '5h', pct: 7, end: '2026-10-28T04:00:00.000Z' }] });
});

test('register: no reading means no write, and a failing clock or env never stops the event', async () => {
  let hook;
  register((_, h) => { hook = h; });
  const { $, calls } = fake$();
  let n = 0;
  await hook($, measure([]), async () => { n++; });
  assert.deepEqual(calls, [['clock.now']]);
  const broken = { clock: { now: async () => { throw new Error('x'); } }, env: { set: async () => { throw new Error('y'); } } };
  await hook(broken, measure([{ kind: 'five_hour', percentUsed: 7 }]), async () => { n++; });
  const brokenEnv = { clock: { now: async () => NOW }, env: { set: async () => { throw new Error('y'); } } };
  await hook(brokenEnv, measure([{ kind: 'five_hour', percentUsed: 7 }]), async () => { n++; });
  assert.equal(n, 3, 'next ran every time');
});

test('read-only by construction: the source calls no mods API but $.clock.now and $.env.set, and no Node module', () => {
  const uses = [...SRC.matchAll(/\$\.([A-Za-z_]+)\.([A-Za-z_]+)/g)].map((m) => `${m[1]}.${m[2]}`);
  assert.deepEqual([...new Set(uses)].sort(), ['clock.now', 'env.set']);
  assert.doesNotMatch(SRC, /\bimport\b|\brequire\s*\(|\bfetch\s*\(|process\.|globalThis/);
  // The one variable name is a literal (Claude Code refuses names it cannot read off the source) and matches the board's.
  assert.match(SRC, /\$\.env\.set\('TOON_CREW_LIMITS', /);
});
