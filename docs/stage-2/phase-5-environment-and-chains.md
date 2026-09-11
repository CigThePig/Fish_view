# Phase 5 — environmental interaction and causal chains

**Branch:** `claude/phase-5-completion-lmkfzy` · **Baseline commit:** `41efb11` (the merged water/plant slice) · **Date:** 2026-09-11

Phase 5 has two halves. The first, reported in
[phase 5 — water and plants](phase-5-water-and-plants.md), replaced the bright
placeholder rings with muted water crests and gave rooted plants a proper local
response; it ended **FAIL** for the phase, because sections 11.2–11.7 of the
plan were untouched. This report covers the rest, and it is the half where
interaction stops being something that happens *to the fish*.

A press on the sand now lifts a cloud of silt and the air that was trapped under
it. The cloud settles in a few seconds; the bubbles go on rising for another
quarter of a minute, and that is long enough for a fish to finish answering the
press and go and look at what the press did. A press near the waterline breaks
the surface there and nowhere else. A shrimp sitting in disturbed water bolts
and comes back; a snail pulls its foot in and sits down. Bubbles are hurried,
pushed sideways and broken up by moving water and re-form when it settles. The
tufts and specks of dust that drift through the tank are carried by a drag,
which is the cheapest picture of a current this aquarium can draw. A grazing
fish leans its patch onto a fresh cloud of silt.

None of it is remembered. Every response is a shape over the disturbance's own
envelope, so the animal leaves and comes back without anything recording that it
went, nothing new is serialised, and an offline gap clears the lot.

## Changes made

Production:

- `src/sim/interaction-events.js` gains **the chain**. `chainEnvironmentStimuli`
  derives at most `MAX_ENVIRONMENT_STIMULI` environmental stimuli from the live
  impulses — a `substrate-release` and a `surface-break` — and it is the only
  thing that creates one. `impulsePressureAt` is the companion to
  `impulseFlowAt` for everything that is shaken rather than carried, with a
  `flat` reading for the residents that live on the bottom. `createStimulus`
  gains a `seed`, which is what an environmental event reconstructs its effects
  from. `dominantStimulus` skips environmental events, so the school is never
  drawn to the aquarium's own doing.
- `src/sim/tick.js` runs the chain once a frame, immediately after the events
  age, so a consequence is exactly one frame behind its cause.
- `src/sim/bubbles.js`: the touch burst is derived from the substrate release
  rather than from the impulse, and rises through the shared generator with a
  `topY` of its own — a pocket of gas shaken out of gravel rises a few cells and
  dissolves rather than reaching the air. `disturbedByWater` replaces
  `deflectedByFlow`: horizontal carry (unchanged), a lift from upward flow, a
  per-bubble wobble, and a `disturbance` scalar for dispersal.
- `src/sim/living-world.js`: shrimp escape hop, snail retraction, and tufts
  carried by `impulseFlowAt`. All three read the live impulses and store
  nothing.
- `src/sim/fish-activities.js`: the released burst carries
  `RELEASED_BUBBLE_INTEREST` in bubble selection; `noticedConsequence` gives a
  fish one look around at the end of a response; a grazing fish's patch leans
  onto a fresh cloud; a live surface break opens the surface trip that otherwise
  comes round about once every ninety seconds.
- `src/render/render.js`: `drawSubstrateSilt` and `drawSurfaceBreak`, one scene
  object each, drawn with the same grains and colours the feeding puff already
  uses and as marks on the swell rather than as a change to it.
- `src/render/living-world.js`: the dust is carried too, and a startled resident
  is drawn startled — a snail's eye-stalk goes in first and comes out last.
- `src/render/bubbles.js` draws a dispersing bubble smaller, thinner and with a
  fleck broken off it.

Tooling:

- `src/dev/interaction-observation.js` measures the chain: consequences raised,
  the most live at once against the cap, how many fish went to one, and how far
  a resident and a piece of drifting matter were moved. Four scenarios are added
  to the production sweep — `substrate-release`, `waterline-tap`, `sand-drag`,
  `resident-tap`.
- `tools/measure-environment-response.mjs` (`npm run measure:environment`)
  replays six of those scenarios against a naturally stocked, settled tank,
  compares incremental against full rendering pixel for pixel, and writes a
  contact sheet plus a five-times close-up of the cause and its effect.
- `tools/observe-interaction.mjs`: the `--compare` path had two bugs that made
  it useless. It read the baseline's measurements from the top level when a
  written report nests them under `observation`, so every field compared as null
  and every scenario reported as changed; and it compared whole blocks, so a
  later phase adding a measurement marked the entire sweep as different. It now
  reads both sides the same way and compares on the baseline's own fields.
