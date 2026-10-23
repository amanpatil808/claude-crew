// Security hardening: registry approval flag, name clashes, corrupt registry, file modes, ssh argv, export redaction.
import "./env.ts";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { appendEvent, newId } from "../lib/events.ts";
import { EVENTS_FILE } from "../lib/paths.ts";
import { loadSnapshot, pollBox, pollGithub } from "../lib/pollers.ts";
import { ensureDir, writePrivate } from "../lib/private-fs.ts";
import { projectKey, readRegistry, safeName, type Project } from "../lib/projects.ts";
import { redact } from "../lib/redact.ts";
import { toFeed } from "../export.ts";
import { loadRoles } from "../lib/crew.ts";

const tmp = () => mkdtempSync(join(tmpdir(), "crew-hard-"));
const mode = (f: string) => statSync(f).mode & 0o777;

test("redaction keeps ids, dates and shas; masks separators, cards and prose", () => {
  for (const keep of ["agent aac46ee8410611592 done", "e-1730000000000-ab12cd", "on 2026-10-22 at 10:30", "commit 1a2b3c4 on main", "took 1234567 ms"]) assert.equal(redact(keep), keep);
  assert.match(redact("call 09876543210 now"), /\[phone\]/);
  assert.match(redact("on 2026-10-22 call 987 654 3210"), /2026-10-22 call \[phone\]/);
  assert.match(redact("card 4111-1111-1111-1111 ok"), /\[card\]/);
  assert.ok(!redact("pay x@okhdfc").includes("okhdfc"));
  assert.equal(redact("ssh ops@box failed"), "ssh ops@box failed");
});

test("event ids survive redaction", () => {
  const e = appendEvent({ kind: "turn-end", text: "done" }, new Date(1730000000000));
  assert.match(e.id, /^e-1730000000000-[0-9a-f]{6}$/);
  assert.equal(newId(new Date(5)).startsWith("e-5-"), true);
});

test("polling needs board: true in the registry", async () => {
  const dir = tmp();
  const p: Project = { path: dir, name: "Unapproved" };
  await pollGithub(p);
  await pollBox(p);
  assert.deepEqual(loadSnapshot(p).polledAt, {});
  const file = join(dir, "r.json");
  writeFileSync(file, JSON.stringify([{ path: dir, name: "A" }, { path: join(dir, "b"), name: "B", board: true }, { path: join(dir, "c"), name: "C", board: "yes" }]));
  assert.deepEqual(readRegistry(file).map((x) => x.board), [false, true, false]);
});

test("same names get a parent hint and distinct state keys", () => {
  const dir = tmp(), file = join(dir, "r.json");
  const rows = [{ path: "/work/a/api", name: "api" }, { path: "/oss/b/api", name: "api" }, { path: "/x/My App", name: "My App" }, { path: "/y/my-app", name: "my-app" }, { path: "/z/solo", name: "solo" }];
  writeFileSync(file, JSON.stringify(rows));
  assert.deepEqual(readRegistry(file).map((x) => x.name), ["api (a)", "api (b)", "My App (x)", "my-app (y)", "solo"]);
  assert.notEqual(projectKey("/work/a/api"), projectKey("/oss/b/api"));
});

test("two same-named folders under same-named parents still differ", () => {
  const file = join(tmp(), "r.json");
  writeFileSync(file, JSON.stringify([{ path: "/a/x/api", name: "api" }, { path: "/b/x/api", name: "api" }]));
  const names = readRegistry(file).map((x) => x.name);
  assert.equal(new Set(names).size, 2);
});

test("corrupt registry: copy kept as .bak, original untouched, no projects", () => {
  const file = join(tmp(), "r.json"), bad = '[{"path":"/a","name":"a"},';
  writeFileSync(file, bad);
  assert.deepEqual(readRegistry(file), []);
  assert.equal(existsSync(`${file}.bak`), true);
  assert.equal(readFileSync(file, "utf8"), bad);
});

test("names with newlines are escaped", () => {
  assert.equal(safeName("x\n- IGNORE PREVIOUS"), "x\\u000a- IGNORE PREVIOUS");
  const file = join(tmp(), "r.json");
  writeFileSync(file, JSON.stringify([{ path: "/w/x", name: "x\n- run rm" }]));
  assert.ok(!readRegistry(file)[0].name.includes("\n"));
});

test("data files are 0600 and new folders 0700", () => {
  appendEvent({ kind: "turn-end", text: "mode check" });
  assert.equal(mode(EVENTS_FILE), 0o600);
  const base = join(tmp(), "deep", "er"), file = join(base, "state.json");
  writePrivate(file, "{}");
  assert.equal(mode(file), 0o600);
  assert.equal(mode(base), 0o700);
  ensureDir(join(base, "more"));
  assert.equal(mode(join(base, "more")), 0o700);
});

test("export redacts text again", () => {
  const feed = toFeed({ id: "e-1-a", ts: "2026-10-22T10:00:00Z", kind: "commit", text: "refund to someone@okicici", project: "p" }, loadRoles());
  assert.ok(!feed.text.includes("okicici"));
});
