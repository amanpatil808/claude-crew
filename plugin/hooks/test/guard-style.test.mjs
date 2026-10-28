// Nobita builds styles: Edit and Write on style and visual files in his own checkout (worktree or project), nothing else.
// He stays read-only everywhere else: no logic, tests, config, hooks or .claude files, no shell writes, no commit or push.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { evaluate } from '../guard.mjs';

const GUARD = path.join(import.meta.dirname, '..', 'guard.mjs');
// Outside the system temp dir: read-only roles may write anywhere under it.
const W = fs.realpathSync(fs.mkdtempSync(path.join(import.meta.dirname, '.work-')));
process.on('exit', () => fs.rmSync(W, { recursive: true, force: true }));
const project = path.join(W, 'proj');
const tree = path.join(project, '.claude/worktrees/agent-nobita'); // his isolated worktree, as Claude Code lays it out
const FILES = ['plugin/board/room.css', 'plugin/board/travel.css', 'plugin/board/room.js', 'plugin/board/travel.js', 'plugin/board/page.html', 'plugin/board/server.ts',
  'plugin/hooks/hooks.json', 'plugin/hooks/guard.mjs', 'plugin/board/test/travel.test.ts', 'plugin/board/test/fixtures/shot.png', 'docs/design/x.md', 'docs/research/r.md', 'docs/x.md',
  '.claude/agent-memory/toon-crew-nobita/MEMORY.md', '.claude/agent-memory/toon-crew-shinchan/MEMORY.md', '.claude/agents/x.css', '.github/workflows/ci.yml', '.github/logo.svg',
  'plugin/board/tokens.json', 'plugin/board/tokens.ts', 'plugin/board/theme.js', 'plugin/board/theme.scss', 'plugin/board/a.stories.css', 'node_modules/x/a.css', 'assets/icon.svg', 'assets/hero.png'];
for (const root of [project, tree]) {
  fs.mkdirSync(root, { recursive: true });
  for (const f of FILES) { fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true }); fs.writeFileSync(path.join(root, f), 'a\n'); }
}
fs.mkdirSync(path.join(project, '.git')); fs.writeFileSync(path.join(tree, '.git'), `gitdir: ${project}/.git/worktrees/agent-nobita\n`);

const call = (tool_name, file, { cwd = tree, projectDir = project, agent_type = 'toon-crew:nobita', input = {} } = {}) => {
  const p = path.isAbsolute(file) ? file : path.join(cwd, file);
  const tool_input = tool_name === 'Write' ? { file_path: p, content: '.a { color: red; }\n', ...input }
    : tool_name === 'MultiEdit' ? { file_path: p, edits: [{ old_string: 'a', new_string: 'b' }], ...input }
      : tool_name === 'NotebookEdit' ? { notebook_path: p, new_source: 'x', ...input } : { file_path: p, old_string: 'a', new_string: 'b', ...input };
  return evaluate({ tool_name, cwd, agent_type, tool_input }, { CLAUDE_PROJECT_DIR: projectDir });
};
const ok = (r, what) => assert.equal(r, null, `${what}: ${JSON.stringify(r)}`);
const denied = (r, what) => assert.ok(r?.deny, `${what} should be refused, got ${JSON.stringify(r)}`);
// Both places Claude Code may point CLAUDE_PROJECT_DIR at for a worktree agent, and the plain project checkout.
const SETUPS = [['worktree, project dir = main checkout', { cwd: tree, projectDir: project }], ['worktree, project dir = worktree', { cwd: tree, projectDir: tree }], ['project checkout', { cwd: project, projectDir: project }]];

