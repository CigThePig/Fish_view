# Phase 7.4 — Plant weave route and geometry redesign

**Branch:** `phase-7-1-readability-baseline`  
**Implementation commit:** `daa29487667261d51acd526f9d13480dccdc3f1d`  
**Status:** implementation integrated; final repository/evidence validation in progress

## Scope

Phase 7.4 changes only the route and geometry signature of `plant-weave`. Plant investigation and plant shelter remain comparison controls for Phase 7.5. Playful chase, bubble investigation, substrate feeding and unrelated interaction/social behavior are outside this slice.

## Production change

Plant weave is no longer a timer animation whose target changes because activity age crossed a stage boundary. It now carries a tiny bounded route cursor (`weaveStage` plus the age at which that leg began) and advances primarily when the fish physically reaches the active waypoint.

The route is deterministic and five legs long: entry at the primary plant, crossing the primary, threading toward/through the secondary plant when one is available, crossing the secondary, and a clear emergence. A deterministic one-plant fallback preserves the same crossing-and-emergence vocabulary if a suitable second specimen is unavailable.

Secondary-plant selection and waypoint clearance are body-aware so target points remain visually distinct outside the fish footprint. The final geometry also keeps route points above the substrate safety clamp; this fixes a candidate failure where a mathematically valid waypoint could become physically unreachable and force an intermediate timeout.

Intermediate legs retain a bounded safety timeout for habitat-change/stuck recovery. Entry and final emergence cannot advance by timeout, so the behavior cannot begin or finish merely because a clock moved forward.

## Developer and tuning surface

The plant-weave scene tuning now exposes leg timeout bounds rather than the retired timer-stage interval. Steering was tuned for the stronger traversal route, and the behavior showcase/capture path exposes the authored weave stage and leg semantics for inspection.

## Regression coverage

`tests/phase7-plant-weave.test.js` drives the production simulation across six deterministic seeds. It checks that changing activity age alone does not advance the route; stages 0 through 4 are visited in order; normal transitions occur after physical waypoint arrival and before their safety timeout; the fish reaches the final emergence before leaving the activity; and plant investigation/shelter remain outside weave-route semantics.

Two older interaction tests were made fixture-robust without changing interaction production code. A passive-response assertion now samples the selected response while that response is actually alive, and the long-hold boundedness assertion samples the settled plateau rather than assuming every deterministic cast has settled by exactly 15 seconds. The interaction implementation itself is unchanged.

## Boundedness / ESP32 suitability

The redesign adds only two bounded activity-local scalars and reconstructs its deterministic route from existing fish/plant state. There is no path history, unbounded collection, particle system, general pathfinder or persistent per-frame route data.

The one-shot integration machinery used while replacing the temporary facade implementation deletes itself from the production branch. Phase 7.5 therefore starts from ordinary production modules and tests rather than Phase 7.4 scaffolding.

## Validation status

The integration finalizer completed `npm test`, the simulation audit and render audit successfully before committing `daa29487667261d51acd526f9d13480dccdc3f1d`.

The remaining closure gate is deliberately separate: run the normal branch verification/evidence workflow against the integrated commit family, inspect exact-commit plant-weave visual evidence, and only then change this report to PASS and advance the Stage 2 board to Phase 7.5.

## Phase 7.5 handoff

Once the visual gate passes, Phase 7.5 should treat this traversal architecture as frozen. Its job is vocabulary separation and polish:

- `plant-investigate`: approach → inspect → retreat;
- `plant-weave`: preserve the spatial traversal and emergence signature established here;
- `plant-shelter`: enter cover → quiet → emerge.

Phase 7.5 should compare those three directly and change weave only if a concrete cross-behavior readability defect is demonstrated.
