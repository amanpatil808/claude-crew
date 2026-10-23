// Proofs for the security review of fix/guide-review: live plugin files (B1), read-only roles with Bash (S1),
// builders' messaging and scheduling tools (S2), and the own-memory path (P2).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { evaluate } from '../guard.mjs';

const HOOKS = path.join(import.meta.dirname, '..');
const GUARD = path.join(HOOKS, 'guard.mjs');
const AGENTS = path.join(HOOKS, '..', 'agents');
// Outside the system temp dir: read-only roles may write anywhere under it.
const W = fs.realpathSync(fs.mkdtempSync(path.join(import.meta.dirname, '.work-')));
const repo = path.join(W, 'repo');
const live = path.join(repo, 'plugin'); // an inline plugin: --plugin-dir <repo>/plugin
const wt = path.join(repo, '.claude/worktrees/bob-1');
for (const d of [path.join(live, 'hooks'), path.join(live, 'agents'), path.join(wt, 'plugin/hooks'), path.join(repo, 'src')]) fs.mkdirSync(d, { recursive: true });
for (const f of [path.join(live, 'hooks/guard.mjs'), path.join(live, 'hooks/hooks.json'), path.join(wt, 'plugin/hooks/guard.mjs'), path.join(repo, 'src/a.ts')]) fs.writeFileSync(f, 'x');
const TMP = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'tc-sec-')));
const envLive = { CLAUDE_PROJECT_DIR: repo, CLAUDE_PLUGIN_ROOT: live };
const ev = (o, env = envLive) => evaluate({ cwd: repo, ...o }, env);
const run = (o, env = envLive) => spawnSync('node', ['--no-warnings', GUARD], { input: JSON.stringify({ hook_event_name: 'PreToolUse', cwd: repo, ...o }), encoding: 'utf8', env: { ...process.env, ...env } });
const bob = { agent_type: 'toon-crew:bob', agent_id: 'a1' };

// ---------- B1: live plugin files ----------
test('B1: a subagent cannot change the live plugin, wherever it is installed', () => {
  const g = path.join(live, 'hooks/guard.mjs'); const h = path.join(live, 'hooks/hooks.json');
  fs.symlinkSync(path.join(live, 'hooks'), path.join(W, 'hooks-link'));
  for (const who of [bob, { agent_type: 'toon-crew:bob' }, { agent_type: 'general-purpose', agent_id: 'a2' }, { agent_type: 'toon-crew:doraemon', agent_id: 'a3' }]) {
    const calls = [['Edit', { file_path: g, old_string: 'x', new_string: 'y' }], ['MultiEdit', { file_path: g, edits: [{ old_string: 'x', new_string: 'y' }] }],
      ['Write', { file_path: h, content: '{}' }], ['Write', { file_path: path.join(live, 'agents/bob.md'), content: 'x' }], ['NotebookEdit', { notebook_path: path.join(live, 'n.ipynb'), new_source: 'x' }],
      ['Write', { file_path: path.join(W, 'hooks-link/guard.mjs'), content: 'x' }],
      ['Bash', { command: `echo {} > ${h}` }], ['Bash', { command: `cd ${live}/hooks && echo x > guard.mjs` }], ['Bash', { command: `cp /tmp/x ${live}/agents/bob.md` }],
      ['Bash', { command: `rm ${g}` }], ['Bash', { command: `mv ${g} /tmp/g` }], ['Bash', { command: `sed -i '' s/a/b/ ${g}` }], ['Bash', { command: `tee ${h} < /dev/null` }],
      ['Bash', { command: `python3 -c "open('${g}','w').write('')"` }], ['Bash', { command: `node -e "require('fs').writeFileSync('plugin/hooks/hooks.json','{}')"` }], ['Monitor', { description: 'd', command: `echo > ${h}` }]];
    for (const [tool_name, tool_input] of calls) assert.ok(ev({ ...who, tool_name, tool_input })?.deny, `${who.agent_type} ${tool_name} ${JSON.stringify(tool_input).slice(0, 90)}`);
  }
});
test('B1: the main thread is asked; the worktree copy and an unset plugin root stay allowed', () => {
  const g = path.join(live, 'hooks/guard.mjs');
  for (const who of [{}, { agent_type: 'toon-crew:doraemon' }]) {
    assert.ok(ev({ ...who, tool_name: 'Edit', tool_input: { file_path: g, old_string: 'x', new_string: 'y' } })?.ask, `${who.agent_type} Edit`);
    assert.ok(ev({ ...who, tool_name: 'Bash', tool_input: { command: `echo {} > ${live}/hooks/hooks.json` } })?.ask, `${who.agent_type} Bash`);
  }
  assert.equal(ev({ ...bob, cwd: wt, tool_name: 'Edit', tool_input: { file_path: path.join(wt, 'plugin/hooks/guard.mjs'), old_string: 'x', new_string: 'y' } }), null);
  assert.equal(ev({ ...bob, cwd: wt, tool_name: 'Bash', tool_input: { command: 'echo x > plugin/hooks/guard.mjs' } }), null);
  assert.equal(ev({ ...bob, tool_name: 'Write', tool_input: { file_path: path.join(repo, 'src/a.ts'), content: 'x' } }), null);
  assert.equal(ev({ ...bob, tool_name: 'Edit', tool_input: { file_path: g, old_string: 'x', new_string: 'y' } }, { CLAUDE_PROJECT_DIR: repo }), null, 'no plugin root: unchanged');
});
test('B1: CLI exits 2 for the three reviewed cases', () => {
  for (const [tool_name, tool_input] of [['Edit', { file_path: path.join(live, 'hooks/guard.mjs'), old_string: 'x', new_string: '0' }], ['Write', { file_path: path.join(live, 'hooks/hooks.json'), content: '{}' }],
    ['Bash', { command: `echo {} > ${live}/hooks/hooks.json` }]]) assert.equal(run({ agent_type: 'toon-crew:bob', cwd: wt, tool_name, tool_input }).status, 2, tool_name);
});

