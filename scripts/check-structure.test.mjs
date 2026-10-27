// Runs a copy of check-structure.mjs against a tiny fixture repo, so the real README and CHANGELOG are untouched.
// CI: node --test scripts/check-structure.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const script = path.join(import.meta.dirname, 'check-structure.mjs');

function fixture({ plugin = '1.2.3', badge = '1.2.3', changelog = '1.2.3', hook = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-'));
  const w = (rel, body) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), body); };
  w('scripts/check-structure.mjs', fs.readFileSync(script, 'utf8'));
  w('plugin/.claude-plugin/plugin.json', JSON.stringify({ name: 'demo', version: plugin, description: 'd', author: { name: 'a' } }));
  w('.claude-plugin/marketplace.json', JSON.stringify({ name: 'demo-market', owner: { name: 'o' }, plugins: [{ name: 'demo', source: './plugin' }] }));
  w('plugin/settings.json', '{}');
  w('plugin/hooks/hooks.json', JSON.stringify({ hooks: { SessionStart: [{ hooks: [{ type: 'command', command: 'node "${CLAUDE_PLUGIN_ROOT}/board/hook.ts"', timeout: 5 }] }] } }));
  if (hook) w('plugin/board/hook.ts', '');
  w('README.md', `<img alt="version ${badge}" src="https://img.shields.io/badge/version-${badge}-blue">\n`);
  w('CHANGELOG.md', `# Changelog\n\n## ${changelog} - unreleased\n`);
  const r = spawnSync(process.execPath, [path.join(dir, 'scripts/check-structure.mjs')], { encoding: 'utf8' });
  fs.rmSync(dir, { recursive: true, force: true });
  return r;
}

test('all three versions agree: passes', () => {
  const r = fixture();
  assert.equal(r.status, 0, r.stderr);
});

test('mismatched README badge fails and names all three values', () => {
  const r = fixture({ badge: '1.2.2' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /plugin\.json=1\.2\.3, README badge=1\.2\.2, CHANGELOG top heading=1\.2\.3/);
});

test('mismatched CHANGELOG heading fails and names all three values', () => {
  const r = fixture({ changelog: '1.2.4' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /plugin\.json=1\.2\.3, README badge=1\.2\.3, CHANGELOG top heading=1\.2\.4/);
});

test('missing board/hook.ts fails (no more exemption)', () => {
  const r = fixture({ hook: false });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /script not found \(board\/hook\.ts\)/);
});
