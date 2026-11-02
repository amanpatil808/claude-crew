import "./env.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dir = new URL("../../plugin/board/", import.meta.url);
const js = readFileSync(new URL("room.js", dir), "utf8");
const html = readFileSync(new URL("page.html", dir), "utf8");

test("page has the plan panel host inside the cost card, hidden until state.plan says so", () => {
  assert.match(html, /<div class="plan" id="plan" hidden><\/div>/);
  assert.ok(html.indexOf('id="plan"') > html.indexOf('id="cost-body"'));
});

test("room.js renders every class of the plan contract and nothing from the data goes in as HTML", () => {
  for (const c of ["plan-head", "plan-limit", "plan-bar", "plan-fill", "plan-reset", "plan-tabs", "plan-share", "plan-row", "plan-badge", "plan-note"]) {
    assert.ok(js.includes(c), `missing class ${c}`);
  }
  assert.ok(js.includes('" warn"') && js.includes('" full"'), "warn and full tones");
  assert.ok(js.includes('"uses more"'), "heavy badge text");
  const plan = js.slice(js.indexOf("// ---- Plan usage"), js.indexOf("// ---- Tasks:"));
  assert.ok(plan.length > 500);
  assert.doesNotMatch(plan, /innerHTML|insertAdjacentHTML|replaceChildren/);
  assert.match(plan, /setProperty\("--pct"/);
  assert.doesNotMatch(plan, /\.style\.(?!setProperty)/, "only the --pct custom property is set inline");
});

test("page script still parses", () => {
  assert.doesNotThrow(() => new Function(js));
});
