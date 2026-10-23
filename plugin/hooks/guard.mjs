// toon-crew safety guard: a PreToolUse hook. Dependency-free (Node built-ins only).
// Reads the hook JSON on stdin. Hard blocks: one-line reason on stderr, exit 2 ("deny").
// Merges and pushes to main/master are "ask": exit 0 with hookSpecificOutput.permissionDecision "ask",
// so Claude Code shows the owner its own approval prompt. Otherwise exit 0 allows.
//
// This is a text guard: a seatbelt against mistakes and lazy bypasses, NOT a sandbox. The real boundary
// is each agent's tool list. When the guard cannot parse something that touches git/gh/rm/docker/settings
// it fails closed (deny) rather than open.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROTECTED = new Set(['main', 'master']);
const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh']);
const DOCKERS = new Set(['docker', 'docker-compose', 'podman', 'podman-compose']);
const INTERPRETERS = /^(python[\d.]*|node(js)?|bun|deno|perl|ruby|php|osascript|lua|rscript|pwsh|powershell)$/i;
const MAX_COMMAND = 100_000;
const BUDGET_MS = 6000; // well under the 10 s hook timeout
// Roles without write tools by design: they may only write their own memory file and temp files.
const ROLE_GIT_BLOCKED = new Set(['reset', 'checkout', 'switch', 'restore', 'apply', 'am', 'stash', 'clean', 'commit', 'merge', 'rebase', 'cherry-pick', 'revert', 'pull', 'rm', 'mv', 'add']);
// Where a read-only role may Write its deliverables inside the project (besides its memory file and temp).
const ROLE_DOC_DIRS = { dekisugi: ['docs/research'], olaf: ['docs/research'], nobita: ['docs/design', 'docs/research'] };
const READ_ONLY_ROLES = /^(?:toon-crew:)?(ninja-hattori|joe-gardner|twenty-two|nobita|dekisugi|olaf|stuart)$/i;
const CREW_REPO = 'amanpatil808/claude-crew';

// Words that can sit in front of the real program: name -> options that take a value.
const WRAPPERS = {
  env: new Set(['-u', '-C', '--unset', '--chdir']),
  command: new Set(), builtin: new Set(), exec: new Set(['-a']), nohup: new Set(), time: new Set(['-f', '-o']),
  nice: new Set(['-n']), ionice: new Set(['-c', '-n']), stdbuf: new Set(['-i', '-o', '-e']), setsid: new Set(),
  caffeinate: new Set(['-t']), sudo: new Set(['-u', '-g', '-h', '-p', '-C', '-D', '-R', '-T']), doas: new Set(['-u', '-C']),
  xargs: new Set(['-I', '-n', '-P', '-L', '-s', '-d', '-E', '-a']), timeout: new Set(['-s', '-k']),
};
const LEADING_KEYWORDS = new Set(['!', 'if', 'then', 'else', 'elif', 'do', 'while', 'until', '{', '}', 'fi', 'done']);
const RISKY_MENTION = /\b(git|gh|rm|docker|podman|find|rsync|curl|wget|dd|mv|ln|shred|unlink)\b|\.claude|\.mcp|agent-memory|\.git\//;

