import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { evaluate, findSecret, tokenize } from '../guard.mjs';

const GUARD = path.join(import.meta.dirname, '..', 'guard.mjs');
// The work dir must sit outside the system temp dir, which rm is allowed to clear.
const root = fs.mkdtempSync(path.join(import.meta.dirname, '.work-'));
const project = path.join(root, 'proj');
fs.mkdirSync(path.join(project, 'tmp'), { recursive: true });
const git = (...a) => execFileSync('git', ['-C', project, ...a], { stdio: 'ignore' });
git('init', '-q', '-b', 'main');
const onMain = project;
const featRepo = path.join(root, 'feat');
fs.mkdirSync(featRepo);
execFileSync('git', ['-C', featRepo, 'init', '-q', '-b', 'feat/x'], { stdio: 'ignore' });

const env = { CLAUDE_PROJECT_DIR: project };
const bash = (command, cwd = project) => evaluate({ tool_name: 'Bash', cwd, tool_input: { command } }, env);
const blocked = (cmd, cwd) => assert.ok(bash(cmd, cwd)?.deny, `should deny: ${cmd}`);
// Asks are what the DevOps Team sees; the main thread and other roles are denied a push to main or a merge.
const asked = (cmd, cwd = project) => assert.ok(evaluate({ tool_name: 'Bash', cwd, agent_type: 'toon-crew:sulley', agent_id: 'a1', tool_input: { command: cmd } }, env)?.ask, `should ask: ${cmd}`);
const allowed = (cmd, cwd) => assert.equal(bash(cmd, cwd), null, `should allow: ${cmd}`);
const edit = (tool_name, tool_input) => evaluate({ tool_name, cwd: project, tool_input }, env);

test('git push to main/master asks for confirmation, in every spelling', () => {
  for (const c of [
    'git push origin main', 'git push origin master', 'git push origin HEAD:main', 'git push origin HEAD:refs/heads/main',
    'git push origin feat:master', 'git push origin refs/heads/main', 'git push upstream main',
    'git push -u origin main',
    'git -C . push origin main', 'git -C /somewhere push origin main',
    '/usr/bin/git push origin main', 'FOO=1 git push origin main', 'GIT_SSH_COMMAND="ssh -i x" git push origin main',
    'env GIT_TRACE=1 git push origin main', 'command git push origin main', 'sudo git push origin main',
    '"git" push origin main', "git 'push' origin 'main'", 'g\\it push origin main', 'git push origin "main"',
    'git status && git push origin main', 'git add . ; git push origin main', 'true || git push origin main',
    'git status | cat; git push origin main', 'echo hi\ngit push origin main',
    'bash -c "git push origin main"', "sh -c 'git push origin main'", 'eval "git push origin main"',
    'echo $(git push origin main)', 'echo `git push origin main`', '( git push origin main )',
    'time git push origin main',
  ]) { asked(c); blocked(c); }
  for (const c of ['git -c push.default=current push origin main', 'git push --all', 'git push --mirror', 'git push origin --delete main', 'git push origin :main', 'git push origin +main', 'git push -d origin master']) blocked(c);
  blocked('git push origin main && git push --force origin x', onMain);
  blocked('gh pr merge 5 && rm -rf src');
  asked('git push origin main && ls');
});

test('git push implicit and HEAD pushes follow the current branch', () => {
  asked('git push', onMain); asked('git push origin', onMain); asked('git push origin HEAD', onMain);
  asked('cd . && git push', onMain); asked('git -C ' + onMain + ' push', featRepo);
  asked('git push', featRepo); /* no push target: confirm */ allowed('git push -u origin HEAD', featRepo); allowed('git push origin feat/x', featRepo);
});

test('force pushes are blocked on any branch', () => {
  for (const c of [
    'git push --force origin feat/x', 'git push -f origin feat/x', 'git push origin feat/x --force', 'git push --force-with-lease origin feat/x',
    'git push --force-with-lease=feat/x origin feat/x', 'git push --force-if-includes origin feat/x', 'git push -fu origin feat/x',
    'git push -uf origin feat/x', 'git push origin +feat/x:feat/x', 'git push origin feat/x -f',
  ]) assert.ok(bash(c, featRepo)?.deny, `should deny: ${c}`);
});

