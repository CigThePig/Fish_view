# Agent instructions — Fish View

Read this before touching anything. It is the shortest description of the
product that is still true, plus the rules that make a change acceptable here.

## What this is

Fish View is a persistent **800 × 480 landscape ASCII aquarium** for an
ESP32-S3 bedroom display. It starts as one hatchling and grows over months and
years. The browser implementation in this repository is the visual reference
and the development environment; it is not the shipping target, and desktop
timing is not device timing.

The first half of the product built the aquarium: identity, personality,
drives, activities, social memory, growth, arrivals, plants, feeding, bubbles,
snails, shrimp, day/night, depth, incremental rendering, persistence.

The second half is
[**Stage 2**](Fish-View-Stage-2-Interaction-Readability-Development-Plan.md),
which builds the relationship layer between the viewer and the aquarium and
makes autonomous behaviour readable enough that a child can tell what is
happening by watching. That document is the specification. This one is the
working agreement. Where they disagree, the plan wins — and say so, rather than
quietly following the older file.

Current Stage 2 status, phase gates and evidence live in
[`docs/stage-2/`](docs/stage-2/README.md).

## The invariants

These are not preferences. A change that breaks one is wrong even if it is
elegant and even if the tests pass.

**One aquarium.** 800 × 480 pixels, 66 × 20 logical cells, landscape, from
`DISPLAY` in `src/sim/config.js`. Portrait simulation, comparison mode,
orientation-specific world generation and alternate logical dimensions were
removed deliberately. A portrait phone shows the same horizontal aquarium,
scaled. Viewport size never reaches world generation.

**No visible game UI.** No buttons, meters, labels, icons, speech bubbles,
hints, notifications, achievements or interaction modes in the aquarium. State
becomes visible through motion, position, posture, spacing, timing, depth and
environmental response, or it does not become visible at all. The hidden
developer drawer (three taps in the upper-right corner) stays developer-only.

**Determinism.** Same aquarium state plus same input history gives the same
result. `src/sim/**` and `src/render/**` contain no `Math.random()`, no
`Date.now()` and no `performance.now()`; wall-clock time enters through
`src/platform/` only. Variation comes from the aquarium seed, fish seed,
personality, position, history and context. `tests/stage-2-invariants.test.js`
enforces this boundary.

**Bounded runtime state.** This device runs for months without a reboot. No
unbounded particle systems, event histories, gesture paths, replay buffers,
interaction queues or per-interaction persistence records. Prefer fixed-size
transient arrays, compact rolling histories, bounded scalars and reconstructable
effects. Every new transient structure needs a documented hard cap.

**Local damage.** The renderer is incremental. A local interaction should
produce local damage. A mature untouched aquarium already repaints about half
the screen per frame (see the [baseline](docs/stage-2/baseline-2026-09-09.md)),
so the headroom is thin: features that continuously change the background
signature, or force full redraws, are regressions regardless of how they look
on a desktop.

> **Touch feedback is water.** Phase 5 replaces the placeholder rings of
> `O o . '` glyphs with muted, broken raster crests in
> `src/render/water-impulses.js`. They expand locally, fade, and drift along a
> directed impulse behind inhabitants. No neon rings, cursor halo, glow or
> full-screen distortion. The effect reads only the existing impulse position,
> strength, radius, age/duration and direction. At most 64 small opaque spans
> per impulse, six impulses overall; no new particles or saved state. Plant
> response uses the grown canopy's vertical reach and a bounded bend/recoil
> envelope. The remaining Phase 5 work is listed in its report; this first
> water/plant slice does not complete the environmental causal-chain gate.

**Nothing dies and interaction cannot punish the child.** No interaction may
kill, remove, permanently harm or permanently frighten a fish, create chores or
guilt, or make the aquarium worse for having been touched. Moderate repetition
with short-term attention saturation and changing response style, never with
punishment. The screen always stays responsive.

**Personality survives.** Interaction and familiarity modify choreography.
They must not flatten a shy fish into a bold one, and they must not vary a
behaviour so far that it stops reading as itself.

## Architecture

