// toon-crew mod (Claude Code 2.1.287+, on by default): hands the plan's rate-limit readings to the Crew Room board.
// Claude Code's `session.measure` event carries the account's 5-hour and weekly windows (claude.ai subscriptions only)
// after each turn. This keeps their percentages and reset times, plus whether the plan is a subscription, and sets
// them in one environment variable, TOON_CREW_LIMITS. The board's async Stop hook (board/limits.ts) copies it into
// the plugin's data folder, which a mod cannot name.
// Its only calls are $.clock.now and $.env.set of that one variable: no files, processes, network, model or credential.

// Claude Code's window names to the board's; a gateway's spend_limit is a dollar limit, not a plan window.
const WINDOW = new Map([['five_hour', '5h'], ['seven_day', '7d']]);
const MAX_WINDOWS = 8;

const iso = (ms) => (Number.isFinite(ms) && Math.abs(ms) <= 8.64e15 ? new Date(ms).toISOString() : null);

// The reading for one measurement, or null when it says nothing yet (no window and no answered request).
// sub: a 5-hour or weekly window means a claude.ai subscription; responses with none (the session has a cost, or a
// gateway reports only a spend limit) mean per-token billing.
export function readingOf(e, nowMs) {
  const at = iso(nowMs);
  if (!e || typeof e !== 'object' || !at) return null;
  const w = [];
  let spend = false;
  for (const x of (Array.isArray(e.rateLimits) ? e.rateLimits : []).slice(0, MAX_WINDOWS)) {
    if (!x || typeof x !== 'object') continue;
    if (x.kind === 'spend_limit') { spend = true; continue; }
    const id = typeof x.kind === 'string' ? WINDOW.get(x.kind) : undefined;
    if (!id || w.some((q) => q.id === id) || typeof x.percentUsed !== 'number' || !Number.isFinite(x.percentUsed)) continue;
    const pct = Math.min(100, Math.max(0, Math.round(x.percentUsed * 10) / 10));
    w.push({ id, pct, end: typeof x.resetsAt === 'string' ? iso(Date.parse(x.resetsAt)) : null });
  }
  const usd = e.cost && typeof e.cost === 'object' ? e.cost.usd : undefined;
  const answered = spend || (typeof usd === 'number' && usd > 0);
  if (!w.length && !answered) return null;
  return { v: 1, at, sub: w.length > 0, w };
}

export function register(on) {
  on('session.measure', async ($, e, next) => {
    try {
      const reading = readingOf(e, await $.clock.now());
      if (reading) await $.env.set('TOON_CREW_LIMITS', JSON.stringify(reading));
    } catch { /* a reading is never worth disturbing the session */ }
    return next(e);
  });
}
