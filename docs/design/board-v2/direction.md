# Board v2: design direction (Nobita, 26 Oct 2026)

Mock-up: [mockup.html](mockup.html) (static, fake data for 2 projects). Contract: [../../planning/board-v2-contract.md](../../planning/board-v2-contract.md).

Try the mock-up with `?project=Shop%20App`, `?project=Notes%20Site`, `?project=all`, `?state=empty` and `?state=offline`.

## The idea in one line

One page, five plain sections, every row says **who** (face and name), **what** (one line), **how urgent** (P0/P1/P2) and **how long**. Everything else goes.

## What today's page gets wrong

Checked on today's board with a throwaway data folder: 2 projects, 3 active tasks.

1. **Two pages with different answers.** The Live tab said "3 working". The Crew Room header said "WORKING 4". The project strip said "Shop App 2 working, Notes Site 2 working, All 4 working". `projects[].working` said 2 and 1. Doraemon was counted as a worker, and his line ("Managing Shizuka, Shinchan + Shiro, Kevin · Notes Site") mixed people from both projects.
2. **The answer is far down.** At 375 px the Crew Room's "Active tasks" list starts at y = 5,359 px, more than 6 screens down, under the pixel rooms. The full page is 6,819 px tall.
3. **Most of the pixels are decoration.** Rooms, furniture, walkers, speech bubbles, gadgets, naps, catchphrases and the framed-pictures wall don't tell the owner who is doing what.
4. **No queue.** Nothing shows work that is waiting, or how urgent it is.

## Remove (by element or selector)

`plugin/board/page.html`
- The tab bar: `nav.tabs`, `#tab-live`, `#tab-room`, `setTab()`, the `crewTab` storage key, the `#room` hash and the `html[data-tab]` scoping. There is one view now.
- The whole Live tab, `#view-live`:
  - `h1` "Crew Live Board" with its gradient;
  - the `#crew` chips (`renderCrew`);
  - the log timeline `#log` and its filters `#filters` (`GROUPS`, `KIND_LABEL`, `renderLog`, `renderFilters`, `crewFilter`);
  - "Deploys and CI" `#ops` (last deploy, CI runs, PR list, commit lists; `renderOps`);
  - "App errors" `#errors` (`renderErrors`), and the `footer`;
  - the inline `#view-live { … }` CSS block.

`plugin/board/room.js` and `room.css` (Crew Room view)
- Hero decoration: `.hero::after` scanlines, `.plug` "· toon-crew", `#r-sky` sun/moon, `.caret` "▶ THE GANG", and `.counts`/`#r-facts` (replaced by the Facts section).
- The Motion button `#r-motion`, `rSetMotion` and the `crewMotion` key. Nothing moves, so it isn't needed.
- The old project strip `#r-projects` (`.pstrip`, `.plabel`, `.pchip` with "N working" taken from members). The new picker replaces it.
- The hall: `#r-hall`, `.door`, `#r-rooms`, plus everything under it:
  - room parts: `.team`, `.wall`, `.sign`, `.decor .d-*`, `.room-floor`, `.stations`, `.props .f-*`;
  - the desk: `.desk`, `.seat`, `.stage`, `.pace`, `.scale`, `.table`, `.led`, `.laptop`, `.mug`, `.gadget`, `.zzz`, `.spark`, `.dorayaki`, `.wait`;
  - the name plate: `.plate`, `.plate-name`, `.swatch`, `.st`, `.chips`, `.mchip`, `.echip`, `.ochip`, `.plate-role`, `.pteam`, `.plate-task`, `.ptag`, `.plate-ref`;
  - the code behind it: `R_ROOMS`, `TOUCHES`, `DOGS`, `R_PET`, `R_GADGET`, `R_ICON`.