test('normal git use is allowed', () => {
  for (const c of ['git status', 'git commit -m "push to main later"', 'git push origin feat/x', 'git push -u origin feat/new-thing',
    'git log --oneline main', 'git checkout main', 'git pull origin main', 'git fetch origin main', 'echo "git push origin main"', 'git diff main...HEAD'])
    assert.equal(bash(c, featRepo), null, c);
});

test('gh pr merge asks for DevOps and is denied for the main thread; gh repo delete is denied', () => {
  const devops = (c) => evaluate({ tool_name: 'Bash', cwd: project, agent_type: 'toon-crew:mike-wazowski', agent_id: 'a1', tool_input: { command: c } }, env);
  assert.ok(devops('gh pr merge --squash --auto 5')?.deny, 'auto-merge is refused even for DevOps');
  for (const c of ['gh pr merge 5', 'gh pr merge --squash 5', 'gh -R a/b pr merge 5', 'gh pr -R a/b merge 5', 'gh --repo a/b pr merge',
    'cd x && gh pr merge', 'GH_TOKEN=x gh pr merge', 'bash -c "gh pr merge 3"', 'gh api -X PUT repos/a/b/pulls/5/merge',
    'gh api repos/a/b/pulls/5/merge -X PUT', '"gh" pr "merge"']) { assert.ok(devops(c)?.ask, `should ask: ${c}`); blocked(c); }
  for (const c of ['gh repo delete a/b --yes', 'gh repo delete', 'gh api -X DELETE repos/a/b']) blocked(c);
  for (const c of ['gh pr create --fill', 'gh pr view 5', 'gh pr list', 'gh repo view', 'gh api repos/a/b/pulls', 'gh pr checks 5', 'gh pr comment 5 -b "merge soon"']) allowed(c);
});

test('rm -rf / -fr outside tmp/scratch is blocked', () => {
  for (const c of ['rm -rf /', 'rm -rf ~', 'rm -rf $HOME', 'rm -fr src', 'rm -rf .', 'rm -rf ./src', 'rm -rf *', 'rm -r src', 'rm -Rf src', 'rm --recursive --force src',
    'rm -rf tmp/../src', 'rm -rf /tmp/../etc', 'rm -rf ' + project, 'rm -rf tmp', 'rm -rf ../x', 'cd / && rm -rf tmp', 'sudo rm -rf /var/lib', 'rm -f -r src',
    'rm -rf -- src', 'rm -rf "src"', "rm -rf 'src'", 'ls && rm -rf lib', 'bash -c "rm -rf src"', 'echo x | xargs rm -rf', 'rm -rf $SOMEVAR/x', 'rm -rf `pwd`',
    'rm -rf --no-preserve-root /', 'rm -rf /tmp', 'rm -rf ' + os.tmpdir(), 'rm -rf /private/etc', 'rm -rf node_modules/../src', 'rm -rf $(pwd)', 'rm -rf ~/tmp']) blocked(c);
  for (const c of ['rm -rf tmp/build', 'rm -rf ./tmp/x', 'rm -rf /tmp/foo', 'rm -fr /tmp/foo/bar', 'rm -rf ' + path.join(project, 'scratch', 'x') , 'rm -rf $TMPDIR/foo',
    'rm -rf ' + path.join(os.tmpdir(), 'abc'), 'rm file.txt', 'rm -f stale.lock', 'rm src/old.ts', 'rm -rf .tmp/cache']) allowed(c);
});

