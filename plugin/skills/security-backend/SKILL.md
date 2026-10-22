---
name: security-backend
description: Checklist for backend code that holds personal data, logins or secrets - schema and migrations, per-user scoping and isolation tests, sessions and cookies, passkeys and OIDC, encryption and key handling, consent, export and account deletion, safe errors and logs. Use when building or reviewing such code.
---

# Security checklist: data, auth and secrets

Use this while you plan, build or review. Every rule you apply needs a test that fails if the rule breaks. The project's `CLAUDE.md` and `.claude/crew/project.md` say which of these apply and where the code lives; they win when they are stricter.

## 1. Data and queries
- Every query on personal data is scoped to its owner (`user_id` or the project's equivalent). No "fetch by id" without the owner in the same query.
- Write an isolation test for each route or repository: user A can't read, change or delete user B's data.
- Admin routes repeat the role check inside the handler, not only in a router guard.
- Migrations are numbered and checksummed. Check the next free number (or the one the manager reserved for you) before adding one. Say whether each migration is reversible.
- State that must survive a restart or run on several instances (pending logins, challenges, queues) lives in a table, not in process memory.
- Store only what you need. When you only ever look a value up (a phone number, an email for matching), store a keyed hash (HMAC), not the value.

## 2. Secrets and encryption
- Secrets are sealed with envelope encryption: a per-user data key, wrapped by a master key the app never stores beside the data.
- Additional authenticated data (AAD) binds each sealed value to its owner and its purpose, so a value can't be swapped between users or fields.
- Account deletion destroys the user's data key (crypto-shred), then deletes the rows. Say plainly what backups still hold and for how long.
- Context strings, notice versions and other shared constants live in one shared module, not copied per app.
- Only claim "encrypted" for the fields that really are. Plain rows scoped by user are not encrypted rows.

## 3. Sessions and requests
- Session tokens are random, stored hashed at rest, rotated at sign-in, and expire.
- Cookies: `HttpOnly`, `Secure`, `SameSite`; test the browsers the project supports (one browser's cookie rules on plain `http://localhost` can differ).
- CSRF protection on every write (a custom header or token). No CORS unless the design needs it, and then an exact origin list.
- Body size limits, security headers, strict content types.
- Rate limits keyed on the real client address. Behind a proxy, the client-IP source is explicit config, or every request collapses into one bucket.

## 4. Sign-in
- Passkeys (WebAuthn): single-use, server-side challenges with a short expiry; verify origin and RP id.
- OIDC: `state`, `nonce` and PKCE on every flow; check the issuer and audience.
- Invites and one-time codes: single use, short expiry, attempt limits, constant-time compare.
- Prefer real verification at the boundary in tests (a software authenticator, a real test database) over mocks.

## 5. Consent, export and delete
- Consent is tied to a notice version; a new version asks again.
- Kill switches and pauses block new connections and fetches, but never block the way out (disconnect, export, delete).
- Export includes everything the user's account holds; delete removes everything, including derived rows, and the tests prove both.
- Work already running re-checks account state and consent at commit time (see `guarded-integrations`).

## 6. Errors, logs and responses
- Errors are fixed strings built from an error kind. Never echo provider text, tokens, cookies, codes or personal data.
- Logs pass through a redactor, and also mask the exact secret values the code opened (a redactor can't spot an opaque token in free text).
- Responses never carry secrets, raw identifiers you stored as hashes, or another user's data.
- Routes that need ETag revalidation use `Cache-Control: private, no-cache`; `no-store` breaks the 304 path.

## 7. Code
- Strict types; no escape hatches and no silenced lint or type errors.
- Small, single-purpose modules. Short comments only where the reason isn't obvious, especially security decisions.

## Done when
- Each rule above that applies has a test, listed as "rule -> test file:name" in your hand-back.
- For a fix: the new test fails on the code without the fix and passes with it.
- The project's full test, lint and typecheck commands pass with services up.
