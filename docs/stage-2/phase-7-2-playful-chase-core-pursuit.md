# Phase 7.2 — Playful chase core pursuit choreography

**Branch:** `phase-7-1-readability-baseline`  ·  **Phase 7.2 implementation/evidence commit:** `bf9375485506dea1bb4115dc3690610bb0b0c970`  ·  **Date:** `2026-09-13`

Phase 7.2 changes only the **core pursuit read** of playful chase. It does not try to finish the whole social arc. Phase 7.3 still owns the complete beginning, escalation, climax / near miss, break-off, separation and recovery.

The problem at the Phase 7.1 baseline was not that chase was too slow. The pair could move quickly and still read as a fast follow: the chaser sat on a broadly similar line, the evader barely changed direction, and the viewer had too little evidence that one fish was actively trying to catch another.

The Phase 7.2 goal is therefore a different motion sentence:

> One fish commits to the pursuit; the other notices it late, bolts and sidesteps; the chaser answers with sharper cuts and vertical correction; the pair visibly stop behaving like a formation.

## Changes made

### Production choreography

`src/sim/fish-choreography.js` now gives the chased fish a stronger derived evasion response without creating a new saved activity or persistent evade state.

- Evasion still comes from the live chaser/target relationship and disappears automatically when that relationship is gone.
- The escape direction now contains a deterministic perpendicular sidestep instead of being almost entirely straight away from the chaser.
- The evader receives a short dodge burst on top of the existing proximity response.
- Evasion acceleration and turning response increase with the strength of the threat, so the fish visibly answers the chase instead of gradually drifting away.
- The chaser receives a pursuit-only vertical correction gain. Approach and break motion do not inherit it.

`src/sim/choreography-tuning.js` keeps those choices authored rather than hiding them as magic numbers. Chase steering is quicker and more agile, while the scene profile now exposes explicit evasion side-strength and dodge-burst tuning.

The existing chase phases remain `approach → pursuit → break`. Phase 7.2 does not add a new activity state machine.

### Developer tuning surface

`src/dev/choreography-fields.js` exposes the new chase-specific controls in the behavior lab:

- `evasionSideRows` — lateral escape strength;
- `evasionBurstGain` — short speed added during the dodge pulse;
- `pursuitVerticalGain` — pursuit-only vertical correction multiplier.

The lab therefore edits the same authored values the simulation actually reads.

### Tests

`tests/choreography-tuning.test.js` was updated so the tuning invariant checks the **actual per-profile editor surface**, including activity-specific steering fields, rather than assuming every steering field has to live in the global common-slider list. The phase-profile inheritance test now compares against the authored chase profile instead of pinning the historical pre-7.2 value.

## Scope discipline

The Phase 7.1 freeze rules were preserved.

- `individual-follow` remains the nearest comparison control and was not retuned.
- bubble investigation and substrate feeding were not touched;
- cruise, open-water wander, school follow, companion cruise and rest were not used as collateral cleanup;
- persistence and interaction systems were not changed.

The implementation diff from the Phase 7 tooling-ready head (`987ec0a4d29ca6e2995a9f323d431470d82ba9bb`) to the tested Phase 7.2 head contains only:

- `src/sim/choreography-tuning.js`
- `src/sim/fish-choreography.js`
- `src/dev/choreography-fields.js`
- `tests/choreography-tuning.test.js`

## Visual result

The branch capture now shows a clearer role split than the Phase 7.1 baseline. The evader makes visible lateral corrections and the chaser has to cut after it instead of the pair holding the same broad line. The difference from `individual-follow` is carried by relationship motion, not by labels or a giant speed increase.

The exact tested implementation can be inspected interactively without using the `main` GitHub Pages deployment:

`https://raw.githack.com/CigThePig/Fish_view/bf9375485506dea1bb4115dc3690610bb0b0c970/behaviors.html?activity=playful-chase`

The Phase 7 evidence job for that same commit generated:

- animated `playful-chase` capture;
- animated `individual-follow` comparison capture;
- a combined behavior contact sheet;
- six deterministic chase telemetry timelines;
- chase-readiness JSON;
- blind Phase 7 baseline sheet;
- branch-accurate static site;
- exact-commit preview link.

Those outputs are reproducible with the repository tooling rather than depending on the live `main` Pages site.

## Quantitative pursuit evidence

The six-seed chase observer was run before and after the Phase 7.2 implementation. Values below are medians across the same deterministic matrix.

