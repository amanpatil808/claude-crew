// Re-check of 7ebe3c6: new bypasses (should be denied/asked) and false positives (should be allowed).
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { evaluate } from '../guard.mjs';

const home = os.homedir();
const project = path.join(home, 'toon-crew-proof-nonexistent-project');
const env = { CLAUDE_PROJECT_DIR: project };
const ev = (tool_name, tool_input, extra = {}, e = env) => evaluate({ tool_name, cwd: project, tool_input, ...extra }, e);
const bash = (command, extra, e) => ev('Bash', { command }, extra, e);

// Local repo: branch topic tracks origin/main, push.default=upstream in the repo config.
const W = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-re-'));
const g = (...a) => execFileSync('git', a, { cwd: W, stdio: 'ignore' });
g('init', '-q', '--bare', 'remote.git'); g('init', '-q', '-b', 'main', 'work');
const work = path.join(W, 'work'); const gw = (...a) => execFileSync('git', ['-C', work, ...a], { stdio: 'ignore' });
gw('-c', 'user.email=t@e.invalid', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'one'); gw('remote', 'add', 'origin', '../remote.git'); gw('push', '-q', 'origin', 'main');
gw('checkout', '-q', '-b', 'topic', '--track', 'origin/main'); gw('config', 'push.default', 'upstream');
const inWork = (command) => evaluate({ tool_name: 'Bash', cwd: work, tool_input: { command } }, { CLAUDE_PROJECT_DIR: work });

const bypass = {
  'alias in an alternate git dir (--git-dir)': ['ask', 'git --git-dir=/tmp/g/.git --work-tree=. p origin HEAD:main'],
  'alias in an alternate git dir (GIT_DIR=)': ['ask', 'GIT_DIR=/tmp/g/.git git p origin HEAD:main'],
  'git config --file .git/config remote.origin.push (+refspec)': ['deny', 'git config --file .git/config remote.origin.push +HEAD:refs/heads/main'],
  'git config -f ~/.gitconfig alias.p': ['deny', 'git config -f ~/.gitconfig alias.p "push --force"'],
  'python heredoc running git push -f': ['deny', "python3 - <<'EOF'\nimport subprocess\nsubprocess.run(['git','push','-f','origin','main'])\nEOF"],
  'node heredoc deleting home': ['deny', "node <<'EOF'\nrequire('fs').rmSync(require('os').homedir()+'/Documents',{recursive:true})\nEOF"],
  'write a script to /tmp then run it': ['deny', "printf 'git push -f origin main' > /tmp/p.sh && sh /tmp/p.sh"],
  'reviewer (scooby-doo) edits a src file via python': ['deny', `python3 -c "open('src/app.ts','w').write('x')"`, { agent_type: 'toon-crew:scooby-doo' }],
  'reviewer (tom) git checkout -- . / reset --hard': ['deny', 'git reset --hard HEAD~3', { agent_type: 'toon-crew:tom' }],
  'reviewer (nobita) patch/git apply': ['deny', 'git apply /tmp/x.patch', { agent_type: 'toon-crew:nobita' }],
  'dorami pushes crew-lessons branch to a PRODUCT repo origin': ['deny', 'git push origin crew-lessons/2026-10-23', { agent_type: 'toon-crew:dorami', cwd: project }],
  'dorami gh pr create via --repo=': ['deny', 'gh pr create --repo=other/repo -t x -b y', { agent_type: 'toon-crew:dorami' }],
};
for (const [name, [want, cmd, extra]] of Object.entries(bypass)) {
  test(`bypass? ${name}`, () => { const r = bash(cmd, extra); assert.ok(want === 'ask' ? (r?.ask || r?.deny) : r?.deny, `allowed: ${JSON.stringify(r)}`); });
}
test('bypass? bare push from a branch tracking main asks', () => assert.ok(inWork('git push')?.ask, JSON.stringify(inWork('git push'))));

