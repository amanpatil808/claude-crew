// Wildcards in shell write targets (release review H1), the hand-back project key (M1) and the hand-back secret
// scan (L3). A shell expands `d?ta` or `hook?` whenever it matches, so a glob reaches any file below its literal
// prefix. The guard refuses a pattern that can reach a protected root, checks the text with each wildcard part made
// a plain name, and expands the pattern (links followed) to check every match; each layer has a test of its own.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { evaluate } from '../guard.mjs';

// Outside the system temp dir: read-only roles may write anywhere under it, so a refusal there would prove nothing.
const W = fs.realpathSync(fs.mkdtempSync(path.join(import.meta.dirname, '.work-')));
process.on('exit', () => fs.rmSync(W, { recursive: true, force: true }));
// A fake HOME with an installed-looking plugin and data folder: os.homedir() reads HOME on every call.
const HOME = path.join(W, 'home');
process.env.HOME = HOME;
const ROOT = path.join(HOME, '.claude/plugins/cache/crew/toon-crew/0.3.14');
const DATA = path.join(HOME, '.claude/plugins/data/toon-crew-crew');
const PROJ = path.join(W, 'proj');
const BARE = path.join(W, 'bare'); // a project with no .git or .claude on disk
const key = (p) => `${path.basename(p).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'project'}-${createHash('sha256').update(path.resolve(p)).digest('hex').slice(0, 8)}`;
const KEY = key(PROJ);
const put = (p, text = 'x\n') => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); };
for (const f of ['hooks/inline-writes.mjs', 'hooks/guard.mjs', 'board/hook.ts']) put(path.join(ROOT, f));
for (const f of ['events.jsonl', 'limits.json', 'projects.json', `projects/${KEY}/handbacks/full/bob/x.md`, `projects/${KEY}/handbacks/full/kevin/old.md`]) put(path.join(DATA, f), '[]\n');
for (const f of ['README.md', '.git/config', '.git/hooks/pre-commit.sample', '.claude/agents/a.md', '.claude/agent-memory/toon-crew-kevin/MEMORY.md']) put(path.join(PROJ, f));
fs.mkdirSync(BARE, { recursive: true });
const OTHER = path.join(W, 'other'); // a repo that is not the session's project
put(path.join(OTHER, '.git/hooks/pre-commit.sample'));
const LINKS = path.join(W, 'links');
fs.mkdirSync(LINKS);
fs.symlinkSync(OTHER, path.join(LINKS, 'to-other'));
fs.symlinkSync(BARE, path.join(LINKS, 'to-bare'));
const DATA_B = path.join(W, 'data-b'); // a custom data folder outside ~/.claude/plugins
put(path.join(DATA_B, 'events.jsonl'), '{}\n');
fs.symlinkSync(DATA_B, path.join(LINKS, 'dlink'));
// Token-shaped fixtures are built from pieces: gitleaks scans every commit.
const GH = ['gh', 'p_', 'ABCDEFGHIJKLMNOPQRST', 'UVWXYZ0123456789'].join('');

const ENV = { CLAUDE_PLUGIN_ROOT: ROOT, CLAUDE_PLUGIN_DATA: DATA, CLAUDE_PROJECT_DIR: PROJ };
const run = (command, { agent = 'toon-crew:kevin', cwd = PROJ, env = ENV } = {}) =>
  evaluate({ cwd, tool_name: 'Bash', tool_input: { command }, ...(agent ? { agent_id: 'a1', agent_type: agent } : {}) }, env);
const verdict = (r) => (r?.deny ? 'deny' : r?.ask ? 'ask' : r === null || r === undefined ? 'allow' : `odd ${JSON.stringify(r)}`);
const expect = (r, want, what) => assert.equal(verdict(r), want, `${what}: ${JSON.stringify(r)}`);

