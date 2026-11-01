// Hand-back files: every crew role (read-only ones too) may Write or Edit .md files only in its own
// <CLAUDE_PLUGIN_DATA>/projects/<key>/handbacks/(full|summaries)/<id>/ folders, and nothing else under the data folder.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { evaluate } from '../guard.mjs';

const GUARD = path.join(import.meta.dirname, '..', 'guard.mjs');
// Outside the system temp dir: read-only roles may write anywhere under it, so a refusal there would prove nothing.
const W = fs.realpathSync(fs.mkdtempSync(path.join(import.meta.dirname, '.work-')));
process.on('exit', () => fs.rmSync(W, { recursive: true, force: true }));
const project = path.join(W, 'proj');
fs.mkdirSync(path.join(project, '.git'), { recursive: true });
fs.writeFileSync(path.join(project, 'README.md'), 'a\n');
// Where Claude Code puts it (under ~/.claude/plugins, which the guard protects), and a custom folder elsewhere.
const DATA_A = path.join(W, 'home/.claude/plugins/data/toon-crew-crew');
const DATA_B = path.join(W, 'data');
const LAYOUTS = [['plugins/data layout', DATA_A], ['custom data folder', DATA_B]];
const KEY = 'proj-1a2b3c4d';
const hb = (data, kind, id, name = '20261101-1200-guard-rule.md') => path.join(data, 'projects', KEY, 'handbacks', kind, id, name);
for (const [, data] of LAYOUTS) {
  for (const f of ['events.jsonl', 'limits.json', 'projects.json', `projects/${KEY}/state.json`]) { fs.mkdirSync(path.dirname(path.join(data, f)), { recursive: true }); fs.writeFileSync(path.join(data, f), '{}\n'); }
  for (const kind of ['full', 'summaries']) for (const id of ['kevin', 'joe-gardner']) { fs.mkdirSync(path.dirname(hb(data, kind, id)), { recursive: true }); fs.writeFileSync(hb(data, kind, id, 'old.md'), 'Verdict: done\n'); }
}
const outside = path.join(W, 'outside'); fs.mkdirSync(outside); fs.writeFileSync(path.join(outside, 'x.md'), 'a\n');

const ROLES = { 'joe-gardner': ['toon-crew:joe-gardner', 'joe-gardner'], kevin: ['toon-crew:kevin', 'kevin'] };
const call = (tool_name, file, { agent_type = 'toon-crew:kevin', data = DATA_A, env, agent_id = 'a1', input = {} } = {}) => {
  const tool_input = tool_name === 'Write' ? { file_path: file, content: 'Verdict: done\nTask: x\n', ...input }
    : tool_name === 'MultiEdit' ? { file_path: file, edits: [{ old_string: 'done', new_string: 'blocked' }], ...input }
      : tool_name === 'NotebookEdit' ? { notebook_path: file, new_source: 'x', ...input } : { file_path: file, old_string: 'done', new_string: 'blocked', ...input };
  return evaluate({ tool_name, cwd: project, ...(agent_type ? { agent_type } : {}), ...(agent_id ? { agent_id } : {}), tool_input },
    env ?? { CLAUDE_PROJECT_DIR: project, CLAUDE_PLUGIN_DATA: data });
};
const sh = (command, { agent_type = 'toon-crew:kevin', data = DATA_B } = {}) =>
  evaluate({ tool_name: 'Bash', cwd: project, ...(agent_type ? { agent_type, agent_id: 'a1' } : {}), tool_input: { command } }, { CLAUDE_PROJECT_DIR: project, CLAUDE_PLUGIN_DATA: data });
const ok = (r, what) => assert.equal(r, null, `${what}: ${JSON.stringify(r)}`);
const denied = (r, what) => assert.ok(r?.deny, `${what} should be refused, got ${JSON.stringify(r)}`);
const swapIn = (p, makeLink) => { const saved = `${p}.saved`; fs.renameSync(p, saved); makeLink(p); return () => { fs.rmSync(p, { force: true }); fs.renameSync(saved, p); }; };

