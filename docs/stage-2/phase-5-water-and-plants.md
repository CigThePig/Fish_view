# Phase 5, first slice — water feedback and responsive plants

> **Superseded for the phase gate.** This report is the record of the first of
> Phase 5's two slices and its FAIL below was correct at the time. The rest of
> the phase — sections 11.2–11.7, the environmental responses and the causal
> chains — is in
> [phase 5 — environmental interaction and causal chains](phase-5-environment-and-chains.md),
> which passes the gate.

**Branch:** `codex/water-touch-and-plant-response` · **Baseline:** `83fa51d` (merged Phase 4) · **Date:** 2026-09-11

The first Phase 5 slice replaces the bright touch/drag placeholder with small,
muted water crests. Nearby plants visibly bend, recoil and settle. This completes
the requested water/plant correction; it does **not** complete all environmental
responses and causal chains in Phase 5. Phase 6 remains unstarted.

## Changes made

Production:

- `src/render/water-impulses.js` replaces `drawImpulseRipples` in `render.js`.
  Two broken crests expand, fade, and travel along directed water. Strength and
  radius affect their size; a gentle release stays gentle. The marks use the
  water palette, clip to the water, and draw behind inhabitants. There is no
  center marker, bright glyph ring, glow, refraction buffer or shader.
- `src/sim/plants.js` measures vertical reach from the resting skeleton's active
  growth stages and habitat scale. A high touch can reach a tall canopy without
  pushing a seedling below it. The impulse bend is stronger and includes a
  smaller recoil; roots and joint lengths remain fixed. Nearby fish still make
  a smaller bend, now more legible. This slightly changes untouched plant poses
  and their damage measurements too.
- The main plan adds section 11.0 for water appearance and clarifies plant
  locality. `AGENTS.md` replaces its placeholder note with the new contract.
  The phase board explicitly records Phase 5 as in progress.

Tooling:

- `tools/measure-water-response.mjs` replays seven ordinary pointer scenarios
  through the production observation harness at 10 Hz, against a naturally
  stocked and settled seed-5 aquarium. It records before/after damage, plant
  movement, effect caps, persistence size, raster equality and visual captures.
- Three focused regressions cover visible anchored bending and recoil, growth
  dependent locality, and bounded raster feedback. Two older rendering tests
  now measure painted spans/bounds rather than assuming 17 placeholder glyphs
  and a center glyph. The direction and smooth-expansion contracts remain.

## Architecture and ESP32-S3 cost

No new simulation events, particle queues, histories or persistent fields.
Existing caps remain **six impulses, three live wakes and six path samples**.
Each drawn impulse has one scene object and at most **64 small opaque raster
spans** (384 across a saturated six-impulse list). Two arcs use a fixed 33-point
lookup table. Firmware can implement these as integer rectangles and RGB565
colors through the existing dirty-rectangle path. No transparency compositor,
framebuffer readback or second framebuffer is required.

Plant reach uses at most the existing twelve skeletal joints and only runs when
an impulse exists. Bending is bounded to ±0.85 before joint flexibility; its
recoil is derived from impulse age, with no per-plant spring history. The new
marks alter local objects, never the background signature. Simulation and
rendering remain deterministic.

This is a compatibility and bounded-cost result for the browser reference.
**It is not a firmware build or a measurement on an ESP32-S3.** Physical frame
time, heap use, LCD transfer and touch latency still need device validation in
Phase 10. The mature aquarium's existing overall repaint load remains substantial.

## Visual evidence

- [Before contact sheet](../assets/stage-2/phase-5-water/before-contact-sheet.png)
- [After contact sheet](../assets/stage-2/phase-5-water/after-contact-sheet.png)
- [Before plant drag](../assets/stage-2/phase-5-water/before-plant-drag.gif)
- [After plant drag](../assets/stage-2/phase-5-water/after-plant-drag.gif)
- [Measurements and replay results](../assets/stage-2/phase-5-water/measurements.json)

The captures show water-tap, canopy-tap, high-tap, plant-drag, plant-swipe, night
and untouched conditions. Their histories are in the reusable tool. No fish or
plant activity is forced. The crest is intentionally quieter than a fish;
the clearest sign of water movement near vegetation is now the stems themselves.

Plant movement below isolates water by comparing each frame with the same fish
positions and time but no impulses. It does not mistake a fish swimming over
for a direct pressure response.

