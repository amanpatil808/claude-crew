// Fast board refresh: (a) a command that changes GitHub makes the server poll that project at once, (b) /api/state
// answers 304 to a matching ETag, (c) the page skips parse and repaint on 304. No test calls GitHub: the poll is a stub.
import "./env.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, request } from "node:http";
import type { AddressInfo } from "node:net";
import { existsSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { leaveRefreshMarker } from "../hook.ts";
import { markRefresh, refreshDir, refreshWanted, watchRefresh } from "../lib/pollers.ts";
import type { Project } from "../lib/projects.ts";
import { handle } from "../server.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const shop: Project = { path: "/work/shop", name: "shop", board: true };
const quiet: Project = { path: "/work/quiet", name: "quiet" };   // board not approved

function watcher(poll: (p: Project) => Promise<void>) {
  const dir = mkdtempSync(join(tmpdir(), "crew-refresh-"));
  const stop = watchRefresh({ dir, registry: () => [shop, quiet], poll, debounceMs: 60, everyMs: 15 });
  return { dir, stop };
}

test("which commands ask for a refresh", () => {
  for (const c of ["gh pr merge 5 --squash", "gh pr create --fill", "gh pr close 5", "gh pr ready 5", "git push -u origin feat/x", "cd x && git push"]) assert.equal(refreshWanted(c), true, c);
  for (const c of ["gh pr list", "gh pr view 5", "git status", "git commit -m push", "echo hi", "gh run list"]) assert.equal(refreshWanted(c), false, c);
});

test("a marker starts one GitHub poll for its project within the debounce; two quick markers share it", async () => {
  const polled: string[] = [];
  const { dir, stop } = watcher(async (p) => { polled.push(p.name); });
  try {
    markRefresh("shop", dir);
    await sleep(40);
    markRefresh("shop", dir);   // still inside the 60 ms window
    await sleep(250);
    assert.deepEqual(polled, ["shop"]);
  } finally { stop(); }
});

test("a project without board: true, or an unknown one, is never polled", async () => {
  const polled: string[] = [];
  const { dir, stop } = watcher(async (p) => { polled.push(p.name); });
  try {
    markRefresh("quiet", dir);
    markRefresh("nobody", dir);
    await sleep(250);
    assert.deepEqual(polled, []);
  } finally { stop(); }
});

test("a marker that was already there when the server started does not fire", async () => {
  const polled: string[] = [];
  const dir = mkdtempSync(join(tmpdir(), "crew-refresh-"));
  markRefresh("shop", dir);
  const stop = watchRefresh({ dir, registry: () => [shop], poll: async (p) => { polled.push(p.name); }, debounceMs: 30, everyMs: 15 });
  try { await sleep(200); assert.deepEqual(polled, []); } finally { stop(); }
});

test("at most one poll runs at a time; a marker during a poll queues exactly one more", async () => {
  let running = 0, peak = 0, runs = 0;
  const { dir, stop } = watcher(async () => { runs++; peak = Math.max(peak, ++running); await sleep(150); running--; });
  try {
    markRefresh("shop", dir);
    await sleep(120);          // the first poll has started
    markRefresh("shop", dir);
    await sleep(40);
    markRefresh("shop", dir);  // second window, still while the first poll runs
    await sleep(700);
    assert.equal(peak, 1);
    assert.equal(runs, 2);
  } finally { stop(); }
});

test("the hook leaves a marker for merge/create/push and nothing else, and the marker holds only the project name", async () => {
  const env = { CLAUDE_PROJECT_DIR: "/work/shop" };
  const bash = (command: string) => ({ hook_event_name: "PostToolUse", tool_name: "Bash", tool_input: { command }, cwd: "/tmp" });
  const files = () => (existsSync(refreshDir()) ? readdirSync(refreshDir()) : []);
  await leaveRefreshMarker(bash("gh pr list"), env);
  await leaveRefreshMarker(bash("git status"), env);
  await leaveRefreshMarker({ ...bash("gh pr merge 5"), tool_name: "Read" }, env);
  assert.deepEqual(files(), []);
  await leaveRefreshMarker(bash("gh pr merge 5 --squash --body hunter2-planted"), env);
  assert.equal(files().length, 1);
  const text = readFileSync(join(refreshDir(), files()[0]), "utf8");
  assert.deepEqual(JSON.parse(text), { project: "shop" });
  assert.ok(!text.includes("hunter2"));
  await leaveRefreshMarker(bash("git push origin main"), env);
  assert.equal(files().length, 1, "same project, same marker file");
});

// ---- ETag ----
async function serve(state: () => unknown) {
  const server = createServer((req, res) => handle(req, res, state));
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  const { port } = server.address() as AddressInfo;
  const get = (headers: Record<string, string> = {}) => new Promise<{ status?: number; etag?: string; cache?: string; body: string }>((ok, fail) => {
    request({ host: "127.0.0.1", port, path: "/api/state", headers: { host: `127.0.0.1:${port}`, ...headers }, timeout: 3_000 }, (r) => {
      let body = "";
      r.on("data", (d) => (body += d)).on("end", () => ok({ status: r.statusCode, etag: r.headers.etag, cache: r.headers["cache-control"], body }));
    }).on("error", fail).end();
  });
  return { get, close: () => { server.closeAllConnections(); server.close(); } };
}

test("/api/state: strong ETag, 304 on a match, 200 with a new tag after a change; the clock field does not count", async () => {
  let crew = "idle", tick = 0;
  const s = await serve(() => ({ now: `t${++tick}`, crew }));
  try {
    const a = await s.get();
    assert.equal(a.status, 200);
    assert.match(a.etag ?? "", /^"[A-Za-z0-9_-]{20,}"$/);
    assert.equal(a.cache, "private, no-cache");
    const same = await s.get({ "if-none-match": a.etag! });
    assert.deepEqual([same.status, same.body, same.etag], [304, "", a.etag]);
    assert.equal((await s.get({ "if-none-match": `W/${a.etag}` })).status, 304);
    assert.equal((await s.get({ "if-none-match": `"other", ${a.etag}` })).status, 304);
    assert.equal((await s.get({ "if-none-match": '"other"' })).status, 200);
    crew = "busy";
    const b = await s.get({ "if-none-match": a.etag! });
    assert.equal(b.status, 200);
    assert.notEqual(b.etag, a.etag);
    assert.equal(JSON.parse(b.body).crew, "busy");
  } finally { s.close(); }
});

test("the Host check still comes first", async () => {
  const s = await serve(() => ({}));
  try { assert.equal((await s.get({ host: "evil.example" })).status, 403); } finally { s.close(); }
});

// ---- the page ----
// room.js is a browser script; its poll loop is cut out of the file and run here with a stub fetch and spies.
const src = readFileSync(join(import.meta.dirname, "..", "room.js"), "utf8");
const loop = src.slice(src.indexOf("let pollT = 0"), src.indexOf('document.addEventListener("visibilitychange"'));
function page() {
  const calls: { init: { headers?: Record<string, string> } }[] = [], log = { painted: 0, parsed: 0, conn: [] as unknown[] };
  const queue: { status: number; tag?: string; json?: unknown }[] = [];
  const fetchStub = async (_url: string, init: { headers?: Record<string, string> }) => {
    calls.push({ init });
    const r = queue.shift()!;
    return { status: r.status, ok: r.status >= 200 && r.status < 300, headers: { get: (k: string) => (k === "etag" ? r.tag ?? null : null) }, json: async () => { log.parsed++; return r.json; } };
  };
  const make = new Function("fetch", "setConn", "paintAll", "document", "setTimeout", "clearTimeout", "AbortController",
    `let last = null; ${loop}; return { tick, last: () => last };`);
  const api = make(fetchStub, (ok: boolean, s: unknown) => log.conn.push([ok, s]), () => log.painted++, { hidden: true }, () => 0, () => undefined, AbortController);
  return { api, queue, calls, log };
}

test("page: sends If-None-Match, skips parse and repaint on 304, repaints on a changed 200", async () => {
  const p = page();
  p.queue.push({ status: 200, tag: '"a"', json: { v: 1 } });
  await p.api.tick();
  assert.deepEqual([p.log.parsed, p.log.painted, p.calls[0].init.headers], [1, 1, undefined]);
  p.queue.push({ status: 304 });
  await p.api.tick();
  assert.equal(p.calls[1].init.headers?.["If-None-Match"], '"a"');
  assert.deepEqual([p.log.parsed, p.log.painted], [1, 1], "no parse, no repaint");
  assert.equal(p.log.conn.length, 2, "the Live line still updates");
  p.queue.push({ status: 200, tag: '"b"', json: { v: 2 } });
  await p.api.tick();
  assert.deepEqual([p.log.parsed, p.log.painted, p.api.last()], [2, 2, { v: 2 }]);
  assert.equal(p.calls[2].init.headers?.["If-None-Match"], '"a"');
});

test("page: a failed answer still counts as a failure (backoff stays)", async () => {
  const p = page();
  p.queue.push({ status: 500 });
  await p.api.tick();
  assert.deepEqual(p.log.conn, [[false, undefined]]);
  assert.equal(p.log.painted, 0);
});
