// Proofs for the security re-check (round 3): a builder swapping the live plugin out through git or by moving
// the folder that holds it (B1b), git config and other writes by read-only roles, and dangerous config keys.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { evaluate } from '../guard.mjs';

// Outside the system temp dir: read-only roles may write anywhere under it.
const W = fs.realpathSync(fs.mkdtempSync(path.join(import.meta.dirname, '.work-')));
const R = path.join(W, 'repo'); const live = path.join(R, 'plugin'); const WT = path.join(R, '.claude/worktrees/bob-1');
for (const d of [path.join(R, '.git'), path.join(live, 'hooks'), path.join(WT, 'plugin/hooks'), path.join(R, 'src')]) fs.mkdirSync(d, { recursive: true });
fs.writeFileSync(path.join(WT, '.git'), `gitdir: ${R}/.git/worktrees/bob-1\n`); // a worktree has a .git file of its own
fs.symlinkSync(R, path.join(WT, 'back'));
const env = { CLAUDE_PROJECT_DIR: R, CLAUDE_PLUGIN_ROOT: live };
const bob = (command, cwd = WT) => evaluate({ tool_name: 'Bash', agent_type: 'toon-crew:bob', agent_id: 'a2', cwd, tool_input: { command } }, env);
const main = (command) => evaluate({ tool_name: 'Bash', cwd: R, tool_input: { command } }, env);
const joe = (command) => evaluate({ tool_name: 'Bash', agent_type: 'toon-crew:joe-gardner', agent_id: 'a1', cwd: R, tool_input: { command } }, { CLAUDE_PROJECT_DIR: R });