| Measure | Phase 7.1 baseline | Phase 7.2 | Read |
| --- | ---: | ---: | --- |
| Minimum pair gap | 2.249 rows | 2.181 rows | chaser closes slightly harder |
| Pair gap range | 2.951 rows | 3.019 rows | more distance change across the run |
| Peak chaser speed | 1.0398 rows/s | 1.0998 rows/s | modestly stronger pursuit, not a wholesale speed rewrite |
| Peak evader speed | 0.7091 rows/s | 0.7966 rows/s | clearer bolt response |
| Peak chaser turn rate | 47.78°/s | 51.69°/s | somewhat sharper pursuit correction |
| Peak evader turn rate | 2.96°/s | 5.43°/s | nearly doubled visible escape steering |
| Peak heading separation | 22.80° | 24.61° | pair spends more time on visibly different lines |
| Peak vertical separation | 0.198 rows | 0.259 rows | stronger non-parallel pursuit geometry |
| Strongest evasion | 0.572 | 0.623 | stronger late recognition / escape response |
| Gap growth after break | 0.648 rows | 0.755 rows | the pair separates more clearly once pursuit stops |
| Break time | 6.3 s | 6.3 s | phase timing intentionally unchanged |

Two observer values deliberately remain unresolved here:

- **gap oscillations remain 1** in all six deterministic runs;
- **overshoot frames remain 0**.

Those are not hidden successes. They are the reason Phase 7.3 still exists. A convincing near catch, miss/overshoot, climax and recovery need to be authored as a complete chase arc instead of being bolted onto the middle of pursuit as another periodic wiggle.

## Verification

GitHub Actions run `34760751279` tested the exact Phase 7.2 implementation commit `bf9375485506dea1bb4115dc3690610bb0b0c970`.

Both jobs completed successfully.

### Normal repository verification

- `npm test` — PASS
- `npm run audit:simulation` — PASS
- `npm run audit:persistence -- --cases=200` — PASS
- `npm run audit:render` — PASS
- `npm run measure:feeding` — PASS
- `npm run measure:relationship` — PASS
- relationship capture — PASS
- verification artifact upload — PASS

### Phase 7 branch evidence

- chase telemetry — PASS
- chase + individual-follow animated capture — PASS
- blind Phase 7 baseline capture — PASS
- branch-accurate static-site build — PASS
- exact-commit preview generation — PASS
- Phase 7 evidence artifact upload — PASS

Workflow run:

`https://github.com/CigThePig/Fish_view/actions/runs/34760751279`

## Performance and persistence

No new persistent field, save migration, particle system, collection, history buffer or event queue was added. Evasion remains a derived steering influence computed from the already-existing chase relationship.

The repository simulation, persistence and render audits all passed on the Phase 7.2 implementation. This phase therefore adds choreography math, not a new runtime subsystem.

## Remaining limitations and Phase 7.3 hand-off

Phase 7.2 intentionally stops once the **middle of the chase** is readable.

Phase 7.3 owns the dramatic grammar that is still missing:

1. a readable initiation / provocation rather than suddenly being in pursuit;
2. escalation rather than one continuous pursuit intensity;
3. a deterministic near catch or miss/overshoot that creates a visible climax;
4. a decisive break-off rather than merely reaching the time threshold;
5. separation and recovery that make it obvious the game is over;
6. stronger gap compression/release across the complete arc instead of forcing extra oscillation into the core pursuit loop.

That separation is deliberate. The Phase 7.2 pursuit is now strong enough to serve as the middle act; Phase 7.3 can build an arc around it instead of continuing to tune a fast follow.

## Gate decision

Phase 7.2 acceptance for the sequential Phase 7 plan:

- **Pursuer and evader are visually distinct roles:** PASS — evasion now contains a deterministic lateral escape and burst while the chaser receives pursuit-specific response.
- **The evader visibly reacts instead of simply cruising faster:** PASS — median peak evader turn rate rose from 2.96°/s to 5.43°/s and peak speed from 0.709 to 0.797 rows/s.
- **The chaser visibly has to correct after the evader:** PASS — pursuit steering/vertical response is sharper and branch captures show the pair leaving parallel formation.
- **Chase is more distinct from individual follow without retuning individual follow:** PASS.
- **Changes are confined to chase choreography/tuning and its developer surface/tests:** PASS.
- **Normal repository verification remains green:** PASS.
- **Branch-specific visual and telemetry evidence is reproducible from the exact commit:** PASS.
- **Complete chase climax, overshoot and ending:** NOT REQUIRED FOR 7.2 — explicitly owned by Phase 7.3 and still absent in the telemetry.

**PASS — Phase 7.2 is complete. Phase 7.3 may begin with the existing pursuit as its stable middle act.**