- `npm run measure:water` is exposed for the first slice's tool as well.

## Architecture

One new runtime concept, and it is deliberately the concept the aquarium already
had: **an environmental stimulus**. A `substrate-release` or a `surface-break`
is a position, an intensity, a radius, a seed and a life — the same shape a
press has, from a different cause. Inhabitants may notice one or not, and
nothing is pushed by one.

| Cap | Value | Enforced in |
| --- | --- | --- |
| Environmental stimuli live at once | `MAX_ENVIRONMENT_STIMULI` = 3 | `admitEnvironment` |
| Total stimuli, presses included | `MAX_STIMULI` = 6 | `admit`, `admitEnvironment` |
| Substrate release life | `SUBSTRATE_RELEASE_SECONDS` = 18 s | `ageStimuli` |
| Surface break life | `SURFACE_BREAK_SECONDS` = 6 s | `ageStimuli` |
| Bubbles per release | 3–6, scaled by impulse strength | `substrateReleaseRecords` |
| Silt grains per cloud | 9 | `drawSubstrateSilt` |
| Surface marks per break | 9 | `drawSurfaceBreak` |

Three structural rules, rather than tuned ones, are what make a chain explosion
impossible:

- **One generation.** Only an impulse raises an environmental stimulus, and an
  environmental stimulus raises nothing at all. There is no path by which a
  consequence can have consequences, so the depth of any chain is exactly one.
  The regression asserts it directly: running the chain against the consequences
  alone is a no-op.
- **Its own slots.** Environmental events may occupy at most three of the six
  stimulus slots, and one that cannot find room among its own kind simply does
  not happen. A press can evict a consequence; a consequence can never evict a
  press.
- **Raised once, then left alone.** Identity is the impulse and the place it
  happened, so a finger drumming on one shelf of sand stirs the cloud that is
  already there rather than stacking clouds, and a reused wake slot at the far
  end of the tank raises a new one there rather than teleporting the old one.
  The chain is idempotent: running it twice against the same impulses changes
  nothing.

Everything else the environment does — the bubbles, the shrimp, the snail, the
tufts, the dust — is a pure function of the live impulses and the aquarium's own
clock. No new array, no history, no per-object record, and nothing to reconcile
after a reload.

## Visual result

Tap the sand: a pale cloud lifts off the bottom where the finger was, spreads,
thins and settles back into the floor over about three seconds, and a handful of
small bubbles climbs out of it and keeps climbing after the cloud has gone. Tap
just under the surface: the water there stands up in a broken patch and settles,
while the rest of the waterline goes on exactly as it was. Drag along the
gravel: the cloud follows the finger, the stems lean, a shrimp bolts a couple of
cells and drifts back a second later, and the specks of dust in the water all
lean the same way at once. Tap in open water, away from the sand and the
surface: everything looks exactly as it did before this phase, because nothing
was there to disturb.

- [Close-up, five times panel scale](../assets/stage-2/phase-5-environment/close-up.png)
  — the substrate release, the waterline break and a tap beside a shrimp, at
  0.9 s through 4.0 s.
- [Contact sheet, whole aquarium](../assets/stage-2/phase-5-environment/contact-sheet.png)
  — the same runs at the size the panel actually shows, which is the right scale
  for "and nothing else changed".

The effects are deliberately quieter than a fish. The cloud is the sand's own
colour lifted toward the ripple highlight, the break is the waterline's own ink,
and neither has a glow, a ring or a colour that is not already in the tank.

## Evidence

