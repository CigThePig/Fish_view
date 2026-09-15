# Phase 7 reopen: natural speed readability

**Branch:** `diagnose-speed-readability`  
**Baseline:** `313e5934a3c763414719be93e46daafde8ed5753`  
**Date:** 2026-09-15

Phase 7 was reopened narrowly after direct production viewing exposed a regression that the original gate did not measure: individual fish had authored speed bands, but ordinary aquarium motion made those differences look absent or nearly absent. This is new visual evidence under the Phase 7 freeze rule, not an attempt to redesign the frozen motion vocabulary.

## Changes made

- Added a production-path speed-readability diagnostic that watches ordinary aquarium motion instead of only forced showcase scenarios.
- Measures physical panel displacement correctly: horizontal columns and vertical rows are converted independently because the 66 × 20 logical aquarium maps to non-square physical cells on the 800 × 480 panel.
- Measures identity pace only within shared activities so behavior choice cannot masquerade as personality.
- Measures playful-chase evasion as a continuous run rather than collecting disconnected fast frames.
- Added a deterministic locomotion temperament derived from each existing fish seed: approximately `0.84×..1.16×` for ordinary motion.
- Playful chase/evasion receives only 45% of that identity multiplier so the already-frozen chase sentence remains governed primarily by its authored choreography.
- Kept all resulting speed requests inside the existing activity steering profiles and their speed clamps.
- Rejected and removed an experimental renderer change that linked body-wave frequency directly to current speed. Review correctly identified that multiplying total elapsed uptime by a changing frequency could jump animation phase after long runtime. Renderer cadence is therefore unchanged by this reopen.
- Repaired an unrelated interaction test fixture that assumed a hard-coded substrate coordinate could never contain a fish. The test now supplies the starting semantic context directly and tests the release-contact rule it actually owns.

## Architecture

The correction lives at the shared locomotion request layer in `src/sim/fish-choreography.js`. `locomotionPaceForFish(fish)` derives one stable value from the fish's existing seed, so identity remains deterministic without another persisted field. `steerActivityVelocity` applies that value before the existing profile clamps and acceleration/turning controller.

This deliberately does **not** alter activity selection, activity durations, target geometry, plant routes, social relationship logic, save schema, renderer geometry, or the Phase 7 visual sentences. Social/chase choreography remains bounded by the same activity-specific profiles. The final Phase 7 vocabulary already permits personality differences in speed within the authored band; this reopen makes that permitted difference actually visible in ordinary production motion.

## Visual result

The pre-correction production diagnostic at `bbeaeb2f35af7c33218d765bee1d754218438891` measured a median simultaneous p20-p80 visible-speed spread of **3.23 px/s** on the native 800 × 480 panel, only **1.58 px/s** when the aquarium is scaled to a 390 px-wide phone. The original diagnostic's identity number at that commit is intentionally not used as evidence because review found it was confounded by activity choice.

With the corrected physical measurement and within-activity identity comparison, the production aquarium after the locomotion correction measured:

- median simultaneous p20-p80 visible-speed spread: **4.61 px/s** on the native panel;
- the same spread at 390 px display width: **2.25 px/s**;
- median p80/p20 simultaneous speed ratio: **2.27×**;
- within-activity identity p20/p80 pace ratio: **1.19×**;
- cruise mean: **4.1 px/s**;
- open-water wander mean: **5.7 px/s**;
- individual follow mean: **6.2 px/s**;
- school follow mean: **6.8 px/s**;
- plant investigate mean: **3.4 px/s**;
- plant weave mean: **12.2 px/s**;
- bubble investigate mean: **8.6 px/s**;
- substrate search mean: **5.1 px/s**.

The playful-chase continuity check observed one uninterrupted **36-frame / 3.6-second** evasion run. The evader averaged **17.57 px/s**, with **17.42 px/s** median and **26.51 px/s** peak physical panel speed. The chaser averaged **6.54 px/s** during the same interval. This preserves a visibly different chase beat rather than proving the gate with one isolated velocity spike.

## Evidence

| Evidence | Result |
| --- | --- |
| Direct production viewing | Triggered the reopen: normal fish pace looked effectively uniform despite the authored activity ranges. |
| Baseline production diagnostic (`bbeaeb2f…`) | Median visible p20-p80 spread 3.23 px/s panel / 1.58 px/s at 390 px. |
| Corrected natural production watch | Median spread 4.61 px/s panel / 2.25 px/s at 390 px; 2.27× median p80/p20 ratio. |
| Within-activity identity comparison | 1.19× p80/p20 persistent identity pace ratio. |
| Continuous playful-chase observation | 3.6 s continuous evasion, 17.57 px/s average and 26.51 px/s peak. |
| Existing Phase 7 vocabulary | Motion sentences, paths, posture cues and behavior ownership remain unchanged; only bounded pace personality is added. |
| Review follow-up | Non-square physical-cell measurement, within-activity identity comparison and continuous chase sampling corrected after Codex review. Unsafe uptime-scaled body cadence experiment removed. |
| Full repository/Phase 7 production gates | Must pass on the final PR head before merge. |

## Performance

Production cost is one deterministic seed-derived scalar plus a small amount of arithmetic in the existing steering path. It creates no particles, arrays, per-frame history, framebuffer work or new rendering objects. The heavier distribution analysis remains test/developer-only and is not shipped into the ESP32 runtime path.

## Persistence

No persistence schema change. Locomotion temperament is re-derived from the fish seed exactly as other fixed personality values are. No save field, migration, or additional long-horizon storage is introduced.

## Remaining limitations

- Body/tail animation cadence is still primarily activity-authored rather than continuously driven by realized locomotion speed. A first attempt to couple it directly to speed was removed because using a changing frequency against total elapsed uptime can create phase discontinuities. Any future cadence coupling needs an accumulated/continuous phase design and its own visual evidence.
- Social formations intentionally velocity-match. Persistent personal pace should therefore read most strongly outside tightly matched formation beats rather than forcing companions to swim at visibly incompatible speeds.
- The diagnostic is a deterministic representative production watch, not an exhaustive claim that every seed produces the same distribution.

## Gate decision

**PASS, conditional only on the final PR head passing the repository's full automated and frozen-Phase-7 production-path gates.** The visual regression is demonstrated, the correction is narrow and bounded by the existing choreography profiles, persistence and renderer semantics are unchanged, and the measurement failures identified in review have been corrected.