const PUSH_ASK = 'Pushing to main/master deploys to production: confirm.';
const MERGE_ASK = 'Merging deploys to production: confirm.';
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
  if (ctx.role && !/^\/dev\/(null|stdout|stderr)$/.test(raw)) {
    const abs = resolveIn(ctx, raw);
    if (!abs || !ctx.writeRoots.some((r) => within(real(abs), r))) return `${ctx.role} is a read-only role: shell writes are allowed only under the system temp dir or the session scratchpad.`;
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
    if (ctx.pluginRoot?.includes('/.claude/plugins/')) probe.push(path.join(ctx.pluginRoot, 'hooks/guard.mjs'), path.join(ctx.pluginRoot, 'hooks/hooks.json'));
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
const DANGEROUS_CFG = /^(alias\.|remote\..*\.(push|pushurl)$|push\.|core\.(sshcommand|fsmonitor)$|url\..*\.(insteadof|pushinsteadof)$|include(if\..*)?\.path$|credential\.)/i;
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

function checkGit(words, ctx, via, depth) {
  let i = 1; let dir = ctx.cwd; const cfgs = []; let hookAsk = null; let gitDirUsed = (via.assigns ?? []).some((n) => /^GIT_(DIR|WORK_TREE)$/.test(n));
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
    if (DANGEROUS_CFG.test(key)) return `git -c ${key} is blocked: aliases and push settings can hide a push to main.`;
    if (/^core\.hookspath$/i.test(key)) hookAsk = ask('core.hooksPath runs scripts from another folder on every git command: confirm.');
  }
  let sub = words[i];
  if (!sub) return null;
  const rest = words.slice(i + 1);
  // An alternate git dir (--git-dir, --work-tree, GIT_DIR, GIT_WORK_TREE) hides its config and aliases from the checks.
  if (gitDirUsed && (sub === 'push' || !GIT_BUILTINS.has(sub))) return 'git push or an unknown git subcommand with --git-dir/--work-tree/GIT_DIR is blocked: its config and aliases cannot be verified.';
  if (ctx.role && ROLE_GIT_BLOCKED.has(sub)) return `${ctx.role} is a read-only role: git ${sub} changes the working tree or history.`;
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
    const reading = rest.some((a) => /^--(get|list|show|name-only)/.test(a) || a === '-l');
    if (rest.some((a) => a === '-e' || a === '--edit')) return 'git config --edit is blocked: it opens protected config files.';
    if (!reading && pos.length >= 1 && DANGEROUS_CFG.test(pos[0])) return `git config ${pos[0]} is blocked: aliases and push settings can hide a push to main.`;
    if (!reading && pos.length >= 2 && /^core\.hookspath$/i.test(pos[0])) return ask('core.hooksPath runs scripts from another folder on every git command: confirm.');
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
    else if (isProtectedRef(dst)) return ask(PUSH_ASK);
  }
  if (via.xargs) return ask(PUSH_ASK); // the refspec arrives on stdin: cannot be verified
  if (refspecs.length === 0 && !tagsOnly) needsLookup.push('bare');
  if (needsLookup.length) {
    return { lazy: () => {
      const info = gitInfo(dir, ctx);
      if (info.unknown) return ask('Could not verify which branch this push updates: confirm.');
      if (info.notRepo) return null;
      if (isProtectedRef(info.branch)) return ask(PUSH_ASK);
      if (needsLookup.includes('bare')) {
        const rules = remotePushRules(dir, remote ?? 'origin', ctx);
        if (rules === null) return ask('Could not verify the remote push rules: confirm.');
        for (const rule of rules) {
          if (rule.startsWith('+')) return `remote.${remote ?? 'origin'}.push holds a +refspec (${rule}): a bare push would force-push. Blocked.`;
          if (isProtectedRef(rule.split(':').pop())) return ask(PUSH_ASK);
        }
        if (info.pushFailed) return ask('Could not verify where a bare push goes (no @{push} target): confirm.');
        if (info.pushDst && isProtectedRef(info.pushDst)) return ask(PUSH_ASK);
      }
      return null;
    } };
  }
  return null;
}