| Claim | How it was checked | Where the evidence is |
| --- | --- | --- |
| A press on the sand raises a cloud; a press in open water does not | Production `applyTouch` + `tick`, both cases | `tests/environment-chains.test.js` |
| A press near the waterline breaks the surface, locally, without touching the background | Scene object bounds and background signature | `tests/environment-chains.test.js` |
| The burst outlives the water that freed it and finishes its rise | 16 s of production ticks after the impulse is spent | `tests/bubbles.test.js` |
| A fish actually reaches the burst — the dead end repaired | Production selection over four seeds, no posed fish | `measure:environment`; [measurements.json](../assets/stage-2/phase-5-environment/measurements.json) |
| It is not a summons | The same runs: at most three of fifteen fish | same |
| A chain is one generation deep, and idempotent | `chainEnvironmentStimuli` against its own output | `tests/environment-chains.test.js` |
| A consequence never costs the viewer a press | A minute of dragging the sand; caps and the held stimulus | `tests/environment-chains.test.js` |
| Bubbles are carried, hurried and broken up, and recover | Impulse applied and removed, records compared | `tests/environment-chains.test.js` |
| A shrimp bolts and returns; a snail only pulls in | `livingWorldRecords` with and without an impulse | `tests/environment-chains.test.js` |
| Drifting matter shows the current | Tuft displacement and dust object signatures | `tests/environment-chains.test.js` |
| A grazing fish leans its patch onto a fresh cloud | The production target resolver, same pose, with and without | `tests/environment-chains.test.js` |
| A broken surface opens the surface trip, and only for fish that can see it | `activityUtilities` for every fish, plus a fish at the far corner | `tests/environment-chains.test.js` |
| Nothing is written to disk or survives being switched off | Serialise, restore, `advanceOffline` | `tests/environment-chains.test.js` |
| Incremental rendering still equals full rendering | 1 046 native 800 × 480 frames per seed across six scenarios | `measure:environment` |
| A press in open water reads exactly as it did before | The 87-run production sweep against commit `41efb11` | [sweep-comparison.json](../assets/stage-2/phase-5-environment/sweep-comparison.json) |

`npm run verify`: **436 tests passed**, 48 000 simulated ticks with no audit
failures, 200 malformed saves with no failures, 540 native render frames with
zero pixel differences and zero escaped spans, all 32 feeding stages inside the
strike-gap tolerance.

### The chains, measured

`npm run measure:environment --seeds=5,147,1234,83`, four seeds, production
scenarios, nothing posed. Each cell is the four seeds in order.

| Scenario | Consequences raised | Live at once (cap 3) | Fish that went to the burst | Fish that grazed the cloud | Frames the burst was investigable |
| --- | --- | --- | ---: | ---: | ---: |
| Tap on the sand | 1/1/1/1 | 1/1/1/1 | 3/0/2/0 | 0/0/2/0 | 125/124/101/138 of 261 |
| Drag along the sand | 10/10/10/10 | 3/3/3/3 | 3/0/1/2 | 2/2/3/2 | 150/150/150/150 of 241 |
| Tap beside a shrimp | 1/1/1/1 | 1/1/1/1 | 0/0/1/1 | 2/2/2/0 | 110/96/100/127 of 221 |
| Tap at the waterline | 1/1/1/1 | 1/1/1/1 | — | — | — |
| Drag through plants | 0/0/0/0 | 0/0/0/0 | 0 | 0 | 0 |
| Tap in open water | 0/0/0/0 | 0/0/0/0 | 0 | 0 | 0 |

Read it as written: the burst chain fires on three of the four seeds for a tap
on the sand and on three of four for a drag, and never carries more than three
of fifteen fish. The grazing chain fires on every seed for a drag. The surface
trip is the rarest — one fish on one of the four seeds inside the observed
window — and that is an honest limitation rather than a rounding: the fish has
to be exploring, in reach, and choosing a new activity inside the six seconds
the break lasts. The regression proves the option is offered to every fish that
can see a break and to none that cannot; the sweep says how often a fish then
takes it.

The two control scenarios matter as much: a drag through plants and a tap in
open water raise nothing at all. A chain that happened everywhere would be the
storm this phase is careful not to be.

Displacement, against the same aquarium at the same second with the water left
alone (seed 5): shrimp **1.15 cells** on the sand drag and **0.88** on the tap
beside one, tufts **0.32**, bubbles **0.29**. The residents return to where the
aquarium's own clock would have put them; the test asserts that the whole
living-world record set is identical once the water is still.

## Performance

`npm run observe:interaction`, three seeds, 29 scenarios each, against
commit `41efb11`.

| Measure | Before | After |
| --- | --- | --- |
| Mature untouched avg / max damage (seeds 5/147/1234) | 57.5/98.1 %, 51.3/97.9 %, 52.1/95.4 % | identical |
| Mean interaction damage across the 87 sweep runs | 51.57 % | 51.61 % |
| Largest single regression (substrate hold, seed 147) | 52.57 % | 54.48 % |
| Dirty rectangles per frame, across the sweep | 11.45 – 26.05 | 11.16 – 26.08 |
| Full redraws | 0 | 0 |
| Scene objects / glyphs, peak across the 24 measured runs | — | 236 – 265 / 1 094 – 1 215 |

