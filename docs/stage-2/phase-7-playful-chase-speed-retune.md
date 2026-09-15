# Phase 7 follow-up: playful chase speed retune

**Branch:** `tune-playful-chase-speed`  
**Base:** `3973b2fa268d0215b01ff6f0e2d774ded99ba36f`  
**Date:** 2026-09-15

This is a narrow, explicit follow-up to the Phase 7 speed-readability reopen. Direct viewing after the first correction showed that playful chase still topped out around 1.5 rows/s in production, leaving too little kinetic contrast between ordinary swimming and the aquarium's most energetic social behavior.

## Final retune

The behavior remains the same Phase 7 sentence: recognition/approach, an evader-first escape, renewed pursuit, an intercept/near miss, a decisive break and recovery. The speed envelope was deliberately widened:

- opening evader escape: absolute ceiling **4.0 rows/s**;
- recurring pursuit evasion: ceiling **3.0 rows/s**;
- final evader juke: ceiling **2.3 rows/s**;
- chaser ordinary pursuit profile: ceiling **2.7 rows/s**;
- chaser intercept surge: ceiling **3.0 rows/s**.

The 4.0 value is a brief burst ceiling, not sustained travel speed. The opening evader gets the explosive first beat, the chaser answers later at a lower ceiling, the final juke trades speed for direction, and the ending returns to a calm glide.

The faster envelope exposed supporting problems that could not safely be left unchanged. The final implementation therefore also makes narrow chase-specific controller and geometry corrections:

- pursuit lead/standoff and closing control preserve a readable near miss instead of allowing the higher-speed chaser to pass through the evader;
- boundary-aware braking prevents the new ceiling from becoming a one-frame velocity reversal at aquarium limits;
- the semantic chase arc is monotonic once the opening escape has begun, so a successfully widening gap cannot rewind `escape → engage → escape`;
- a currently active chase outranks another chaser's older break/release coast when both target the same evader;
- the ending release ramp reads the post-tick activity age and decelerates from intercept speed instead of snapping directly to the break cap;
- the release ramp terminates at the resolved behavior-lab profile value, so tuning the break ceiling below the production default remains truthful;
- opening escape gets enough immediate steering authority for the short burst window to be physically realized rather than merely requested.

These are supporting corrections to the existing chase sentence, not new behavior vocabulary. Activity selection, persistence schema, renderer, particle system and long-horizon state remain unchanged.

## Direct speed evidence

The final seed-2020 production steering regression measures the semantic opening-escape window directly instead of assuming the longest evasion run is the opening. On the successful final verification run before documentation cleanup it recorded:

- continuous evasion readability run: **29 frames / 2.9 s**;
- continuous-run average visible speed: **31.26 px/s** on the native 800 × 480 panel;
- equivalent average at 390 px display width: **15.24 px/s**;
- continuous-run median visible speed: **33.90 px/s**;
- continuous-run peak visible speed: **51.40 px/s**;
- continuous-run average logical speed: **1.360 rows/s**;
- semantic opening escape: **6 frames / 0.6 s**;
- opening escape peak: **3.654 rows/s**;
- opening frames at or above 2.5 rows/s: **6 / 6**;
- exposed opening ceiling: **4.00 rows/s**;
- intercept chaser average: **2.877 rows/s**;
- intercept chaser peak: **2.999 rows/s**.

This demonstrates the intended shape rather than merely a permissive constant: the evader reaches a materially faster burst for several consecutive frames while remaining below the 4.0 ceiling, and the chaser exercises its own high-speed intercept without exceeding 3.0.

## Six-seed chase telemetry

`npm run measure:chase-readiness` exercised the forced production chase across the deterministic six-seed matrix. Every case reached the authored break at **6.2 s**, and all six finished with **zero pursuit overshoot frames** after the spacing/controller corrections.

| Case | Chaser / evader peak speed (rows/s) | Peak turn rate, chaser / evader | Overshoot frames |
| --- | ---: | ---: | ---: |
| phase7-chase-a | 2.95 / 3.81 | 255°/s / 194°/s | 0 |
| phase7-chase-b | 2.92 / 3.78 | 257°/s / 354°/s | 0 |
| phase7-chase-c | 3.00 / 3.83 | 646°/s / 445°/s | 0 |
| phase7-chase-d | 2.82 / 3.77 | 313°/s / 495°/s | 0 |
| phase7-chase-e | 2.90 / 3.78 | 257°/s / 407°/s | 0 |
| phase7-chase-f | 2.90 / 3.84 | 257°/s / 498°/s | 0 |

