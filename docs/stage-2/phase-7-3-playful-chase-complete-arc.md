# Phase 7.3 — Playful chase complete arc and ending

**Branch:** `phase-7-1-readability-baseline`  ·  **Phase 7.3 evidence commit:** `7cbbb7d71e594ca81383daf117e279aa14c6395f`  ·  **Date:** `2026-09-13`

Phase 7.2 made the middle of playful chase read as pursuit and evasion. Phase 7.3 gives that pursuit a complete visual sentence rather than letting it start, run and stop at one nearly constant intensity.

The final authored arc is:

> **engage → escape → pursuit → intercept / near miss → break → recover**

The important change is not merely higher speed. The pair now changes relationship over the course of the event: the chaser closes, the evader gets the first real escape beat, the chaser answers, the gap compresses again, the evader makes a final lateral juke while the chaser commits through the old line, and the pair then separates and settles.

## Production changes

### One semantic chase arc, no new persistent state

`src/sim/chase-arc.js` defines the semantic timing of the chase. The phases are derived from activity age, pair distance and the existing authored chase tuning rather than stored as another state machine.

This keeps playful chase bounded and reconstructable:

- no new save field;
- no new event queue;
- no chase history buffer;
- no unbounded runtime data;
- no persistence migration.

At the default 6.2-second chase, the deterministic observer sees the same broad sequence in every matrix seed:

- `engage` at 0.0 s;
- `escape` at 3.1 s;
- `pursuit` at 3.8 s;
- `intercept` at 4.6 s;
- `break` at 6.3 s;
- `recover` at 7.2 s.

The exact start of the escape beat is allowed to depend on distance. Recognition is intentionally not identical to panic: an evader does not bolt simply because a chaser has entered the outer recognition radius.

### The evader moves first

During the semantic escape beat the chaser deliberately reuses the existing low-speed break/glide target envelope without actually ending the chase. The evader receives the first acceleration and lateral dodge, so the gap visibly opens before the chaser answers.

This is deliberate reaction timing rather than a pause in simulation. Once pursuit resumes, the chaser rebuilds speed and steering authority.

### Pursuit breathes instead of becoming formation

The chased fish retains short bounded evasive pulses during pursuit. They interrupt the closing run without turning the evader into a second fish travelling at one fixed flee speed.

Across all six deterministic evidence seeds, pair-distance direction now changes three times, with two of those changes occurring before the authored break. Phase 7.2 produced one direction change, at the ending.

That close / release / close rhythm is the main structural distinction between a chase and a fast follow.

### Interception and near miss

The final pursuit beat changes geometry rather than simply increasing speed.

The evader trades some forward speed for a strong deterministic lateral juke. The chaser temporarily commits hard to its interception line and is slow to correct back toward the new escape line. The result is a visible near-catch / miss and large heading separation before the break.

The deterministic matrix records zero literal centre-point overshoot frames. That is intentional rather than hidden: the visual result is a near miss, not two fish being forced through one another to satisfy a metric. The Phase 7 requirement is a readable climax and strong trajectory change; a literal overshoot remains optional if later visual review ever shows it would improve the aquarium.

### Break and recovery

The authored break remains at 6.2 seconds. Evasion ends when the chase ends, the chaser turns away rather than continuing to shadow the target, and the recovery window reduces speed and steering intensity before ordinary activity resumes.

All six evidence seeds show positive gap growth after the break.

## Closure fixes

Two issues were found while closing the phase and were fixed before the gate was accepted.

### The old readability test contradicted the new arc

The previous `behavior-readability` test still asserted that the chaser had to be much faster than an individual follower at age 1.0 seconds. That was correct for Phase 7.2 but incorrect for Phase 7.3, because age 1.0 is now deliberately inside the first escape beat where the evader moves first.

The regression now checks the actual contract:

1. at the first escape beat the chaser is temporarily slower than ordinary follow;
2. the evader accelerates and opens the gap;
3. the evader makes a visible vertical/lateral dodge;
4. after that readable delay the chaser accelerates above follow speed and remains in playful chase;
5. the final break is still slow and evasion is gone.

This fixed the only failing test in the first full Phase 7.3 verification run without weakening the intended behavior.

### Capture labels were reporting the steering envelope, not the story beat

The chase uses the broad `break` steering envelope during semantic `escape`. The behavior capture tool originally printed that implementation envelope directly, so a still from the first escape beat was misleadingly labelled `break`.

`tools/capture-behavior-showcase.mjs` now derives chase capture labels from the same `chaseArcPhase()` function used by the observer. The final contact sheet therefore describes the semantic event (`engage`, `escape`, `intercept`, ending) instead of leaking an internal steering-profile choice into the evidence.

No production behavior changed in either closure fix.

## Quantitative evidence

The table compares the Phase 7.2 deterministic six-seed matrix with the final Phase 7.3 matrix. Values are medians unless noted otherwise.

