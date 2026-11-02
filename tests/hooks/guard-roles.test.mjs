// Read-only roles (ninja-hattori, joe-gardner, twenty-two, nobita, dekisugi, olaf, stuart): no Edit-type tools; Write only to
// their own memory file or temp; shell writes only to temp. Both spellings of the agent type.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { evaluate } from '../../plugin/hooks/guard.mjs';

const project = path.join(os.homedir(), 'toon-crew-roles-nonexistent-project');
const env = { CLAUDE_PROJECT_DIR: project };
const as = (agent_type, tool_name, tool_input, extra = {}) => evaluate({ tool_name, cwd: project, agent_type, tool_input, ...extra }, env);
const ROLES = ['ninja-hattori', 'joe-gardner', 'twenty-two', 'nobita', 'dekisugi', 'olaf', 'stuart'];

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
  assert.ok(as('twenty-two', 'Write', { file_path: path.join(os.tmpdir(), '..', '..', '..', 'etc/x'), content: 'x' })?.deny);
  assert.ok(as('twenty-two', 'Bash', { command: 'git push -f origin x' })?.deny);
});

// Deliverable folders: dekisugi and olaf -> docs/research, nobita -> docs/design and docs/research. Write only.
import { execFileSync } from 'node:child_process';
test('role deliverable folders: allowed and denied paths per role, both spellings', () => {
  const W = fs.mkdtempSync(path.join(import.meta.dirname, '.work-'));
  const proj = path.join(W, 'proj');
  for (const d of ['docs/research', 'docs/design', 'src']) fs.mkdirSync(path.join(proj, d), { recursive: true });
  const outside = path.join(W, 'outside'); fs.mkdirSync(path.join(outside, 'research'), { recursive: true });
  const proj2 = path.join(W, 'proj2'); fs.mkdirSync(proj2); fs.symlinkSync(outside, path.join(proj2, 'docs')); // symlinked docs dir
  const proj3 = path.join(W, 'proj3'); fs.mkdirSync(path.join(proj3, 'docs'), { recursive: true }); fs.symlinkSync(outside, path.join(proj3, 'docs/research'));
  const w = (agent, p, content = '# notes\nUse example.com, v1.2.3.', root = proj) => evaluate({ tool_name: 'Write', cwd: root, agent_type: agent, tool_input: { file_path: p, content } }, { CLAUDE_PROJECT_DIR: root });
  const grid = { dekisugi: { ok: ['docs/research/a.md', 'docs/research/sub/b.md'], no: ['docs/design/a.md', 'src/x.ts', 'docs/research/../src/x.ts', 'docs/researchX/a.md', 'docs/a.md', 'README.md'] },
    olaf: { ok: ['docs/research/a.md'], no: ['docs/design/a.md', 'src/x.ts', 'docs/research/../../outside/x.md'] },
    nobita: { ok: ['docs/design/a.md', 'docs/research/a.md', 'docs/design/deep/er/a.md'], no: ['src/x.ts', 'docs/design/../src/x.ts', 'docs/x.md'] },
    'ninja-hattori': { ok: [], no: ['docs/research/a.md', 'docs/design/a.md'] }, 'joe-gardner': { ok: [], no: ['docs/research/a.md', 'docs/design/a.md'] }, 'twenty-two': { ok: [], no: ['docs/research/a.md', 'docs/design/a.md'] }, stuart: { ok: [], no: ['docs/research/a.md', 'docs/design/a.md'] } };
  for (const [role, { ok, no }] of Object.entries(grid)) for (const agent of [role, `toon-crew:${role}`]) {
    for (const f of ok) assert.equal(w(agent, path.join(proj, f)), null, `${agent} should write ${f}`);
    for (const f of no) assert.ok(w(agent, path.join(proj, f))?.deny, `${agent} must not write ${f}`);
    for (const t of ['Edit', 'MultiEdit']) assert.ok(evaluate({ tool_name: t, cwd: proj, agent_type: agent, tool_input: { file_path: path.join(proj, 'docs/research/a.md'), old_string: 'a', new_string: 'b' } }, { CLAUDE_PROJECT_DIR: proj })?.deny, `${agent} ${t}`);
    assert.ok(evaluate({ tool_name: 'Bash', cwd: proj, agent_type: agent, tool_input: { command: 'echo x > docs/research/a.md' } }, { CLAUDE_PROJECT_DIR: proj })?.deny, `${agent} shell write`);
  }
  assert.ok(w('dekisugi', path.join(proj2, 'docs/research/a.md'), undefined, proj2)?.deny, 'symlinked docs dir');
  assert.ok(w('dekisugi', path.join(proj3, 'docs/research/a.md'), undefined, proj3)?.deny, 'symlinked docs/research dir');
  assert.ok(w('nobita', path.join(proj, 'docs/design/a.md'), 'key ghp_ABCDEFGHIJKLMNOPQRSTUVWX')?.deny, 'secret scan applies to documents');
  assert.ok(w('olaf', path.join(proj, 'docs/research/a.md'), 'call 9876543210 or dev@realco.in')?.deny);
  assert.equal(w('bob-the-builder', path.join(proj, 'src/x.ts')), null);
  fs.rmSync(W, { recursive: true, force: true });
  void execFileSync;
});

test('retired ids carry no role rules any more (they are not in the cast)', () => {
  for (const agent of ['scooby-doo', 'tom', 'velma', 'chip-and-dale', 'dexter', 'dorami', 'toon-crew:dorami']) {
    assert.equal(as(agent, 'Write', { file_path: path.join(project, 'src/a.ts'), content: 'x' }), null, agent);
    assert.equal(as(agent, 'Bash', { command: 'git commit -m x' }), null, agent);
    assert.equal(as(agent, 'Bash', { command: 'git push origin feat/x' }), null, agent);
  }
});