A pure simulation tick, a scene composer, and a platform adapter. Keep that
separation; it is what makes the simulation testable and the firmware port
plausible.

| Area | Where | Notes |
| --- | --- | --- |
| World constants | `src/sim/config.js` | `DISPLAY`, cell metrics, clearances |
| State, save, restore | `src/sim/state.js` | `createAquariumState`, `applyTouch`, `applyContact`, `applyRelease`, `serializePersistentState`, `restorePersistentState`, `advanceOffline` |
| Tick | `src/sim/tick.js` | `tick(state, dt)`; behaviour utilities, daylight |
| Activity selection | `src/sim/fish-activities.js` | `ACTIVITIES`, utilities, target resolution, dwell |
| Locomotion | `src/sim/fish-motion.js` | steering, forage geometry, clearances |
| Choreography | `src/sim/fish-choreography.js`, `src/sim/choreography-tuning.js` | chase evasion, per-activity motion shaping |
| Identity | `src/sim/fish-personality.js`, `src/sim/fish-roster.js`, `src/sim/fish-growth.js` | traits and growth derived from seeds |
| Long horizon | `src/sim/aquarium-history.js` | arrivals, propagation, offline progression |
| Interaction events | `src/sim/interaction-events.js` | `stimuli` and `impulses`: transient, capped, coalescing, expiring; the contact stimulus and its clock; the wake and the water it moves |
| Gesture shape | `src/sim/pointer-path.js` | the bounded pointer path, its direction, speed and curvature, and the drag/swipe bands |
| Attention | `src/sim/attention.js`, `src/sim/interaction-context.js` | response roles, interest scoring, passive response shaping, the hold arc and per-fish patience, how a fish chases a moving contact, what a press landed on |
| Environment | `src/sim/environment.js`, `src/sim/bubbles.js`, `src/sim/plants.js`, `src/sim/living-world.js` | surface, bubbles, plants, snails/shrimp/tufts |
| Water feedback | `src/render/water-impulses.js` | Bounded opaque raster crests behind inhabitants; local damage |
| Scene | `src/render/render.js` → `render(state)` | glyph scene: `objects`, `glyphs`, `background` |
| Damage | `src/render/damage.js` → `calculateDamage(previous, next)` | dirty rectangles between two scenes |
| Canvas | `src/render/canvas-renderer.js` | draws a scene; used by app and capture tools |
| Input | `src/platform/aquarium-input.js` | pointer → world coordinates, developer hotspot |
| App | `src/app.js` | pointer events, the contact clock, frame loop, developer drawer |
| Labs | `src/behavior-lab.js`, `src/sprite-sheet.js`, `src/plant-lab.js` | `behaviors.html`, `sprites.html`, `plants.html` |
| Dev fixtures | `src/dev/behavior-showcase.js` | `SHOWCASE_SCENARIOS`, forced scenario states |
| Interaction observation | `src/dev/interaction-observation.js` | pointer histories, controlled replay, per-fish and whole-aquarium measurements, semantic moments |

Simulation state is treated as immutable: functions return a new state rather
than mutating the one they were given. Biological time drives history and
growth; real time drives locomotion and activities. Keep that distinction.

### The interaction path as it stands today

This is the whole of it, so know what it does before you change it.

`src/app.js` handles the **primary pointer only** — a second finger on the
five-point panel reaches nothing — maps each event through `aquariumPoint`, and
outside the developer hotspot drives three verbs in `src/sim/state.js`:

- `pointerdown` → **`applyTouch`**, which classifies what the press landed on,
  registers **one stimulus and one impulse**
  (`src/sim/interaction-events.js`), assigns every fish a **response role**
  (`src/sim/attention.js`), and turns only the fish that are actually going
  somewhere.
- while the contact is down, once per tick and *before* the tick →
  **`applyContact`**, given the point and how long the press has lasted. The app
  owns that clock, because the simulation may not have one.
- `pointerup`, `pointercancel`, or the drawer opening → **`applyRelease`**.

The two event types are the Phase 1 architecture and the distinction is
load-bearing:

