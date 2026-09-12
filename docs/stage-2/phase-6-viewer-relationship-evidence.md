# Phase 6 Viewer Relationship Evidence

Phase 6 turns direct viewer interaction into one compact long-term relationship per persistent fish while keeping fixed personality, short-term saturation, autonomous behavior, and save size separate.

This report is the acceptance evidence for Phase 6A–6E, including the product-first corrective review performed after the initial implementation pass. The repeatable measurement gate is `npm run measure:relationship`. The accelerated renderer capture is `npm run capture:relationship`.

## Acceptance summary

- `glassFamiliarity` is one bounded persistent scalar per fish.
- Relationship growth comes from a fish actually responding, approaching, lingering, or following a moving viewer stimulus.
- Rapid repetition has sharply diminishing returns through transient saturation.
- Familiarity changes visible response style without rewriting seeded personality.
- Highly familiar fish may initiate rare, bounded visits to viewer-associated regions during ordinary autonomous production behavior.
- Calm cruise, wandering, school-follow, individual-follow, and companion-cruise may yield to a voluntary visit; feeding, rest/shelter, chase, arrival, focused investigation, direct viewer input, and low energy retain priority.
- Raw hunger is not a second visit veto. The ordinary behavior scheduler decides whether appetite currently wins, preventing open-water species that cannot bottom-feed from becoming permanently locked out of the learned viewer relationship.
- Voluntary visit state, recent viewer coordinates, saturation, and engagement bookkeeping are transient and never serialized.
- Offline progression preserves earned familiarity but cannot invent relationship growth.
- The production growth path below uses only the public production interaction functions. It never directly sets familiarity.
- Accelerated archetype evidence directly poses familiarity only to compare equivalent fish at controlled relationship levels.

## Controlled archetype evidence

A mature aquarium is used to select three contrasting fixed personalities. Each is then observed at familiarity 0.0, 0.2, 0.5, and 0.9 against the same canonical response records.

### Bold archetype

Seed `691d937f`, boldness 0.5992, confidence 0.6463, attentiveness 0.4578.

| Familiarity | Trust | Canonical watch becomes | Canonical approach becomes | Delayed hesitation | Approach aftermath |
| ---: | ---: | --- | --- | ---: | ---: |
| 0.00 | 0.000 | watch | approach | 1.40 s | 1.40 s |
| 0.20 | 0.160 | watch | approach | 1.32 s | 1.48 s |
| 0.50 | 0.401 | approach | approach | 1.21 s | 1.59 s |
| 0.90 | 0.721 | investigate | investigate | 1.06 s | 1.74 s |

The high-familiarity bold fish closes decisively and becomes the close investigator style. A bold unfamiliar fish may already investigate readily; familiarity is not required to manufacture shyness first.

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
| 7 | 0.021941 |
| 30 | 0.089209 |
| 60 | 0.161030 |
| 90 | 0.217831 |
| 120 | 0.272419 |
| 180 | 0.358008 |

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

Thirty spaced meaningful daily sessions reach 0.089209 familiarity, about 14.4 times the relationship progress of forty rapid repetitions. The fish still visibly acknowledges repeated input, but repetition is not a shortcut through the long-term relationship system.

## Voluntary initiation evidence

### Controlled opportunity scan

At high familiarity, each controlled personality produced a deterministic invitation within the one-hour scheduler scan:

| Archetype | First invitation |
| --- | ---: |
| bold | 400 s |
| cautious | 128 s |
| attentive | 128 s |

This remains useful for deterministic scheduler coverage, but it is not the main production acceptance evidence because these fixtures deliberately place a fish into a compatible state.

### Natural production behavior

The stronger gate matures a real aquarium continuously through production `tick()` calls rather than pretending the device was powered off for six months. It runs 175 simulated days at the supported maximum time scale, gives the aquarium another five simulated days of slower accelerated activity so arrivals and ordinary behaviors settle through real activity time, then observes two viewer-free hours at normal behavioral speed. The selected archetypes are highly familiar for the comparison, but no activity is manually posed during the observation and no viewer input is injected.

| Archetype | Visit starts | First visible visit | Fraction of observed time visiting |
| --- | ---: | ---: | ---: |
| bold | 16 | 253.5 s | 7.31% |
| cautious | 8 | 1068.25 s | 3.21% |
| attentive | 17 | 253.5 s | 7.31% |

All three personalities initiate naturally within the two-hour window and remain below the 12% prominence ceiling. Bold and attentive fish volunteer earlier and more often; the cautious fish still learns to initiate but does so later and less often. The learned relationship therefore becomes observable without flattening personality.

