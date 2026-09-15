# Phase 7.1 — Readability baseline and behavior freeze

**Branch:** `phase-7-1-readability-baseline`  ·  **Baseline commit:** `739f8db4ed382c1325db9f5e6dc43823093d019f`  ·  **Date:** `2026-09-13`

Phase 7.1 does not make the aquarium move differently. It records what is already visually strong, what is probably already acceptable, what still needs blind review, and which two behaviors are allowed to receive major choreography work first. The purpose is to stop Phase 7 from becoming a broad retuning exercise that accidentally damages good motion while chasing weak motion.

## Changes made

### Production

None.

No simulation, choreography, renderer, interaction, persistence, or save-format code changed in this slice.

### Developer tooling and evidence

- `src/dev/phase-7-readability-baseline.js` is the machine-readable Phase 7 scope contract. Every required behavior signature has a visual sentence, at least three independent cues, nearest confusing neighbors, a baseline status, a change policy, and an owning later Phase 7 slice.
- `tests/phase7-readability-baseline.test.js` guards complete coverage, the three-cue rule, the protected/reference set, the provisional-freeze set, the two priority rework targets, and the anti-aliasing comparison matrix.
- `tools/capture-phase7-readability-baseline.mjs` creates a deterministic **blind** contact sheet. The sheet shows opaque Sample A / B / C labels and elapsed time only; the behavior names, classifications, cues, and owning phase live in a separate JSON key. The sheet is meant to be reviewed before the key is opened.
- `npm run capture:phase7-baseline` exposes that capture directly.
- The existing `npm run measure:readability` remains the quantitative companion. It already measures every forced showcase and runs an ordinary deterministic ten-minute production watch, so Phase 7.1 does not duplicate that harness.

## Architecture

This phase adds no runtime concept.

`src/dev/phase-7-readability-baseline.js` is developer-only declarative data. Production code does not import it. The capture generator reads the existing `SHOWCASE_SCENARIOS`, ticks the normal showcase through the production simulation, and renders through the normal canvas scene renderer.

There is no new transient state, persistent field, particle, event list, runtime allocation, or firmware responsibility.

## Visual result

**Nothing is visibly different in the aquarium.**

That is intentional. Phase 7.1 is the freeze frame before the choreography work begins.

The visual baseline is:

| Activity | Baseline | Change policy | Later owner |
| --- | --- | --- | --- |
| Bubble investigation | **Strong / reference** | Freeze | 7.7 validation only |
| Substrate search / feeding | **Strong / reference** | Freeze | 7.7 validation only |
| Cruise | Provisionally acceptable | Provisional freeze | 7.6 audit |
| Open-water wander | Provisionally acceptable | Provisional freeze | 7.6 audit |
| School follow | Provisionally acceptable | Provisional freeze | 7.6 audit |
| Individual follow | Provisionally acceptable | Provisional freeze | 7.6 audit |
| Open-water rest | Provisionally acceptable | Provisional freeze | 7.6 audit |
| **Playful chase** | **Priority rework** | Scheduled rework | **7.2 pursuit, 7.3 arc/ending** |
| **Plant weave** | **Priority rework** | Scheduled rework | **7.4** |
| Plant investigate | Review before change | Review first | 7.5 |
| Plant shelter | Review before change | Review first | 7.5 |
| Companion cruise | Review before change | Review first | 7.6 |
| Surface investigate | Review before change | Review first | 7.6 |
| Drifting-object inspection | Review before change | Review first | 7.6 |
| Arrival entry | Review before change | Review first | 7.6 |
| Human / glass investigation | Review before change | Validate interaction distinction | 7.7 |

The two reference behaviors are not merely “low priority.” They are the quality bar. A later Phase 7 change that makes bubble investigation or substrate feeding worse is a regression even if the behavior being edited improves.

The five provisional behaviors are similarly protected from speculative cleanup. “Probably okay” means **inspect before editing**, not “retune while nearby.”

## Three-cue baseline

Every signature has at least three visible channels recorded in the machine-readable contract. Examples:

- bubble investigation: quick upward interception, nose-up pursuit, inspection standoff, disappearance search/exit;
- substrate feeding: descent to substrate, nose-down graze, slow bottom sweep, clustered pecks and recovery;
- playful chase: speed bursts, changing pair gap, hard trajectory change/overshoot, explicit break;
- plant weave: alternating stem-side movement, actual structure crossing, continuous progression, visible emergence.

This makes later review about visible motion sentences rather than tiny tuning-number differences.

## Anti-aliasing comparisons

The baseline records the Phase 7 confusion pairs explicitly:

- playful chase vs individual follow;
- individual follow vs companion cruise;
- companion cruise vs ordinary cruise;
- open-water rest vs plant shelter;
- plant investigate vs plant weave;
- bubble investigate vs surface investigate;
- substrate feeding/descent vs ordinary open-water movement;
- human/glass investigation vs bubble and plant investigation.