| Measure | Phase 7.2 | Phase 7.3 | Read |
| --- | ---: | ---: | --- |
| Minimum pair gap | 2.181 rows | 1.968 rows | closer near-catch |
| Pair gap range | 3.019 rows | 3.232 rows | larger distance story |
| Gap direction changes | 1 | 3 in **all 6 seeds** | close / release / close / ending |
| Pre-break gap direction changes | 0 | 2 in **all 6 seeds** | chase breathes before the ending |
| Peak chaser speed | 1.100 rows/s | 1.601 rows/s | committed interception burst |
| Peak evader speed | 0.797 rows/s | 0.823 rows/s | escape remains bounded rather than matching chaser speed |
| Peak chaser turn rate | 51.7°/s | 96.6°/s | stronger cut / correction |
| Peak evader turn rate | 5.4°/s | 105.8°/s | final juke is unmistakable |
| Peak heading separation | 24.6° | 70.0° | pair leaves formation decisively |
| Peak vertical separation | 0.259 rows | 0.476 rows | stronger non-parallel geometry |
| Strongest evasion | 0.623 | 0.871 | clear target response |
| Gap growth after break | 0.755 rows | 0.578 rows | still positive in all six seeds |
| Break | 6.3 s | 6.3 s | authored duration preserved |
| Recovery observed | — | 7.2 s in all 6 seeds | ending has an aftermath |
| Literal overshoot frames | 0 | 0 | near miss preferred to forced body crossing |

The large evader turn-rate increase is concentrated in the authored final juke rather than being constant twitch. The branch GIF and contact sheet were reviewed alongside the numbers so the metric did not become the design target.

## Visual evidence

The exact Phase 7.3 evidence commit has an interactive branch preview at:

`https://raw.githack.com/CigThePig/Fish_view/7cbbb7d71e594ca81383daf117e279aa14c6395f/behaviors.html?activity=playful-chase`

GitHub Actions run `34768420446` produced the exact-commit Phase 7 evidence artifact, including:

- animated playful-chase capture;
- animated `individual-follow` comparison capture;
- semantic chase/follow contact sheet;
- six deterministic chase timelines and JSON;
- blind Phase 7 baseline contact sheet;
- branch-accurate static site;
- exact-commit preview link.

The contact sheet and animation show a visibly asymmetric chase rather than two fish holding one line. The still sheet now names the semantic escape correctly; the animation carries the full pursuit, break and recovery between stills.

## Verification

GitHub Actions run `34768420446` verified commit `7cbbb7d71e594ca81383daf117e279aa14c6395f`.

### Normal repository verification

- `npm test` — PASS
- `npm run audit:simulation` — PASS
- `npm run audit:persistence -- --cases=200` — PASS
- `npm run audit:render` — PASS
- `npm run measure:feeding` — PASS
- `npm run measure:relationship` — PASS
- relationship capture — PASS
- verification artifact upload — PASS

### Phase 7 evidence

- six-seed chase telemetry — PASS
- chase + individual-follow animated capture — PASS
- blind Phase 7 baseline capture — PASS
- branch-accurate static-site build — PASS
- exact-commit preview generation — PASS
- Phase 7 evidence artifact upload — PASS

Workflow run:

`https://github.com/CigThePig/Fish_view/actions/runs/34768420446`

## Scope discipline

Phase 7.3 did not retune `individual-follow`, companion cruise, plant behavior, bubble investigation, substrate feeding, cruise, open-water wander, school follow or open-water rest.

The frozen/reference behaviors therefore remain controls rather than collateral cleanup targets.

No renderer architecture, save schema or interaction system changed.

## Remaining limitation

The event ends in a deterministic near miss rather than a literal center-point overshoot. Current evidence does not justify making the fish cross through one another merely to increment an observer counter. This remains a visual-review option, not unfinished Phase 7.3 work.

## Gate decision

Phase 7.3 acceptance for the sequential Phase 7 plan:

- **Readable initiation / engagement:** PASS.
- **Evader gets a distinct first escape beat:** PASS.
- **Chaser responds after a visible delay:** PASS.
- **Gap visibly compresses and releases before the ending:** PASS — two pre-break direction changes in all six evidence seeds.
- **Climax contains a strong trajectory change / near miss:** PASS.
- **Break-off is decisive rather than a timer silently expiring:** PASS.
- **Separation and recovery are observable:** PASS.
- **Nearest visual neighbor (`individual-follow`) remains frozen:** PASS.
- **Persistence and ESP32-oriented boundedness remain intact:** PASS.
- **Normal repository verification and branch visual evidence are green:** PASS.

**PASS — Phase 7.3 is complete. Playful chase is frozen unless Phase 7.7 cross-behavior review finds a concrete regression. Phase 7.4 may begin with plant weave as the next priority target.**
