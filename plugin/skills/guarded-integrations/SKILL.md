---
name: guarded-integrations
description: Checklist for code that calls outside services - allow-listed HTTP and MCP clients, OAuth scopes, redirects and reply-supplied URLs, paging caps, redaction, connector errors, and background workers (scheduling, leases, rate limits, circuit breakers, kill switches, commit-time re-checks). Use when building or reviewing integrations or workers.
---

# Guarded integrations checklist: connectors and workers

Use this while you plan, build or review anything that talks to another service or runs in the background. Each guard needs a test that would fail if the guard broke. The project's `CLAUDE.md` and `.claude/crew/project.md` say which services exist and what each may do; they win when they are stricter.

## 1. Read-only by construction
- Write down what each connector may do in one sentence (for example "read orders, nothing else"). The code enforces that sentence, not good intentions.
- Prove it with tests that would fail if a write method, an unlisted host, an unlisted path or an unlisted tool existed.
- Never call real providers in tests or dev runs; stub all provider traffic.

## 2. Guarded HTTP
- Allow-list the exact host, the method and an anchored path pattern for every call.
- Re-check every redirect hop; allow same-host redirects only, and drop credentials on any host change.
- Cap response size and time.
- When a reply supplies the next URL, it must match the policy and the exact path you expect; a path allow-list alone is not enough.
- When a request body decides what an endpoint returns (a generic "fetch page" call), pin the body to the one page you need.

## 3. MCP and OAuth
- Enforce the tool allow-list in the client and again in the transport.
- Pin the scope you request; check the granted scope on every token response. Know which extra scopes a provider grants by default, and never use them.
- Revoke tokens on disconnect.

## 4. Paging and coverage
- Bound every loop and every pager, and keep a seen-set so a repeating cursor can't spin.
- A page or call cap ends a read as partial and records the oldest day actually read; coverage starts after that day. A silent cap marks unread time as covered.
- Keep coverage as one merged span per source; never mark a read that doesn't touch it, or the days in between count as read.
- Know whether each source can stop at an end date. A newest-first source re-reading a gap walks everything since the start, so only re-queue gaps for sources that read by date range.

## 5. Errors, logs and payment data
- Connector errors are fixed strings built from error kinds; never pass provider text through.
- Use a redacting logger, and also mask the exact secret values you opened.
- Store the least payment detail that serves the feature (a payment kind), never card digits or payment ids.
- An "expired login" on an account that never once succeeded usually means a broken call sequence, not an expired session: compare with the working sequence first.

## 6. Workers
- Pure decision modules (is it due, may it run, what was the outcome) with an injected clock; thin I/O around them.
- Scheduler jitter comes from a stable hash; re-drawing it each tick pulls every job early.
- Claim jobs with leases (`SKIP LOCKED` or equivalent); bounded attempts; graceful shutdown that finishes or releases leases.
- Rate limits per provider (token buckets), concurrency slots, a minimum gap per user, circuit breakers and kill switches.
- Enforce cooldowns where the work runs, not only through a queued run-after time; job merges keep the earliest time.
- List every path that skips an enqueue (paused, dropped after max attempts); a skipped path leaves a gap open silently.

## 7. The success commit
- Commit a fetch's result in one transaction that re-checks account state, consent and kill switches inside it. Otherwise data deleted or withdrawn during the fetch comes back.
- Lock in a fixed order (for example the account row, then consent) everywhere both are changed, or two paths can deadlock.
- Test the race: disconnect or withdraw consent while a fetch is in flight, then check nothing was stored.

## Done when
- Each guard that applies has a test, listed as "rule -> test file:name" in your hand-back.
- For a fix: the new test fails on the code without the fix and passes with it.
- Open questions (unconfirmed endpoints, scopes, provider limits) are in the hand-back, highest impact first.
