// The plugin data folder from a crew role's shell: a Bash or Monitor command line that names the folder (the
// CLAUDE_PLUGIN_DATA variable in any spelling, its path, real path, ~ or $HOME form, or a path that resolves into
// it) is refused unless every command on the line is a plain read (cat, head, tail, ls, grep, wc, no redirection).
// Doraemon, the main session and agents that are not crew keep their rules.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { evaluate } from '../../plugin/hooks/guard.mjs';

const GUARD = path.join(import.meta.dirname, '..', '..', 'plugin', 'hooks', 'guard.mjs');
// Outside the system temp dir: read-only roles may write anywhere under it, so a refusal there would prove nothing.
const W = fs.realpathSync(fs.mkdtempSync(path.join(import.meta.dirname, '.work-')));
process.on('exit', () => fs.rmSync(W, { recursive: true, force: true }));
const project = path.join(W, 'proj');
fs.mkdirSync(path.join(project, '.git'), { recursive: true });
const DATA_A = path.join(W, 'home/.claude/plugins/data/toon-crew-crew');
const DATA_B = path.join(W, 'data');
const KEY = 'proj-1a2b3c4d';
const hbDir = (data, id, kind = 'summaries') => path.join(data, 'projects', KEY, 'handbacks', kind, id);
for (const data of [DATA_A, DATA_B]) {
  fs.mkdirSync(hbDir(data, 'kevin'), { recursive: true });
  fs.writeFileSync(path.join(data, 'events.jsonl'), '{}\n');
  for (const id of ['kevin', 'joe-gardner']) { fs.mkdirSync(hbDir(data, id), { recursive: true }); fs.writeFileSync(path.join(hbDir(data, id), 'r.md'), 'Verdict: done\n'); }
}
fs.mkdirSync(`${DATA_B}-2`); // a sibling whose name starts with the data folder's name
const LINK = path.join(W, 'link-to-data'); fs.symlinkSync(DATA_B, LINK);
const home = os.homedir();
const tilde = path.relative(home, DATA_B); // the data folder written from ~ (the test tree sits under the home folder)
const underHome = !tilde.startsWith('..') && !path.isAbsolute(tilde);

// Builders, a read-only role, the DevOps Team, the knowledge manager, the writer; prefixed and bare names.
const CREW = ['toon-crew:kevin', 'toon-crew:bob', 'toon-crew:shinchan', 'toon-crew:nobita', 'toon-crew:mike-wazowski', 'toon-crew:sulley', 'toon-crew:miguel-rivera',
  'toon-crew:shizuka', 'toon-crew:joe-gardner', 'kevin', 'joe-gardner'];
const sh = (command, { agent_type = 'toon-crew:kevin', agent_id = 'a1', data = DATA_B, tool = 'Bash', cwd = project } = {}) => evaluate(
  { tool_name: tool, cwd, ...(agent_type ? { agent_type } : {}), ...(agent_id ? { agent_id } : {}), tool_input: { command } },
  { CLAUDE_PROJECT_DIR: project, ...(data === undefined ? {} : { CLAUDE_PLUGIN_DATA: data }) });
const denied = (r, what) => assert.ok(r?.deny, `${what} should be refused, got ${JSON.stringify(r)}`);
const ok = (r, what) => assert.equal(r, null, `${what}: ${JSON.stringify(r)}`);