test('docker compose down -v and volume removal are blocked', () => {
  for (const c of ['docker compose down -v', 'docker compose down --volumes', 'docker-compose down -v', 'docker compose -f x.yml down -v', 'docker compose down --remove-orphans -v',
    'docker compose -p rl down -tv', 'docker volume rm pgdata', 'docker volume remove a b', 'docker volume prune -f', 'docker system prune --volumes', 'podman volume rm x',
    'docker compose rm -v', 'cd x && docker compose down -v', 'docker -H ssh://h compose down -v', 'docker compose down && docker volume rm x']) blocked(c);
  for (const c of ['docker compose down', 'docker compose up -d', 'docker compose down --remove-orphans', 'docker ps', 'docker run -v data:/d img', 'docker volume ls', 'docker compose logs -f']) allowed(c);
});

test('settings files cannot be edited, by tool or through the shell', () => {
  for (const f of [path.join(project, '.claude/settings.json'), path.join(project, '.claude/settings.local.json'), '.claude/settings.json',
    path.join(os.homedir(), '.claude/settings.json'), '~/.claude/settings.json', '.claude/../.claude/settings.json', path.join(project, '.CLAUDE/Settings.json')]) {
    assert.ok(edit('Edit', { file_path: f, old_string: 'a', new_string: 'b' })?.deny, `Edit ${f}`);
    assert.ok(edit('Write', { file_path: f, content: '{}' })?.deny, `Write ${f}`);
  }
  assert.ok(edit('MultiEdit', { file_path: '.claude/settings.json', edits: [{ old_string: 'a', new_string: 'b' }] }));
  for (const c of ['echo {} > .claude/settings.json', 'sed -i "" s/a/b/ .claude/settings.local.json', 'tee ~/.claude/settings.json < x', 'cp x .claude/settings.json',
    'cat x >> ~/.claude/settings.json', 'mv a .claude/settings.json', 'bash -c "echo {} > .claude/settings.json"']) blocked(c);
  allowed('cat .claude/settings.json'); allowed('jq . ~/.claude/settings.json'); allowed('grep hooks .claude/settings.json');
  assert.equal(edit('Edit', { file_path: path.join(project, 'src/settings.json'), old_string: 'a', new_string: 'b' }), null);
  assert.ok(edit('Write', { file_path: path.join(project, '.claude/agents/x.md'), content: 'hi' })?.ask, 'agent definitions ask the owner');
  assert.equal(edit('Write', { file_path: path.join(project, 'README.md'), content: 'hi' }), null);
});

test('memory files reject tokens, keys and phone numbers', () => {
  const mem = path.join(project, '.claude/agent-memory/bob/MEMORY.md');
  const secrets = ['token sk-abcdefghijklmnopqrstuvwx', 'ghp_abcdefghijklmnopqrstuvwxyz0123456789', 'github_pat_11ABCDEFG0123456789abcdef', 'AKIAABCDEFGHIJKLMNOP',
    'xoxb-1234567890-abcdefghij', 'dckr_pat_AbCdEf123456', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghij', '-----BEGIN RSA PRIVATE KEY-----',
    'Authorization: Bearer abcdefghijklmnopqrstuvwxyz123', 'password = hunter2hunter2hunter2', 'API_KEY: "abcd1234efgh5678ijkl"', 'call me on 9876543210',
    'phone +91 98765 43210', 'phone +91-9876543210', 'phone 98765-43210', 'reach +1 415 555 0132', 'client_secret=abcdefghijklmnop1234'];
  for (const s of secrets) {
    assert.ok(edit('Write', { file_path: mem, content: `- note ${s}\n` })?.deny, `Write ${s}`);
    assert.ok(edit('Edit', { file_path: mem, old_string: 'x', new_string: `- ${s}` })?.deny, `Edit ${s}`);
  }
  assert.ok(edit('MultiEdit', { file_path: mem, edits: [{ old_string: 'a', new_string: 'ok' }, { old_string: 'b', new_string: 'ghp_abcdefghijklmnopqrstuvwxyz0123456789' }] }));
  assert.ok(edit('Write', { file_path: path.join(project, '.claude/agent-memory/bob/topic.md'), content: 'sk-abcdefghijklmnopqrstuvwx' }), 'other memory .md files too');
  assert.ok(edit('Write', { file_path: '/x/AGENT-MEMORY/bob/MEMORY.md', content: '9876543210' }), 'case-insensitive path');
  const clean = ['- On iCloud folders keep node_modules out of sync.', '- PR #24 merged 2026-10-23, commit 44e7947 (sha 44e7947bae6120c0ffee0123456789abcdef1234).', '- Use token rotation docs; password policy lives in docs.',
    '- Ports 5433 and 6380 are used; version 0.17.0; timestamp 1729641600.', '- Set the api key via env, never in files.', '- 2026-10-23 03:45 +05:30 India time.'];
  for (const s of clean) assert.equal(edit('Write', { file_path: mem, content: s }), null, s);
  assert.equal(edit('Write', { file_path: path.join(project, 'docs/notes.md'), content: 'call 9876543210' }), null, 'only memory files are scanned');
  assert.equal(findSecret('nothing here'), null);
});