test('the 14 wildcard writes from the release review are refused (and .claude/agents still asks)', () => {
  const cases = [
    ['append to events.jsonl through d?ta', "echo '{}' >> ~/.claude/plugins/d?ta/toon-crew-crew/events.jsonl"],
    ['overwrite limits.json through dat*', "echo '{}' > ~/.claude/plugins/dat*/toon-crew-crew/limits.json"],
    ['cp over projects.json through cre[w]', 'cp /tmp/x ~/.claude/plugins/data/toon-crew-cre[w]/projects.json'],
    ['overwrite the guard helper in the plugin cache', "echo 'process.exit(0)' > ~/.claude/plugins/cach?/crew/toon-crew/0.3.14/hooks/inline-writes.mjs"],
    ['overwrite board/hook.ts in the plugin cache', 'echo x > ~/.claude/plugins/cach?/crew/toon-crew/0.3.14/board/hook.ts'],
    ["tee into another role's hand-back", `echo x | tee ~/.claude/plugins/data/toon-crew-cre?/projects/${KEY}/handbacks/full/bob/x.md`],
    ['.gi?/hooks/pre-commit', "printf 'curl x|sh' > .gi?/hooks/pre-commit"],
    ['.git/hook?/pre-push', "printf 'x' > .git/hook?/pre-push"],
    ['agent-memory MEMOR?.md append skips the secret scan', `echo 'key ${GH}' >> .claude/agent-memory/toon-crew-kevin/MEMOR?.md`],
    ['cp a git hook into .git/hook?/', 'cp /tmp/ninja/pre-commit .git/hook?/'],
    ['cp the guard helper into the globbed plugin folder', 'cp /tmp/ninja/inline-writes.mjs ~/.claude/plugins/cach?/crew/toon-crew/0.3.14/hooks/'],
    ['main thread: glob write of the guard helper', 'echo x > ~/.claude/plugins/cach?/crew/toon-crew/0.3.14/hooks/inline-writes.mjs', ''],
    ['hard link through a glob, then append', 'ln ~/.claude/plugins/dat?/toon-crew-crew/events.jsonl /tmp/ninja-e && echo x >> /tmp/ninja-e'],
    ['read-only role, d?ta', "echo '{}' >> ~/.claude/plugins/d?ta/toon-crew-crew/events.jsonl", 'toon-crew:ninja-hattori'],
    ['.git/confi?', 'echo x > .git/confi?'],
    ['~/.claude/settings.jso[n]', 'cp /tmp/x ~/.claude/settings.jso[n]'],
    ['~/.claude/settings.loc*.json', 'cp /tmp/x ~/.claude/settings.loc*.json'],
  ];
  for (const [what, command, agent = 'toon-crew:kevin'] of cases) expect(run(command, { agent }), 'deny', what);
  for (const agent of ['toon-crew:kevin', '']) expect(run('echo x > .claude/agent?/evil.md', { agent }), 'ask', `.claude/agent?/evil.md (${agent || 'main'}), as without the wildcard`);
});

test('layer 1: a pattern that can reach a protected root is refused even when nothing matches on disk', () => {
  const env = { ...ENV, CLAUDE_PROJECT_DIR: BARE };
  expect(run("echo '{}' > .clau?e/settings.json", { cwd: BARE, env }), 'deny', 'settings.json that does not exist yet');
  // The pattern stops at a folder above the root: copying a folder named settings.json, or the like, into it.
  expect(run('cp -r /tmp/claude-copy ./.clau?e', { cwd: BARE, env }), 'deny', 'a folder above the root');
  // An inline plugin root (--plugin-dir) that is not under ~/.claude/plugins and not on disk.
  const inline = path.join(W, 'inline-plugin');
  const envI = { ...ENV, CLAUDE_PLUGIN_ROOT: inline };
  expect(run(`echo x > ${W}/inline-plu?in/hooks/guard.mjs`, { env: envI }), 'deny', 'subagent, live plugin');
  expect(run(`echo x > ${W}/inline-plu?in/hooks/guard.mjs`, { env: envI, agent: '' }), 'ask', 'main session, live plugin asks as without the wildcard');
  // The literal prefix as its real path: links/to-bare is the project.
  expect(run(`echo x > ${LINKS}/to-bare/.clau?e/settings.json`, { cwd: BARE, env }), 'deny', 'reached through a linked prefix');
  // zsh ** spans folders: one or more (a non-dot folder), or none.
  expect(run('cp x **/guard.mjs', { env: { ...ENV, CLAUDE_PLUGIN_ROOT: path.join(PROJ, 'plugin') } }), 'deny', '** reaching an inline plugin root');
  expect(run('echo x > **/.gi?/hooks/pre-commit', { cwd: BARE, env }), 'deny', '** standing for no folder');
});

