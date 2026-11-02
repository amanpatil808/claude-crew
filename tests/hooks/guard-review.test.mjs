// Proofs for the docs-review gaps (Oct 2026): spawn escape through the Agent tool, fail-open exits,
// Monitor running shell commands unchecked, read-only roles with Edit back, and async hook timeouts.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { evaluate } from '../../plugin/hooks/guard.mjs';

const HOOKS = path.join(import.meta.dirname, '..', '..', 'plugin', 'hooks');
const GUARD = path.join(HOOKS, 'guard.mjs');
const AGENTS = path.join(HOOKS, '..', 'agents');
// Outside the system temp dir: read-only roles may write anywhere under it.
const W = fs.mkdtempSync(path.join(import.meta.dirname, '.work-'));
const project = path.join(W, 'proj');
for (const d of ['src', 'docs/research', 'docs/design']) fs.mkdirSync(path.join(project, d), { recursive: true });
const env = { CLAUDE_PROJECT_DIR: project };
const run = (stdin, nodeArgs = []) => spawnSync('node', ['--no-warnings', ...nodeArgs, GUARD], { input: stdin, encoding: 'utf8', env: { ...process.env, ...env } });
const hookJson = (o) => JSON.stringify({ hook_event_name: 'PreToolUse', cwd: project, ...o });
const oneLine = (r) => { assert.match(r.stderr, /^toon-crew guard: .+\n$/); assert.equal(r.stderr.trim().split('\n').length, 1); };