- Walks and scenes: `#r-walkers`, `rPlanWalks`, `rPlanCheckins`, `rEnqueue`, `rPump`, `rVisit`, `rTask`, `rReport`, `rTrip`, `rMove`, `rTick`, `rRoute`, `rAccess`, `rGeo`, `rWalker`, `rSay`/`rUnsay`, plus their pieces `.bubble`, `.copterhat`, `.carry`, `.ding`.
- The stand-ins used when motion is off: `rStatic`, `.sbubble`, `.pin`, `.papericon`, `.plate-note`, `.ring`.
- Catchphrases (`rFx`, `rFxSet`, `rFxPaint`, `rReact`, `.quip`, `.fx-*`) and naps (`NAP_MS`, `rNaps`).
- The hover card `.rcard` (`rShowCard`, `rWireCard`, `rHideCard`, `rRefreshCard`). Rows show everything, so nothing hides behind a hover.
- The framed-pictures wall `#r-gallery` (`rRenderGallery`, `.frame`, `.fplate`, `.mat`).
- The old "Active tasks" list `#r-feed .feed-row` (with its `▶` mark), and the merge of `room.talks` assign lines. Assignments now show as Active rows.
- Model and effort chips. The one exception is the model override, which stays as meta text (see the row anatomy below).

## Keep

- **Faces:** the avatar art (`KINDS`, `FILM`, `flFur`, `rAvatarKind`, `rAvatar`, `rMini` at 32 × 36), plus `CREW` and `rCrewKey`/`rKeyOf`. A face is the fastest way to see who.
- The Crew Room look, toned down:
  - cream and ink (dark: indigo) surfaces;
  - a 2 px ink border with a hard 3 px shadow on each section;
  - mono section titles.
- `tick()` polling with a stale state, `textContent` for every string, and IST times.
- The `crewProject` storage key. An old value of `""` means "All projects".

## Page structure

The section order follows the contract: **Active, Queued, Crew, Recent, Facts**. That order is right for a phone: the two task lists come first. Facts is last because it changes rarely (see open decision 2).

```
Crew Room                                  ● Live · 08:48 IST
[Shop App 2 active] [Notes Site 1 active] [All projects 3 active]
ACTIVE 2 ................................. time working
QUEUED 3 ................................. time waiting
CREW 2 working
RECENT
FACTS
```

### Top bar
- Title "Crew Room" at mono 700, 20 px. The live status sits at the right: a 10 px dot and "Live · 08:48 IST".
- When the server stops answering, the dot and text turn `--warn` and read "Not answering · last 08:44". The last data stays on screen; nothing is cleared.
- The project picker is a row of buttons under the title, and it wraps. **It is not sticky:** at 375 px it takes two lines, and a sticky bar would cover a third of the screen.

### Project picker
- Order: registry order, then "All projects" last. The order never changes when the pick changes.
- Default pick: `?project=`, then the stored pick, then `focus`. "all" is a valid value in both places.
- Each chip is a `<button aria-pressed>` at least 44 px tall, showing "‹name› ‹n› active".
- n = `tasks.active` for that project (the same number as `projects[].working`). "All projects" shows the total.

| Chip | Look |
|---|---|
| Picked | Text `--ink` 600; count `--accent` 600; fill `--panel`; 2 px solid `--sel` border; 3 px hard shadow; `cursor: default`. |
| Greyed (other projects, or "All projects" when not picked) | Text and count in `--dim` (AA on `--bg`); no fill; 1.5 px **dashed** `--dim` border. On hover the border turns solid and the text `--ink`. |

Picking a chip:
- re-renders the page;
- stores the pick;
- updates `?project=` with `history.replaceState`;
- sets `document.title` to "Crew Room · Shop App · 2 active".

### Layout

| | Phone (375 px; anything under 900) | Desktop (900 px and up; shot at 1,360) |
|---|---|---|
| Columns | One | Two: `minmax(0,1.65fr) minmax(300px,1fr)`. Left: Active, Queued. Right: Crew, Recent, Facts. |
| Page | Padding 16 px, gap 16 px between sections | Max width 1,240 px, padding 24 px, gap 20 px |
| Order | DOM order = reading order = the contract order | The same DOM order. The columns are two wrapper `div`s, so the order never changes. |
| Height (fake data) | Shop App 1,836 px; All projects 2,333 px | Shop App fits one screen (1,020 px) |

### Sections
- Each section is a `<section aria-labelledby>`: `--panel` fill, a 2 px `--edge` border, a 12 px radius and a `3px 3px 0 var(--shade)` shadow. Padding is 14 px 16 px 6 px.
- `h2`: mono 700 at 15 px, uppercase, then the count in `--accent` ("ACTIVE 2"). An optional hint sits at the right in 13 px `--muted` ("time working", "time waiting"). The hint is hidden when the list is empty.
- Lists:
  - Active: `<ul>`, oldest first.
  - Queued: `<ol>`, because the order matters (P0, P1, P2, no priority, then oldest first).
  - Recent: `<ul aria-live="polite" aria-relevant="additions">`. This is the only live region, so screen readers hear outcomes, not every poll.

