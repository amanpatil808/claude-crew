// toon-crew safety guard: a PreToolUse hook. Dependency-free (Node built-ins only).
// Reads the hook JSON on stdin. Hard blocks: one-line reason on stderr, exit 2 ("deny").
// Pushes to main/master, and merges by the DevOps Team, are "ask": exit 0 with hookSpecificOutput.permissionDecision "ask",
// so Claude Code shows the owner its own approval prompt. Otherwise exit 0 allows.
//
// This is a text guard: a seatbelt against mistakes and lazy bypasses, NOT a sandbox. The real boundary
// is each agent's tool list. When the guard cannot parse something that touches git/gh/rm/docker/settings
// it fails closed (deny) rather than open; unreadable input or an internal error also denies (exit 2).
// For roles that have Bash, the Claude Code sandbox is the real boundary: a script written to temp and then
// run (bash /tmp/w.sh) does what it likes, and no text check can see inside it.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { INDIRECT, inlineWriteSites, SPAWNS_OR_EVALS } from './inline-writes.mjs';

const PROTECTED = new Set(['main', 'master']);
const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh']);
const DOCKERS = new Set(['docker', 'docker-compose', 'podman', 'podman-compose']);
const INTERPRETERS = /^(python[\d.]*|node(js)?|bun|deno|perl|ruby|php|osascript|lua|rscript|pwsh|powershell)$/i;
const MAX_COMMAND = 100_000;
const BUDGET_MS = 6000; // well under the 10 s hook timeout
// Roles without write tools by design: they may only write their own memory file and temp files.
const ROLE_GIT_BLOCKED = new Set(['reset', 'checkout', 'switch', 'restore', 'apply', 'am', 'clean', 'commit', 'merge', 'rebase', 'cherry-pick', 'revert', 'pull', 'rm', 'mv', 'add',
  'update-ref', 'read-tree', 'checkout-index', 'update-index', 'filter-branch', 'replace']);
// Where a read-only role may Write its deliverables inside the project (besides its memory file and temp).
const ROLE_DOC_DIRS = { dekisugi: ['docs/research'], olaf: ['docs/research'], nobita: ['docs/research'] };
// What a read-only role may Edit as well as Write: styles and visual assets in its own checkout (its worktree, or the project).
// No JS/TS/HTML, tests, config or hooks: the extension list is the allow-list, and `tokens.*` / `theme.*` count only as data files.
const ROLE_STYLE_FILES = { nobita: { dirs: ['docs/design'], files: /\.(css|scss|sass|less|svg|png|jpe?g|gif|webp|avif|ico)$|(^|\/)(tokens|theme)\.(json|ya?ml)$/i } };
// Never inside dot folders (.claude, .github, .git), dependencies or test folders (visual baselines), whatever the file type.
const STYLE_DENY_PART = /^(\..*|node_modules|tests?|__tests__|specs?|e2e|fixtures|__snapshots__)$/i;
const READ_ONLY_ROLES = /^(?:toon-crew:)?(ninja-hattori|joe-gardner|twenty-two|nobita|dekisugi|olaf|stuart)$/i;
const CREW_REPO = 'amanpatil808/claude-crew';
// Who may start which agents. A role that spawns a builder gets edits the guard refuses for the role itself.
const CREW = new Set(['bob', 'dekisugi', 'doraemon', 'joe-gardner', 'kevin', 'miguel-rivera', 'mike-wazowski', 'ninja-hattori', 'nobita', 'olaf', 'shinchan', 'shizuka', 'stuart', 'sulley', 'twenty-two']);
const SPAWN_LIMITS = { dekisugi: new Set(['olaf', 'stuart']) };
// Tools that hand work to another session or a later run: crew roles other than Doraemon never use them.
const RELAY_TOOLS = new Set(['SendMessage', 'CronCreate', 'Workflow', 'RemoteTrigger']);

// Words that can sit in front of the real program: name -> options that take a value.
const WRAPPERS = {
  env: new Set(['-u', '-C', '--unset', '--chdir']),
  command: new Set(), builtin: new Set(), exec: new Set(['-a']), nohup: new Set(), time: new Set(['-f', '-o']),
  nice: new Set(['-n']), ionice: new Set(['-c', '-n']), stdbuf: new Set(['-i', '-o', '-e']), setsid: new Set(),
  caffeinate: new Set(['-t']), sudo: new Set(['-u', '-g', '-h', '-p', '-C', '-D', '-R', '-T']), doas: new Set(['-u', '-C']),
  xargs: new Set(['-I', '-n', '-P', '-L', '-s', '-d', '-E', '-a']), timeout: new Set(['-s', '-k']),
};
// Programs that run a command given as a string or as their trailing words (watch, tmux, su -c, ssh host cmd, ...).
const LAUNCHERS = new Set(['script', 'watch', 'unbuffer', 'flock', 'tmux', 'screen', 'su', 'runuser', 'ssh', 'parallel']);
const CHECKED_PROG = (name) => /^(git|gh|curl|wget|http|https|xh|xhs|rm|find|eval|alias|rsync|mv|ln|security)$/.test(name) || /^git-credential-/.test(name)
  || DOCKERS.has(name) || SHELLS.has(name) || INTERPRETERS.test(name) || !!WRAPPERS[name] || LAUNCHERS.has(name);
// Variables that point gh elsewhere, or that name a program git/gh will run later.
function checkAssigns(pairs, ctx, depth) {
  for (const [n, v] of pairs) {
    if (/^(GH_CONFIG_DIR|GH_HOST)$/.test(n)) return `${n} is blocked: it points gh at another config or host, with aliases and tokens the guard cannot see.`;
    if (/(PAGER|EDITOR|BROWSER|VISUAL|ASKPASS|SSH_COMMAND|EXTERNAL_DIFF)$/.test(n) && v && checkCommands(v, ctx, depth + 1)) return `${n} names a command the guard would stop or ask about: blocked.`;
  }
  return null;
}
const LEADING_KEYWORDS = new Set(['!', 'if', 'then', 'else', 'elif', 'do', 'while', 'until', '{', '}', 'fi', 'done']);
const RISKY_MENTION = /\b(git|gh|rm|docker|podman|find|rsync|curl|wget|dd|mv|ln|shred|unlink)\b|\.claude|\.mcp|agent-memory|\.git\//;

const PUSH_ASK = 'Pushing to main/master deploys to production: confirm.';
const MERGE_ASK = 'Merging deploys to production: confirm.';
// Owner rule: only the DevOps Team merges, and the owner confirms each merge; every other caller, the main thread
// and Doraemon included, is refused. The owner's own `!` shell commands do not go through hooks.
// Prefixed, exact names only: a bare "sulley" could be a project agent of the same name with other tools.
const DEVOPS = /^toon-crew:(mike-wazowski|sulley)$/;
const MERGE_DENY = "Only the DevOps Team (Mike Wazowski, Sulley) may merge pull requests, with the owner's approval.";
const PUSH_DENY = "Only the DevOps Team (Mike Wazowski, Sulley) may push to main/master, with the owner's approval.";
const AUTO_MERGE_DENY = 'Auto-merge is blocked for every role: merge once the checks are green.';
// The ask text names the PR and repo only when they are plain ids, so a crafted value cannot reword the owner's prompt.
const mergeAsk = ({ pr, repo } = {}) => {
  const p = /^\d{1,9}$/.test(pr ?? '') ? `PR #${pr}` : null; const r = /^[\w.-]{1,100}\/[\w.-]{1,100}$/.test(repo ?? '') ? repo : null;
  return p ? `Merging ${p}${r ? ` in ${r}` : ''} deploys to production: confirm.` : MERGE_ASK;
};
const mergeGate = (ctx, info) => (ctx.devops ? ask(mergeAsk(info)) : MERGE_DENY);
const pushGate = (ctx) => (ctx.devops ? ask(PUSH_ASK) : PUSH_DENY);
const devopsGate = (ctx, what) => (ctx.devops ? ask(`${what} can reach production: confirm.`) : `Only the DevOps Team (Mike Wazowski, Sulley) may use ${what}, with the owner's approval.`);
// gh credentials: the hosts file (token when not in the keychain), git's credential store. No role reads them.
const CRED_PATH = /\/\.config\/gh(\/|$)|\/\.git-credentials$|\/\.config\/git\/credentials$/;
const CRED_TEXT = /\.config\/gh(?![\w.-])|\bgh\/hosts\.ya?ml\b|\.git-credentials\b|\.config\/git\/credentials\b|XDG_CONFIG_HOME\}?\/gh(?![\w.-])/;
const ask = (reason) => ({ ask: reason });

// ---------- shell tokenizer ----------
// Returns { commands: [{words, redirects, depth}], nested: string[], heredocs: string[] }.
// Quotes are removed; separators split commands; ( ) change depth; $(...) and `...` bodies go to `nested`;
// ${IFS}, $'..' and {a,b} are expanded the way a shell would; here-doc / here-string bodies are returned
// separately; redirect targets are collected per command.
function braceExpand(w, budget = { n: 64 }) {
  const open = w.indexOf('{');
  if (open === -1 || budget.n <= 0) return [w];
  let depth = 0; let close = -1; const commas = [];
  for (let j = open; j < w.length; j++) {
    if (w[j] === '{') depth++;
    else if (w[j] === '}') { depth--; if (depth === 0) { close = j; break; } } else if (w[j] === ',' && depth === 1) commas.push(j);
  }
  if (close === -1 || commas.length === 0) return [w];
  const parts = []; let from = open + 1;
  for (const c of [...commas, close]) { parts.push(w.slice(from, c)); from = c + 1; }
  const pre = w.slice(0, open); const post = w.slice(close + 1);
  const out = [];
  for (const p of parts) { budget.n--; out.push(...braceExpand(pre + p + post, budget)); }
  return out;
}

function ansiC(body) {
  return body.replace(/\\(x[0-9a-fA-F]{1,2}|[0-7]{1,3}|u[0-9a-fA-F]{1,4}|.)/g, (_, e) => {
    if (e[0] === 'x') return String.fromCharCode(parseInt(e.slice(1), 16));
    if (e[0] === 'u') return String.fromCharCode(parseInt(e.slice(1), 16));
    if (/^[0-7]+$/.test(e)) return String.fromCharCode(parseInt(e, 8));
    return { n: '\n', t: '\t', r: '\r', a: '\x07', b: '\b', e: '\x1b', f: '\f', v: '\v' }[e] ?? e;
  });
}

export function tokenize(src) {
  const commands = []; const nested = []; const heredocs = [];
  let words = []; let redirects = []; let cur = ''; let inWord = false; let depth = 0;
  let nextIs = null; // 'redirect' | 'herestring' | 'heredoc'
  const pendingHeredocs = [];
  const endWord = () => {
    if (!inWord) return;
    if (nextIs === 'redirect') redirects.push(cur);
    else if (nextIs === 'herestring') heredocs.push(cur);
    else if (nextIs === 'heredoc') pendingHeredocs.push(cur);
    else words.push(...braceExpand(cur));
    nextIs = null; cur = ''; inWord = false;
  };
  const endCmd = () => { endWord(); if (words.length || redirects.length) commands.push({ words, redirects, depth }); words = []; redirects = []; nextIs = null; };
  const grab = (from, open, close) => {
    let d = 1; let j = from;
    for (; j < src.length && d > 0; j++) {
      if (src[j] === '\\') { j++; continue; }
      if (src[j] === open) d++; else if (src[j] === close) d--;
    }
    return { body: src.slice(from, d === 0 ? j - 1 : j), next: j };
  };
  const backtick = (i) => { const e = src.indexOf('`', i + 1); const stop = e === -1 ? src.length : e; nested.push(src.slice(i + 1, stop)); return stop + 1; };
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '\\') {
      if (src[i + 1] === '\n') { i += 2; continue; }
      cur += src[i + 1] ?? ''; inWord = true; i += 2; continue;
    }
    if (c === "'") {
      const end = src.indexOf("'", i + 1); const stop = end === -1 ? src.length : end;
      cur += src.slice(i + 1, stop); inWord = true; i = stop + 1; continue;
    }
    if (c === '$' && src[i + 1] === "'") {
      let j = i + 2; while (j < src.length && src[j] !== "'") j += src[j] === '\\' ? 2 : 1;
      cur += ansiC(src.slice(i + 2, j)); inWord = true; i = j + 1; continue;
    }
    if (c === '$') {
      const m = /^\$(?:\{IFS[^}]*\}|IFS(?![A-Za-z0-9_]))/.exec(src.slice(i, i + 40));
      if (m) { endWord(); i += m[0].length; continue; }
      if (src[i + 1] === '"') { i++; continue; } // $"..." locale string
    }
    if (c === '"') {
      i++; inWord = true;
      while (i < src.length && src[i] !== '"') {
        if (src[i] === '\\' && i + 1 < src.length) { cur += src[i + 1]; i += 2; continue; }
        if (src[i] === '$' && src[i + 1] === '(') { const g = grab(i + 2, '(', ')'); nested.push(g.body); cur += src.slice(i, g.next); i = g.next; continue; }
        if (src[i] === '`') { const n = backtick(i); cur += src.slice(i, n); i = n; continue; }
        cur += src[i++];
      }
      i++; continue;
    }
    if (c === '$' && src[i + 1] === '(') { const g = grab(i + 2, '(', ')'); nested.push(g.body); cur += src.slice(i, g.next); inWord = true; i = g.next; continue; }
    if ((c === '<' || c === '>') && src[i + 1] === '(') { const g = grab(i + 2, '(', ')'); nested.push(g.body); i = g.next; continue; }
    if (c === '`') { const n = backtick(i); cur += src.slice(i, n); inWord = true; i = n; continue; }
    if (c === '<') {
      if (src.startsWith('<<<', i)) { endWord(); nextIs = 'herestring'; i += 3; continue; }
      if (src.startsWith('<<', i)) { endWord(); i += 2; if (src[i] === '-') i++; nextIs = 'heredoc'; continue; }
      endWord(); i++; continue; // input redirect: the target stays out of the way
    }
    if (c === '>' || (c === '&' && src[i + 1] === '>')) {
      if (c === '&') i++;
      if (inWord && /^\d+$/.test(cur)) { cur = ''; inWord = false; } // 2> style fd prefix
      endWord(); i++;
      if (src[i] === '>' || src[i] === '|') i++;
      if (src[i] === '&' && /[\d-]/.test(src[i + 1] ?? '')) { i += 2; continue; } // 2>&1 duplication, not a file
      if (src[i] === '&') i++;
      nextIs = 'redirect'; continue;
    }
    if (c === '\n') {
      endCmd(); i++;
      for (const delim of pendingHeredocs.splice(0)) {
        const lines = []; let found = false;
        while (i < src.length) {
          let e = src.indexOf('\n', i); if (e === -1) e = src.length;
          const line = src.slice(i, e); i = e + 1;
          if (line.trim() === delim) { found = true; break; }
          lines.push(line);
        }
        heredocs.push(lines.join('\n')); if (!found) break;
      }
      continue;
    }
    if (c === '(') { endCmd(); depth++; i++; continue; }
    if (c === ')') { endCmd(); depth = Math.max(0, depth - 1); i++; continue; }
    if (c === ';' || c === '&' || c === '|') { endCmd(); i++; continue; }
    if (c === ' ' || c === '\t') { endWord(); i++; continue; }
    cur += c; inWord = true; i++;
  }
  endCmd();
  return { commands, nested, heredocs };
}