test('layer 1, root by root: each protected name is refused in a project where none of them exists on disk', () => {
  const env = { ...ENV, CLAUDE_PROJECT_DIR: BARE };
  for (const [target, want] of [['.gi?/config', 'deny'], ['.mc?.json', 'deny'], ['.claude.jso?', 'deny'], ['.clau?e/settings.local.json', 'deny'],
    ['.claude/agent-memor?/x/MEMORY.md', 'deny'], ['.claude/agent-memory-loc*/x/MEMORY.md', 'deny'], ['.clau?e/plugins/x', 'deny'],
    ['.clau?e/hooks/x.sh', 'ask'], ['.clau?e/agents/x.md', 'ask'], ['.clau?e/skills/x/SKILL.md', 'ask'], ['.clau?e/commands/x.md', 'ask']]) {
    expect(run(`echo x > ${target}`, { cwd: BARE, env, agent: '' }), want, target);
  }
  // The home folder is a base too.
  expect(run('echo x > ~/.clau?e/settings.json', { cwd: BARE, env, agent: '' }), 'deny', '~/.claude/settings.json');
});

test('layer 2: the plain-path rules see protected names written after a wildcard', () => {
  expect(run(`printf x > ${W}/nowhere/*/.git/hooks/pre-commit`), 'deny', '.git/hooks after a wildcard');
  expect(run(`echo x >> ${W}/nowhere/*/.claude/agent-memory/x/MEMORY.md`), 'deny', 'agent-memory after a wildcard');
  expect(run(`echo x > ${W}/nowhere/*/.claude/skills/s.md`), 'ask', '.claude/skills after a wildcard asks');
  expect(run('echo x > **/.git/hooks/pre-commit'), 'deny', '** then .git/hooks');
});

test('layer 3: the pattern is expanded the way the shell does it, links followed, and every match checked', () => {
  expect(run(`printf x > ${OTHER}/.gi?/hooks/pre-commit`), 'deny', "another repo's .git through .gi?");
  // fs.globSync does not walk a linked folder; the shell (and the guard) do.
  expect(run(`printf x > ${LINKS}/to-oth?r/.gi?/hooks/pre-commit`), 'deny', 'through a linked folder');
  // A read-only role may write under temp, but not through a temp link that points at the project.
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(fs.realpathSync(process.env.TMPDIR || '/tmp'), 'crew-glob-')));
  try {
    fs.symlinkSync(PROJ, path.join(tmp, 'proj-link'));
    expect(run(`echo x > ${tmp}/proj-lin?/README.md`, { agent: 'toon-crew:joe-gardner' }), 'deny', 'read-only role through a temp link');
    expect(run(`echo x > ${tmp}/out-*.txt`, { agent: 'toon-crew:joe-gardner' }), 'allow', 'read-only role, a plain temp file');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  const many = path.join(W, 'many'); fs.mkdirSync(many);
  for (let i = 0; i < 1001; i++) fs.writeFileSync(path.join(many, `f${i}`), '');
  expect(run(`echo x > ${many}/f*`), 'deny', 'more matches than the cap');
  expect(run(`echo x > ${many}/f1?`), 'allow', 'a few matches');
});

