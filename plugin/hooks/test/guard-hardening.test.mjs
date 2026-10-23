// Hardening tests added after the security review: Miguel Rivera limits, MCP asks, git config aliases, @{push} lookups,
// protected plugin/hook/agent files, shell writes to memory, and the lazy-git ordering.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { evaluate } from '../guard.mjs';

const GUARD = path.join(import.meta.dirname, '..', 'guard.mjs');
const root = fs.mkdtempSync(path.join(import.meta.dirname, '.work-'));
const sh = (cwd, ...a) => execFileSync('git', ['-C', cwd, ...a], { stdio: 'ignore' });
// A repo with a local bare remote; branch "topic" tracks origin/main.
const remote = path.join(root, 'remote.git');
const repo = path.join(root, 'repo');
execFileSync('git', ['init', '-q', '--bare', remote]);
execFileSync('git', ['init', '-q', '-b', 'main', repo]);
for (const [k, v] of [['user.email', 't@example.invalid'], ['user.name', 't']]) sh(repo, 'config', k, v);
fs.writeFileSync(path.join(repo, 'f'), '1');
sh(repo, 'add', 'f'); sh(repo, 'commit', '-qm', 'one'); sh(repo, 'remote', 'add', 'origin', remote); sh(repo, 'push', '-q', 'origin', 'main');
sh(repo, 'checkout', '-q', '-b', 'topic', 'origin/main');
sh(repo, 'config', 'push.default', 'upstream');
sh(repo, 'config', 'alias.p', 'push');
sh(repo, 'config', 'alias.shout', '!echo hi');

let repo2;
const run = (command, cwd = repo, extra = {}) => evaluate({ tool_name: 'Bash', cwd, tool_input: { command }, ...extra }, { CLAUDE_PROJECT_DIR: cwd });

