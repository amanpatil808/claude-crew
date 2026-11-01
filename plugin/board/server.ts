// Local live board: serves page.html and one JSON endpoint, and runs the pollers in the same
// process so a single stop command turns everything off. Bound to 127.0.0.1 only.
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { LOG_DIR, SERVER_FILE } from "./lib/paths.ts";
import { startPrune } from "./lib/handbacks.ts";
import { writePrivate } from "./lib/private-fs.ts";
import { startPolling } from "./lib/pollers.ts";
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

// Exported for tests, which pass their own state builder; the server passes nothing.
export function handle(req: IncomingMessage, res: ServerResponse, state: () => unknown = () => buildState()) {
  // A Host check blocks DNS-rebinding: a web page elsewhere cannot read this through a lookalike name.
  const host = (req.headers.host ?? "").replace(/:\d+$/, "");
  if (host !== "127.0.0.1" && host !== "localhost") { res.writeHead(403).end(); return; }
  const headers = { "cache-control": "no-store", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer" };
  if (req.method !== "GET") { res.writeHead(405, headers).end(); return; }
  if (req.url === "/api/state") {
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
    res.writeHead(200, { ...headers, "content-type": "text/html; charset=utf-8",
      "content-security-policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src data:; base-uri 'none'; form-action 'none'" })
      .end(page);
  } else res.writeHead(404, headers).end();
}

// Takes the first free port from BOARD_PORT (default 8811) up to +9, so a second copy or another tool does not block it.
function listen(i = 0) {
  if (i >= PORTS.length) { console.error(`no free port in ${PORTS[0]}-${PORTS[PORTS.length - 1]}`); process.exit(1); }
  const server = createServer(handle);
  server.once("error", () => listen(i + 1));
  server.listen(PORTS[i], "127.0.0.1", () => {
    writePrivate(SERVER_FILE, JSON.stringify({ pid: process.pid, port: PORTS[i], startedAt: new Date().toISOString() }));
    console.log(`crew board on http://127.0.0.1:${PORTS[i]}`);
    const stopPolling = startPolling();
    const stopPrune = startPrune(LOG_DIR); // hand-back files older than 60 days: now, then daily
    const shutdown = () => { stopPolling(); stopPrune(); server.close(); rmSync(SERVER_FILE, { force: true }); process.exit(0); };
    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
  });
}

// Only when run as the board server (board.sh), never when a test imports handle().
if (import.meta.main) listen();
