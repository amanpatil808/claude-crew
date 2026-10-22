// Multi-project behaviour: project names on events, the registry, per-project config, the retired
// characters, prefixed agent types, and the /api/state additions the screen reads.
import "./env.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { toEvent } from "../hook.ts";
import { appendEvent } from "../lib/events.ts";
import { crewFrom, loadRoles, roleFor } from "../lib/crew.ts";
import { REGISTRY_FILE } from "../lib/paths.ts";
import { configFor, parseConfig } from "../lib/project-config.ts";
import { projectKey, projectName, readRegistry, type Project } from "../lib/projects.ts";
import { pollBox, pollGithub } from "../lib/pollers.ts";
import { remoteCommand } from "../lib/sources.ts";
import { ALIASES, RETIRED, ROSTER } from "../lib/roster.ts";
import { buildState } from "../lib/state.ts";

const registry: Project[] = [
  { path: "/work/acme", name: "Acme Shop", firstSeen: "2026-10-01T00:00:00Z", lastSeen: "2026-10-22T00:00:00Z" },
  { path: "/work/acme/tools", name: "Acme Tools" },
  { path: "/work/blog", name: "Blog" },
];

test("project name: deepest registered folder wins, else the folder name", () => {
  assert.equal(projectName("/work/acme/src/x", registry), "Acme Shop");
  assert.equal(projectName("/work/acme/tools/b", registry), "Acme Tools");
  assert.equal(projectName("/work/acmex", registry), "acmex");      // a sibling that only shares a prefix is not inside it
  assert.equal(projectName("/elsewhere/side-project", registry), "side-project");
  assert.equal(projectName(undefined, registry), undefined);
  assert.match(projectKey("/work/Acme Shop!"), /^acme-shop-[0-9a-f]{8}$/);
});

test("registry accepts an array or { projects }, and skips bad rows", () => {
  const dir = mkdtempSync(join(tmpdir(), "crew-reg-"));
  writeFileSync(join(dir, "a.json"), JSON.stringify([registry[0], { path: 3 }, "x"]));
  writeFileSync(join(dir, "b.json"), JSON.stringify({ projects: [registry[2]] }));
  writeFileSync(join(dir, "c.json"), "{ not json");
  assert.deepEqual(readRegistry(join(dir, "a.json")).map((p) => p.name), ["Acme Shop"]);
  assert.deepEqual(readRegistry(join(dir, "b.json")).map((p) => p.name), ["Blog"]);
  assert.deepEqual(readRegistry(join(dir, "c.json")), []);
  assert.deepEqual(readRegistry(join(dir, "missing.json")), []);
});

test("hook events carry the project: CLAUDE_PROJECT_DIR first, then cwd; the registry names it", () => {
  writeFileSync(REGISTRY_FILE, JSON.stringify(registry));
  const start = { hook_event_name: "SubagentStart", session_id: "abcdef123456", agent_id: "a1", agent_type: "toon-crew:tom", cwd: "/somewhere/else" };
  assert.equal(toEvent(start, () => false, () => undefined, { CLAUDE_PROJECT_DIR: "/work/acme/src" })?.project, "Acme Shop");
  assert.equal(toEvent(start, () => false, () => undefined, {})?.project, "else");
  assert.equal(toEvent({ ...start, cwd: undefined }, () => false, () => undefined, {})?.project, undefined);
  const assign = toEvent({ hook_event_name: "PostToolUse", tool_name: "Agent", tool_input: { subagent_type: "toon-crew:tom", description: "run" } }, () => false, () => undefined, { CLAUDE_PROJECT_DIR: "/work/blog" });
  assert.equal(assign?.project, "Blog");
});

test("project.md Board section: only checked values are accepted", () => {
  const md = [
    "# Notes", "- github: not/in/the/section", "## Board",
    "- github: acme/shop", "- branches: main, feat/x", "- deploy-ssh: ops@box.example", "- deploy-result: /var/lib/shop/result",
    "- deploy-log: ~/shop/deploy.log", "- deploy-containers: shop-api-1, shop-worker-1", "## Other", "- github: acme/other",
  ].join("\n");
  assert.deepEqual(parseConfig(md), { github: "acme/shop", branches: ["main", "feat/x"], deploy: { ssh: "ops@box.example", result: "/var/lib/shop/result", log: "~/shop/deploy.log", containers: ["shop-api-1", "shop-worker-1"] } });
  // anything that could change the command line is dropped
  const bad = parseConfig("## Board\n- github: a/b; rm -rf /\n- branches: main, $(x)\n- deploy-ssh: -oProxyCommand=x@y\n- deploy-result: /a b; id");
  assert.deepEqual(bad, { github: undefined, branches: ["main"], deploy: undefined });
  assert.deepEqual(parseConfig("no board section here"), { github: undefined, branches: ["main"], deploy: undefined });
  const cmd = remoteCommand({ ssh: "ops@box.example", result: "/var/lib/shop/result", containers: ["shop-api-1"] });
  assert.match(cmd, /^cat \/var\/lib\/shop\/result 2>\/dev\/null; echo @@c:shop-api-1; docker logs --tail 500 shop-api-1/);
});