// The exploratory tester's repros (0.3.14), with this test's folders.
const writes = (D) => [
  'rm $CLAUDE_PLUGIN_DATA/events.jsonl', 'rm -f "${CLAUDE_PLUGIN_DATA}/projects.json"', 'cp /dev/null $CLAUDE_PLUGIN_DATA/limits.json',
  'tee $CLAUDE_PLUGIN_DATA/events.jsonl < /dev/null', 'echo x > $CLAUDE_PLUGIN_DATA/events.jsonl', 'echo x > "${CLAUDE_PLUGIN_DATA}/projects/p/handbacks/full/kevin/r.md"',
  `D=${D}; echo x > $D/events.jsonl`, 'cd $CLAUDE_PLUGIN_DATA && echo x > events.jsonl', `cd ${D} && touch x`, `cd ${D} && cat events.jsonl`,
  `touch ${D}/events.jsonl`, `touch ${hbDir(D, 'kevin')}/r.md`, `mkdir -p ${hbDir(D, 'kevin')}`, `sort -o ${hbDir(D, 'kevin')}/r.md x`, `chmod 777 ${D}`, `chown me ${D}/events.jsonl`,
  `git -C ${D} init`, `python3 -c "open('${D}/events.jsonl','w')"`, `node -e "require('fs').writeFileSync('${D}/events.jsonl','')"`,
  `perl -e 'open(F,">${D}/events.jsonl")'`, `ruby -e 'File.write("${D}/events.jsonl","")'`,
  `CLAUDE_PLUGIN_DATA=${D} bash ${project}/board.sh handbacks dir`, 'CLAUDE_PLUGIN_DATA="${CLAUDE_PLUGIN_DATA}" bash "${CLAUDE_PLUGIN_ROOT}/board/board.sh" handbacks list --limit 5',
  // Other spellings of the variable: split by quotes, escaped, ANSI-C, in a here-doc or a nested command.
  'echo x > $CLAUDE_"PLUGIN_DATA"/events.jsonl', 'echo x > $CLAUDE_PLUGIN_\\DATA/events.jsonl', "n=$'CLAUDE_PLUGIN_\\x44ATA'; echo x > ${!n}/e",
  'bash <<EOF\necho x > $CLAUDE_PLUGIN_DATA/events.jsonl\nEOF', `cat <<EOF > /tmp/s.sh\necho x > ${D}/events.jsonl\nEOF`, 'ls $(touch $CLAUDE_PLUGIN_DATA/x)',
  // A plain read is not enough when the line also writes, redirects or runs something else.
  `cat ${D}/events.jsonl > /tmp/copy`, `cat ${D}/events.jsonl | sh`, `cat ${D}/events.jsonl | tee /tmp/y`, `ls ${D} && touch /tmp/x`, `ls ${D} | xargs rm`,
  `LC_ALL=C cat ${D}/events.jsonl`, `env cat ${D}/events.jsonl`, `sed -n 1p ${D}/events.jsonl`, `find ${D} -name '*.md'`, `cat ${D}/events.jsonl >> ${D}/events.jsonl`,
  // Spelled differently: other case, a dot segment, a trailing slash.
  `touch ${D.toUpperCase()}/events.jsonl`, `touch ${D}/./events.jsonl`, `chmod 700 ${D}/`,
];
test('every repro: crew roles are refused a shell command that names the data folder and could write', () => {
  for (const [label, D] of [['custom folder', DATA_B], ['plugins/data folder', DATA_A]]) for (const agent_type of CREW) for (const c of writes(D)) {
    denied(sh(c, { agent_type, data: D }), `${label} ${agent_type}: ${c}`);
  }
  denied(sh('echo x > $CLAUDE_PLUGIN_DATA/events.jsonl', { tool: 'Monitor' }), 'Monitor runs shell commands too');
});
test('the folder named another way: ~ and $HOME, a relative path, cd to the parent, a link from outside', () => {
  const rel = path.relative(project, DATA_B);
  const cases = [`touch ${rel}/events.jsonl`, `cd .. && touch data/events.jsonl`, `cd ${W} && mkdir -p data/projects`, `python3 -c "open('${rel}/events.jsonl','w')"`,
    `touch ${LINK}/events.jsonl`, `chmod 777 ${LINK}`, `git -C ${LINK} init`,
    // Glued to an option: the word is not a path, so only the spelled-out folder gives it away.
    `git -C${DATA_B} init`, `tar -xf a.tar -C${DATA_B}`];
  if (underHome) cases.push(`touch ~/${tilde}/events.jsonl`, `touch $HOME/${tilde}/events.jsonl`, `touch "\${HOME}/${tilde}/events.jsonl"`, `cd ~/${tilde}/.. && rm -f data/x`,
    `git -C$HOME/${tilde} init`, `tar -xf a.tar -C"\${HOME}/${tilde}"`);
  for (const agent_type of ['toon-crew:kevin', 'toon-crew:joe-gardner']) for (const c of cases) denied(sh(c, { agent_type }), `${agent_type}: ${c}`);
});
test('a command nested too deep to check is refused for crew roles (fails closed)', () => {
  let c = 'cat /dev/null'; for (let i = 0; i < 9; i++) c = `echo $(${c})`;
  const r = sh(c);
  denied(r, 'nine levels of $(...)');
  assert.match(r.deny, /too complex to check against the plugin data folder/);
});
test('the variable is refused even when CLAUDE_PLUGIN_DATA is not set for the hook', () => {
  for (const c of ['echo x > $CLAUDE_PLUGIN_DATA/events.jsonl', 'touch "${CLAUDE_PLUGIN_DATA}/x"', 'cd $CLAUDE_PLUGIN_DATA && touch x']) {
    for (const data of [undefined, '', 'relative/data']) denied(sh(c, { data }), `${JSON.stringify(data)}: ${c}`);
  }
});
test('plain reads of hand-back files and the data folder still work, for builders and read-only roles', () => {
  for (const [label, D] of [['custom folder', DATA_B], ['plugins/data folder', DATA_A]]) for (const agent_type of CREW) {
    const own = path.join(hbDir(D, 'kevin'), 'r.md');
    for (const c of [`cat ${own}`, `head -n 5 ${own}`, `tail -n 3 ${D}/events.jsonl`, `ls -la ${hbDir(D, 'kevin')}`, `grep -rn Verdict ${path.dirname(hbDir(D, 'kevin'))}`,
      `wc -l ${own}`, `cat ${own} 2>/dev/null`, `ls ${D} | wc -l`, `cat "\${CLAUDE_PLUGIN_DATA}/projects/${KEY}/handbacks/summaries/kevin/r.md"`, 'ls $CLAUDE_PLUGIN_DATA/projects',
      `head ${hbDir(D, 'joe-gardner')}/r.md; tail ${own}`, `grep -l Verdict ${own} > /dev/null`])
      ok(sh(c, { agent_type, data: D }), `${label} ${agent_type}: ${c}`);
  }
  if (underHome) ok(sh(`cat ~/${tilde}/events.jsonl`), 'a read through ~');
});
test('commands that do not name the data folder are untouched', () => {
  for (const c of ['git status', 'node --test tests/hooks/*.test.mjs', `touch ${project}/x.txt`, `mkdir -p ${project}/src/lib`, `echo x > ${DATA_B}-2/events.jsonl`,
    `touch ${DATA_B}-2/x`, 'echo x > /tmp/crew-kevin/out.txt', `cat ${project}/README.md | grep data`, 'grep -rn PLUGIN_DAT plugin/']) ok(sh(c), c);
});
test('Doraemon, the main session and agents that are not crew keep their rules', () => {
  const c = `touch ${DATA_B}/events.jsonl && echo x > $CLAUDE_PLUGIN_DATA/events.jsonl`;
  ok(sh(c, { agent_type: null, agent_id: null }), 'main session');
  ok(sh(c, { agent_type: 'toon-crew:doraemon', agent_id: null }), 'Doraemon as the main thread (claude --agent)');
  ok(sh(c, { agent_type: 'general-purpose' }), 'a subagent that is not crew');
  ok(sh(c, { agent_type: null }), 'agent_id without agent_type');
  ok(sh('CLAUDE_PLUGIN_DATA="${CLAUDE_PLUGIN_DATA}" bash "${CLAUDE_PLUGIN_ROOT}/board/board.sh" handbacks list --limit 5', { agent_type: 'toon-crew:doraemon', agent_id: null }), 'Doraemon runs the handbacks skill');
});
test('CLI end to end: a crew write through the variable exits 2, a plain read of its hand-back exits 0', () => {
  const run = (command) => spawnSync('node', ['--no-warnings', GUARD], { encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: project, CLAUDE_PLUGIN_DATA: DATA_B },
    input: JSON.stringify({ hook_event_name: 'PreToolUse', cwd: project, agent_type: 'toon-crew:kevin', agent_id: 'a1', tool_name: 'Bash', tool_input: { command } }) });
  const refused = run('echo x > $CLAUDE_PLUGIN_DATA/events.jsonl');
  assert.equal(refused.status, 2);
  assert.match(refused.stderr, /may only read the plugin data folder/);
  assert.equal(run(`cat ${path.join(hbDir(DATA_B, 'kevin'), 'r.md')}`).status, 0);
});
