# Phase 7.6 — remaining behavior readability audit

**Status:** PASS — Phase 7.6 is complete. Phase 7.7 may begin.

**Branch:** `phase-7-1-readability-baseline`  
**Handover HEAD:** `10ece367c5553eb3ef33532d1c3494f5db421309`  
**Implementation and exact evidence source:** `5e690189bf86f594edc769a69db8dd781b16ea52`  
**Date:** 2026-09-14

Phase 7.6 audited the remaining behavior vocabulary from rendered captures and natural production episodes. It found two concrete readability failures: companion cruise stalled instead of travelling, and surface investigation lacked a deliberate descent and could select a destination too far away to reach. Those two behaviors received targeted changes. Completed chase, plant, bubble and feeding choreography remains frozen.

The visual captures and GIFs used for inspection were generated locally from the exact implementation commit. They are reproducible through the committed capture tools and are intentionally not stored in the repository.

## Post-7.5 diagnostic reconciliation

The handover HEAD added only the temporary `.github/workflows/phase7-5-relationship-diagnose.yml`. It did not change the plant implementation or invalidate the Phase 7.5 PASS.

The relationship failure was an independent Phase 6 availability defect. The selected bold fish balanced near energy 0.274 while spending 5,200 of 7,200 observed seconds in available school-follow. A second energy cutoff at 0.3 therefore excluded every invitation even though its current activity was eligible.

That redundant cutoff is removed. Actual rest, shelter, feeding, chase, arrival and focused investigation still block or cancel visits through the existing activity guards. The temporary workflow is deleted. The original two-hour relationship gate, without relaxed assertions or a longer window, now reports:

| Archetype | Natural visits | Occupancy |
| --- | ---: | ---: |
| Bold | 13 | 5.47% |
| Cautious | 8 | 3.20% |
| Attentive | 16 | 7.18% |

A focused regression proves that available low-energy locomotion can volunteer while open-water rest and plant shelter remain protected.

## Definitive Phase 7.6 inventory

| Activity | Visual sentence | Nearest neighbor | Outcome |
| --- | --- | --- | --- |
| Cruise | Calm, steady travel with a level body and broad course | Wander; companion cruise | **PASS unchanged** |
| Open-water wander | An exploratory excursion with more vertical variation than cruise | Cruise; plant investigate | **PASS unchanged** |
| School follow | One fish closes toward and adjusts into the school | Individual follow | **PASS unchanged** |
| Individual follow | A rear-offset follower tracks an independently moving leader | Chase; companion cruise | **PASS unchanged** |
| Open-water rest | A fish settles nearly still in open water | Plant shelter | **PASS unchanged** |
| Companion cruise | Two fish travel side by side, correct independently, then separate | Individual follow; cruise | **PASS with targeted improvement** |
| Surface investigate | A fish ascends, probes the surface, then visibly descends | Bubble investigate | **PASS with targeted improvement** |
| Human/held-glass investigation | A fish approaches a real contact, hovers, loses interest individually, and resumes swimming | Plant/bubble investigation | **PASS unchanged** |
| Autonomous familiar glass visit | A fish returns locally, lingers, patrols and resumes swimming | Rest; plant investigate | **Deferred intentionally to Phase 8** for scene context and person-attribution salience |
| Arrival entry | A small fish enters from the boundary and settles into normal swimming | Cruise; school motion | **PASS unchanged** |
| Drifting-object inspection | A fish closes on a moving object, slows to inspect and disengages | Bubble/plant investigation | **PASS unchanged** |
| Bubble investigate | Upward interception, pitched pursuit, inspection and release/search | Surface investigate | **PASS unchanged; strong reference** |
| Substrate search/feeding | Descent, nose-down substrate alignment and discrete pecks | Ordinary downward travel | **PASS unchanged; strong reference** |
| Playful chase | Asymmetric escape, renewed closure, near miss, break and recovery | Individual follow | **PASS unchanged; frozen 7.3 reference** |
| Plant investigate | Approach one plant, inspect locally and retreat on the same side | Plant weave | **PASS unchanged; frozen 7.5 reference** |
| Plant weave | Cross and thread vegetation, then emerge | Plant investigate | **PASS unchanged; frozen 7.4 reference** |
| Plant shelter | Enter cover, become conspicuously quiet and emerge | Open-water rest | **PASS unchanged; frozen 7.5 reference** |

## Targeted changes

### Companion cruise

The old mutual pair could lose its forward reference because reciprocal velocity matching and rotating correction slots fed into one another. The pair visibly stayed together but spent most of its bout close to its starting position.

