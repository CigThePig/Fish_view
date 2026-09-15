# Stage 2 — interaction, relationship and readability

The specification is
[Fish-View-Stage-2-Interaction-Readability-Development-Plan.md](../../Fish-View-Stage-2-Interaction-Readability-Development-Plan.md)
at the repository root. This directory is the working record: which phase the
product is in, what each completed phase concluded, and where its evidence went.

Stage 2 is roughly half of the intended product development. It is not a
collection of touch effects. It has two halves that depend on each other:

- an **interaction layer** that makes the aquarium notice the person outside
  the glass and remember them across months, and
- a **readability pass** that makes autonomous behaviour understandable by
  watching, without any text or UI.

## Phase board

Phases run in order. A phase is not started before the previous one's gate is
met and its report is written. Every report ends with an explicit PASS or FAIL;
a passing test suite is not by itself a PASS for a visual or behavioural phase.

| # | Phase | State | Report |
| --- | --- | --- | --- |
| — | Repository preparation | Done | [baseline](baseline-2026-09-09.md) |
| 0 | Interaction observation and baseline instrumentation | Done | [phase 0](phase-0-interaction-observation.md) |
| 1 | Stimulus and impulse architecture | Done | [phase 1](phase-1-stimulus-impulse.md) |
| 2 | Attention, response roles, contextual tap | Done | [phase 2](phase-2-attention-and-roles.md) |
| 3 | Hold and persistent presence | Done | [phase 3](phase-3-hold-presence.md) |
| 4 | Drag, swipe and local water impulse | Done | [phase 4](phase-4-drag-swipe.md) |
| 5 | Environmental interaction and causal chains | Done | [phase 5](phase-5-environment-and-chains.md) · [first slice](phase-5-water-and-plants.md) |
| 6 | Persistent fish–viewer relationship | Done | [phase 6](phase-6-viewer-relationship-evidence.md) |
| 7.1 | Readability baseline and behavior freeze | Done | [phase 7.1](phase-7-1-readability-baseline.md) |
| 7.2 | Playful chase — core pursuit choreography | Done | [phase 7.2](phase-7-2-playful-chase-core-pursuit.md) |
| 7.3 | Playful chase — complete arc and ending | Done | [phase 7.3](phase-7-3-playful-chase-complete-arc.md) |
| 7.4 | Plant weave — route and geometry redesign | Done | [phase 7.4](phase-7-4-plant-weave-route-and-geometry.md) |
| 7.5 | Plant vocabulary separation and polish | Done | [phase 7.5](phase-7-5-plant-vocabulary-separation-and-polish.md) |
| 7.6 | Remaining behavior readability audit | Done | [phase 7.6](phase-7-6-remaining-behavior-readability.md) |
| 7.7 | Cross-behavior readability validation and freeze | Done | [phase 7.7](phase-7-7-cross-behavior-readability-validation.md) |
| 8 | Scene salience and anti-synchronisation | Ready | [Phase 8 handoff](phase-7-7-cross-behavior-readability-validation.md#phase-8-handoff) |
| 9 | Repetition, habituation and long-watch validation | Not started | — |
| 10 | ESP32-oriented performance and memory budget | Not started | — |
| 11 | Integrated product validation and polish | Not started | — |

The root specification still describes Phase 7 as flagship chase work followed
by the remaining behavior vocabulary. The numbered 7.1–7.7 rows above are the
smaller reviewable execution slices used to carry that specification out without
mixing several visual problems into one change.

Phase 7.1 freezes the starting line before choreography changes begin. Bubble
investigation and substrate feeding are explicit reference-quality behaviors;
cruise, open-water wander, school follow, individual follow and open-water rest
are provisionally frozen unless side-by-side evidence shows a real problem.
Playful chase and plant weave are the only top-priority rework targets. Every
required behavior now has a machine-readable visual sentence, at least three
visible cues, nearest visual neighbors, a change policy and a later owning
slice. A blind contact-sheet generator hides behavior names and phase labels so
the motion has to communicate its own meaning. See the
[Phase 7.1 report](phase-7-1-readability-baseline.md).

Before Phase 7.2 changes chase motion, use the
[Phase 7 visual tooling readiness guide](phase-7-tooling-readiness.md). The live
GitHub Pages deployment is `main` and is therefore not valid evidence for a
working branch. Phase branches now have exact-commit interactive preview links,
branch CI artifacts containing the built static site and captures, and a
reusable chase observer that records pair-distance, speed, turn-rate, evasion,
break and personality/body-size evidence without grading today's choreography.

Phase 7.2 turns playful chase from a fast follow into a visibly asymmetric
pursuit without retuning `individual-follow`. The evader now makes a
deterministic lateral dodge and burst, while the chaser receives sharper
pursuit steering and vertical correction. Six-seed telemetry and branch renders
show stronger evader turning, more pair-line separation and clearer post-chase
gap growth; full repository verification remained green. Gap oscillation and a
true near-miss / overshoot climax are intentionally still absent, because those
belong to the complete chase arc in Phase 7.3. See the
[Phase 7.2 report](phase-7-2-playful-chase-core-pursuit.md).

Phase 7.3 gives that pursuit a complete motion sentence: engage, first escape,
renewed pursuit, interception / near miss, decisive break and recovery. Across
all six deterministic chase seeds the pair-distance direction changes three
times, including two changes before the break, so the chase now visibly closes,
releases and closes again instead of behaving like a fast formation. Closure
also fixed a stale Phase 7.2-era readability assertion and made the capture tool
report semantic chase phases rather than the broad steering envelope used under
the hood. Normal repository verification and the exact-commit Phase 7 evidence
job are green. See the [Phase 7.3 report](phase-7-3-playful-chase-complete-arc.md).

Phase 7.4 turns plant weave into an actual route through vegetation. Five
deterministic body-aware legs now advance from physical waypoint completion
instead of a stage clock: entry, primary crossing, threading toward/through a
second plant when available, another crossing, and a physically reached
emergence. Intermediate timeouts exist only as bounded stuck recovery. A six-seed
production-path regression proves the route is spatial, while a dedicated GIF
comparison shows weave continuously traversing vegetation beside the much more
local plant-investigation and quiet plant-shelter controls. Full verification,
persistence and renderer audits remain green. See the
[Phase 7.4 report](phase-7-4-plant-weave-route-and-geometry.md).

Phase 7.5 separates the full plant vocabulary around that frozen traversal
control. Plant investigation now reads approach → stable local inspect →
same-side retreat, while shelter reads enter cover → quiet → emerge. Both use a
bounded three-stage activity-local cursor and require physical arrival/departure
rather than letting elapsed time stand in for motion. Six deterministic seeds
for each behavior complete the authored arc, the difficult regression fixtures
now finish naturally, and the exact visual comparison keeps weave energetic and
spatial while investigation stays local and shelter becomes nearly still. See
the [Phase 7.5 report](phase-7-5-plant-vocabulary-separation-and-polish.md).

Phase 7.6 audits the remaining vocabulary and fixes two demonstrated weaknesses.
Companions now travel together and separate gently, and surface visits physically
ascend, probe and descend toward reachable local targets. The temporary post-7.5
relationship diagnostic is reconciled and removed; available low-energy fish can
volunteer while actual rest and feeding remain protected. Other individual
choreography stays frozen. Unsolicited glass-to-person attribution is explicitly
deferred to Phase 8 scene salience and context. See the
[Phase 7.6 PASS report](phase-7-6-remaining-behavior-readability.md).

Phase 7.7 validates the vocabulary as one system and freezes it. A fifteen-pair
confusion matrix covers every final entry, a shuffled captionless capture keeps
labels out of the judgement, and 96 showcase observations span six identities,
five body profiles and all five seeded traits without a teleport-like seam or
full redraw. Natural production observation reaches every recurring category.
The one accepted limitation is familiar-glass person-attribution in a busy scene;
its motion is frozen and Phase 8 owns the missing context. See the
[Phase 7.7 PASS report](phase-7-7-cross-behavior-readability-validation.md) and
[final vocabulary](phase-7-final-behavior-vocabulary.md). Phase 7 is complete;
Phase 8 is Ready.

Phase 6 gives each persistent fish one compact, bounded familiarity with the
viewer while keeping seeded personality and short-term saturation separate.
Meaningful interaction builds that familiarity over weeks and months; rapid
repetition has sharply diminishing returns; familiar fish can respond sooner,
stay interested longer, and occasionally initiate a quiet visit to the glass.
The final evidence includes controlled personality comparisons, a genuine
production growth path, continuously matured viewer-free visit measurements,
and renderer captures. See the [phase report](phase-6-viewer-relationship-evidence.md).

Phase 5 made the aquarium itself answer. It ran in two slices. The first
replaced the bright placeholder rings with subdued water crests and gave rooted
stems a proper local bend, recoil and settle; it closed nothing but the
appearance, and said so.

The second is the rest of it. A disturbance now **leaves something behind**, and
what it leaves is a stimulus of the same kind a press is: a cloud of silt and
the air trapped under it where the sand was pressed, a patch of surface still
breaking where something went in. Those are what a chain is made of — a press on
the gravel raises a burst that is still rising half a minute later, and a fish
that has finished answering the press goes to look at it. Before this the burst
existed only while the water moved, so it could be *marked* investigable and
never be investigated; that dead end is what section 11.2 of the plan names, and
it is repaired.

Everything else the environment does reads the live impulses and stores nothing:
bubbles are pushed sideways and broken up and re-form when the water settles,
and are never pushed under; a shrimp bolts a cell or two and drifts back; a
snail pulls its foot in; tufts and dust are carried sideways, which is the
cheapest picture of a current the aquarium can draw. Three rules make a storm
structurally impossible rather than merely unlikely — one generation deep, its
own three slots out of six, raised once and then left alone.

47 of the 87 runs in the production sweep reproduce field for field against the
first slice; every one of the 40 that differ touches the sand, the surface, or
water that is moving. Mean damage across the sweep moves 0.02 percentage points,
there are no full redraws, and the save schema is untouched. See the
[phase report](phase-5-environment-and-chains.md).

Phase 4 gave the **motion in a gesture** meaning, and gave it by moving points
rather than by moving fish. A finger drawn slowly is a point of interest that is
going somewhere: fish cut the corner in front of it, follow the water it went
through, or stop at a piece of its trail while it moves on without them. A
finger thrown across the glass is water being pushed: stems lean downstream,
bubbles are carried sideways, the shoal is swept along, and the timid half of
the cast leans out of the way while the bold half comes to look. The whole
record of a gesture is six path samples and three live wakes, whether it lasts a
third of a second or a minute; no gesture forces a full redraw; and 56 of the
sweep's 66 scenarios reproduce field for field against Phase 3, nine of the ten
that differ being the three gestures that have motion in them.

Phase 3 made a press that stays a **presence**. A finger held against the glass
past 0.45 s stops being a tap and becomes a held stimulus that is re-read every
0.6 s, so fish cross the tank to it, arrive, hover, lose interest one at a time
on their own patience, and peel away when it goes. All seven stages of the
plan's arc occur; a fish stayed engaged for 59.6 s of a 60 s hold; and the
sixty-second hold reads the same as the twenty-four-second one, which is the
boundedness claim measured rather than asserted. The tap is unchanged — 42 of
48 Phase 2 scenarios reproduce byte for byte.

Phase 2 ended the global response: a press now hands each fish a deterministic
response role (`src/sim/attention.js`), and one tap leaves seven to ten
activities standing where it used to leave one.

Phase 1 replaced the single global `state.reaction` with bounded transient
`stimuli` and `impulses` (`src/sim/interaction-events.js`) and routed the
existing tap through them without changing what a viewer sees. Compare any later
run against an earlier phase's evidence with
`npm run observe:interaction -- --compare=<evidence.json>`.

Phase 0 changed developer tooling only, and it is what made that claim
checkable: the instrument is `src/dev/interaction-observation.js`, driven by
`npm run observe:interaction` and `npm run capture:interaction`, and Phase 1's
evidence is 42 of 42 of its scenarios reading identically across the rewrite.

## Evidence

Measurements and captures are how a phase is judged, so they need to survive
the session that produced them.

- Transient output goes to `.audit-output/` and `.behavior-captures/`. Both are
  git-ignored and are not evidence.
- Evidence worth keeping goes to `docs/assets/stage-2/<phase>/` and is linked
  from the phase report that produced it. Prefer compact artefacts: JSON
  summaries, contact sheets, one short capture per claim. Do not commit large
  video for a point a still frame makes.
- A report claiming a visible change carries something to look at. A report
  claiming a bounded cost carries the numbers, next to the
  [baseline](baseline-2026-09-09.md) they are compared against.

## Writing a phase report

Copy [`phase-report-template.md`](phase-report-template.md) to
`phase-<n>-<slug>.md` in this directory, fill it in, link it from the board
above, and set the phase state.