test('tokenizer: quotes, separators and substitutions', () => {
  assert.deepEqual(tokenize(`a "b c" 'd e' f\\ g && h; i | j`).commands.map((c) => c.words), [['a', 'b c', 'd e', 'f g'], ['h'], ['i'], ['j']]);
  assert.deepEqual(tokenize('echo $(git push origin main) `rm -rf x`').nested, ['git push origin main', 'rm -rf x']);
  assert.deepEqual(tokenize('echo "$(a b)"').nested, ['a b']);
  assert.deepEqual(tokenize('g""it push').commands.map((c) => c.words), [['git', 'push']]);
});

test('CLI: JSON ask on stdout (exit 0), exit 2 + one-line reason on deny, 0 on allow, 2 on garbage', () => {
  const run = (stdin) => spawnSync('node', ['--no-warnings', GUARD], { input: stdin, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: project } });
  const ask = run(JSON.stringify({ tool_name: 'Bash', cwd: project, agent_type: 'toon-crew:sulley', agent_id: 'a1', tool_input: { command: 'gh pr merge 5' } }));
  assert.equal(ask.status, 0); assert.equal(ask.stderr, '');
  assert.deepEqual(JSON.parse(ask.stdout), { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask', permissionDecisionReason: 'toon-crew guard: Merging PR #5 deploys to production: confirm.' } });
  const hit = run(JSON.stringify({ tool_name: 'Bash', cwd: project, tool_input: { command: 'git push --force origin x' } }));
  assert.equal(hit.status, 2); assert.match(hit.stderr, /^toon-crew guard: .+\n$/); assert.equal(hit.stderr.trim().split('\n').length, 1);
  assert.equal(run(JSON.stringify({ tool_name: 'Bash', cwd: project, tool_input: { command: 'ls' } })).status, 0);
  assert.equal(run(JSON.stringify({ tool_name: 'Read', cwd: project, tool_input: { file_path: 'x' } })).status, 0);
  assert.equal(run('not json').status, 2); // exit 1 would let the call through
});

test('hooks.json wires the guard and every board event', () => {
  const hooks = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', 'hooks.json'), 'utf8')).hooks;
  assert.match(hooks.PreToolUse[0].hooks[0].command, /\$\{CLAUDE_PLUGIN_ROOT\}\/hooks\/guard\.mjs/);
  for (const ev of ['SubagentStart', 'SubagentStop', 'PostToolUse', 'Stop', 'SessionStart', 'SessionEnd']) {
    const cmds = hooks[ev].flatMap((g) => g.hooks);
    const board = cmds.find((h) => h.command.includes('board/hook.ts'));
    assert.ok(board, ev); assert.equal(board.async, true); assert.equal(board.timeout, undefined); // not enforced for async hooks
    assert.equal(board.command, 'node --no-warnings "${CLAUDE_PLUGIN_ROOT}/board/hook.ts"');
  }
  assert.equal(hooks.PostToolUse[0].matcher, 'Bash|Agent|SendMessage');
});

test.after(() => fs.rmSync(root, { recursive: true, force: true }));