The comparison is intentionally symmetric at the review level even when only one behavior is scheduled for modification.

## Evidence

| Claim | How it was checked | Where the evidence is |
| --- | --- | --- |
| Every required Phase 7 signature has a deterministic forced fixture | Baseline coverage is compared with `SHOWCASE_SCENARIOS` | `tests/phase7-readability-baseline.test.js`, `src/dev/behavior-showcase.js` |
| Every signature has at least three independent visual cues | Contract test rejects entries with fewer than three cues | `src/dev/phase-7-readability-baseline.js` |
| Bubble investigation and substrate feeding are protected reference behaviors | Explicit baseline classification and test | `src/dev/phase-7-readability-baseline.js` |
| Cruise, wander, school follow, individual follow and open-water rest are protected from speculative retuning | Explicit provisional-freeze classification and test | `src/dev/phase-7-readability-baseline.js` |
| Plant weave and playful chase are the only top-priority rework targets | Exact-set regression test | `tests/phase7-readability-baseline.test.js` |
| A visual review can be performed without behavior-name leakage | New opaque-sample contact sheet plus separate key | `npm run capture:phase7-baseline` |
| Forced behavior has a quantitative baseline | Existing speed, pitch, turn, spacing, phase, damage and event measurements | `npm run measure:readability` |
| The same activities occur through production selection rather than only fixtures | Existing ordinary deterministic ten-minute watch records activity entries and pecks | `tools/measure-behavior-readability.mjs` |
| Current behavior semantics were not altered by Phase 7.1 | Branch changes are confined to developer contract, test, capture tool, package command and documentation | branch diff from baseline commit |

### Reproduction commands

```text
npm test
npm run measure:readability
npm run capture:behaviors -- --gif
npm run capture:phase7-baseline
```

`capture:behaviors` remains the labeled engineering view with semantic frames and optional GIFs. `capture:phase7-baseline` is the blind-review view. They intentionally answer different questions.

## Performance

There is no production performance delta because no production path changed.

| Measure | Before | After |
| --- | --- | --- |
| Mature untouched avg / max damage | unchanged | unchanged |
| Interaction avg / max damage | unchanged | unchanged |
| Dirty rectangles per frame | unchanged | unchanged |
| Full redraws | unchanged | unchanged |
| Scene objects / glyphs | unchanged | unchanged |

The blind capture generator is an offline developer tool and is not part of the ESP32-S3 runtime.

## Persistence

Unchanged. No save fields were added, removed, or reinterpreted.

## Freeze rules for the remaining Phase 7 work

1. **Do not modify bubble investigation or substrate feeding as collateral work.** A change needs explicit evidence that the behavior itself is broken or that a shared-system fix cannot be isolated.
2. **Do not modify the provisional five merely because their numbers look untidy.** They are audited in 7.6 first.
3. **7.2 and 7.3 may focus hard on chase without solving every social behavior simultaneously.** Individual follow is the comparison control.
4. **7.4 owns plant-weave route geometry.** 7.5 then checks whether investigate and shelter still form a distinct plant vocabulary.
5. **No behavior passes final Phase 7 solely because a speed or spacing threshold passes.** The blind visual sentence remains authoritative.

## Remaining limitations

This slice records the baseline; it does not repair weak choreography.

- Playful chase remains intentionally deferred to 7.2 and 7.3.
- Plant weave remains intentionally deferred to 7.4.
- Plant investigate and shelter are not declared good or bad yet; 7.5 decides after weave has a stable vocabulary.
- Companion cruise, surface investigation, drifting inspection and arrival remain review-first rather than presumed failures.
- The five provisional behaviors still require the later 7.6 side-by-side audit before final Phase 7 sign-off.
- Human/glass behavior is validated against autonomous investigation in 7.7 rather than rewritten here.

## Gate decision

Phase 7.1 acceptance for the sequential Phase 7 plan:

- **A complete behavior inventory exists:** PASS — all sixteen required/showcase signatures are represented.
- **Every behavior has an intended visual sentence and at least three cues:** PASS.
- **Existing strengths are protected instead of automatically retuned:** PASS — two reference behaviors plus five provisional freezes are explicit and regression-tested.
- **The highest-priority work is narrowed before implementation:** PASS — only playful chase and plant weave are `priority-rework`.
- **Nearest-neighbor visual comparisons are recorded:** PASS.
- **Forced fixtures and a natural production observation path exist:** PASS — existing behavior showcase and ten-minute production watch are reused.
- **Blind visual review is reproducible without labels giving away the answer:** PASS — dedicated blind contact-sheet generator added.
- **Production behavior is unchanged:** PASS.

**PASS — Phase 7.1 is complete; proceed to Phase 7.2 (playful chase core pursuit choreography).**