## Row anatomy: task (Active and Queued)

```
┌40×44┐ Kevin  [P1]                                42 min
│face │ Add the refunds table and its migration
└─────┘ Shop App  feat/refunds  model override: opus (file: sonnet)
```

| Part | Spec |
|---|---|
| Grid | `40px minmax(0,1fr)`, column gap 12, padding 12 px 0, 1 px `--line` divider between rows |
| Face | `rMini(role)` at 40 × 44, `aria-hidden` (the name is text), spans the row's lines, top-aligned |
| Line 1 | Name (15 px, 650, one line, ellipsis), then the priority chip, then the time pushed right (14 px `--muted`, tabular figures, a `<time>` with title "Started 08:06 IST" or "Queued 08:35 IST") |
| Time | Active: time since `startedAt`. Queued: time since `queuedAt`. Shown as "now", "7 min" or "1 h 12 min". The section hint says which. |
| Line 2 | Task text, 16 px `--ink`, at most 3 lines (`line-clamp: 3`), full text in `title` |
| Line 3 (only when there is something to show) | 13 px `--muted`: the project name in 600 (only on "All projects"), `ref` in mono, then "model override: ‹asked› (file: ‹file›)" when the call's model differs from the agent file |
| Accessible name | `aria-label` "Kevin, P1: Add the refunds table and its migration. Working for 42 min. Shop App" |

Priority chip: mono 700 at 13 px, padding 4 × 7, radius 6. The word carries the meaning; colour only helps.

| Chip | Light | Dark |
|---|---|---|
| P0 "do first" | fill `--bad` #be123c, text #fff (6.3:1) | fill #fb7185, text #2a0610 (6.9:1) |
| P1 "next" | fill `--tint-warn`, text `--warn` #92400e (5.3:1) | fill `--tint-warn`, text #fbbf24 (7.6:1) |
| P2 "when free" | outline `--muted`, text `--muted` | the same |
| No priority | no chip | no chip |

## Row anatomy: Recent (outcomes only)

- Uses the same grid as a task row.
- **Mark:** a role's face when the item has a role. Otherwise a 40 × 36 mark in mono 700 at 15 px:
  - "PR": `--accent`, outlined;
  - "CI": `--bad` on `--tint-bad`;
  - "▲" for a deploy: `--ok` on `--tint-ok`; a failed deploy uses the `--bad` colours.
- **Line 1:**
  - the actor: role name, "Pull request", "CI" or "Deploy";
  - for a hand-back, "handed back" in 14 px `--muted`;
  - for a failure only, a "failed" chip (`--bad` on `--tint-bad`);
  - the clock time at the right ("08:18").
- **Line 2:** the outcome text. A PR is a link (`--accent`, underlined, opens in a new tab, only `https://github.com/` links).
- **Line 3:** the project name, only on "All projects".
- **What shows:** `room.feed` items with tone `done`, `pr`, `deploy` or `bad`, newest first, up to 8. Starts and assigns are left out, because Active already shows them.

## Crew

- **Who is listed:** roles with an active or queued task in view. Doraemon is not listed: he is the session itself, never a task.
- **Row:** one per role, with a 52 px minimum height:

```
face  Kevin                          Working · 42 min
face  Bob                              Free · 1 queued
```

  - The state text is right-aligned, 14 px. "Working · ‹time›" is `--accent` 600; "Free · n queued" is `--muted`.
  - On "All projects", the project name sits in 13 px `--muted` under the name. One row per (project, role): Shizuka in two projects is two rows.
- **Heading count:** "2 working".
- **Footer:** "9 others free, nothing queued for them." This is 14 roles minus the **distinct** roles listed. With nobody listed: "All 14 crew are free."
- **Source:** `tasks.active` and `tasks.queued` only, never `room.members` (see the data notes).

## Facts

- **One project:** a `<dl>` with two rows.
  - "LIVE": version (mono 600), an "ok"/"failed" chip, "since 08:02".
  - "BRANCH": the branch in mono.
  - With no deploy check: "Not checked for this project".
- **All projects:** one row per project.
  - The project name is the `dt`.
  - The `dd` holds version, chip and time on one line, with the branch on its own line under them (so rows wrap the same way).
  - The heading hint reads "live version · branch".

