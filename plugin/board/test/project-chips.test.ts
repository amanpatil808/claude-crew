import "./env.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Runs the real renderProjects from room.js against small stubs, and records the chip order it hands to fill().
const src = readFileSync(fileURLToPath(new URL("../room.js", import.meta.url)), "utf8");
const start = src.indexOf("function renderProjects(s)");
const body = src.slice(start, src.indexOf("\n}\n", start) + 3);
assert.ok(start > 0 && body.includes("fill(nav"));

function harness() {
  let painted: string[] = [];
  const mk = () => ({ dataset: {} as Record<string, string>, setAttribute() {}, append() {}, type: "" , onclick: null as unknown, title: "" });
  const env = {
    rProj: "",
    tasksOf: (s: any) => s.tasks,
    rProjNames: (s: any) => s.projects.map((p: any) => p.name),
    needList: () => [],
    $: () => ({ hidden: false }),
    changed: () => true,
    rel: () => mk(),
    icon: () => ({}),
    document: { createTextNode: () => ({}) },
    pick: () => {},
    fill: (_nav: unknown, ...chips: any[]) => { painted = chips.map((c) => c.dataset.k); },
  };
  const run = new Function(...Object.keys(env), `${body}; return renderProjects;`)(...Object.values(env));
  return { env, render: (s: unknown) => { run(s); return painted; } };
}

const names = ["claude-crew", "demo-apps-demo-app", "scratch-x", "amanpatil", "late-added"];
const state = (active: string[], queued: string[] = []) => ({
  projects: names.map((name) => ({ name })),
  tasks: { active: active.map((project) => ({ project })), queued: queued.map((project) => ({ project })) },
});

test("project chips keep registry order: selecting, activity and counts never reorder", () => {
  const h = harness();
  const before = h.render(state([]));
  assert.deepEqual(before, names);
  h.env.rProj = "scratch-x";                                    // select the third chip
  assert.deepEqual(h.render(state([])), names);
  assert.deepEqual(h.render(state(["amanpatil", "amanpatil", "late-added"], ["demo-apps-demo-app"])), names);   // activity and counts change
  h.env.rProj = "late-added";
  assert.deepEqual(h.render(state(["claude-crew"])), names);
});