| Scenario | Before peak plant displacement | After |
| --- | ---: | ---: |
| Tap at grown canopy | 7.17 px | 44.91 px |
| Same x, tap near waterline | 7.17 px | 0 px |
| Drag across plants | 2.84 px | 13.85 px |
| Swipe across plants | 3.14 px | 18.87 px |

The largest tap displacement belongs to a flexible tall plant. Stiffer species
bend less. Every scenario has zero remaining impulse displacement and no live
impulses at eight seconds. The bounded gesture tests also exercise prolonged
and repeated input without growing the event lists.

## Performance comparison

Same seed, 60-second settling period, pointer histories, eight-second observation
and 800 × 480 renderer; baseline is the merged Phase 4 commit, not an estimate.

| Scenario | Avg / max damage before | Avg / max damage after | Avg rectangles before → after |
| --- | ---: | ---: | ---: |
| Untouched | 52.63% / 94.58% | 51.95% / 80.60% | 21.10 → 21.95 |
| Open-water tap | 53.33% / 94.58% | 52.55% / 94.58% | 18.66 → 19.52 |
| Canopy tap | 53.87% / 67.45% | 53.93% / 66.24% | 14.53 → 14.94 |
| High tap | 51.79% / 69.52% | 50.67% / 65.00% | 18.48 → 19.06 |
| Plant drag | 54.09% / 70.06% | 53.56% / 69.81% | 15.00 → 15.11 |
| Plant swipe | 54.69% / 74.35% | 54.56% / 74.26% | 14.99 → 14.86 |
| Night drag | 53.35% / 65.34% | 53.21% / 65.34% | 16.34 → 16.10 |

Full redraws: **zero in all runs**, before and after. Stronger canopy bending
costs 0.06 percentage points of average damage in the direct canopy tap. Other
listed interaction scenarios repaint slightly less. These are deterministic
sample comparisons, not device timing or a claim of statistical speedup.

Plant-drag peak scene objects/glyphs change from **254/1,227** to **253/1,179**;
plant-swipe from **253/1,244** to **253/1,181**. Raster crests replace glyphs, so
glyph count alone is not their cost: the swipe peaks at 256 new spans across
four impulses, covering at most 758 pixel writes including overlaps (0.20% of
the panel). The hard six-impulse cap is separately tested.

The dedicated comparison checks **567 native frames, zero pixel differences**
between incremental and full rendering, including erasure, overlap, wake reuse
and night. All background comparisons are unchanged by interaction.

## Validation and persistence

`npm run verify`: **419 tests passed**, 48,000 simulated ticks with no audit
failures, 200 malformed saves with no failures, 540 native render frames with
zero differences/escaped spans, and all 32 feeding stages within the existing
strike-gap tolerance. `git diff --check` passes.

Schema stays v2. The measured eight-second runs have identical save sizes
before/after, scenario for scenario: 20,425–20,471 bytes. No water geometry or
plant recoil is serialized. This retains the already documented Phase 3 issue:
live social memory can exceed the nominal 18 KB budget in `AGENTS.md`; this
slice adds no save fields and does not claim that separate issue is fixed.

Reproduce the comparison:

```sh
git worktree add --detach ../Fish_view-phase4 83fa51d
node tools/measure-water-response.mjs --baseline=../Fish_view-phase4 --output=.audit-output/water-response
npm run verify
```

## Remaining Phase 5 work and gate

This slice deliberately leaves sections 11.2–11.7 open: expand/validate local
bubble interactions and their investigability, substrate response, waterline
response, suspended matter, small residents, and several production-reachable
causal chains with salience/cooldown limits. Existing Phase 4 bubble deflection
and substrate bubble release remain available, but are not evidence that all
those requirements are complete. The small clipped crest near the waterline
is not a replacement for section 11.4's localized surface behavior.

| Full Phase 5 acceptance item | Result |
| --- | --- |
| Interaction visibly affects more than fish | Met for water and rooted skeletal plants |
| Effects remain local and bounded | Met for this slice |
| Environment settles naturally | Met for this slice |
| Several production-reachable environmental causal chains | Not yet demonstrated |
| No recursive event storms | This slice creates no new events; broader chains remain unbuilt |
| Global repaint has not become normal | Met, zero full redraws |
| Captures make physical cause/effect obvious without UI | Met for water/plant slice; broader environment pending |

The requested water/plant correction passes its focused checks. The complete
phase does not yet meet its broader acceptance gate.

**FAIL — Phase 5 is not complete. Do not proceed to Phase 6.**
