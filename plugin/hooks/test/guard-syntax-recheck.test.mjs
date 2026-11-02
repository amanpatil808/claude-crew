// Ninja's recheck of the wildcard fix (2026-11-02): C1 names the disk folds (long s, ligatures, NFD), H2 dot names
// through zsh spellings, H3 shell pattern syntax outside the wildcard model, H4 whole .git/.claude folders put in place
// by cp -r, mv, rsync, ditto or ln. The guard refuses these instead of modelling more shell syntax.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { evaluate } from '../guard.mjs';

// Outside the system temp dir: read-only roles may write anywhere under it, so a refusal there would prove nothing.
const W = fs.realpathSync(fs.mkdtempSync(path.join(import.meta.dirname, '.work-')));
process.on('exit', () => fs.rmSync(W, { recursive: true, force: true }));
const HOME = path.join(W, 'home');
process.env.HOME = HOME; // os.homedir() reads HOME on every call
const ROOT = path.join(HOME, '.claude/plugins/cache/crew/toon-crew/0.3.14');
const DATA = path.join(HOME, '.claude/plugins/data/toon-crew-crew');
const PROJ = path.join(W, 'proj');
const BARE = path.join(W, 'bare'); // a project with no .git or .claude yet
const put = (p, text = 'x\n') => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); };
for (const f of ['hooks/inline-writes.mjs', 'hooks/guard.mjs']) put(path.join(ROOT, f));
for (const f of ['events.jsonl', 'projects.json']) put(path.join(DATA, f), '[]\n');
for (const f of ['README.md', 'a.txt', 'x.log', 'src/a.ts', '.git/HEAD', '.git/config', '.git/hooks/pre-commit.sample', '.claude/settings.json', '.claude/agents/a.md']) put(path.join(PROJ, f));
fs.mkdirSync(path.join(PROJ, '.git/objects'), { recursive: true });
fs.mkdirSync(BARE, { recursive: true });
put(path.join(HOME, '.git-credentials'));
// Sources an attacker prepares: a repo with a hook, a .claude with settings, a plain folder, a link into the project's .git.
const EVIL = path.join(W, 'evilrepo');
put(path.join(EVIL, '.git/hooks/pre-commit'), '#!/bin/sh\n');
const EVILC = path.join(W, 'evilclaude');
put(path.join(EVILC, '.claude/settings.json'), '{}\n');
const CFG = path.join(W, 'cfg'); fs.mkdirSync(CFG);
const PLAIN = path.join(W, 'plain'); put(path.join(PLAIN, 'notes.txt'));
const LNK = path.join(W, 'lnk'); fs.mkdirSync(LNK); fs.symlinkSync(path.join(PROJ, '.git'), path.join(LNK, 'l'));
const DATA_B = path.join(W, 'data-b'); put(path.join(DATA_B, 'events.jsonl'), '{}\n');
// A custom data folder in a parent of its own (W itself holds the plugin, which has its own rule), and a fake to copy over it.
const DPAR = path.join(W, 'dpar'); const DATA_C = path.join(DPAR, 'data-c'); put(path.join(DATA_C, 'events.jsonl'), '{}\n');
put(path.join(W, 'evil-data/data-c/events.jsonl'), '{}\n');
const REPO2 = path.join(W, 'repo2'); put(path.join(REPO2, '.git/config'));
const DATA_S = path.join(W, 'crew-data-s'); put(path.join(DATA_S, 'events.jsonl'), '{}\n');
const LNK2 = path.join(W, 'lnk2'); fs.mkdirSync(LNK2); fs.symlinkSync(PROJ, path.join(LNK2, 'p')); // a link to the project itself
// A .claude that is a link (to an empty folder) at the top, and one a level down.
fs.symlinkSync(CFG, path.join(W, 'lnkc'));
const EVL2 = path.join(W, 'evl2'); fs.mkdirSync(EVL2); fs.symlinkSync(CFG, path.join(EVL2, '.claude'));
const EMPTYC = path.join(W, 'emptyc'); fs.mkdirSync(path.join(EMPTYC, '.claude'), { recursive: true });