- a **stimulus** is something inhabitants can notice — position, intensity, a
  30-cell perception radius, what it landed on, an age and a duration. Fish read
  it; nothing is pushed by it.
- an **impulse** is water actually moving — position, strength, radius,
  envelope, what it touched, and which way it is going. Plants bend in it, a
  substrate impulse shakes bubbles loose, the renderer draws its ripple. None of
  that needs a behaviour.

Both are transient: capped at six each, coalesced when a press repeats within
1.2 cells, dropped the frame they are spent, never serialised, and cleared by an
offline gap. `tests/interaction-events.test.js` guards those rules.

**One contact, three meanings, no modes.** `applyContact` reads what the
gesture currently is from the contact itself and there is nothing for a viewer
to select:

- A press that stays inside `HOLD_MOVEMENT_CELLS` of where it landed and past
  `HOLD_THRESHOLD_SECONDS` is a **held stimulus** — the same event, refreshed in
  place, keeping *the position it landed on*, carrying a hold clock instead of
  decaying. There is at most one and it is never re-registered.
- A press that leaves that allowance is a **gesture with a direction in it**,
  and from then on it is one: the allowance is latched (`wandered`), so a finger
  that wanders and comes back to rest is a drag that stopped, not a presence
  that started late. The stimulus now follows the finger and carries the
  **bounded path** behind it.
- Which gesture it is — a slow **drag** or a fast **swipe** — is read from the
  speed along that path, in bands with hysteresis (`src/sim/pointer-path.js`),
  so a hand slowing down does not change the meaning of what it is doing four
  times on the way.

Release turns whichever it was into a short decaying aftermath and rings the
water once more, gently. A still finger otherwise leaves the water alone: a
finger resting on glass is not a continuous impulse, and making it one would
repaint the same patch for as long as a child cared to lean on it.

A hold's habituation **outlives the finger**. Release clears `held` but keeps
the hold clock, so anything that reads `held` alone treats the aftermath of a
minute-long hold as a brand new tap — which is how the school came to surge at a
contact it had spent the whole hold ignoring. Read `holdAttenuation`, not
`stimulus.held`, wherever a hold is allowed to make something care less.

**Ending a contact is the platform's job, and it is deliberately
over-covered.** `HOLD_STALE_SECONDS` lets a held stimulus go when nothing
confirms it, but that only protects a caller that *stops calling* — it cannot
help while `src/app.js` is still confirming a contact every frame, which is
exactly what a lost `pointerup` leaves it doing. So `src/app.js` ends a contact
on the release, on a cancel from the same pointer, on `lostpointercapture`, on
a release delivered anywhere else on the page, when the drawer opens, when the
tab goes away — and, needing no event at all, from the frame loop once the
contact passes `MAX_HOLD_SECONDS`. If you add another way for a press to begin,
give it a way to end that does not depend on an event arriving.

The Phase 2 response model sits on top:

- Each fish gets one of six roles — investigate, approach, delayed, watch, wary,
  acknowledge — scored deterministically from distance, glass affinity, the
  affinity matching the press's context, boldness, curiosity, energy, whether a
  trusted companion is going, body suitability, and how absorbed it is in what
  it is doing. At most **two primary, two secondary and one delayed** are ever
  pulled off their activity; everyone else answers inside the motion they were
  already making.
- **Something always answers**: the most interested fish that perceived the
  press investigates whatever its score, and if none perceived it, the nearest
  one does — always a fish that is free to answer. A fish whose commitment is
  total (a first-time arrival swimming in) is never taken off it, guarantee
  included; it answers by watching.
- A response **recovers** rather than being cancelled: the fish resumes the
  activity it put down, on a per-fish seeded beat.
- The record is one transient object per fish, never persisted.
  `tests/attention-roles.test.js` guards the vocabulary, the caps, the
  guarantee and the recovery.

One tap now leaves seven to ten activities standing where it used to leave one.
Reproduce it with `npm run observe:interaction`, or look at it with
`npm run capture:interaction -- --roles`.

