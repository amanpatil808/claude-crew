// Local live board: serves page.html and one JSON endpoint, and runs the pollers in the same
// process so a single stop command turns everything off. Bound to 127.0.0.1 only.
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { readFileSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { EVENTS_FILE, LOG_DIR, SERVER_FILE } from "./lib/paths.ts";
import { cacheLiveLog, startCompaction } from "./lib/events.ts";
import { startPrune } from "./lib/handbacks.ts";
import { writePrivate } from "./lib/private-fs.ts";
import { IDLE_EXIT_MS, startPolling, viewerClock, type Polling } from "./lib/pollers.ts";
import { buildState } from "./lib/state.ts";

const DIR = import.meta.dirname;
// The page is one file for the browser (strict CSP, no extra requests): the Crew Room css and js are inlined here.
const readPage = () => readFileSync(join(DIR, "page.html"), "utf8")
  .replace("/*ROOM_CSS*/", () => readFileSync(join(DIR, "room.css"), "utf8") + "\n" + readFileSync(join(DIR, "travel.css"), "utf8"))
  .replace("/*ROOM_JS*/", () => readFileSync(join(DIR, "room.js"), "utf8") + "\n" + readFileSync(join(DIR, "travel.js"), "utf8"));
const BASE = Number(process.env.BOARD_PORT) || 8811;
const PORTS = Array.from({ length: 10 }, (_, i) => BASE + i);

// Strong ETag: a hash of the body without its own clock (`now` changes on every build and would never match).
function etagOf(state: unknown, body: string): string {
  const stable = state && typeof state === "object" && "now" in state ? JSON.stringify({ ...state, now: undefined }) : body;
  return `"${createHash("sha256").update(stable).digest("base64url").slice(0, 27)}"`;
}
// If-None-Match is a list of tags (or *); a weak prefix still matches for this comparison.
const matches = (header: string | string[] | undefined, etag: string) =>
  String(header ?? "").split(",").some((t) => { const v = t.trim(); return v === "*" || v.replace(/^W\//, "") === etag; });

// frame-ancestors: no other page may frame the board (clickjacking); the board itself frames nothing.
export const CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

// Exported for tests, which pass their own state builder; the server passes nothing. `onView` hears every
// /api/state request that passed the Host check: the pollers run only while a page asks.
export function handle(req: IncomingMessage, res: ServerResponse, state: () => unknown = () => buildState(), onView?: () => void) {
  // A Host check blocks DNS-rebinding: a web page elsewhere cannot read this through a lookalike name.
  const host = (req.headers.host ?? "").replace(/:\d+$/, "");
  if (host !== "127.0.0.1" && host !== "localhost") { res.writeHead(403).end(); return; }
  const headers = { "cache-control": "no-store", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer" };
  if (req.method !== "GET") { res.writeHead(405, headers).end(); return; }
  if (req.url === "/api/state") {
    try { onView?.(); } catch { /* a viewer hook never fails the page */ }
    // An error thrown here would end the whole process (and the pollers with it). The answer is a fixed line:
    // the error's own text can carry paths or log content.
    let body: string, etag: string;
    try {
      const st = state();
      body = JSON.stringify(st);
      etag = etagOf(st, body);
    } catch { res.writeHead(500, { ...headers, "content-type": "text/plain" }).end("board state unavailable"); return; }
    // The tag is sent with the 304 too (RFC 9110). The page asks every 2 s and a quiet board answers with no body.
    const tagged = { ...headers, "cache-control": "private, no-cache", etag };
    if (matches(req.headers["if-none-match"], etag)) { res.writeHead(304, tagged).end(); return; }
    res.writeHead(200, { ...tagged, "content-type": "application/json" }).end(body);
  } else if (req.url === "/" || req.url?.startsWith("/?")) {
    let page: string;
    try { page = readPage(); } catch { res.writeHead(500, { ...headers, "content-type": "text/plain" }).end("page.html is missing from the board folder"); return; }
    res.writeHead(200, { ...headers, "content-type": "text/html; charset=utf-8", "content-security-policy": CSP }).end(page);
  } else res.writeHead(404, headers).end();
}

export interface BoardOptions {
  ports?: number[];
  now?: () => number;
  idleExitMs?: number;                                   // exit after this long with no page asking (default 2 h)
  checkMs?: number;                                      // how often the idle check runs (default 1 min)
  polling?: (watched: () => boolean) => Polling;        // tests pass a stub; the board runs the real pollers
  upkeep?: boolean;                                      // hand-back prune and log compaction (default true)
  exit?: (code: number) => void;
}
export interface Board { port: number; shutdown: () => void }

// Takes the first free port from BOARD_PORT (default 8811) up to +9, so a second copy or another tool does not block it.
// The server reads only appended log bytes, compacts the log at start and daily, polls only while a page looks,
// and shuts down (server.json removed) after idleExitMs with no page.
export function startBoard(o: BoardOptions = {}): Promise<Board> {
  const ports = o.ports ?? PORTS, now = o.now ?? Date.now, exit = o.exit ?? ((code: number) => process.exit(code));
  const viewers = viewerClock(now);
  let polling: Polling | undefined;
  const onView = () => { if (viewers.seen()) polling?.wake(); };
  cacheLiveLog();   // buildState and the pollers read only the bytes appended since the last request
  const state = () => buildState(now());
  return new Promise((ok, fail) => {
    const attempt = (i: number) => {
      if (i >= ports.length) { fail(new Error(`no free port in ${ports[0]}-${ports[ports.length - 1]}`)); return; }
      const server = createServer((req, res) => handle(req, res, state, onView));
      server.once("error", () => attempt(i + 1));
      server.listen(ports[i], "127.0.0.1", () => {
        const port = (server.address() as AddressInfo).port;
        writePrivate(SERVER_FILE, JSON.stringify({ pid: process.pid, port, startedAt: new Date(now()).toISOString() }));
        polling = (o.polling ?? ((watched) => startPolling({ watched })))(viewers.watched);
        const upkeep = o.upkeep !== false;
        const stopPrune = upkeep ? startPrune(LOG_DIR) : () => undefined;            // hand-back files older than 60 days
        const stopCompact = upkeep ? startCompaction({ file: EVENTS_FILE }) : () => undefined;
        let done = false;
        const shutdown = () => {
          if (done) return;
          done = true;
          clearInterval(idle);
          polling?.stop(); stopPrune(); stopCompact();
          cacheLiveLog(false);
          server.closeAllConnections();
          server.close();
          rmSync(SERVER_FILE, { force: true });
          exit(0);
        };
        const idle = setInterval(() => { if (viewers.idleMs() >= (o.idleExitMs ?? IDLE_EXIT_MS)) shutdown(); }, o.checkMs ?? 60_000);
        idle.unref();   // the listening server keeps the process alive, not this timer
        ok({ port, shutdown });
      });
    };
    attempt(0);
  });
}

// Only when run as the board server (board.sh), never when a test imports handle().
if (import.meta.main) {
  startBoard().then(({ port, shutdown }) => {
    console.log(`crew board on http://127.0.0.1:${port}`);
    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
  }, (err: Error) => { console.error(err.message); process.exit(1); });
}