test('bare push on a branch that tracks main (push.default=upstream) asks', () => {
  assert.ok(run('git push')?.ask);
  assert.ok(run('git push origin')?.ask);
});
test('repo-defined alias for push is resolved, shell aliases are checked', () => {
  assert.ok(run('git p origin main')?.ask);
  assert.ok(run('git p')?.ask);
  assert.equal(run('git shout'), null);
});
test('git config writes of aliases and push settings are denied, reads are fine', () => {
  for (const c of ['git config alias.p push', 'git config --global alias.x "!git push"', 'git config remote.origin.push +HEAD:main', 'git config push.default upstream', 'git config --edit'])
    assert.ok(run(c)?.deny, c);
  assert.ok(run('git config core.hooksPath /tmp/h')?.ask, 'hooksPath asks');
  assert.ok(run('git -c core.hooksPath=/tmp/h status')?.ask, 'hooksPath via -c asks');
  for (const c of ['git config user.name x', 'git config --get alias.p', 'git config --list']) assert.equal(run(c), null, c);
});
test('abbreviated long options', () => {
  for (const c of ['git push --force-w origin x', 'git push --mir', 'git push --forc origin x', 'git push --al', 'git push --del origin main']) assert.ok(run(c, path.join(root, 'nonexistent'))?.deny, c);
});
test('deny wins before any git subprocess is needed', () => {
  const r = spawnSync('node', ['--no-warnings', GUARD], { input: JSON.stringify({ tool_name: 'Bash', cwd: '/nonexistent-dir', tool_input: { command: 'git push; git push; docker volume rm x' } }), encoding: 'utf8' });
  assert.equal(r.status, 2);
});
test('protected: plugin files, project hooks/agents/skills, git config and hooks, ~/.claude.json, .mcp.json', () => {
  const proj = repo;
  const pluginRoot = path.join(root, 'plugin-cache');
  fs.mkdirSync(pluginRoot);
  const ev = (tool_name, tool_input) => evaluate({ tool_name, cwd: proj, tool_input }, { CLAUDE_PROJECT_DIR: proj, CLAUDE_PLUGIN_ROOT: pluginRoot });
  // A dev checkout loaded with --plugin-dir is the live guard: the main thread is asked (subagents are refused, see guard-security).
  assert.ok(ev('Write', { file_path: path.join(pluginRoot, 'hooks/guard.mjs'), content: 'x' })?.ask, 'the live inline plugin asks the main thread');
  for (const f of [path.join(os.homedir(), '.claude/plugins/cache/x/y.js'), path.join(proj, '.git/config'), path.join(proj, '.git/hooks/pre-commit'), path.join(os.homedir(), '.claude.json'), path.join(proj, '.mcp.json')]) {
    assert.ok(ev('Write', { file_path: f, content: 'x' })?.deny, f);
    assert.ok(ev('Edit', { file_path: f, old_string: 'a', new_string: 'b' })?.deny, f);
  }
  assert.ok(ev('Bash', { command: 'echo x >> .git/hooks/pre-push' })?.deny);
  assert.ok(ev('Bash', { command: 'cp x ~/.claude/plugins/cache/crew/toon-crew/0.1.0/hooks/hooks.json' })?.deny);
  for (const f of ['.claude/hooks/a.sh', '.claude/agents/a.md', '.claude/skills/s/SKILL.md', '.claude/commands/c.md']) { // project crew config: owner is asked
    assert.ok(ev('Write', { file_path: path.join(proj, f), content: 'x' })?.ask, f);
    assert.ok(ev('Edit', { file_path: path.join(proj, f), old_string: 'a', new_string: 'b' })?.ask, f);
  }
  assert.ok(ev('Bash', { command: 'echo x > .claude/skills/new/SKILL.md' })?.ask);
  assert.ok(ev('Bash', { command: 'echo x > .claude/skills/new/SKILL.md && rm -rf /etc/x' })?.deny, 'a deny in the same command wins');
  assert.equal(ev('Write', { file_path: path.join(proj, 'src/a.ts'), content: 'x' }), null);
  assert.equal(ev('Bash', { command: 'cat .git/config' }), null);
});
test('shell writes into agent-memory are denied; the file tools remain the way in', () => {
  for (const c of ['echo hi >> .claude/agent-memory/tom/MEMORY.md', 'tee .claude/agent-memory-local/x/MEMORY.md', 'sed -i "" s/a/b/ .claude/agent-memory/x/a.md', 'cp x .claude/agent-memory/x/y.md'])
    assert.ok(run(c)?.deny, c);
  assert.equal(run('cat .claude/agent-memory/tom/MEMORY.md'), null);
});
test('Miguel Rivera (knowledge manager): only lesson pushes to origin and PRs against the crew repo', () => {
  const d = { agent_type: 'toon-crew:miguel-rivera' };
  const crew = path.join(root, 'crew-clone');
  fs.mkdirSync(crew); execFileSync('git', ['init', '-q', '-b', 'main', crew]); sh(crew, 'remote', 'add', 'origin', 'git@github.com:amanpatil808/claude-crew.git');
  assert.equal(run('git push origin crew-lessons/x', crew, d), null, 'origin is the crew repo');
  assert.ok(run('git push origin crew-lessons/x', repo, d)?.deny, 'origin is some other repo');
  assert.ok(run('git push origin crew-lessons/x', path.join(root, 'nonexistent'), d)?.deny, 'not a repo');
  repo2 = crew;
  assert.equal(run('git push origin crew-lessons/2026-10-23', repo2, d), null);
  assert.equal(run('git push -u origin HEAD:crew-lessons/x', repo2, d), null);
  for (const c of ['git push origin feat/x', 'git push origin main', 'git push', 'git push upstream crew-lessons/x', 'git push origin crew-lessons/x other', 'git push -f origin crew-lessons/x', 'gh pr merge 3', 'gh pr create --fill', 'gh pr create -R someone/else', 'gh api -X POST repos/o/r/issues'])
    assert.ok(run(c, repo, d)?.deny, c);
  assert.equal(run('gh pr create -R amanpatil808/claude-crew --title x', repo, d), null);
  assert.equal(run('gh pr create --repo=amanpatil808/claude-crew', repo, { agent_type: 'miguel-rivera' }), null);
  assert.ok(run('git push origin crew-lessons/x', repo, { agent_type: 'doraemon' }) === null, 'other agents are not limited by the Miguel Rivera rule');
});
test('MCP tools that merge, push or delete ask', () => {
  const mcp = (tool_name) => evaluate({ tool_name, cwd: repo, tool_input: {} }, { CLAUDE_PROJECT_DIR: repo });
  for (const t of ['mcp__github__merge_pull_request', 'mcp__github__push_files', 'mcp__github__delete_file', 'mcp__plugin_x_y__delete_branch']) assert.ok(mcp(t)?.ask, t);
  for (const t of ['mcp__github__get_file_contents', 'mcp__zepto__search_products']) assert.equal(mcp(t), null, t);
});
test('GitHub API variants', () => {
  for (const c of ['gh api repos/o/r/merges -f base=main -f head=x', `gh api graphql -f query='mutation{mergePullRequest(input:{}){clientMutationId}}'`]) assert.ok(run(c)?.ask, c);
  for (const c of ['gh api -X PATCH repos/o/r/git/refs/heads/main -f sha=x', 'gh api --method=DELETE https://api.github.com/repos/o/r', 'gh auth token', 'gh alias set m "pr merge"',
    `gh api graphql -f query='mutation{deleteRef(input:{refId:"x"}){clientMutationId}}'`, 'curl -X DELETE -H "Authorization: token $(gh auth token)" https://api.github.com/repos/o/r', 'curl -XPATCH https://api.github.com/repos/o/r/git/refs/heads/master -d x'])
    assert.ok(run(c)?.deny, c);
  for (const c of ['gh api repos/o/r/pulls', 'gh api repos/o/r/git/refs/heads/feat/x -X PATCH -f sha=x', 'curl -s https://api.github.com/repos/o/r']) assert.equal(run(c), null, c);
});
test('obfuscation: IFS, ANSI-C quotes, brace expansion, variables as programs, functions, stdin shells, inline code', () => {
  for (const c of ['git${IFS}push${IFS}-f${IFS}origin${IFS}main', "$'git' push -f origin main", '{git,push,-f,origin,main}', '$G push -f origin main', 'g() { git "$@"; }; g push origin main',
    "echo 'git push -f origin main' | sh", "bash -s <<< 'git push -f origin main'", `python3 -c 'import os; os.system("git push -f origin main")'`, `perl -e 'system("rm -rf /tmp/../etc")'`,
    "env -S 'git push -f origin main'", 'find . -maxdepth 0 -exec git push -f origin main', "alias gp='git push'"]) assert.ok(run(c)?.deny, c);
});
test('rm: scratch must be a real dir, cd tracking, deletes in disguise', () => {
  const proj = path.join(root, 'rmproj');
  fs.mkdirSync(path.join(proj, 'tmp'), { recursive: true });
  fs.symlinkSync(os.homedir(), path.join(proj, 'scratch'));
  const r = (command) => evaluate({ tool_name: 'Bash', cwd: proj, tool_input: { command } }, { CLAUDE_PROJECT_DIR: proj });
  assert.equal(r('rm -rf tmp/x'), null);
  assert.ok(r('rm -rf scratch/Documents')?.deny);
  assert.ok(r('(cd tmp); rm -rf x')?.deny, 'cd inside a subshell does not stick');
  assert.equal(r('cd tmp && rm -rf x'), null);
  assert.ok(r('cd $HOME; rm -rf tmp')?.deny);
  for (const c of ['mv ~/Documents tmp/x', 'ln -s ~ tmp/h', 'find ~ -delete', 'rm --recur x', 'rsync -a --delete /tmp/empty/ ~/Documents/', 'git clean -xdf', 'docker run --rm -v d:/d alpine sh -c "rm -rf /d/*"']) assert.ok(r(c)?.deny, c);
  assert.equal(r('mv src/a.ts src/b.ts'), null);
  assert.equal(r('find tmp -name x -delete'), null);
});
test('memory: new secret shapes, and a secret split over two edits', () => {
  const mem = path.join(root, '.claude/agent-memory/tom/MEMORY.md');
  fs.mkdirSync(path.dirname(mem), { recursive: true });
  fs.writeFileSync(mem, '- notes\n');
  const e = (input) => evaluate({ tool_name: 'Edit', cwd: root, tool_input: { file_path: mem, ...input } }, { CLAUDE_PROJECT_DIR: root });
  assert.ok(e({ old_string: 'notes', new_string: 'notes ghp_ABCDEFGHIJ' })?.deny, 'prefix alone is enough');
  fs.writeFileSync(mem, '- notes ghp_ABCDEFGH\n'); // a token already on disk
  assert.ok(e({ old_string: 'notes', new_string: 'other' })?.deny, 'edit that leaves a secret in the file');
  fs.writeFileSync(mem, '- notes\n');
  assert.equal(e({ old_string: 'notes', new_string: 'notes: use docker compose; ports 5433/6380; user noreply@anthropic.com' }), null);
});

