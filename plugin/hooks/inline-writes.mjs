// Finds the file-writing calls in inline interpreter code (python -c, node -e, perl -e, ruby -e, here-docs)
// and the paths they write. A path is a string literal, or null when the guard cannot know it (a variable,
// an f-string, a keyword argument). Text-based like the rest of the guard: it narrows bypasses, it is no sandbox.

// Reads up to `max` call arguments starting just after "(": a literal string or null for anything else.
function readArgs(code, i, max) {
  const out = [];
  while (out.length < max && i < code.length) {
    while (/\s/.test(code[i] ?? '')) i++;
    if (code[i] === ')') break;
    let val = null; let extra = false; let depth = 0;
    const q = /^[rRbBuU]{0,2}(['"`])/.exec(code.slice(i, i + 3));
    if (q) {
      const start = i + q[0].length; const end = code.indexOf(q[1], start);
      if (end !== -1) { val = code.slice(start, end); i = end + 1; } else i = code.length;
    }
    for (; i < code.length; i++) { // the rest of the argument: anything but whitespace makes it unknown
      const c = code[i];
      if ('([{'.includes(c)) depth++;
      else if (')]}'.includes(c)) { if (depth === 0) break; depth--; } else if (c === ',' && depth === 0) break;
      if (!/\s/.test(c)) extra = true;
    }
    out.push(val !== null && !extra && !/[{$\\]/.test(val) ? val : null);
    if (code[i] === ',') i++; else break;
  }
  return out;
}

// [pattern, kind, which argument indexes are written paths]. `open` decides by its mode argument.
const SITES = [
  [/\b(?:link|linkSync|symlink|symlinkSync|hardlink_to|symlink_to|link_to)\s*\(/g, 'link', [0, 1]],
  [/\b(?:open|openSync|fopen|sysopen)\s*\(/g, 'open', [0]],
  [/\b(?:writeFile|writeFileSync|appendFile|appendFileSync|createWriteStream|truncate|truncateSync|mkdir|mkdirSync|makedirs|mkdirs|mkfifo|chmod|chmodSync|utimes|utimesSync)\s*\(/g, 'write', [0]],
  [/\b(?:File|IO)\.(?:write|binwrite)\s*\(/g, 'write', [0]],
  [/\b(?:os|shutil|fs|fsp|promises)\.(?:rename|renameSync|replace|move)\s*\(/g, 'write', [0, 1]],
  [/\b(?:shutil\.copy\w*|copyFile|copyFileSync|cpSync|fs\.cp)\s*\(/g, 'write', [1]],
];
const PATH_METHOD = /(?:Path|PurePath|PosixPath)\(\s*(?:(['"])([^'"\\{$]*)\1)?[^)]*\)\s*\.(write_text|write_bytes|touch|mkdir|open|rename|replace|unlink|hardlink_to|symlink_to)\s*\(/g;
const WRITE_MODE = /[wax+>]/;

export function inlineWriteSites(code) {
  const sites = [];
  for (const [re, kind, idx] of SITES) {
    re.lastIndex = 0;
    for (let m = re.exec(code); m; m = re.exec(code)) {
      const args = readArgs(code, m.index + m[0].length, 2);
      if (kind === 'open') {
        const mode = args.length > 1 ? args[1] : 'r';
        if (mode !== null && !WRITE_MODE.test(mode)) continue; // reading
        sites.push({ kind: 'write', paths: [args[0] ?? null] });
      } else sites.push({ kind, paths: idx.map((k) => args[k] ?? null) });
    }
  }
  PATH_METHOD.lastIndex = 0;
  for (let m = PATH_METHOD.exec(code); m; m = PATH_METHOD.exec(code)) {
    const receiver = m[1] ? m[2] : null; const method = m[3];
    const args = readArgs(code, m.index + m[0].length, 1);
    if (method === 'open' && args.length && args[0] !== null && !WRITE_MODE.test(args[0])) continue;
    if (method === 'open' && !args.length) continue;
    const fromPath = ['write_text', 'write_bytes', 'touch', 'hardlink_to', 'symlink_to'].includes(method);
    if (method === 'hardlink_to' || method === 'symlink_to') sites.push({ kind: 'link', paths: [receiver, args[0] ?? null], fromPath });
    else if (method === 'rename' || method === 'replace') sites.push({ kind: 'write', paths: [receiver, args[0] ?? null] });
    else sites.push({ kind: 'write', paths: [receiver], fromPath });
  }
  // A Path method on anything but a literal Path('...') (an alias, a variable, Path('a') / 'b') writes an unknown path.
  const methods = (code.match(/\.(?:write_text|write_bytes|touch|hardlink_to|symlink_to)\s*\(/g) ?? []).length;
  const seen = sites.filter((x) => x.fromPath).length;
  if (methods > seen) sites.push({ kind: 'write', paths: [null] });
  return sites;
}

// Code that starts other programs or evaluates strings hides what it writes.
export const SPAWNS_OR_EVALS = new RegExp([
  String.raw`\b(?:subprocess|child_process|execSync|spawnSync|execFile\w*)\b`, String.raw`\bos\.(?:system|popen|exec\w*|spawn\w*|posix_spawn\w*|fork)\b`,
  String.raw`\bBun\.(?:spawn|\$)`, String.raw`\bDeno\.(?:Command|run)\b`, String.raw`(?<![.\w$])(?:system|exec|eval|Function|__import__)\s*\(`,
  String.raw`\b(?:Set-Content|Out-File|Add-Content|New-Item)\b`, '`[^`]+`', String.raw`\bqx\s*[({/]`,
].join('|'));

// Reflection, aliasing and raw bindings hide a write behind a name the scanner cannot see (read-only roles only).
// Not exhaustive: the Claude Code sandbox is the boundary, this only removes the easy routes.
export const INDIRECT = new RegExp([
  String.raw`\b(?:getattr|setattr|__builtins__|__dict__|__import__|importlib|ctypes|cffi|pty|globalThis|Reflect)\b`,
  String.raw`\bprocess\.(?:binding|dlopen|_linkedBinding)\b`, String.raw`\bfrom\s+(?:os|shutil|subprocess|io|posix|pty)\s+import\b`,
  String.raw`\b(?:writeFile|writeFileSync|appendFile|appendFileSync|createWriteStream|copyFile|copyFileSync|cpSync|renameSync|symlinkSync|linkSync|openSync|execSync|spawnSync)\b(?!\s*\()`,
  String.raw`\brequire\s*\([^)]*\)\s*\[`, String.raw`\bopen\s+(?:my\s+)?[$\w]+\s*,`,
].join('|'));
