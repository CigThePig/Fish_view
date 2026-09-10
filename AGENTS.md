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
| State, save, restore | `src/sim/state.js` | `createAquariumState`, `applyTouch`, `serializePersistentState`, `restorePersistentState`, `advanceOffline` |
| Tick | `src/sim/tick.js` | `tick(state, dt)`; behaviour utilities, daylight |
| Activity selection | `src/sim/fish-activities.js` | `ACTIVITIES`, utilities, target resolution, dwell |
| Locomotion | `src/sim/fish-motion.js` | steering, forage geometry, clearances |
| Choreography | `src/sim/fish-choreography.js`, `src/sim/choreography-tuning.js` | chase evasion, per-activity motion shaping |
| Identity | `src/sim/fish-personality.js`, `src/sim/fish-roster.js`, `src/sim/fish-growth.js` | traits and growth derived from seeds |
| Long horizon | `src/sim/aquarium-history.js` | arrivals, propagation, offline progression |
| Interaction events | `src/sim/interaction-events.js` | `stimuli` and `impulses`: transient, capped, coalescing, expiring |
| Attention | `src/sim/attention.js`, `src/sim/interaction-context.js` | response roles, interest scoring, passive response shaping, what a press landed on |
| Environment | `src/sim/environment.js`, `src/sim/bubbles.js`, `src/sim/plants.js`, `src/sim/living-world.js` | surface, bubbles, plants, snails/shrimp/tufts |
| Scene | `src/render/render.js` → `render(state)` | glyph scene: `objects`, `glyphs`, `background` |
| Damage | `src/render/damage.js` → `calculateDamage(previous, next)` | dirty rectangles between two scenes |
| Canvas | `src/render/canvas-renderer.js` | draws a scene; used by app and capture tools |
| Input | `src/platform/aquarium-input.js` | pointer → world coordinates, developer hotspot |
| App | `src/app.js` | pointer events, frame loop, developer drawer |
| Labs | `src/behavior-lab.js`, `src/sprite-sheet.js`, `src/plant-lab.js` | `behaviors.html`, `sprites.html`, `plants.html` |
| Dev fixtures | `src/dev/behavior-showcase.js` | `SHOWCASE_SCENARIOS`, forced scenario states |
| Interaction observation | `src/dev/interaction-observation.js` | pointer histories, controlled replay, per-fish and whole-aquarium measurements, semantic moments |

Simulation state is treated as immutable: functions return a new state rather
than mutating the one they were given. Biological time drives history and
growth; real time drives locomotion and activities. Keep that distinction.

### The interaction path as it stands today

Phase 3 will give a held press meaning; until then this is the whole path, so
know what it does before you change it.

`src/app.js` handles `pointerdown` for the **primary pointer only** — a second
finger on the five-point panel reaches nothing — maps the event through
`aquariumPoint`, and outside the developer hotspot calls `applyTouch`.
`applyTouch` in `src/sim/state.js` classifies what the press landed on,
registers **one stimulus and one impulse**
(`src/sim/interaction-events.js`), assigns every fish a **response role**
(`src/sim/attention.js`), and turns only the fish that are actually going
somewhere. Pointer movement, hold duration and release still have no meaning.

The two event types are the Phase 1 architecture and the distinction is
load-bearing:

- a **stimulus** is something inhabitants can notice — position, intensity, a
  30-cell perception radius, what it landed on, an age and a duration. Fish read
  it; nothing is pushed by it.
- an **impulse** is water actually moving — position, strength, radius, envelope
  and what it touched. Plants bend in it, a substrate impulse shakes bubbles
  loose, the renderer draws its ripple. None of that needs a behaviour.

Both are transient: capped at six each, coalesced when a press repeats within
1.2 cells, dropped the frame they are spent, never serialised, and cleared by an
offline gap. `tests/interaction-events.test.js` guards those rules.

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
npm run measure:screen                    # panel legibility
npm run measure:living                    # long observation summary
npm run capture:behaviors -- --scenario playful-chase --scale 1 --gif
npm run capture:interaction -- --scenario=open-water-tap --scale=1 --gif
npm run capture:interaction -- --scenario=rest-tap --roles     # response roles drawn over the frame
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
