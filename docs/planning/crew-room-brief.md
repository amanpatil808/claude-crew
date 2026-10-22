# Crew Room brief: visits, hand-overs, badges, walking (P1)

Owner: Dexter (research) · Build: Shinchan · Review: Nobita · 22 Oct 2026
Scope: `room.js`, `room.css`, `lib/room.ts`, `lib/crew.ts`, `hook.ts`. Nothing here changes the Live tab or the feed's rule (feed = real outcomes only).

**Today (measured in the page, 1360 px):** seated characters are 70 x 78 px (`.av` 48 x 54 at `scale(1.45)`); walkers are 32 x 36 px (`scale: .66`), so a person shrinks to 45 % the moment they stand up. Walkers slide on a WAAPI polyline with `linear` easing, wobble ±4° with no legs, and the 2-4 s duration clamp makes long trips faster than short ones. All walkers sit in one overlay at `z-index: 6`, anchored at their centre, not their feet.

**Our own log** (`log/events.jsonl`, 22 Oct, 7.4 h): 45 runs, median 3.1 min, p75 4.8 min, p90 10.7 min. 20 crew hand-backs in total (about 3 an hour), at most 3 inside one minute. 26 `general-purpose` stops have no role and stay off the board. Expect calm traffic with short bursts.

## 1. The four asks as behaviours

| # | Scene | Trigger (real event) | Behaviour and timing |
|---|---|---|---|
| 1a | **Brief visit** | `assign` from the manager (Agent tool or SendMessage) to a role on the board | Doraemon stands up, walks to the member's stand spot and faces them. Bubble shows the assign text (already redacted, ≤ 70 chars) for 1.2 s + 40 ms per character, clamped to 2-4 s. Then he walks home and sits. If several assigns reach the same member within 60 s, merge them into one visit and show the latest text. |
| 1b | **Check-in** (visual only) | Member `working` for ≥ **8 min** since their last contact (start, assign to them, or an earlier check-in), **and** the manager session is alive (a `main-busy` or `turn-end` in the last 10 min) | Same walk as 1a. The bubble shows a clipboard icon and "Checking in", never invented words. Stay 1.5 s. At most one per member per 10 min and one on the whole board per 3 min. Not written to the feed. 8 min sits between our p75 (4.8) and p90 (10.7), so only the long runs, about 1 in 7, get one. |
| 1c | Agent start | `agent-start` | **No walk-in from the door.** The member wakes at their desk: the "z" stops and the laptop opens. When the start and an assign for the same role land within 10 s, play only 1a. This replaces today's door "enter" walk, which doubled the motion. |
| 2 | **Hand-over** | `agent-stop` for any role except the manager | The member stands, walks to Doraemon and stops one body-width beside him, facing him. Hand-over beat (600 ms): the item they carry (folder; paper if the summary names a PR or commit) arcs 16 px into his hands and he does one `happy` hop. Their bubble shows the summary (≤ 70 chars, as today) for 2-4 s. The member walks home and sits in `done`. If Doraemon is out on a visit, the member waits at his desk for up to 6 s, then puts the item on his desk (it stays there until he sits) and leaves. |
| 3 | Badges | Always on | See section 3. |
| 4 | Walking | Every walk | See section 2. |

**Scheduler.** Doraemon is one actor, so his scenes run one at a time. Priority: hand-over > brief visit > check-in. A member already walking to him holds his visits until they arrive. At most **2 walkers on screen** (today 3). Queue cap 8: drop check-ins first, then the oldest visit, never a hand-over. Keep the 2-minute replay window and "nothing runs in a hidden tab" (pause the loop on `document.hidden`).

## 2. Walking and sprite spec

- **One size everywhere.** Add `--char: 1.25` (60 x 68 px) and use it for seated characters, walkers and nothing else; minis stay as they are. No scaling during a walk. Raise the corridor `--corr` to 48 px (wide) and 44 px (≤ 600 px). Characters stand with their feet on the corridor line and their heads may overlap the wall above, which is how Gather sizes avatars (ref 3).
- **Feet anchor.** The walker's origin is its bottom-centre. Set `left: -30px; top: -68px` so `translate(x, y)` puts the feet on the path. Draw a 28 x 6 px ellipse shadow at the feet that does not bob.
- **Facing (4 directions)** via `data-dir` on the walker:
  - **down:** today's front art.
  - **up:** back view. Hide eyes, blush, nose, mouth, glasses and smile, and fill the face with the head colour (one CSS rule per kind, using parts that already exist).
  - **left / right:** front art with eyes and pupils shifted 2 px toward travel. Mirror with `scaleX(-1)` only on the left. Turns snap at corners with no tween, as in pixel games.