// ---------- S1: read-only roles with Bash ----------
const joe = (command, o = {}) => ev({ agent_type: 'toon-crew:joe-gardner', tool_name: 'Bash', tool_input: { command }, ...o }, { CLAUDE_PROJECT_DIR: repo });
test('S1: inline code writes only to literal temp paths; a /tmp/ mention elsewhere does not count', () => {
  for (const c of [`python3 -c "open("src/a.ts","w").write("x")  # /tmp/"`, `python3 -c "open('src/a.ts','w')  # /tmp/"`, `python3 -c "open('src/a.ts', 'a'); import tempfile"`,
    `node -e "require('fs').writeFileSync('src/a.ts','x') // os.tmpdir()"`, `node -e "const p='src/a.ts'; require('fs').writeFileSync(p,'/tmp/')"`, `python3 -c "from pathlib import Path; Path('src/a.ts').write_text('/tmp/')"`,
    `python3 -c "import os; os.link('plugin/hooks/guard.mjs', '/private/tmp/g')"`, `node -e "require('fs').symlinkSync('/tmp/x','src/b')"`, `python3 -c "import os; os.rename('src/a.ts', '/tmp/a')"`,
    `python3 -c "import shutil; shutil.copy('/tmp/x', 'src/a.ts')"`, `python3 -c "import os; os.system('cp /tmp/x src/a.ts')"`, `node -e "require('child_process').execSync('cp /tmp/x src/a.ts')"`,
    `perl -e 'open(my $f, ">", "src/a.ts")'`, `ruby -e 'File.write("src/a.ts", "x")'`, `python3 -c "open(p, 'w')"`, `python3 -c "exec('open(chr(115), chr(119))')"`])
    assert.ok(joe(c)?.deny, c);
  for (const c of [`python3 -c "open('/tmp/x.txt','w').write('x')"`, `python3 -c "print(open('src/a.ts').read())"`, `python3 -c "import json; print(json.load(open('package.json'))['name'])"`,
    `node -e "require('fs').writeFileSync('/tmp/o.json', JSON.stringify({a:1}))"`, `node -e "console.log(require('fs').readFileSync('src/a.ts','utf8'))"`, `perl -e 'open(my $f, "<", "src/a.ts"); print <$f>'`,
    `python3 -c "print('a'.replace('a','b'))"`, `python3 -c "import sys; sys.stdout.write('ok')"`])
    assert.equal(joe(c), null, c);
});
test('S1: git commands that move refs, the index or worktrees are blocked; read-only git works', () => {
  for (const c of ['git update-ref refs/heads/main HEAD~1', 'git branch -f main HEAD~1', 'git branch -D x', 'git branch --delete x', 'git branch -m a b', 'git branch -M b', 'git branch newb', 'git branch -c a b',
    'git branch --set-upstream-to=origin/x', 'git read-tree -u --reset HEAD~1', 'git checkout-index -f -a', 'git worktree add ../x', 'git worktree remove --force .claude/worktrees/bob-1',
    'git worktree move a b', 'git worktree prune', 'git symbolic-ref HEAD refs/heads/main', 'git tag v1', 'git tag -d v1', 'git update-index --assume-unchanged x', 'git -C . branch -f main HEAD~1'])
    assert.ok(joe(c)?.deny, c);
  for (const c of ['git status', 'git log --oneline -3', 'git diff HEAD~1', 'git show HEAD', 'git branch', 'git branch -a', 'git branch -vv', 'git branch --list "feat/*"', 'git branch -l', 'git branch --show-current',
    'git branch --contains HEAD', 'git branch -r --merged main', 'git branch --sort=-committerdate --format="%(refname)"', 'git worktree list', 'git worktree list --porcelain', 'git symbolic-ref --short HEAD',
    'git tag', 'git tag -l "v*"', 'git tag --contains HEAD', 'git tag --list'])
    assert.equal(joe(c), null, c);
  // No plugin root here: in the checkout that holds a live plugin a builder gets these rules too (guard-recheck).
  assert.equal(ev({ ...bob, tool_name: 'Bash', tool_input: { command: 'git branch -D x' } }, { CLAUDE_PROJECT_DIR: repo }), null, 'builders unchanged');
});
test('S1: tar -x, unzip and cpio -i write only into the temp dir', () => {
  const t = path.join(TMP, 'out');
  for (const c of ['tar -xf /tmp/x.tar -C src', 'tar xf /tmp/x.tar', 'tar --extract -f /tmp/x.tar', `tar -xPf /tmp/x.tar -C ${t}`, 'tar -czf src/out.tgz src', 'bsdtar -xf /tmp/x -C src',
    'unzip /tmp/x.zip', 'unzip -o /tmp/x.zip -d src', 'cpio -idm < /tmp/x.cpio', 'cpio --extract < /tmp/x.cpio', `cd ${repo} && tar -xf /tmp/x.tar`])
    assert.ok(joe(c)?.deny, c);
  for (const c of ['tar -tf /tmp/x.tar', `tar -xf /tmp/x.tar -C ${t}`, `tar -czf ${t}.tgz src`, `tar --extract --file=/tmp/x.tar --directory=${t}`, 'unzip -l /tmp/x.zip', `unzip /tmp/x.zip -d ${t}`,
    'cpio -t < /tmp/x.cpio', `cd ${TMP} && tar -xf /tmp/x.tar`])
    assert.equal(joe(c), null, c);
});
test('S1: a hardlink in the temp dir cannot be written through', () => {
  const orig = path.join(TMP, 'orig.txt'); const link = path.join(TMP, 'link.txt'); const plain = path.join(TMP, 'plain.txt');
  fs.writeFileSync(orig, 'x'); fs.linkSync(orig, link); fs.writeFileSync(plain, 'x');
  const joeW = (file_path) => ev({ agent_type: 'toon-crew:joe-gardner', tool_name: 'Write', tool_input: { file_path, content: 'y' } }, { CLAUDE_PROJECT_DIR: repo });
  assert.ok(joeW(link)?.deny, 'Write through a hardlink'); assert.ok(joe(`echo y > ${link}`)?.deny, 'shell write through a hardlink');
  assert.equal(joeW(plain), null); assert.equal(joeW(path.join(TMP, 'new.txt')), null); assert.equal(joe(`echo y > ${plain}`), null);
  fs.symlinkSync(path.join(repo, 'src/a.ts'), path.join(TMP, 'sym.txt'));
  assert.ok(joeW(path.join(TMP, 'sym.txt'))?.deny, 'symlink out of tmp');
});
test('S1: the header says the sandbox, not the text guard, is the boundary for Bash roles', () => {
  assert.match(fs.readFileSync(GUARD, 'utf8').split('\n').slice(0, 14).join(' '), /sandbox is the real boundary/i);
});