const S = 'ſ'; // LATIN SMALL LETTER LONG S: APFS folds it to "s"
const ENV = { CLAUDE_PLUGIN_ROOT: ROOT, CLAUDE_PLUGIN_DATA: DATA, CLAUDE_PROJECT_DIR: PROJ };
const call = (tool, tool_input, { agent = 'toon-crew:kevin', cwd = PROJ, env = ENV } = {}) =>
  evaluate({ cwd, tool_name: tool, tool_input, ...(agent ? { agent_id: 'a1', agent_type: agent } : {}) }, env);
const run = (command, opts) => call('Bash', { command }, opts);
const verdict = (r) => (r?.deny ? 'deny' : r?.ask ? 'ask' : r === null || r === undefined ? 'allow' : `odd ${JSON.stringify(r)}`);
// Every case is checked and the wrong ones listed together, so a run on old code shows each rule that fails.
const expectAll = (rows) => {
  const wrong = rows.filter(([, r, want]) => verdict(r) !== want).map(([what, r, want]) => `${what}: want ${want}, got ${verdict(r)}`);
  assert.deepEqual(wrong, []);
};
const AGENTS = ['toon-crew:kevin', ''];

test('C1: a long s, a ligature or another fold of a protected name is refused, for Bash, Write and Edit', () => {
  const rows = [];
  for (const agent of AGENTS) {
    const who = agent || 'main';
    rows.push([`${who} cp to .claude/${S}ettings.json`, run(`cp ${PLAIN}/notes.txt .claude/${S}ettings.json`, { agent }), 'deny']);
    rows.push([`${who} redirect to .git/hook${S}/pre-commit`, run(`echo x > .git/hook${S}/pre-commit`, { agent }), 'deny']);
    rows.push([`${who} redirect to the plugin through plugin${S}`, run(`echo x > ~/.claude/plugin${S}/cache/crew/toon-crew/0.3.14/hooks/inline-writes.mjs`, { agent }), 'deny']);
    rows.push([`${who} append to the data folder through plugin${S}`, run(`echo x >> ~/.claude/plugin${S}/data/toon-crew-crew/events.jsonl`, { agent }), 'deny']);
    rows.push([`${who} Write the plugin through plugin${S}`, call('Write', { file_path: path.join(HOME, `.claude/plugin${S}/cache/crew/toon-crew/0.3.14/hooks/inline-writes.mjs`), content: 'x' }, { agent }), 'deny']);
    rows.push([`${who} Write .claude/${S}ettings.local.json`, call('Write', { file_path: path.join(PROJ, `.claude/${S}ettings.local.json`), content: '{}' }, { agent }), 'deny']);
    rows.push([`${who} Write .git/hook${S}/pre-commit`, call('Write', { file_path: path.join(PROJ, `.git/hook${S}/pre-commit`), content: '#!/bin/sh' }, { agent }), 'deny']);
    rows.push([`${who} Edit .claude/${S}ettings.json`, call('Edit', { file_path: path.join(PROJ, `.claude/${S}ettings.json`), old_string: '{}', new_string: '{"a":1}' }, { agent }), 'deny']);
    // U+FB01 (fi ligature): APFS folds it to "fi", so .git/conﬁg is .git/config.
    rows.push([`${who} Write .git/conﬁg`, call('Write', { file_path: path.join(PROJ, '.git/conﬁg'), content: '[core]' }, { agent }), 'deny']);
    // U+212A (Kelvin) was already caught by toLowerCase: a control.
    rows.push([`${who} Write .git/hooKs/pre-commit`, call('Write', { file_path: path.join(PROJ, '.git/hooKs/pre-commit'), content: 'x' }, { agent }), 'deny']);
  }
  // A crew role's Write into its own hand-back folder through a folded name is not its hand-back.
  rows.push(['kevin hand-back through plugin' + S, call('Write', { file_path: path.join(HOME, `.claude/plugin${S}/data/toon-crew-crew/projects/x/handbacks/full/kevin/r.md`), content: 'ok' }), 'deny']);
  // A custom data folder outside ~/.claude/plugins, named through a long s: only the data-folder rules guard it.
  const envS = { ...ENV, CLAUDE_PLUGIN_DATA: DATA_S };
  rows.push(['kevin append to a custom data folder through ' + S, run(`echo x >> ${W}/crew-data-${S}/events.jsonl`, { env: envS }), 'deny']);
  rows.push(['kevin Write a custom data folder file through ' + S, call('Write', { file_path: path.join(W, `crew-data-${S}/events.jsonl`), content: 'x' }, { env: envS }), 'deny']);
  // Credentials and inline code: the same fold.
  rows.push(['Read ~/.git-credential' + S, call('Read', { file_path: path.join(HOME, `.git-credential${S}`) }), 'deny']);
  rows.push(['cat ~/.git-credential' + S, run(`cat ~/.git-credential${S}`), 'deny']);
  rows.push(['inline code opening .claude/' + S + 'ettings.json', run(`python3 -c "open('.claude/${S}ettings.json','w').write('{}')"`), 'deny']);
  expectAll(rows);
});