test("a project with no project.md has no poller: polling does nothing and writes nothing", async () => {
  const dir = mkdtempSync(join(tmpdir(), "crew-proj-"));
  const p: Project = { path: dir, name: "Bare" };
  assert.deepEqual(configFor(p), { branches: ["main"] });
  await pollGithub(p);
  await pollBox(p);
  assert.equal(buildState().snapshots["Bare"], undefined);   // not registered here, and no state file was created
  mkdirSync(join(dir, ".claude", "crew"), { recursive: true });
  writeFileSync(join(dir, ".claude", "crew", "project.md"), "## Board\n- deploy-ssh: ops@box.example\n");   // half a deploy check: still nothing
  assert.equal(configFor(p).deploy, undefined);
});

test("retired characters count for their new role; prefixed and numbered types too", () => {
  const roles = loadRoles();
  for (const [old, now] of [["dekisugi", "chhota-bheem"], ["suneo", "shizuka"], ["ninja-hattori", "bob-the-builder"], ["shaktimaan", "scrooge"]] as const) {
    assert.equal(roleFor(old, roles)?.id, now);
    assert.equal(roleFor(`toon-crew:${old}`, roles)?.id, now);
    assert.equal(ALIASES[old], now);
  }
  assert.equal(roleFor("toon-crew:tom", roles)?.id, "tom");
  assert.equal(roleFor("toon-crew:chip-and-dale-2", roles)?.id, "chip-and-dale");
  assert.equal(roleFor("general-purpose", roles), undefined);
  assert.equal(roleFor(undefined, roles)?.id, "doraemon");
  const crew = crewFrom([
    { id: "1", ts: "2026-10-22T10:00:00Z", kind: "agent-start", text: "", agentId: "n1", agentType: "ninja-hattori" },
    { id: "2", ts: "2026-10-22T10:01:00Z", kind: "agent-start", text: "", agentId: "t1", agentType: "toon-crew:tom" },
  ], roles);
  assert.deepEqual(crew.map((c) => [c.agentId, c.roleId]).sort(), [["n1", "bob-the-builder"], ["t1", "tom"]]);
});

test("the roster has 13 roles and the retired list points at real roles", () => {
  assert.equal(ROSTER.length, 13);
  assert.equal(new Set(ROSTER.map((r) => r.id)).size, 13);
  assert.deepEqual(RETIRED.map((r) => [r.id, r.mergedInto]), [["dekisugi", "chhota-bheem"], ["suneo", "shizuka"], ["ninja-hattori", "bob-the-builder"], ["shaktimaan", "scrooge"]]);
  assert.ok(RETIRED.every((r) => r.name && r.show && ROSTER.some((x) => x.id === r.mergedInto)));
});

test("/api/state: projects, per-member project, retired, snapshots", () => {
  writeFileSync(REGISTRY_FILE, JSON.stringify(registry));
  const at = new Date(Date.now() - 60_000);
  appendEvent({ project: "Acme Shop", kind: "agent-start", agentId: "s1", agentType: "toon-crew:shinchan", text: "shinchan started" }, at);
  appendEvent({ project: "Blog", kind: "agent-start", agentId: "d1", agentType: "dekisugi", text: "dekisugi started" }, at);
  appendEvent({ project: "Blog", kind: "agent-stop", agentId: "d1", agentType: "dekisugi", text: "dekisugi finished: shipped" }, new Date(at.getTime() + 1000));
  appendEvent({ project: "Ghost", kind: "main-busy", text: "Manager at work" }, new Date());   // seen in events, never registered
  const s = buildState();
  assert.deepEqual(s.projects.map((p) => [p.name, p.working]), [["Acme Shop", 1], ["Acme Tools", 0], ["Blog", 0], ["Ghost", 0]]);
  assert.equal(s.projects[3].path, "");
  assert.equal(s.focus, "Ghost");
  const member = (id: string) => s.room.members.find((m) => m.id === id);
  assert.equal(member("shinchan")?.status, "working");
  assert.equal(member("shinchan")?.project, "Acme Shop");
  assert.equal(member("chhota-bheem")?.status, "done");            // Dekisugi's stop counts for Chhota Bheem
  assert.equal(member("chhota-bheem")?.project, undefined);        // only working members have a place
  assert.equal(member("doraemon")?.project, "Ghost");              // his heartbeat came from there
  assert.equal(s.room.roles.length, 13);
  assert.deepEqual(s.room.retired.map((r) => r.id), ["dekisugi", "suneo", "ninja-hattori", "shaktimaan"]);
  assert.deepEqual(Object.keys(s.snapshots).sort(), ["Acme Shop", "Acme Tools", "Blog"]);
  assert.ok(Array.isArray(s.ci) && Array.isArray(s.prs) && s.deploy === null);
});
