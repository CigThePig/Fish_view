# Fish View

Fish View is an **800 × 480 landscape ASCII aquarium** for an ESP32-S3 bedroom display. It starts with a hatchling and slowly grows over months and years. The browser implementation is its visual reference and development environment.

[Open Fish View](https://cigthepig.github.io/Fish_view/)

## One aquarium

`src/sim/config.js` exports one immutable `DISPLAY`: 800 × 480 pixels, 66 × 20 logical cells. Startup creates one state and one canvas renderer. The same state is ticked, touched, restored, saved and reset. Viewport dimensions never enter simulation initialization or world generation.

Portrait aquarium support and Compare mode have been removed. Obsolete `?orientation=portrait`, `?orientation=landscape` and `?orientation=compare` parameters are ignored. `?seed=anything` still selects a deterministic aquarium.

## Presentation and interaction

The aquarium opens directly with no toolbar, captions, border or development chrome. CSS fits the largest complete 5:3 rectangle inside the dynamic viewport and safe-area insets, centered against a dark background. The backing canvas stays 800 × 480. Upscaling uses pixelated interpolation; fitting uses the full available area even at fractional scales.

A portrait phone shows the same horizontal scene scaled down, with unused space above and below. Resizing or rotating changes only presentation: it cannot reset the aquarium, change its logical dimensions or migrate its history. Pointer coordinates are mapped through the displayed canvas bounds to the 66 × 20 world.

## Developer controls

Tap the aquarium's **upper-right corner three times within three seconds**. There is no visible marker. The region is 64 × 64 canonical pixels, with a 32 CSS-pixel minimum on small screens, bounded to one quarter of each displayed dimension. It belongs to the aquarium, not the browser window.

The rolling window counts completed primary-pointer taps of at most 600 ms, with at most 12 CSS pixels of movement. Two taps do nothing. Outside taps, cancellation, dragging or holding reset the sequence. The corner is reserved from fish reactions. Normal touches elsewhere still reach the aquarium immediately.

For keyboard access, Tab to the aquarium and press **Enter** or **Space**. The normal page still shows no button or hint.

Close the drawer with **Close** or **Escape**. Focus returns to the aquarium. It scrolls independently on mobile. Settings, time acceleration, time of day, renderer metrics, personality, growth, history, reset, optional browser fullscreen and links to all three labs remain available. Browser fullscreen is optional; viewport fitting never depends on it.

- `behaviors.html`: behavior choreography, tuning, deterministic scenarios and diagnostics.
- `sprites.html`: fish artwork, body geometry and motion.
- `plants.html`: skeletal plant specimens, quality and diagnostics.

The developer UI can be responsive. The aquarium world cannot.

## Persistence

One save per deterministic seed lives at `fish-view:aquarium:<numeric-seed>`. New payloads have no orientation field. When that key is absent, the loader accepts `fish-view:phase-0:<seed>:landscape`, restores its biology and history and applies offline elapsed time once. It writes the canonical save before removing either old prototype key. A failed write preserves the old save. A valid canonical save takes precedence. Reset clears the canonical and old keys for that seed, so an old aquarium cannot reappear.

No portrait save is imported. Existing landscape v1/v2 biology remains supported without adding another save schema or maintaining duplicate worlds.

## Stage 2

The aquarium is roughly halfway through its intended development. The second
half is [Stage 2](Fish-View-Stage-2-Interaction-Readability-Development-Plan.md):
the relationship layer between the viewer and the aquarium, and a readability
pass that lets a child tell what the fish are doing by watching them. It adds no
UI. Phase status, the pre-Stage-2 [baseline](docs/stage-2/baseline-2026-09-09.md)
and phase reports live in [`docs/stage-2/`](docs/stage-2/README.md).

Anyone — or anything — working in this repository should read
[`AGENTS.md`](AGENTS.md) first. It carries the product invariants, the
architecture map and the commands.

## Development and validation

Requires Node 20 or later.

```sh
npm ci
npm start
npm test
npm run verify                    # tests plus every audit the CI gate runs
npm run build:pages
npm run audit:simulation
npm run audit:persistence -- --cases=200
npm run audit:render
npm run measure:feeding
npm run measure:stage2-baseline   # tap synchronisation, damage and save size
npm run capture:behaviors -- --scenario bubble-investigate --scale 1 --gif
npm run capture:depth
npm run capture:living
```

Open `http://localhost:4173`. The viewport inspection harness at `tools/viewport-lab.html` embeds the real app at representative device sizes without adding production routes or changing world coordinates.

GitHub Pages stages the same application with `tools/build-pages.mjs`. The build places every stylesheet and the entire module tree under one content-fingerprinted asset directory, preventing new pages from importing old cached dependencies. All module, stylesheet and lab links are relative, including under `/Fish_view/`. The main-branch Pages workflow runs the tests before publishing. There is no separate Pages implementation.

## Simulation and artwork

The aquarium retains seeded personalities, learned familiarity, deliberate fish activities, size-aware feeding, fish growth, fortnightly arrivals, plant propagation, depth, snails, shrimp, drifting tufts and night lighting. Simulation changes are deliberately outside this architecture migration.

The renderer composes native pixel artwork and uses dirty rectangles at the existing 10 Hz simulation cadence. Viewport fitting adds no per-frame layout reads or resize observer. Touch and gesture mapping read bounds only during input.

See [living habitat](docs/living-aquarium.md), [habitat depth](docs/habitat-depth.md), and [bubbles](docs/living-bubbles.md) for subsystem descriptions. The [retired prototype notes](docs/history/prototype-notes.md), [original brief](docs/phase-0-brief.md) and dated audits are historical evidence, not active orientation requirements.

## License

GPL-2.0-or-later. See [LICENSE](LICENSE) and [third-party notices](THIRD_PARTY_NOTICES.md).