The Phase 3 hold arc sits on top of that again. While a contact is down the
aquarium **re-reads** it every `HOLD_REVIEW_SECONDS`, running the same Phase 2
assignment against a disturbance that has not gone away — which is what lets a
fish arrive late, follow a companion to the glass, or hand over to one that has
not had its turn. Two rules make it bounded and readable:

- **Patience is per fish, and it is spent on the fish's own answer.** A fish
  crossing the tank has not been staring at a finger, so habituation runs on its
  response, not on the hold clock; a fish that ignored the presence habituates on
  the hold clock and does not suddenly find it fascinating. Patience comes from
  curiosity, glass affinity and boldness (2.4 s to about 14.5 s), so a cautious
  fish is not a slow bold one — it arrives later, stops further out and gives up
  sooner.
- **Staying costs less interest than coming.** A fish already answering keeps
  the answer it is giving at `HOLD_INCUMBENT_FRACTION` of the bar a fish
  somewhere else has to clear to come over. Both halves matter: at one bar, two
  engaged fish either side of a threshold swap roles every re-read (a fish
  jerking 2.7 cells in and out of the glass twice a second), and every responder
  leaves the moment habituation touches it, so a hold has nobody at it inside
  half a minute. The gap between the two bars is what makes "willingness to
  remain nearby" a trait rather than a timer.
- **A re-read carries no guarantee.** The *press* must always be answered; a
  press that is still going on need not be. That is what lets a long hold end in
  the plan's last stage — everyone settles — and it is why a sixty-second hold
  costs what a fifteen-second one does.

`holdPhase` in `src/sim/attention.js` derives which of `notice`, `orient`,
`approach`, `inspect`, `linger`, `settle` and `depart` a fish is in, every
frame, from the record and where the fish actually is. Nothing stores a phase.
See it with `npm run observe:interaction -- --scenario=long-hold
--detail=long-hold`.

Phase 4 gives the motion in a gesture meaning, and it does it by moving points
rather than by moving fish. Three things follow from a contact that is going
somewhere:

- **The path.** Six samples, spaced by time rather than by frame, with the
  newest kept live (`src/sim/pointer-path.js`). It is enough to estimate
  position, direction, speed and curvature, and it does not grow by one entry if
  a child drags for an hour. That cap is the contract; `PATH_MEMORY_SECONDS`
  keeps the window the same half second whatever rate the platform confirms a
  contact at.
- **The wake.** A moving contact rings the water behind it, spaced by distance
  rather than by frame and capped at `MAX_WAKE_IMPULSES` **live** wakes — the
  fourth replaces the first, so a drag the length of a bedtime story costs what a
  drag across the tank does. A wake carries a direction, and `impulseFlowAt` is
  the one function that says which way the water is moving at a point: the
  school is carried by it, a bubble is pushed sideways by it, and a plant leans
  downstream in the horizontal share of it instead of leaning away.
- **Pursuit.** A fish answering a moving contact aims at one of three places,
  derived from its boldness and from how sharply the finger is turning
  (`stimulusFocus`): the water ahead of the finger, the water it went through a
  third of a second ago, or the oldest place the path still remembers. Nothing
  drives the fish — the fish swims to that point at its own speed, and arrives,
  or is left behind. **No finger may ever overwrite a fish's position or
  velocity**, and `tests/drag-swipe.test.js` measures that as the longest
  unbroken time any fish spends within a body length of a moving contact.

A swipe is not a louder drag. Fast water is a shock rather than an invitation:
timid fish lose interest in it in proportion to how timid they are and answer by
leaning away, and the circle of turned heads is wider. That is bounded to one
response and remembered against nobody — an interaction may never punish the
child or leave a fish permanently frightened.

Everything a still press does is unchanged by this. When a contact is not
moving, all three pursuits collapse onto the point the fish remembers, no wake
is due, and the gesture is `press`: 56 of the 66 scenarios in the observation
sweep reproduce field for field against Phase 3's evidence, and nine of the ten
that differ are the three gestures with motion in them.

## Working agreement

