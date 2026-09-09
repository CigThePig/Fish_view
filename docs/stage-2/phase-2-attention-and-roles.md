# Phase 2 — Attention, response roles and the contextual tap

**Branch:** `claude/phase-0-completion-2srbne`  ·  **Baseline commit:** `a168a87`  ·  **Date:** `2026-09-09`

This is the phase Stage 2 was written for. Until now a tap did one thing:
fifteen fish dropped what they were doing, in the same tick, and swam at the
point. The pre-Stage-2 instrument measured it as **one activity, whole cast,
every seed**, and everything since has been building the machinery to end it
without losing the guarantee that the aquarium always answers.

A press is now an **attention event**. It still rings the water immediately, and
something always goes to look — but each fish is given a deterministic
**response role**, and most of those roles do not interrupt the fish at all. One
goes to look. One or two come partway and hang back. One finishes its mouthful
and then goes. The rest turn toward it and slow, or lean away, or give one flick
and carry on with their evening.

Measured by the instrument written before Stage 2 began, on the three baseline
seeds: **one tap used to leave 1 activity standing. It now leaves 9, 7 and 7.**

## Changes made

**Production:**

- `src/sim/attention.js` — new. The role vocabulary, the deterministic interest
  score, the assignment (with its caps and its guarantee), the per-fish response
  record and its lifecycle, and the passive-response shaping.
- `src/sim/interaction-context.js` — new. What a press landed on: `fish`,
  `bubble`, `substrate`, `surface`, `plant` or `open-water`.
- `src/sim/interaction-events.js` — a stimulus carries its `context`, and a
  tap's perception radius is 30 cells rather than the whole aquarium.
- `src/sim/state.js` — `applyTouch` classifies the press, registers the events,
  assigns roles, and turns only the fish that are actually going anywhere. The
  school is now drawn to a disturbance near it and ignores one across the tank.
- `src/sim/fish-activities.js` — the activity tick reads roles instead of
  forcing `touch-react` on everything, holds a wider standoff for secondary
  responders, shapes passive responses into the motion a fish was already
  making, and implements the recovery policy. Adds the activity-commitment
  table.
- `src/sim/tick.js`, `src/sim/entities.js` — the per-fish response record is
  carried and cleared; the school's attraction falls off with distance.
- `src/sim/config.js` — `TOUCH_FLOOR_ROWS`, the lowest row a press can reach,
  now named once instead of three times.
- `src/dev/behavior-showcase.js` — the touch-react lab poses a response role as
  well as a disturbance.

**Tooling:** the harness records each fish's role and the per-press role mix;
`npm run capture:interaction -- --roles` draws the roles over the frame.

**Tests:** `tests/attention-roles.test.js` (ten), plus updates where existing
tests asserted the old global behaviour.

## Architecture

**The role vocabulary** — six, fixed, and each one a visible thing:

| Role | What the fish does | What you see |
| --- | --- | --- |
| `investigate` | switches to `touch-react`, closes to its own glass-affinity standoff | goes to look |
| `approach` | same, plus 2.7 cells of extra standoff | comes partway, hangs back |
| `delayed` | keeps its activity for a seeded 0.6–1.6 s beat, then goes | finishes its mouthful, then turns |
| `watch` | keeps its activity; heading bends up to 0.85 rad toward the press, speed −50 % | turns to look |
| `wary` | keeps its activity; heading bends away, speed −30 % | leans away, keeps its distance |
| `acknowledge` | keeps its activity; a 0.8 s flick toward the press | one glance and carries on |

**Assignment** is one deterministic pass over the fish that can perceive the
stimulus (30 cells). Interest is scored from proximity, glass affinity, the
affinity that matches the press's context, boldness, curiosity, energy, whether
the fish's most trusted companion is already going, whether its body suits the
context (a bottom-feeder and a press in the sand), and a small seeded jitter —
minus how absorbed it is in what it is doing. Roles then fall out of interest,
commitment and three caps: **2 primary, 2 secondary, 1 delayed**. Everything
else is passive. Across the 45-scenario sweep that comes to **1–4 fish
interrupted per press, 3.2 on average, out of fifteen**.

Two rules make the whole thing safe to build on:

- **Something always answers.** The most interested fish that perceived the
  press always becomes the primary investigator whatever its score, and if none
  perceived it, the nearest fish does. The water rings in the same frame
  regardless. A press is never ignored.
- **Being busy decides *when*, not *whether*.** An absorbed fish never sets off
  mid-mouthful: it either finishes and then goes (delayed) or watches from where
  it is. The commitment table lives with the activities, because that is where
  the knowledge is.