- **Walk cycle: 4 frames at 150 ms each** (Pixel Agents uses 0.15 s, ref 1). Add two feet parts (`i.foot.l`, `i.foot.r`, 10 x 5 px, `--dark`) to every character.
  - Frame 1: left foot 3 px forward.
  - Frame 2: passing, body up 2 px.
  - Frame 3: right foot 3 px forward.
  - Frame 4: passing, body up 2 px.
  - Use `steps(1)`. Remove the ±4° rotation. Idle bob and blink stay as they are.
- **Speed:** a constant **100 px/s**, about 1.5 body heights a second (Pixel Agents walks 48 px/s with 32 px tall sprites, ref 1). Ease in over the first 120 ms and out over the last 120 ms, and stay linear in between. One cycle (600 ms) covers 60 px, so the feet match the ground and do not slide. For trips over 7 s, raise the speed up to 1.6x and shorten the frame time by the same factor.
- **Anywhere Door for long trips.** A route still over 7 s at 1.6x walks to the nearest room door. A pink Anywhere Door appears for 600 ms, the character steps in, and comes out at the target room's door. This keeps wide layouts calm and fits the theme.
- **Movement engine:** replace WAAPI keyframes with one `requestAnimationFrame` loop that holds `{path, dist, speed}` per walker. Each tick sets `translate3d(round(x), round(y), 0)`, which gives whole-pixel positions and crisp edges, plus `data-dir` and `data-frame`.
- **Paths:** keep today's corridor graph (left spine, corridor above each row, room door at top centre). Inside a room, go door → a lane 12 px below the wall → the target's column → the stand spot. Never cut across a desk.
- **Stand spot:** feet on the target's table line, offset sideways by one body width (60 px) toward the side with more space. When both sides are blocked, stand in front, at the top edge of the plate.
- **Y-sort:** each walker's `z-index` is 10 + its rounded feet y, so the lower person draws in front, the same rule as Pixel Agents' `y + TILE/2` (ref 1). In v1, walkers stay in the overlay above all furniture. Paths avoid desks, so this never looks wrong.
- **Bubbles:**
  - At most 2 lines.
  - Width: `max-width: min(180px, hall width - 16px)`, clamped inside the hall. Flip left or right to stay in view, instead of today's alternating sides.
  - Fade 250 ms in and 500 ms out.
  - Only the speaker in a scene shows a bubble.

## 3. Model and level badges