// ---------- path helpers ----------
const real = (p) => {
  // realpath of the deepest existing ancestor, so symlinks (/tmp -> /private/tmp) compare equal.
  let head = path.resolve(p); const tail = [];
  for (;;) {
    try { return path.join(fs.realpathSync(head), ...tail.reverse()); } catch { /* keep walking up */ }
    const up = path.dirname(head);
    if (up === head) return path.resolve(p);
    tail.push(path.basename(head)); head = up;
  }
};
const within = (child, root) => child !== root && child.startsWith(root.endsWith(path.sep) ? root : root + path.sep);
const isShortCluster = (w) => /^-[A-Za-z]+$/.test(w);
const clusterHas = (w, ch) => isShortCluster(w) && w.slice(1).includes(ch);
const isSymlink = (p) => { try { return fs.lstatSync(p).isSymbolicLink(); } catch { return false; } };
const isDir = (p) => { try { return fs.lstatSync(p).isDirectory(); } catch { return false; } };
// Does long option `a` (e.g. --recur) abbreviate `full` (e.g. --recursive)? GNU tools accept unique prefixes.
const abbrev = (a, full, min = 3) => a.startsWith('--') && a.length >= min && full.startsWith(a.split('=')[0]);

function expandVars(p, ctx) {
  const home = os.homedir();
  const map = { HOME: home, TMPDIR: os.tmpdir(), CLAUDE_PROJECT_DIR: ctx.project, CLAUDE_PLUGIN_ROOT: ctx.pluginRoot ?? '' };
  let out = p.replace(/^~(?=\/|$)/, home);
  out = out.replace(/\$\{(HOME|TMPDIR|CLAUDE_PROJECT_DIR|CLAUDE_PLUGIN_ROOT)\}|\$(HOME|TMPDIR|CLAUDE_PROJECT_DIR|CLAUDE_PLUGIN_ROOT)(?![A-Za-z0-9_])/g, (_, a, b) => map[a ?? b]);
  return out;
}
const unresolved = (p) => p.includes('$') || p.includes('`') || /^~[^/]/.test(p);
const resolveIn = (ctx, p) => {
  const x = expandVars(p, ctx);
  if (unresolved(x)) return null;
  if (path.isAbsolute(x)) return path.normalize(x);
  return ctx.cwd ? path.resolve(ctx.cwd, x) : null;
};
const globRe = (g) => new RegExp(`^${g.replace(/[.+^${}()|\\]/g, '\\$&').replace(/\*\*?/g, '.*').replace(/\?/g, '.').replace(/\[[^\]]*\]/g, '.')}$`, 'i');

// ---------- protected files ----------
function protectedPathReason(abs, ctx) {
  const lower = abs.toLowerCase();
  const home = os.homedir().toLowerCase();
  if (/\/\.claude\/settings(\.[^/]*)?\.json$/.test(lower)) return 'Settings files (.claude/settings*.json)';
  if (ctx.pluginRoot && ctx.pluginRoot.includes('/.claude/plugins/') && (lower === ctx.pluginRoot.toLowerCase() || lower.startsWith(`${ctx.pluginRoot.toLowerCase()}/`))) return 'The toon-crew plugin files';
  if (/\/\.claude\/plugins(\/|$)/.test(lower)) return 'Installed plugin files (~/.claude/plugins)';
  if (/\/\.git\/(config$|hooks(\/|$))/.test(lower)) return '.git/config and .git/hooks';
  if (looksLikeGitDirFile(abs)) return 'Git directory config and hooks (any copy of a .git dir)';
  if (lower === `${home}/.claude.json` || /\/\.claude\.json$/.test(lower)) return '~/.claude.json';
  if (path.basename(lower) === '.mcp.json') return '.mcp.json';
  return null;
}
// The plugin Claude Code is running (CLAUDE_PLUGIN_ROOT), wherever it is installed, inline (--plugin-dir) too.
// A subagent that rewrites it switches the guard off for everyone: subagents are refused, the main thread is asked.
function livePluginRule(abs, ctx) {
  if (!ctx.pluginRoot) return null;
  const a = abs.toLowerCase().replace(/\/+$/, ''); const root = ctx.pluginRoot.toLowerCase();
  if (a !== root && !a.startsWith(root.endsWith('/') ? root : `${root}/`)) {
    // A folder that holds the plugin: moving or replacing it (mv repo, ln -sfn over it) swaps the plugin out.
    return ctx.subagent && root.startsWith(`${a}/`) ? 'Moving or replacing a folder that holds the live toon-crew plugin is blocked for subagents.' : null;
  }
  return ctx.subagent ? 'The live toon-crew plugin (guard, hooks, agents) cannot be changed by a subagent: the owner edits it.'
    : ask('This changes the live toon-crew plugin Claude Code is running (its guard and crew): confirm.');
}
// A file with other hard links: writing it changes the other names too (a temp-dir link to a project file).
const hardLinked = (p) => { try { const st = fs.lstatSync(p); return st.isFile() && st.nlink > 1; } catch { return false; } };
// Project hook/agent/skill/command definitions: normal project work, so the owner is asked rather than blocked.
const crewConfigAsk = (abs) => (/\/\.claude\/(hooks|agents|skills|commands)(\/|$)/.test(abs.toLowerCase()) ? ask('Editing .claude hooks, agents, skills or commands changes how Claude behaves: confirm.') : null);
const isMemoryPath = (abs) => /\/agent-memory[^/]*\//i.test(abs);
// Text fallback for paths that still hold a variable.
const PROTECTED_TEXT = /\.claude\/(settings|hooks|agents|skills|commands|plugins)|\.claude\.json|\.mcp\.json|\.git\/(config|hooks)|toon-crew\/|agent-memory/i;