A visit only counts after glass-directed steering actually survives the frame. If feeding, rest, shelter, chase, arrival, focused investigation, or another incompatible biological priority wins in the same frame, the transient invitation is cancelled immediately rather than being counted as an invisible one-frame marker.

## Accelerated visual captures

`npm run capture:relationship` renders one contact sheet with three personality rows and four familiarity columns: unfamiliar, early, medium, and high. For each personality the capture tool searches production interactions for the best equivalent familiarity contrast and replays the same press/hold scene at all four controlled relationship levels.

The capture acceptance is personality-aware. It prefers a passive-to-active transition when that naturally exists, but does not require a bold unfamiliar fish to pretend to be passive. A valid row can instead demonstrate familiarity through role progression, longer engagement, shorter hesitation, smaller standoff, or a measurably closer resulting response while preserving the fish's seeded style.

The default outputs are:

- `.behavior-captures/relationship/phase6-relationship-contact-sheet.png`
- `.behavior-captures/relationship/phase6-relationship-capture-manifest.json`

CI executes the capture at reduced scale so the capture path cannot silently rot.

## Product-first corrective review

After the initial green Phase 6 implementation, a second review started from viewer-visible promises and traced them downward through production behavior. It found several cases that ordinary implementation-level tests had not represented strongly enough:

- a raw hunger visit veto could permanently exclude open-water species that cannot bottom-feed;
- a distinct distant second press could cross-wire a fish's old attention record with a new motion target;
- the first continuity correction was too broad, so the final rule now allows a genuinely perceivable nearby second press to replace the response while a distant unperceived press cannot hijack it;
- an invitation could exist internally for one frame even when biological priority cancelled it before any visible glass steering;
- restricting voluntary visits to cruise/explore made mature social fish effectively unavailable for the learned viewer relationship for long stretches;
- the original capture acceptance incorrectly assumed every unfamiliar personality should begin passive; and
- the original autonomous-visit evidence posed favorable fish state instead of proving reachability in a continuously running aquarium.

Focused regressions cover these seams without expanding into a large edge-case matrix. Calm social locomotion may now yield to a rare familiar-viewer excursion, while feeding, sleep/shelter, chase, arrival, focused investigations, direct viewer interaction, low energy, and other high-commitment behavior continue to outrank it.

## Persistence and boundedness

The only new durable relationship datum is `history.glassFamiliarity`. Saturation, engagement clocks, recent viewer coordinates, and voluntary glass visits all live in the transient `viewerRelationship` record and are deliberately excluded from serialization. Existing persistence tests exercise old saves, malformed familiarity, round trips, offline advancement, and the fixed relationship footprint.

## Final verification gate

The Phase 6 verification sequence is:

1. `npm test`
2. `npm run audit:simulation`
3. `npm run audit:persistence -- --cases=200`
4. `npm run audit:render`
5. `npm run measure:feeding`
6. `npm run measure:relationship`
7. `npm run capture:relationship -- --scale=0.25 --output=.audit-output/relationship-captures`

The strengthened product-first head passed the complete gate:

- `npm test`: 479/479 passed;
- simulation audit: 48,000 ticks and 48,000 fish samples with zero failures;
- persistence audit: 200 malformed saves with zero failures;
- render audit: 540 frames with zero differing frames and zero escaped spans;
- feeding measurement: no feeding stage exceeded the 0.25-row strike-gap tolerance;
- relationship measurement: controlled archetypes, production growth, spam resistance, natural autonomous visits, persistence boundedness, and personality separation all passed; and
- relationship capture: the 3 personality × 4 familiarity contact sheet and manifest were generated successfully.

## Phase 6 acceptance

Phase 6 satisfies the Stage 2 gate when the final CI head is green:

- unfamiliar and familiar fish are behaviorally distinguishable;
- fixed personality remains legible at high familiarity;
- rapid input does not linearly accelerate relationship growth;
- saturation changes style without punishing or disabling interaction;
- voluntary fish-initiated glass visits occur naturally in production behavior and remain bounded;
- biological priorities continue to outrank the learned viewer relationship when appropriate;
- relationship persistence remains essentially fixed-size;
- no raw interaction history grows over time; and
- controlled familiarity comparisons, visual captures, a genuine production-growth path, and viewer-free natural initiation are all repeatable developer evidence.

**PASS — Phase 6 Persistent Fish–Viewer Relationship is complete.**