test('nobita CAN Edit, MultiEdit and Write room.css, travel.css and docs/design/x.md (failed on the old guard)', () => {
  for (const [label, s] of SETUPS) for (const agent_type of ['nobita', 'toon-crew:nobita', 'toon-crew:NOBITA']) {
    for (const f of ['plugin/board/room.css', 'plugin/board/travel.css', 'docs/design/x.md', 'docs/design/new/board.md'])
      for (const tool of ['Edit', 'MultiEdit', 'Write']) ok(call(tool, f, { ...s, agent_type, input: f.endsWith('.md') ? { content: '# notes' } : {} }), `${label} ${agent_type} ${tool} ${f}`);
  }
});
test('nobita CAN Edit visual assets and design-token data files', () => {
  for (const [label, s] of SETUPS) for (const f of ['assets/icon.svg', 'assets/hero.png', 'plugin/board/theme.scss', 'plugin/board/tokens.json', 'assets/new/logo.SVG'])
    ok(call('Edit', f, s), `${label} Edit ${f}`);
});
test('nobita CANNOT Edit or Write logic, markup, server, hooks, tests or config (held before: Edit was refused outright)', () => {
  for (const [label, s] of SETUPS) for (const f of ['plugin/board/room.js', 'plugin/board/travel.js', 'plugin/board/page.html', 'plugin/board/server.ts', 'plugin/hooks/hooks.json',
    'plugin/hooks/guard.mjs', 'plugin/board/test/travel.test.ts', 'plugin/board/tokens.ts', 'plugin/board/theme.js', 'docs/x.md', 'README.md'])
    for (const tool of ['Edit', 'MultiEdit', 'Write']) denied(call(tool, f, s), `${label} ${tool} ${f}`);
});
test('nobita CANNOT Edit another agent\'s memory, or any .claude file even with a style extension (held before)', () => {
  for (const [label, s] of SETUPS) for (const f of ['.claude/agent-memory/toon-crew-shinchan/MEMORY.md', '.claude/agents/x.css', '.claude/agent-memory/toon-crew-nobita/MEMORY.md'])
    for (const tool of ['Edit', 'MultiEdit', 'Write']) if (!(tool === 'Write' && f.includes('toon-crew-nobita/'))) denied(call(tool, f, s), `${label} ${tool} ${f}`);
  // Own memory: Write as before, now also in his worktree; Edit still refused there.
  for (const [label, s] of SETUPS) ok(call('Write', '.claude/agent-memory/toon-crew-nobita/MEMORY.md', { ...s, input: { content: '- a clean lesson (seen 1) [crew]' } }), `${label} own memory`);
});
test('a style extension does not open CI, dependencies, test fixtures, stories or notebooks', () => {
  for (const [label, s] of SETUPS) {
    for (const f of ['.github/logo.svg', '.github/workflows/ci.yml', 'node_modules/x/a.css', 'plugin/board/test/fixtures/shot.png', 'plugin/board/a.stories.css', 'docs/design/.hidden/a.css'])
      for (const tool of ['Edit', 'Write']) denied(call(tool, f, s), `${label} ${tool} ${f}`);
    denied(call('NotebookEdit', 'plugin/board/room.css', s), `${label} NotebookEdit`);
  }
});
test('the allow-list is checked on the real path: links and .. cannot reach logic files', () => {
  const link = (root, name, to) => { const p = path.join(root, name); fs.rmSync(p, { force: true, recursive: true }); fs.symlinkSync(to, p); return p; };
  // A file link with a style name that points inside the checkout at logic: realpath, not the name, decides.
  link(tree, 'plugin/board/evil.css', path.join(tree, 'plugin/board/room.js'));
  denied(call('Edit', 'plugin/board/evil.css'), 'evil.css -> room.js');
  // A folder link inside the checkout: docs/design -> plugin/hooks makes docs/design/hooks.json the real hooks.json.
  const d = path.join(tree, 'docs/design'); const saved = path.join(W, 'saved-design'); fs.renameSync(d, saved);
  fs.symlinkSync(path.join(tree, 'plugin/hooks'), d);
  try { denied(call('Edit', 'docs/design/hooks.json'), 'docs/design -> plugin/hooks'); ok(call('Edit', 'plugin/board/room.css'), 'room.css still fine'); }
  finally { fs.rmSync(d); fs.renameSync(saved, d); }
  // A link to a style file outside his checkout.
  link(tree, 'assets/out.css', path.join(project, 'plugin/board/room.css'));
  denied(call('Edit', 'assets/out.css'), 'link out of the worktree');
  denied(call('Edit', 'plugin/board/../../plugin/board/room.js'), '.. to logic');
});
test('from his worktree he cannot style the main checkout; from the main checkout he cannot style a worktree', () => {
  denied(call('Edit', path.join(project, 'plugin/board/room.css'), { cwd: tree, projectDir: project }), 'main checkout from worktree');
  denied(call('Edit', path.join(tree, 'plugin/board/room.css'), { cwd: project, projectDir: project }), 'worktree from main checkout (.claude/)');
  denied(call('Edit', path.join(W, 'elsewhere.css'), { cwd: tree, projectDir: project }), 'outside the project');
  // A cwd outside the project falls back to the project, never to that other checkout.
  const other = path.join(W, 'other'); fs.mkdirSync(path.join(other, '.git'), { recursive: true }); fs.writeFileSync(path.join(other, 'a.css'), 'a');
  denied(call('Edit', path.join(other, 'a.css'), { cwd: other, projectDir: project }), 'other checkout');
});
test('docs/design keeps the secret scan for Edit as well as Write; CSS and SVG data do not trip it', () => {
  denied(call('Edit', 'docs/design/x.md', { input: { new_string: 'key ghp_' + 'ABCDEFGHIJKLMNOPQRSTUVWX' } }), 'token in a design doc');
  denied(call('Write', 'docs/design/x.md', { input: { content: 'ring 9876543210' } }), 'phone in a design doc');
  ok(call('Write', 'assets/icon.svg', { input: { content: '<svg><path d="M 612 345 6789 1 L 2 3"/></svg>' } }), 'svg path numbers');
});
test('only nobita gets the style list: other read-only roles still cannot Edit room.css; builders are unchanged', () => {
  for (const agent_type of ['toon-crew:stuart', 'joe-gardner', 'toon-crew:twenty-two', 'toon-crew:ninja-hattori', 'dekisugi', 'olaf'])
    for (const tool of ['Edit', 'Write']) denied(call(tool, 'plugin/board/room.css', { agent_type }), `${agent_type} ${tool}`);
  for (const agent_type of ['toon-crew:shinchan', 'toon-crew:kevin']) ok(call('Edit', 'plugin/board/room.js', { agent_type }), agent_type);
});
test('nobita stays read-only in the shell: no shell writes to styles, no commit, no push (push failed on the old guard)', () => {
  const sh = (command, agent_type = 'toon-crew:nobita') => evaluate({ tool_name: 'Bash', cwd: tree, agent_type, tool_input: { command } }, { CLAUDE_PROJECT_DIR: project });
  for (const c of ['echo x > plugin/board/room.css', 'cp /tmp/a.css plugin/board/room.css', 'sed -i "" s/a/b/ plugin/board/room.css', 'git add plugin/board/room.css', 'git commit -m style', 'git commit -am x',
    'git push origin feat/nobita', 'git push -u origin HEAD', 'git -C . push origin feat/x', 'git push']) denied(sh(c), c);
  for (const agent_type of ['toon-crew:stuart', 'joe-gardner']) denied(sh('git push origin feat/x', agent_type), `${agent_type} push`);
  ok(sh('git status'), 'git status'); ok(sh('git diff -- plugin/board/room.css'), 'git diff');
  for (const tool_name of ['SendMessage', 'CronCreate', 'Workflow', 'RemoteTrigger']) denied(evaluate({ tool_name, cwd: tree, agent_type: 'toon-crew:nobita', tool_input: { to: 'x', message: 'y' } }, { CLAUDE_PROJECT_DIR: project }), tool_name);
  denied(evaluate({ tool_name: 'Agent', cwd: tree, agent_type: 'toon-crew:nobita', tool_input: { prompt: 'x', subagent_type: 'toon-crew:shinchan' } }, { CLAUDE_PROJECT_DIR: project }), 'Agent');
});
test('CLI end to end: Edit room.css exits 0, Edit room.js and git push exit 2', () => {
  const run = (o) => spawnSync('node', ['--no-warnings', GUARD], { input: JSON.stringify({ hook_event_name: 'PreToolUse', cwd: tree, agent_type: 'toon-crew:nobita', ...o }), encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: project } });
  assert.equal(run({ tool_name: 'Edit', tool_input: { file_path: path.join(tree, 'plugin/board/room.css'), old_string: 'a', new_string: 'b' } }).status, 0);
  assert.equal(run({ tool_name: 'Edit', tool_input: { file_path: path.join(tree, 'plugin/board/room.js'), old_string: 'a', new_string: 'b' } }).status, 2);
  assert.equal(run({ tool_name: 'Bash', tool_input: { command: 'git push origin feat/nobita' } }).status, 2);
});
