// F7: the gh and ssh pollers run only while a page asked /api/state in the last 5 minutes, poll at once when a page
// comes back, and the server shuts down (server.json removed) after 2 hours with no page. Ninja I1: frame-ancestors.
import "./env.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createServer, request } from "node:http";
import type { AddressInfo } from "node:net";
import { CSP, handle, startBoard } from "../server.ts";
import { IDLE_EXIT_MS, markRefresh, startPolling, VIEWER_WINDOW_MS, viewerClock, type Polling } from "../lib/pollers.ts";
import { SERVER_FILE } from "../lib/paths.ts";
import type { Project } from "../lib/projects.ts";

const wait = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
const until = async (cond: () => boolean, ms = 4000) => { for (const end = Date.now() + ms; !cond() && Date.now() < end;) await wait(10); return cond(); };
const get = (port: number, path: string) => new Promise<{ status: number; headers: Record<string, unknown> }>((ok, fail) => {
  const req = request({ host: "127.0.0.1", port, path, headers: { host: `127.0.0.1:${port}` }, timeout: 5000 }, (res) => {
    res.resume().on("end", () => ok({ status: res.statusCode ?? 0, headers: res.headers }));
  });
  req.on("timeout", () => req.destroy(new Error("timeout"))).on("error", fail).end();
});
const SHOP: Project = { name: "shop", path: "/work/shop", board: true };

test("viewer clock: a page counts for 5 minutes; a request after that is a return; idle counts from the start", () => {
  let t = 1_000_000;
  const v = viewerClock(() => t);
  assert.equal(VIEWER_WINDOW_MS, 5 * 60_000);
  assert.equal(IDLE_EXIT_MS, 2 * 3_600_000);
  assert.equal(v.watched(), false, "nobody yet");
  t += 1000;
  assert.equal(v.idleMs(), 1000);
  assert.equal(v.seen(), true, "the first page is a return");
  assert.equal(v.watched(), true);
  t += VIEWER_WINDOW_MS;
  assert.equal(v.watched(), true, "the window's edge still counts");
  assert.equal(v.seen(), false, "a page that kept asking");
  t += VIEWER_WINDOW_MS + 1;
  assert.equal(v.watched(), false);
  assert.equal(v.idleMs(), VIEWER_WINDOW_MS + 1);
  assert.equal(v.seen(), true, "back after a gap");
});

test("with no viewer the timer rounds poll nothing; a wake polls at once; a viewer gets the timers back", async () => {
  let watched = false;
  const calls: string[] = [];
  const p = startPolling({
    githubMs: 15, boxMs: 15, refresh: false, watched: () => watched, registry: () => [SHOP],
    github: async () => { calls.push("gh"); }, box: async () => { calls.push("ssh"); },
  });
  try {
    await wait(120);
    assert.deepEqual(calls, [], "many idle rounds, no gh or ssh call");
    watched = true;
    p.wake();
    await until(() => calls.includes("gh") && calls.includes("ssh"), 500);
    assert.ok(calls.includes("gh") && calls.includes("ssh"), "polled at once");
    await wait(80);
    assert.ok(calls.filter((c) => c === "gh").length > 2, "the timer runs again while watched");
    watched = false;
    await wait(40);
    const n = calls.length;
    await wait(80);
    assert.equal(calls.length, n, "idle again: nothing");
  } finally { p.stop(); }
});

test("a wake with no viewer still polls nothing, and a long timer is skipped only by a wake", async () => {
  let watched = false;
  const calls: string[] = [];
  const p = startPolling({ githubMs: 3_600_000, boxMs: 3_600_000, refresh: false, watched: () => watched, registry: () => [SHOP], github: async () => { calls.push("gh"); }, box: async () => {} });
  try {
    await wait(20);
    p.wake();
    await wait(20);
    assert.deepEqual(calls, []);
    watched = true;
    p.wake();
    assert.equal(await until(() => calls.length === 1, 200), true, "an hour-long timer did not hold the poll back");
  } finally { p.stop(); }
});

test("a refresh marker still polls GitHub with no viewer (a crew command asked for it)", async () => {
  const calls: string[] = [];
  const p = startPolling({ githubMs: 3_600_000, boxMs: 3_600_000, watched: () => false, registry: () => [SHOP], github: async (x) => { calls.push(x.name); }, box: async () => {} });
  try {
    await wait(50);
    markRefresh("shop");
    assert.equal(await until(() => calls.length > 0, 5000), true);
    assert.deepEqual(calls, ["shop"]);
  } finally { p.stop(); }
});

test("the server wakes the pollers when a page returns, passes them the viewer test, and only /api/state counts", async () => {
  let wakes = 0, watched: () => boolean = () => true, exits = 0;
  const stub = (w: () => boolean): Polling => { watched = w; return { stop: () => {}, wake: () => { wakes++; } }; };
  const board = await startBoard({ ports: [0], polling: stub, upkeep: false, exit: () => { exits++; } });
  try {
    assert.equal(watched(), false, "no page yet");
    assert.equal(existsSync(SERVER_FILE), true);
    assert.equal((await get(board.port, "/")).status, 200);
    assert.equal(wakes, 0, "the page itself is not a viewer poll");
    assert.equal((await get(board.port, "/api/state")).status, 200);
    assert.equal(wakes, 1, "a page came: poll at once");
    assert.equal(watched(), true);
    await get(board.port, "/api/state");
    assert.equal(wakes, 1, "a page that keeps asking does not wake again");
  } finally { board.shutdown(); }
  assert.equal(exits, 1);
  assert.equal(existsSync(SERVER_FILE), false, "server.json removed");
});

test("the server exits after the idle time with no page, and not while a page asks", async () => {
  let exited: number | null = null;
  const board = await startBoard({ ports: [0], idleExitMs: 250, checkMs: 10, upkeep: false, polling: () => ({ stop: () => {}, wake: () => {} }), exit: (c) => { exited = c; } });
  try {
    for (let i = 0; i < 8; i++) { await get(board.port, "/api/state"); await wait(60); }
    assert.equal(exited, null, "480 ms with a page asking every 60 ms");
    assert.equal(await until(() => exited !== null, 2000), true, "gone once the page stopped");
    assert.equal(exited, 0, "a clean exit");
    assert.equal(existsSync(SERVER_FILE), false, "server.json removed");
    await assert.rejects(get(board.port, "/api/state"), "the port is closed");
  } finally { board.shutdown(); }
});

test("pages carry frame-ancestors 'none': no other site can frame the board", async () => {
  assert.match(CSP, /(^|; )frame-ancestors 'none'(;|$)/);
  const server = createServer((req, res) => handle(req, res, () => ({})));
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  const { port } = server.address() as AddressInfo;
  try {
    const r = await get(port, "/");
    assert.equal(r.status, 200);
    assert.match(String(r.headers["content-security-policy"]), /(^|; )frame-ancestors 'none'(;|$)/);
  } finally { server.closeAllConnections(); server.close(); }
});