**Investigate before modifying.** Read the production code, its tests and the
existing developer tooling for a subsystem before changing it. Several
subsystems carry hard-won constraints — substrate clearance, pitch rotation,
glyph rasterisation, save repair — that are explained in comments where they
live. Do not rewrite a system because a new architecture is easier to describe.

**One phase, one reviewable unit.** Follow the plan's phase order. Do not
collapse phases, and do not begin the next one before the current one's gate is
met and its report is written.

**Evidence, not just tests.** Visual and behavioural work is not accepted
because a test suite passed. Each phase leaves reusable evidence: deterministic
scenarios, measurements, contact sheets, captures, damage reports, before/after
comparisons. Use
[`docs/stage-2/phase-report-template.md`](docs/stage-2/phase-report-template.md)
and end every report with an explicit **PASS** or **FAIL**.

**Validate on the production path.** Forced fixtures are for isolating a
behaviour. Also show the same behaviour can occur through production code —
selection, utilities, tick — and not only when a lab hand-places a fish.

**Do not optimise for test count.** This is one aquarium in a child's room.
Spend effort on visual quality, behavioural correctness, continuity, bounded
cost and real interaction quality, not on hundreds of redundant edge cases.

**Persistence is a contract.** `PERSISTENCE_VERSION` is 2. Old saves must
restore with sensible defaults, malformed values must be repaired rather than
discarding the aquarium, and transient interaction state must never be written.
A fully stocked ten-year aquarium serialises to under 18 KB; keep it bounded.

## Running things

Node 20 or later (CI uses 22). No production dependencies; `@napi-rs/canvas`
is a development-only dependency used by the capture tools.

```sh
npm ci
npm start                 # http://localhost:4173
npm test                  # node --test, ~2 minutes
npm run verify            # the full CI gate: tests + all four audits
```

Individual gates and instruments:

```sh
npm run audit:simulation                  # deterministic tick replay, escapes, step limits
npm run audit:persistence -- --cases=200  # malformed-save fuzzing and repair
npm run audit:render                      # incremental vs full render, pixel comparison
npm run measure:feeding                   # substrate strike geometry per species and stage
npm run measure:readability               # per-activity motion signatures and damage
npm run measure:stage2-baseline           # tap synchronisation, damage headroom, save size
npm run observe:interaction               # replay pointer histories; per-fish and whole-aquarium response
npm run observe:interaction -- --seeds=5 --scenario=chase-tap --detail=chase-tap
npm run observe:interaction -- --scenario=long-hold --detail=long-hold --seconds=38
npm run observe:interaction -- --scenario=slow-drag,fast-swipe --detail=slow-drag
npm run measure:screen                    # panel legibility
npm run measure:living                    # long observation summary
npm run capture:behaviors -- --scenario playful-chase --scale 1 --gif
npm run capture:interaction -- --scenario=open-water-tap --scale=1 --gif
npm run capture:interaction -- --scenario=rest-tap --roles     # response roles drawn over the frame
npm run capture:interaction -- --scenario=long-hold --roles   # roles plus the hold phase each fish is in
npm run capture:interaction -- --scenario=slow-drag,fast-swipe --roles  # the path, the wake and how each fish is chasing
npm run capture:depth
npm run capture:living
npm run build:pages
```

Reports land in `.audit-output/`, captures in `.behavior-captures/`; both are
git-ignored. Evidence worth keeping goes in `docs/assets/` and is linked from
the phase report that produced it.

## Conventions

- ES modules, browser-compatible, no build step for the app itself. Tools are
  `.mjs` under `tools/` and may use `node:` built-ins.
- No production dependencies. Do not add one.
- Comments explain *why*, especially where a constant encodes a physical
  constraint or a past defect. Match the surrounding density and voice; the
  existing prose is deliberate.
- Tests use `node:test` and live in `tests/`, with shared fixtures in
  `tests/support/aquarium.js` (`stockedAquarium`, `partStockedAquarium`,
  `grazingIndividual`).
- Never introduce console logging into `src/`.

## Git

Work on the branch you were given, commit with a clear message describing the
behaviour that changed, and push. Do not open a pull request unless asked.
