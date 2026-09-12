# Phase 6 Viewer Relationship Evidence

Phase 6 turns direct viewer interaction into one compact long-term relationship per persistent fish while keeping fixed personality, short-term saturation, autonomous behavior, and save size separate.

This report is the acceptance evidence for Phase 6A–6E. The repeatable measurement gate is `npm run measure:relationship`. The accelerated renderer capture is `npm run capture:relationship`.

## Acceptance summary

- `glassFamiliarity` is one bounded persistent scalar per fish.
- Relationship growth comes from a fish actually responding, approaching, lingering, or following a moving viewer stimulus.
- Rapid repetition has sharply diminishing returns through transient saturation.
- Familiarity changes visible response style without rewriting seeded personality.
- Highly familiar fish may initiate rare, bounded visits to viewer-associated regions.
- Voluntary visit state, recent viewer coordinates, saturation, and engagement bookkeeping are transient and never serialized.
- Offline progression preserves earned familiarity but cannot invent relationship growth.
- The production growth path below uses only the public production interaction functions. It never directly sets familiarity.
- Accelerated archetype evidence directly poses familiarity only to compare equivalent fish at controlled relationship levels.

## Controlled archetype evidence

A 180-day mature aquarium is used to select three contrasting fixed personalities. Each is then observed at familiarity 0.0, 0.2, 0.5, and 0.9 against the same canonical response records.

### Bold archetype

Seed `691d937f`, boldness 0.5992, confidence 0.6463, attentiveness 0.4578.

| Familiarity | Trust | Canonical watch becomes | Canonical approach becomes | Delayed hesitation | Approach aftermath |
| ---: | ---: | --- | --- | ---: | ---: |
| 0.00 | 0.000 | watch | approach | 1.40 s | 1.40 s |
| 0.20 | 0.160 | watch | approach | 1.32 s | 1.48 s |
| 0.50 | 0.401 | approach | approach | 1.21 s | 1.59 s |
| 0.90 | 0.721 | investigate | investigate | 1.06 s | 1.74 s |

The high-familiarity bold fish closes decisively and becomes the close investigator style.

### Cautious archetype

Seed `baabd132`, boldness 0.2758, confidence 0.2696, attentiveness 0.3548.

| Familiarity | Trust | Canonical watch becomes | Canonical approach becomes | Delayed hesitation | Approach aftermath |
| ---: | ---: | --- | --- | ---: | ---: |
| 0.00 | 0.000 | watch | approach | 1.40 s | 1.40 s |
| 0.20 | 0.141 | watch | approach | 1.35 s | 1.47 s |
| 0.50 | 0.352 | watch | approach | 1.27 s | 1.58 s |
| 0.90 | 0.633 | approach | approach | 1.16 s | 1.72 s |

The high-familiarity cautious fish learns a reliable approach but never collapses into the bold close-investigator style. This is the core personality-preservation check.

### Attentive archetype

Seed `2ca4689`, boldness 0.3412, confidence 0.3616, attentiveness 0.7328.

| Familiarity | Trust | Canonical watch becomes | Canonical approach becomes | Delayed hesitation | Approach aftermath |
| ---: | ---: | --- | --- | ---: | ---: |
| 0.00 | 0.000 | watch | approach | 1.40 s | 1.40 s |
| 0.20 | 0.168 | watch | approach | 1.33 s | 1.49 s |
| 0.50 | 0.421 | approach | approach | 1.23 s | 1.62 s |
| 0.90 | 0.758 | approach | approach | 1.10 s | 1.80 s |

This fish expresses familiarity primarily through attentiveness and longer engagement rather than bold close approach.

## Production-time relationship growth

The production evidence starts from a new aquarium at zero familiarity. Once per simulated day the founder receives one meaningful three-second stationary interaction through the real `applyTouch`, `applyContact`, `tick`, and `applyRelease` path. A one-day offline interval follows each session, which clears all transient saturation and cannot itself grant familiarity.

| Day | Familiarity |
| ---: | ---: |
| 0 | 0.000000 |
| 1 | 0.003158 |
| 7 | 0.021942 |
| 30 | 0.089951 |
| 60 | 0.162423 |
| 90 | 0.219156 |
| 120 | 0.272975 |
| 180 | 0.362028 |

The curve is gradual and still has substantial headroom at six months. A relationship becomes meaningful over weeks and months rather than being completed by a short play session.

## Repetition resistance

The same fresh aquarium receives forty immediate production touches/releases with no recovery interval.

| Rapid interactions | Familiarity |
| ---: | ---: |
| 1 | 0.002200 |
| 5 | 0.004978 |
| 10 | 0.005153 |
| 20 | 0.005501 |
| 40 | 0.006198 |

Thirty spaced meaningful daily sessions reach 0.089951 familiarity, about 14.5 times the relationship progress of forty rapid repetitions. The fish still visibly acknowledges the repeated input, but repetition is not a shortcut through the long-term relationship system.

## Voluntary initiation evidence

At high familiarity, each controlled personality produced a deterministic voluntary invitation within the one-hour scan window:

| Archetype | First invitation |
| --- | ---: |
| bold | 400 s |
| cautious | 128 s |
| attentive | 128 s |

These are opportunity scans, not fixed visit intervals. Production initiation still requires the global opportunity window, individual willingness roll, low saturation, acceptable hunger/energy, a low-commitment activity, and no direct viewer stimulus. Only one prominent visitor is allowed at a time.

## Accelerated visual captures

`npm run capture:relationship` renders a single contact sheet with three personality rows and four familiarity columns: unfamiliar, early, medium, and high. Each row finds a real viewer press that the selected unfamiliar fish answers passively, then replays the same production touch/hold scene at all four controlled familiarity levels. Labels are developer-only and sit outside the aquarium frame.

The default outputs are:

- `.behavior-captures/relationship/phase6-relationship-contact-sheet.png`
- `.behavior-captures/relationship/phase6-relationship-capture-manifest.json`

CI executes the capture at reduced scale so the capture path cannot silently rot.

## Persistence and boundedness

The only new durable relationship datum is `history.glassFamiliarity`. Saturation, engagement clocks, recent viewer coordinates, and voluntary glass visits all live in the transient `viewerRelationship` record and are deliberately excluded from serialization. Existing persistence tests also exercise old saves, malformed familiarity, round trips, offline advancement, and fixed relationship footprint.

## Final verification gate

The final Phase 6 verification sequence is:

1. `npm test`
2. `npm run audit:simulation`
3. `npm run audit:persistence -- --cases=200`
4. `npm run audit:render`
5. `npm run measure:feeding`
6. `npm run measure:relationship`
7. `npm run capture:relationship -- --scale=0.25 --output=.audit-output/relationship-captures`

The first complete 6E measurement run passed 471/471 tests, 48,000 simulation ticks with zero failures, 200 malformed persistence cases with zero failures, 540 render frames with zero differences or escaped spans, the feeding measurement, and the relationship measurement. The capture step is separately exercised by the final CI head after this report was added.

## Phase 6 acceptance

Phase 6 satisfies the Stage 2 gate when the final CI head is green:

- unfamiliar and familiar fish are behaviorally distinguishable;
- fixed personality remains legible at high familiarity;
- rapid input does not linearly accelerate relationship growth;
- saturation changes style without punishing or disabling interaction;
- voluntary fish-initiated glass visits exist and are bounded;
- relationship persistence remains essentially fixed-size;
- no raw interaction history grows over time;
- and both controlled familiarity comparisons and a genuine production-growth path are repeatable developer evidence.