**Recovery** is a resumption, not a cancellation. A fish that turns to look
carries what it was doing on its response record, and when the response ends it
picks that activity back up — and only then, if the activity has naturally
completed, does it choose a new one. Response length is seeded per fish and per
event (0.55–1.45 × the stimulus's own life), so responders let go on different
frames instead of the whole cast snapping back together.

**Bounded state.** One response record per fish — eight scalars plus, for a fish
that put something down, the activity it put down — so fifteen is the hard
maximum. Transient: never serialised, replaced by the next press, cleared by an
offline gap, and gone the moment it expires. `tests/stage-2-invariants.test.js`
now checks per-fish transient keys as well as top-level ones.

## Visual result

A tap no longer looks like a summons. One fish comes over and noses around the
spot; another follows it partway and stops short; the fish that was working the
sand keeps working it, then lifts and goes; a shy one two body-lengths away
leans back and carries on; the ones across the tank tip a nose and keep
swimming. Ten seconds later the aquarium is doing what it was doing before, but
not by snapping back — each fish lets go on its own beat and picks up its own
thread.

![Response roles](../assets/stage-2/phase-2/response-roles-contact-sheet.png)

The overlay is the developer capture (`--roles`), never the product: **I**
investigate, **A** approach, **D** delayed, **W** watch, **y** wary, **·**
acknowledge, with the ring marking the press. Read the three rows against the
[Phase 0 sheet](../assets/stage-2/phase-0/interaction-baseline-contact-sheet.png),
where every fish in every row is converging on one point.

## Evidence

| Claim | How it was checked | Where |
| --- | --- | --- |
| One tap no longer synchronises the cast | The pre-Stage-2 instrument, unchanged since before Stage 2: activities left standing one frame after a tap went from **1, 1, 1** to **9, 7, 7** on seeds 5, 147, 1234 | `npm run measure:stage2-baseline` |
| …across every scenario and seed | 45 observations: distinct activities after the press **1 → 7.2 mean (1–10)**; fish interrupted **15 → 3.2 mean (1–4)** | [`interaction-observation.json`](../assets/stage-2/phase-2/interaction-observation.json) |
| Multiple fish visibly react differently | **5.8 distinct roles per press** (3–7). Across the sweep: 62 investigate, 77 approach, 19 delayed, 71 watch, 78 wary, 214 acknowledge, 112 fish out of range | evidence file, `aquarium.roles` |
| Immediate feedback is still guaranteed | A press at any of five points, including a corner and a point with no fish near it, always produces an impulse, a stimulus and at least one investigator — including in a one-fish aquarium | `tests/attention-roles.test.js` |
| Activities are not indiscriminately cancelled | Every fish not interrupted holds the exact activity and velocity it had; the fish that was feeding when the press landed stays on the sand and resumes | `tests/attention-roles.test.js`, `tests/phase2-activities.test.js`, the feeding scenario |
| Recovery is readable | A responder's activity at the frame it lets go is the activity it put down; responders release on different frames | `tests/attention-roles.test.js` |
| Roles are deterministic and bounded | Same aquarium and press give the same roles; caps hold; the vocabulary is closed and every role in it actually occurs | `tests/attention-roles.test.js` |
| Passive responses have a visible correlate | A passive responder differs from its untouched twin in position, speed or pitch within 1.2 s, without changing activity | `tests/attention-roles.test.js` |
| The tap is classified by what it landed on | Six contexts, deterministic; over a press-by-press grid of the whole tank: open water 55 %, plant 18 %, fish 12 %, substrate 7 %, surface 5 %, bubble 3 % | `tests/attention-roles.test.js`, `src/sim/interaction-context.js` |
| Autonomous behaviour is untouched | The ordinary deterministic ten-minute watch is **identical** to the baseline, activity for activity and peck for peck (694) | `npm run measure:readability` |
| The gate is green | 350 tests (340 before, 10 added), simulation 48 000 ticks / 0 failures, persistence 200 / 0, render 540 frames / 0 differing, feeding 0 stages outside tolerance | `npm run verify`, 3 min 24 s |

What a single press looks like now, from the sweep (seed 5):

| Scenario | Roles | Interrupted | Activities after |
| --- | --- | ---: | ---: |
| open-water tap | 1 investigate, 2 approach, 1 delayed, 1 watch, 2 wary, 8 acknowledge | 4 | 9 |
| substrate tap | 1 investigate, 2 approach, 2 watch, 3 wary, 4 acknowledge, 3 out of range | 3 | 9 |
| tap during feeding | 1 investigate, 1 approach, 1 delayed, 2 watch, 3 wary, 5 acknowledge, 2 out of range | 2 | 10 |
| tap during a chase | 1 investigate, 2 approach, 1 delayed, 2 watch, 1 wary, 1 acknowledge, 7 out of range | 4 | 7 |
| tap during rest | 1 investigate, 1 delayed, 2 watch, 2 wary, 9 acknowledge | 1 | 9 |
| night tap | 1 investigate, 1 wary, 13 acknowledge | 1 | 9 |

Response latency has become a measurement rather than a floor. It was **0.1 s
for every fish at every distance**; it is now 0.1 s at the median 0.4 s, out to
6.7 s for a delayed investigator, and 39 of 211 measured fish never deviate from
their untouched twin at all.

## Performance

| Measure | Phase 1 | This phase |
| --- | --- | --- |
| Mature untouched avg / max damage | 58.3 / 51.8 / 52.1 % per seed | identical — no stimulus, no change |
| Interaction avg damage (stocked + mature) | 52.9 % | 53.4 % |
| Interaction worst frame | 97.9 % | 98.1 % |
| Dirty rectangles per frame | 18.2 | 18.7 |
| Peak scene glyphs | 1 245 | 1 245 |
| Full redraws | 0 | 0 |
| Tap damage, pre-Stage-2 instrument | 55.2 / 52.4 / 56.8 % | 53.5 / 52.9 / 55.7 % |

Half a percentage point of average damage, no new peak, no new glyphs, and the
old instrument reads the touched aquarium as slightly *cheaper* than before —
because three fish crossing the tank paint less than fifteen. The scene cost of
this phase is a rounding error; what it spent was thinking, not pixels.

## Persistence

Unchanged. `PERSISTENCE_VERSION` is still 2, no field added. A stocked ten-year
aquarium with fifty taps serialises to 17 863 bytes against 17 853 before — ten
bytes of difference from fish sitting in slightly different places, not from
anything new being written. Response roles are transient: absent from the
payload, cleared by a reload and by an offline gap, and the invariants test now
proves it per fish as well as per aquarium.

## Remaining limitations

- **Long-term familiarity is not in the score yet.** Interest reads fixed glass
  affinity, not what this fish has learned about this viewer. Phase 6 adds the
  relationship term; the hook is one line in `attentionInterest`.
- **`watch` and `acknowledge` differ mostly in degree.** Both turn and slow;
  one is stronger and longer. Phase 8's salience work is where a watching fish
  should get a distinct standoff posture.
- **A press near a specific fish only raises that fish's proximity score.** The
  plan allows more (deliberately not making it a draggable UI element); a
  "someone is pointing at *me*" response is still just distance.
- **Passive responses cannot show on a parked fish.** A sheltering fish that is
  already still has only its posture to answer with, and a nose tip is the whole
  reaction. That is honest, but it is thin.
- **The showcase touch-react loop now includes its own recovery**, so its
  readability signature reads 0.67/0.77 speed and 13.2/22.2 pitch against the
  baseline's 0.73/0.78 and 19.4/23.3. The difference is the aftermath, not the
  approach.
- **Hold, drag and swipe still deliver only their opening press.** Phases 3 and
  4.

## Gate decision

| Gate item (plan §8) | Met |
| --- | --- |
| One tap no longer synchronises the full persistent cast | Yes — 1 activity standing became 7–10; 3.2 of 15 fish interrupted on average |
| Immediate feedback remains guaranteed | Yes — the impulse rings in the same frame and at least one fish always investigates, tested at the corners, the sand, the surface and in a one-fish tank |
| Multiple fish visibly react differently | Yes — 5.8 distinct roles per press, six-role vocabulary, all six occurring, with a capture that shows them |
| Current activities are not indiscriminately cancelled | Yes — every uninterrupted fish keeps its activity and heading; committed fish finish first |
| Recovery is readable | Yes — responders resume what they put down, on staggered per-fish beats |
| Interaction remains deterministic | Yes — same aquarium and press give the same roles; 48 000-tick audit clean |
| No obvious hardware-budget regression | Yes — +0.5 pp average damage, no new peak or glyphs, 0 full redraws |
| Response roles consider distance, activity, personality, glass affinity, energy, social relationships, companions, species and salience | Yes — every term is in `attentionInterest`; familiarity waits for Phase 6, as the plan says |
| Contextual tap classification, deterministic and bounded, with no user modes | Yes — six contexts from the aquarium itself |

**PASS — phase complete; proceed.**