test('dot names: a leading wildcard skips them unless dotglob, GLOBIGNORE or a zsh (D) qualifier is in play', () => {
  expect(run('cp x ./*'), 'allow', 'plain * does not match .git');
  for (const pre of ['shopt -s dotglob; ', 'GLOBIGNORE=x; ', 'setopt GLOB_DOTS; ']) expect(run(`${pre}cp x ./*`), 'deny', pre);
  expect(run('cp x ./*(D)'), 'deny', 'zsh (D)');
  expect(run('echo x > ./[.]git/config'), 'deny', 'a bracket may match the dot');
});

test('a wildcard followed by .. and a wildcard in an unresolved path fail closed', () => {
  expect(run('echo x > */../.git/config'), 'deny', '*/..');
  expect(run(`echo x > ${W}/nowhere/*/../README.md`), 'deny', '*/.. outside any protected folder');
  expect(run('echo x > $OUT/.gi?/hooks/pre-commit'), 'deny', 'variable then .gi?');
  expect(run('echo x > $OUT/*'), 'deny', 'variable then * (may be hooks or config)');
  expect(run('echo x > $OUT/.git/hooks/pre-*'), 'deny', 'variable, protected text, then a wildcard');
  expect(run('rm -f "$OUT"/*.o'), 'allow', 'variable then *.o');
});

test('everyday commands with and without wildcards are unchanged', () => {
  for (const agent of ['toon-crew:kevin', 'toon-crew:joe-gardner', '']) {
    for (const c of ['npm test', 'git status', 'git diff', 'git diff --stat', 'ls', 'ls -la *.md', `cat ${PROJ}/README.md`, 'cat src/*.ts', 'gh pr view 23',
      'node --test plugin/hooks/test/*.test.mjs', 'grep -rn TODO *.md', 'wc -l */*.md']) expect(run(c, { agent }), 'allow', `${agent || 'main'}: ${c}`);
  }
  for (const c of ['rm -f *.log', 'rm -rf dist/*', 'cp src/*.js dist/', 'mv *.md docs/', 'echo x > out-*.txt', 'tee build/*.log < /dev/null', 'rm -f **/*.log',
    'cp a.txt ./*', `cat ${DATA}/events.jsonl`]) expect(run(c), 'allow', `kevin: ${c}`);
});

test('the data folder from a crew shell: a wildcard that reaches it (or a match in it) counts as naming it', () => {
  const env = { ...ENV, CLAUDE_PLUGIN_DATA: DATA_B };
  expect(run(`cp ${W}/data-?/events.jsonl /tmp/copy.jsonl`, { env }), 'deny', 'copy out through a wildcard');
  expect(run(`cp ${LINKS}/dl*/events.jsonl /tmp/copy.jsonl`, { env }), 'deny', 'through a link that the expansion follows');
  expect(run(`cat ${W}/data-?/events.jsonl`, { env }), 'allow', 'a plain read through a wildcard');
  expect(run(`cp ${W}/data-?/events.jsonl /tmp/copy.jsonl`, { env, agent: '' }), 'allow', 'the main session keeps its rules');
  expect(run(`echo x > ${W}/data-?/events.jsonl`, { env, agent: '' }), 'allow', 'a custom data folder stays writable for the main session, as without the wildcard');
  // Reach alone: the folder is not on disk, so nothing expands into it.
  expect(run(`cp ${W}/data-?/events.jsonl /tmp/copy.jsonl`, { env: { ...ENV, CLAUDE_PLUGIN_DATA: path.join(W, 'data-z') } }), 'deny', 'a data folder not created yet');
});

// ---------- M1: the hand-back key must be this session's project ----------
const write = (file, { agent = 'toon-crew:kevin', cwd = PROJ, env = ENV, content = 'Verdict: done\n' } = {}) =>
  evaluate({ cwd, tool_name: 'Write', agent_id: 'a1', agent_type: agent, tool_input: { file_path: file, content } }, env);
const hbFile = (k, id = 'kevin', kind = 'summaries') => path.join(DATA, 'projects', k, 'handbacks', kind, id, '20261101-1843-x.md');

