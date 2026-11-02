// Proof tests: each command below SHOULD be denied/asked by the toon-crew guard. Every failing case is a bypass.
// Run: node --test guard-bypass.test.mjs   (imports the guard from ../src, commit 063ffd0)
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { evaluate } from '../../plugin/hooks/guard.mjs';

// A project path outside the temp dir (does not need to exist: the guard walks up to the nearest real folder).
const project = path.join(os.homedir(), 'toon-crew-proof-nonexistent-project');
const env = { CLAUDE_PROJECT_DIR: project };
const run = (command, cwd = project) => evaluate({ tool_name: 'Bash', cwd, tool_input: { command } }, env);
const denied = (c) => assert.ok(run(c)?.deny, `bypass (allowed): ${c}`);
const askedOrDenied = (c) => { const r = run(c); assert.ok(r?.deny || r?.ask, `bypass (allowed): ${c}`); };

// Real repo on main for the implicit-push cases.
const W = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-proof-'));
const repo = path.join(W, 'repo');
execFileSync('git', ['init', '-q', '-b', 'main', repo]);
const onMain = (c) => evaluate({ tool_name: 'Bash', cwd: repo, tool_input: { command: c } }, { CLAUDE_PROJECT_DIR: repo });

const cases = {
  'push main: git alias via -c': ['ask', 'git -c alias.p=push p origin main'],
  'force push main: -c remote.origin.push': ['deny', 'git -c remote.origin.push=+HEAD:refs/heads/main push origin'],
  'force: abbreviated --force-w (git accepts unique prefixes)': ['deny', 'git push --force-w origin feat/x'],
  'mirror: abbreviated --mir': ['deny', 'git push --mir origin'],
  'delete main: abbreviated --del (only asks)': ['deny', 'git push --del origin main'],
  'push via $IFS': ['deny', 'git${IFS}push${IFS}-f${IFS}origin${IFS}main'],
  "push via ANSI-C quoting $'git'": ['deny', "$'git' push -f origin main"],
  'push via brace expansion': ['deny', '{git,push,-f,origin,main}'],
  'push via function with "$@"': ['deny', 'function g { git "$@"; }; g push -f origin main'],
  'push via here-string to bash': ['deny', "bash -s <<< 'git push -f origin main'"],
  'push via pipe to sh': ['deny', "echo 'git push -f origin main' | sh"],
  'push via python -c': ['deny', `python3 -c 'import subprocess; subprocess.run(["git","push","-f","origin","main"])'`],
  'push via node -e': ['deny', `node -e 'require("child_process").execSync("git push -f origin main")'`],
  'push via perl -e': ['deny', `perl -e 'system("git","push","-f","origin","main")'`],
  'push via find -exec': ['deny', 'find . -maxdepth 0 -exec git push -f origin main \;'],
  'push via env -S': ['deny', "env -S 'git push -f origin main'"],
  'push via xargs args': ['ask', 'echo main | xargs git push origin'],
  'gh pr merge via gh alias': ['ask', "gh alias set m 'pr merge' && gh m 5"],
  'merge into main via gh api merges endpoint': ['ask', 'gh api repos/o/r/merges -f base=main -f head=feat/x'],
  'merge via graphql mutation': ['ask', `gh api graphql -f query='mutation{mergePullRequest(input:{pullRequestId:"x"}){clientMutationId}}'`],
  'force-move main via gh api refs PATCH': ['deny', 'gh api -X PATCH repos/o/r/git/refs/heads/main -f sha=deadbeef -F force=true'],
  'repo delete via full URL': ['deny', 'gh api -X DELETE https://api.github.com/repos/o/r'],
  'repo delete via curl + gh token': ['deny', 'curl -X DELETE -H "Authorization: token $(gh auth token)" https://api.github.com/repos/o/r'],
  'rm: cd into variable then relative path': ['deny', 'cd /tmp; cd $HOME; rm -rf Documents'],
  'rm: cd inside a subshell is tracked as if it stuck': ['deny', '(cd /tmp); rm -rf Documents'],
  'rm: mv out then rm in tmp': ['deny', 'mv ~/Documents /tmp/x && rm -rf /tmp/x'],
  'rm: symlink planted in the same command': ['deny', 'ln -s ~ /tmp/tc-h && rm -rf /tmp/tc-h/Documents'],
  'rm: GNU long-option abbreviation --recur': ['deny', 'rm --recur -f ~/Documents'],
  'delete: find -delete': ['deny', 'find ~/Documents -delete'],
  'delete: git clean -ffdx': ['deny', 'git clean -ffdx'],
  'delete: rsync --delete': ['deny', 'rsync -a --delete /tmp/empty/ ~/Documents/'],
  'docker: --volumes=true': ['deny', 'docker compose down --volumes=true'],
  'docker: system prune --volumes=true': ['deny', 'docker system prune -af --volumes=true'],
  'docker: wipe a volume from a container': ['deny', 'docker run --rm -v pgdata:/d alpine sh -c "rm -rf /d/*"'],
  'settings: python open()': ['deny', `python3 -c "open('.claude/settings.json','w').write('{}')"`],
  'settings: node writeFileSync': ['deny', `node -e "require('fs').writeFileSync('.claude/settings.local.json','{}')"`],
  'settings: cd .claude then redirect': ['deny', "cd .claude && echo '{}' > settings.json"],
  'settings: quoted path pieces': ['deny', `echo '{}' > .claude/"settings".json`],
  'settings: glob': ['deny', "echo '{}' > .claude/setting?.json"],
  'settings: hard link then edit the link': ['deny', 'cd .claude && ln settings.json ../innocent.json'],
  'memory secret via shell append': ['deny', "echo 'token=ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789' >> .claude/agent-memory/tom/MEMORY.md"],
  'memory phone via heredoc': ['deny', "cat >> .claude/agent-memory/tom/MEMORY.md <<'EOF'\n- owner phone 9876543210\nEOF"],
  'guard self-disable: overwrite installed guard': ['deny', "echo 'process.exit(0)' > ~/.claude/plugins/cache/crew/toon-crew/0.1.0/hooks/guard.mjs"],
};

for (const [name, [want, cmd]] of Object.entries(cases)) {
  test(name, () => (want === 'ask' ? askedOrDenied(cmd) : denied(cmd)));
}

test('push main: on a branch that tracks main (push.default=upstream)', () => {
  // On feat/x tracking origin/main, a bare push updates main; the guard only looks at the local branch name.
  const r = evaluate({ tool_name: 'Bash', cwd: repo, tool_input: { command: 'git checkout -q -b feat/x && git -c push.default=upstream push' } }, { CLAUDE_PROJECT_DIR: repo });
  assert.ok(r?.ask || r?.deny, 'bypass (allowed)');
});

test('control: plain git push -f origin main is denied', () => assert.ok(onMain('git push -f origin main')?.deny));