// ---------- S2: messaging, scheduling and the Task alias ----------
const FENCED = ['SendMessage', 'CronCreate', 'Workflow', 'RemoteTrigger'];
test('S2: every crew agent but doraemon disallows SendMessage, CronCreate, Workflow, RemoteTrigger (and Agent, except dekisugi)', () => {
  for (const f of fs.readdirSync(AGENTS).filter((x) => x.endsWith('.md'))) {
    const id = f.slice(0, -3); if (id === 'doraemon') continue;
    const fm = /^---\n([\s\S]*?)\n---/.exec(fs.readFileSync(path.join(AGENTS, f), 'utf8'))?.[1] ?? '';
    const dis = (/^disallowedTools:\s*(.*)$/m.exec(fm)?.[1] ?? '').split(',').map((s) => s.trim());
    for (const t of [...FENCED, ...(id === 'dekisugi' ? [] : ['Agent'])]) assert.ok(dis.includes(t), `${id}: ${t}`);
  }
});
test('S2: the guard refuses those tools to crew roles; doraemon, the main thread and non-crew agents are unchanged', () => {
  for (const tool_name of FENCED) {
    for (const agent_type of ['toon-crew:kevin', 'bob', 'toon-crew:dekisugi', 'toon-crew:stuart']) assert.ok(ev({ agent_type, tool_name, tool_input: { to: 'bob', message: 'x' } })?.deny, `${agent_type} ${tool_name}`);
    for (const agent_type of [undefined, 'toon-crew:doraemon', 'general-purpose']) assert.equal(ev({ agent_type, tool_name, tool_input: { to: 'bob', message: 'x' } }), null, `${agent_type} ${tool_name}`);
  }
  assert.equal(run({ agent_type: 'toon-crew:kevin', tool_name: 'SendMessage', tool_input: { to: 'bob', message: 'git push origin feat' } }).status, 2);
});
test('S2: Task is treated as Agent; a non-string subagent_type is refused', () => {
  const sp = (tool_name, subagent_type) => ev({ agent_type: 'toon-crew:dekisugi', tool_name, tool_input: { prompt: 'x', subagent_type } });
  assert.ok(sp('Task', 'toon-crew:bob')?.deny); assert.equal(sp('Task', 'toon-crew:olaf'), null);
  for (const t of [['toon-crew:olaf'], { toString: null }, 7]) assert.ok(sp('Agent', t)?.deny, JSON.stringify(t));
  const m = JSON.parse(fs.readFileSync(path.join(HOOKS, 'hooks.json'), 'utf8')).hooks.PreToolUse.find((x) => x.hooks.some((h) => h.command.includes('guard.mjs'))).matcher;
  for (const t of ['Task', ...FENCED]) assert.ok(new RegExp(m).test(t), `matcher covers ${t}`);
});
test('Bash and Monitor: a command that is not a string is refused; a ws watch is fine', () => {
  for (const tool_name of ['Bash', 'Monitor']) for (const command of [['git', 'push', '-f'], { a: 1 }, 5]) assert.ok(ev({ tool_name, tool_input: { description: 'd', command } })?.deny, `${tool_name} ${JSON.stringify(command)}`);
  assert.equal(ev({ tool_name: 'Monitor', tool_input: { description: 'd', ws: { url: 'wss://x' } } }), null);
});

