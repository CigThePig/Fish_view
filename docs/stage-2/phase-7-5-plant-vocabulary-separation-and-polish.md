# Phase 7.5 — plant vocabulary separation and polish

**Status:** PASS — Phase 7.5 is complete. Phase 7.6 may begin.

**Production implementation:** `447a19db3881943bd2738521810eeca41b5a004b`

**Exact visual-evidence commit:** `f78782891e1bb143d3d9cd4be430d3f3fbf027b4`

**Visual workflow:** run `34787589235`, job `103805779299`, artifact `phase7-5-plant-visual-34787589235` (`10327461450`)

**Pre-commit verification:** run `34787403900`, job `103805264267`

## Result

The three vegetation activities now read as three different sentences rather than variations of “fish near plant”:

- **Plant investigation:** approach one specimen → settle into a small, stable local inspection → deliberately retreat back into open water.
- **Plant weave:** commit to a route through vegetation → cross plant sides at body scale → thread the gap / second plant → visibly emerge. The Phase 7.4 route semantics remain frozen.
- **Plant shelter:** enter cover → become conspicuously quiet inside it → emerge back into open water.

The final comparison capture was reviewed at the exact evidence commit. Investigation remains local and ends with a same-side retreat; weave is visibly the energetic traversal vocabulary; shelter has the quietest middle beat and a readable emergence. The three no longer depend on captions to tell them apart.

## What changed

### Plant investigation

The old version could orbit or hover around changing local targets and had no strong visual full stop. Phase 7.5 gives it one bounded three-stage visit cursor:

1. `approach` must physically reach the plant station.
2. `inspect` keeps one deterministic seeded station, with only a small head/body sweep and hover for life.
3. `retreat` moves a body-scale distance away on the same side of the plant and must be physically reached before completion.

The difficult `phase7-plant-b` fixture exposed one real locomotion defect in that final beat. Generic graceful reversal steering near the substrate could lose its turning arc to body/terrain clearance and travel the wrong way until a wall forced the turn. The fix is deliberately narrow: only a target marked as the final plant-investigation `retreat` commits its motion heading directly to the authored retreat bearing. Existing acceleration and visual turn pose still soften the departure, and no other activity changes steering semantics.

The formerly failing fixture now reaches `inspect` at about 7.4 s, enters `retreat` at about 10.6 s, and physically completes the visit into `open-water-wander` at about 17.1 s instead of reaching the 42 s safety bound.

### Plant shelter

Shelter now owns an equally small but visually different three-stage vocabulary:

1. `enter` physically reaches the cover point.
2. `quiet` uses very low speed and tiny bounded drift rather than looking like another inspection.
3. `emerge` makes a visible same-side departure with a slight rise and must be physically reached before completion.

A completed shelter visit exits to `open-water-rest`, and selection prevents an immediate U-turn back into cover. The difficult `phase7-plant-d` fixture reaches `quiet`, begins `emerge` at about 32.3 s, and physically completes into `open-water-rest` at about 37.9 s.

### Bounded state and ESP32-S3 suitability

Investigation and shelter share only two bounded activity-local scalars: `plantVisitStage` and `plantVisitStageStartedAt`. Route geometry is derived deterministically from the fish, plant, and existing tuning. There is no path history, queue, unbounded collection, new persistent record, or save-schema migration.

Plant weave keeps its separate five-leg Phase 7.4 route cursor and does not acquire the plant-visit semantics.

## Verification

The implementation was built and tested from the production branch before its commit was pushed:

- `git diff --check` passed.
- `npm test`: **504 / 504 passed**, 0 failed.
- `npm run audit:simulation`: **48,000 ticks / 48,000 fish samples**, 0 failures.
- `npm run audit:render`: **540 frames**, 0 differing frames, 0 escaped spans.
- Six deterministic plant-investigation seeds completed `approach → inspect → retreat` through physical progression.
- Six deterministic shelter seeds completed `enter → quiet → emerge` through physical progression.
- Plant-visit phases do not advance from activity age alone.
- Existing Phase 7.4 weave tests remained green, including six deterministic routes that physically cross both plants and emerge.

Timers remain choreography bounds / hold durations, not substitutes for physical arrival or departure.

## Visual evidence

The exact evidence capture contains animated GIFs for `plant-investigate`, `plant-weave`, and `plant-shelter`, plus a shared contact sheet. The reviewed semantic snapshots were:

- investigation: `approach` 0.0 s → `inspect` 6.4 s → quieter `inspect` 7.8 s → `retreat` 9.2 s;
- weave: `weave-1` 0.0 s → `weave-2` 1.8 s → `weave-4` 11.4 s → `weave-5` 17.4 s;
- shelter: `enter` 0.0 s → `quiet` 6.0 s → quieter `quiet` 8.0 s → `emerge` 12.2 s.

The motion signatures are visibly distinct: investigation stays local to one specimen, weave travels through the vegetation field at much higher speed and with side crossings, and shelter deliberately collapses into near-stillness before leaving cover.

## Post-closure diagnostic reconciliation (2026-09-14)

`10ece367c5553eb3ef33532d1c3494f5db421309` added only a temporary
relationship-diagnosis workflow. It did not change the plant implementation or
invalidate the plant visual PASS. Its two-/six-hour missing bold visitor was
an independent Phase 6 eligibility defect: the mature selected fish (seed
1763545983) balances at energy 0.273–0.274 while spending 5,200 of 7,200 seconds
in available school-follow. A redundant 0.3 energy veto excluded all of those
opportunities. Actual activity commitment already protects rest and feeding.

The veto was removed, retaining those activity guards, and the temporary
workflow was deleted. The unchanged two-hour production measurement now records
13 bold visits (5.47% occupancy), 8 cautious (3.20%) and 16 attentive (7.18%).
The normal measurement assertions pass; they were neither bypassed nor relaxed.
A focused regression checks low-energy availability and continued rest/shelter
exclusion. See [relationship evidence](../assets/stage-2/phase-7-6/relationship.json).

## Phase 7.6 handoff

Phase 7.6 may audit the remaining behavior vocabulary. Treat the completed plant trio, playful chase, bubble investigation, substrate feeding, and the other previously frozen behaviors as references unless new visual evidence demonstrates a concrete regression. Do not reopen the plant trio merely to make metrics more different.

**PASS — Phase 7.5 is complete. Phase 7.6 is ready.**
