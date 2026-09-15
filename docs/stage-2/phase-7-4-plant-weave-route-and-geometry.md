# Phase 7.4 — Plant weave route and geometry redesign

**Branch:** `phase-7-1-readability-baseline`  
**Implementation commit:** `daa29487667261d51acd526f9d13480dccdc3f1d`  
**Closure validation commit family:** `ce72a55b244a33f4b68f28ea3d94a73277c3de38` / `4c0cdc2b2230d00cb128a6676048314046b43040`  
**Status:** **PASS — Phase 7.4 is complete. Phase 7.5 may begin.**

## Scope

Phase 7.4 changes only the route and geometry signature of `plant-weave`. Plant investigation and plant shelter remain comparison controls for Phase 7.5. Playful chase, bubble investigation, substrate feeding and unrelated interaction/social behavior are outside this slice.

## Production change

Plant weave is no longer a timer animation whose target changes because activity age crossed a stage boundary. It now carries a tiny bounded route cursor (`weaveStage` plus the age at which that leg began) and advances primarily when the fish physically reaches the active waypoint.

The route is deterministic and five legs long: entry at the primary plant, crossing the primary, threading toward/through the secondary plant when one is available, crossing the secondary, and a clear emergence. A deterministic one-plant fallback preserves the same crossing-and-emergence vocabulary if a suitable second specimen is unavailable.

Secondary-plant selection and waypoint clearance are body-aware so target points remain visually distinct outside the fish footprint. The final geometry also keeps route points above the substrate safety clamp; this fixes a candidate failure where a mathematically valid waypoint could become physically unreachable and force an intermediate timeout.

Intermediate legs retain a bounded safety timeout for habitat-change/stuck recovery. Entry and final emergence cannot advance by timeout, so the behavior cannot begin or finish merely because a clock moved forward.

## Developer and tuning surface

The plant-weave scene tuning now exposes leg timeout bounds rather than the retired timer-stage interval. Steering was tuned for the stronger traversal route, and the behavior showcase/capture path exposes authored weave stages and leg semantics for inspection.

The semantic capture tool now chooses plant-weave stills from actual `weave-N` phases rather than arbitrary fractions of the loop, so the evidence naturally shows entry, crossings and emergence.

## Regression coverage

`tests/phase7-plant-weave.test.js` drives the production simulation across six deterministic seeds. It checks that:

- changing activity age alone does not advance the route;
- stages 0 through 4 are visited in order;
- normal transitions occur after physical waypoint arrival and before their safety timeout;
- the fish reaches the final emergence before leaving the activity;
- body-scale route geometry crosses plant sides rather than hiding target changes inside the sprite footprint; and
- plant investigation and shelter remain outside weave-route semantics.

Two older interaction tests were made fixture-robust without changing interaction production code. A passive-response assertion now samples the selected response while that response is actually alive, and the long-hold boundedness assertion samples the settled plateau rather than assuming every deterministic cast has settled by exactly 15 seconds. The interaction implementation itself is unchanged.

## Visual evidence

A dedicated exact-branch capture was generated in GitHub Actions run `34780728153`, artifact `phase7-4-plant-visual-34780728153` (`10325236768`). It contains animated GIFs for `plant-weave`, `plant-investigate` and `plant-shelter` plus one comparison contact sheet.

The plant-weave capture is a 26-second production-path loop. Its semantic stills occur at:

| Time | Phase | Speed | Visible beat |
| ---: | --- | ---: | --- |
| 0.0 s | `weave-1` | 0.24 | committed entry toward the plant route |
| 1.8 s | `weave-2` | 0.78 | first crossing with a strong turn/pitch change |
| 11.4 s | `weave-4` | 0.71 | later crossing on the other side of the vegetation |
| 17.4 s | `weave-5` | 0.70 | clear outward emergence |

Reviewing the GIF rather than only the stills shows continuous travel between those beats. The body crosses from one side of plant structure to the other, threads through the vegetation, changes side again, and exits instead of hovering until a target jumps. There is no visible teleport or clock-driven snap between legs.

The comparison capture also gives Phase 7.5 a clean starting contrast. `plant-investigate` approaches and then remains local to one feature at inspection speed, while `plant-shelter` settles into cover and slows almost to stillness. Weave is already the visibly mobile traversal member of the trio; Phase 7.5 should preserve that distinction.

## Verification

The one-shot integration finalizer completed `npm test`, the simulation audit and render audit before committing the monolithic production implementation.

Normal branch verification then ran on `ce72a55b244a33f4b68f28ea3d94a73277c3de38` in GitHub Actions run `34780535408`. Both jobs passed:

- `verify`: full test suite, simulation audit, 200-case persistence audit, render audit, feeding measurement, relationship measurement/capture, artifact upload;
- `phase7-evidence`: chase telemetry, chase/control capture, blind Phase 7 baseline, branch static-site build, exact-commit preview and evidence artifact.

The dedicated plant visual workflow also passed in run `34780728153`. The temporary workflow used to obtain that artifact is removed as part of Phase 7.4 closure; it is evidence plumbing, not product architecture.

## Boundedness / ESP32 suitability

The redesign adds only two bounded activity-local scalars and reconstructs its deterministic route from existing fish/plant state. There is no path history, unbounded collection, particle system, general pathfinder or persistent per-frame route data.

Temporary facade modules, patch/finalizer scripts and one-shot validation workflows do not survive the completed phase. Phase 7.5 starts from ordinary production modules and tests.

## Freeze / ownership after Phase 7.4

The following plant-weave properties are now the stable signature for later review:

- spatial rather than timer-owned route progression;
- body-aware plant clearance;
- deterministic ordered crossings;
- continuous forward traversal through vegetation;
- a physically reached final emergence;
- bounded middle-leg recovery only as a safety escape.

Phase 7.5 should not reopen those mechanics merely to make the three plant behaviors different. Change weave again only if direct side-by-side evidence exposes a concrete readability defect.

## Phase 7.5 handoff

Phase 7.5 owns plant-behavior vocabulary separation and polish:

- `plant-investigate`: make the whole sentence read **approach → inspect → retreat**;
- `plant-weave`: preserve the Phase 7.4 **traversal → crossings → emergence** sentence;
- `plant-shelter`: make the whole sentence read **enter cover → become quiet → emerge**.

The first Phase 7.5 pass should use the three-behavior comparison capture as its baseline and concentrate changes on investigation and shelter unless evidence shows that weave itself is blurring the distinction.

## Gate

**PASS — Phase 7.4 is complete. Phase 7.5 may begin with spatial plant weave frozen as the traversal control.**