// ---------- gh / GitHub API ----------
const ghRules = (method, endpoint, text) => {
  const ep = endpoint.replace(/^https?:\/\/[^/]+\//, '').replace(/^\/+/, '').replace(/\?.*$/, '');
  if (/graphql/.test(ep) || /\b(mutation|query)\b/.test(text)) {
    if (/\b(deleteRepository|deleteRef|deleteBranchProtectionRule|transferRepository|archiveRepository|updateRef)\b/.test(text)) return 'Deleting or rewriting repo data through the GitHub API is blocked.';
    if (/\b(mergePullRequest|enablePullRequestAutoMerge|mergeBranch)\b/.test(text)) return ask(MERGE_ASK);
  }
  if (method === 'GET') return null;
  if (/^repos\/[^/]+\/[^/]+\/?$/.test(ep)) return 'Deleting or editing a repo through the GitHub API is blocked.';
  if (/git\/refs\/heads\/(main|master)\b/.test(ep) || /git\/refs\/?$/.test(ep) && /\b(main|master)\b/.test(text)) return 'Moving or deleting main/master through the GitHub API is blocked.';
  if (/branches\/[^/]+\/protection/.test(ep)) return 'Changing branch protection through the GitHub API is blocked.';
  if (/\/pulls\/[^/]+\/merge\/?$/.test(ep) || /\/merges\/?$/.test(ep)) return ask(MERGE_ASK);
  return null;
};

function apiMethod(words) {
  let method = null; let hasBody = false; let endpoint = '';
  for (let k = words.indexOf('api') + 1; k < words.length; k++) {
    const a = words[k];
    if (a === '-X' || a === '--method' || a === '--request') { method = (words[++k] ?? '').toUpperCase(); continue; }
    if (/^-X./.test(a)) { method = a.slice(2).toUpperCase(); continue; }
    if (/^--(method|request)=/.test(a)) { method = a.split('=')[1].toUpperCase(); continue; }
    if (['-f', '-F', '--field', '--raw-field', '-d', '--data', '--data-raw', '--data-binary', '--input', '--form', '-H', '--header', '-q', '--jq', '-t', '--template', '--cache', '-R', '--repo', '--hostname', '-u', '--user', '-o', '--output'].includes(a)) {
      if (!['-H', '--header', '-q', '--jq', '-t', '--template', '--cache', '-R', '--repo', '--hostname', '-u', '--user', '-o', '--output'].includes(a)) hasBody = true;
      k++; continue;
    }
    if (a.startsWith('-')) continue;
    if (!endpoint) endpoint = a;
  }
  return { method: method ?? (hasBody ? 'POST' : 'GET'), endpoint };
}

function checkGh(words, ctx) {
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
  if (a === 'alias') return 'gh alias is blocked: aliases hide gh commands from the guard.';
  if (a === 'auth' && (b === 'token' || b === 'refresh' || b === 'setup-git')) return 'Reading or changing GitHub credentials (gh auth token) is blocked.';
  if (a === 'repo' && b === 'delete') return 'gh repo delete is blocked.';
  if (a === 'pr' && b === 'merge') return ctx.km ? 'Miguel Rivera cannot merge pull requests.' : ask(MERGE_ASK);
  if (ctx.km && a === 'pr' && b === 'create') return repoVal === CREW_REPO ? null : `Miguel Rivera may only run: gh pr create -R ${CREW_REPO}.`;
  if (a === 'api') {
    const { method, endpoint } = apiMethod(words);
    if (ctx.km && method !== 'GET') return 'Miguel Rivera may not change GitHub data through gh api.';
    return ghRules(method, endpoint, words.join(' '));
  }
  return null;
}

function checkCurl(words) {
  const text = words.join(' ');
  if (!/github\.com/i.test(text)) return null;
  let method = null; let hasBody = false; const url = words.find((w) => /^https?:\/\//.test(w)) ?? '';
  for (let k = 1; k < words.length; k++) {
    const a = words[k];
    if (a === '-X' || a === '--request') method = (words[++k] ?? '').toUpperCase();
    else if (/^-X./.test(a)) method = a.slice(2).toUpperCase();
    else if (/^--request=/.test(a)) method = a.split('=')[1].toUpperCase();
    else if (/^(-d|--data|--data-raw|--data-binary|--data-urlencode|-F|--form|-T|--upload-file|--json)/.test(a)) hasBody = true;
  }
  return ghRules(method ?? (hasBody ? 'POST' : 'GET'), url, text);
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
function checkInlineCode(code, ctx) {
  const flat = code.replace(/["'\s,[\]()]+/g, ' ');
  if (/\bgit\b.{0,40}\bpush\b/.test(flat)) return 'git push from inline code (python/node/perl -c/-e) is blocked.';
  if (/\bgh\b.{0,40}\b(merge|delete|alias)\b/.test(flat) || /\bgh auth token\b/.test(flat)) return 'gh merge/delete from inline code is blocked.';
  if (/\brmtree\b|\brmSync\b|\brmdirSync\b|\bunlinkSync\b|\bos\.(remove|unlink|rmdir)\b|\brm -[a-z]*r|\bunlink\(|\bFile\.delete|\bFileUtils\.rm/.test(code)) return 'Deleting files from inline code is blocked.';
  if (PROTECTED_TEXT.test(code)) return 'Inline code touching settings, hooks, plugin files, git config or agent-memory is blocked.';
  if (ctx?.role && /\bopen\s*\(|writeFile|appendFile|write_text|write_bytes|\.write\(|createWriteStream|shutil|os\.(rename|replace|mkdir)|fs\.(rename|copy|mkdir)|File\.(write|open)|Set-Content/.test(code)
    && !/tmpdir|\/tmp\/|\/private\/tmp|\/var\/folders|tempfile|mkdtemp/.test(code)) return `${ctx.role} is a read-only role: inline code may only write to the temp dir.`;
  return null;
}

// ---------- command walker ----------
function stripWrappers(words) {
  let w = words.slice(); const assigns = []; const via = { xargs: false };
  for (;;) {
    while (w.length && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(w[0]) || LEADING_KEYWORDS.has(w[0]))) { if (/=/.test(w[0])) assigns.push(w[0].split('=')[0]); w.shift(); }
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
      else if (name === 'env' && /^[A-Za-z_][A-Za-z0-9_]*=/.test(w[k])) { assigns.push(w[k].split('=')[0]); k++; }
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

function scanWords(inputWords, ctx, viaIn, depth) {
  const { words, assigns, via } = stripWrappers(inputWords);
  if (viaIn?.xargs) via.xargs = true;
  via.assigns = assigns;
  if (!words.length) return null;
  if (assigns.some((n) => /^GIT_CONFIG(_COUNT|_KEY_\d+|_VALUE_\d+|_GLOBAL|_SYSTEM|_PARAMETERS)$/.test(n))) return 'GIT_CONFIG_* environment overrides are blocked: they can hide a push to main.';
  const prog = path.basename(words[0]);
  if (words[0].startsWith('$') && !words[0].includes('/')) return `Running a program named by a variable (${words[0]}) cannot be verified: blocked.`;
  if (ctx.role && prog === 'patch') return `${ctx.role} is a read-only role: patch changes files.`;
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
  else if (prog === 'gh') r = checkGh(words, ctx);
  else if (prog === 'curl' || prog === 'wget' || prog === 'http' || prog === 'https' || prog === 'xh') r = checkCurl(words);
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
      continue;
    }
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
  const mail = /\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
  for (let m = mail.exec(text); m; m = mail.exec(text)) if (!SAFE_EMAIL_DOMAINS.test(m[0])) return 'email address';
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
  const why = protectedPathReason(r, ctx) ?? protectedPathReason(abs, ctx);
  if (why) return `${why} cannot be edited by Claude: the owner changes them by hand.`;
  if (ctx.role) { // read-only roles: no Edit-type tools; Write only to their own memory file or temp
    if (!ctx.isWrite) return `${ctx.role} is a read-only role: it cannot use Edit/MultiEdit/NotebookEdit.`;
    const ownMemory = new RegExp(`/\\.claude/agent-memory/toon-crew-${ctx.role.replace(/[^a-z-]/gi, '')}/MEMORY\\.md$`, 'i').test(r);
    const docRoots = (ROLE_DOC_DIRS[ctx.role] ?? []).map((d) => path.join(ctx.project, d));
    // The target is realpath-resolved, the root is not: a symlinked docs/ or docs/research lands outside the root.
    const inDocs = docRoots.some((root) => within(r, root));
    if (!ownMemory && !inDocs && !ctx.writeRoots.some((root) => within(r, root))) return `${ctx.role} is a read-only role: Write is allowed only to ${[...docRoots.map((d) => path.relative(ctx.project, d) + '/'), `.claude/agent-memory/toon-crew-${ctx.role}/MEMORY.md`, 'the temp dir'].join(', ')}.`;
    if (inDocs) { const hit = findSecret(input.content); if (hit) return `Documents must not hold secrets: ${hit} pattern found in the new content. Remove it and retry.`; }
  }
  const soft = crewConfigAsk(r) ?? crewConfigAsk(abs);
  if (soft) return soft;
  if (isMemoryPath(r) && r.toLowerCase().endsWith('.md')) {
    const after = applyEdits(r, input);
    const parts = [after, input.content, input.new_string, input.new_source, ...(Array.isArray(input.edits) ? input.edits.map((e) => e?.new_string) : [])];
    for (const p of parts) { const hit = findSecret(p); if (hit) return `Memory files must not hold secrets: ${hit} pattern found in the new content. Remove it and retry.`; }
  }
  return null;
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
  const ctx = { cwd, project, pluginRoot, rmRoots: roots, cache: new Map(), pending: [], deadline: Date.now() + BUDGET_MS, km: /(^|:)miguel-rivera$/i.test(String(input.agent_type ?? '')), stdinShell: false, written: new Set(),
    role: (READ_ONLY_ROLES.exec(String(input.agent_type ?? '')) ?? [])[1]?.toLowerCase() ?? null, isWrite: String(input.tool_name) === 'Write', writeRoots: [...new Set([...sys, ...(typeof input.scratchpad_dir === 'string' && input.scratchpad_dir ? [real(input.scratchpad_dir)] : [])])] };
  const tool = String(input.tool_name ?? '');
  const ti = input.tool_input ?? {};
  if (tool === 'Bash') {
    const cmd = typeof ti.command === 'string' ? ti.command : '';
    if (cmd.length > MAX_COMMAND) return { deny: 'Command too long to verify; blocked.' };
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
  if (tool.startsWith('mcp__')) {
    const name = tool.slice(tool.lastIndexOf('__') + 2).toLowerCase();
    if (/(merge|push|delete|destroy|drop|force|remove|wipe)/.test(name)) return ask(`MCP tool ${tool} can change or delete remote data: confirm.`);
  }
  return null;
}

async function main() {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  let input;
  try { input = JSON.parse(raw); } catch { console.error('toon-crew guard: unreadable hook input, not checked.'); process.exit(1); }
  let result;
  try { result = evaluate(input); } catch (e) {
    // Fail closed when the call touches something the guard exists for; otherwise do not block.
    const text = JSON.stringify(input?.tool_input ?? {});
    const sensitive = input?.tool_name === 'Bash' ? RISKY_MENTION.test(text) || /settings/.test(text) : /\.claude|\.git|\.mcp|agent-memory|settings|plugins/.test(text);
    console.error(`toon-crew guard: internal error (${e.message}); ${sensitive ? 'blocked to be safe' : 'not checked'}.`);
    process.exit(sensitive ? 2 : 1);
  }
  if (result?.deny) { console.error(`toon-crew guard: ${result.deny}`); process.exit(2); }
  if (result?.ask) {
    console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask', permissionDecisionReason: `toon-crew guard: ${result.ask}` } }));
  }
}

// Run main() only when executed as a script. Compare real paths: Node resolves symlinks for import.meta.url
// but not for argv[1], and keeps a doubled slash, so a plain string comparison silently skipped every check.
function isEntry() {
  try { return !!process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url)); } catch { return true; }
}
if (isEntry()) await main();
