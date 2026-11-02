// Controls: things the guard gets right (all should pass).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { evaluate } from '../../plugin/hooks/guard.mjs';
const project = path.join(os.homedir(), 'toon-crew-proof-nonexistent-project');
const env = { CLAUDE_PROJECT_DIR: project };
const ev = (tool_name, tool_input, cwd = project) => evaluate({ tool_name, cwd, tool_input }, env);
const GH = 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
test('settings: upper case, new file, ~/.claude, NotebookEdit', () => {
  for (const p of ['.CLAUDE/SETTINGS.JSON', '.claude/settings.local.json', '~/.claude/settings.json', path.join(project, '.claude/./x/../settings.json')]) assert.ok(ev('Write', { file_path: p, content: '{}' })?.deny, p);
  assert.ok(ev('NotebookEdit', { notebook_path: '.claude/settings.json', new_source: '{}' })?.deny);
});
test('settings: symlink to settings is resolved', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-s-')); fs.mkdirSync(path.join(d, '.claude')); fs.writeFileSync(path.join(d, '.claude/settings.json'), '{}');
  fs.symlinkSync(path.join(d, '.claude/settings.json'), path.join(d, 'innocent.json'));
  const r = evaluate({ tool_name: 'Edit', cwd: d, tool_input: { file_path: 'innocent.json', old_string: '{}', new_string: '{"x":1}' } }, { CLAUDE_PROJECT_DIR: d });
  fs.rmSync(d, { recursive: true }); assert.ok(r?.deny);
});
test('memory: MultiEdit and NotebookEdit content is scanned', () => {
  assert.ok(ev('MultiEdit', { file_path: '.claude/agent-memory/x/MEMORY.md', edits: [{ old_string: 'a', new_string: 'ok' }, { old_string: 'b', new_string: GH }] })?.deny);
  assert.ok(ev('NotebookEdit', { notebook_path: '.claude/agent-memory/x/MEMORY.md', new_source: '+91 98765 43210' })?.deny);
});
test('shell: quoting, bash -c, eval, $(), backticks, sudo/env/command, git -C', () => {
  for (const c of ['"git" push -f origin x', "bash -c 'git push -f origin x'", 'eval git push -f origin x', 'echo $(git push -f origin x)', 'echo `git push -f origin x`',
    'sudo -u root git push -f origin x', 'env A=1 git push -f origin x', 'command git push -f origin x', `git -C ${project} push --force origin x`, 'g\\it push -f origin x',
    'rm -rf ~/x', 'rm -r -f /', 'rm -rf "$HOME"', 'docker compose down -v', 'docker volume prune -f', 'gh repo delete o/r --yes', 'gh api -X DELETE repos/o/r'])
    assert.ok(ev('Bash', { command: c })?.deny, c);
});
