# Phase 7.4 readiness — Plant weave route and geometry redesign

**Branch:** `phase-7-1-readability-baseline`  ·  **Prepared:** `2026-09-13`

Phase 7.4 is the next production slice after the completed playful-chase work. This note is a hand-off, not an implementation report: **plant-weave production behavior has not been changed yet.**

## Why plant weave is next

The Phase 7.1 baseline identified plant weave and playful chase as the two behaviors needing the largest readability rework. Chase is now complete through Phase 7.3, leaving plant weave as the remaining top-priority target.

The desired visual sentence is different from plant inspection or shelter:

> a fish commits to a route through vegetation, crosses from one side of plant structure to the other, continues through another opening or around another stem, and visibly emerges from the route.

It should read as **traversal**, not as hovering near a plant while its target periodically jumps.

## Current production path

The relevant production path is compact:

- `src/sim/fish-activities.js`
  - `secondWeavePlant(...)` chooses a nearby secondary specimen when one is available;
  - `weavePoint(...)` constructs a deterministic five-waypoint route;
  - `resolveActivityTarget(...)` turns the selected point into normal activity steering and exposes `weaveStage` / `weave-N` phase names.
- `src/sim/choreography-tuning.js`
  - plant-weave speed;
  - `stageSecondsMin` / `stageSecondsMax`;
  - route asymmetry.
- `src/dev/behavior-showcase.js`
  - deterministic `plant-weave` showcase.
- `tools/capture-behavior-showcase.mjs`
  - still/GIF capture already supports `plant-weave`.
- `tests/behavior-readability.test.js`
  - the current plant test compares inspection with weave waypoint geometry.

No new framework is required before Phase 7.4 starts.

## The current defect

`weavePoint(...)` currently advances the route primarily from elapsed time:

```text
stageSeconds = seeded value
stage = floor(activity.ageRealSeconds / stageSeconds) % 5
```

That means the next waypoint can become active because the clock advanced, regardless of whether the fish visibly reached, crossed or cleared the previous waypoint.

The route itself contains useful deterministic geometry: it alternates sides and can involve a second nearby plant. The weak link is **progression**. A fish can spend much of a stage travelling toward a point, then have that point replaced before the body has completed the visual action the waypoint was meant to express.

That creates several likely failure modes:

- target changes before the fish actually crosses the plant;
- partial zig-zags that look indecisive rather than intentional;
- a route whose phase labels advance while the body is still on the previous leg;
- speed/personality differences changing which parts of the nominal route are ever physically completed;
- a fish appearing to orbit one specimen instead of travelling through vegetation.

## The current test is too shallow for the redesign

The existing readability test samples plant-weave targets at two activity ages and verifies that the two target points land on opposite sides of the plant with a vertical difference.

That proves the **authored points** alternate. It does not prove that a fish following production steering:

- reaches those points;
- crosses the relevant plant geometry;
- completes the legs in order;
- avoids target thrashing;
- visibly exits the route.

Phase 7.4 should replace that assumption with a small production-path traversal check. It does not need a giant new test harness.

## Recommended implementation shape

### 1. Keep the route deterministic

The existing pair/plant seeded route idea is useful. Preserve deterministic choice of:

- primary specimen;
- optional secondary specimen;
- starting side;
- vertical offsets / asymmetry.

Do not add runtime randomness.

### 2. Make spatial completion the primary progression signal

A route leg should advance because the fish has completed a spatial action, for example:

- entered an arrival radius around a waypoint;
- crossed a plane or side relative to the plant stem;
- cleared the relevant plant by a small margin;
- completed the intended left/right side change.

Elapsed time may remain as a **bounded safety escape** if a waypoint becomes unreachable after habitat geometry changes. It should not be the normal clock that drives choreography.

### 3. Prefer compact state over clever reconstruction if necessary

If robust spatial progression cannot be derived cleanly from the existing fish position and activity age, a tiny bounded activity-local route stage is acceptable. Do not create a general pathfinding subsystem or a persistent route history.

Any new activity field must have an explicit default/normalization path and should remain a handful of scalars at most.

### 4. Author a route that reads at body scale

The fish body, not the target marker, is the thing that has to weave.

The final geometry should give enough horizontal and vertical clearance that an adult sprite visibly:

- approaches vegetation;
- passes to one side;
- crosses the plant structure / gap;
- changes side at least once more when the local plant layout supports it;
- emerges without immediately reversing back into the same point.

Avoid tiny target offsets that are mathematically different but visually hidden inside the sprite width.

### 5. Keep personality subordinate to the signature

Activity/boldness/plant affinity may alter speed and perhaps route looseness, but every fish performing `plant-weave` must still complete recognizable traversal. A low-activity fish should not lose half of the route because its timer advances at the same rate as a faster fish.

## Phase 7.4 evidence plan

Use the tooling that already exists before inventing anything new.

Minimum evidence:

1. exact-commit `plant-weave` animated showcase capture;
2. semantic stills showing successive route legs / side crossings;
3. the same production path across several deterministic seeds or plant/fish pairs;
4. a compact test that advances the actual simulation and proves route progress is tied to physical traversal rather than only activity age;
5. side-by-side review with `plant-investigate` and `plant-shelter` to make sure Phase 7.4 does not accidentally erase their existing vocabulary.

Only add a dedicated weave observer if the GIF and small production-path test cannot answer the real visual question.

## Scope boundaries

Phase 7.4 owns **route and geometry** for plant weave.

It does not own a broad plant-behavior rewrite.

- `plant-investigate` remains a comparison control in this slice.
- `plant-shelter` remains a comparison control in this slice.
- Phase 7.5 owns the final investigate / weave / shelter vocabulary separation and polish.
- playful chase is frozen after Phase 7.3 unless a concrete regression appears.
- bubble investigation and substrate feeding remain reference-quality frozen behaviors.
- no unrelated social, interaction, renderer or persistence cleanup should ride along with this phase.

## Acceptance gate for Phase 7.4

Phase 7.4 should not be marked complete until:

- the fish body visibly completes a plant route rather than merely receiving alternating targets;
- normal route progression is spatial/completion-driven rather than timer-driven;
- a representative route contains clear left/right or inside/outside crossings at readable body scale;
- progression does not jump ahead because a slower fish missed a timed window;
- the fish visibly emerges from the route;
- deterministic seeds reproduce the same route from the same state;
- plant investigation and shelter have not been unintentionally retuned;
- state and runtime cost remain small and bounded;
- normal repository verification remains green;
- exact-commit visual evidence has been reviewed, not merely generated.

## Ready state

**READY — Phase 7.4 may begin.**

The first implementation pass should focus on `weavePoint(...)` progression and body-scale route geometry, then use the existing showcase GIF to judge the result before expanding tooling or touching the other plant activities.