**On the plate:** one chip row under the name: `[OPUS] [v0.2] [L]`.
- **Chip style:** body font, bold, 13 px, uppercase, letter-spacing .04em, 20 px tall, 5 px side padding, radius `--r-chip`. Plates are cream in every theme (`--plate` #f3d98c, #fff3c4 or #f3dd92), so one colour set works in both modes. Colour weight follows model size, and each chip carries its name, so nothing depends on colour alone:

| Chip | Style | Contrast on its own fill or plate |
|---|---|---|
| OPUS | fill #5b21b6, text #fff | 9.0:1 |
| SONNET | fill #1d4ed8, text #fff | 6.7:1 |
| HAIKU | no fill, 2 px border #3f3f46, text #3f3f46 | 7.5:1 |
| v0.2 (version) | no fill, 1 px border `--plate-ink`, text `--plate-ink` | 10.7:1 |
| L (training) | 20 x 20 px white square, red #c81e1e "L" (a learner plate, a sign Indian drivers know) | 5.7:1 |

- No green chip, because green already means `done`. With no `model` in the frontmatter, show no model chip; the card says "inherits the lead's model". When a run used the Agent tool's `model` override, the chip shows that model with an asterisk (`SONNET*`).
- **At ≤ 600 px:** model chip and version only. The `L` moves to the card.
- **Card:** a line "Opus · high effort · up to 120 turns" and a line "v0.2 · in training".
- **aria-label:** add "model Opus, version 0.2, in training".

## 4. Data changes

| Field (per role in `room.roles`) | Source | Where |
|---|---|---|
| `model`: `opus`, `sonnet`, `haiku` or none | `.claude/agents/<slug(mascot)>.md` frontmatter `model` | `lib/crew.ts` `listRoles()`. Read the frontmatter with a line regex (no YAML library) and cache by file mtime. |
| `effort`, `maxTurns` | same frontmatter (`effort`, `maxTurns`) | same |
| `version`, `stage` | the `(v0.2, training)` tag at the end of `description` | same. When the tag is missing, leave both empty. |
| `RoomMember.contactAt` | latest `assign` to that role, or its start | `lib/room.ts` `roomMembers()`. It drives the check-in timer. |
| `RoomMember.runModel` (optional) | the Agent tool's `tool_input.model`, logged as `model` on the `assign` event | `hook.ts` `assignEvent()`: one more field. |
| `managerAlive` | `main-busy` or `turn-end` in the last 10 min | `room` top level, from the existing `mainBusy()` |

- Make the agent file the single source of truth.
- Stop reading the hand-written `"model": "Opus 5.5"` in `roles/*.json`, and tell Dorami so she stops keeping it.
- Mapping check: `slug("Chip & Dale")` gives `chip-and-dale`, which matches the file name.

## 5. Top references (accessed 22 Oct 2026)

1. **Pixel Agents** (Claude Code in VS Code, MIT; last commit 16 Oct 2026): [repo](https://github.com/pablodelucca/pixel-agents), with details in its [CLAUDE.md](https://github.com/pablodelucca/pixel-agents/blob/main/CLAUDE.md) and [constants.ts](https://github.com/pablodelucca/pixel-agents/blob/main/webview-ui/src/constants.ts).
   - Borrow the numbers: 48 px/s walk, 0.15 s walk frames and 0.3 s typing frames.
   - Borrow the drawing rules: sprites 16 x 32 px with a left view mirrored from the right, and depth sorted by y plus half a tile.
   - Borrow the behaviour: integer zoom, BFS paths to an assigned seat, 0.5 s bubble fades, and a waiting check that auto-fades after 2 s.
   - Also note that sub-agents appear next to their parent.
2. **AI Town** (a16z, MIT): [repo](https://github.com/a16z-infra/ai-town), with details in its [ARCHITECTURE.md](https://github.com/a16z-infra/ai-town/blob/main/ARCHITECTURE.md), [f1.ts](https://github.com/a16z-infra/ai-town/blob/main/data/spritesheets/f1.ts) and [constants.ts](https://github.com/a16z-infra/ai-town/blob/main/convex/constants.ts).
   - Borrow the meeting model: a two-person conversation goes `invited` → `walkingOver` → `participating` (our visit and hand-over beats).
   - Borrow the sprite layout: 32 x 32 px frames, 3 per direction, 4 directions.
   - Borrow the pacing: cooldowns (15 s after any talk, 60 s before talking to the same person again), the model for our per-member visit limits.
   - Borrow the smooth motion: the client replays recent position history.
3. **Gather**, [Sizes](https://support.gather.town/articles/9253868124-sizes): 32 px tiles, avatars 30-36 px tall that overlap the tile above. Borrow full-size characters whose heads may cross the wall line, instead of shrinking them to fit a corridor.

Supporting sources:
- W3C, [Understanding SC 2.3.3 Animation from Interactions](https://www.w3.org/WAI/WCAG21/Understanding/animation-from-interactions): honour `prefers-reduced-motion` and keep a user toggle (we have one).
- Feet-origin y-sort, explained in a Godot note: [bugnet.io](https://bugnet.io/blog/how-to-fix-godot-ysort-feet-sorting-with-wrong-origin).
- A 4-frame walk loop: [OpenGameArt template](https://opengameart.org/content/walk-animation-template).

## 6. Do not

- **Shrink or rescale a character** mid-walk, or use non-matching sizes between seat and corridor.
- **Rotate or wobble the body** to fake steps. Use feet frames.
- **Walk on every event:** no walks for commits, CI, `general-purpose` agents, starts (1c) or the heartbeat alone. A PR or deploy errand stays at most one Doraemon walk, only when nothing else is queued.
- **Write fake words:** check-ins show an icon and "Checking in", nothing that reads like a real message, and they never enter the feed.
- **Overlap speech:** no more than 2 bubbles, no bubble taller than 2 lines, no sound.
- **Repeat facts:** the status text stays on the plate, so a hand-over bubble must not repeat the plate's "Handed back" line word for word. Use the summary, or "Done!".
- **Crowd the board:** more than 2 walkers, or replaying more than 2 minutes after the tab comes back.
- **Reduced motion or Motion off:** no walking.
  - A visit or check-in pins a 20 px Doraemon mini on the member's plate for 4 s.
  - A hand-over draws a 4 s dashed ring on both desks with "→ Doraemon" on the member's plate.
  - Bubbles stay static at the desk.
  - Same information, no movement (WCAG 2.3.3).
