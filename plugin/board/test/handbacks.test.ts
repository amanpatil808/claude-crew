// Hand-back files: `board.sh handbacks dir|list` and the 60-day clean-up. Every test uses its own temp data folder.
import "./env.ts";
import { afterEach, mock, test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, statSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DAY_MS, handbackKey, handbacksDir, pruneHandbacks, startPrune, sweep } from "../lib/handbacks.ts";
import { projectKey } from "../lib/projects.ts";
import { run } from "../handbacks.ts";

const BOARD_SH = join(import.meta.dirname, "..", "board.sh");
const NOW = Date.parse("2026-11-01T12:00:00Z");
const fresh = () => realpathSync(mkdtempSync(join(tmpdir(), "crew-handbacks-")));
const put = (file: string, text: string, ageDays = 0, now = NOW) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
  const t = (now - ageDays * DAY_MS) / 1000;
  utimesSync(file, t, t);
  return file;
};
const register = (data: string, ...paths: string[]) => writeFileSync(join(data, "projects.json"), JSON.stringify(paths.map((p) => ({ path: p, name: p.split("/").pop() }))));
const mode = (p: string) => statSync(p).mode & 0o777;
afterEach(() => mock.timers.reset());

test("the key is the board's: the deepest registered project holding the folder, else the folder itself", () => {
  assert.equal(handbackKey("/work/shop", []), projectKey("/work/shop"));
  const reg = [{ path: "/work/shop", name: "shop" }, { path: "/work/shop/packages/api", name: "api" }];
  assert.equal(handbackKey("/work/shop/.claude/worktrees/agent-1", reg), projectKey("/work/shop"), "a worktree shares the project's folder");
  assert.equal(handbackKey("/work/shop/packages/api/src", reg), projectKey("/work/shop/packages/api"), "deepest wins");
  assert.equal(handbackKey("/work/shopping", reg), projectKey("/work/shopping"), "a name prefix is not a parent");
  assert.match(projectKey("/work/shop"), /^[a-z0-9-]{1,60}$/, "the guard's key pattern accepts it");
});

test("dir prints the absolute folder for the project and creates handbacks/, full/ and summaries/ as 0700", () => {
  const data = fresh(); register(data, "/work/shop");
  const r = run(["dir", "--project", "/work/shop/.claude/worktrees/agent-1"], { CLAUDE_PLUGIN_DATA: data });
  assert.equal(r.code, 0, r.out);
  const want = join(data, "projects", projectKey("/work/shop"), "handbacks");
  assert.equal(r.out, `${want}\n`);
  for (const p of [want, join(want, "full"), join(want, "summaries")]) assert.equal(mode(p), 0o700, p);
  // A looser folder made earlier is tightened; running it again is fine.
  chmodSync(join(want, "summaries"), 0o755);
  assert.equal(run(["dir", "--project", "/work/shop"], { CLAUDE_PLUGIN_DATA: data }).out, `${want}\n`);
  assert.equal(mode(join(want, "summaries")), 0o700);
  // Without --project: CLAUDE_PROJECT_DIR, then the current folder.
  assert.equal(run(["dir"], { CLAUDE_PLUGIN_DATA: data, CLAUDE_PROJECT_DIR: "/work/shop" }).out, `${want}\n`);
  assert.equal(run(["dir"], { CLAUDE_PLUGIN_DATA: data }, "/work/shop/src").out, `${want}\n`);
});

test("dir and list refuse without an absolute CLAUDE_PLUGIN_DATA and create nothing (never BOARD_LOG_DIR or ~/.toon-crew)", () => {
  const data = fresh();
  for (const env of [{}, { CLAUDE_PLUGIN_DATA: "" }, { CLAUDE_PLUGIN_DATA: "rel/data" }, { BOARD_LOG_DIR: data }]) for (const cmd of ["dir", "list"]) {
    const r = run([cmd, "--project", "/work/shop"], env, data);
    assert.equal(r.code, 2, `${cmd} ${JSON.stringify(env)}`);
    assert.match(r.out, /CLAUDE_PLUGIN_DATA is not set/);
  }
  assert.deepEqual(readdirSync(data), []);
});