test('alternate git dirs: --git-dir/--work-tree/GIT_DIR block pushes and unknown subcommands; config copies are protected', () => {
  const alt = path.join(root, 'altgit');
  fs.mkdirSync(path.join(alt, 'objects'), { recursive: true }); fs.writeFileSync(path.join(alt, 'HEAD'), 'ref: refs/heads/main\n');
  for (const c of [`git --git-dir=${alt} p origin evil:main`, `git --git-dir ${alt} push origin x`, `GIT_DIR=${alt} git p origin HEAD:main`, `git --work-tree=. push origin x`, `env GIT_WORK_TREE=/tmp git push origin x`])
    assert.ok(run(c)?.deny, c);
  assert.equal(run(`git --git-dir=${alt} status`), null, 'builtin read-only subcommands are fine');
  for (const f of [path.join(alt, 'config'), path.join(alt, 'hooks/pre-push')]) {
    assert.ok(evaluate({ tool_name: 'Write', cwd: root, tool_input: { file_path: f, content: '[alias]\n p = push -f' } }, { CLAUDE_PROJECT_DIR: root })?.deny, f);
  }
  assert.ok(run(`printf x > ${alt}/config`)?.deny);
  assert.equal(evaluate({ tool_name: 'Write', cwd: root, tool_input: { file_path: path.join(root, 'plain/config'), content: 'x' } }, { CLAUDE_PROJECT_DIR: root }), null, 'a config file elsewhere is fine');
});
test('config --file and remote.<name>.push rules are honoured by a later bare push', () => {
  assert.ok(run('git config --file .git/config remote.origin.push +HEAD:refs/heads/main')?.deny);
  assert.ok(run('git config -f ~/.gitconfig alias.p "push --force"')?.deny);
  const r2 = path.join(root, 'rules'); execFileSync('git', ['clone', '-q', remote, r2], { stdio: 'ignore' });
  sh(r2, 'checkout', '-q', '-b', 'side');
  sh(r2, 'config', 'remote.origin.push', '+HEAD:refs/heads/main');
  assert.ok(run('git push origin', r2)?.deny, 'a +refspec in remote.origin.push is a force push');
  sh(r2, 'config', '--replace-all', 'remote.origin.push', 'HEAD:refs/heads/main');
  assert.ok(run('git push origin', r2)?.ask, 'plain refspec to main asks');
  sh(r2, 'config', '--unset-all', 'remote.origin.push');
  assert.ok(run('git push', r2)?.ask, 'no @{push} target: confirm, never allow');
  assert.equal(run('git push --tags', r2), null, 'tags-only pushes cannot move main');
});
test('interpreter here-docs and scripts written then run', () => {
  assert.ok(run("python3 - <<'EOF'\nimport subprocess\nsubprocess.run(['git','push','-f','origin','main'])\nEOF")?.deny);
  assert.ok(run("node <<'EOF'\nrequire('fs').rmSync('/x',{recursive:true})\nEOF")?.deny);
  assert.equal(run("python3 - <<'EOF'\nprint(1+1)\nEOF"), null);
  assert.ok(run("printf 'git push -f origin main' > /tmp/p.sh && sh /tmp/p.sh")?.deny);
  assert.ok(run("echo x > /tmp/run.sh && chmod +x /tmp/run.sh && /tmp/run.sh")?.deny);
  assert.equal(run('echo x > /tmp/a.txt && cat /tmp/a.txt'), null);
});
test('read-only roles via Bash: tree-changing git, patch and interpreter writes', () => {
  for (const agent of ['toon-crew:twenty-two', 'joe-gardner', 'toon-crew:nobita', 'dekisugi', 'olaf', 'ninja-hattori', 'stuart']) {
    const as = (c) => run(c, repo, { agent_type: agent });
    for (const c of ['git reset --hard HEAD~3', 'git checkout -- .', 'git restore src/a.ts', 'git apply x.patch', 'git am x.mbox', 'git stash', 'git clean -fd', 'git commit -m x', 'git merge feat', 'git rebase main', 'git cherry-pick abc', 'git revert abc', 'patch -p1 < x.patch', `python3 -c "open('src/app.ts','w').write('x')"`, `node -e "require('fs').writeFileSync('src/a.ts','x')"`])
      assert.ok(as(c)?.deny, `${agent}: ${c}`);
    for (const c of ['git status', 'git log --oneline -5', 'git diff HEAD~1', 'git show HEAD', `python3 -c "print(1)"`, `python3 -c "open('/tmp/x.txt','w').write('x')"`]) assert.equal(as(c), null, `${agent}: ${c}`);
  }
  assert.equal(run('git commit -m x', repo, { agent_type: 'toon-crew:bob-the-builder' }), null, 'builders are not limited');
});
test('GIT_CONFIG_* overrides: only the injecting ones are blocked; projects.mjs set asks', () => {
  for (const c of ['GIT_CONFIG_COUNT=1 git status', 'GIT_CONFIG_KEY_0=alias.p git status', 'GIT_CONFIG_GLOBAL=/tmp/g git status']) assert.ok(run(c)?.deny, c);
  assert.equal(run('GIT_CONFIG_NOSYSTEM=1 git status'), null);
  assert.ok(run('node plugin/hooks/projects.mjs set /d /proj board on')?.ask);
  assert.ok(run('node --no-warnings "/x/hooks/projects.mjs" set "$D" "$P" lessons on')?.ask);
  assert.equal(run('node plugin/hooks/projects.mjs forget /d'), null);
});
test('build output folders can be deleted; source folders cannot', () => {
  for (const c of ['rm -rf node_modules', 'rm -rf apps/web/node_modules', 'rm -rf dist', 'rm -rf build/out', 'rm -rf .next']) assert.equal(run(c), null, c);
  for (const c of ['rm -rf src', 'rm -rf node_modules/../src', 'rm -rf ../node_modules']) assert.ok(run(c)?.deny, c);
});

test.after(() => fs.rmSync(root, { recursive: true, force: true }));