// A `config` file or `hooks/` folder inside a directory that looks like a git dir (has HEAD and objects).
function looksLikeGitDirFile(abs) {
  try {
    const parts = abs.split('/'); const i = parts.lastIndexOf('hooks');
    const dir = path.basename(abs) === 'config' ? path.dirname(abs) : (i > 0 ? parts.slice(0, i).join('/') || '/' : null);
    return !!dir && fs.existsSync(path.join(dir, 'HEAD')) && fs.existsSync(path.join(dir, 'objects'));
  } catch { return false; }
}
// A write target (or a deleted / linked file): returns a deny reason or null.
function writeTargetReason(raw, ctx, { memory = true } = {}) {
  if (typeof raw !== 'string' || !raw) return null;
  if (ctx.crew !== null && ctx.dataDirs) { // hand-backs go through Write/Edit only; the rest of the data folder is hook-only
    const abs = resolveIn(ctx, raw);
    if (abs && (inDataDir(abs, ctx) || inDataDir(real(abs), ctx))) return 'Shell writes into the plugin data folder are blocked for crew roles: write hand-back files with the Write tool.';
  }
  if (ctx.role && !/^\/dev\/(null|stdout|stderr)$/.test(raw)) {
    const abs = resolveIn(ctx, raw);
    if (!abs || !ctx.writeRoots.some((r) => within(real(abs), r)) || hardLinked(abs)) return `${ctx.role} is a read-only role: shell writes are allowed only under the system temp dir or the session scratchpad.`;
  }
  const x = expandVars(raw, ctx);
  if (/[*?[]/.test(x)) {
    const base = resolveIn(ctx, x.replace(/[*?[][^/]*$/, ''));
    const probe = [];
    const proj = ctx.project; const home = os.homedir();
    for (const d of [proj, home, ctx.cwd].filter(Boolean)) {
      probe.push(path.join(d, '.claude/settings.json'), path.join(d, '.claude/settings.local.json'), path.join(d, '.mcp.json'), path.join(d, '.claude.json'),
        path.join(d, '.git/config'), path.join(d, '.git/hooks/x'));
    }
    if (ctx.pluginRoot && (ctx.subagent || ctx.pluginRoot.includes('/.claude/plugins/'))) probe.push(path.join(ctx.pluginRoot, 'hooks/guard.mjs'), path.join(ctx.pluginRoot, 'hooks/hooks.json'));
    probe.push(path.join(home, '.claude/plugins/x'));
    const abs = path.isAbsolute(x) ? x : (ctx.cwd ? path.join(ctx.cwd, x) : null);
    const re = abs ? globRe(abs) : null;
    if (re && probe.some((p) => re.test(p))) return 'Writing to protected files (glob matches settings, hooks, plugin files or git config)';
    void base;
    return null;
  }
  const abs = resolveIn(ctx, raw);
  if (!abs) return PROTECTED_TEXT.test(x) && !/^\$/.test(x) ? `Writing to "${raw}" is blocked: the path uses a variable I cannot verify.` : null;
  const r = real(abs);
  const why = protectedPathReason(r, ctx) ?? protectedPathReason(abs, ctx);
  if (why) return `${why} cannot be changed from here: the owner edits them by hand.`;
  const live = livePluginRule(r, ctx) ?? livePluginRule(abs, ctx);
  if (live) return live;
  const soft = crewConfigAsk(r) ?? crewConfigAsk(abs);
  if (soft) return soft;
  if (memory && (isMemoryPath(r) || isMemoryPath(abs))) return 'Shell writes into agent-memory are blocked: use the Edit/Write tools so the secret scan runs.';
  ctx.written.add(r);
  return null;
}

// ---------- git ----------
const GIT_BUILTINS = new Set(['add', 'am', 'apply', 'archive', 'bisect', 'blame', 'branch', 'bundle', 'cat-file', 'checkout', 'cherry-pick', 'clean', 'clone', 'commit', 'config',
  'count-objects', 'describe', 'diff', 'difftool', 'fetch', 'format-patch', 'fsck', 'gc', 'grep', 'hash-object', 'help', 'init', 'log', 'ls-files', 'ls-remote', 'ls-tree', 'maintenance',
  'merge', 'merge-base', 'mergetool', 'mv', 'name-rev', 'notes', 'pull', 'push', 'range-diff', 'rebase', 'reflog', 'remote', 'request-pull', 'reset', 'restore', 'rev-list', 'rev-parse',
  'revert', 'rm', 'send-email', 'shortlog', 'show', 'show-ref', 'sparse-checkout', 'stash', 'status', 'submodule', 'switch', 'symbolic-ref', 'tag', 'update-ref', 'version', 'worktree', 'lfs']);
// Keys that hide a push or run a program on a later git command (also the owner's, once written to the shared config).
const DANGEROUS_CFG = /^(alias\.|remote\..*\.(push|pushurl|uploadpack|receivepack)$|push\.|core\.(sshcommand|fsmonitor|pager|editor|askpass|gitproxy)$|sequence\.editor$|diff\.external$|diff\..*\.(textconv|command)$|.*\.textconv$|filter\.|merge\..*\.driver$|gpg\.(.*\.)?program$|pager\.|url\..*\.(insteadof|pushinsteadof)$|include(if\..*)?\.path$|credential\.)/i;
// Plain pager/editor values are harmless: `git -c core.pager=cat log` stays allowed.
const SAFE_CFG_VALUE = (key, value) => /^(core\.(pager|editor)|sequence\.editor|pager\..*)$/i.test(key) && /^(cat|less|more|vi|vim|nvim|nano|true|)$/.test(value.trim());
const PUSH_LONG = ['--all', '--atomic', '--delete', '--dry-run', '--exec', '--follow-tags', '--force', '--force-if-includes', '--force-with-lease', '--ipv4', '--ipv6', '--mirror', '--no-verify',
  '--porcelain', '--progress', '--prune', '--push-option', '--quiet', '--receive-pack', '--recurse-submodules', '--repo', '--set-upstream', '--signed', '--tags', '--thin', '--verbose', '--verify'];
const PUSH_FORCE = new Set(['--force', '--force-if-includes', '--force-with-lease']);
const PUSH_WIPE = new Set(['--mirror', '--all', '--prune']);

function gitRun(dir, args, ctx) {
  if (Date.now() > ctx.deadline) return { unknown: true };
  try {
    return { out: execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 1500 }).trim() };
  } catch (e) {
    return typeof e.status === 'number' ? { out: '' } : { unknown: true };
  }
}
// One lookup per directory.
function gitInfo(dir, ctx) {
  if (!dir) return { unknown: true };
  if (ctx.cache.has(dir)) return ctx.cache.get(dir);
  const branch = gitRun(dir, ['symbolic-ref', '--short', '-q', 'HEAD'], ctx);
  const dst = branch.unknown ? branch : gitRun(dir, ['rev-parse', '--abbrev-ref', '@{push}'], ctx);
  let notRepo = false;
  if (!branch.unknown && !branch.out) notRepo = gitRun(dir, ['rev-parse', '--git-dir'], ctx).out === ''; // detached HEAD still has a git dir
  const info = { unknown: branch.unknown || dst.unknown, notRepo, branch: branch.out ?? '', pushFailed: !dst.unknown && !dst.out, pushDst: (dst.out ?? '').replace(/^[^/]+\//, '') };
  ctx.cache.set(dir, info);
  return info;
}
// remote.<name>.push lines from any config source (repo, user, --file edits made earlier).
function remotePushRules(dir, remote, ctx) {
  const r = gitRun(dir, ['config', '--get-all', `remote.${remote}.push`], ctx);
  return r.unknown ? null : r.out.split('\n').filter(Boolean);
}
function gitAliases(dir, ctx) {
  const key = `alias:${dir}`;
  if (ctx.cache.has(key)) return ctx.cache.get(key);
  const map = new Map();
  const r = dir ? gitRun(dir, ['config', '--get-regexp', '^alias\\.'], ctx) : { unknown: true };
  if (r.unknown) map.unknown = true;
  for (const line of (r.out ?? '').split('\n')) { const m = /^alias\.(\S+)\s+(.*)$/.exec(line); if (m) map.set(m[1], m[2]); }
  ctx.cache.set(key, map);
  return map;
}
const isProtectedRef = (name) => PROTECTED.has(name.replace(/^refs\/heads\//, ''));

// branch, tag, worktree and symbolic-ref both read and write: a read-only role gets only the read forms.
const LIST_VALUE = new Set(['--contains', '--no-contains', '--merged', '--no-merged', '--points-at', '--sort', '--format', '--column']);
const REF_WRITE = { branch: { short: /[dDmMcCftu]/, long: /^--(delete|move|copy|force|set-upstream-to|unset-upstream|edit-description|track|no-track|create-reflog|recurse-submodules)(=|$)/ },
  tag: { short: /[asufdmFe]/, long: /^--(annotate|sign|local-user|force|delete|message|file|edit|create-reflog|cleanup|trailer)(=|$)/ } };
const CONFIG_VERBS = new Set(['set', 'unset', 'get', 'list', 'rename-section', 'remove-section', 'edit']);
// A config write: a key and a value, or a writing option or verb. `git config key` alone reads.
function configWrite(rest) {
  const pos = [];
  for (let k = 0; k < rest.length; k++) {
    const a = rest[k];
    if (/^(--(add|unset|unset-all|replace-all|rename-section|remove-section|edit)|-e)$/.test(a)) return `${a} writes the config`;
    if (['-f', '--file', '--blob', '--type', '--default'].includes(a)) { k++; continue; }
    if (!a.startsWith('-')) pos.push(a);
  }
  if (['set', 'unset', 'rename-section', 'remove-section', 'edit'].includes(pos[0])) return `${pos[0]} writes the config`;
  if (rest.some((a) => /^--(get|list|show|name-only)/.test(a) || a === '-l') || ['get', 'list'].includes(pos[0])) return null;
  return pos.length >= 2 ? 'with a value writes the config' : null;
}
// Is `dir` inside the git checkout that holds CLAUDE_PLUGIN_ROOT? A worktree has its own .git file, so it is not.
const checkoutOf = (p) => { for (let d = p; ; d = path.dirname(d)) { if (fs.existsSync(path.join(d, '.git'))) return d; if (path.dirname(d) === d) return null; } };
function inLiveCheckout(dir, ctx) {
  if (!dir) return true; // cd to a variable: cannot tell, so assume the worst
  // The session's own cwd comes from Claude Code, not the command: trust it even before the worktree exists on disk.
  if (!fs.existsSync(dir) && real(dir) === real(ctx.startCwd)) return false;
  const live = checkoutOf(ctx.pluginRoot);
  return !!live && checkoutOf(real(dir))?.toLowerCase() === live.toLowerCase();
}
function roleGitWrite(sub, rest) {
  if (sub === 'stash') return ['list', 'show'].includes(rest.find((a) => !a.startsWith('-'))) ? null : 'changes the working tree';
  if (sub === 'notes') return ['list', 'show', 'get-ref', undefined].includes(rest.find((a) => !a.startsWith('-'))) ? null : 'changes notes refs';
  if (sub === 'worktree') return ['list', undefined].includes(rest.find((a) => !a.startsWith('-'))) ? null : 'changes worktrees';
  if (sub === 'symbolic-ref') return rest.some((a) => a === '-d' || a === '--delete') || rest.filter((a) => !a.startsWith('-')).length > 1 ? 'moves HEAD' : null;
  const rule = REF_WRITE[sub];
  if (!rule) return null;
  let listing = false; const pos = [];
  for (let k = 0; k < rest.length; k++) {
    const a = rest[k];
    if (a === '--') { pos.push(...rest.slice(k + 1)); break; }
    if (LIST_VALUE.has(a)) { k++; continue; }
    if (a.startsWith('--')) { if (rule.long.test(a)) return `${a.split('=')[0]} changes refs`; if (/^--(list|show-current|verify)$/.test(a)) listing = true; continue; }
    if (isShortCluster(a)) { if (rule.short.test(a.slice(1))) return `${a} changes refs`; if (/[lv]/.test(a) && (sub === 'tag' || a.includes('l'))) listing = true; continue; }
    if (a.startsWith('-')) continue; // -n5 and the like
    pos.push(a);
  }
  return pos.length && !listing ? `with a name creates a ${sub}` : null;
}

// Variables that point git at another repo or work tree. Set by export/declare or a bare assignment earlier in the
// command line, they reach every later git command, so the guard remembers them for the rest of the line.
const GIT_LOCATION_VARS = /^GIT_(DIR|WORK_TREE|INDEX_FILE|COMMON_DIR|OBJECT_DIRECTORY|NAMESPACE)$/;
const DECLARERS = new Set(['export', 'declare', 'typeset', 'readonly', 'local']);
function noteGitEnv(words, ctx) {
  const names = DECLARERS.has(words[0]) ? words.slice(1) : (words.length && words.every((w) => /^[A-Za-z_]\w*=/.test(w)) ? words : []);
  if (names.some((w) => GIT_LOCATION_VARS.test(w.split('=')[0]))) ctx.gitEnv = true;
}
// Paths git itself writes outside the work tree: checkout-index --prefix=, --output= (diff, archive, format-patch).
function gitWriteTargets(sub, rest) {
  return rest.flatMap((a, k) => (a.startsWith('--prefix=') && sub === 'checkout-index' ? [a.slice(9)] : a.startsWith('--output=') ? [a.slice(9)]
    : (a === '--output' || (a === '-o' && ['archive', 'format-patch'].includes(sub))) ? [rest[k + 1] ?? ''] : []));
}

function checkGit(words, ctx, via, depth) {
  let i = 1; let dir = ctx.cwd; const cfgs = []; let hookAsk = null; let gitDirUsed = ctx.gitEnv || (via.assigns ?? []).some((n) => GIT_LOCATION_VARS.test(n));
  const withValue = new Set(['--git-dir', '--work-tree', '--namespace', '--super-prefix']);
  while (i < words.length && words[i].startsWith('-')) {
    const w = words[i];
    if (/^--(git-dir|work-tree)(=|$)/.test(w)) gitDirUsed = true;
    if (w === '-C') { const p = words[i + 1] ?? '.'; dir = dir ? path.resolve(dir, expandVars(p, ctx)) : null; i += 2; }
    else if (w === '-c') { cfgs.push(words[i + 1] ?? ''); i += 2; }
    else if (w === '--config-env') { cfgs.push(words[i + 1] ?? ''); i += 2; }
    else if (w.startsWith('--config-env=')) { cfgs.push(w.slice(13)); i++; }
    else if (w.startsWith('-c') && w.length > 2) { cfgs.push(w.slice(2)); i++; }
    else if (withValue.has(w)) i += 2;
    else i++;
  }
  for (const c of cfgs) {
    const key = c.split('=')[0].trim();
    if (DANGEROUS_CFG.test(key) && !SAFE_CFG_VALUE(key, c.slice(c.indexOf('=') + 1 || c.length))) return `git -c ${key} is blocked: aliases and push settings can hide a push to main.`;
    if (/^core\.hookspath$/i.test(key)) hookAsk = ask('core.hooksPath runs scripts from another folder on every git command: confirm.');
  }
  let sub = words[i];
  if (!sub) return null;
  const rest = words.slice(i + 1);
  if ((sub === 'credential' && rest.includes('fill')) || (/^credential-/.test(sub) && rest.includes('get'))) return 'Reading stored git credentials (git credential fill/get) is blocked for every role.';
  // An alternate git dir (--git-dir, --work-tree, GIT_DIR, GIT_WORK_TREE) hides its config and aliases from the checks.
  if (gitDirUsed && (sub === 'push' || !GIT_BUILTINS.has(sub))) return 'git push or an unknown git subcommand with --git-dir/--work-tree/GIT_DIR is blocked: its config and aliases cannot be verified.';
  if (ctx.role && sub === 'push') return `${ctx.role} is a read-only role: git push is for the builders and the manager.`;
  if (ctx.role && ROLE_GIT_BLOCKED.has(sub)) return `${ctx.role} is a read-only role: git ${sub} changes the working tree or history.`;
  if (ctx.role) { const w = roleGitWrite(sub, rest); if (w) return `${ctx.role} is a read-only role: git ${sub} ${w}; only its list forms are allowed.`; }
  // A subagent in the checkout that holds the live plugin (not its own worktree) gets the read-only git rules.
  if (!ctx.role && ctx.subagent && ctx.pluginRoot && (gitDirUsed || inLiveCheckout(dir, ctx))) {
    const w = ROLE_GIT_BLOCKED.has(sub) ? 'changes the working tree or history' : roleGitWrite(sub, rest) ?? (sub === 'config' ? configWrite(rest) : null);
    if (w) return `git ${sub} in the checkout that runs the live toon-crew plugin is blocked for subagents (${w}): work in your own worktree.`;
  }
  for (const t of gitWriteTargets(sub, rest)) { const why = writeTargetReason(t || '.', ctx); if (why) return why; }
  if (ctx.subagent && ctx.pluginRoot && sub === 'apply' && rest.includes('--unsafe-paths')) return 'git apply --unsafe-paths can write outside the work tree, including the live toon-crew plugin: blocked for subagents.';
  if (!GIT_BUILTINS.has(sub)) { // possibly an alias defined in the repo or user config
    const aliases = gitAliases(dir, ctx);
    if (aliases.unknown) return ask('git subcommand could not be verified (alias lookup failed): confirm.');
    const value = aliases.get(sub);
    if (value !== undefined) {
      if (value.startsWith('!')) return checkCommands(`${value.slice(1)} ${rest.join(' ')}`, ctx, depth + 1);
      return checkGit(['git', ...value.split(/\s+/).filter(Boolean), ...rest], ctx, via, depth + 1);
    }
    return null;
  }
  if (sub === 'config') {
    const pos = []; // positional args, skipping the value of --file/-f/--blob (and --type, --default)
    for (let k = 0; k < rest.length; k++) {
      if (['-f', '--file', '--blob', '--type', '--default'].includes(rest[k])) { k++; continue; }
      if (!rest[k].startsWith('-')) pos.push(rest[k]);
    }
    const reading = rest.some((a) => /^--(get|list|show|name-only)/.test(a) || a === '-l') || ['get', 'list'].includes(pos[0]);
    if (rest.some((a) => a === '-e' || a === '--edit') || pos[0] === 'edit') return 'git config --edit is blocked: it opens protected config files.';
    if (ctx.role) { const w = configWrite(rest); if (w) return `${ctx.role} is a read-only role: git config ${w}; only reads (--get, --list) are allowed.`; }
    const keyAt = CONFIG_VERBS.has(pos[0]) ? 1 : 0; const key = pos[keyAt] ?? ''; const value = pos[keyAt + 1] ?? '';
    if (!reading && key && DANGEROUS_CFG.test(key) && !(pos.length > keyAt + 1 && SAFE_CFG_VALUE(key, value))) return `git config ${key} is blocked: it can hide a push to main or run a program on a later git command.`;
    if (!reading && pos.length >= keyAt + 2 && /^core\.hookspath$/i.test(key)) return ask('core.hooksPath runs scripts from another folder on every git command: confirm.');
    return hookAsk;
  }
  if (sub === 'clean') {
    if (rest.some((a) => clusterHas(a, 'x') || clusterHas(a, 'X'))) return 'git clean -x/-X deletes ignored files (including data and .env): blocked.';
    return null;
  }
  if (sub !== 'push') return hookAsk;

  const positionals = []; let deleting = false; let repoGiven = false; let tagsOnly = false;
  const args = rest;
  for (let k = 0; k < args.length; k++) {
    const a = args[k];
    if (a === '--') { positionals.push(...args.slice(k + 1)); break; }
    if (a.startsWith('--')) {
      const name = a.split('=')[0];
      if (name === '--tags') tagsOnly = true;
      const cands = PUSH_LONG.filter((o) => o === name || (name.length >= 3 && o.startsWith(name)));
      if (cands.some((o) => PUSH_FORCE.has(o))) return 'git push --force/-f is blocked everywhere. Ask the owner to push manually.';
      if (cands.some((o) => PUSH_WIPE.has(o))) return 'git push --all/--mirror/--prune can overwrite main. Push the branch by name.';
      if (cands.includes('--delete')) deleting = true;
      if (['--push-option', '--receive-pack', '--exec', '--repo'].some((o) => cands.includes(o)) && !a.includes('=')) { if (cands.includes('--repo')) repoGiven = true; k++; }
      else if (cands.includes('--repo')) repoGiven = true;
      continue;
    }
    if (clusterHas(a, 'f')) return 'git push --force/-f is blocked everywhere. Ask the owner to push manually.';
    if (clusterHas(a, 'd')) deleting = true;
    if (a === '-o') { k++; continue; }
    if (a.startsWith('-')) continue;
    positionals.push(a);
  }
  const remote = repoGiven ? undefined : positionals[0];
  const refspecs = repoGiven ? positionals : positionals.slice(1);
  for (const spec of refspecs) if (spec.startsWith('+')) return 'git push with a +refspec is a force push and is blocked.';

  if (ctx.km) { // Miguel Rivera may only push lesson branches to origin
    const ok = remote === 'origin' && refspecs.length === 1 && /^([^:+]*:)?(refs\/heads\/)?crew-lessons\/[A-Za-z0-9._/-]+$/.test(refspecs[0]) && !deleting;
    if (!ok) return 'Miguel Rivera may only run: git push origin crew-lessons/<branch>.';
    return { lazy: () => { // the lessons repo only: origin must be the crew repo, never a product repo
      const url = dir ? gitRun(dir, ['remote', 'get-url', 'origin'], ctx) : { unknown: true };
      return url.out && url.out.includes(CREW_REPO) ? null : `Miguel Rivera may only push when origin is ${CREW_REPO}.`;
    } };
  }
  for (const spec of refspecs) {
    const dst = spec.split(':').pop();
    if (isProtectedRef(dst) && (deleting || spec.startsWith(':'))) return 'Deleting main/master on the remote is blocked.';
  }
  const needsLookup = [];
  for (const spec of refspecs) {
    const dst = spec.split(':').pop();
    if (dst === 'HEAD' || dst === '@') needsLookup.push('head');
    else if (isProtectedRef(dst)) return pushGate(ctx);
  }
  if (via.xargs) return pushGate(ctx); // the refspec arrives on stdin: cannot be verified, so treat it as main
  if (refspecs.length === 0 && !tagsOnly) needsLookup.push('bare');
  if (needsLookup.length) {
    return { lazy: () => {
      const info = gitInfo(dir, ctx);
      if (info.unknown) return ask('Could not verify which branch this push updates: confirm.');
      if (info.notRepo) return null;
      if (isProtectedRef(info.branch)) return pushGate(ctx);
      if (needsLookup.includes('bare')) {
        const rules = remotePushRules(dir, remote ?? 'origin', ctx);
        if (rules === null) return ask('Could not verify the remote push rules: confirm.');
        for (const rule of rules) {
          if (rule.startsWith('+')) return `remote.${remote ?? 'origin'}.push holds a +refspec (${rule}): a bare push would force-push. Blocked.`;
          if (isProtectedRef(rule.split(':').pop())) return pushGate(ctx);
        }
        if (info.pushFailed) return ask('Could not verify where a bare push goes (no @{push} target): confirm.');
        if (info.pushDst && isProtectedRef(info.pushDst)) return pushGate(ctx);
      }
      return null;
    } };
  }
  return null;
}

// ---------- gh / GitHub API ----------
// Normalised API path: no scheme/host, no query, no "." segments, no repeated or leading slashes.
const apiPath = (endpoint) => endpoint.replace(/[?#].*$/, '').replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, '').replace(/^[^/]*github\.com(?=\/|$)/i, '')
  .replace(/\/\.(?=\/|$)/g, '').replace(/\/{2,}/g, '/').replace(/^\/+/, '');
const GQL_GUARDS = /\b(createBranchProtectionRule|updateBranchProtectionRule|deleteBranchProtectionRule|createRepositoryRuleset|updateRepositoryRuleset|deleteRepositoryRuleset|createCommitOnBranch)\b/;
const ghRules = (method, endpoint, text, ctx) => {
  const ep = apiPath(endpoint);
  if (/(^|\/)graphql\/?$/.test(ep) || /\b(mutation|query)\b/.test(text)) {
    if (/\b(deleteRepository|deleteRef|transferRepository|archiveRepository|updateRef)\b/.test(text)) return 'Deleting or rewriting repo data through the GitHub API is blocked.';
    if (GQL_GUARDS.test(text)) return 'Changing branch protection or rulesets, or committing straight to a branch, through GraphQL is blocked.';
    if (/\benablePullRequestAutoMerge\b/.test(text)) return AUTO_MERGE_DENY;
    if (/\b(mergePullRequest|mergeBranch)\b/.test(text)) return mergeGate(ctx);
    if (/\b(addPullRequestReview|submitPullRequestReview)\b/.test(text) && /APPROVE/i.test(text)) return devopsGate(ctx, 'PR approvals');
  }
  if (method === 'GET') return null;
  if (/^repos\/[^/]+\/[^/]+\/?$/.test(ep)) return 'Deleting or editing a repo through the GitHub API is blocked.';
  if (/git\/refs\/heads\/(main|master)\b/.test(ep) || /git\/refs\/?$/.test(ep) && /\b(main|master)\b/.test(text)) return 'Moving or deleting main/master through the GitHub API is blocked.';
  if (/branches\/[^/]+\/protection/.test(ep)) return 'Changing branch protection through the GitHub API is blocked.';
  if (/(^|\/)rulesets(\/|$)/.test(ep)) return 'Changing rulesets through the GitHub API is blocked.';
  const pull = /^repos\/([^/]+\/[^/]+)\/pulls\/([^/]+)\/merge\/?$/.exec(ep);
  if (pull || /\/pulls\/[^/]+\/merge\/?$/.test(ep) || /\/merges\/?$/.test(ep)) return mergeGate(ctx, pull ? { repo: pull[1], pr: pull[2] } : undefined);
  // A contents write without a branch goes to the default branch: treat it as a push to main.
  if (/^repos\/[^/]+\/[^/]+\/contents(\/|$)/.test(ep) && (method === 'PUT' || method === 'DELETE')) {
    const br = /\bbranch["']?\s*[=:]\s*["']?([^\s"',}&]+)/.exec(text);
    if (!br || isProtectedRef(br[1])) return pushGate(ctx);
  }
  if (/\/dispatches\/?$/.test(ep)) return devopsGate(ctx, 'workflow dispatches');
  // A review (or a pending review's submit) that approves; a body the guard cannot read counts as one.
  if (/\/pulls\/[^/]+\/reviews(\/[^/]+\/events)?\/?$/.test(ep) && (/APPROVE/i.test(text) || /\s--input\b/.test(text))) return devopsGate(ctx, 'PR approvals');
  return null;
};

// gh api: a field or body the guard cannot read (a file, stdin, a shell variable) could carry any mutation.
const GH_API_VALUE = new Set(['-X', '--method', '--request', '-f', '-F', '--field', '--raw-field', '--input', '-H', '--header', '-q', '--jq', '-t', '--template', '--cache', '-R', '--repo', '--hostname', '-p', '--preview']);
const GH_API_BODY = new Set(['-f', '-F', '--field', '--raw-field', '--input']);
const dynamicValue = (v) => /^\$|\$[({]|`/.test(v) || /(^|[{\s])\$[A-Za-z_]\w*\s*[({]/.test(v);
function apiArgs(words) {
  let method = null; let hasBody = false; const fields = []; let input = false; const candidates = [];
  for (let k = words.indexOf('api') + 1; k < words.length; k++) {
    const a = words[k];
    const eq = a.indexOf('=');
    const name = a.startsWith('--') && eq !== -1 ? a.slice(0, eq) : (/^-[A-Za-z]./.test(a) && !a.startsWith('--') ? a.slice(0, 2) : a);
    const attached = name !== a ? a.slice(a.startsWith('--') ? eq + 1 : 2) : null;
    if (GH_API_VALUE.has(name)) {
      const v = attached ?? words[++k] ?? '';
      if (['-X', '--method', '--request'].includes(name)) method = v.toUpperCase();
      if (GH_API_BODY.has(name)) { hasBody = true; if (name === '--input') input = true; else fields.push(v); }
      continue;
    }
    if (a.startsWith('-')) continue;
    candidates.push(a); // every positional is checked: an option the guard does not know cannot hide the endpoint
  }
  return { method: method ?? (hasBody ? 'POST' : 'GET'), candidates, fields, input };
}
const firstHit = (results) => results.find((r) => typeof r === 'string') ?? results.find(Boolean) ?? null;

// gh's built-in commands; anything else is an alias or an extension whose commands the guard cannot see.
const GH_COMMANDS = new Set(['agent-task', 'alias', 'api', 'attestation', 'auth', 'browse', 'cache', 'codespace', 'completion', 'config', 'copilot', 'cs', 'extension', 'extensions', 'ext',
  'gist', 'gpg-key', 'help', 'issue', 'label', 'org', 'pr', 'preview', 'project', 'release', 'repo', 'rs', 'ruleset', 'run', 'search', 'secret', 'ssh-key', 'status', 'variable', 'version', 'workflow']);
function checkGh(words, ctx, via) {
  const positionals = [];
  for (let k = 1; k < words.length; k++) {
    const a = words[k];
    if (['-R', '--repo', '--hostname'].includes(a)) { k++; continue; }
    if (a.startsWith('-')) continue;
    positionals.push(a);
  }
  const [a, b] = positionals;
  const repoFlag = words.findIndex((w) => w === '-R' || w === '--repo' || w.startsWith('--repo='));
  const repoVal = repoFlag === -1 ? '' : (words[repoFlag].includes('=') ? words[repoFlag].split('=')[1] : words[repoFlag + 1] ?? '');
  if (via?.xargs) return 'gh behind xargs takes its arguments from stdin, which the guard cannot see: blocked.';
  if (a === undefined) return null;
  if (!GH_COMMANDS.has(a)) return `gh ${a.slice(0, 40)} is not a built-in gh command (an alias or extension the guard cannot see): blocked.`;
  if (a === 'alias') return 'gh alias is blocked: aliases hide gh commands from the guard.';
  if (a === 'auth' && (b === 'token' || b === 'refresh' || b === 'setup-git')) return 'Reading or changing GitHub credentials (gh auth token) is blocked.';
  if (a === 'auth' && b === 'status' && words.some((w) => /^--show-token(=|$)/.test(w) || /^-[A-Za-z]*t/.test(w))) return 'gh auth status --show-token prints the GitHub token: blocked.';
  if (a === 'config' && b === 'set' && /^(editor|pager|browser|http_unix_socket)$/.test(positionals[2] ?? '')) return `gh config set ${positionals[2]} runs a program on later gh commands: blocked.`;
  if (['extension', 'extensions', 'ext'].includes(a) && b === 'exec') return 'gh extension exec runs code the guard cannot see: blocked.';
  if (a === 'repo' && b === 'delete') return 'gh repo delete is blocked.';
  if (a === 'repo' && b === 'edit') return devopsGate(ctx, 'gh repo edit');
  if (a === 'workflow' && b === 'run') return devopsGate(ctx, 'gh workflow run');
  if (a === 'pr' && b === 'review' && words.some((w) => /^--approve(=|$)/.test(w) || /^-[A-Za-z]*a/.test(w))) return devopsGate(ctx, 'PR approvals');
  if (a === 'pr' && b === 'merge') {
    // --admin skips branch protection; --auto merges later, after the owner's look. Both refused for every role.
    if (words.some((w) => /^--admin(=|$)/.test(w))) return 'Merging with --admin bypasses branch protection: blocked for every role.';
    if (words.some((w) => /^--auto(=|$)/.test(w))) return AUTO_MERGE_DENY;
    const target = positionals[2] ?? ''; const url = /github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)/.exec(target);
    return mergeGate(ctx, url ? { repo: url[1], pr: url[2] } : { repo: repoVal || via?.vals?.GH_REPO, pr: target });
  }
  if (ctx.km && a === 'pr' && b === 'create') return repoVal === CREW_REPO ? null : `Miguel Rivera may only run: gh pr create -R ${CREW_REPO}.`;
  if (a === 'api') {
    const { method, candidates, fields, input } = apiArgs(words);
    if (ctx.km && method !== 'GET') return 'Miguel Rivera may not change GitHub data through gh api.';
    if (candidates.some((c) => /(^|\/)graphql\/?$/.test(apiPath(c)))) {
      if (input || fields.some((f) => /^[^=]*=@/.test(f) || dynamicValue(f.slice(f.indexOf('=') + 1)))) return 'A GraphQL query read from a file, stdin or a shell variable cannot be checked: blocked.';
    }
    const text = words.join(' ');
    return firstHit((candidates.length ? candidates : ['']).map((c) => ghRules(method, c, text, ctx)));
  }
  return null;
}

// curl, wget, httpie (http/https) and xh/xhs: the method, the URLs, and bodies the guard cannot read.
const CURL_VALUE = new Set(['-d', '--data', '--data-raw', '--data-binary', '--data-urlencode', '--data-ascii', '-F', '--form', '--form-string', '--json', '-T', '--upload-file', '-H', '--header',
  '-u', '--user', '-o', '--output', '-A', '--user-agent', '-e', '--referer', '-b', '--cookie', '-c', '--cookie-jar', '-x', '--proxy', '-w', '--write-out', '--oauth2-bearer', '-E', '--cert',
  '--key', '--cacert', '-m', '--max-time', '--connect-timeout', '-r', '--range', '-D', '--dump-header', '--retry', '-z', '--time-cond', '--resolve', '--connect-to', '-U', '--proxy-user',
  '--url-query', '-X', '--request', '--url']);
const CURL_BODY = /^(-d|--data|--data-raw|--data-binary|--data-urlencode|--data-ascii|-F|--form|--form-string|--json|-T|--upload-file)$/;
const WGET_VALUE = new Set(['-O', '-o', '-a', '-P', '-U', '-e', '-i', '-t', '-T', '-w', '-Q', '-l', '-D', '-A', '-R', '-I', '-X', '--header', '--user', '--password', '--method', '--post-data',
  '--post-file', '--body-data', '--body-file', '--execute', '--input-file', '--output-document', '--config']);
const HTTPIE_VALUE = new Set(['-a', '--auth', '-o', '--output', '--session', '--session-read-only', '-A', '--auth-type', '--proxy', '--cert', '--cert-key', '--verify', '--timeout', '--pretty', '-s', '--style', '-p', '--print']);
const HTTP_METHODS = /^(GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS)$/i;
const looksLikeUrl = (w) => /^[a-z][a-z0-9+.-]*:\/\//i.test(w) || /^[\w-]+(\.[\w-]+)+(:\d+)?(\/|$)/.test(w) || /^localhost(:\d+)?(\/|$)/.test(w) || /^:\d*\//.test(w);
// Splits one argument into [name, attached value]: --opt=v, -Xv, and short clusters (-sX PUT -> -s, then -X).
function optionsOf(a, valueOpts) {
  if (a.startsWith('--')) { const eq = a.indexOf('='); return [[eq === -1 ? a : a.slice(0, eq), eq === -1 ? null : a.slice(eq + 1)]]; }
  if (!/^-[A-Za-z:]/.test(a)) return [];
  const out = [];
  for (let j = 1; j < a.length; j++) {
    const n = `-${a[j]}`;
    if (valueOpts.has(n)) { out.push([n, j + 1 < a.length ? a.slice(j + 1) : null]); break; }
    out.push([n, null]);
  }
  return out;
}
function httpArgs(prog, words) {
  const httpie = /^(http|https|xh|xhs)$/.test(prog);
  const valueOpts = prog === 'curl' ? CURL_VALUE : prog === 'wget' ? WGET_VALUE : HTTPIE_VALUE;
  let method = null; let hasBody = false; const urls = []; const bodies = []; let hidden = null; let hiddenOnWrite = null; const pos = [];
  for (let k = 1; k < words.length; k++) {
    const a = words[k];
    if (!a.startsWith('-') || a === '-') { pos.push(a); continue; }
    for (const [name, attached] of optionsOf(a, valueOpts)) {
      const v = valueOpts.has(name) ? attached ?? words[++k] ?? '' : '';
      if (prog === 'curl' && (['-K', '--config', '-:', '--next', '--variable'].includes(name) || name.startsWith('--expand-'))) hidden = `curl ${name} reads options or URLs the guard cannot see: blocked.`;
      if (prog === 'wget' && (name === '--config' || (['-e', '--execute'].includes(name) && /method|post|body|header/i.test(v)))) hidden = `wget ${name} sets the request in a way the guard cannot check: blocked.`;
      if (prog === 'wget' && ['-i', '--input-file'].includes(name)) hiddenOnWrite = 'wget -i reads URLs from a file the guard cannot see: blocked for writes.';
      if ((prog === 'curl' && (name === '-X' || name === '--request')) || (prog === 'wget' && name === '--method')) method = v.toUpperCase();
      if (name === '--url') urls.push(v);
      if ((prog === 'curl' && CURL_BODY.test(name)) || (prog === 'wget' && /^--(post|body)-(data|file)$/.test(name))) { hasBody = true; bodies.push([name, v]); }
    }
  }
  if (httpie) {
    let k = 0;
    if (pos.length > 1 && HTTP_METHODS.test(pos[0])) method = pos[k++].toUpperCase();
    if (pos[k] !== undefined) urls.push(pos[k]);
    if (!method && pos.slice(k + 1).some((it) => /^[^:=@]+(=|:=|@|=@|:=@)/.test(it) && !/^[^:=]+:[^=]/.test(it))) hasBody = true;
  } else urls.push(...pos);
  return { method: method ?? (hasBody ? 'POST' : 'GET'), urls, bodies, hidden, hiddenOnWrite };
}
function checkHttp(prog, words, ctx) {
  const { method, urls, bodies, hidden, hiddenOnWrite } = httpArgs(prog, words);
  if (hidden) return hidden;
  if (hiddenOnWrite && method !== 'GET') return hiddenOnWrite;
  const dynamic = urls.filter((u) => /\$|`|\{\{/.test(u));
  if (method !== 'GET' && (dynamic.length || !urls.some(looksLikeUrl))) return `A ${method} request to a URL held in a variable or file cannot be checked: blocked.`;
  const gh = urls.filter((u) => /^([a-z]+:\/\/)?[^/\s]*github\.com(\/|$|:)/i.test(u));
  if (!gh.length) return null;
  if (gh.some((u) => /(^|\/)graphql\/?$/.test(apiPath(u))) && bodies.some(([n, v]) => /^@/.test(v) || (n === '--data-urlencode' && /^[^=]*@/.test(v)) || dynamicValue(v) || /^--(post|body)-file$/.test(n) || /^(-T|--upload-file)$/.test(n)))
    return 'A GraphQL body read from a file, stdin or a shell variable cannot be checked: blocked.';
  const text = words.join(' ');
  return firstHit(gh.map((u) => ghRules(method, u, text, ctx)));
}

// ---------- rm and other deletes ----------
function checkRm(words, ctx) {
  let recursive = false; let force = false; const targets = []; let endOpts = false;
  for (const a of words.slice(1)) {
    if (!endOpts && a === '--') { endOpts = true; continue; }
    if (!endOpts && a.startsWith('--')) {
      if (abbrev(a, '--recursive')) recursive = true;
      if (abbrev(a, '--force')) force = true;
      if (abbrev(a, '--no-preserve-root', 4)) return 'rm --no-preserve-root is blocked.';
      continue;
    }
    if (!endOpts && isShortCluster(a)) { if (/[rR]/.test(a)) recursive = true; if (a.includes('f')) force = true; continue; }
    targets.push(a);
  }
  if (!recursive) return null;
  return checkDeleteTargets(targets, ctx, force ? 'rm -rf' : 'rm -r');
}
// Rebuildable output folders inside the project (node_modules, dist, build, ...) are fine to delete.
const isBuildOutput = (abs, project) => within(abs, project) && /(^|\/)(node_modules|dist|build|coverage|\.next|\.turbo|\.cache)(\/|$)/.test(path.relative(project, abs));
function checkDeleteTargets(targets, ctx, label, allowRoot = false) {
  if (targets.length === 0) return `${label} with no visible target is blocked.`;
  for (const raw of targets) {
    const abs = resolveIn(ctx, raw.replace(/^\$\{?TMPDIR\}?(?=\/|$)/, os.tmpdir()));
    if (!abs) return `${label} on "${raw}" is blocked: the path or the current folder uses something I cannot verify (variable, cd to a variable).`;
    if (!ctx.rmRoots.some((r) => within(real(abs), r) || (allowRoot && real(abs) === r)) && !isBuildOutput(real(abs), ctx.project)) return `${label} on "${raw}" is blocked: only tmp/scratch dirs inside the project or the system temp dir are allowed.`;
  }
  return null;
}
function checkFind(words, ctx, via, depth) {
  const starts = []; let k = 1;
  while (k < words.length && !words[k].startsWith('-') && !['(', '!', ')'].includes(words[k])) starts.push(words[k++]);
  if (!starts.length) starts.push('.');
  let r = null;
  for (; k < words.length; k++) {
    const a = words[k];
    if (a === '-delete') { r = checkDeleteTargets(starts, ctx, 'find -delete', true); if (typeof r === 'string') return r; }
    if (['-exec', '-execdir', '-ok', '-okdir'].includes(a)) {
      let e = k + 1; while (e < words.length && words[e] !== ';' && words[e] !== '+') e++;
      const inner = words.slice(k + 1, e);
      const innerProg = path.basename(inner[0] ?? '');
      if (['rm', 'rmdir', 'shred', 'unlink'].includes(innerProg) && !ctx.rmRoots.length) return 'find -exec rm is blocked.';
      if (['rm', 'rmdir', 'shred', 'unlink'].includes(innerProg)) { r = checkDeleteTargets(starts, ctx, `find -exec ${innerProg}`, true); if (typeof r === 'string') return r; }
      const res = scanWords(inner, ctx, { xargs: true }, depth + 1);
      if (typeof res === 'string') return res;
      if (res) r ??= res;
      k = e;
    }
  }
  return r;
}

function checkDocker(words, ctx) {
  const rest = words.slice(1);
  const hasV = rest.some((w) => /^--vol(umes?)?(=(?!false|0).*)?$/.test(w) || w === '-v' || (isShortCluster(w) && w.includes('v')));
  if (rest.includes('down') && hasV) return 'docker compose down -v is blocked: it deletes named volumes (data).';
  if (rest.includes('rm') && rest.includes('compose') && hasV) return 'docker compose rm -v is blocked: it deletes volumes (data).';
  const vi = rest.indexOf('volume');
  if (vi !== -1 && rest.slice(vi + 1).some((w) => ['rm', 'remove', 'prune'].includes(w))) return 'docker volume rm/prune is blocked: it deletes data.';
  if (rest.includes('system') && rest.includes('prune') && rest.some((w) => /^--vol/.test(w))) return 'docker system prune --volumes is blocked: it deletes data.';
  if (rest.some((w) => ['run', 'exec'].includes(w)) && /\brm\s+(-\S*[rR]|--rec)|\brmdir\b|\bfind\b[^;|]*-delete|\bshred\b|\bmkfs\b|\bdd\s+if=/.test(rest.join(' '))) return 'Deleting files inside a container (docker run/exec rm -rf) can wipe mounted volumes: blocked.';
  void ctx;
  return null;
}

// ---------- inline interpreter code ----------
const HTTP_WRITE = /\b(requests|httpx|axios|session|client|urllib3)\.(put|post|patch|delete)\s*\(|method\s*[=:]\s*['"`](PUT|POST|PATCH|DELETE)\b|\.request\s*\(\s*['"`](PUT|POST|PATCH|DELETE)\b|\bRequest\s*\([^)]*\bdata\s*=|\bHTTP(Put|Post|Patch|Delete)\b|Net::HTTP::(Put|Post|Patch|Delete)/i;
function checkInlineCode(code, ctx) {
  const flat = code.replace(/["'\s,[\]()]+/g, ' ');
  if (/\bgit\b.{0,40}\bpush\b/.test(flat)) return 'git push from inline code (python/node/perl -c/-e) is blocked.';
  if (/\bgh\b.{0,40}\b(merge|delete|alias)\b/.test(flat) || /\bgh auth token\b/.test(flat)) return 'gh merge/delete from inline code is blocked.';
  // A write request from inline code: refused when it names GitHub or when its URL is not a literal the guard can read.
  if (HTTP_WRITE.test(code) && (/github\.com/i.test(code) || !/['"`]https?:\/\/[^'"`$]+['"`]/.test(code))) return 'Inline code sending a write request to GitHub, or to a URL in a variable, is blocked.';
  if (CRED_TEXT.test(code)) return 'Reading the gh hosts file or git credentials is blocked for every role.';
  if (/\brmtree\b|\brmSync\b|\brmdirSync\b|\bunlinkSync\b|\bos\.(remove|unlink|rmdir)\b|\brm -[a-z]*r|\bunlink\(|\bFile\.delete|\bFileUtils\.rm/.test(code)) return 'Deleting files from inline code is blocked.';
  if (PROTECTED_TEXT.test(code)) return 'Inline code touching settings, hooks, plugin files, git config or agent-memory is blocked.';
  if (!ctx || !(ctx.role || (ctx.subagent && ctx.pluginRoot))) return null;
  const sites = inlineWriteSites(code);
  for (const p of sites.flatMap((x) => x.paths)) {
    const a = p === null ? null : resolveIn(ctx, p);
    if (a && ctx.subagent && typeof (livePluginRule(real(a), ctx) ?? livePluginRule(a, ctx)) === 'string') return 'Inline code writing into the live toon-crew plugin is blocked for subagents.';
  }
  if (!ctx.role) return null;
  // Each written path must be a literal under temp: a "/tmp/" mention elsewhere in the code proves nothing.
  if (SPAWNS_OR_EVALS.test(code)) return `${ctx.role} is a read-only role: inline code may not start programs or evaluate strings.`;
  if (INDIRECT.test(code)) return `${ctx.role} is a read-only role: inline code may not reach files or programs through aliases or reflection.`;
  for (const site of sites) {
    if (site.kind === 'link') return `${ctx.role} is a read-only role: inline code may not create links.`;
    for (const p of site.paths) if (!inWriteRoots(p, ctx)) return `${ctx.role} is a read-only role: inline code may only write to literal paths under the temp dir.`;
  }
  return null;
}
const inWriteRoots = (p, ctx) => { const a = p === null ? null : resolveIn(ctx, p); return !!a && ctx.writeRoots.some((r) => within(real(a), r)) && !hardLinked(a); };

// patch writes under -d DIR (or the cwd), or to -o FILE; it refuses absolute and ../ names on its own.
function patchTargets(words) {
  const args = words.slice(1); const out = [];
  for (let k = 0; k < args.length; k++) {
    const a = args[k];
    if (a === '-d' || a === '--directory' || a === '-o' || a === '--output') out.push(args[++k] ?? '');
    else if (/^--(directory|output)=/.test(a)) out.push(a.slice(a.indexOf('=') + 1));
    else if (/^-[do]./.test(a)) out.push(a.slice(2));
  }
  if (!args.some((a) => /^(-d|--directory)/.test(a))) out.push('.');
  return out;
}
// Archive tools write wherever they unpack (tar -x, unzip, cpio -i) or the archive they create (tar -c -f FILE).
const ARCHIVERS = /^(tar|gtar|bsdtar|unzip|cpio)$/;
function archiveTargets(prog, words) {
  const args = words.slice(1);
  const valueOf = (short, long) => { // -C dir, -Cdir, --directory=dir, --directory dir
    for (let k = 0; k < args.length; k++) {
      const a = args[k];
      if (long && a.startsWith(`${long}=`)) return a.slice(long.length + 1);
      if (a === long || (short && a === short) || (short && isShortCluster(a) && a.endsWith(short.slice(1)) && prog !== 'unzip')) return args[k + 1] ?? '';
      if (short && a.startsWith(short) && a.length > short.length && !isShortCluster(a)) return a.slice(short.length);
    }
    return null;
  };
  if (prog === 'unzip') return args.some((a) => /^-[ltvZp]/.test(a)) ? [] : [valueOf('-d', null) ?? '.'];
  const clusters = args.filter((a) => isShortCluster(a)).map((a) => a.slice(1)).join('') + (prog !== 'cpio' && /^[A-Za-z]+$/.test(args[0] ?? '') ? args[0] : '');
  if (prog === 'cpio') {
    if (/p/.test(clusters) || args.includes('--pass-through')) return [args.filter((a) => !a.startsWith('-')).pop() ?? ''];
    return /i/.test(clusters) || args.includes('--extract') ? [valueOf('-D', '--directory') ?? '.'] : [];
  }
  const extract = /x/.test(clusters) || args.some((a) => /^--(extract|get)$/.test(a));
  const create = /[crA]/.test(clusters.replace(/C/g, '')) || args.some((a) => /^--(create|append|update|concatenate|catenate|delete)$/.test(a));
  if ((extract || create) && (/P/.test(clusters) || args.includes('--absolute-names'))) return null;
  const out = [];
  if (extract) out.push(valueOf('-C', '--directory') ?? '.');
  if (create) { const f = valueOf('-f', '--file') ?? (/^[A-Za-z]*f[A-Za-z]*$/.test(args[0] ?? '') ? args[1] : null); if (f && f !== '-') out.push(f); }
  return out;
}

// ---------- command walker ----------
function stripWrappers(words) {
  let w = words.slice(); const assigns = []; const via = { xargs: false, vals: {} };
  const note = (a) => { const n = a.split('=')[0]; assigns.push(n); via.vals[n] = a.slice(n.length + 1); };
  for (;;) {
    while (w.length && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(w[0]) || LEADING_KEYWORDS.has(w[0]))) { if (/=/.test(w[0])) note(w[0]); w.shift(); }
    if (!w.length) return { words: w, assigns, via };
    const name = path.basename(w[0]);
    const spec = WRAPPERS[name];
    if (!spec) return { words: w, assigns, via };
    if (name === 'xargs') via.xargs = true;
    let k = 1; let respliced = false;
    while (k < w.length) {
      if (name === 'env' && (w[k] === '-S' || w[k] === '--split-string')) { w = [...(w[k + 1] ?? '').split(/\s+/).filter(Boolean), ...w.slice(k + 2)]; respliced = true; break; }
      if (spec.has(w[k])) k += 2;
      else if (w[k].startsWith('-') && w[k] !== '--') k++;
      else if (w[k] === '--') { k++; break; }
      else if (name === 'env' && /^[A-Za-z_][A-Za-z0-9_]*=/.test(w[k])) { note(w[k]); k++; }
      else if (name === 'timeout' && /^\d/.test(w[k])) k++;
      else break;
    }
    if (!respliced) w = w.slice(k);
  }
}

const WRITE_VERBS = {
  tee: (a) => a, rm: (a) => a, unlink: (a) => a, shred: (a) => a, truncate: (a) => a, ln: (a) => a, mv: (a) => a, ditto: (a) => a.slice(-1),
  cp: (a) => a.slice(-1), install: (a) => a.slice(-1), rsync: (a) => a.slice(-1), scp: (a) => a.slice(-1),
};
function writeTargets(prog, words) {
  const args = words.slice(1); const pos = args.filter((a) => !a.startsWith('-'));
  const out = [];
  for (let k = 0; k < args.length; k++) { // -t DIR / --target-directory=DIR / -o FILE / -O FILE / of=
    const a = args[k];
    if ((a === '-t' || a === '--target-directory') && args[k + 1]) out.push(args[k + 1]);
    else if (a.startsWith('--target-directory=')) out.push(a.split('=')[1]);
    else if (['-o', '--output', '-O'].includes(a) && ['curl', 'wget'].includes(prog) && args[k + 1]) out.push(args[k + 1]);
    else if (/^of=/.test(a)) out.push(a.slice(3));
  }
  if (WRITE_VERBS[prog]) out.push(...WRITE_VERBS[prog](pos));
  if (/^(sed|gsed|perl|ruby)$/.test(prog) && args.some((a) => /^-[A-Za-z]*i/.test(a) || a === '--in-place' || a.startsWith('--in-place'))) out.push(...pos);
  return out;
}
// Extra write targets for read-only roles only (builders create files and folders all day).
const VALUE_OPTS = { touch: new Set(['-t', '-d', '-r', '--date', '--reference']), mkdir: new Set(['-m', '--mode']) };
function roleWriteTargets(prog, words) {
  const args = words.slice(1); const out = [];
  if (prog === 'touch' || prog === 'mkdir') {
    for (let k = 0; k < args.length; k++) { if (VALUE_OPTS[prog].has(args[k])) k++; else if (!args[k].startsWith('-')) out.push(args[k]); }
  }
  for (let k = 0; k < args.length; k++) { // --output=FILE / --output FILE on any program (git diff, curl, ...), sort -o FILE
    const a = args[k];
    if (a.startsWith('--output=')) out.push(a.slice(9));
    else if (a === '--output' || (prog === 'sort' && a === '-o')) out.push(args[k + 1] ?? '');
    else if (prog === 'sort' && /^-o./.test(a)) out.push(a.slice(2));
  }
  return out;
}
// awk writes with print > "file", and runs programs with system() or "cmd" | getline.
const AWK_WRITES = /\b(?:print|printf)\b[^;}]*>|\bsystem\s*\(|\|\s*getline|\bfflush\s*\(\s*"/;

function scanWords(inputWords, ctx, viaIn, depth) {
  const { words, assigns, via } = stripWrappers(inputWords);
  if (viaIn?.xargs) via.xargs = true;
  via.assigns = assigns;
  const env = checkAssigns(Object.entries(via.vals), ctx, depth);
  if (env) return env;
  if (!words.length) return null;
  if (assigns.some((n) => /^GIT_CONFIG(_COUNT|_KEY_\d+|_VALUE_\d+|_GLOBAL|_SYSTEM|_PARAMETERS)$/.test(n))) return 'GIT_CONFIG_* environment overrides are blocked: they can hide a push to main.';
  const prog = path.basename(words[0]);
  if (/^(export|declare|typeset|readonly|local)$/.test(prog)) {
    const r = checkAssigns(words.slice(1).filter((a) => /^[A-Za-z_]\w*=/.test(a)).map((a) => [a.split('=')[0], a.slice(a.indexOf('=') + 1)]), ctx, depth);
    if (r) return r;
  }
  if (via.xargs && words.some((x) => /(^|\/)gh$/.test(x) || /\bgh\s/.test(x))) return 'gh behind xargs takes its arguments from stdin, which the guard cannot see: blocked.';
  if (/^git-credential-/.test(prog) && words.includes('get')) return 'Reading stored git credentials (git credential fill/get) is blocked for every role.';
  if (prog === 'security' && words.some((x) => /^find-(generic|internet)-password$/.test(x)) && words.some((x) => /github|^gh:/i.test(x))) return 'Reading the GitHub token from the keychain is blocked for every role.';
  // Programs that run another command: check the command they are given, as a string or as the rest of the words.
  if (LAUNCHERS.has(prog)) {
    const hits = [];
    for (let k = 1; k < words.length; k++) {
      if (/\s/.test(words[k])) hits.push(checkCommands(words[k], ctx, depth + 1));
      else if (CHECKED_PROG(path.basename(words[k]))) hits.push(scanWords(words.slice(k), ctx, via, depth + 1));
      if (typeof hits.at(-1) === 'string') return hits.at(-1);
    }
    for (const h of hits) if (h?.lazy) ctx.pending.push(h.lazy);
    const asked = hits.find((h) => h && !h.lazy); if (asked) return asked;
  }
  if (words[0].startsWith('$') && !words[0].includes('/')) return `Running a program named by a variable (${words[0]}) cannot be verified: blocked.`;
  if (ctx.role && prog === 'patch') return `${ctx.role} is a read-only role: patch changes files.`;
  if (ctx.role) {
    for (const t of roleWriteTargets(prog, words)) { const why = writeTargetReason(t || '.', ctx); if (typeof why === 'string') return why; }
    if (/^[gmn]?awk$/.test(prog) && AWK_WRITES.test(words.slice(1).join(' '))) return `${ctx.role} is a read-only role: awk may not write files or run programs.`;
  }
  // Unpacking and patching write where they are told: every subagent's targets go through the plugin rule too.
  if ((ctx.role || ctx.subagent) && (ARCHIVERS.test(prog) || prog === 'patch')) {
    const targets = prog === 'patch' ? patchTargets(words) : archiveTargets(prog, words);
    if (targets === null && (ctx.role || ctx.pluginRoot)) return `${ctx.role ?? 'A subagent'}: tar with absolute names can write anywhere, so it is blocked.`;
    for (const t of targets ?? []) { const why = writeTargetReason(t || '.', ctx); if (typeof why === 'string') return why; }
  }
  // A script written earlier in the same command and then run hides what it does.
  const runs = (SHELLS.has(prog) || INTERPRETERS.test(prog)) ? words.slice(1).filter((w) => !w.startsWith('-')).slice(0, 1) : (words[0].includes('/') ? [words[0]] : []);
  for (const f of runs) { const a = resolveIn(ctx, f); if (a && (ctx.written.has(a) || ctx.written.has(real(a)))) return 'Writing a script and running it in the same command hides what it does: blocked.'; }
  let r = null;
  if (/projects\.mjs$/.test(words.find((w) => /projects\.mjs$/.test(w)) ?? '') && words.includes('set')) r = ask('Changing a project\'s board/lessons flags is the owner\'s call: confirm.');
  if (SHELLS.has(prog)) {
    const ci = words.findIndex((w, k) => k > 0 && /^-[A-Za-z]*c[A-Za-z]*$/.test(w));
    if (ci !== -1 && words[ci + 1] !== undefined) r = checkCommands(words[ci + 1], ctx, depth + 1);
    else if (!words.slice(1).some((w) => !w.startsWith('-')) || words.includes('-s')) ctx.stdinShell = true;
  } else if (prog === 'eval') r = checkCommands(words.slice(1).join(' '), ctx, depth + 1);
  else if (prog === 'git') r = checkGit(words, ctx, via, depth);
  else if (prog === 'gh') r = checkGh(words, ctx, via);
  else if (/^(curl|wget|http|https|xh|xhs)$/.test(prog)) r = checkHttp(prog, words, ctx);
  else if (prog === 'rm') r = checkRm(words, ctx);
  else if (prog === 'find') r = checkFind(words, ctx, via, depth);
  else if (DOCKERS.has(prog)) r = checkDocker(words, ctx);
  else if (prog === 'alias') r = 'Defining shell aliases is blocked: they hide commands from the guard.';
  else if (INTERPRETERS.test(prog)) {
    const ci = words.findIndex((w, k) => k > 0 && (/^-[A-Za-z]*[ceEpr]$/.test(w) || w === '--eval' || w === '--command' || w === '--print' || (w === 'eval' && prog === 'deno')));
    if (ci !== -1) r = checkInlineCode(words.slice(ci + 1).join(' '), ctx);
  }
  if (typeof r === 'string') return r;
  let result = r;
  if (prog === 'rsync' && words.some((w) => abbrev(w, '--delete', 5) || w === '--remove-source-files')) {
    const dest = words.filter((w) => !w.startsWith('-')).slice(-1);
    const d = checkDeleteTargets(dest, ctx, 'rsync --delete');
    if (typeof d === 'string') return d;
  }
  if (prog === 'mv') { // delete-by-move: moving files into a scratch dir so a later rm -rf looks legal
    const pos = words.slice(1).filter((w) => !w.startsWith('-'));
    const dest = resolveIn(ctx, pos[pos.length - 1] ?? '');
    const intoScratch = dest && ctx.rmRoots.some((root) => within(real(dest), root));
    if (intoScratch && pos.slice(0, -1).some((s) => { const a = resolveIn(ctx, s); return !a || !ctx.rmRoots.some((root) => within(real(a), root)); })) return 'mv of files into a tmp/scratch dir is blocked (it makes a later rm -rf look legal).';
  }
  if (prog === 'ln') { // a link inside scratch can point anywhere
    const pos = words.slice(1).filter((w) => !w.startsWith('-'));
    const linkPath = resolveIn(ctx, pos[pos.length - 1] ?? '');
    if (linkPath && ctx.rmRoots.some((root) => within(real(linkPath), root) || within(linkPath, root))) return 'Creating links inside tmp/scratch dirs is blocked: they defeat the rm -rf check.';
  }
  for (const t of writeTargets(prog, words)) {
    const why = writeTargetReason(t, ctx);
    if (typeof why === 'string') return why;
    if (why) result ??= why;
  }
  return result;
}

function checkCommands(src, ctx, depth = 0) {
  if (depth > 6) return 'Command nesting too deep to verify; blocked.';
  const { commands, nested, heredocs } = tokenize(src);
  let asked = null; // an "ask" is remembered, but a later hard block in the same command wins
  const stack = []; let level = 0;
  const startCwd = ctx.cwd;
  void startCwd;
  for (const cmd of commands) {
    while (level > cmd.depth) { ctx.cwd = stack.pop(); level--; }
    while (level < cmd.depth) { stack.push(ctx.cwd); level++; }
    for (const target of cmd.redirects) {
      const why = writeTargetReason(target, ctx);
      if (typeof why === 'string') return why;
      if (why) asked ??= why;
    }
    const probe = stripWrappers(cmd.words).words;
    const prog = path.basename(probe[0] ?? '');
    if (prog === 'cd' || prog === 'pushd' || prog === 'popd') {
      const arg = probe.slice(1).find((a) => !a.startsWith('-'));
      if (prog === 'popd' || !arg || arg === '-') ctx.cwd = null;
      else ctx.cwd = resolveIn(ctx, arg);
      if (ctx.cwd && CRED_PATH.test(`${ctx.cwd}/`)) return 'The gh and git credential folders are off limits for every role.';
      continue;
    }
    noteGitEnv(cmd.words, ctx);
    const reason = scanWords(cmd.words, ctx, null, depth);
    if (typeof reason === 'string') return reason;
    if (reason?.lazy) ctx.pending.push(reason.lazy);
    else if (reason) asked ??= reason;
  }
  for (const body of nested) {
    const saved = ctx.cwd;
    const r = checkCommands(body, ctx, depth + 1);
    ctx.cwd = saved;
    if (typeof r === 'string') return r;
    if (r) asked ??= r;
  }
  if (depth === 0) {
    if (ctx.stdinShell && RISKY_MENTION.test(src)) return 'A shell fed from a pipe or here-string hides the commands from the guard: blocked.';
    for (const body of heredocs) {
      const interp = /\b(python[\d.]*|node(js)?|perl|ruby|bun|deno|php|osascript|lua)\b/.test(src);
      if (!ctx.stdinShell && !interp) continue;
      if (interp) { const c = checkInlineCode(body, ctx); if (c) return c; }
      const r = checkCommands(body, ctx, depth + 1);
      if (typeof r === 'string') return r;
      if (r) asked ??= r;
    }
    if ((/(^|[\s;&|(])function\s+[\w:.-]+/.test(src) || /[\w:.-]+\s*\(\s*\)\s*\{/.test(src)) && RISKY_MENTION.test(src)) return 'Shell function definitions hide commands from the guard: blocked.';
  }
  return asked;
}

// ---------- secrets in memory files ----------
const PLACEHOLDER = /^(?:<|\$|\{|\[|\(|x{3,}|\.{3}|\*{3}|changeme|example|redacted|your[-_]|placeholder|none|null|true|false|todo)/i;
const SAFE_EMAIL_DOMAINS = /@(?:[\w-]+\.)*(?:example\.(?:com|org|net|invalid)|anthropic\.com|users\.noreply\.github\.com|noreply\.github\.com|localhost)$/i;
const luhn = (digits) => {
  let sum = 0; let dbl = false;
  for (let k = digits.length - 1; k >= 0; k--) { let d = digits.charCodeAt(k) - 48; if (dbl) { d *= 2; if (d > 9) d -= 9; } sum += d; dbl = !dbl; }
  return sum % 10 === 0;
};
const SECRET_PATTERNS = [
  [/\bsk-ant-[A-Za-z0-9_-]{3,}/, 'Anthropic key'],
  [/\bsk-[A-Za-z0-9_-]{16,}/, 'API key'],
  [/\b(?:ghp|gho|ghs|ghu|ghr)_[A-Za-z0-9]{8,}/, 'GitHub token'],
  [/\bgithub_pat_[A-Za-z0-9_]{8,}/, 'GitHub token'],
  [/\bAKIA[0-9A-Z]{16}\b/, 'AWS key'],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}/, 'Slack token'],
  [/\bAIza[0-9A-Za-z_-]{35}\b/, 'Google API key'],
  [/\bdckr_pat_[A-Za-z0-9_-]{10,}/, 'Docker Hub token'],
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/, 'JWT'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'private key'],
  [/\bBearer\s+[A-Za-z0-9._~+/-]{20,}/, 'bearer token'],
  [/\b[a-z][a-z0-9+.-]*:\/\/[^\s:@/]+:[^\s@/]+@/i, 'URL with a password'],
  [/\b[\w.-]{2,}@(?:ok(?:icici|axis|hdfcbank|sbi)|ybl|paytm|apl|ibl|axl|upi|icici|sbi|hdfcbank|axisbank|kotak|fbl|barodampay|ikwik|pingpay|freecharge|jupiter|slice|airtel)\b/i, 'UPI id'],
  // Indian mobile: optional +91 / 91 / 0, then 6-9 and nine more digits, separated by spaces or dashes
  [/(?<![\d])(?:(?:\+?91|0)[\s-]*)?[6-9](?:[\s-]?\d){9}(?![\d])/, 'phone number'],
  [/(?<![\d])(?:(?:\+?91|0)[\s.-]*)?[6-9]\d{4}\.\d{5}(?![\d])|(?<![\d])[6-9]\d{2}\.\d{3}\.\d{4}(?![\d])/, 'phone number'],
  [/(?<![\w.])\+\d{1,3}[\s().-]?\d{2,4}[\s().-]?\d{3,4}[\s.-]?\d{3,4}(?!\d)/, 'phone number'],
];
export function findSecret(text) {
  if (typeof text !== 'string' || !text) return null;
  for (const [re, label] of SECRET_PATTERNS) if (re.test(text)) return label;
  // credential assignments: password: "x y z", api_key=abc..., ignoring placeholders
  const credRe = /\b(?:api[_-]?key|secret|token|passwd|password|pwd|client[_-]?secret|access[_-]?key)\b["']?\s*[:=]\s*["']?([^\s"']{6,})/gi;
  for (let m = credRe.exec(text); m; m = credRe.exec(text)) if (!PLACEHOLDER.test(m[1]) && (m[1].length >= 16 || /\d/.test(m[1]) || /^["']/.test(m[0].slice(-m[1].length - 1)) || /password|passwd|pwd/i.test(m[0]))) return 'credential assignment';
  // The domain must end in a letters-only TLD and not start like a version (digits.digits), so package
  // specs (react@18.3.1, x@1.0.0-canary.beta) and IPs pass. A scp-style `git@host:path` remote is not personal.
  const mail = /\b[\w.+-]+@(?!\d+\.\d)[\w-]+(?:\.[\w-]+)*\.[A-Za-z]{2,}\b/g;
  const gitRemote = (m) => m[0].startsWith('git@') && text[m.index + m[0].length] === ':' && !/[\w.+-]/.test(text[m.index - 1] ?? '');
  for (let m = mail.exec(text); m; m = mail.exec(text)) if (!SAFE_EMAIL_DOMAINS.test(m[0]) && !gitRemote(m)) return 'email address';
  const cards = /(?<![\d])\d(?:[ -]?\d){12,18}(?![\d])/g;
  for (let m = cards.exec(text); m; m = cards.exec(text)) {
    const digits = m[0].replace(/\D/g, '');
    if (digits.length >= 13 && digits.length <= 19 && /^[2-689]/.test(digits) && luhn(digits)) return 'card number';
  }
  return null;
}

function applyEdits(file, input) {
  let base = '';
  try { if (fs.statSync(file).size < 2_000_000) base = fs.readFileSync(file, 'utf8'); } catch { /* new file */ }
  const apply = (text, e) => (typeof e?.old_string === 'string' && e.old_string ? (e.replace_all ? text.split(e.old_string).join(e.new_string ?? '') : text.replace(e.old_string, () => e.new_string ?? '')) : text);
  if (typeof input.content === 'string') return input.content;
  if (Array.isArray(input.edits)) return input.edits.reduce(apply, base);
  if (typeof input.new_string === 'string') return apply(base, input);
  return typeof input.new_source === 'string' ? input.new_source : '';
}

function checkFileEdit(input, ctx) {
  const target = input.file_path ?? input.notebook_path;
  if (typeof target !== 'string' || !target) return null;
  const abs = resolveIn(ctx, target) ?? path.resolve(ctx.cwd ?? '.', target);
  const r = real(abs);
  // Checked before the ~/.claude/plugins rule: the data folder usually sits under it.
  const hb = handbackRule(target, abs, r, ctx);
  if (hb === HANDBACK_OWN) return ctx.isWrite || ctx.isEdit ? livePluginRule(r, ctx) ?? livePluginRule(abs, ctx) : `${ctx.crew}: hand-back files take Write or Edit only.`;
  if (hb) return hb;
  const why = protectedPathReason(r, ctx) ?? protectedPathReason(abs, ctx);
  if (why) return `${why} cannot be edited by Claude: the owner changes them by hand.`;
  const live = livePluginRule(r, ctx) ?? livePluginRule(abs, ctx);
  if (live) return live;
  if (ctx.role) { // read-only roles: Edit only on their style files; Write only there, to their own memory file, docs or temp
    const style = roleStyleTarget(r, ctx);
    if (!ctx.isWrite && !(ctx.isEdit && style)) return `${ctx.role} is a read-only role: it cannot use Edit/MultiEdit/NotebookEdit${ROLE_STYLE_FILES[ctx.role] ? ' outside its style and visual files' : ''}.`;
    // Own memory is this project's (or this checkout's) file only, not ~/.claude; a MEMORY.md symlink resolves away from it.
    const ownMemory = [ctx.project, roleRoot(ctx)].some((root) => r.toLowerCase() === path.join(real(path.join(root, '.claude/agent-memory', `toon-crew-${ctx.role}`)), 'MEMORY.md').toLowerCase());
    if (hardLinked(r)) return `${ctx.role} is a read-only role: the target has other hard links, so writing it would change another file.`;
    const docRoots = (ROLE_DOC_DIRS[ctx.role] ?? []).map((d) => path.join(ctx.project, d));
    // The target is realpath-resolved, the root is not: a symlinked docs/ or docs/research lands outside the root.
    const inDocs = docRoots.some((root) => within(r, root));
    if (!ownMemory && !inDocs && !style && !ctx.writeRoots.some((root) => within(r, root))) {
      const where = [...docRoots.map((d) => path.relative(ctx.project, d) + '/'), ...(ROLE_STYLE_FILES[ctx.role] ? ['style and visual files (css, scss, less, svg, images, tokens/theme data, docs/design/)'] : []), `.claude/agent-memory/toon-crew-${ctx.role}/MEMORY.md`, 'the temp dir'];
      return `${ctx.role} is a read-only role: Write is allowed only to ${where.join(', ')}.`;
    }
    if (inDocs || style?.doc) for (const p of newTexts(r, input)) { const hit = findSecret(p); if (hit) return `Documents must not hold secrets: ${hit} pattern found in the new content. Remove it and retry.`; }
  }
  const soft = crewConfigAsk(r) ?? crewConfigAsk(abs);
  if (soft) return soft;
  if (isMemoryPath(r) && r.toLowerCase().endsWith('.md')) {
    for (const p of newTexts(r, input)) { const hit = findSecret(p); if (hit) return `Memory files must not hold secrets: ${hit} pattern found in the new content. Remove it and retry.`; }
  }
  return null;
}
// The file after the edit, and each new piece of text the call brings.
const newTexts = (file, input) => [applyEdits(file, input), input.content, input.new_string, input.new_source, ...(Array.isArray(input.edits) ? input.edits.map((e) => e?.new_string) : [])];
// A role's own checkout: the git checkout holding the session cwd (its worktree) when that sits inside the project, else the project.
const roleRoot = (ctx) => { const c = checkoutOf(real(ctx.startCwd)); return c && (c === ctx.project || within(c, ctx.project)) ? c : ctx.project; };
// A style or visual file the role may Edit or Write: realpath inside its checkout, no denied folder, an allowed type or folder.
// Returns { doc } (docs get the secret scan) or null. SVG and CSS skip the scan: path data trips the phone pattern.
function roleStyleTarget(r, ctx) {
  const rule = ROLE_STYLE_FILES[ctx.role];
  const root = rule ? roleRoot(ctx) : null;
  if (!root || !within(r, root)) return null;
  const rel = path.relative(root, r).split(path.sep).join('/');
  if (rel.split('/').some((part) => STYLE_DENY_PART.test(part)) || /\.(test|spec|stories)\.[^/]+$/i.test(rel)) return null;
  if (rule.files.test(rel)) return { doc: false };
  return rule.dirs.some((d) => rel.toLowerCase().startsWith(`${d}/`)) ? { doc: true } : null;
}

// ---------- hand-back files ----------
// <CLAUDE_PLUGIN_DATA>/projects/<key>/handbacks/(full|summaries)/<crew id>/<name>.md is the only place under the
// data folder a crew role may write (read-only roles too). Everything else there (events.jsonl, limits.json,
// projects.json) stays hook-only. Without CLAUDE_PLUGIN_DATA nothing new is allowed.
const HANDBACK_REL = /^projects\/[a-z0-9-]{1,60}\/handbacks\/(?:full|summaries)\/([a-z0-9-]{1,40})\/[a-z0-9-]{1,60}\.md$/;
const HANDBACK_OWN = Symbol('own hand-back');
// Case-folded on purpose: a refusal must not be dodged by spelling the folder differently on a case-insensitive disk.
const inDataDir = (p, ctx) => ctx.dataDirs.some((d) => { const a = p.toLowerCase(); const b = d.toLowerCase(); return a === b || within(a, b); });
// Returns null (not in the data folder, or not a crew role), HANDBACK_OWN, or a refusal.
function handbackRule(raw, abs, r, ctx) {
  if (ctx.crew === null || !ctx.dataDirs || !(inDataDir(abs, ctx) || inDataDir(r, ctx))) return null;
  const id = ctx.crew;
  const deny = `${id || 'this crew role'}: in the plugin data folder a crew role may write only .md files in its own handbacks/full/${id || '<id>'}/ and handbacks/summaries/${id || '<id>'}/ folders.`;
  if (!id || raw.split(/[\\/]/).includes('..')) return deny;
  const base = ctx.dataDirs.find((d) => within(abs, d)); // exact case: the allow side never folds
  if (!base) return deny; // reached through a link from outside the data folder
  const rel = path.relative(base, abs).split(path.sep).join('/');
  const m = HANDBACK_REL.exec(rel);
  if (!m || m[1] !== id) return deny;
  // No link anywhere below the data folder, checked per part with lstat: realpath misses a link that points
  // inside the folder, and a dangling one (it falls back to the parent). A hard-linked file would change another name.
  let p = base;
  for (const part of rel.split('/')) { p = path.join(p, part); if (isSymlink(p)) return deny; }
  return hardLinked(r) ? deny : HANDBACK_OWN;
}

// ---------- the data folder from a crew role's shell ----------
// From Bash or Monitor a crew role (not Doraemon) may only read the data folder: hand-back files go in through
// Write/Edit, where handbackRule checks them. A command line that names the folder is refused unless every
// command on it is a plain read. Naming it: CLAUDE_PLUGIN_DATA in any spelling, the folder's path or real path
// (also as ~/ or $HOME/, glued to an option like -C/path), or any word or path piece that resolves into it
// from the tracked current folder.
// Text-based like the rest: a path built at run time (printf, base64) is not seen.
const PLAIN_READS = new Set(['cat', 'head', 'tail', 'ls', 'grep', 'wc']);
const DATA_VAR = /CLAUDE_PLUGIN_DATA/;
const PATH_PIECES = /[\s'"`,;()[\]{}=<>|&:]+/;
function dataForms(ctx) {
  const home = os.homedir(); const forms = new Set();
  for (const d of ctx.dataDirs ?? []) {
    forms.add(d);
    if (within(d, home)) { const rel = path.relative(home, d); for (const h of ['~', '$HOME', '${HOME}']) forms.add(`${h}/${rel}`); }
  }
  return [...forms].map((f) => f.toLowerCase());
}
// The form followed by the end or a path separator: /data-2 is another folder, /data/x and /data are not.
const namesForm = (text, forms) => { const t = text.toLowerCase(); return forms.some((f) => { for (let i = t.indexOf(f); i !== -1; i = t.indexOf(f, i + 1)) if (!/[\w.-]/.test(t[i + f.length] ?? '')) return true; return false; }); };
function dataShellRule(src, ctx) {
  const forms = dataForms(ctx); const seen = new Map(); const all = []; let names = DATA_VAR.test(src);
  const resolves = (piece, cwd) => {
    const abs = ctx.dataDirs ? resolveIn({ ...ctx, cwd }, piece) : null;
    if (!abs) return false;
    if (inDataDir(abs, ctx)) return true; // fast path; the real-path check below would find it too
    if (!seen.has(abs)) seen.set(abs, inDataDir(real(abs), ctx)); // links from elsewhere into the folder
    return seen.get(abs);
  };
  const touches = (word, cwd) => DATA_VAR.test(word) || namesForm(word, forms)
    || [word, ...word.split(PATH_PIECES)].some((p) => p && resolves(p, cwd));
  const walk = (text, startCwd, depth) => {
    if (depth > 6 || Date.now() > ctx.deadline) return false;
    const { commands, nested, heredocs } = tokenize(text);
    let cwd = startCwd; const stack = []; let level = 0;
    for (const cmd of commands) {
      while (level > cmd.depth) { cwd = stack.pop(); level--; }
      while (level < cmd.depth) { stack.push(cwd); level++; }
      all.push(cmd);
      if (!names && [...cmd.words, ...cmd.redirects].some((w) => touches(w, cwd))) names = true;
      const prog = cmd.words[0];
      if (prog === 'cd' || prog === 'pushd' || prog === 'popd') {
        const arg = cmd.words.slice(1).find((a) => !a.startsWith('-'));
        cwd = prog === 'popd' || !arg || arg === '-' ? null : resolveIn({ ...ctx, cwd }, arg);
      }
    }
    for (const body of heredocs) if (!names && body.split(PATH_PIECES).some((p) => p && resolves(p, startCwd))) names = true;
    for (const body of nested) if (!walk(body, startCwd, depth + 1)) return false;
    return true;
  };
  const who = ctx.crew || 'this crew role';
  // Fails closed: a walk cut short (too deep, out of time) may not have reached the part that names the folder.
  if (!walk(src, ctx.cwd, 0)) return `${who}: this command is too complex to check against the plugin data folder; blocked.`;
  if (!names) return null;
  const plain = (cmd) => PLAIN_READS.has(cmd.words[0] ?? '') && cmd.redirects.every((r) => r === '/dev/null');
  return all.every(plain) ? null
    : `${who}: from Bash a crew role may only read the plugin data folder (cat, head, tail, ls, grep or wc, with no redirection or other command on the line). Write hand-back files with the Write tool.`;
}

// ---------- Agent (spawning) and relay tools ----------
const crewId = (name) => (/^(?:toon-crew:)?([a-z0-9-]+)$/i.exec(name)?.[1] ?? '').toLowerCase();
// Any toon-crew: agent counts as crew, so a role added later is limited until it is listed in CREW.
const crewCaller = (input) => {
  const caller = typeof input.agent_type === 'string' ? input.agent_type : '';
  if (!caller || (!/^toon-crew:/i.test(caller) && !CREW.has(crewId(caller)))) return null; // main thread or not crew
  return { id: crewId(caller) };
};
function checkSpawn(input) {
  const caller = crewCaller(input);
  if (!caller || caller.id === 'doraemon') return null;
  const { id } = caller;
  const allowed = SPAWN_LIMITS[id];
  if (!allowed) return `${id || 'this crew role'} may not start other agents: only Doraemon spawns crew (Dekisugi: olaf or stuart).`;
  const raw = input.tool_input?.subagent_type;
  if (raw !== undefined && typeof raw !== 'string') return `${id} may start only named agents: subagent_type is not a string.`;
  const target = raw ?? '';
  // Plugin-scoped names only: a bare "olaf" could resolve to a project agent of the same name with more tools.
  if (/^toon-crew:/i.test(target) && allowed.has(crewId(target))) return null;
  return `${id} may start only ${[...allowed].map((a) => `toon-crew:${a}`).join(' or ')} (asked for ${target ? JSON.stringify(target.slice(0, 60)) : 'the default agent'}).`;
}
function checkRelay(input, tool) {
  const caller = crewCaller(input);
  if (!caller || caller.id === 'doraemon') return null;
  return `${caller.id || 'this crew role'} may not use ${tool}: only Doraemon messages, schedules or triggers other sessions.`;
}

// ---------- entry ----------
export function evaluate(input, env = process.env) {
  const cwd = typeof input.cwd === 'string' && input.cwd ? input.cwd : process.cwd();
  const project = real(env.CLAUDE_PROJECT_DIR || cwd);
  const sys = [os.tmpdir(), '/tmp', '/private/tmp', '/var/tmp'].map((r) => real(r));
  // When the project itself lives inside a system temp dir, that temp dir is no longer a safe place to delete in.
  const sysRoots = [...new Set(sys)].filter((r) => !(project === r || within(project, r)));
  const projRoots = ['tmp', '.tmp', 'scratch', '.scratch'].map((d) => path.join(project, d)).filter((p) => !isSymlink(p) && (isDir(p) || !fs.existsSync(p)));
  const roots = [...sysRoots, ...projRoots];
  if (typeof input.scratchpad_dir === 'string' && input.scratchpad_dir && !isSymlink(input.scratchpad_dir)) roots.push(real(input.scratchpad_dir));
  const pluginRoot = env.CLAUDE_PLUGIN_ROOT ? real(env.CLAUDE_PLUGIN_ROOT) : null;
  // The data folder as given and as its real path; unset or relative means no hand-back allowance (fail closed).
  const data = typeof env.CLAUDE_PLUGIN_DATA === 'string' && path.isAbsolute(env.CLAUDE_PLUGIN_DATA) ? path.resolve(env.CLAUDE_PLUGIN_DATA) : null;
  const caller = crewCaller(input);
  const ctx = { crew: caller && caller.id !== 'doraemon' ? caller.id : null, dataDirs: data ? [data, real(data)] : null, cwd, startCwd: cwd, gitEnv: false, project, pluginRoot, rmRoots: roots, cache: new Map(), pending: [], deadline: Date.now() + BUDGET_MS, km: /(^|:)miguel-rivera$/i.test(String(input.agent_type ?? '')), devops: DEVOPS.test(String(input.agent_type ?? '')), stdinShell: false, written: new Set(),
    role: (READ_ONLY_ROLES.exec(String(input.agent_type ?? '')) ?? [])[1]?.toLowerCase() ?? null,
    // agent_id marks a subagent; agent_type alone is also set for `claude --agent`, the main thread when it is Doraemon.
    subagent: !!input.agent_id || (!!input.agent_type && crewId(String(input.agent_type)) !== 'doraemon'), isWrite: String(input.tool_name) === 'Write', isEdit: ['Edit', 'MultiEdit'].includes(String(input.tool_name)), writeRoots: [...new Set([...sys, ...(typeof input.scratchpad_dir === 'string' && input.scratchpad_dir ? [real(input.scratchpad_dir)] : [])])] };
  const tool = String(input.tool_name ?? '');
  const ti = input.tool_input ?? {};
  if (tool === 'Agent' || tool === 'Task') { const r = checkSpawn(input); return r ? { deny: r } : null; }
  if (RELAY_TOOLS.has(tool)) { const r = checkRelay(input, tool); return r ? { deny: r } : null; }
  // Monitor runs its command in the same shell as Bash (a ws watch has no command and no shell).
  if (tool === 'Bash' || tool === 'Monitor') {
    if (ti.command !== undefined && typeof ti.command !== 'string') return { deny: `${tool} command is not a string; blocked.` };
    const cmd = typeof ti.command === 'string' ? ti.command : '';
    if (cmd.length > MAX_COMMAND) return { deny: 'Command too long to verify; blocked.' };
    if (CRED_TEXT.test(cmd)) return { deny: 'Reading the gh hosts file or git credentials is blocked for every role.' };
    if (ctx.crew !== null) { const d = dataShellRule(cmd, ctx); if (d) return { deny: d }; }
    let result = checkCommands(cmd, ctx);
    if (typeof result === 'string') return { deny: result };
    for (const lazy of ctx.pending) { // git lookups run only after every pure check has passed
      const r = lazy();
      if (typeof r === 'string') return { deny: r };
      if (r) result ??= r;
    }
    return result;
  }
  if (['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(tool)) { const r = checkFileEdit(ti, ctx); return typeof r === 'string' ? { deny: r } : r; }
  if (tool === 'Read' || tool === 'Grep' || tool === 'Glob') {
    const home = os.homedir();
    const given = [ti.file_path, ti.path, ti.notebook_path].filter((x) => typeof x === 'string' && x);
    for (const p of tool === 'Grep' && !given.length ? [cwd] : given) {
      const abs = path.resolve(cwd, p.replace(/^~(?=\/|$)/, home));
      // A content search rooted above the credential files would read them too.
      const above = tool === 'Grep' && [path.join(home, '.config/gh'), path.join(home, '.git-credentials')].some((c) => c === abs || within(c, abs));
      if (CRED_PATH.test(abs) || CRED_PATH.test(real(abs)) || CRED_PATH.test(`${abs}/`) || above) return { deny: 'Reading the gh hosts file or git credentials is blocked for every role.' };
    }
    return null;
  }
  if (tool.startsWith('mcp__')) {
    const name = tool.slice(tool.lastIndexOf('__') + 2).toLowerCase();
    const gate = (r) => (typeof r === 'string' ? { deny: r } : r);
    if (/auto.?merge/.test(name)) return { deny: AUTO_MERGE_DENY };
    if (/review/.test(name) && /APPROVE/i.test(JSON.stringify(ti))) return gate(devopsGate(ctx, 'PR approvals'));
    if (/merge/.test(name)) return gate(mergeGate(ctx, { pr: String(ti.pull_number ?? ti.pullNumber ?? ''), repo: typeof ti.owner === 'string' && typeof ti.repo === 'string' ? `${ti.owner}/${ti.repo}` : '' }));
    // A file write with no branch lands on the default branch: treat it as a push to main.
    if (/(create_or_update_file|push_files|delete_file|create_file|update_file|write_file|commit)/.test(name)) {
      const br = typeof ti.branch === 'string' ? ti.branch : '';
      if (!br || isProtectedRef(br)) return gate(pushGate(ctx));
    }
    if (/(merge|push|delete|destroy|drop|force|remove|wipe)/.test(name)) return ask(`MCP tool ${tool} can change or delete remote data: confirm.`);
  }
  return null;
}

// Every way out of main() that is not an explicit allow blocks: exit 1 is non-blocking in Claude Code.
const block = (why) => { console.error(`toon-crew guard: ${why}`); process.exitCode = 2; };
async function main() {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  let input;
  try { input = JSON.parse(raw); } catch { return block('unreadable hook input; blocked to be safe.'); }
  if (!input || typeof input !== 'object' || Array.isArray(input)) return block('hook input is not a JSON object; blocked to be safe.');
  let result;
  try { result = evaluate(input); } catch (e) {
    return block(`internal error (${String(e?.message ?? e).split('\n')[0].slice(0, 200)}); blocked to be safe.`);
  }
  if (result?.deny) return block(result.deny);
  if (result?.ask) {
    console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask', permissionDecisionReason: `toon-crew guard: ${result.ask}` } }));
  }
}

// Run main() only when executed as a script. Compare real paths: Node resolves symlinks for import.meta.url
// but not for argv[1], and keeps a doubled slash, so a plain string comparison silently skipped every check.
function isEntry() {
  try { return !!process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url)); } catch { return true; }
}
if (isEntry()) await main().catch((e) => block(`could not run (${String(e?.message ?? e).split('\n')[0].slice(0, 200)}); blocked to be safe.`));