test("dir refuses a link anywhere on the path and creates nothing through it", () => {
  for (const level of ["projects", "key", "handbacks", "summaries"]) {
    const data = fresh(), outside = fresh(), key = projectKey("/work/shop");
    const at = { projects: join(data, "projects"), key: join(data, "projects", key), handbacks: join(data, "projects", key, "handbacks"), summaries: join(data, "projects", key, "handbacks", "summaries") }[level]!;
    mkdirSync(dirname(at), { recursive: true }); symlinkSync(outside, at); chmodSync(outside, 0o755);
    const r = run(["dir", "--project", "/work/shop"], { CLAUDE_PLUGIN_DATA: data });
    assert.equal(r.code, 2, level);
    assert.match(r.out, /link or not a folder/);
    assert.deepEqual(readdirSync(outside), [], `${level}: nothing created at the link's target`);
    assert.equal(mode(outside), 0o755, `${level}: the link's target is not chmod-ed either`);
  }
});

test("bad arguments are refused with the usage", () => {
  const env = { CLAUDE_PLUGIN_DATA: fresh() };
  for (const argv of [[], ["nope"], ["list", "--limit"], ["list", "--limit", "0"], ["list", "--limit", "201"], ["list", "--limit", "2.5"], ["list", "--agent", "../kevin"],
    ["list", "--agent", "Kevin"], ["list", "--colour"], ["dir", "--agent", "kevin"], ["dir", "extra"]]) assert.equal(run(argv, env).code, 2, argv.join(" "));
});