const normal = [
  'git push origin feat/x', 'git push -u origin feat/x', 'git push --set-upstream origin feat/x', 'git push origin HEAD', 'git push --follow-tags origin feat/x', 'git push --tags',
  'git push origin feat/x --no-verify', 'git status && git diff --stat', 'git log --oneline -15', 'git commit -m "fix: x"', 'git -c user.name=x -c user.email=y commit -m m',
  'git -c core.editor=true rebase --continue', 'GIT_EDITOR=true git rebase --continue', 'git -c core.pager=cat log -3', 'git --no-pager log -3', 'GIT_CONFIG_NOSYSTEM=1 bun test',
'git config user.email t@example.com', 'git stash && git stash pop', 'git fetch origin && git rebase origin/main', 'git worktree add ../wt feat/x',
  'gh pr create -t x -b y', 'gh pr view 5 --json title', 'gh run list -L 5', 'gh api repos/o/r/pulls', 'gh api repos/o/r', 'gh pr checks 5',
  'rm -rf tmp/build', 'rm -rf .tmp/cache', 'rm -rf /tmp/foo', 'rm -rf $TMPDIR/x', 'rm -f src/old.ts', 'rm -rf node_modules/.cache/../.cache-x',
  'bun test 2>&1 | tail -20', 'bun run build > /dev/null', 'npm test -- --watch=false', 'echo hi > out.txt', 'cat src/a.ts | grep foo', 'mkdir -p scratch && cp a scratch/',
  'docker compose up -d', 'docker compose down', 'docker compose logs -f api', 'docker compose exec api bun test', 'docker run --rm alpine echo hi',
  "node -e 'console.log(1+1)'", "python3 -c 'print(1)'", 'for f in src/*.ts; do wc -l "$f"; done', 'while read l; do echo "$l"; done < list.txt',
  "find . -name '*.ts' -not -path './node_modules/*' | head", 'find tmp -name "*.log" -delete', 'curl -s http://127.0.0.1:8811/api/state', 'curl -s https://api.github.com/repos/o/r',
  'sed -i "" "s/a/b/" src/x.ts', 'cd src && ls', 'cd .claude/crew && cat project.md', 'cat .claude/settings.json', 'grep -r token src/', 'git diff -- .claude/agent-memory',
  'ls ~/.claude/plugins', 'gh pr list --json number,title | jq .', 'make test', 'xargs -n1 echo < files.txt',
];
for (const c of normal) test(`false positive? ${c}`, () => { const r = bash(c); assert.equal(r?.deny, undefined, `DENIED: ${r?.deny}`); assert.equal(r?.ask, undefined, `ASKED: ${r?.ask}`); });

const files = [
  ['Edit', { file_path: path.join(project, 'src/app.ts'), old_string: 'a', new_string: 'b' }],
  ['Write', { file_path: path.join(project, 'docs/notes.md'), content: '# notes\nUse example.com and port 8080, v1.2.3, 2026-10-23.' }],
  ['Edit', { file_path: path.join(project, '.claude/crew/project.md'), old_string: 'a', new_string: 'b' }],
  ['Edit', { file_path: path.join(project, '.claude/agent-memory/toon-crew-tom/MEMORY.md'), old_string: 'a', new_string: '- Run tests 3x; flaky ones show on run 2. Version 1.20.3, PR #123, sha 9e456f9d4f0da705287c32afd3666534bd6ed483, 2026-10-23 10:00 (seen 2) [crew]' }],
  ['Write', { file_path: path.join(project, 'README.md'), content: 'Contact: dev@example.com, phone placeholder +91 XXXXX XXXXX' }],
];
for (const [t, i] of files) test(`false positive? ${t} ${path.relative(project, i.file_path)}`, () => { const r = ev(t, i); assert.equal(r?.deny, undefined, `DENIED: ${r?.deny}`); });

test('false positive? plugin dev: editing the plugin source with claude --plugin-dir', () => {
  const root = path.join(home, 'Developer/claude-crew/plugin');
  const r = evaluate({ tool_name: 'Edit', cwd: path.join(home, 'Developer/claude-crew'), tool_input: { file_path: path.join(root, 'agents/tom.md'), old_string: 'a', new_string: 'b' } }, { CLAUDE_PROJECT_DIR: path.join(home, 'Developer/claude-crew'), CLAUDE_PLUGIN_ROOT: root });
  assert.equal(r?.deny, undefined, `DENIED: ${r?.deny}`);
});
test('false positive? memory bullets with normal numbers', () => {
  for (const s of ['- Ports 54329 and 63799 for tests', '- Build 20261023 took 12345 ms', '- Timestamp 1792696187592 in ids', '- Order id 6123456789012 from fixtures', '- amount 7,500.00 rupees 9876 items']) {
    const r = ev('Write', { file_path: path.join(project, '.claude/agent-memory/toon-crew-tom/MEMORY.md'), content: s });
    assert.equal(r?.deny, undefined, `${s} -> ${r?.deny}`);
  }
});
