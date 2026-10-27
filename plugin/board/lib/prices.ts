// Anthropic API list prices for the cost ledger's estimate, in USD per million tokens. Hand-kept and offline:
// copy the numbers from SOURCE and move AS_OF with every change. The page shows them as an estimate, never a bill.

export interface Rates { in: number; out: number; cw5m: number; cw1h: number; cr: number }
interface ModelPrice { standard: Rates; fast?: Rates; long?: Rates }

// The usage fields a price needs (lib/usage.ts UsageRow has these and more).
export interface PricedRow { model: string; speed: "standard" | "fast"; long: boolean; in: number; out: number; cw5m: number; cw1h: number; cr: number; ws: number }

export const PRICES_AS_OF = "2026-10-27";   // read from SOURCE on this date
export const PRICES_SOURCE = "https://platform.claude.com/docs/en/about-claude/pricing";
export const STALE_AFTER_DAYS = 90;         // prices move at model launches; older than this, the page says so
export const PRICE_NOTE = "Estimated at Anthropic API list prices. Not a bill. Subscription plans are not billed per token.";
// Haiku 5.5 bills a request whose prompt (input + cache writes + cache reads) is over this at its higher rates.
export const LONG_PROMPT_TOKENS = 100_000;
export const WEB_SEARCH_USD = 10 / 1000;    // $10 per 1,000 searches, on top of tokens
export const WEB_FETCH_USD = 0;             // no fee beyond tokens

const r = (inp: number, out: number, cw5m: number, cw1h: number, cr: number): Rates => ({ in: inp, out, cw5m, cw1h, cr });

// Fast-mode cache rates are not listed on the page; they are its documented multipliers (5m write 1.25x,
// 1h write 2x, read 0.05x on Opus 5.5 and 0.1x elsewhere) applied to the fast input price.
const OPUS_5: ModelPrice = { standard: r(5, 25, 6.25, 10, 0.5), fast: r(10, 50, 12.5, 20, 1) };
const OPUS_4: ModelPrice = { standard: r(5, 25, 6.25, 10, 0.5) };
const SONNET_4: ModelPrice = { standard: r(3, 15, 3.75, 6, 0.3) };

// Exact Claude API ids only: an id that is not here gets no price (null), never a family guess.
// Mythos is left out (limited availability, id unconfirmed); retired models are left out.
const MODELS: Record<string, ModelPrice> = {
  "claude-fable-5-1": { standard: r(10, 50, 12.5, 20, 0.25) },
  "claude-fable-5": { standard: r(10, 50, 12.5, 20, 1) },
  "claude-opus-5-5": { standard: r(4, 20, 5, 8, 0.2), fast: r(8, 40, 10, 16, 0.4) },
  "claude-opus-5": OPUS_5,
  "claude-opus-4-8": OPUS_5,
  "claude-opus-4-7": OPUS_4,
  "claude-opus-4-6": OPUS_4,
  "claude-opus-4-5": OPUS_4,
  "claude-sonnet-5-5": { standard: r(2, 10, 2.5, 4, 0.1) },
  "claude-sonnet-5": { standard: r(2, 10, 2.5, 4, 0.2) },
  "claude-sonnet-4-6": SONNET_4,
  "claude-sonnet-4-5": SONNET_4,
  "claude-haiku-5-5": { standard: r(0.1, 0.5, 0.125, 0.2, 0.01), long: r(0.5, 2.5, 0.625, 1, 0.05) },
  "claude-haiku-4-5": { standard: r(1, 5, 1.25, 2, 0.1) },
};

// Pre-4.6 models also answer to a dated snapshot id ("claude-haiku-4-5-20251001"): the same model, same price.
const baseId = (model: string) => model.replace(/-\d{8}$/, "");

// The rates for one row, or null when the model, its fast mode or its long-prompt tier is not priced here.
export function ratesFor(model: string, speed: "standard" | "fast", long: boolean): Rates | null {
  const p = Object.hasOwn(MODELS, baseId(model)) ? MODELS[baseId(model)] : undefined;
  if (!p) return null;
  if (speed === "fast") return p.fast ?? null;
  return long && p.long ? p.long : p.standard;
}

// USD for one row, or null when it has no price.
export function rowUsd(row: PricedRow): number | null {
  const p = ratesFor(row.model, row.speed, row.long);
  if (!p) return null;
  return (row.in * p.in + row.out * p.out + row.cw5m * p.cw5m + row.cw1h * p.cw1h + row.cr * p.cr) / 1e6 + row.ws * WEB_SEARCH_USD;
}

// Total for a set of rows. Rows without a price are left out and named in `unpriced`; when every row is
// unpriced the total is null, so an unknown model never shows as $0. No rows at all is a true 0.
export function priceRows(rows: readonly PricedRow[]): { usd: number | null; unpriced: string[] } {
  let total = 0, known = 0;
  const unpriced = new Set<string>();
  for (const row of rows) {
    const usd = rowUsd(row);
    if (usd === null) unpriced.add(row.model);
    else { total += usd; known++; }
  }
  return { usd: rows.length && !known ? null : Math.round(total * 1e4) / 1e4, unpriced: [...unpriced].sort() };
}

const DAY_MS = 86_400_000;

// A table older than STALE_AFTER_DAYS (or with an unreadable date) is stale.
export function isStale(asOf: string, now: number): boolean {
  const at = Date.parse(`${asOf}T00:00:00Z`);
  return !Number.isFinite(at) || now - at > STALE_AFTER_DAYS * DAY_MS;
}

export function pricesInfo(now: number, asOf = PRICES_AS_OF) {
  return { asOf, source: PRICES_SOURCE, stale: isStale(asOf, now), note: PRICE_NOTE };
}