test("list prints the newest summaries first: path, then the first 3 lines; --agent and --limit narrow it", () => {
  const data = fresh(), key = projectKey("/work/shop");
  const s = (id: string, name: string, age: number, text: string) => put(join(handbacksDir(data, key), "summaries", id, name), text, age);
  const a = s("kevin", "20261030-0900-guard.md", 2, "Verdict: done\nTask: guard rule\nFiles: guard.mjs\nChecks: 14 pass\n");
  const b = s("joe-gardner", "20261031-0900-qa.md", 1, "Verdict: blocked\nTask: QA\n");
  const c = s("kevin", "20261101-0900-cli.md", 0, "Verdict: needs decision\n");
  put(join(handbacksDir(data, key), "full", "kevin", "20261101-0900-cli.md"), "the full report, never listed", 0);
  const env = { CLAUDE_PLUGIN_DATA: data };
  const all = run(["list", "--project", "/work/shop"], env);
  assert.equal(all.code, 0);
  assert.equal(all.out, `${c}\n  Verdict: needs decision\n\n${b}\n  Verdict: blocked\n  Task: QA\n\n${a}\n  Verdict: done\n  Task: guard rule\n  Files: guard.mjs\n`);
  assert.doesNotMatch(all.out, /\x1b\[/, "no colours");
  assert.equal(run(["list", "--project", "/work/shop", "--agent", "kevin", "--limit", "1"], env).out, `${c}\n  Verdict: needs decision\n`);
  assert.equal(run(["list", "--project", "/work/shop", "--limit", "2"], env).out.split("\n\n").length, 2);
  assert.deepEqual(run(["list", "--project", "/work/shop", "--agent", "joe-gardner"], env).out.split("\n")[0], b);
  assert.equal(run(["list", "--project", "/work/other"], env).out, "no summaries\n");
  assert.equal(run(["list", "--project", "/work/shop", "--agent", "bob"], env).out, "no summaries\n");
});

test("list never follows links, skips odd names, and shows control characters escaped", () => {
  const data = fresh(), outside = fresh(), key = projectKey("/work/shop"), sum = join(handbacksDir(data, key), "summaries");
  put(join(outside, "secret.md"), "outside-secret-line\n");
  mkdirSync(join(sum, "kevin"), { recursive: true });
  symlinkSync(join(outside, "secret.md"), join(sum, "kevin", "20261101-0000-link.md"));
  symlinkSync(outside, join(sum, "bob"));
  put(join(sum, "kevin", "run.sh"), "not a summary\n");
  put(join(sum, "kevin", "20261101-0100-esc.md"), "Verdict: \x1b[31mdone\x1b[0m\u2028x\n");
  const out = run(["list", "--project", "/work/shop"], { CLAUDE_PLUGIN_DATA: data }).out;
  assert.doesNotMatch(out, /outside-secret-line|run\.sh|link\.md/);
  assert.match(out, /Verdict: \\u001b\[31mdone\\u001b\[0m\\u2028x/);
  assert.doesNotMatch(out, /\x1b/);
  // A linked summaries/ folder lists nothing.
  const d2 = fresh(); mkdirSync(join(handbacksDir(d2, key)), { recursive: true });
  put(join(outside, "kevin", "20261101-0000-x.md"), "outside-secret-line\n");
  symlinkSync(outside, join(handbacksDir(d2, key), "summaries"));
  assert.equal(run(["list", "--project", "/work/shop"], { CLAUDE_PLUGIN_DATA: d2 }).out, "no summaries\n");
});

test("board.sh handbacks dir and list, end to end", () => {
  const data = fresh(); register(data, "/work/shop");
  const sh = (...args: string[]) => spawnSync("bash", [BOARD_SH, "handbacks", ...args], { encoding: "utf8", env: { ...process.env, CLAUDE_PLUGIN_DATA: data, BOARD_LOG_DIR: fresh() } });
  const dir = sh("dir", "--project", "/work/shop");
  assert.equal(dir.status, 0, dir.stderr);
  assert.equal(dir.stdout, `${join(data, "projects", projectKey("/work/shop"), "handbacks")}\n`, "CLAUDE_PLUGIN_DATA wins over BOARD_LOG_DIR");
  put(join(dir.stdout.trim(), "summaries", "kevin", "20261101-0900-x.md"), "Verdict: done\n");
  assert.match(sh("list", "--project", "/work/shop").stdout, /20261101-0900-x\.md\n {2}Verdict: done/);
  const unset = spawnSync("bash", [BOARD_SH, "handbacks", "dir", "--project", "/work/shop"], { encoding: "utf8", env: { ...process.env, CLAUDE_PLUGIN_DATA: "" } });
  assert.equal(unset.status, 2);
});

// ---------- prune ----------
const tree = (data: string, key = "shop-00000001") => {
  const hb = handbacksDir(data, key);
  return {
    hb,
    oldFull: put(join(hb, "full", "kevin", "20260801-0900-old.md"), "old", 61),
    oldSum: put(join(hb, "summaries", "kevin", "20260801-0900-old.md"), "old", 61),
    oldLone: put(join(hb, "summaries", "olaf", "20260801-0900-old.md"), "old", 61),
    young: put(join(hb, "summaries", "kevin", "20260903-0900-young.md"), "young", 59),
    oldOtherType: put(join(hb, "full", "kevin", "notes.txt"), "old", 90),
    events: put(join(data, "events.jsonl"), "old", 400),
    state: put(join(data, "projects", key, "state.json"), "old", 400),
  };
};

test("prune deletes hand-back files older than 60 days, keeps younger ones, removes the folders it empties", () => {
  const data = fresh(), t = tree(data);
  chmodSync(t.hb, 0o755);
  assert.deepEqual(pruneHandbacks(data, NOW), { files: 4, dirs: 2 });
  for (const f of [t.oldFull, t.oldSum, t.oldLone, t.oldOtherType]) assert.ok(!existsSync(f), f);
  assert.ok(existsSync(t.young));
  assert.ok(!existsSync(dirname(t.oldLone)), "empty agent folder removed");
  assert.ok(!existsSync(join(t.hb, "full", "kevin")), "full/kevin emptied and removed");
  assert.ok(existsSync(join(t.hb, "full")) && existsSync(t.hb), "handbacks/, full/ and summaries/ stay");
  assert.equal(mode(t.hb), 0o700, "a handbacks/ made by Write (0755) is made owner-only");
  assert.ok(existsSync(t.events) && existsSync(t.state), "nothing outside handbacks/ is touched");
  // Every project, and a second pass finds nothing more.
  const t2 = tree(data, "other-00000002");
  assert.equal(pruneHandbacks(data, NOW).files, 4);
  assert.ok(existsSync(t2.young));
  assert.deepEqual(pruneHandbacks(data, NOW), { files: 0, dirs: 0 });
});

test("prune never follows links: a linked folder, file, handbacks/ or project folder keeps its target", () => {
  const data = fresh(), outside = fresh(), key = "shop-00000001";
  const victim = put(join(outside, "keep", "20260101-0000-x.md"), "outside", 300);
  const t = tree(data, key);
  symlinkSync(join(outside, "keep"), join(t.hb, "summaries", "linked-agent"));
  symlinkSync(victim, join(t.hb, "summaries", "kevin", "20260101-0000-link.md"));
  // A project whose handbacks/ is a link, and a project folder that is a link.
  mkdirSync(join(data, "projects", "p2"), { recursive: true }); symlinkSync(join(outside, "keep"), join(data, "projects", "p2", "handbacks"));
  const other = put(join(outside, "proj3", "handbacks", "full", "kevin", "20260101-0000-y.md"), "outside", 300);
  symlinkSync(join(outside, "proj3"), join(data, "projects", "p3"));
  pruneHandbacks(data, NOW);
  assert.ok(existsSync(victim), "file behind links kept");
  assert.ok(existsSync(other), "file behind a linked project folder kept");
  assert.equal(readFileSync(victim, "utf8"), "outside");
  assert.ok(existsSync(join(t.hb, "summaries", "linked-agent")), "the link itself is left alone");
  assert.ok(lstatSync(join(t.hb, "summaries", "kevin", "20260101-0000-link.md")).isSymbolicLink(), "an old file link is left alone too");
  assert.ok(!existsSync(t.oldSum), "the real old files beside them still go");
});

test("prune with a linked data folder works on its real path; projects/ as a link is not entered", () => {
  const real = fresh(), link = join(fresh(), "data"); symlinkSync(real, link);
  const t = tree(real);
  assert.equal(pruneHandbacks(link, NOW).files, 4);
  assert.ok(existsSync(t.young));
  const data = fresh(), outside = fresh();
  const victim = put(join(outside, "k", "handbacks", "full", "kevin", "20260101-0000-x.md"), "outside", 300);
  symlinkSync(outside, join(data, "projects"));
  assert.deepEqual(pruneHandbacks(data, NOW), { files: 0, dirs: 0 });
  assert.ok(existsSync(victim));
  assert.deepEqual(pruneHandbacks(join(data, "missing"), NOW), { files: 0, dirs: 0 }, "a missing folder is not an error");
});

test("sweep's own check: a folder reached through a link (as after a swap) is not entered", () => {
  // The Dirent filter in the caller hides this layer; call it the way a swap between listing and entering would.
  const real = fresh(), base = fresh(), link = join(base, "agent");
  const victim = put(join(real, "20260101-0000-x.md"), "outside", 300);
  symlinkSync(real, link);
  const out = { files: 0, dirs: 0 };
  assert.equal(sweep(link, NOW, out), false);
  assert.deepEqual(out, { files: 0, dirs: 0 });
  assert.ok(existsSync(victim));
});

test("startPrune runs at once and then every day, with an injected clock; stop ends it", () => {
  const data = fresh(); let now = NOW; const lines: string[] = [];
  mock.timers.enable({ apis: ["setInterval"] });
  const t = tree(data);
  const stop = startPrune(data, { now: () => now, log: (l) => lines.push(l) });
  assert.ok(!existsSync(t.oldSum) && existsSync(t.young), "first pass at start");
  assert.match(lines[0], /^crew board: removed 4 hand-back files older than 60 days and 2 empty folders$/);
  now += 2 * DAY_MS; mock.timers.tick(DAY_MS);
  assert.ok(!existsSync(t.young), "a day later the 59-day file is past 60 days (61) and goes");
  stop();
  const late = put(join(t.hb, "summaries", "kevin", "20260101-0000-late.md"), "old", 100, now);
  mock.timers.tick(5 * DAY_MS);
  assert.ok(existsSync(late), "no pass after stop");
});

test("startPrune on the real clock: a 61-day-old file goes, today's stays; failures log a fixed line", () => {
  const data = fresh(), hb = handbacksDir(data, "shop-00000001");
  const old = put(join(hb, "summaries", "kevin", "a.md"), "x", 61, Date.now());
  const today = put(join(hb, "summaries", "kevin", "b.md"), "x", 0, Date.now());
  startPrune(data, { log: () => {} })();
  assert.ok(!existsSync(old) && existsSync(today));
  const lines: string[] = [];
  startPrune(data, { now: () => { throw new Error(`/secret/path ${data}`); }, log: (l) => lines.push(l) })();
  assert.deepEqual(lines, ["crew board: hand-back clean-up failed; it will try again tomorrow"]);
});

test("the board server prunes at start (BOARD_LOG_DIR is its data folder)", async () => {
  const data = fresh(), t = tree(data);
  const child = spawn(process.execPath, ["--no-warnings", join(import.meta.dirname, "..", "server.ts")], {
    env: { ...process.env, BOARD_LOG_DIR: data, BOARD_PORT: String(20000 + Math.floor(Math.random() * 20000)), BOARD_REGISTRY_FILE: join(data, "projects.json") }, stdio: "ignore" });
  try {
    // server.json is written just before the prune starts: wait for the prune itself.
    for (let i = 0; i < 100 && existsSync(t.oldSum); i++) await new Promise((r) => setTimeout(r, 50));
    assert.ok(existsSync(join(data, "server.json")), "server started");
    assert.ok(!existsSync(t.oldSum) && existsSync(t.young));
    assert.ok(existsSync(t.events));
  } finally { child.kill("SIGTERM"); }
});