test('B1b: a subagent cannot replace the live plugin through git in the checkout that holds it', () => {
  for (const c of [`git -C ${R} checkout bob-branch -- plugin/hooks/guard.mjs`, `git -C ${R} reset --hard bob-branch`, `cd ${R} && git checkout bob-branch -- plugin`,
    `git -C ${live} restore .`, `git -C ${R} stash`, `git -C ${R} add -A`, `git -C ${R} commit -m x`, `git -C ${R} merge bob-branch`, `git -C ${R} branch -f main x`,
    `git -C ${R} config filter.x.clean evil`, `git -C ${R} config user.name x`, `git --git-dir=${R}/.git --work-tree=${R} checkout b -- plugin`, `GIT_DIR=${R}/.git git checkout b -- plugin`,
    `git -C ${R}/src/new-dir checkout b -- ../plugin`])
    assert.ok(bob(c)?.deny, c);
  for (const c of ['git add -A && git commit -m x', 'git checkout -b feat', `git -C ${WT} reset --hard HEAD`, `git -C ${R} status`, `git -C ${R} log --oneline -3`, `git -C ${R} diff`,
    `git -C ${R} worktree list`, `git -C ${R} stash list`, `git -C ${R} config --get user.name`])
    assert.equal(bob(c), null, c);
  assert.equal(bob('git add -A && git commit -m x', path.join(R, '.claude/worktrees/not-yet')), null, 'the session cwd is its own worktree even before it exists');
  assert.equal(main(`git -C ${R} reset --hard b`), null, 'the main thread is unchanged');
});
test('B1b: a subagent cannot move or replace a folder that holds the live plugin', () => {
  for (const c of [`mv ${R} ${R}-old && mv ${R}-old/.claude/worktrees/bob-1 ${R}`, `ln -sfn ${WT} ${R}`, `mv ${live} /tmp/p`, `cp -R ${WT}/. ${R}`, `rsync -a ${WT}/ ${R}`])
    assert.ok(bob(c)?.deny, c);
  for (const c of [`mv ${WT}/a ${WT}/b`, `cp /tmp/x ${WT}/src/a.ts`, `echo x > ${WT}/plugin/hooks/guard.mjs`]) assert.equal(bob(c), null, c);
  assert.equal(main(`cp /tmp/x ${R}/`), null, 'the main thread is not asked about the folder above the plugin');
  assert.ok(main(`mv ${live} ${R}/plugin-old`)?.ask, 'the main thread is asked about the plugin itself');
});
test('read-only roles: git config writes are blocked, reads stay allowed', () => {
  for (const c of ["git config filter.x.clean 'sh -c id'", "git config core.pager 'sh -c id'", 'git config user.name x', 'git config --global user.name x', 'git config --add a.b c',
    'git config --unset a.b', 'git config --replace-all a.b c', 'git config -e', 'git config --edit', 'git config set a.b c', 'git config unset a.b', 'git config --file x.cfg a.b c'])
    assert.ok(joe(c)?.deny, c);
  for (const c of ['git config --get user.name', 'git config --list', 'git config -l', 'git config user.name', 'git config get user.name', 'git config --get-regexp ^user'])
    assert.equal(joe(c), null, c);
});
test('everyone: config keys that run a program on a later git command are blocked; plain pager values are fine', () => {
  const b = (c) => bob(c);
  for (const c of ['git config filter.x.clean evil', 'git config filter.x.smudge evil', 'git config diff.foo.textconv evil', 'git config merge.ours.driver evil', 'git config gpg.program evil',
    'git config core.askpass evil', 'git config sequence.editor evil', "git config core.pager 'sh -c id'", 'git config diff.external evil', 'git config core.fsmonitor evil', 'git config set filter.x.clean evil',
    "git -c core.pager='sh -c id' log", 'git -c diff.external=evil diff', 'git -c filter.x.clean=evil add .', 'git -c core.editor=evil commit'])
    assert.ok(b(c)?.deny, c);
  for (const c of ['git -c core.pager=cat log', 'git -c core.pager= log', 'git config core.editor vim', 'git config user.name x', 'git -c color.ui=never log', 'git status'])
    assert.equal(b(c), null, c);
});
test('read-only roles: stash list/show and notes list are reads; touch, mkdir, sort -o and --output write only to temp', () => {
  const t = path.join(fs.realpathSync(os.tmpdir()), 'tc-recheck');
  for (const c of ['git stash list', 'git stash show', 'git stash show -p stash@{0}', 'git notes list', 'git notes show HEAD', `touch ${t}-a`, `mkdir -p ${t}/x/y`, `sort -o ${t}-s /tmp/x`,
    'sort /tmp/x', `git diff --output=${t}-d.patch`, 'awk \'{print $1}\' f', "awk '$1 > 5' f"])
    assert.equal(joe(c), null, c);
  for (const c of ['git stash', 'git stash pop', 'git stash drop', 'git notes add -m x HEAD', 'git notes remove HEAD', 'touch src/new.ts', 'mkdir src/x', 'mkdir -p -m 755 src/y', 'touch -t 202001010000 src/a.ts',
    'sort -o src/a.ts /tmp/x', 'sort -osrc/a.ts /tmp/x', 'git diff --output=src/a.ts', 'git diff --output src/a.ts', 'curl --output src/a.ts https://example.com',
    `awk 'BEGIN{print "x" > "src/a.ts"}'`, `awk 'BEGIN{system("touch src/a.ts")}'`, `awk 'BEGIN{"id" | getline x}'`])
    assert.ok(joe(c)?.deny, c);
  assert.equal(bob('touch src/new.ts && mkdir src/x'), null, 'builders unchanged');
});
test('read-only roles: aliases, reflection and raw bindings in inline code are refused', () => {
  const py = (code) => joe(`python3 -c ${JSON.stringify(code)}`); const nd = (code) => joe(`node -e ${JSON.stringify(code)}`);
  for (const c of ["getattr(__builtins__,'op'+'en')('src/a.ts','w').write('x')", "__builtins__.__dict__['open']('src/a.ts','w')", "from pathlib import Path as P; P('src/a.ts').write_text('x')",
    "import pathlib; p=pathlib.Path('src/a.ts'); p.write_text('x')", "from pathlib import Path; (Path('src') / 'a.ts').write_text('x')", "from shutil import copyfile as c; c('/tmp/x','src/a.ts')",
    "from os import rename as mv; mv('/tmp/x','src/a.ts')", "import os; getattr(os,'sys'+'tem')('touch src/a.ts')", "import pty; pty.spawn(['sh'])", "import ctypes; ctypes.CDLL(None)"])
    assert.ok(py(c)?.deny, c);
  for (const c of ["const {writeFileSync:w}=require('fs'); w('src/a.ts','x')", "require('fs')['write'+'FileSync']('src/a.ts','x')", "process.binding('fs')"]) assert.ok(nd(c)?.deny, c);
  assert.ok(joe(`perl -e 'open F, ">src/a.ts"; print F "x"'`)?.deny);
  for (const c of ["print(open('README.md').read()[:10])", "open('/private/tmp/out.txt','w').write('x')", "from pathlib import Path; Path('/tmp/o.txt').write_text('x')", "print(sorted([3,1])[0])"])
    assert.equal(py(c), null, c);
});

