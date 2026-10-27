// The transcript reader's resource and file-identity limits (security review findings M1, L1, I1): peak memory
// grows linearly with one long line, the default line cap, a FIFO swapped in after the check, and hard links.
// Child processes run the reader where a hang or the peak RSS must be measured on its own.
import "./env.ts";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { closeSync, linkSync, mkdirSync, mkdtempSync, openSync, writeFileSync, writeSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { readUsage, safeTranscript, sumTranscript } from "../lib/usage.ts";
import type { UsageOptions } from "../lib/events.ts";

const USAGE = join(import.meta.dirname, "..", "lib", "usage.ts");
const MAIN: UsageOptions = { scope: "main", project: "x", sid: "s1aaaaaa", final: false };
const MIB = 2 ** 20;
const newRoot = (tag: string) => { const root = join(mkdtempSync(join(tmpdir(), `crew-${tag}-`)), "projects"); mkdirSync(root); return root; };
const asst = (id: string, out: number, text = "") =>
  `{"type":"assistant","message":{"id":"${id}","model":"claude-sonnet-5-5","usage":{"input_tokens":1,"output_tokens":${out}},"content":[{"type":"text","text":"${text}`;

// One user line of `mb` MiB (no type filter applies before a line is whole), then "\n".
function longLine(root: string, mb: number): string {
  const file = join(root, `long-${mb}.jsonl`), fd = openSync(file, "w"), pad = "a".repeat(MIB);
  writeSync(fd, '{"type":"user","message":{"content":"');
  for (let i = 0; i < mb; i++) writeSync(fd, pad);
  writeSync(fd, '"}}\n');
  closeSync(fd);
  return file;
}

// Peak RSS (MiB) of a fresh process that reads `file` with small chunks and a line cap above the line's size.
function peakMiB(file: string, root: string): number {
  const child = `const { readUsage } = await import(${JSON.stringify(USAGE)});
    readUsage(${JSON.stringify(file)}, { scope: "main", project: "x", sid: "s", final: false },
      { root: ${JSON.stringify(root)}, chunkBytes: ${256 * 1024}, maxLineBytes: ${64 * MIB} });
    console.log(process.resourceUsage().maxRSS);`;
  return Number(execFileSync(process.execPath, ["--no-warnings", "--input-type=module", "-e", child], { encoding: "utf8" }).trim()) / 1024;
}

test("[M1] peak memory grows linearly with one long line, not with the number of reads it spans", () => {
  const root = newRoot("mem");
  const base = peakMiB(longLine(root, 0), root);
  // Before the fix, every 256 KiB read copied the whole unfinished line: 16 MiB peaked near 940 MiB.
  for (const mb of [8, 16]) {
    const extra = peakMiB(longLine(root, mb), root) - base;
    assert.ok(extra < 4 * mb + 48, `a ${mb} MiB line cost ${extra.toFixed(0)} MiB over the ${base.toFixed(0)} MiB baseline`);
  }
});

test("[M1] the default line cap is 16 MiB: a 17 MiB line is dropped and marks the read partial", () => {
  const root = newRoot("cap"), file = join(root, "s.jsonl"), fd = openSync(file, "w");
  writeSync(fd, asst("msg_big", 7));
  const pad = "b".repeat(MIB);
  for (let i = 0; i < 17; i++) writeSync(fd, pad);
  writeSync(fd, '"}]}}\n' + asst("msg_small", 5) + '"}]}}\n');
  closeSync(fd);
  const e = readUsage(file, MAIN, { root });
  assert.equal(e?.partial, true, "a 17 MiB line was read whole");
  assert.deepEqual(e?.rows.map((r) => [r.n, r.out]), [[1, 5]], "only the line after the dropped one counts");
});

test("[L1] a FIFO swapped in after the path check gives null, not a hung hook", () => {
  const root = newRoot("fifo"), file = join(root, "s.jsonl");
  const child = `import { writeFileSync, unlinkSync } from "node:fs"; import { execFileSync } from "node:child_process";
    const { safeTranscript, sumTranscript } = await import(${JSON.stringify(USAGE)});
    writeFileSync(${JSON.stringify(file)}, "{}\\n");
    const checked = safeTranscript(${JSON.stringify(file)}, ${JSON.stringify(root)});
    unlinkSync(${JSON.stringify(file)}); execFileSync("mkfifo", [${JSON.stringify(file)}]);   // the swap
    let r; try { r = sumTranscript(checked); } catch { r = "threw"; }
    console.log(JSON.stringify(r ?? null));`;
  const out = spawnSync(process.execPath, ["--no-warnings", "--input-type=module", "-e", child], { encoding: "utf8", timeout: 4_000 });
  assert.notEqual(out.signal, "SIGTERM", "open() blocked on the FIFO until the child was killed");
  assert.equal(out.stdout.trim(), "null", out.stderr);
});

test("[I1] a hard link (a second name realpath cannot see) is refused, before and after the check", () => {
  const root = newRoot("link"), outside = join(root, "..", "outside.jsonl");
  const line = asst("msg_1", 9) + '"}]}}\n';
  writeFileSync(outside, line);
  linkSync(outside, join(root, "planted.jsonl"));
  assert.equal(safeTranscript(join(root, "planted.jsonl"), root), null);
  assert.equal(readUsage(join(root, "planted.jsonl"), MAIN, { root }), null);
  // A link made after the path check is caught by the fstat re-check on the open file.
  const own = join(root, "own.jsonl");
  writeFileSync(own, line);
  const checked = safeTranscript(own, root);
  assert.ok(checked);
  assert.equal(sumTranscript(checked)?.rows.length, 1, "a file with one name is read");
  linkSync(own, join(root, "..", "second-name.jsonl"));
  assert.equal(sumTranscript(checked), null);
});
