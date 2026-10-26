// Board v2 server data: project on feed items, factsByProject, and two projects staying separate.
import "./env.ts";
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendEvent } from "../lib/events.ts";
import { EVENTS_FILE, REGISTRY_FILE, projectStateDir } from "../lib/paths.ts";
import { projectKey } from "../lib/projects.ts";
import { loadRoles } from "../lib/crew.ts";
import { roomFeed } from "../lib/room.ts";
import { buildState } from "../lib/state.ts";

// A project folder with a checked-out branch and, optionally, a deploy snapshot.
function project(name: string, branch: string, deploy?: { status: string; version: string }) {
  const path = mkdtempSync(join(tmpdir(), `crew-${name}-`));
  mkdirSync(join(path, ".git"));
  writeFileSync(join(path, ".git", "HEAD"), `ref: refs/heads/${branch}\n`);
  if (deploy) {
    const dir = projectStateDir(projectKey(path));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "state.json"), JSON.stringify({ deploy }));
  }
  return { path, name };
}

let clock = Date.parse("2026-10-26T10:00:00Z");
const log = (project: string, kind: "agent-start" | "agent-stop", text: string) =>
  appendEvent({ kind, agentId: `a-bob-${project}`, agentType: "toon-crew:bob", text, project }, new Date((clock += 1000)));

beforeEach(() => rmSync(EVENTS_FILE, { force: true }));

test("factsByProject: each registered project has its own Live version and Branch; room.facts stays", () => {
  const shop = project("shop", "feat/cart", { status: "ok", version: "v1.4.0" });
  const blog = project("blog", "main", { status: "failed", version: "v0.2.0" });
  const bare = project("bare", "dev");
  writeFileSync(REGISTRY_FILE, JSON.stringify([shop, blog, bare]));
  const s = buildState();
  assert.deepEqual(s.factsByProject, {
    shop: [{ label: "Live", value: "v1.4.0", tone: "ok" }, { label: "Branch", value: "feat/cart" }],
    blog: [{ label: "Live", value: "v0.2.0", tone: "bad" }, { label: "Branch", value: "main" }],
    bare: [{ label: "Branch", value: "dev" }],
  });
  assert.ok(Array.isArray(s.room.facts) && s.room.facts.some((f) => f.label === "Working"));
});

test("feed items carry their event's project; two projects stay separate", () => {
  log("shop", "agent-start", "bob started");
  log("blog", "agent-start", "bob started");
  log("shop", "agent-stop", "bob finished: shop done");
  const feed = buildState().room.feed;
  assert.deepEqual(feed.map((f) => [f.tone, f.project]), [["done", "shop"], ["start", "blog"], ["start", "shop"]]);
  const shopOnly = feed.filter((f) => f.project === "shop");
  assert.equal(shopOnly.length, 2);
  assert.ok(shopOnly.every((f) => !f.text.includes("blog")));
});

test("an event without a project gives a feed item without the field", () => {
  const feed = roomFeed([{ id: "e-1-aaaaaa", ts: "2026-10-26T10:00:00Z", kind: "pr", text: "PR #1 opened" }], loadRoles());
  assert.equal(feed.length, 1);
  assert.equal("project" in feed[0], false);
});