Mutual companions now preserve stable side-by-side vertical slots and derive modest shared travel from their combined heading while retaining independent steering and pose response. The final four seconds of the bout provide a gentle separation. A following school-follow bout prevents immediate renewal of the same pair.

In the deterministic showcase, both fish travel more than three columns by twenty seconds while keeping separate adjacent bodies. In an unforced production episode, separation begins at +19.5 seconds and school-follow begins at +23.5 seconds.

### Surface investigation

The old sentence ended at the surface. Its generic transition into wander did not guarantee a visible descent. A natural seed-2 production case also exposed a distant waypoint: the fish spent 35 seconds commuting and timed out before probing.

Spontaneous surface targets now stay within 3.2 columns of the fish. Real surface-break stimuli retain their actual location. A bounded three-stage activity cursor requires physical surface arrival, holds the probe for 2.8 seconds, then targets a point 3.2 rows below the safe surface before the activity completes. A 35-second safety bound remains for exceptional obstruction.

The unforced seed-2 case reads: ascend, probe at +11.5 seconds, descend at +14.5 seconds, and open-water wander at +18.5 seconds.

## Production-path evidence

The committed `measure:remaining-vocabulary` tool observes forced showcases through their endings, a continuously matured production cast for 30 minutes, a younger cast for ten minutes, and the reproducible surface-oriented seed-2 aquarium. It records compact JSON and replayable states outside the repository.

That observation recorded natural occurrences of companion cruise, drifting inspection, arrival entry, held-glass response, familiar glass visits and surface investigation. Representative endings were:

- genuine fry arrival → open-water wander at +12.5 seconds;
- drifting inspection → open-water wander at +6.25 seconds in the captured short encounter;
- familiar glass approach → linger at +2.5 seconds → patrol at +20.5 seconds → normal swimming at +39.75 seconds;
- real held contact → inspect at +0.5 seconds → normal swimming at +16.25 seconds;
- companion cruise → separation at +19.5 seconds → school follow at +23.5 seconds;
- surface investigate → probe at +11.5 seconds → descent at +14.5 seconds → wander at +18.5 seconds.

The glass-visit case controls familiarity only; drives, geometry, current activities and scheduler remain natural. Phase 6's unchanged measurement separately proves interaction-driven familiarity growth.

## Tooling

- `capture:behaviors` records commit provenance, accepts `--seconds`, and captures the endings of surface and companion behaviors.
- `measure:remaining-vocabulary` records deterministic showcase trajectories and natural production episodes.
- `capture:episode` turns any recorded production state into a captionless six-frame sheet and GIF, including real touch/contact/release replay.

These are developer tools and add no firmware runtime state.

## Verification and boundedness

GitHub Actions [run 34811249146](https://github.com/CigThePig/Fish_view/actions/runs/34811249146) passed at the exact implementation commit.

- `npm test`: **508/508 passed**
- simulation audit: **48,000 ticks / 48,000 fish samples**, zero failures
- persistence audit: **200 malformed saves**, zero failures
- render audit: **540 frames**, zero differing frames or escaped spans
- feeding measurement: PASS
- relationship measurement: PASS
- six-seed chase observation: PASS
- static Pages build: PASS
- full redraws in all measured behavior windows: zero

Matched pre/post observation windows recorded:

| Measure | Before | After |
| --- | ---: | ---: |
| Companion mean / peak damage | 42.9% / 60.2% | 42.4% / 75.9% |
| Surface mean / peak damage | 37.5% / 79.4% | 37.5% / 79.8% |
| Ten-year seed-42 save | 18,037 bytes | 18,037 bytes |

The higher companion peak is the local damage from two large fish now travelling through the scene. Mean damage slightly decreases and the renderer never enters a full redraw. All frozen-reference measurements retain their baseline values.

Surface investigation adds two bounded transient scalars per fish: a three-value stage and a finite stage-start age. At the 15-fish cap that is thirty scalar fields. Companion travel adds no stored state. There are no new histories, paths, arrays, queues, persistent fields or schema migrations. The ten-year save is byte-identical before and after. Phase 10 still owns device timing and memory budgets.

## Remaining limitation

An unsolicited familiar-glass hover can still be difficult to identify specifically as interest in the person when viewed without recent interaction context in the busy front-view aquarium. Its scheduler and approach/linger/patrol/exit motion work, but stronger attribution belongs to Phase 8 scene-level salience and context.

Phase 7.7 owns the full nearest-neighbor confusion matrix, shuffled blind identification, transition integration, personality/body-size robustness and final vocabulary freeze. None of that work has begun here.

**PASS — Phase 7.6 complete. Phase 7.7 may begin.**