## Empty, loading, offline

| State | Copy |
|---|---|
| Loading | Status "Connecting…"; sections render once the first state arrives |
| No active tasks | "Nobody is working on Shop App right now." ("on all projects" for All) |
| Nothing queued | "Nothing queued." |
| No crew with work | "All 14 crew are free." |
| No outcomes | "No hand-backs, PRs or deploys yet." |
| No deploy check | "Not checked for this project" |
| Server down | Status turns amber: "Not answering · last 08:44". The last data stays, and polling retries every 4 s. |
| Unknown `?project=` | Fall back to stored pick, then `focus`, then All |

## Motion

- No ambient motion. The live dot does not pulse.
- A new row in Active or Recent gets a 2.4 s background fade from `--tint-fresh` to clear.
- Under `prefers-reduced-motion: reduce`, nothing animates.
- Poll every 4 s (no more 2 s room loop).

## Tokens (one set, `light-dark()`, on `:root`)

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | #f6efd9 | #0d0b1f | page |
| `--panel` | #fffaf0 | #17143a | sections, picked chip |
| `--ink` | #2b2340 | #f2ecff | text (14.2 / 15.2 : 1 on panel) |
| `--muted` | #5b5170 | #aaa3cc | secondary text (7.1 / 7.4 : 1) |
| `--dim` | #6b6282 | #948dbb | greyed chips (4.9 / 6.3 : 1 on bg) |
| `--line` | #e6dcc3 | #2c2860 | row dividers (decorative) |
| `--edge` | #2b2340 | #4b4592 | section border |
| `--sel` | #2b2340 | #f2ecff | picked chip border |
| `--shade` | #2b2340 | #05040f | hard shadow |
| `--accent` | #0e7490 | #22d3ee | counts, working state, links (5.2 / 9.7 : 1) |
| `--ok` | #166534 | #4ade80 | live ok |
| `--warn` | #92400e | #fbbf24 | P1, stale status |
| `--bad` | #be123c | #fb7185 | P0, failures |
| `--on-bad` | #ffffff | #2a0610 | text on P0 |
| `--tint-ok/-warn/-bad/-fresh` | `color-mix(in srgb, <colour> 14–16%, var(--panel))` | same | chip and mark fills |

- **Type:** `--font` is the rounded system sans, for body and rows. `--mono` is used for the title, section titles, chips, refs and versions.
- **Sizes:** body text 16 px. Names and chip numbers 15 px. Meta text 13–14 px. Nothing is under 13 px.
- **Shape:** radius 12 for sections, 8 for chips and marks, 6 for priority chips.
- **Contrast:** every text pair measured at 4.5:1 or more in the browser, in both themes, on all five mock-up views. The browser's `color-mix()` results were read as `color(srgb …)`.
- **Tap targets:** every button is at least 44 px tall.

## Data notes for the server (Kevin, Bob)

1. **`room.feed` items need `project`.** `RoomFeedItem` has no project today, so Recent can't be filtered by project, and every outcome would show in every project.
2. **Facts per project.** Facts are built for `focus` only (`roomFacts(…, focusPath)`). The page needs `{ live, branch }` for each registry project: the deploy from `snapshots[p].deploy`, the branch from that project's `.git/HEAD`.
3. **Crew comes from tasks, not `room.members`.** A member is one per role across all projects, which is why the counts disagreed above.
4. **Model override on a task (optional).** To keep "model override", a task needs the assign's `model` and `declaredModel`, for example `override?: { asked, file }`. Without it, drop the meta text.
5. **Docs that go stale.** `docs/roster.md` mentions the framed pictures on the Crew Room wall. Its "override" badge note still holds, in its new form as meta text.

## Open decisions

1. **Retire the pixel Crew Room entirely?** *Recommendation: yes.* Keep only the faces. It is all in git history if it's ever wanted back as a separate "fun" page.
2. **Facts last?** It follows the contract. On a phone in "All projects", the live versions sit about 4½ screens down. *Recommendation: keep it last for now.* If the owner checks "what's live" often, move it to a one-line strip under the picker, with no other change.
3. **What replaces "App errors" and the CI/PR/commit lists?** *Recommendation: nothing extra.* Failed CI and failed deploys already show as "failed" rows in Recent, and PRs show when opened. If app errors matter, add one red Facts line ("3 app errors since 08:00") only when there are any.
