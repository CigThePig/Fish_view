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
| 6 | Persistent fish–viewer relationship | Not started | — |
| 7A | Flagship chase redesign | Not started | — |
| 7B | Remaining behaviour readability pass | Not started | — |
| 8 | Scene salience and anti-synchronisation | Not started | — |
| 9 | Repetition, habituation and long-watch validation | Not started | — |
| 10 | ESP32-oriented performance and memory budget | Not started | — |
| 11 | Integrated product validation and polish | Not started | — |

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
bubbles are hurried, pushed sideways and broken up and re-form when the water
settles; a shrimp bolts a cell or two and drifts back; a snail pulls its foot in;
tufts and dust are carried, which is the cheapest picture of a current the
aquarium can draw. Three rules make a storm structurally impossible rather than
merely unlikely — one generation deep, its own three slots out of six, raised
once and then left alone.

47 of the 87 runs in the production sweep reproduce field for field against the
first slice; every one of the 40 that differ touches the sand, the surface, or
water that is moving. Mean damage across the sweep moves 0.04 percentage points,
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