// Round 4: git pointed elsewhere by exported variables, git's own write paths, and unpack/patch targets.
test('B1c: exported GIT_DIR/GIT_WORK_TREE reach later git commands in the same line', () => {
  for (const c of [`export GIT_WORK_TREE=${R}; git checkout x -- plugin`, `export GIT_DIR=${R}/.git GIT_WORK_TREE=${R}; git reset --hard x`, `declare -x GIT_DIR=${R}/.git; git checkout x -- .`,
    `GIT_WORK_TREE=${R}; export GIT_WORK_TREE; git checkout x -- plugin`, `typeset -x GIT_INDEX_FILE=/tmp/i; git read-tree x; git checkout-index -a -f`, `(export GIT_WORK_TREE=${R}; git checkout x -- .)`])
    assert.ok(bob(c)?.deny, c);
  assert.ok(main(`export GIT_DIR=/tmp/other.git; git push origin main`)?.deny, 'an exported GIT_DIR also hides push rules from the main thread');
  for (const c of ['export FOO=1; git add -A && git commit -m x', 'export PATH=$PATH:/x; git checkout -b t']) assert.equal(bob(c), null, c);
});
test('B1c: git checkout-index --prefix= and --output= paths are write targets', () => {
  for (const c of [`git -C ${WT} checkout-index -a -f --prefix=${R}/`, `git -C ${WT} checkout-index -a --prefix=${live}/`, `git -C ${WT} diff --output=${live}/hooks/guard.mjs`,
    `git -C ${WT} archive -o ${live}/x.tar HEAD`, 'git diff --output=.claude/settings.json']) assert.ok(bob(c)?.deny, c);
  for (const c of [`git -C ${WT} checkout-index -a -f --prefix=/tmp/export/`, `git -C ${WT} diff --output=/tmp/d.patch`, `git -C ${WT} archive -o /tmp/a.tar HEAD`]) assert.equal(bob(c), null, c);
});
test('B1c: tar -x, unzip and patch targets go through the plugin rule for every subagent', () => {
  for (const c of [`git -C ${WT} archive HEAD plugin | tar -x -C ${R}`, `tar -xf /tmp/x.tar -C ${live}`, `unzip -o /tmp/p.zip -d ${R}`, `cpio -idm -D ${R} < /tmp/x.cpio`,
    `patch -d ${R} -p1 < /tmp/p.diff`, `patch --directory=${live} -p1 < /tmp/p.diff`, `patch -o ${live}/hooks/guard.mjs a.ts < /tmp/p.diff`, `cd ${R} && patch -p1 < /tmp/p.diff`,
    `tar -xPf /tmp/x.tar`, `git -C ${WT} apply --unsafe-paths /tmp/p.diff`])
    assert.ok(bob(c)?.deny, c);
  for (const c of [`tar -xf /tmp/x.tar -C ${WT}`, `tar -xf /tmp/x.tar`, `unzip -o /tmp/p.zip -d ${WT}/out`, `patch -p1 < /tmp/p.diff`, `patch -d ${WT} -p1 < /tmp/p.diff`, `cp /tmp/x ${WT}/plugin/hooks/x.mjs`,
    `git -C ${WT} apply /tmp/p.diff`, 'git checkout -b t && git reset --hard HEAD && git stash && git stash pop', 'git rebase main', `cd ${WT} && bun test`])
    assert.equal(bob(c), null, c);
  assert.equal(main(`tar -xf /tmp/x.tar -C ${R}`), null, 'the main thread is unchanged');
});

test.after(() => fs.rmSync(W, { recursive: true, force: true }));
