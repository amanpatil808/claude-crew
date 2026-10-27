// The served page carries the travel styles: travel.css after room.css, travel.js after room.js, one page, CSP unchanged.
import "./env.ts";
import assert from "node:assert/strict";
import { createServer, request } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { Script } from "node:vm";
import { handle } from "../server.ts";

test("the page inlines travel.css after room.css and travel.js after room.js, and the CSP stays strict", async () => {
  const server = createServer((req, res) => handle(req, res, () => ({})));
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  const { port } = server.address() as AddressInfo;
  try {
    const r = await new Promise<{ body: string; csp?: string | string[] }>((ok, fail) => {
      request({ host: "127.0.0.1", port, path: "/", headers: { host: `127.0.0.1:${port}` } }, (res) => {
        let body = ""; res.on("data", (d) => (body += d)).on("end", () => ok({ body, csp: res.headers["content-security-policy"] }));
      }).on("error", fail).end();
    });
    const page = r.body;
    assert.ok(page.includes("Crew Room travel styles"), "travel.css is inlined");
    assert.ok(page.includes("window.crewTravel = function"), "travel.js is inlined");
    assert.ok(page.indexOf("window.crewTravel = function") > page.indexOf("async function rTrip"), "travel.js comes after room.js");
    assert.ok(page.indexOf("Crew Room travel styles") > page.indexOf("#view-room .walker .fig"), "travel.css comes after room.css");
    assert.ok(!/<script[^>]+src=|<link[^>]+href=/.test(page), "still one self-contained page");
    assert.equal(r.csp, "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src data:; base-uri 'none'; form-action 'none'");
    // the inlined script still parses as one classic script
    const js = page.slice(page.lastIndexOf("<script>") + 8, page.lastIndexOf("</script>"));
    assert.doesNotThrow(() => new Script(js));
  } finally { server.closeAllConnections(); server.close(); }
});
