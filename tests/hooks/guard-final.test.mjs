// Ninja's final guard check (2026-11-02): N1 the long s and other folds written as $'..' byte escapes, N2 dot-name
// matching switched on through names built at run time, N3 archives and file lists unpacked at or above a protected root.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { evaluate, tokenize } from '../../plugin/hooks/guard.mjs';

// Outside the system temp dir: read-only roles may write anywhere under it, so a refusal there would prove nothing.
const W = fs.realpathSync(fs.mkdtempSync(path.join(import.meta.dirname, '.work-')));
process.on('exit', () => fs.rmSync(W, { recursive: true, force: true }));
const HOME = path.join(W, 'home');
process.env.HOME = HOME; // os.homedir() reads HOME on every call
const ROOT = path.join(HOME, '.claude/plugins/cache/crew/toon-crew/0.3.14');
const DATA = path.join(HOME, '.claude/plugins/data/toon-crew-crew');
const PROJ = path.join(W, 'proj');
const PLAIN = path.join(W, 'plain');
const put = (p, text = 'x\n') => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); };
for (const f of ['hooks/inline-writes.mjs', 'hooks/guard.mjs']) put(path.join(ROOT, f));
put(path.join(HOME, '.claude/settings.json'), '{}\n');
put(path.join(DATA, 'events.jsonl'), '[]\n');
for (const f of ['README.md', 'a.txt', 'x.log', 'src/a.ts', 'build/keep', '.git/HEAD', '.git/config', '.git/hooks/pre-commit.sample', '.claude/settings.json']) put(path.join(PROJ, f));
put(path.join(PLAIN, 'notes.txt'));

const ENV = { CLAUDE_PLUGIN_ROOT: ROOT, CLAUDE_PLUGIN_DATA: DATA, CLAUDE_PROJECT_DIR: PROJ };
const run = (command, { agent = 'toon-crew:kevin', cwd = PROJ } = {}) =>
  evaluate({ cwd, tool_name: 'Bash', tool_input: { command }, ...(agent ? { agent_id: 'a1', agent_type: agent } : {}) }, ENV);
const verdict = (r) => (r?.deny ? 'deny' : r?.ask ? 'ask' : r === null || r === undefined ? 'allow' : `odd ${JSON.stringify(r)}`);
// Every case is checked and the wrong ones listed together, so a run on old code shows each rule that fails.
const expectAll = (rows) => {
  const wrong = rows.filter(([, r, want]) => verdict(r) !== want).map(([what, r, want]) => `${what}: want ${want}, got ${verdict(r)}`);
  assert.deepEqual(wrong, []);
};
const AGENTS = ['toon-crew:kevin', ''];
const both = (cases, want) => AGENTS.flatMap((agent) => cases.map((c) => [`${agent || 'main'}: ${c}`, run(c, { agent }), want]));

test('N1: $\'..\' escapes decode as UTF-8 bytes, so a folded protected name is seen', () => {
  const word = (src) => tokenize(src).commands[0].words[1];
  assert.equal(word("echo $'\\xc5\\xbf'"), 'ſ', 'hex bytes C5 BF are the long s');
  assert.equal(word("echo $'\\305\\277'"), 'ſ', 'octal bytes');
  assert.equal(word("echo $'\\U17f'"), 'ſ', '\\U with up to 8 hex digits');
  assert.equal(word("echo $'\\U0001F600'"), '\u{1F600}', '\\U beyond the BMP');
  assert.equal(word("echo $'a\\tb\\x41\\cA'"), 'a\tbA\x01', 'plain escapes keep working');
});

test('N1: byte-escaped folds of protected names are refused for kevin and the main session', () => {
  const S = "$'\\xc5\\xbf'"; // UTF-8 long s
  expectAll(both([
    `cp /tmp/x ${HOME}/.claude/plugin${S}/cache/crew/toon-crew/0.3.14/hooks/inline-writes.mjs`,
    `cp /tmp/x ${HOME}/.claude/${S}ettings.json`,
    `cp /tmp/x .claude/${S}ettings.json`,
    `echo x > .git/hook${S}/pre-commit`,
    "cp /tmp/x .git/con$'\\xef\\xac\\x81'g", // fi ligature as bytes
    "cp /tmp/x .claude/$'\\305\\277'ettings.json",
    "cp /tmp/x .claude/$'\\U17f'ettings.json",
    `echo x > ${DATA}/event${S}.jsonl`,
  ], 'deny'));
  expectAll(both(["echo hi > $'out\\x2etxt'", "printf $'a\\tb\\n' > out.txt", "echo $'caf\\xc3\\xa9' > notes.txt"], 'allow'));
});

test('N2: a leading wildcard is assumed to match dot names, however dot-glob was switched on', () => {
  expectAll(both([
    'n=GLOBIG; declare "${n}NORE=zz"; cp /tmp/x */config',
    'n=GLOBIG; export ${n}NORE=zz; cp /tmp/x */config',
    'n=GLOBIG; printf -v ${n}NORE zz; cp /tmp/x */config',
    'k=gl; options[${k}obdots]=on; cp /tmp/x */config',
    'cp /tmp/x */config',
    'echo x > ./*/hooks/pre-commit',
  ], 'deny'));
  expectAll(both(['ls *.md', 'cat src/*.ts', 'rm -f *.log', 'cp src/*.ts build/', 'echo x > out-*.txt'], 'allow'));
});

test('N3: unpacking or a file-list copy at or above a protected root is refused for kevin and the main session', () => {
  expectAll(both([
    'tar -xf /tmp/w/evil.tar',
    'tar xzf /tmp/w/evil.tgz',
    'tar -cf - -C /tmp/w/evilrepo . | tar -xf -',
    'tar -xf /tmp/w/evil.tar -C build -C .',
    'bsdtar -xf /tmp/w/evil.tar',
    'unzip -oq /tmp/w/evil.zip',
    'ditto -x -k /tmp/w/evil.zip .',
    'pax -r -f /tmp/w/evil.tar',
    'pax -rw -s ,x,y, /tmp/w/evilrepo .',
    'cpio -i < /tmp/w/evil.cpio',
    'rsync -a --files-from=/tmp/w/list.txt /tmp/w/evilrepo .',
    'rsync -aR /tmp/w/evilrepo/./.git/hooks/pre-commit .',
    '7z x /tmp/w/evil.7z',
    `tar -xf /tmp/w/set.tar -C ${HOME}/.claude`,
    `cd ${PLAIN} && tar -xf /tmp/w/evil.tar -C ${PROJ}`,
    'tar -xf /tmp/w/evil.tar -C $DEST',
  ], 'deny'));
  expectAll(both([
    'tar -xzf x.tgz -C build',
    'tar -xf x.tar --directory=build/sub',
    'unzip -q x.zip -d build',
    `cd ${PLAIN} && tar -xf /tmp/w/x.tar`,
    `tar -xf x.tar -C ${os.tmpdir()}`,
    'tar -czf out.tgz src',
    'tar -tf x.tar',
    'unzip -l x.zip',
    'rsync -a src/ build/',
    'cp a.txt b.txt',
    'mkdir -p build/{a,b}',
    'echo hi > out.txt',
    'npm test',
    'git status',
    'git log --oneline -3',
  ], 'allow'));
});
