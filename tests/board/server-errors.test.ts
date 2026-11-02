// [I4] The page server: a state build that throws answers a fixed 500 instead of crashing the process, and never
// echoes the error. Imports handle() only; importing server.ts never starts a server.
import "./env.ts";
import assert from "node:assert/strict";
import { createServer, request } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { handle } from "../../plugin/board/server.ts";

// A server on an ephemeral port whose state builder the test swaps between requests.
async function serve(state: () => unknown) {
  let build = state;
  const server = createServer((req, res) => handle(req, res, () => build()));
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  const { port } = server.address() as AddressInfo;
  const get = (path: string) => new Promise<{ status?: number; type?: string; body: string }>((ok, fail) => {
    const q = request({ host: "127.0.0.1", port, path, headers: { host: `127.0.0.1:${port}` }, timeout: 3_000 }, (r) => {
      let body = "";
      r.on("data", (d) => (body += d)).on("end", () => ok({ status: r.statusCode, type: r.headers["content-type"], body }));
    });
    // A request the server never answers fails after 3 s instead of hanging the run.
    q.on("timeout", () => q.destroy(new Error("no answer from the server"))).on("error", fail).end();
  });
  const close = () => { server.closeAllConnections(); server.close(); };
  return { get, swap: (next: () => unknown) => { build = next; }, close };
}

test("a state build that throws answers 500 with a fixed text, and the same server keeps serving", async () => {
  const marker = "/Users/someone/private planted-secret-marker";
  const s = await serve(() => { throw new Error(marker); });
  try {
    const r = await s.get("/api/state");
    assert.equal(r.status, 500);
    assert.equal(r.type, "text/plain");
    assert.equal(r.body, "board state unavailable");
    s.swap(() => ({ ok: true }));
    const next = await s.get("/api/state");
    assert.deepEqual([next.status, next.body], [200, '{"ok":true}']);
  } finally { s.close(); }
});

test("the default builder is the real buildState", async () => {
  const server = createServer((req, res) => handle(req, res));
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  const { port } = server.address() as AddressInfo;
  try {
    const status = await new Promise<number | undefined>((ok, fail) => {
      request({ host: "127.0.0.1", port, path: "/api/state", headers: { host: "localhost" } }, (r) => { r.resume(); ok(r.statusCode); }).on("error", fail).end();
    });
    assert.equal(status, 200);
  } finally { server.close(); }
});