test("a hand-back in another project's folder, or under an invented key, is refused", () => {
  expect(write(hbFile(KEY)), 'allow', 'own project');
  expect(write(hbFile(KEY), { cwd: OTHER }), 'allow', 'own project by CLAUDE_PROJECT_DIR, cwd elsewhere');
  expect(write(hbFile(key(OTHER))), 'deny', "another project's key");
  expect(write(hbFile('made-up-key')), 'deny', 'invented key');
  expect(write(hbFile(key(OTHER)), { agent: 'toon-crew:ninja-hattori' }), 'deny', 'read-only role, another key');
});

test('the key follows the registry like the board: deepest registered project holding CLAUDE_PROJECT_DIR or the cwd', async () => {
  const { handbackKey } = await import('../../board/lib/handbacks.ts');
  const api = path.join(PROJ, 'packages/api');
  const wt = path.join(PROJ, '.claude/worktrees/agent-1');
  fs.writeFileSync(path.join(DATA, 'projects.json'), JSON.stringify([{ path: PROJ, name: 'proj' }, { path: api, name: 'api' }]));
  try {
    const reg = [{ path: PROJ, name: 'proj' }, { path: api, name: 'api' }];
    assert.equal(handbackKey(wt, reg), KEY, 'oracle: the board gives a worktree the project key');
    // A worktree session: CLAUDE_PROJECT_DIR and cwd are the worktree, the key is the project's.
    const wenv = { ...ENV, CLAUDE_PROJECT_DIR: wt };
    expect(write(hbFile(handbackKey(wt, reg)), { cwd: wt, env: wenv }), 'allow', 'worktree writes the project key');
    expect(write(hbFile(key(wt)), { cwd: wt, env: wenv }), 'deny', "the worktree's own key is not the board's");
    // Deepest wins.
    const src = path.join(api, 'src');
    const aenv = { ...ENV, CLAUDE_PROJECT_DIR: src };
    assert.equal(handbackKey(src, reg), key(api));
    expect(write(hbFile(key(api)), { cwd: src, env: aenv }), 'allow', 'deepest registered project');
    expect(write(hbFile(KEY), { cwd: src, env: aenv }), 'deny', 'the outer project is not the deepest');
    // The cwd counts too: CLAUDE_PROJECT_DIR is the project, the cwd is inside packages/api.
    expect(write(hbFile(key(api)), { cwd: src }), 'allow', 'cwd in a nested registered project');
    // { projects: [...] } is read the same way.
    fs.writeFileSync(path.join(DATA, 'projects.json'), JSON.stringify({ projects: [{ path: PROJ, name: 'proj' }] }));
    expect(write(hbFile(KEY), { cwd: wt, env: wenv }), 'allow', 'object-shaped registry');
  } finally { fs.writeFileSync(path.join(DATA, 'projects.json'), '[]\n'); }
});

// ---------- L3: hand-back files get the secret scan ----------
test('secrets in hand-back content are refused, for Write and Edit; clean reports pass', () => {
  for (const agent of ['toon-crew:kevin', 'toon-crew:ninja-hattori']) {
    const f = hbFile(KEY, agent.split(':')[1], 'full');
    for (const [what, content] of [['token', `token ${GH}`], ['phone', 'call +91 98765 43210'], ['email', 'mail someone@realdomain.in'], ['assignment', 'password: hunter2x']])
      expect(write(f, { agent, content }), 'deny', `${agent} ${what}`);
    expect(write(f, { agent, content: 'Verdict: done\nChecks: guard 330 pass, 0 fail\nnoreply@anthropic.com\n' }), 'allow', `${agent} clean`);
  }
  const own = path.join(DATA, 'projects', KEY, 'handbacks/full/kevin/old.md');
  fs.writeFileSync(own, 'Verdict: done\n');
  const edit = (new_string) => evaluate({ cwd: PROJ, tool_name: 'Edit', agent_id: 'a1', agent_type: 'toon-crew:kevin', tool_input: { file_path: own, old_string: 'done', new_string } }, ENV);
  expect(edit(`done ${GH}`), 'deny', 'Edit adds a token');
  expect(edit('blocked'), 'allow', 'Edit without a secret');
});