const crew = fs.readdirSync(AGENTS).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3));
const frontmatter = (id) => {
  const text = fs.readFileSync(path.join(AGENTS, `${id}.md`), 'utf8');
  const fm = /^---\n([\s\S]*?)\n---/.exec(text)?.[1] ?? '';
  const list = (key) => (new RegExp(`^${key}:\\s*(.*)$`, 'm').exec(fm)?.[1] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return { tools: list('tools'), disallowed: list('disallowedTools') };
};
const spawn = (agent_type, subagent_type) => evaluate({ tool_name: 'Agent', cwd: project, agent_type, tool_input: { description: 'x', prompt: 'x', ...(subagent_type === undefined ? {} : { subagent_type }) } }, env);

// ---------- 1. spawn escape ----------
test('Agent: the main thread and doraemon may spawn anyone', () => {
  for (const caller of [undefined, '', 'doraemon', 'toon-crew:doraemon', 'TOON-CREW:Doraemon']) {
    for (const t of ['bob', 'toon-crew:bob', 'toon-crew:kevin', 'general-purpose', 'Explore', 'fork', undefined]) assert.equal(spawn(caller, t), null, `${caller} -> ${t}`);
  }
});
test('Agent: dekisugi may spawn only toon-crew:olaf or toon-crew:stuart', () => {
  for (const caller of ['dekisugi', 'toon-crew:dekisugi', 'toon-crew:DEKISUGI']) {
    for (const t of ['toon-crew:olaf', 'toon-crew:stuart', 'Toon-Crew:Stuart']) assert.equal(spawn(caller, t), null, `${caller} -> ${t}`);
    for (const t of ['olaf', 'stuart', 'bob', 'toon-crew:bob', 'toon-crew:kevin', 'general-purpose', 'Explore', 'fork', '', undefined, 'other-plugin:olaf', 'toon-crew:olaf:x', 'olafx', ' olaf'])
      assert.match(spawn(caller, t)?.deny ?? '', /dekisugi may start only toon-crew:olaf or toon-crew:stuart/, `${caller} -> ${JSON.stringify(t)}`);
  }
});
test('Agent: every other crew role is denied, both spellings, and so is an unlisted toon-crew: agent', () => {
  const others = crew.filter((id) => !['doraemon', 'dekisugi'].includes(id));
  assert.ok(others.length >= 10, 'agents dir read');
  for (const id of others) for (const caller of [id, `toon-crew:${id}`]) {
    for (const t of ['olaf', 'toon-crew:bob', 'general-purpose']) assert.match(spawn(caller, t)?.deny ?? '', /may not start other agents/, `${caller} -> ${t}`);
  }
  assert.ok(spawn('toon-crew:someone-new', 'olaf')?.deny, 'a crew agent added later is denied until it is listed');
});
test('Agent: non-crew agent types keep the existing behaviour (not limited by the guard)', () => {
  for (const caller of ['bob-the-builder', 'Explore', 'general-purpose', 'tomato', 'other-plugin:bob']) assert.equal(spawn(caller, 'toon-crew:bob'), null, caller);
});
test('Agent: CLI exits 2 with one line when dekisugi spawns bob', () => {
  const r = run(hookJson({ tool_name: 'Agent', agent_type: 'toon-crew:dekisugi', tool_input: { description: 'x', prompt: 'edit src', subagent_type: 'toon-crew:bob' } }));
  assert.equal(r.status, 2); oneLine(r);
  assert.equal(run(hookJson({ tool_name: 'Agent', agent_type: 'toon-crew:dekisugi', tool_input: { prompt: 'x', subagent_type: 'toon-crew:olaf' } })).status, 0);
});
test('agents: only doraemon and dekisugi keep the Agent tool', () => {
  for (const id of crew) {
    const { tools, disallowed } = frontmatter(id);
    if (id === 'doraemon') { assert.ok(!disallowed.includes('Agent'), id); continue; }
    if (id === 'dekisugi') { assert.ok(tools.includes('Agent') && !disallowed.includes('Agent'), id); continue; }
    assert.ok(disallowed.includes('Agent'), `${id}: Agent in disallowedTools`);
    assert.ok(!tools.some((t) => /^Agent\b/.test(t)), `${id}: no Agent in tools`);
  }
});

// ---------- 2. fail-open exits ----------
test('CLI: unreadable or non-object input blocks (exit 2), never exit 1', () => {
  for (const stdin of ['not json', '', '{', 'null', '[]', '42', '"Bash"']) { const r = run(stdin); assert.equal(r.status, 2, JSON.stringify(stdin)); oneLine(r); }
});
test('CLI: an internal error blocks even on a call that looks harmless', () => {
  const pre = path.join(W, 'boom.mjs');
  fs.writeFileSync(pre, "import os from 'node:os'; os.tmpdir = () => { throw new Error('boom'); };\n");
  for (const tool of [{ tool_name: 'Write', tool_input: { file_path: path.join(project, 'src/a.ts'), content: 'x' } }, { tool_name: 'Bash', tool_input: { command: 'ls' } }]) {
    const r = run(hookJson(tool), ['--import', pre]);
    assert.equal(r.status, 2, tool.tool_name); oneLine(r); assert.match(r.stderr, /blocked to be safe/);
  }
});
test('CLI: a failure reading stdin blocks', () => {
  const pre = path.join(W, 'stdin.mjs');
  fs.writeFileSync(pre, "process.stdin[Symbol.asyncIterator] = async function* () { throw new Error('read failed'); };\n");
  const r = run('{}', ['--import', pre]);
  assert.equal(r.status, 2); oneLine(r);
});

// ---------- 3. read-only roles: Edit/Write outside their folders is denied end to end ----------
const READ_ONLY = ['ninja-hattori', 'joe-gardner', 'twenty-two', 'nobita', 'dekisugi', 'olaf', 'stuart'];
const DOCS = { dekisugi: ['docs/research'], olaf: ['docs/research'], nobita: ['docs/design', 'docs/research'] };
// What `memory:` turns on does not matter: the guard is the lock. The grid runs in-process; one role per spelling end to end.
test('read-only roles: Edit/MultiEdit/Write denied outside docs and own memory; own memory Write works', () => {
  const edit = { old_string: 'a', new_string: 'b' };
  for (const role of READ_ONLY) for (const agent_type of [role, `toon-crew:${role}`]) {
    const call = (tool_name, file, extra = {}) => (evaluate({ tool_name, cwd: project, agent_type, tool_input: { file_path: path.join(project, file), ...extra } }, env)?.deny ? 2 : 0);
    const other = role === 'olaf' ? 'stuart' : 'olaf';
    for (const f of ['src/a.ts', 'README.md', `.claude/agent-memory/toon-crew-${other}/MEMORY.md`, '.claude/agent-memory/MEMORY.md', `.claude/agent-memory-${role}/MEMORY.md`, `.claude/agent-memory/toon-crew-${role}/../toon-crew-${other}/MEMORY.md`]) {
      assert.equal(call('Write', f, { content: 'x' }), 2, `${agent_type} Write ${f}`);
      assert.equal(call('Edit', f, edit), 2, `${agent_type} Edit ${f}`);
    }
    assert.equal(call('MultiEdit', 'src/a.ts', { edits: [edit] }), 2, `${agent_type} MultiEdit`);
    // Nobita edits docs/design as part of his style allow-list (guard-style.test.mjs); docs/research stays Write-only.
    for (const d of DOCS[role] ?? ['docs/research']) assert.equal(call('Edit', `${d}/a.md`, edit), role === 'nobita' && d === 'docs/design' ? 0 : 2, `${agent_type} Edit in ${d}`);
    for (const d of DOCS[role] ?? []) assert.equal(call('Write', `${d}/a.md`, { content: '# notes' }), 0, `${agent_type} Write in ${d}`);
    assert.equal(call('Write', `.claude/agent-memory/toon-crew-${role}/MEMORY.md`, { content: '- a clean lesson (seen 1) [crew]' }), 0, `${agent_type} memory write`);
  }
  for (const [agent_type, tool_name, file, want] of [['toon-crew:stuart', 'Edit', 'src/a.ts', 2], ['stuart', 'Write', 'src/a.ts', 2], ['toon-crew:olaf', 'Write', 'docs/research/a.md', 0],
    ['toon-crew:stuart', 'Write', '.claude/agent-memory/toon-crew-stuart/MEMORY.md', 0], ['toon-crew:stuart', 'Write', '.claude/agent-memory/toon-crew-olaf/MEMORY.md', 2]]) {
    const r = run(hookJson({ tool_name, agent_type, tool_input: { file_path: path.join(project, file), content: '- ok', old_string: 'a', new_string: 'b' } }));
    assert.equal(r.status, want, `CLI ${agent_type} ${tool_name} ${file}`);
  }
});

// ---------- 4 and 5. hooks.json and Monitor ----------
// Claude Code reads a matcher with only [A-Za-z0-9_ ,|-] as exact names, anything else as an unanchored regex.
const matches = (matcher, name) => (/^[\w\s,|-]*$/.test(matcher) ? matcher.split(/[|,]/).map((s) => s.trim()).includes(name) : new RegExp(matcher).test(name));
test('hooks.json: the guard sees Agent and Monitor, blocks when it fails, keeps its sync timeout', () => {
  const hooks = JSON.parse(fs.readFileSync(path.join(HOOKS, 'hooks.json'), 'utf8')).hooks;
  const g = hooks.PreToolUse.find((x) => x.hooks.some((h) => h.command.includes('guard.mjs')));
  for (const t of ['Bash', 'Monitor', 'Agent', 'Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'mcp__x__push', 'Read', 'Grep']) assert.ok(matches(g.matcher, t), t);
  assert.ok(!/PowerShell/.test(g.matcher));
  const h = g.hooks.find((x) => x.command.includes('guard.mjs'));
  assert.equal(h.onFailure, 'block'); assert.equal(h.async, undefined); assert.ok(h.timeout > 0 && h.timeout <= 10);
});
test('hooks.json: async hooks carry no timeout (Claude Code does not enforce it)', () => {
  const hooks = JSON.parse(fs.readFileSync(path.join(HOOKS, 'hooks.json'), 'utf8')).hooks;
  const all = Object.values(hooks).flat().flatMap((g) => g.hooks);
  assert.ok(all.filter((h) => h.async).length >= 7);
  for (const h of all.filter((x) => x.async)) assert.equal(h.timeout, undefined, h.command);
});
test('Monitor: its command is checked like Bash; a WebSocket watch is not a shell', () => {
  const mon = (tool_input, agent_type) => evaluate({ tool_name: 'Monitor', cwd: project, agent_type, tool_input: { description: 'd', timeout_ms: 1000, ...tool_input } }, env);
  for (const c of ['git push --force origin x', 'rm -rf ~/x', 'docker volume prune -f', 'while true; do git push -f origin x; sleep 1; done']) assert.ok(mon({ command: c })?.deny ?? mon({ command: c })?.ask, c);
  assert.ok(mon({ command: 'gh pr merge 5' }, 'toon-crew:sulley')?.ask);
  assert.ok(mon({ command: 'gh pr merge 5' })?.deny, 'only DevOps merges');
  assert.ok(mon({ command: 'echo x > src/a.ts' }, 'toon-crew:joe-gardner')?.deny, 'role shell writes');
  assert.equal(mon({ command: 'tail -f app.log | grep --line-buffered ERROR' }), null);
  assert.equal(mon({ ws: { url: 'wss://example.com/s' } }), null);
  const r = run(hookJson({ tool_name: 'Monitor', tool_input: { description: 'd', timeout_ms: 1000, command: 'git push -f origin x' } }));
  assert.equal(r.status, 2); oneLine(r);
});

test.after(() => fs.rmSync(W, { recursive: true, force: true }));
