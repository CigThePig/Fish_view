# Phase 7.7 — cross-behavior readability validation and freeze

**Status:** PASS — Phase 7 is complete. Phase 8 is Ready.  
**Branch:** `phase-7-1-readability-baseline`  
**Phase 7.6 input HEAD:** `468208c1e0503486bde432d9346cd111f5ef0f3d`  
**Final implementation and exact evidence source:** `13dcbe90e8f45f6c6d0f36ab3cb65e1706908881`  
**Evidence run:** [GitHub Actions 34872713198](https://github.com/CigThePig/Fish_view/actions/runs/34872713198)  
**Date:** 2026-09-14

Phase 7.7 validates and freezes the completed vocabulary; it makes no production
choreography change. The implementation commit adds a developer-only final
vocabulary contract, an exhaustive nearest-neighbor matrix, a six-identity
integration observer, a final shuffled blind capture and regression tests. It
also promotes the existing readability measurement into normal verification.

The production motion is unchanged from the Phase 7.6 implementation commit
`5e690189bf86f594edc769a69db8dd781b16ea52`. Completed chase and plant work
remains frozen.

## 7.7A — nearest-neighbor confusion matrix

The review asks for the visible fact that decides each likely confusion. It does
not try to manufacture numerical distance between quiet and energetic behavior.

| Behavior | Nearest neighbor | Deciding visible distinction | Result |
| --- | --- | --- | --- |
| Cruise | Open-water wander | Cruise holds a broad course; wander changes course and depth exploratorily. | PASS |
| Cruise | Companion cruise | Companion travel maintains a deliberate two-body side-by-side formation before separation. | PASS |
| Cruise | Arrival entry | Arrival starts at the boundary with a small body and a one-way settling ingress. | PASS |
| School follow | Individual follow | School follow closes toward group spacing; individual follow holds one leader's rear offset. | PASS |
| Individual follow | Companion cruise | Follow is asymmetric and rear-offset; companion travel is mutual and side by side. | PASS |
| Individual follow | Playful chase | Chase adds an evader, bursts, gap oscillation, near miss and decisive break. | PASS |
| Open-water rest | Plant shelter | Shelter enters and stays inside vegetation; rest remains exposed in open water. | PASS |
| Open-water rest | Familiar glass visit | A visit approaches the front, lingers and patrols before leaving. | Motion PASS; attribution context deferred to Phase 8 |
| Plant investigate | Plant weave | Investigation stays local and retreats on the same side; weave crosses and emerges. | PASS |
| Plant shelter | Plant weave | Shelter becomes nearly still in cover; weave keeps progressing through it. | PASS |
| Bubble investigate | Surface investigate | Bubble motion tracks a rising object; surface motion holds the waterline then descends. | PASS |
| Bubble investigate | Held-glass response | Glass response is causally timed to live contact and holds that contact point. | PASS |
| Bubble investigate | Drifting inspection | A drifting object moves laterally and persists; a bubble rises and disappears. | PASS |
| Plant investigate | Held-glass response | Plant inspection is anchored in vegetation; glass response is anchored to front contact. | PASS |
| Open-water wander | Substrate search | Feeding commits to the bottom, pitches nose-down and pecks rather than merely descending. | PASS |

The machine-readable matrix is exhaustive over the seventeen frozen vocabulary
entries and its tests require both members to name each other as neighbors.

## 7.7B — blind visual identification

The final capture contains all sixteen forced-showcase activities in a
deterministically shuffled order. The image shows only neutral sample letters
and elapsed time: it contains no behavior names, phase names or Phase 7 labels.
The answer key is a separate JSON file.

Review against the frozen visual sentences found no new ambiguity that warrants
a choreography edit. This is consistent with the earlier exact visual reviews:
Phase 7.6 changed only companion cruise and surface investigation, and no
production motion changed between that evidence source and this final gate.

The command is:

`npm run capture:phase7-final -- --scale=0.25 --output=.audit-output/phase7-final-blind`

The exact-commit workflow produced sixteen blind samples successfully. Generated
images and animations are kept in the workflow artifact rather than checked
into the repository.

## 7.7C — transition quality

The integration observer followed every showcase for its complete authored
window plus four seconds of recovery, over six deterministic aquarium
identities. Across 96 observations:

- the largest one-frame movement was **0.370 columns**;
- there were **zero** non-finite poses, disappeared subjects or teleport-like
  steps;
- there were **zero** full redraws;
- companion cruise exited into school follow after its visible separation;
- chase exited through its recovery into ordinary social locomotion;
- plant investigate and weave exited into open-water wander;
- plant shelter exited into open-water rest;
- surface investigation exited into open-water wander after descent;
- drifting inspection exited into open-water wander;
- arrival entry settled into ordinary investigation or wandering.

Cruise, wander, school follow, individual follow and substrate work can
legitimately continue beyond this short recovery window. Their continuity is
not treated as a failed ending. The targeted Phase 7.3–7.6 regressions still
prove the authored chase, plant, companion and surface endings directly.

## 7.7D — personality and body-size robustness

Every showcased behavior ran against six different persistent-fish identities.

For fifteen behaviors the set covered five adult body profiles:
`tiny-dart 5×3`, `single-fin 6×5`, `round-fin 7×5`,
`double-fin 6×5` and `ribbed-dart 7×2`. Substrate feeding correctly used
three compact bottom-feeding profiles, preserving the existing species safety
rule.

For every behavior, boldness, sociability, activity, preferred depth and
curiosity each varied by at least the audit's material 0.12 span. Identity
altered the expression but produced no integration, transition or renderer
failure. Six-seed Phase 7.3–7.5 tests continue to provide the stricter semantic
arc gates for chase and the plant vocabulary.

## 7.7E — production-path validation

The exact-commit job observed a continuously matured production cast for
thirty minutes, a younger cast for ten minutes, the deterministic natural
surface case, a genuine calendar-driven fry arrival and a real held contact.
It did not assign activities or replace scheduler utility.

The mature/young observation recorded these natural episode counts:

| Activity | Episodes |
| --- | ---: |
| School follow | 402 |
| Substrate search | 486 |
| Drifting inspection | 7 |
| Open-water wander | 31 |
| Individual follow | 86 |
| Plant shelter | 18 |
| Open-water rest | 26 |
| Familiar glass visit | 17 |
| Playful chase | 9 |
| Companion cruise | 47 |
| Bubble investigate | 60 |
| Cruise | 1 |
| Plant investigate | 2 |
| Plant weave | 2 |
| Surface investigate | 1 |

The recorder also saved replayable natural examples for arrival, drifting
inspection, familiar glass visit, companion cruise, surface investigation and
held-glass response. The ordinary independent ten-minute readability watch
separately observed every recurring category and 666 visible feeding pecks.

## 7.7F — boundedness and ESP32-S3 regression check

Phase 7.7 adds no product runtime state and no persistence fields. Its vocabulary
record, capture code and observer are developer-only. Therefore it adds:

- **0** runtime choreography fields;
- **0** persistent fields;
- **0** queues, paths, histories or other growing collections;
- **0** full redraws across the 96-sample final integration matrix.

The normal renderer audit passed 540 frames with zero differing frames and zero
escaped spans. The persistence audit passed 200 malformed saves, and Phase 7.6's
unchanged ten-year save remains 18,037 bytes. This is an architecture and
boundedness gate, not a claim about physical ESP32 timing; Phase 10 still owns
the device budget.

## Verification

At the exact evidence commit:

- `npm test`: **514/514 passed**;
- simulation audit: **48,000 ticks / 48,000 fish samples**, zero failures;
- persistence audit: **200 malformed saves**, zero failures;
- render audit: **540 frames**, zero differing frames or escaped spans;
- feeding measurement: PASS;
- relationship measurement: PASS, including 13 bold, 8 cautious and 16 attentive
  natural visits over two hours;
- complete readability measurement: PASS;
- final six-identity vocabulary audit: **96/96 observations**, zero failures;
- shuffled final blind capture: **16/16 samples generated**;
- natural remaining-vocabulary observation: PASS;
- branch static-site build: PASS.

## Final freeze

The definitive inventory is
[Phase 7 final behavior vocabulary](phase-7-final-behavior-vocabulary.md).
The matching developer contract is
`src/dev/phase-7-behavior-vocabulary.js`.

Phase 8 may adjust scene-level start pressure, event spacing, regional
distribution and aftermath. It must preserve these motion sentences and the
normal `measure:readability` gate. A behavior is reopened only when new visual
evidence demonstrates a concrete regression.

## Phase 8 handoff

Phase 8 should begin with observation, not a director implementation.

1. Classify existing events into coarse ambient, low, medium and focal salience
   in developer-only evidence data.
2. Observe deterministic young and mature aquariums for five and thirty minutes.
   Record simultaneous focal events, correlated starts, horizontal-region
   concentration, interaction focus collapse and low-energy aftermath.
3. Compare those timelines with rendered segments before changing scheduler
   utility.
4. Where evidence shows stacking, add only a small bounded start-pressure term.
   Do not cancel active behavior, serialize the aquarium or create a hard global
   one-event rule.
5. Treat familiar-glass person-attribution as a scene-context problem: preserve
   its approach/linger/patrol/exit motion while making recent interaction and
   focal competition legible.
6. Keep the Phase 7 vocabulary frozen. Phase 8 owns coexistence, not another
   behavior-by-behavior rewrite.

**PASS — Phase 7 complete. Phase 8 is Ready.**
