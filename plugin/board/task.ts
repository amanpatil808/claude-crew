// `board.sh task add|start|done|drop|list`: how the manager queues and closes board tasks.
// Each command appends one event (see lib/tasks.ts); the board derives the rest.
import { appendEvent, readEvents, type BoardEvent } from "./lib/events.ts";
import { projectName } from "./lib/projects.ts";
import { ROSTER } from "./lib/roster.ts";
import { PRIORITIES, TASK_ID, deriveTasks, findTask, taskIdOf, taskText, type BoardTask, type Priority } from "./lib/tasks.ts";

const USAGE = `usage: board.sh task add --role <id> [--priority P0|P1|P2] [--ref <branch|PR>] "<text>"
       board.sh task start|drop <id>
       board.sh task done <id> [--ref <branch|PR>]
       board.sh task list [--all] [--json]`;

export interface Result { code: number; out: string }
const fail = (msg: string): Result => ({ code: 2, out: `${msg}\n` });

// Flags may sit anywhere; the rest are positionals. A flag that needs a value and has none is an error.
function parse(args: string[], names: string[]): { flags: Record<string, string | true>; rest: string[] } | string {
  const flags: Record<string, string | true> = {}, rest: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith("--")) { rest.push(a); continue; }
    const name = a.slice(2);
    if (name === "all" || name === "json") { flags[name] = true; continue; }
    if (!names.includes(name)) return `unknown option ${a}`;
    const v = args[++i];
    if (v === undefined || v.startsWith("--")) return `${a} needs a value`;
    flags[name] = v;
  }
  return { flags, rest };
}

const line = (t: BoardTask) => `${t.id}  ${t.state.padEnd(6)}  ${(t.priority ?? "--").padEnd(2)}  ${t.role}  ${t.text}${t.project ? `  [${t.project}]` : ""}${t.ref ? `  (${t.ref})` : ""}`;

export function run(argv: string[], env: Record<string, string | undefined> = process.env, cwd = process.cwd()): Result {
  const [cmd, ...args] = argv;
  const project = projectName(env.CLAUDE_PROJECT_DIR || cwd);
  const p = parse(args, ["role", "priority", "ref"]);
  if (typeof p === "string") return fail(`${p}\n${USAGE}`);
  const { flags, rest } = p;
  const ref = typeof flags.ref === "string" ? taskText(flags.ref, 80) : undefined;

  if (cmd === "add") {
    const role = String(flags.role ?? "");
    if (!role) return fail(`--role is required\n${USAGE}`);
    if (!ROSTER.some((r) => r.id === role)) return fail(`unknown role "${role.slice(0, 40)}"; use one of: ${ROSTER.map((r) => r.id).join(", ")}`);
    if (flags.priority !== undefined && !PRIORITIES.includes(flags.priority as Priority)) return fail(`priority must be one of ${PRIORITIES.join(", ")}`);
    const text = taskText(rest.join(" "));
    if (!text) return fail(`task text is required\n${USAGE}`);
    const e = appendEvent({ kind: "task-queue", text, role, ...(project ? { project } : {}), ...(flags.priority ? { priority: flags.priority as Priority } : {}), ...(ref ? { ref } : {}) });
    return { code: 0, out: `queued ${taskIdOf(e.id)}\n` };
  }

  if (cmd === "start" || cmd === "done" || cmd === "drop") {
    const id = rest[0] ?? "";
    if (!TASK_ID.test(id)) return fail(`task id looks like t-<ms>-<hex>\n${USAGE}`);
    const events = readEvents(), task = findTask(events, id);
    if (!task) return fail(`no task ${id}`);
    const ok = cmd === "start" ? task.state === "queued" : task.state === "queued" || task.state === "active";
    if (!ok) return fail(`${id} is already ${task.state}`);
    const kind = `task-${cmd}` as BoardEvent["kind"];
    appendEvent({ kind, text: task.text, taskId: id, ...(task.project ? { project: task.project } : {}), ...(ref ? { ref } : {}) });
    return { code: 0, out: `${cmd === "start" ? "started" : cmd === "done" ? "done" : "dropped"} ${id}\n` };
  }

  if (cmd === "list") {
    const t = deriveTasks(readEvents()), keep = (x: BoardTask) => flags.all === true || !project || x.project === project;
    const lists = { active: t.active.filter(keep), queued: t.queued.filter(keep), done: t.done.filter(keep) };
    if (flags.json) return { code: 0, out: JSON.stringify(lists, null, 2) + "\n" };
    const rows = [...lists.active, ...lists.queued, ...lists.done].map(line);
    return { code: 0, out: rows.length ? rows.join("\n") + "\n" : "no tasks\n" };
  }

  return fail(USAGE);
}

if (import.meta.main) {
  const r = run(process.argv.slice(2));
  (r.code ? process.stderr : process.stdout).write(r.out);
  process.exit(r.code);
}
