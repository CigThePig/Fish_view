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
- A living skeletal vegetation system with 28 data-driven species, seeded
  colonies, structural growth, three depth groups, shared current, and subtle
  touch/fish disturbance. ASCII glyphs decorate tiny parent-index skeletons;
  plants are never fixed text sprites.
- A reliable day/night arc with a warm filled night wash, dark fish silhouettes,
  continuously moving fish, and scene colours that model the nightlight directly.
  The night field is one warm hue that only loses value with depth, over a floor
  quieter than the water above it, and the arc is routed through a green
  twilight so dusk never drains to grey.
- Opaque fish: each individual carries a body of horizontal spans behind its
  strokes, so plants, water bands, and other fish stop reading straight through
  it. The body is fitted to each sprite's own artwork and to the real ink of the
  glyphs that draw it, so it hugs the fish instead of its bounding box. It covers
  the main body only: fins and the tail are left outside and keep their open
  ASCII silhouette. The silhouette stays a soft ellipse rather than squaring off
  to catch the last few pixels of a roof stroke, because the fish have to look
  like fish.
- Free-floating bitmap glyphs: individuals flex through a coherent body wave,
  school fish glide between former cells, plants bend as linked typographic
  stems, and sparse bubbles rise independently of text rows.
- An immediate deterministic touch response: every touch creates the same
  continuously expanding typographic ripple and turns the fish toward it.
- Exact portrait (`480 × 800`) and landscape (`800 × 480`) output, plus a comparison
  mode that keeps both simulations running at full school size.
- A hideable tuning panel with time acceleration up to one simulated week per
  real second.
- A deterministic [typographic motion lab](https://cigthepig.github.io/Fish_view/sprites.html)
  showing every static source sprite beside animated right- and left-facing
  poses, with phase, palette, deformation, anchor, bounds, and damage controls.
- A deterministic [skeletal plant lab](https://cigthepig.github.io/Fish_view/plants.html)
  showing all 28 species as seedlings and mature specimens, with day/night,
  orientation, size, current, disturbance, quality, bounds, damage, and bone
  overlay controls.

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

`src/sim/` and the pure `render(state)` scene composer have no DOM, canvas,
`localStorage`, clock, or other platform dependencies. The application injects
wall-clock time at startup, while `src/platform/storage.js` owns browser
persistence and offline elapsed-time calculation.

The core contracts are:

```text
tick(state, dt) -> state
render(state) -> RenderScene { width, height, background, glyphs, objects }
```

World positions remain floating point through scene composition. Each visible
ASCII character becomes an independent glyph command with continuous physical
coordinates, a bitmap scale, colour, and layer. A scene object may also carry
`fill`: opaque spans painted under its own glyphs, which is how a fish occludes
what swims behind it. Nine spans per fish keeps the whole school inside one
filled-rectangle budget an ESP32 panel driver can meet, and spans arrive snapped
to whole pixels, at the same precision the damage signature hashes and the
backend paints. The logical 40×33 and
66×20 layouts remain useful for simulation and art authoring, but no longer snap
motion or limit the physical panel to cell multiples.

The canvas backend uses the bundled 5×7 bitmap font, with lit-pixel runs
precomputed once and raster origins rounded to physical pixels for crisp output.
It compares stable scene objects, damages the previous and current bounds of
changed objects, coalesces economical overlaps, restores the procedural
background inside those rectangles, and recomposes intersecting layers. It
does not clear and redraw the complete framebuffer during ordinary animation.
Fish bodies sit inside the bounds their glyphs already damage, so opacity costs
draw calls rather than repainted area.
Day/night colours are part of the scene rather than a CSS brightness filter;
12 quantized palette stages keep slow whole-field transitions infrequent.

## Skeletal plants and ESP32 portability

Plant artwork lives in one static descriptor library. Each species is a shallow
parent-index array with segment length, rest angle, growth stage, glyph role,
and a few motion constants. The same sequential pose pass handles grasses,
ribbons, leaves, reeds, limited forks, and four uncommon decorative forms. The
aquarium deterministically composes 22 specimens in landscape and 16 in
portrait as clustered habitats with deliberate open-water gaps.

A persisted plant stores its seed, species, continuous root x, age, mature
height, depth layer, and seven seeded variation values. It never stores animated
joints. At render time the root is fixed and 5–12 possible joints are walked in
parent order; growth exposes joints and locally lengthens new segments instead
of scaling finished artwork. A mature specimen emits at most 12 glyphs. Tests
cap a mature landscape at 200 visible plant glyphs and portrait at 150; the
dense validation seed currently produces 193 and 141 respectively.

There is no soft-body solver, recursion, per-pixel plant effect, rotation, or
per-glyph collision work. Three low-frequency current samples are shared by the
garden. Each plant adds two seeded harmonics, one root-level touch calculation,
and—outside the background layer—one coarse nearest-individual disturbance.
Background poses quantize to 5 Hz while nearer plants use the aquarium's 10 Hz
cadence. A future fixed-point/LUT port can replace the small bounded set of
trigonometric calls without changing the descriptors. The normal bitmap-glyph
backend simply rounds each posed glyph to pixels.

Every specimen remains one stable scene object. Its old and new tight bounds
enter the existing dirty-rectangle compositor, and opaque fish are painted
after background/midground plants but before foreground plants. Reduced-detail
rendering can omit alternating leaf attachments while retaining the same
skeleton and species identity. In a 60-seed mature-tank sample at 10 Hz, an
average frame changed 4.7 plant objects. Plant-only damage averaged 4.7% of the
landscape framebuffer and 10.4% of portrait; whole-scene damage averaged 26.0%
and 32.5% respectively.

## Source layout

```text
src/art/       extracted art data and glyph-aware mirroring
src/sim/       seeded state, behaviors, boids, skeletal plant growth and pose
src/render/    scene composition, plant glyph mapping, palette, font, damage
src/platform/  browser-only persistence adapter
tests/         deterministic simulation, art, persistence, and renderer checks
```

## Artwork and license

Fish artwork comes from `asciiquarium` 1.1 by Kirk Baucom, with most ASCII art
credited to Joan Stark. See `THIRD_PARTY_NOTICES.md`. This repository is
licensed under GPL v2 or later; see `LICENSE`.
