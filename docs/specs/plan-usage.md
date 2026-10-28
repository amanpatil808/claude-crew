# Plan usage panel (contract, 0.3.12)

The cost panel adapts to the owner's plan:
- **Subscription (Max, Pro, Team):** show how much of the plan's 5-hour and weekly limits is used, and each agent's share of that usage. Flag agents that use much more than the others.
- **API (pay per token):** keep today's dollar ledger unchanged.
- **Unknown:** show agent shares and dollars, labelled as an API-price estimate.

## /api/state field

`state.plan: PlanState | null` (null when lib/plan.ts is missing or throws; the page then shows the old ledger).

```ts
interface PlanLimit {
  id: "5h" | "7d";
  label: string;            // "5-hour" | "Weekly"
  usedPct: number | null;   // 0-100 from the real rate limits; null when not known
  resetsAt: string | null;  // ISO UTC; null when not known
}
interface AgentShare {
  role: string;             // crew id, "doraemon" for the main session, "other" for generic runs
  sharePct: number;         // 0-100: this agent's share of usage in the window (estimated by API price)
  planPct: number | null;   // sharePct * usedPct / 100 when usedPct is known, else null
  heavy: boolean;           // uses much more than the others (rule below)
}
interface PlanShares { window: "5h" | "7d"; agents: AgentShare[] }   // agents sorted by sharePct, highest first
interface PlanState {
  kind: "subscription" | "api" | "unknown";
  name: string | null;      // "Max" | "Pro" | "Team" ... only when a source says so
  source: "rate-limits" | "setting" | "none";
  limits: PlanLimit[];      // [] for api
  shares: PlanShares[];     // both windows; [] when there is no usage
  basis: string;            // one plain line on how shares are estimated
  updatedAt: string | null; // when the limits were last read
}
```

**Heavy rule:** `heavy = sharePct >= 20 && sharePct >= 2 * (100 / n)`, where n is the number of agents with usage in that window. Doraemon counts like everyone else.

**Shares:** each agent's token usage in the window, weighted by its model's API price (Opus uses limits faster than Haiku). The 5-hour window needs hour-level buckets, not just day buckets.

## Page classes (Nobita styles them, Shinchan renders them)

| Class | What it is |
|---|---|
| `.plan` | the panel |
| `.plan-head` | plan name + source line |
| `.plan-limit` | one limit row (label, bar, % and reset time) |
| `.plan-bar` / `.plan-fill` | the bar; the fill width comes from `--pct` (0-100) |
| `.plan-fill.warn` / `.plan-fill.full` | at 75% or more / at 90% or more |
| `.plan-reset` | "resets 14:30" text |
| `.plan-tabs` | 5-hour / Weekly toggle for the shares |
| `.plan-share` | the per-agent list |
| `.plan-row` | one agent: avatar, name, share bar, `sharePct`, `planPct` |
| `.plan-row.heavy` + `.plan-badge` | heavy agent and its "uses more" badge |
| `.plan-note` | the `basis` line, small and muted |

Desktop only; light and dark; no new requests (CSP default-src 'none').
