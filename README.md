# Fish View

Fish View is the Phase 0 web prototype for a slow, persistent ASCII aquarium
that can eventually live on a 7-inch ESP32 display and double as a bedroom
nightlight.

[Open the GitHub Pages build](https://cigthepig.github.io/Fish_view/)

This is deliberately not a port of `asciiquarium`'s screensaver loop. Its
small-fish artwork is used as a sprite sheet inside a deterministic,
persistent simulation.

## What is in Phase 0

- A 25–40 fish boids school with live tuning for separation, alignment,
  cohesion, boundary pull, depth preference, and speed.
- Six persistent individual fish with seeded traits, changing drives,
  utility-selected behavior, interaction history, and local persistence.
- Slow plant growth as the long-horizon visual change signal.
- A reliable day/night arc with a warm filled night wash, dark fish silhouettes,
  continuously moving fish, and a smoothly ramped display brightness.
- An immediate deterministic touch response: every touch creates the same
  visible ripple and turns the fish toward it.
- Live portrait (`40 × 33`) and landscape (`66 × 20`) views, plus a comparison
  mode that keeps both simulations running at full school size.
- A hideable tuning panel with time acceleration up to one simulated week per
  real second.
- A visual [sprite-sheet test page](https://cigthepig.github.io/Fish_view/sprites.html)
  showing each extracted source sprite beside its generated mirror.

No fish can die, become ill, disappear as a penalty, or be lost through
neglect. Phase 0 does not choose the final orientation, decide the Phase 1
language, or decide whether the individual-fish layer survives evaluation.

## Run locally

The site has no runtime dependencies and no build step. Node 20 or later is
only used for the local server and tests.

```sh
npm test
npm start
```

Then open `http://localhost:4173`. A stable alternate seed can be inspected
with `?seed=anything`. Use `?orientation=portrait` or
`?orientation=compare` to choose the initial view.

Because every source file is plain HTML, CSS, or JavaScript, small changes can
also be made directly in GitHub's mobile editor. Every push to `main` runs the
test suite and deploys the repository through the Pages workflow in
`.github/workflows/pages.yml`.

## Architecture boundary

`src/sim/` and the pure `render(state)` function have no DOM, canvas,
`localStorage`, clock, or other platform dependencies. The application injects
wall-clock time at startup, while `src/platform/storage.js` owns browser
persistence and offline elapsed-time calculation.

The core contracts are:

```text
tick(state, dt) -> state
render(state) -> CellGrid { char, fg, bg }
```

World positions remain floating point until render time. The canvas renderer
uses a bundled 5×7 bitmap font in 12×24 cells and compares consecutive cell
grids so it only redraws changed cells. The night wash enters through a 4×4
ordered pattern, spreading palette transitions across small cell batches
instead of forcing a full-frame redraw.

## Source layout

```text
src/art/       extracted art data and glyph-aware mirroring
src/sim/       seeded state creation, behaviors, boids, growth, persistence model
src/render/    pure cell-grid composition, palette, bitmap font, dirty renderer
src/platform/  browser-only persistence adapter
tests/         deterministic simulation, art, persistence, and renderer checks
```

## Artwork and license

Fish artwork comes from `asciiquarium` 1.1 by Kirk Baucom, with most ASCII art
credited to Joan Stark. See `THIRD_PARTY_NOTICES.md`. This repository is
licensed under GPL v2 or later; see `LICENSE`.

