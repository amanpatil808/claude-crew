// Fallback structure check for CI when `claude plugin validate` is unavailable, and an extra
// guard when it is. Checks manifests, marketplace, hooks.json and that referenced paths exist.
import fs from 'node:fs';
import path from 'node:path';

const repo = path.resolve(import.meta.dirname, '..');
// The plugin lives in plugin/ so that docs/, CI and planning notes are not copied into installs.
const root = fs.existsSync(path.join(repo, 'plugin/.claude-plugin/plugin.json')) ? path.join(repo, 'plugin') : repo;
const errors = [];
const fail = (m) => errors.push(m);
const readJson = (rel) => {
  try { return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8')); } catch (e) { fail(`${rel}: ${e.message}`); return null; }
};
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const plugin = readJson('.claude-plugin/plugin.json');
if (plugin) {
  if (!KEBAB.test(plugin.name ?? '')) fail('plugin.json: name must be kebab-case');
  if (/^(claude|anthropic)/.test(plugin.name ?? '')) fail('plugin.json: name looks reserved');
  for (const f of ['version', 'description']) if (typeof plugin[f] !== 'string' || !plugin[f]) fail(`plugin.json: ${f} missing`);
  if (!plugin.author?.name) fail('plugin.json: author.name missing');
  for (const key of ['skills', 'commands', 'agents', 'hooks', 'outputStyles']) {
    for (const p of [].concat(plugin[key] ?? [])) {
      if (typeof p !== 'string') continue;
      if (!p.startsWith('./')) fail(`plugin.json: ${key} path must start with ./ (${p})`);
      else if (!fs.existsSync(path.join(root, p))) fail(`plugin.json: ${key} path not found (${p})`);
    }
  }
}

const market = (() => { // the marketplace file stays at the repo root
  try { return JSON.parse(fs.readFileSync(path.join(repo, '.claude-plugin/marketplace.json'), 'utf8')); } catch (e) { fail(`marketplace.json: ${e.message}`); return null; }
})();
if (market) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(market.name ?? '')) fail('marketplace.json: bad name');
  if (!market.owner?.name) fail('marketplace.json: owner.name missing');
  if (!Array.isArray(market.plugins) || !market.plugins.length) fail('marketplace.json: plugins empty');
  for (const e of market.plugins ?? []) {
    if (e.name !== plugin?.name) fail(`marketplace.json: entry ${e.name} does not match plugin.json name`);
    if (typeof e.source === 'string' && e.source !== '.' && !e.source.startsWith('./')) fail('marketplace.json: relative source must start with ./');
    if (typeof e.source === 'string' && path.resolve(repo, e.source) !== root) fail(`marketplace.json: source ${e.source} does not point at the plugin folder`);
  }
}

const settings = readJson('settings.json');
if (settings) for (const k of Object.keys(settings)) if (!['agent', 'subagentStatusLine'].includes(k)) fail(`settings.json: "${k}" is dropped by Claude Code (only agent and subagentStatusLine apply)`);
if (settings?.agent?.startsWith('toon-crew:')) {
  const name = settings.agent.slice('toon-crew:'.length).split(':');
  const file = path.join(root, 'agents', ...name) + '.md';
  if (fs.existsSync(path.join(root, 'agents')) && !fs.existsSync(file)) fail(`settings.json: agent ${settings.agent} has no file at agents/${name.join('/')}.md`);
}

const hooksFile = readJson('hooks/hooks.json');
const EVENTS = new Set(['PreToolUse', 'PostToolUse', 'SessionStart', 'SessionEnd', 'Stop', 'SubagentStart', 'SubagentStop', 'UserPromptSubmit', 'Notification', 'PreCompact']);
if (hooksFile) {
  if (!hooksFile.hooks || typeof hooksFile.hooks !== 'object') fail('hooks.json: needs a top-level "hooks" key');
  for (const [ev, groups] of Object.entries(hooksFile.hooks ?? {})) {
    if (!EVENTS.has(ev)) fail(`hooks.json: unknown event ${ev}`);
    for (const g of groups) for (const h of g.hooks ?? []) {
      if (h.type !== 'command' || typeof h.command !== 'string') { fail(`hooks.json: ${ev} hook needs type command`); continue; }
      // Claude Code doesn't enforce timeouts on async hooks, so only blocking ones need one.
      if (!h.async && (typeof h.timeout !== 'number' || h.timeout <= 0)) fail(`hooks.json: ${ev} hook needs a timeout in seconds`);
      const m = h.command.match(/\$\{CLAUDE_PLUGIN_ROOT\}\/([^"\s]+)/);
      if (!h.command.includes('${CLAUDE_PLUGIN_ROOT}')) fail(`hooks.json: ${ev} command must use \${CLAUDE_PLUGIN_ROOT}`);
      else if (m && !fs.existsSync(path.join(root, m[1]))) fail(`hooks.json: ${ev} script not found (${m[1]})`);
    }
  }
}

// One version, three places: plugin.json, the README badge and the top CHANGELOG heading.
if (plugin?.version) {
  const read = (f) => { try { return fs.readFileSync(path.join(repo, f), 'utf8'); } catch (e) { fail(`${f}: ${e.message}`); return ''; } };
  const badge = read('README.md').match(/img\.shields\.io\/badge\/version-([^-\s"')]+)-blue/)?.[1];
  const top = read('CHANGELOG.md').match(/^## (\S+)/m)?.[1];
  if (!badge) fail('README.md: no version badge (img.shields.io/badge/version-<semver>-blue)');
  if (!top) fail('CHANGELOG.md: no "## <version>" heading');
  if (badge && top && (badge !== plugin.version || top !== plugin.version)) {
    fail(`version mismatch: plugin.json=${plugin.version}, README badge=${badge}, CHANGELOG top heading=${top}`);
  }
}

if (errors.length) { console.error(errors.map((e) => `- ${e}`).join('\n')); process.exit(1); }
console.log('structure ok');