test('C1: a plugin root with a non-ASCII name is matched in NFC and NFD alike', () => {
  const inline = path.join(W, 'plügin'); // NFC on disk
  put(path.join(inline, 'hooks/guard.mjs'));
  const env = { ...ENV, CLAUDE_PLUGIN_ROOT: inline };
  const nfd = path.join(W, 'plügin', 'hooks/guard.mjs');
  expectAll([
    ['subagent Write through the NFD spelling', call('Write', { file_path: nfd, content: 'x' }, { env }), 'deny'],
    ['subagent redirect through the NFD spelling', run(`echo x > ${nfd}`, { env }), 'deny'],
    ['main session Write through the NFD spelling asks', call('Write', { file_path: nfd, content: 'x' }, { env, agent: '' }), 'ask'],
  ]);
});

test('C1: "ss" in a root is matched through U+00DF and U+1E9E, which APFS folds to "ss"', () => {
  const inline = path.join(W, 'cross-plugin');
  put(path.join(inline, 'hooks/guard.mjs'));
  const env = { ...ENV, CLAUDE_PLUGIN_ROOT: inline };
  expectAll(['croß-plugin', 'croẞ-plugin', 'CROẞ-PLUGIN'].map((dir) =>
    [`subagent Write through ${dir}`, call('Write', { file_path: path.join(W, dir, 'hooks/guard.mjs'), content: 'x' }, { env }), 'deny']));
});

test('C1: folding only refuses more; plain files with non-ASCII names stay writable', () => {
  expectAll([
    ['Write docs/café.md', call('Write', { file_path: path.join(PROJ, 'docs/café.md'), content: 'x' }), 'allow'],
    ['echo to notes-ü.txt', run('echo x > notes-ü.txt'), 'allow'],
  ]);
});

test('H2: zsh qualifiers and every dot-glob switch make a wildcard match .git', () => {
  const rows = [];
  for (const agent of AGENTS) {
    const who = agent || 'main';
    for (const command of [`cp ${PLAIN}/notes.txt */config(D)`, 'echo x > */config(D)', 'echo x | tee **/config(D)', `set -4; cp ${PLAIN}/notes.txt */config`,
      `setopt g_lob_dots; cp ${PLAIN}/notes.txt */config`, `set -o GLOB_DOTS; cp ${PLAIN}/notes.txt */config`, `unsetopt no_glob_dots; cp ${PLAIN}/notes.txt */config`,
      `emulate -L zsh -o globdots; cp ${PLAIN}/notes.txt */config`, `setopt $(printf glob)dots; cp ${PLAIN}/notes.txt */config`,
      `setopt G''LOB''DOTS; cp ${PLAIN}/notes.txt */config`, `set -o $OPT; cp ${PLAIN}/notes.txt */config`,
      // Each of these is seen by one check only: quotes in an assignment (raw text), $'..' decoding (the words), a -c string, a shell flag.
      `GLOB''IGNORE=x; cp ${PLAIN}/notes.txt */config`, `export $'GLOB\\x49GNORE=x'; cp ${PLAIN}/notes.txt */config`,
      `bash -c 'set -4; cp ${PLAIN}/notes.txt */config'`, `zsh -4 -c 'cp ${PLAIN}/notes.txt */config'`, `source ./opts.sh; cp ${PLAIN}/notes.txt */config`,
    ]) rows.push([`${who}: ${command}`, run(command, { agent }), 'deny']);
  }
  // Common set flags leave dot names alone.
  rows.push(['set -euo pipefail then a plain wildcard', run('set -euo pipefail; cp a.txt ./*'), 'allow']);
  rows.push(['set -e then rm -f *.log', run('set -e; rm -f *.log'), 'allow']);
  expectAll(rows);
});

