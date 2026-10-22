// One way to run an external read-only command: argv only (no shell on this side), a hard timeout,
// and a result instead of a throw so one dead source never stops the other pollers.
import { execFile } from "node:child_process";

export interface RunResult { ok: boolean; out: string; err: string }

export function run(argv: string[], timeoutMs = 20_000, cwd?: string): Promise<RunResult> {
  return new Promise((resolve) => {
    execFile(argv[0], argv.slice(1), { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024, cwd }, (error, stdout, stderr) => {
      resolve({ ok: !error, out: String(stdout), err: String(stderr || error?.message || "") });
    });
  });
}