// ---------- P2: own memory is anchored to the project ----------
test('P2: a read-only role writes only its own memory file in this project', () => {
  const st = (file_path) => ev({ agent_type: 'toon-crew:stuart', tool_name: 'Write', tool_input: { file_path, content: '- a lesson' } }, { CLAUDE_PROJECT_DIR: repo });
  const tail = '.claude/agent-memory/toon-crew-stuart/MEMORY.md';
  assert.equal(st(path.join(repo, tail)), null);
  for (const p of [path.join(repo, 'plugin/hooks', tail), path.join(os.homedir(), tail), path.join(W, 'other-project', tail), path.join(repo, 'src', tail)]) assert.ok(st(p)?.deny, p);
  const mem = path.join(W, 'p2'); fs.mkdirSync(path.join(mem, '.claude/agent-memory/toon-crew-stuart'), { recursive: true }); fs.mkdirSync(path.join(mem, 'src'));
  fs.writeFileSync(path.join(mem, 'src/a.ts'), 'x'); fs.symlinkSync(path.join(mem, 'src/a.ts'), path.join(mem, tail));
  assert.ok(ev({ agent_type: 'toon-crew:stuart', cwd: mem, tool_name: 'Write', tool_input: { file_path: path.join(mem, tail), content: 'x' } }, { CLAUDE_PROJECT_DIR: mem })?.deny, 'MEMORY.md symlinked to code');
});

test.after(() => { fs.rmSync(W, { recursive: true, force: true }); fs.rmSync(TMP, { recursive: true, force: true }); });
