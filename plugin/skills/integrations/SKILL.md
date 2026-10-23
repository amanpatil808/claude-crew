---
name: integrations
description: Checklist for code that calls any third-party API or service - read-only by default, host, method and path allow-lists, host pinning and redirects, OAuth scopes and keys, rate limits and retries, paging caps, redaction and safe errors, background jobs and commit-time re-checks. Use when building or reviewing an integration.
---

# Integrations checklist: third-party APIs and background jobs

Use this while you plan, build or review anything that talks to another service. Each guard needs a test that would fail if the guard broke. The project's `CLAUDE.md` and `.claude/crew/project.md` say which services exist and what each may do; they win when they are stricter.

## 1. Read-only by default
- Write down what each integration may do in one sentence (for example "read invoices, nothing else"). The code enforces that sentence, not good intentions.
- If a write is truly needed, name it in the brief, allow-list it on its own, and give it an idempotency key.
- Prove the limit with tests that would fail if an unlisted method, host, path or tool were reachable.

## 2. Allow-lists and host pinning
- Allow-list the exact host, the method and an anchored path pattern for every call. Use HTTPS only.
- Re-check every redirect hop: same-host redirects only, and drop credentials on any host change.
- Cap response size and request time.
- When a reply supplies the next URL (paging links, callbacks), it must match the allow-list and the exact path you expect; a path prefix alone is not enough.
- When a request body decides what an endpoint returns (a generic query or "fetch page" call), pin the body to the one thing you need.

## 3. Keys, OAuth and tool servers
- Request the smallest scope; check the scope actually granted on every token response; never use extra scopes a provider grants by default.
- Store tokens and API keys sealed at rest (see `security-backend`), never in logs, errors or responses.
- Revoke tokens when the user disconnects.
- For MCP or other tool servers: enforce the tool allow-list in the client and again in the transport layer.

## 4. Rate limits and failures
- Respect the provider's limits: a token bucket per provider, a concurrency cap and a minimum gap per user.
- Retry only safe calls, with backoff and jitter; honour `Retry-After`; cap attempts.
- A circuit breaker stops calls to a failing service; a kill switch stops one integration without a deploy.
- Classify failures into a few kinds (auth, rate limit, provider down, bad reply) and handle each on purpose.
- A login that "expired" but never once worked usually means a wrong call sequence, not an expired session: compare with a known-good sequence first.

## 5. Paging and completeness
- Bound every loop and every pager, and keep a seen-set so a repeating cursor can't spin forever.
- When a cap stops a read early, record the result as partial (and how far it got). Never let a silent cap mark unread data as complete.
- Know whether each API can stop at a given date or id; if it can't, plan for re-reading from the start.

## 6. Errors, logs and stored data
- Errors are fixed strings built from the failure kind; never pass provider text through to users or logs.
- Use a redacting logger, and also mask the exact secret values the code opened (a redactor can't spot an opaque token in free text).
- Store the least data the feature needs; never store card numbers, payment ids or other sensitive fields you don't use.
- Build mappers from a real, sanitised response you captured, never from guesses or docs alone.

## 7. Background jobs
- Pure decision modules (is it due, may it run, what was the outcome) with an injected clock; thin I/O around them.
- Scheduler jitter comes from a stable hash; re-drawing it each tick pulls every job early.
- Claim jobs with leases (`SKIP LOCKED` or equivalent), bounded attempts and graceful shutdown that finishes or releases leases.
- Enforce cooldowns where the work runs, not only through a queued run-after time; merged jobs can keep an earlier time.
- List every path that skips an enqueue (paused, dropped after max attempts) so no gap stays open silently.

## 8. The commit after a call
- Save a call's result in one transaction that re-checks account state, consent and kill switches inside it. Otherwise data deleted or withdrawn while the call ran comes back.
- Lock rows in one fixed order everywhere, or two paths can deadlock.
- Test the race: disconnect or withdraw consent while a call is in flight, then check nothing was stored.

## 9. Tests
- Stub all third-party traffic; tests and dev runs never call the real service.
- Keep captured fixtures sanitised: no real names, tokens or personal data.

## Done when
- Each guard that applies has a test, listed as "rule -> test file:name" in your hand-back.
- For a fix: the new test fails on the code without the fix and passes with it.
- Open questions (unconfirmed endpoints, scopes, limits) are in the hand-back, highest impact first.
