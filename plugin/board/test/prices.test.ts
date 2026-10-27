// Price table: every rate column, the Haiku long-prompt tier, fast mode, web search, no guessing for unknown
// models, and the stale flag.
import "./env.ts";
import assert from "node:assert/strict";
import { test } from "node:test";
import { isStale, PRICE_NOTE, PRICES_AS_OF, PRICES_SOURCE, priceRows, pricesInfo, ratesFor, rowUsd, STALE_AFTER_DAYS, type PricedRow } from "../lib/prices.ts";

const M = 1_000_000;
const row = (model: string, f: Partial<PricedRow> = {}): PricedRow => ({ model, speed: "standard", long: false, in: 0, out: 0, cw5m: 0, cw1h: 0, cr: 0, ws: 0, ...f });
const DAY = 86_400_000;
const asOf = Date.parse(`${PRICES_AS_OF}T00:00:00Z`);

test("each rate column is used once, per million tokens (Opus 5.5)", () => {
  assert.equal(rowUsd(row("claude-opus-5-5", { in: M })), 4);
  assert.equal(rowUsd(row("claude-opus-5-5", { out: M })), 20);
  assert.equal(rowUsd(row("claude-opus-5-5", { cw5m: M })), 5);
  assert.equal(rowUsd(row("claude-opus-5-5", { cw1h: M })), 8);
  assert.equal(rowUsd(row("claude-opus-5-5", { cr: M })), 0.2);
  assert.equal(rowUsd(row("claude-sonnet-5-5", { in: M, out: M, cw5m: M, cw1h: M, cr: M })), 2 + 10 + 2.5 + 4 + 0.1);
});

test("the current lineup is priced", () => {
  for (const m of ["claude-fable-5-1", "claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"]) assert.ok(ratesFor(m, "standard", false), m);
});

test("Haiku 5.5 prompts over 100K use the higher tier; other models have one tier", () => {
  assert.deepEqual(ratesFor("claude-haiku-5-5", "standard", false), { in: 0.1, out: 0.5, cw5m: 0.125, cw1h: 0.2, cr: 0.01 });
  assert.deepEqual(ratesFor("claude-haiku-5-5", "standard", true), { in: 0.5, out: 2.5, cw5m: 0.625, cw1h: 1, cr: 0.05 });
  assert.deepEqual(ratesFor("claude-opus-5-5", "standard", true), ratesFor("claude-opus-5-5", "standard", false));
});

test("fast mode is 2x where it exists and unpriced where it does not", () => {
  assert.equal(rowUsd(row("claude-opus-5-5", { speed: "fast", in: M, out: M })), 48);
  assert.equal(rowUsd(row("claude-opus-4-8", { speed: "fast", in: M })), 10);
  assert.equal(rowUsd(row("claude-sonnet-5-5", { speed: "fast", in: M })), null);
});

test("web search is $10 per 1,000 searches on top of tokens", () => {
  assert.equal(rowUsd(row("claude-sonnet-5-5", { ws: 1000 })), 10);
});

test("a dated snapshot id is the same model; anything else unknown gets no price", () => {
  assert.equal(rowUsd(row("claude-haiku-4-5-20251001", { in: M })), 1);
  for (const m of ["unknown", "claude-opus-9", "claude-opus-5-5-preview", "opus", "__proto__", "constructor", "claude-mythos-5-1"])
    assert.equal(rowUsd(row(m, { in: M })), null, m);
});

test("an unknown model gives null usd, never 0; a mix prices what it can and names the rest", () => {
  assert.deepEqual(priceRows([row("claude-mystery-1", { in: M, out: M })]), { usd: null, unpriced: ["claude-mystery-1"] });
  assert.deepEqual(priceRows([row("claude-mystery-1", { in: M }), row("claude-opus-5-5", { in: M })]), { usd: 4, unpriced: ["claude-mystery-1"] });
  assert.deepEqual(priceRows([]), { usd: 0, unpriced: [] });
  assert.deepEqual(priceRows([row("claude-opus-5-5")]), { usd: 0, unpriced: [] });
});

test("totals are rounded once, to 1/100 of a cent", () => {
  assert.equal(priceRows([row("claude-haiku-5-5", { in: 1 }), row("claude-haiku-5-5", { in: 1, long: true })]).usd, 0);
  assert.equal(priceRows([row("claude-sonnet-5-5", { cr: 1_234_567 })]).usd, 0.1235);
});

test(`the table is stale after ${STALE_AFTER_DAYS} days, and an unreadable date is stale`, () => {
  assert.equal(isStale(PRICES_AS_OF, asOf), false);
  assert.equal(isStale(PRICES_AS_OF, asOf + STALE_AFTER_DAYS * DAY), false);
  assert.equal(isStale(PRICES_AS_OF, asOf + STALE_AFTER_DAYS * DAY + 1), true);
  assert.equal(isStale("not a date", asOf), true);
  assert.deepEqual(pricesInfo(asOf + 91 * DAY), { asOf: PRICES_AS_OF, source: PRICES_SOURCE, stale: true, note: PRICE_NOTE });
  assert.equal(pricesInfo(asOf + DAY).stale, false);
});

test("the source is the official pricing page and the note says estimate, not a bill", () => {
  assert.equal(PRICES_SOURCE, "https://platform.claude.com/docs/en/about-claude/pricing");
  assert.match(PRICES_AS_OF, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(PRICE_NOTE, /Estimated/);
  assert.match(PRICE_NOTE, /Not a bill/);
});