test('H3: pattern syntax in a write target is refused at, above or inside a protected root', () => {
  const rows = [];
  for (const agent of AGENTS) {
    const who = agent || 'main';
    for (const command of [`cp ${PLAIN}/notes.txt .[[:alpha:]]it/config`, 'echo x > .[[:alpha:]]it/hooks/pre-commit', `cp ${PLAIN}/notes.txt (.git|zz)/config`,
      `setopt kshglob\ncp ${PLAIN}/notes.txt @(.git)/config`, `shopt -s extglob\ncp ${PLAIN}/notes.txt @(.git)/config`, 'echo x > {zz,.git}/config',
      `setopt extendedglob; cp ${PLAIN}/notes.txt .gi#t/config`, `setopt extendedglob; cp ${PLAIN}/notes.txt ^zz/config`,
      `cp ${PLAIN}/notes.txt ${LNK}/***/config`, `echo x > ${PLAIN}/{x}/../../proj/.git/config`, 'echo x > $OUT/(a|b)',
      `echo x > ~/.claude/(plugins)/cache/crew/toon-crew/0.3.14/hooks/guard.mjs`]) rows.push([`${who}: ${command}`, run(command, { agent }), 'deny']);
  }
  // A root that is not on disk yet is still refused (nothing below the pattern to walk).
  const bare = { cwd: BARE, env: { ...ENV, CLAUDE_PROJECT_DIR: BARE } };
  rows.push(['bare project: (.claude|zz)/settings.json', run('echo x > (.claude|zz)/settings.json', bare), 'deny']);
  // Pattern text then .. leads to an inline plugin root that only the root list knows.
  const inline = path.join(W, 'inline-plugin'); put(path.join(inline, 'hooks/guard.mjs'));
  rows.push(['{x}/../.. into an inline plugin', run(`echo x > ${PLAIN}/{x}/../../inline-plugin/hooks/guard.mjs`, { env: { ...ENV, CLAUDE_PLUGIN_ROOT: inline } }), 'deny']);
  // The plain rules on the text, and on every path below the pattern.
  rows.push(['(a|b)/.mcp.json in a plain folder', run(`echo x > ${PLAIN}/(a|b)/.mcp.json`), 'deny']);
  rows.push(['(.git|zz)/config in another repo', run(`echo x > ${REPO2}/(.git|zz)/config`), 'deny']);
  // Braces in a redirect: zsh expands them (MULTIOS), so a second path can hide in one.
  rows.push(['brace pair hiding .git/config', run(`echo x > {${PLAIN}/a,${PROJ}/.git/config}`, { cwd: PLAIN }), 'deny']);
  // bash 3.2 has no globstar and reads ** as *: lnk/**/config writes through the link lnk/l.
  rows.push(['** through a link (bash 3.2)', run(`cp a.txt ${LNK}/**/config`), 'deny']);
  rows.push(['** through a link, bash -c', run(`bash -c 'echo x > ${LNK}/**/config'`), 'deny']);
  // A link below the pattern leads anywhere (here to the project root, which no rule names by itself).
  rows.push(['***/ through a link to the project', run(`cp a.txt ${LNK2}/***/(.git|zz)/config`), 'deny']);
  // Away from every protected root, and with no link below the pattern, the shell can only reach plain files.
  rows.push(['(a|b).txt in a plain folder', run(`cp a.txt ${PLAIN}/(a|b).txt`), 'allow']);
  rows.push(['a brace left in a plain folder', run(`echo x > ${PLAIN}/out{1}.txt`), 'allow']);
  expectAll(rows);
});

test('H3: a ( after a word stays in the word, and its body is still checked as commands', () => {
  expectAll([
    ['a push inside a group', run('ls (git push origin main)'), 'deny'],
    ['a subshell after if', run('if (git push origin main); then echo ok; fi'), 'deny'],
    ['a subshell after &&', run('true && (rm -rf /)'), 'deny'],
    ['a plain subshell', run('(cd src && ls)'), 'allow'],
    ['an array', run('arr=(a b c); echo ok'), 'allow'],
  ]);
});

