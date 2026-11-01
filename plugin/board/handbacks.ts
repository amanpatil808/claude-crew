// `board.sh handbacks dir|list`: where a project's hand-back files live, and its newest summaries.
// The folder is always under CLAUDE_PLUGIN_DATA, the only place the guard lets crew roles write them.
import { join, isAbsolute } from "node:path";
import { readRegistry } from "./lib/projects.ts";
import { AGENT_ID, LinkError, ensureHandbacks, handbackKey, listSummaries } from "./lib/handbacks.ts";

const USAGE = `usage: board.sh handbacks dir [--project <dir>]
       board.sh handbacks list [--project <dir>] [--agent <id>] [--limit <n>]`;
const NO_DATA = "CLAUDE_PLUGIN_DATA is not set to an absolute folder. Hand-back files live only under the plugin's data folder:\n"
  + 'run this as CLAUDE_PLUGIN_DATA="${CLAUDE_PLUGIN_DATA}" bash "${CLAUDE_PLUGIN_ROOT}/board/board.sh" handbacks ...';

export interface Result { code: number; out: string }
const fail = (msg: string): Result => ({ code: 2, out: `${msg}\n` });

function parse(args: string[]): Record<string, string> | string {
  const flags: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!["--project", "--agent", "--limit"].includes(a)) return `unknown argument ${JSON.stringify(a.slice(0, 40))}`;
    const v = args[++i];
    if (v === undefined || v.startsWith("--")) return `${a} needs a value`;
    flags[a.slice(2)] = v;
  }
  return flags;
}

export function run(argv: string[], env: Record<string, string | undefined> = process.env, cwd = process.cwd()): Result {
  const [cmd, ...args] = argv;
  if (cmd !== "dir" && cmd !== "list") return fail(USAGE);
  const flags = parse(args);
  if (typeof flags === "string") return fail(`${flags}\n${USAGE}`);
  if (cmd === "dir" && (flags.agent !== undefined || flags.limit !== undefined)) return fail(USAGE);
  const data = env.CLAUDE_PLUGIN_DATA;
  if (!data || !isAbsolute(data)) return fail(NO_DATA);
  const project = flags.project ?? env.CLAUDE_PROJECT_DIR ?? cwd;
  const key = handbackKey(project, readRegistry(join(data, "projects.json")));

  if (cmd === "dir") {
    try { return { code: 0, out: `${ensureHandbacks(data, key)}\n` }; } catch (err) {
      return fail(err instanceof LinkError ? "a folder on the hand-back path is a link or not a folder; refusing to use it" : "could not create the hand-back folder");
    }
  }

  if (flags.agent !== undefined && !AGENT_ID.test(flags.agent)) return fail("--agent must be a crew id: a-z, 0-9 and -, at most 40 characters");
  const limit = flags.limit === undefined ? 10 : Number(flags.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) return fail("--limit must be a whole number from 1 to 200");
  const { items, capped } = listSummaries(data, key, { agent: flags.agent, limit });
  if (!items.length) return { code: 0, out: "no summaries\n" };
  const blocks = items.map((s) => [s.path, ...s.head.map((l) => `  ${l}`)].join("\n"));
  return { code: 0, out: `${blocks.join("\n\n")}\n${capped ? "\n(stopped after 5000 files; older ones not shown)\n" : ""}` };
}

if (import.meta.main) {
  const r = run(process.argv.slice(2));
  (r.code ? process.stderr : process.stdout).write(r.out);
  process.exit(r.code);
}
