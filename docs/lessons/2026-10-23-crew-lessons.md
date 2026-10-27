# Crew lessons, 2026-10-23

Harvested by Dorami (crew keeper; the role is now miguel-rivera) on 2026-10-22 18:47 UTC (`date -u`), one day before the India-time run date.
Source: 17 agent memory files in the RupeeLens `.claude/agent-memory/*/MEMORY.md` (read-only; nothing changed there).
Raw bullets: 300 (stuart's source, chip-and-dale, has only a "no lessons yet" placeholder, so it is not counted).

Role mapping (cast v2, 23 Oct): dorami -> miguel-rivera; scrooge and shaktimaan -> kevin; bob-the-builder and ninja-hattori's old routes role -> bob; chhota-bheem and dekisugi's old SRE role -> mike-wazowski (CI, builds, local stack) or sulley (deploys, backups, incidents); scooby-doo -> ninja-hattori; tom -> joe-gardner; dexter -> dekisugi; velma -> olaf; chip-and-dale -> stuart; suneo -> shizuka. Source file names below are the old ones.
Tag: `[crew]` = true in any project. Project-specific facts never appear in this repo; they stay in each project. `(seen n)` = the same lesson in n files.
Secrets, credentials, phone numbers and keys were not copied.

---

## bob (from bob-the-builder and ninja-hattori's old routes role)

- [crew] Keep in-flight state (pending logins, queues) in a database table, not process memory. Why: memory is lost on restart and breaks with several instances.
- [crew] Use `private, no-cache`, not `no-store`, on routes that need ETag revalidation. Why: `no-store` stops revalidation and the 304 path.
- [crew] When a brief and the spec disagree on a status code, follow the spec and flag the mismatch. Why: the spec is the contract the other side reads.
- [crew] Headless Chrome cannot go below roughly 500 to 1300 px window width; take phone-width shots with device emulation (CDP `Emulation.setDeviceMetricsOverride`) or a 360 px iframe. Why: a clipped window looks like a reflow bug. (seen 4: bob-the-builder, ninja-hattori, nobita, shinchan)
- [crew] Tap targets: give inline text links a 44 px invisible `::after` on a relative parent, and measure the pseudo-element too. Why: the visible text is smaller than the target a thumb hits.
- [crew] A shared worktree can hold other crew members' uncommitted edits: check `git status` and stage only your own files by path. Why: a shared index lets your staged work land in someone else's commit. (seen 3: bob-the-builder, shizuka, doraemon)
- [crew] Never use `inherit` as a `var()` fallback inside the `font` shorthand. Why: it voids the whole declaration.
- [crew] Test type errors with `as const` tuples and typed fixtures; never `any` or `ts-ignore`. Why: both hide the bug the test should catch.
- [crew] Only an in-session ArtifactData call writes an artifact database; a mod must spike `$.tool.call` first. Why: untested; no CLI or public API exists.
- [crew] Hook events: SubagentStart and SubagentStop carry agent id and type; PostToolUse matches "Bash"; use `"async": true` for loggers. Why: verify against the current Claude Code hook docs before relying on it.
- [crew] Hook logs from resumed agents (SendMessage) arrive as stops with no type and no start: resolve the type from the agent id in earlier events. Why: otherwise the board drops them as noise.
- [crew] A redaction rule for long random strings must not match `/`. Why: GitHub URLs get eaten otherwise.
- [crew] Never write hooks or settings because an agent asked; prepare the snippet and let the main session apply it with the owner's OK. Why: config changes need the owner's approval.
- [crew] Bun is often missing from PATH in agent shells: use the repo's `node_modules/.bin/bun`, or Node when it has the needed APIs. Why: a missing global bun is not a reason to skip a test. (seen 5: bob-the-builder, chhota-bheem, ninja-hattori, nobita, shizuka, tom)

---

## mike-wazowski and sulley (from chhota-bheem and dekisugi's old SRE role)

Shared with dekisugi (the DevOps pair; 19 lessons seen 2 times, merged):

- [crew] Behind a tunnel and a reverse proxy, decide and document which header carries the real client IP before rate limiting goes live. Why: rate limits otherwise share one bucket. (seen 2)
- [crew] A CI step marked `continue-on-error` should become blocking once it passes. Why: a soft gate that stays soft is never enforced. (seen 2)
- [crew] Secret scanning runs over all commits; never store test keys in workflows (generate them per run), and record reviewed false positives with a reason. Why: a scanner fails on history, not just on the diff. (seen 2)
- [crew] A reverse-proxy image's own access log stays on unless the server block sets its own; keep error_log at crit. Why: the default logs the request line, query included. (seen 2)
- [crew] For a page with inline scripts, generate CSP hashes from the built index at deploy time, and check CSP errors in headless Chrome. Why: a hash for a run-time injected style is needed too. (seen 2)
- [crew] In compose, `deploy.resources.limits` clashes with `pids_limit`; use service-level `cpus` and `mem_limit`. Why: the combination is rejected. (seen 2)
- [crew] With `cap_drop: ALL`, official postgres and redis images need CHOWN, SETUID and SETGID (postgres also FOWNER and DAC_OVERRIDE). Why: their entrypoints chown and drop privileges. (seen 2)
- [crew] Start official images with their own binary as the first argument, not through `sh -c`, and force a save in checks. Why: a shell wrapper skips the entrypoint's chown and privilege drop, so permissions fail about 15 minutes later. (seen 2)
- [crew] Compose `${VAR:?}` makes an existing env file fail when a new variable is added; document the migration step. Why: the failure appears only on the next start. (seen 2)
- [crew] Prefer per-service `environment:` lists with `${VAR:-}` over `env_file:`. Why: a service then never receives secrets it does not use. (seen 2)
- [crew] Postgres init scripts run only on an empty volume: write them idempotent (`\getenv`, `\gexec`), so they can re-run by hand. Why: a manual re-run is the only fix for a half-run init. (seen 2)
- [crew] A pinned address can be taken by a dynamic one first; give the network an `ip_range` for dynamic addresses and pin from the lower half. Why: "Address already in use" otherwise. (seen 2)
- [crew] `enable_ip_masquerade: false` removes the NAT rule, but Docker Desktop adds its own NAT; prove "no route out" only on the Linux host. Why: the desktop hides the result. (seen 2)
- [crew] Backup scripts: `[ a ] && b` does not trigger `set -e` when `a` fails; use separate lines, and check a dump with `pg_restore --list` on stdin. Why: a truncated dump otherwise passes. (seen 2)
- [crew] Unprivileged images read files as their own uid; such files need that owner and mode 0400, not world-readable. Why: cloudflared and nginx-unprivileged run as non-root. (seen 2)
- [crew] List every outbound call a service makes before cutting its network access. Why: an internal-only network broke connects on the first step. (seen 2)
- [crew] Upgrading a live compose stack whose networks changed: `down` (never `-v`), bring postgres up, run the roles script, then `up -d --build`. Why: "network has active endpoints" otherwise leaves postgres stopped. Rehearse on a real older stack. (seen 2)
- [crew] Compose and workflow tests need `ruby -ryaml` (no PyYAML here): dump each `run:` block and `bash -n` it. Why: a parse check without the runner. (seen 1, chhota-bheem only; kept under the DevOps group)
- [crew] A release job builds the legacy and v2 images before any push, so a late failure leaves nothing half-published. Why: order is the only guard. (seen 1)
- [crew] Give the deploy test a fixed job name and forbid `docker` and `${{` in run scripts, so new CD steps go into the existing job. Why: the workflow test pins the layout. (seen 1)
- [crew] Never use `${{ }}` inside `run:`; pass values through env vars, and pass a push token via git config env, not argv. Why: expressions are injected into the script text. (seen 1)
- [crew] A job that runs on hosted runners for pull requests and on a self-hosted runner for pushes: choose `runs-on` by event name and pin it in the test. Why: pull requests must never reach the self-hosted box. (seen 1)
- [crew] Size a CI wait from the hard stop (systemd timeout) plus a margin, with a deadline in seconds, not an iteration count. Why: a count drifts with the poll interval. (seen 1)
- [crew] A fake docker shim that logs calls tests deploy-script branches in seconds without containers. Why: macOS lacks `timeout`, so limit paths need the Linux host. (seen 1)
- [crew] Test an image prune by evaluating just that function with a fake docker listing images; check kept and untouched names. Why: a wrong prune deletes other projects. (seen 1)
- [crew] A retry timer plus a trigger that still names a failed version redeploys it every minute: give each trigger a request id and act once. Why: stale triggers loop. (seen 1)
- [crew] A crash-looping container (restarts at least 3 while not healthy) is a fast failure signal; skip healthy containers, whose old counts persist. Why: old counts give false alarms. (seen 1)
- [crew] With forward-only migrations and an API that refuses unknown migrations, a naive rollback can cause an outage; compare migration lists before rolling back. Why: rolling back data is safe but the app may refuse to start. (seen 1)
- [crew] Lock dirs need a PID plus a check that the process is ours (`/proc` cmdline). Why: PID namespaces in simulations reuse PID 1 and hide stale locks. (seen 1)
- [crew] Docker Desktop file sharing can show a just-deleted host file for a second or two; sleep before a container checks a marker. Why: the stale view makes checks flaky. (seen 1)
- [crew] Bind mounts into per-release folders recreate containers on every deploy; a stable symlink avoids that but serves the old site, so prefer per-release paths. Why: the symlink hides the new release. (seen 1)
- [crew] Hand-off files between users need `mktemp` plus `mv`, and link checks; a group-writable shared folder lets one side plant links. Why: the other side follows them. (seen 1)
- [crew] Under time pressure, report early with what is proven and what is not; a clear partial beats silence. Why: the owner prefers it. (seen 1)
- [crew] Retiring a stack from CD: pin its absence in the workflow tests, and check the pin fails on the old workflows. Why: a skip-if-missing check becomes a silent green. (seen 1)
- [crew] A runner-built compose file run by the deploy user gives the runner root-equivalent Docker: check the rendered config with an allow-list on the host and refuse symlinks in the bundle. Why: the runner would otherwise control the host. (seen 1)

---

## stuart (from chip-and-dale)

- No lessons recorded (placeholder only). Nothing to harvest.

---

## dekisugi (from dexter)

- [crew] Check every insight idea against the data the product really has before proposing it. Why: ideas that need missing fields waste design time. (seen 2: dexter, velma)
- [crew] Count repetitions concretely (fact, then every place it renders) before recommending cuts. Why: a table of facts by places convinces faster than opinion.
- [crew] Verify dates and numbers with a page fetch before correcting a teammate; search summaries mix editions and pace with engagement. Why: they were wrong twice. (seen 2: dexter, velma)
- [crew] Kind-tone evidence: confirm-shaming bans, the ostrich effect, and a backlash to roast-style copy. Why: these set the tone limits for money copy.
- [crew] Cadence decides placement: live or weekly goes on home, monthly on insights or apps, yearly in the story. Why: a card's refresh rate sets where it belongs.
- [crew] Mock-up review: recompute every headline from the mock data and read the phone screenshot; misreads hide in encodings (sizes, shared colours, rings), not copy. Why: the copy can be right while the chart lies.
- [crew] Phone surveys: ask top three with a grid (one response per column, shuffled rows), and ask "would it change what you do" separately from "which do you like". Why: a full ranking of ten is noisy.
- [crew] Score needs as importance times would-act times data-ready; usability results gate shipping, they do not reweight the rank. Why: bad copy must not bury a wanted card.
- [crew] For a crew board or room, measure the live page first and mine the event log for run lengths and bursts before setting timers. Why: real numbers beat guesses (median run 3.1 min). Use a public source for walk speed.
- [crew] Judge crew roles by data, not titles: count runs per agent type in the event log, and check identical lessons between paired memory files. Why: the DevOps pair shared 19 lessons. (seen 1)
- [crew] Check plugin rules early with `claude plugin validate`; names starting with `claude-` are reserved. Why: the name is rejected at install.

---

## doraemon

- [crew] A `.gitignore` rule such as `data/` can silently hide source folders with the same name; check `git status` for every new folder before committing. Why: source can be left out of the commit.
- [crew] Write timestamps from the real clock (`date -u`), never estimates. Why: a future placeholder makes "updated N min ago" wrong for everyone. (seen 3: doraemon, dorami, and the lesson on feed times)
- [crew] Give testers the same environment variables the suite needs; skipped tests are not passing tests. Why: a skip reads as green. (seen 3: doraemon, tom, and the browser-smoke rule)
- [crew] When roles share a package, stage only the reviewed role's files; commit mixed work only after both are reviewed. Why: a partial review leaks into a commit. (seen 2: doraemon, bob-the-builder)
- [crew] Open the pull request early as a draft and push fixes to it. Why: it saves the wait at the end.
- [crew] A tester's proof tests can be rerun by the manager instead of a second review round; ask for proofs that fail before the fix. Why: a failing proof shows the bug was real. (seen 3: doraemon, scooby-doo, shaktimaan)
- [crew] Verify a hand-back's claims (for example "document missing") with a direct read before acting or relaying them. Why: the claim can be a partial read. (seen 4: doraemon, dorami, shizuka, shinchan, suneo)
- [crew] Read a validator's full output; a crash can look like success in a tail. Why: a tail hides the exit state.
- [crew] After every hand-back, the manager adds the agent's new lessons to its memory file and commits them with the reviewed work. Why: the owner's rule keeps memory current. (owner rule)
- [crew] Check every CI workflow on the pull request, not just the new one. Why: a legacy secret scan failed while the new workflow passed.
- [crew] Leave a live stack running at least one save interval before calling it healthy; time-delayed failures hide from quick checks. Why: they appear later.
- [crew] Adding a role doc before its character exists makes the board fall back to a default drawing; add the character first. Why: the page needs the asset.
- [crew] Follow the code path before correcting a crew member; a single field can mislead. Why: the other agent traced the path and was right. (seen 2: doraemon, shizuka)
- [crew] A security fix can break a feature; ask the writer who traces flows to check network changes. Why: an egress lock broke app connects.
- [crew] Before re-scoping an agent, check it has not already finished; a late message resumes it and costs a full repeat report. Why: the repeat wastes time.
- [crew] Owner rule: every task gets a priority (P0, P1, P2); helpers go first to late P0 tasks. Why: priority decides who gets help. (owner rule; promotion candidate)
- [crew] Owner rule (22 Oct 2026): when a task runs late, add a helper on your own with disjoint files; do not wait to be asked. Why: the owner wants the slip fixed early. (owner rule; promotion candidate)
- [crew] Offer the owner a live try-out early: his first hands-on test found a cookie rule on local http that tests missed. Why: tests miss what real use finds.
- [crew] Dorami's time rule (above) also applies to the manager: take times from `date -u` right before writing. Why: guessed times were wrong twice. (seen 2: doraemon, dorami)

---

## miguel-rivera (from dorami)

- [crew] Use the real clock for any "updated" time; a future placeholder makes "updated N min ago" wrong for everyone. Why: the lie shows on the board. (seen 2: dorami, doraemon)
- [crew] Before reporting a document as missing, read it directly by id; a partial listing proves nothing. Why: a listing can omit a document. (seen 3: dorami, shinchan, doraemon's verify rule)
- [crew] When trimming a log to the last eight entries, re-read it after writing to confirm the right entries survived. Why: a trim can drop the wrong end.
- [crew] Build a new log array in time order (old plus new, last eight) before writing. Why: out-of-order entries happened twice.
- [crew] When asked to close finished work, say which role changed and why. Why: the owner tracks ownership. (PR #22 precedent)
- [crew] Owner style for status boards: one short outcome line per entry, role tasks six words or fewer, drop entries with no outcome. Why: the board must stay scannable. (owner rule; promotion candidate)

---

## nobita

- [crew] Do not claim security properties in copy (such as "encrypted") unless verified on the server. Why: overclaims mislead users. (seen 3: nobita, suneo, shizuka)
- [crew] Drive the real journey with a CDP script against a fake server, and byte-compare legacy screenshots, to prove polish broke nothing. Why: the fake server runs the real flow.
- [crew] Device emulation gives true phone-width screenshots; an iframe is the fallback. Why: a clipped window is not a phone. (seen 4; merged into the headless Chrome rule under bob)
- [crew] Bun may be missing from PATH; Node 26 has fetch and WebSocket, so a CDP screenshot script can run on Node. Why: avoids a missing-tool skip. (seen 5; merged, see bob-the-builder)
- [crew] Write a draft file early in long design tasks, so a sudden stop leaves something saved. Why: sessions can stop without warning.
- [crew] Every screen must handle 401 by returning to sign-in with a clear message. Why: a consent screen retried silently ten times. (seen 2: nobita, shinchan)
- [crew] A dead fake server makes "connection refused" pages look like passing checks; confirm the server is up before a re-run. Why: empty pages pass no-overflow checks.
- [crew] Do not edit mock-up files while a screenshot round runs; freeze, shoot, then fix. Why: a shot can mix old and new files.
- [crew] Components that set `display` beat the `hidden` attribute; add `[hidden] { display: none !important; }` to every page. Why: an empty overlay blurred the whole page.
- [crew] `light-dark()` takes only colours; shadows and opacities need separate dark-theme blocks. Why: the function silently fails on other values. (seen 2: nobita, shinchan)
- [crew] Measured checks (tap targets, text size, contrast, overflow) catch what eyes miss, but labels, orphans and uneven wraps need a look at every shot. Why: measures do not see layout taste.
- [crew] Keep mock-up content in a card registry (a layout list plus card builders) so a brief can reorder cards without layout changes. Why: briefs change mid-task.
- [crew] Never put a `data-*` name on `<html>` that a component uses as a selector; the next tab switch hid the page. Why: the selector matched the root.
- [crew] When inserting code with `String.replace`, pass a function replacement; a string replacement turns `$$` into `$`. Why: it corrupts the script.
- [crew] A CDP navigate to the same path with only a new hash does not reload; add a query when a step needs a fresh load. Why: the stale page stays up.
- [crew] A flip card stacks both faces in one grid cell; make the back absolute so the front sets the height. Why: the taller back otherwise sets it.
- [crew] A card front that shows too little: add one or two short facts on the picture itself, not behind a flip. Why: the owner said the front was thin.
- [crew] Name inner parts of a shared component by role to avoid generic classes picking up the card style. Why: `.card` matches everything.
- [crew] Scroll-in motion must never hide content: draw the final state in CSS, then replay with `el.animate(..., { fill: 'backwards' })`. Why: screenshots, no-JS and reduced motion then show the full page.
- [crew] `@property` registration of a variable makes `var(x, fallback)` never fall back; prefix component variables. Why: the fallback is lost silently.
- [crew] A calc that returns order ids should make taps open exactly those; keep the filter in a per-draw list. Why: a second mapping drifts. (seen 1)
- [crew] A tap sheet must total the same part as the bar that opened it, or the numbers seem to disagree. Why: users compare the two.
- [crew] Class names in shared picture markup must not clash with page classes; prefix shared classes. Why: a calendar day picked up a poster's number style.
- [crew] Briefs change mid-task; build the registry first and the styling second. Why: swaps then take minutes.
- [crew] CSS for mock-ups: the reduced-motion and CSP-safe choices shape the design; do not set inline style attributes under a strict CSP (use CSSOM). Why: inline styles are blocked. (seen 2: nobita, velma)

---

## ninja-hattori (from scooby-doo)

- [crew] Look for races between user actions and background work (a fetch that commits after a disconnect or a consent withdrawal). Why: deleted data can come back.
- [crew] Hand proofs over as tests that fail before the fix; the manager reruns them. Why: no second review round needed. (seen 3; merged under doraemon)
- [crew] Test rate limits with the real limiter and real routes; the proxy-IP flaw only showed that way. Why: a fake limiter hides the key bug.
- [crew] Both fixers turned proofs into regression tests; keep proofs small and deterministic so they port. Why: the tests must survive the port.
- [crew] Check the running process user (`docker top`, `/proc/1/status`), not compose comments; a shell wrapper skips privilege drops. Why: comments can lie.
- [crew] Backup pipelines in POSIX sh have no pipefail; prove with a failing dump that the output is empty, not "ok". Why: a failed dump otherwise passes.
- [crew] Per-address IP limits need a global ceiling, and IPv6 rotation inside one /64 must be tested from the trusted-proxy position. Why: a global ceiling without the per-address rule locks everyone out.
- [crew] Bind-mounting the build context in a proof Dockerfile copies secrets into the build cache; prune them afterwards. Why: secrets persist in the cache.
- [crew] In a group-writable hand-off folder without a sticky bit, any file the owner writes can be pre-planted as a link. Why: the other side follows it.
- [crew] A path allow-list built on normpath plus a one-time link check is beaten by containers writing into bind mounts; require read-only binds and realpath. Why: the check runs once.
- [crew] Show the same fact with the same number on every screen: per-item rounding and a percent formatter can disagree (37 vs 38). Why: the same fact must show the same number.
- [crew] Windowed reads: check that each source can stop at its end date; a silent page cap marks an unread range as covered. Why: coverage then lies.
- [crew] Cooldowns stored as a run-after time die in queue merges; check every enqueue path against the earliest run time. Why: merges keep the earlier time. (seen 2: scooby-doo, shaktimaan)
- [crew] When a fix moves work from syncs to backfills, list every path that skips the backfill (paused, dropped after max attempts). Why: the gap stays open silently.
- [crew] To test a PR commit without touching the repo, export that commit into a work folder and copy the node_modules from an earlier copy. Why: keeps the checkout clean.

---

## kevin (from scrooge and shaktimaan)

- [crew] Rate limits keyed on the socket address collapse to one bucket behind a proxy; make the client-IP source explicit config. Why: a proxy hides the real client. (seen 2: scrooge, bob-the-builder's proxy rule)
- [crew] Never trust `X-Forwarded-For` by default; pick the client-IP source by explicit config and refuse to start if two sources are set. Why: a client can forge it.
- [crew] An invite with no creator silently became an admin path; grant roles explicitly, never by implication. Why: implicit grants escalate.
- [crew] Revoking at a provider must be time-boxed and best effort, so it can never block disconnect or deletion. Why: a provider outage must not block the user.
- [crew] Run the linter on touched contract files; import order alone fails the lint gate. Why: the gate is strict.
- [crew] Cap OTP guesses per attempt and per phone per day; charge phone-keyed limits only after the caller's own pending login matches. Why: stops guessing and abuse.
- [crew] Tie sessions to the passkey that created them (cascade delete) and give sessions an absolute lifetime as well as a sliding one. Why: a sliding-only session never ends.
- [crew] Safari drops Secure and `__Host-` cookies on http://localhost (Chrome keeps them), so sign-in seems to work and the next request is 401. Derive the local cookie mode from the public URL config, never a separate flag, and read one cookie name per mode. Why: the two modes drift otherwise.
- [crew] Make cookie name and secure flag impossible to drift apart: refuse to set a `__Host-` name without Secure. Why: the browser rejects it silently.
- [crew] Rate-limit keys: IPv6 by /64, IPv4 by /24 (network rules by /48), IPv4-mapped IPv6 as IPv4; check host, then network, then global so a blocked request never counts toward the global ceiling. Why: the ceiling must count only allowed requests.
- [crew] `CREATE TABLE IF NOT EXISTS` needs CREATE on the schema even when the table exists; check the table first so a no-op migrate works as a DML-only role. Why: the role lacks CREATE.
- [crew] Prove DML-only at run time with a real role (create, grant, swap the connection user); drop it in cleanup. Why: a mocked role proves nothing.
- [crew] Migrate refuses names it does not ship (rollback safety); tests that pass a custom list must include the full shipped list. Why: a partial list fails the safety check.
- [crew] Guard a re-read against inferred fields before hashing, so a rejected value reads as "same" and never bumps the data version; audit counts, not values. Why: noise otherwise looks like change.
- [crew] A fetch that is already running must re-check account state, consent and kill switches at commit time, or deleted data can come back. Why: the state changed while it ran. (seen 2: scrooge, shaktimaan's commit-lock rule)
- [crew] Put shared constants (context strings, version numbers) in a shared package, not per app. Why: copies drift.
- [crew] A redacting logger cannot recognise an opaque token inside free text; mask the exact secret values you opened. Why: pattern matching misses them.
- [crew] A retry policy can be set for every outbound call inside a fetch with async-local storage, without touching call sites. Why: fewer edits, one place.
- [crew] Commit-time locking order: the account row first, then consent; a caller that changes both must use the same order. Why: different orders deadlock.
- [crew] Derive scheduler jitter from a stable hash; re-drawing it each tick pulls every sync early. Why: the schedule drifts.
- [crew] Prove a fix by running the new tests against the unfixed code in a throwaway worktree: they must fail there. Why: a passing test on fixed code proves nothing. (seen 2: shaktimaan, doraemon's proof rule)
- [crew] Lock the account row inside the success commit so a racing disconnect waits, then deletes what was stored. Why: a race can otherwise re-store data.
- [crew] A self-hosted runner that builds the images the box deploys must never run pull-request jobs; the box trusts local image names. Why: pull-request code would reach production.
- [crew] A page or call cap must end a read as partial (with the oldest day read), and coverage must start after that day. Why: a silent cap marks unread years as covered.
- [crew] Enforce a cooldown where the work runs, not only through a queued run-after time; a newest-first source re-reading a gap stops at the same depth. Why: merges keep the earlier time.
- [crew] Coverage is one merged span per source; never mark a read that does not touch it. Why: unread days between would count as read.

---

## shinchan

- [crew] Draw spaces and objects, not cards in cards; the owner dislikes boxes inside boxes. Why: two design rounds were rejected for it.
- [crew] Details must stay visible at a glance; hover-only information is not enough. Why: owner rejected hover-only design.
- [crew] Neighbouring speech bubbles collide; alternate their sides. Why: overlaps read as errors.
- [crew] Show plaques and thought clouds in the scene instead of hiding details. Why: the owner's second rejection.
- [crew] Re-take the phone screenshots after the final change, not just before it. Why: a late change invalidates earlier shots.
- [crew] Handle 401 once, centrally in the fetch wrapper; skip the auth and session paths; close all overlays through a tracked set; show a calm sign-in notice. Why: per-screen handling is inconsistent. (seen 2; merged under nobita)
- [crew] When a screen has two layouts (invited vs returning), pick the one that fits the person's situation, not just the URL. Why: an ended session means an existing account.
- [crew] A `:not()` selector in a grid rule outranks a plain attribute selector; raise specificity instead of fighting it. Why: the cascade order surprises.
- [crew] Use `sips` to crop macOS screenshots when PIL is missing; crops make reviews faster. Why: the crop is quick.
- [crew] A media-query override placed above the base rule loses on equal specificity; put phone overrides after the base rules. Why: source order decides.
- [crew] `display: contents` on nested wrappers lets header items reorder as one flex set on phones. Why: layout without markup changes.
- [crew] Text sized in container units falls below 12 px on phones; wrap it in `max(12px, ...)`. Why: small text is unreadable.
- [crew] `pgrep -f "[x]"` avoids matching the monitor's own command line. Why: the watch loop would match itself.
- [crew] Finish and look at every screenshot size the brief asks for; an unreviewed width hid unstyled checkboxes. Why: the manager found it.
- [crew] When markup belongs to someone else, fix it from owned files (CSS, a data adapter, a guarded observer) and list the proper markup change in the report. Why: you cannot edit their file.
- [crew] With several agents in one worktree, build into your own output folder and kill only your own processes by exact path; never kill by a shared name. Why: another agent's process dies otherwise.
- [crew] Round shares with largest remainder so the percentages add to 100. Why: plain rounding leaves totals off by one. (seen 1)
- [crew] Full-page shots resize the viewport to the page height, so scroll-in animations all fire at once; wait about 2.5 s before capturing count-ups. Why: intermediate numbers show otherwise.
- [crew] Porting a big CSS file by line ranges: check the first and last lines; a range starting inside a comment kills the first rule. Why: silent loss.
- [crew] Chrome tools cannot go below about 1300 px; show narrow widths with a small local server page of iframes. Why: iframes are the fallback. (seen 2 with the headless rule)
- [crew] Force light theme by setting the colour-scheme media rules to "not all" in script. Why: the test needs a fixed theme.
- [crew] Real scenes: use plain CSS shapes for working parts; for wide shots use a fresh tab, since a tab opened after a resize can stay narrow. Why: a stale tab keeps the old width.
- [crew] Walkers over a grid: measure targets at walk time, route via corridors, animate with WAAPI, skip when reduced motion or hidden. Why: positions change with layout.
- [crew] For a phone shot of a scripted flow, add a phone route to the fake server; same origin keeps the page scriptable. Why: cross-origin frames block scripts.
- [crew] Keep the previous period on screen while a fetch runs: hold on change, release on redraw. Why: no blank flashes.
- [crew] If "nothing moves" is reported, suspect the OS reduce-motion setting first; give a motion switch that overrides the media query. Why: the setting hides motion silently.
- [crew] Fetch panels: decide done only when the item is neither queued nor running; never re-send a failed request from poll events, only from a retry button. Why: re-sends pile up.
- [crew] A full-screen modal over the app root needs `inert` set by you; re-assert focus about 450 ms after opening when a sheet closes at the same time. Why: the sheet resets focus asynchronously.
- [crew] Walk engine: one animation loop, whole-pixel translation, facing from direction, a size variable shared by seated and walking. Why: rescaling otherwise jumps.

---

## shizuka (absorbs suneo)

- [crew] Use plain, honest English; check every claim against the code. Why: the owner wants facts. (seen 3: shizuka, suneo, dexter's honest-numbers rule; owner style, promotion candidate)
- [crew] Do not run a frontend build just to verify it when a running server serves the output. Why: it rewrites files that are live.
- [crew] In zsh, `echo =====` fails (equals expansion); use `---` as a separator. Why: zsh expands it.
- [crew] Read each connector's tool list before writing "reads only order history"; some connectors also read address lists to get an id. Why: the copy must match the tools.
- [crew] Typical slips to check first when editing a draft: version mix-ups, overclaims, incomplete app lists, unresolved TODO(verify). Why: they recur. (seen 2; merged with suneo's list)
- [crew] When a manager's correction contradicts the code, do not comply silently; keep the docs true and reply with file and line evidence. Why: the code is the source of truth. (seen 2: shizuka, doraemon)
- [crew] Mermaid on GitHub: a subgraph's direction is ignored when its nodes link outside it; mid-tone fills with white text read in both themes; keep label lines under about 25 characters. Why: GitHub's renderer ignores direction there.
- [crew] Validate Mermaid in a page loaded over local http and captured in the browser; file URLs give misleading captures. Why: file URLs block scripts.
- [crew] When templating diagrams into a README, match placeholders by name; a hexagon shape collides with a plain brace check. Why: the syntax is shared.
- [crew] Desktop README shots: patch the real registry into a copy of the fake server, check the port is free first. Why: another server may hold it.
- [crew] The shared index is used by crew who commit often: `git rm` and commit in one command, or your staged changes land in theirs. Why: one index. (seen 3; merged under bob, shared worktree)

---

## suneo (merged into shizuka)

- [crew] Finder copies named "X 2.md" are iCloud duplicates; list them as possible duplicates and flag for the owner, never as separate docs. Why: they are not real docs. (seen 2 with the iCloud rule below)
- [crew] A glossary says what a term does; keep rationale out unless a doc states it. Why: invented why-lines mislead.
- [crew] Do not guess a cause; ask or check. Why: guesses become facts. (seen 2: suneo, dorami)
- [crew] Always label which version a doc serves. Why: the legacy and new versions differ.
- [crew] Never overclaim security; say what actually happens. Why: the owner checks. (seen 3; merged under nobita)
- [crew] Owner decisions in a plan outrank general research findings. Why: the owner has the final say. (owner rule)
- [crew] Plan docs can be ahead of or behind the UI; cross-check status against screenshots and the README; mark conflicts TODO(verify). Why: the plan can be stale.
- [crew] Check each command in CONTRIBUTING against the package scripts; when writing "CI runs the same", diff against the workflow. Why: docs drift from the code. (seen 2: suneo, shizuka)
- [crew] Alt text: one or two sentences, describe what is visible, and note empty or test data. Why: alt text must match the picture.
- [crew] Never claim a setting you cannot see (such as branch protection); say what happens instead. Why: the claim cannot be verified.
- [crew] Count sentence length per table cell; split long cells. Why: long cells are hard to read.
- [crew] Check alt text against the README with a script, not by eye. Why: the eye misses drift.
- [crew] Promoted after round 2 on good evidence: no invented facts, good TODO(verify) flagging. Why: promotion rule (training badge) applied. (training note)

---

## joe-gardner (from tom)

- [crew] Report typecheck errors split by test files and source files; both block the gate. Why: a split shows where the fix goes.
- [crew] Run the no-services pass too; it should show skips, never failures. Why: a skip is not a pass; a failure there is a real bug. (seen 3; see doraemon's skip rule)
- [crew] Read count-up numbers only after about 1.5 s; a period switch replays them. Why: an early read looks like a wrong total.
- [crew] If browser tools are not available, say "browser smoke not run" in the hand-back; never report it as passed. Why: a false pass hides the gap. (seen 2: tom, doraemon)
- [crew] `node --check` proves little on a TypeScript file; check JavaScript only, and read each exit code directly, not through a pipe. Why: a pipe hides the exit status.
- [crew] Check a fresh migration and an upgraded one on scratch databases, then diff the schema dumps; only random tokens may differ. Why: confirms the upgrade path.
- [crew] In zsh, loop over a file list with `while read`, not a glob loop, which errors on no match. Why: zsh fails on empty matches.

---

## olaf (from velma)

- [crew] Desk research: check each idea against what the product has, and read the current plan first so ideas go beyond it. Why: repeats waste time. (seen 2; merged under dekisugi)
- [crew] WebSearch summaries have no reliable dates and cannot read app stores or forums; mark dates "n.d." and confidence, and flag thin areas. Why: the summaries mislead. (seen 2; merged under dekisugi)
- [crew] Fee and market numbers conflict across sources; note the definition and mark unverified figures. Why: definitions differ.
- [crew] Look for peer-reviewed or research-group sources before saying none exist. Why: they often exist.
- [crew] Survey evidence: use journal abstract pages, reviews, or summaries when a PDF or a publisher blocks fetches. Why: those sources are blocked here.
- [crew] Measured evidence beats opinion. Why: an effect that sounds right can reverse in a study.
- [crew] Design the "not shown" state of every chart too. Why: the unknown share must show.
- [crew] Check CSP limits on any idea (CSSOM styles allowed, no inline style attributes; vibration is Android-only). Why: an idea may be blocked on other platforms.

---

## Counts

- Raw bullets read: 300 (the chip-and-dale placeholder not counted).
- Bullets written: 275 (crew 219, project 56). The 25 difference are raw bullets folded into another bullet as duplicates or dropped as obsolete, plus 3 removed on 2026-10-27 because they were product-domain findings from one app.
- Duplicates merged: 19 DevOps lessons shared by chhota-bheem and dekisugi (one copy, seen 2), plus cross-role repeats folded into one line with (seen n).

---

## Candidates to promote into prompts

Crew lessons seen in 2 or more files, or set by the owner:

1. Verify hand-back claims with a direct read before relaying them. (seen 4+, doraemon, miguel-rivera, shizuka, shinchan)
2. Headless Chrome cannot go below about 1300 px; use device emulation or an iframe for phone widths. (seen 4+, bob, nobita, shinchan)
3. Shared worktree: stage only your own files by path; never commit someone else's index. (seen 3)
4. A skipped test is not a pass; report the skip and do not call the run green. (seen 3, doraemon, joe-gardner)
5. Proof tests must fail before the fix; the manager reruns them. (seen 3, doraemon, ninja-hattori, kevin)
6. Do not overclaim security or encryption in copy. (seen 3, nobita, suneo, shizuka)
7. Use the real clock (`date -u`) for every timestamp. (seen 2, miguel-rivera, doraemon; owner-stated lesson)
8. Bun is not on PATH: use the repo's own binary. (seen 5)
9. `light-dark()` takes colours only; shadows need a separate dark block. (seen 2, nobita, shinchan)
10. A 401 is handled once, centrally, with a calm sign-in message. (seen 2, nobita, shinchan)
11. Migration numbers are reserved per role before parallel work. (seen 2, doraemon, kevin)
12. Follow the code path before correcting a crew member; cite file and line. (seen 2, doraemon, shizuka)
13. Dupes: DevOps pair (19 lessons) should be one shared lesson in the crew skill, not two copies. (seen 2, structural)

Owner-set rules (promote on the owner's word):

- Every task gets P0, P1 or P2; helpers go first to late P0 tasks. (doraemon)
- When a task runs late, add a helper on your own with disjoint files. (doraemon, 22 Oct 2026)
- Keep status-board entries short: one outcome line each, role tasks six words or fewer. (miguel-rivera, 22 Oct)
- After every hand-back, the manager adds the agent's new lessons to its memory file. (doraemon)
- Plain, honest English, checked against the code. (shizuka)
- Owner decisions outrank general research. (shizuka)

---

## Files touched by this harvest

- `docs/lessons/2026-10-23-crew-lessons.md` (this file)
- `plugin/skills/crew-lessons/SKILL.md` (lessons-pass procedure)
- No memory files were changed; the 17 sources were read only.