test('H3: the data folder from a crew shell, named through pattern syntax', () => {
  const env = { ...ENV, CLAUDE_PLUGIN_DATA: DATA_B };
  expectAll([
    ['copy out through (data-b|zz)', run(`cp ${W}/(data-b|zz)/events.jsonl /tmp/copy.jsonl`, { env }), 'deny'],
    ['plain read through (data-b)', run(`cat ${W}/(data-b)/events.jsonl`, { env }), 'allow'],
  ]);
});

test('H4: a .git or .claude folder copied, moved, synced or linked into place is refused', () => {
  const rows = [];
  for (const agent of AGENTS) {
    const who = agent || 'main';
    for (const command of [`cp -r ${EVIL}/.git ${PROJ}/`, `cp -R ${EVIL}/. ${PROJ}/`, `rsync -a ${EVIL}/ ${PROJ}/`, `mv .git /tmp/zz-old && mv ${EVIL}/.git .git`,
      'mv .git /tmp/zz-old', 'mv .git .git-old', 'mv .claude claude-old', `mv ${EVIL}/.git .git`, `ditto ${EVIL} ${PROJ}`, `cp -r ${EVIL}/.gi? ${PROJ}/`, `cp -r "$SRC" ${PROJ}/`, `cp -r ${EVIL}/.git $DEST/`])
      rows.push([`${who}: ${command}`, run(command, { agent }), 'deny']);
    // A project with no .claude or .git yet: the folder put there becomes one.
    const bare = { agent, cwd: BARE, env: { ...ENV, CLAUDE_PROJECT_DIR: BARE } };
    for (const command of [`cp -r ${EVILC}/.claude ${BARE}/`, `rsync -a ${EVILC}/ ${BARE}/`, `ln -s ${CFG} ${BARE}/.claude`, `ln -s ${EVIL}/.git ${BARE}/`,
      `cp -r ${EVILC}/.claude ${BARE}/.claude`, // a destination not taken yet becomes the copy
      `mv ${W}/lnkc ${BARE}/.claude`, `cp -R ${EVL2}/. ${BARE}/`, // a link (to an empty folder) can be filled after the check
      `ln -s ${EMPTYC}/.claude ${BARE}/`, // a link above a root, whatever it holds now
      `cp -r ${EVILC}/.claude ${W}/ba?e/`]) // a wildcard destination, expanded
      rows.push([`${who} (bare project): ${command}`, run(command, bare), 'deny']);
    rows.push([`${who}: Write a gitfile at .git`, call('Write', { file_path: path.join(BARE, '.git'), content: 'gitdir: /tmp/x\n' }, bare), 'deny']);
  }
  // A crew role copying a fake data folder over the real one (a custom data folder outside ~/.claude/plugins).
  const envC = { env: { ...ENV, CLAUDE_PLUGIN_DATA: DATA_C } };
  rows.push(['kevin: cp -r over a custom data folder', run(`cp -r ${W}/evil-data/data-c ${DPAR}/`, envC), 'deny']);
  rows.push(['kevin: contents copy that holds a custom data folder', run(`cp -R ${W}/evil-data/. ${DPAR}/`, envC), 'deny']);
  expectAll(rows);
});

test('H4: everyday copies, moves and links are unchanged', () => {
  const rows = [];
  for (const command of ['cp -r src dist/', `cp -r ${PLAIN} ${PROJ}/`, 'rsync -a src/ build/', 'mv a.txt b.txt', 'ln -s /tmp/x .', 'cp a.txt .', 'cp a.txt b.txt',
    'cp "$f" out/', 'mv *.md docs/', 'cp src/*.ts /tmp/', 'cp src/*.ts .', `cp -R ${PLAIN}/. ${BARE}/`]) rows.push([command, run(command), 'allow']);
  expectAll(rows);
});

test('everyday commands from the brief still pass', () => {
  const rows = [];
  for (const agent of [...AGENTS, 'toon-crew:joe-gardner']) {
    for (const c of ['npm test', 'git status', 'git diff', 'git log --oneline -5', 'ls *.md', 'cat src/*.ts']) rows.push([`${agent || 'main'}: ${c}`, run(c, { agent }), 'allow']);
  }
  for (const agent of AGENTS) {
    for (const c of ['rm -f *.log', 'cp a.txt b.txt', 'mkdir -p build/{a,b}']) rows.push([`${agent || 'main'}: ${c}`, run(c, { agent }), 'allow']);
  }
  expectAll(rows);
});