The matrix also preserves substantial gap oscillation rather than collapsing into a fixed formation. Recorded gap ranges were **24.02–34.09 rows**. The large peak turn rates are intentionally recorded rather than hidden: the highest measured values are still sharp and remain a useful future visual-watch item, but the one-frame boundary reversals that triggered review were removed and the final matrix records no body-passing overshoot.

## Natural production-path evidence

The frozen-vocabulary production observer ran for **1,800 real seconds** without assigning activities or roles. It found **64 naturally selected playful-chase episodes** and reported no missing required behavior episodes. A naturally selected chase state was captured at **689.00 s** of elapsed real time and then rendered through the normal capture tooling.

This closes the gap between the hand-posed regression fixture and the actual product path: the behavior is still selected naturally, survives the Phase 7 frozen-vocabulary guard, and can be captured from normal aquarium state.

The successful workflow uploaded the chase evidence bundle containing the production observation/state, six-seed readiness telemetry and natural chase captures. The evidence bundle contained **14 files**; the same workflow also completed the independent relationship-capture artifact.

## Repository verification

The successful verification run at code head `0f5d93b758c2f1c72fff4158bf0e8e83c05355a4` completed the full repository gate:

- **538 / 538** Node tests passed;
- simulation audit passed, final hash **2336491956**;
- persistence audit passed across **200 randomized cases**;
- render audit passed with a measured maximum of **761 glyphs**, **44 objects** and **384,000 px** dirty area;
- feeding measurement: **PASS**;
- relationship measurement: **PASS**;
- readability measurement: **PASS**;
- frozen Phase 7 vocabulary guard: **PASS**;
- frozen production-path vocabulary observation: **PASS**;
- six-seed chase telemetry: **PASS**;
- naturally selected playful-chase capture: **PASS**;
- Phase 7 chase evidence upload: **PASS**.

The ordinary speed-readability measurement also remained unchanged at **4.61 px/s** median p20-p80 visible spread on the native panel, **2.27×** median simultaneous p80/p20 ratio and **1.19×** within-activity identity pace ratio. The chase retune therefore did not erase the broader per-fish speed differentiation introduced by the preceding reopen.

## Performance and ESP32 scope

The production changes are arithmetic and bounded steering/phase decisions inside the existing fish update path. They add no particles, no unbounded histories, no renderer objects, no framebuffer allocation and no persisted per-fish chase state. The full render audit remains green at the values above.

The high-speed behavior is also deliberately rare and short. The 4.0-row/s envelope is confined to the opening escape rather than becoming a new normal locomotion speed, which keeps the visual vocabulary and runtime work bounded for the ESP32-S3 target.

## Persistence

No persistence schema change was introduced. The semantic phase is derived from the existing activity age/distance/tuning, and the arbitration/release behavior is transient. The 200-case persistence audit is green.

## Remaining watch items

- Peak turn rates in the six-seed matrix can still be visually aggressive at the fastest moments, particularly the 646°/s chaser case. They are no longer one-frame wall reversals and did not produce overshoot in the final matrix, but they should remain visible in future regression comparisons.
- The 4.0 rows/s value is an authored ceiling, not a requirement that every fish hit exactly 4.0. The deterministic seed-2020 opening reached 3.654 rows/s and all six matrix evaders peaked between 3.77 and 3.84 rows/s.
- Body/tail deformation remains activity-authored rather than continuously phase-locked to realized speed. The earlier speed-cadence experiment remains intentionally rejected until a continuous animation-phase design exists.

## Gate decision

**PASS.** The requested high-energy chase contrast is now physically realized, the evader's 4.0-row/s ceiling remains a short opening burst rather than sustained travel, chaser speed remains bounded at 3.0 rows/s, the higher-speed geometry no longer produces pursuit overshoot in the six-seed matrix, the ending decelerates through a bounded release, naturally selected production chase evidence exists, persistence/render/runtime constraints remain intact, and the full repository verification suite passed at the final code head before this documentation-only closeout.