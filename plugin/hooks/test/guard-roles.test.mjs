// Read-only roles (scooby-doo, nobita, velma, tom, chip-and-dale, dexter): no Edit-type tools; Write only to
// their own memory file or temp; shell writes only to temp. Both spellings of the agent type.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { evaluate } from '../guard.mjs';

const project = path.join(os.homedir(), 'toon-crew-roles-nonexistent-project');
const env = { CLAUDE_PROJECT_DIR: project };
const as = (agent_type, tool_name, tool_input, extra = {}) => evaluate({ tool_name, cwd: project, agent_type, tool_input, ...extra }, env);
const ROLES = ['scooby-doo', 'nobita', 'velma', 'tom', 'chip-and-dale', 'dexter'];

for (const role of ROLES) {
  for (const agent of [role, `toon-crew:${role}`, `toon-crew:${role.toUpperCase()}`]) {
    test(`${agent}: edits denied, Write only to own memory or temp, shell writes only to temp`, () => {
      const own = path.join(project, `.claude/agent-memory/toon-crew-${role}/MEMORY.md`);
      const other = ROLES.find((r) => r !== role);
      for (const tool of ['Edit', 'MultiEdit']) assert.ok(as(agent, tool, { file_path: own, old_string: 'a', new_string: 'b' })?.deny, `${tool} even on own memory`);
      assert.ok(as(agent, 'NotebookEdit', { notebook_path: path.join(os.tmpdir(), 'n.ipynb'), new_source: 'x' })?.deny);
      assert.equal(as(agent, 'Write', { file_path: own, content: '- a clean lesson' }), null);
      assert.equal(as(agent, 'Write', { file_path: path.join(os.tmpdir(), 'notes.md'), content: 'x' }), null);
      assert.equal(as(agent, 'Write', { file_path: '/private/tmp/claude-501/scratch/a.md', content: 'x' }, { scratchpad_dir: '/private/tmp/claude-501/scratch' }), null);
      for (const f of [path.join(project, 'src/a.ts'), path.join(project, `.claude/agent-memory/toon-crew-${other}/MEMORY.md`), path.join(project, `.claude/agent-memory/toon-crew-${role}/other.md`), path.join(project, 'tmp/x.md'), 'README.md'])
        assert.ok(as(agent, 'Write', { file_path: f, content: 'x' })?.deny, f);
      assert.ok(as(agent, 'Write', { file_path: own, content: 'token ghp_ABCDEFGHIJKLMNOPQRSTUVWX' })?.deny, 'the secret scan still applies to own memory');
      assert.equal(as(agent, 'Bash', { command: `echo hi > ${os.tmpdir()}/out.txt && ls` }), null);
      assert.equal(as(agent, 'Bash', { command: 'git status 2>&1 | head' }), null);
      assert.equal(as(agent, 'Bash', { command: 'ls > /dev/null' }), null);
      for (const c of ['echo hi > src/a.ts', 'tee notes.md', 'cp a b', 'sed -i "" s/a/b/ src/a.ts', 'mv a b', 'echo x >> $HOME/y']) assert.ok(as(agent, 'Bash', { command: c })?.deny, c);
      assert.equal(as(agent, 'Read', { file_path: 'x' }), null);
    });
  }
}
test('other agents and the main session are not limited', () => {
  for (const agent of ['bob-the-builder', 'toon-crew:doraemon', undefined, 'tomato']) {
    assert.equal(as(agent, 'Write', { file_path: path.join(project, 'src/a.ts'), content: 'x' }), null, String(agent));
    assert.equal(as(agent, 'Edit', { file_path: path.join(project, 'src/a.ts'), old_string: 'a', new_string: 'b' }), null, String(agent));
  }
});
test('role rules do not unlock protected files', () => {
  assert.ok(as('tom', 'Write', { file_path: path.join(os.tmpdir(), '..', '..', '..', 'etc/x'), content: 'x' })?.deny);
  assert.ok(as('tom', 'Bash', { command: 'git push -f origin x' })?.deny);
});