test('a read-only role (joe-gardner) and a builder (kevin) CAN Write and Edit .md files in their own two folders', () => {
  for (const [label, data] of LAYOUTS) for (const [id, types] of Object.entries(ROLES)) for (const agent_type of types) for (const kind of ['full', 'summaries']) {
    for (const tool of ['Write', 'Edit', 'MultiEdit']) ok(call(tool, hb(data, kind, id, 'old.md'), { agent_type, data }), `${label} ${agent_type} ${tool} ${kind}`);
    ok(call('Write', hb(data, kind, id), { agent_type, data }), `${label} ${agent_type} new file in ${kind}`);
    ok(call('Write', hb(data, kind, id, `${'a'.repeat(60)}.md`), { agent_type, data }), `${label} ${agent_type} 60-char name`);
  }
});
test('Write may create the folders: a project key and agent folder that do not exist yet are allowed', () => {
  for (const [label, data] of LAYOUTS) for (const id of Object.keys(ROLES)) {
    ok(call('Write', path.join(data, 'projects/new-proj-0000beef/handbacks/summaries', id, '20261101-0900-first.md'), { agent_type: `toon-crew:${id}`, data }), `${label} ${id} fresh project`);
  }
  const fresh = path.join(W, 'fresh-data'); // not even the data folder exists
  ok(call('Write', hb(fresh, 'full', 'joe-gardner'), { agent_type: 'joe-gardner', data: fresh }), 'fresh data folder');
});
test('another role\'s folder is refused', () => {
  for (const [label, data] of LAYOUTS) for (const [id, other] of [['kevin', 'joe-gardner'], ['joe-gardner', 'kevin'], ['kevin', 'kevin-2'], ['kevin', 'bob']]) {
    for (const tool of ['Write', 'Edit']) denied(call(tool, hb(data, 'summaries', other, 'old.md'), { agent_type: `toon-crew:${id}`, data }), `${label} ${id} -> ${other} ${tool}`);
  }
});
test('only .md names of [a-z0-9-], at most 60 characters, directly in the agent folder', () => {
  for (const [label, data] of LAYOUTS) for (const id of Object.keys(ROLES)) {
    const dir = path.dirname(hb(data, 'summaries', id));
    for (const name of ['run.sh', 'x.json', 'x.MD', 'Report.md', 'a.b.md', 'x.md.sh', '.md', `${'a'.repeat(61)}.md`, 'sub/x.md', 'x_y.md'])
      denied(call('Write', path.join(dir, name), { agent_type: `toon-crew:${id}`, data }), `${label} ${id} ${name}`);
    denied(call('Write', path.join(data, 'projects', KEY, 'handbacks/x.md'), { agent_type: id, data }), `${label} ${id} handbacks root`);
    denied(call('Write', path.join(data, 'projects', KEY, 'handbacks/other', id, 'x.md'), { agent_type: id, data }), `${label} ${id} third kind`);
    denied(call('Write', path.join(data, 'projects', 'Bad.Key', 'handbacks/full', id, 'x.md'), { agent_type: id, data }), `${label} ${id} bad key`);
  }
});
test('events.jsonl, limits.json, projects.json and project state stay hook-only', () => {
  for (const [label, data] of LAYOUTS) for (const [id, types] of Object.entries(ROLES)) for (const agent_type of types)
    for (const f of ['events.jsonl', 'limits.json', 'projects.json', `projects/${KEY}/state.json`, 'notes.md', `projects/${KEY}/notes.md`])
      for (const tool of ['Write', 'Edit']) denied(call(tool, path.join(data, f), { agent_type, data }), `${label} ${agent_type} ${tool} ${f}`);
  // Case-folded: the same file spelled with other case is still the data folder on a case-insensitive disk.
  denied(call('Write', path.join(W, 'DATA', 'events.jsonl'), { data: DATA_B }), 'DATA/events.jsonl');
});
test('.. in the path is refused, even when it lands back in the own folder', () => {
  for (const [label, data] of LAYOUTS) for (const id of Object.keys(ROLES)) {
    const dir = path.dirname(hb(data, 'summaries', id));
    denied(call('Write', `${dir}/../${id}/x.md`, { agent_type: id, data }), `${label} ${id} ../own`);
    denied(call('Write', `${dir}/../../full/${id}/x.md`, { agent_type: id, data }), `${label} ${id} ../../full/own`);
    denied(call('Write', `${dir}/../joe-gardner/../../../../../events.jsonl`, { agent_type: id, data }), `${label} ${id} .. to events.jsonl`);
  }
});
test('a symlinked folder or file anywhere below the data folder is refused, inside or outside it', () => {
  for (const [label, data] of LAYOUTS) for (const id of Object.keys(ROLES)) {
    const own = path.dirname(hb(data, 'summaries', id));
    const target = hb(data, 'summaries', id, 'old.md');
    const cases = [
      ['own folder -> outside', own, (p) => fs.symlinkSync(outside, p), path.join(own, 'x.md')],
      ['own folder -> own full folder (realpath still looks right)', own, (p) => fs.symlinkSync(path.dirname(hb(data, 'full', id)), p), path.join(own, 'old.md')],
      ['handbacks -> outside', path.join(data, 'projects', KEY, 'handbacks'), (p) => { fs.mkdirSync(path.join(outside, 'summaries', id), { recursive: true }); fs.symlinkSync(outside, p); }, target],
      ['project key folder -> outside', path.join(data, 'projects', KEY), (p) => fs.symlinkSync(outside, p), target],
      ['own file -> project README', target, (p) => fs.symlinkSync(path.join(project, 'README.md'), p), target],
      ['own file -> own full file', target, (p) => fs.symlinkSync(hb(data, 'full', id, 'old.md'), p), target],
      // Dangling links: realpath fails on them and falls back to the parent, so the path looks canonical; Write would
      // create the file at the link's target. Only the per-component lstat sees these.
      ['dangling own file -> outside', target, (p) => fs.symlinkSync(path.join(outside, `made-by-${id}.sh`), p), target],
      ['dangling own folder -> outside', own, (p) => fs.symlinkSync(path.join(outside, 'no-such-dir'), p), path.join(own, 'x.md')],
    ];
    for (const [what, at, makeLink, file] of cases) {
      const restore = swapIn(at, makeLink);
      try { for (const tool of ['Write', 'Edit']) denied(call(tool, file, { agent_type: `toon-crew:${id}`, data }), `${label} ${id} ${what} ${tool}`); } finally { restore(); }
    }
    // A link from outside the data folder into the own folder: the target is right, the path is not.
    const into = path.join(W, `into-${id}-${path.basename(data)}`); fs.rmSync(into, { force: true }); fs.symlinkSync(own, into);
    denied(call('Write', path.join(into, 'x.md'), { agent_type: id, data }), `${label} ${id} link from outside`);
  }
});
test('a hard-linked file in the own folder is refused (writing it would change the other name)', () => {
  for (const [label, data] of LAYOUTS) {
    const f = hb(data, 'full', 'kevin', 'linked.md'); fs.rmSync(f, { force: true }); fs.linkSync(path.join(outside, 'x.md'), f);
    try { denied(call('Write', f, { data }), `${label} hard link`); } finally { fs.rmSync(f); }
  }
});
test('NotebookEdit is refused in the own folder', () => {
  for (const [label, data] of LAYOUTS) denied(call('NotebookEdit', hb(data, 'full', 'kevin', 'old.md'), { data }), label);
});
test('unset CLAUDE_PLUGIN_DATA allows nothing new: the same calls pass only when it is set', () => {
  for (const [label, data] of LAYOUTS) for (const [id, agent_type] of [['kevin', 'toon-crew:kevin'], ['joe-gardner', 'toon-crew:joe-gardner']]) {
    const f = hb(data, 'summaries', id, 'old.md');
    if (!(id === 'kevin' && data === DATA_B)) { // a builder outside ~/.claude/plugins was never limited, set or not
      ok(call('Write', f, { agent_type, data }), `${label} ${id} set`);
      for (const env of [{ CLAUDE_PROJECT_DIR: project }, { CLAUDE_PROJECT_DIR: project, CLAUDE_PLUGIN_DATA: '' }, { CLAUDE_PROJECT_DIR: project, CLAUDE_PLUGIN_DATA: path.relative(project, data) }])
        denied(call('Write', f, { agent_type, env }), `${label} ${id} env ${JSON.stringify(env.CLAUDE_PLUGIN_DATA)}`);
    }
  }
});
test('the data folder given through a symlink: both spellings of the own folder work, the rest is still refused', () => {
  const link = path.join(W, 'data-link'); fs.rmSync(link, { force: true }); fs.symlinkSync(DATA_B, link);
  for (const id of Object.keys(ROLES)) for (const base of [link, DATA_B]) {
    ok(call('Write', hb(base, 'summaries', id, 'old.md'), { agent_type: id, data: link }), `${id} via ${path.basename(base)}`);
    denied(call('Write', path.join(base, 'events.jsonl'), { agent_type: id, data: link }), `${id} events via ${path.basename(base)}`);
  }
});
test('crew shell writes into the data folder are refused; Write is the only way in', () => {
  for (const c of [`echo x > ${DATA_B}/events.jsonl`, `echo x >> ${hb(DATA_B, 'summaries', 'kevin', 'old.md')}`, `cp /tmp/a ${DATA_B}/limits.json`, `rm ${DATA_B}/projects.json`,
    `tee ${hb(DATA_B, 'full', 'kevin')} < /dev/null`, `sed -i '' s/a/b/ ${DATA_B}/events.jsonl`, `mv /tmp/a ${DATA_B}/x`]) {
    denied(sh(c), `kevin: ${c}`);
    denied(sh(c, { agent_type: 'toon-crew:joe-gardner' }), `joe-gardner: ${c}`);
  }
  ok(sh(`cat ${DATA_B}/events.jsonl`), 'reading is fine');
  ok(sh(`echo x > ${DATA_B}/events.jsonl`, { agent_type: null }), 'the main session is unchanged');
});
test('the main session, Doraemon and agents that are not crew keep today\'s rules', () => {
  const main = { agent_type: null, agent_id: null };
  ok(call('Write', path.join(DATA_B, 'events.jsonl'), { ...main, data: DATA_B }), 'main: custom data folder is writable as before');
  denied(call('Write', path.join(DATA_A, 'events.jsonl'), { ...main, data: DATA_A }), 'main: ~/.claude/plugins stays protected');
  denied(call('Write', hb(DATA_A, 'summaries', 'doraemon'), { agent_type: 'toon-crew:doraemon', agent_id: null, data: DATA_A }), 'doraemon: as today');
  ok(call('Write', path.join(DATA_B, 'events.jsonl'), { agent_type: 'general-purpose', data: DATA_B }), 'non-crew subagent: as today');
  // Other rules hold: a builder still writes project files, a read-only role still cannot.
  ok(call('Write', path.join(project, 'README.md'), { data: DATA_A }), 'kevin project file');
  denied(call('Write', path.join(project, 'README.md'), { agent_type: 'joe-gardner', data: DATA_A }), 'joe-gardner project file');
  denied(call('Edit', path.join(project, 'README.md'), { agent_type: 'toon-crew:joe-gardner', data: DATA_A }), 'joe-gardner Edit project file');
});
test('CLI end to end: own summary exits 0; events.jsonl, another role and no CLAUDE_PLUGIN_DATA exit 2', () => {
  const env = { ...process.env, CLAUDE_PROJECT_DIR: project, CLAUDE_PLUGIN_DATA: DATA_A };
  const run = (file, e = env) => spawnSync('node', ['--no-warnings', GUARD], { encoding: 'utf8', env: e,
    input: JSON.stringify({ hook_event_name: 'PreToolUse', cwd: project, agent_type: 'toon-crew:joe-gardner', agent_id: 'a1', tool_name: 'Write', tool_input: { file_path: file, content: 'Verdict: done\n' } }) });
  assert.equal(run(hb(DATA_A, 'summaries', 'joe-gardner')).status, 0);
  assert.equal(run(path.join(DATA_A, 'events.jsonl')).status, 2);
  assert.equal(run(hb(DATA_A, 'summaries', 'kevin')).status, 2);
  const { CLAUDE_PLUGIN_DATA: _drop, ...unset } = env;
  assert.equal(run(hb(DATA_A, 'summaries', 'joe-gardner'), unset).status, 2);
});