The mean moves four hundredths of a percentage point, and no single run moves by
more than **+1.91** or **-0.75** points. The one regression worth naming is the
top of that range: a finger held against the sand, which now keeps a cloud and a
column of bubbles alive above it — in the one gesture that is asking the sand to
do something. Every gesture that does not touch the bottom or the surface is
unchanged to the digit.

Scene cost is one object and at most nine glyphs per cloud, one object and at
most nine glyphs per break, and three to six single-glyph bubbles per release.
Across all 24 measured runs the silt object never exceeded **61 px** wide and
the surface break **128 px** of an 800 px panel. The background signature — the bands, the floor, the edge
falloff, the whole thing a panel would have to repaint in full — is byte for
byte identical with a live release, a live break and a live impulse in the tank.

**1 106 native frames per seed, zero differing pixels** between incremental and
full rendering across the six measured scenarios, on four seeds — 4 424 frames
in all.

Against the first slice's sweep, **47 of the 87 runs reproduce field for
field**. The 40 that differ fall into three groups and no others: the four
scenarios that press or hold on the sand (the burst now outlives the impulse
that freed it), every drag and swipe (moving water now carries tufts, dust and
bubbles that used to be carried only sideways), and a handful of presses whose
`bubblesDisturbed` count rose because an undirected press now lifts and shakes a
nearby bubble rather than only a directed wake pushing it. Each of those is the
change this phase exists to make.

## Persistence

`PERSISTENCE_VERSION` stays **2**. No field was added, removed or changed. The
environmental stimuli live in `state.stimuli`, which has never been serialised;
the regression asserts that neither `substrate-release` nor `surface-break`
appears anywhere in a save taken with both live, that a restore clears them, and
that an offline gap does too.

Measured saves across the 24 runs are **20 195 – 21 012 bytes**, the same band as
the first slice's 20 425 – 20 471; the spread is the ordinary drift of social
memory across four seeds and observations up to twice as long, not anything this
phase writes.
The staged sizes from `measure:stage2-baseline` — 9 479 bytes at 30 days,
17 185 at a year, 17 862 at three years, 17 872 at ten — are **identical to the
baseline commit's, byte for byte.**

This carries forward the Phase 3 issue already on record: live social memory can
push a running aquarium's save past the nominal 18 KB in `AGENTS.md`. This phase
adds nothing to it and does not claim to have fixed it.

## Remaining limitations

- **The surface trip is the weakest of the four chains.** A break lasts six
  seconds and the fish has to be exploring, in reach and choosing a new activity
  inside it, so it fired for one fish on one of four seeds. It is reachable, and
  the regression proves the option is offered correctly; it is not reliable.
  Phase 8 (scene salience) is where making a rarer event compete properly
  belongs.
- **A bubble disperses; it does not pop.** "Pop/disperse when directly
  disturbed" is met by dispersal. A true pop would need the aquarium to remember
  which bubble burst, and per-object memory is exactly what the boundedness
  invariant forbids. The end of a released bubble's own rise is still drawn with
  the existing pop.
- **The shrimp's escape is not itself a stimulus.** The plan offers it as an
  optional chain ("only if visually useful"); making it one would be a second
  generation, and one generation is the rule that makes a storm structurally
  impossible. It was left out on purpose.
- **This is the browser reference, not the device.** Bounded cost here is a
  compatibility result. Physical frame time, heap, LCD transfer and touch
  latency are Phase 10's.

## Gate decision

| Acceptance-gate item | Result |
| --- | --- |
| Interaction visibly affects more than fish | **Met** — sand, surface, bubbles, shrimp, snail, tufts, dust, and the plants from the first slice |
| Effects remain local and bounded | **Met** — 3 environmental stimuli, silt ≤ 61 px, break ≤ 119 px, no new persistent state |
| Environment settles naturally | **Met** — every consequence expires on its own clock, and the living-world records return identical once the water is still |
| At least several production-reachable causal chains exist | **Met** — the released burst investigated, the cloud grazed, the surface trip opened, the drifting tuft carried into the existing inspection path; three of the four fire in the unforced sweep |
| Chains do not create recursive event storms | **Met** — one generation, structurally; the chain is idempotent and a consequence can never raise another |
| Transient global repaint has not become normal | **Met** — zero full redraws in 87 sweep runs and 24 measured runs; mean damage +0.04 pp; background byte-identical |
| Interaction captures make physical cause and effect obvious without UI | **Met** — see the close-up sheet; the sand lifts where the finger was and settles back into the floor |

**PASS — phase complete; proceed to Phase 6.**
