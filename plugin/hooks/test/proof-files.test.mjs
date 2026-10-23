// Proof tests for the file-tool side of the guard, symlinked scratch roots, and the memory secret scanner.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { evaluate, findSecret } from '../guard.mjs';

const home = os.homedir();
const project = path.join(home, 'toon-crew-proof-nonexistent-project');
const env = { CLAUDE_PROJECT_DIR: project };
const tool = (tool_name, tool_input, cwd = project, e = env) => evaluate({ tool_name, cwd, tool_input }, e);

test('Edit on the installed plugin guard is denied (would switch every guard off)', () => {
  const r = tool('Write', { file_path: path.join(home, '.claude/plugins/cache/crew/toon-crew/0.1.0/hooks/guard.mjs'), content: 'process.exit(0)\n' });
  assert.ok(r?.deny, 'bypass: Write to the plugin guard allowed');
});
test('Edit on the plugin hooks.json is denied', () => {
  const r = tool('Edit', { file_path: path.join(home, '.claude/plugins/cache/crew/toon-crew/0.1.0/hooks/hooks.json'), old_string: 'PreToolUse', new_string: 'Unused' });
  assert.ok(r?.deny, 'bypass');
});
test('Edit on .git/config (adds alias p = push, defeating the push guard) is denied', () => {
  const r = tool('Edit', { file_path: path.join(project, '.git/config'), old_string: '[core]', new_string: '[alias]\n\tp = push\n[core]' });
  assert.ok(r?.deny, 'bypass');
});
test('Write on ~/.claude.json (MCP servers, per-project allowed tools) is denied', () => {
  const r = tool('Write', { file_path: path.join(home, '.claude.json'), content: '{}' });
  assert.ok(r?.deny, 'bypass');
});
test('Write on project .claude/hooks/ or .mcp.json is denied', () => {
  assert.ok(tool('Write', { file_path: path.join(project, '.mcp.json'), content: '{}' })?.deny, 'bypass .mcp.json');
});

test('rm -rf via a project scratch/ symlink to $HOME is denied', () => {
  const W = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-sym-'));
  const proj = path.join(W, 'cloned-repo');
  fs.mkdirSync(proj);
  fs.symlinkSync(home, path.join(proj, 'scratch'));   // git can ship this symlink in a repo
  // Control: without the link, ~/Documents is denied.
  assert.ok(tool('Bash', { command: `rm -rf ${home}/Documents` }, proj, { CLAUDE_PROJECT_DIR: proj })?.deny, 'control');
  const r = tool('Bash', { command: 'rm -rf scratch/Documents' }, proj, { CLAUDE_PROJECT_DIR: proj });
  fs.rmSync(W, { recursive: true, force: true });
  assert.ok(r?.deny, 'bypass: rm -rf scratch/Documents (= ~/Documents) allowed');
});

test('rm -rf inside a project that lives under the temp dir is denied', () => {
  const proj = path.join(os.tmpdir(), 'some-project');
  const r = tool('Bash', { command: 'rm -rf src .git' }, proj, { CLAUDE_PROJECT_DIR: proj });
  assert.ok(r?.deny, 'bypass: whole project deletable when it sits in $TMPDIR or /tmp');
});

const memPath = path.join(project, '.claude/agent-memory/tom/MEMORY.md');
const memWrite = (content) => tool('Write', { file_path: memPath, content });
for (const [label, text] of Object.entries({
  'Indian mobile with trunk 0': '- owner phone 09876543210',
  'Indian mobile 3-3-4 grouping': '- owner phone 987 654 3210',
  'Indian mobile with dots': '- owner phone 98765.43210',
  'credential with a space before the value': '- db password: "correct horse battery staple"',
  'postgres URL with password': '- dev db postgres://app:Sup3rS3cretPassw0rd@db.internal:5432/app',
  'UPI id': '- refund upi someone@okicici',
  'email address': '- owner email someone.real@icloud.com',
  'card number': '- test card 4111 1111 1111 1111 (real one used in prod: 5500 0000 0000 0004)',
  'Anthropic key with short body': '- key sk-ant-api03-abc',
  'NotebookEdit cell into memory .md': null,
})) {
  if (text === null) continue;
  test(`memory guard: ${label}`, () => assert.ok(memWrite(text)?.deny, `bypass: ${JSON.stringify(text)} accepted (findSecret=${findSecret(text)})`));
}
test('memory guard: memory-local scope (.claude/agent-memory-local) is covered', () => {
  const r = tool('Write', { file_path: path.join(project, '.claude/agent-memory-local/tom/MEMORY.md'), content: 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789' });
  assert.ok(r?.deny, 'bypass');
});
test('memory guard: secret split across two Edits', () => {
  const a = tool('Edit', { file_path: memPath, old_string: 'x', new_string: 'token ghp_ABCDEFGHIJ' });
  const b = tool('Edit', { file_path: memPath, old_string: 'ghp_ABCDEFGHIJ', new_string: 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123' });
  assert.ok(a?.deny || b?.deny, 'bypass');
});
