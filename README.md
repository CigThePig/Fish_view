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
- A real depth axis. The tank used to have a vertical axis and nothing else, so
  every fish was one size, in one set of colours, on one plane. Distance from
  the glass is now its own value: near fish are drawn larger and crisper, far
  fish smaller and mixed towards the water they are seen through, the far end of
  the school passes behind the midground weed, the three plant depth groups are
  really separated instead of being three shades of green, sunlight falls
  through the water in tilted shafts that lean with the sun, the floor recedes
  towards the water it meets, and the left and right edges fall away so the
  water reads as a volume with a front pane.
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

Depth is continuous in `[0, 1]`, where 0 is the far wall and 1 is the glass.
Geometry reads it continuously, so a fish that drifts nearer grows smoothly.
Colour reads it through five quantized lanes whose tables - masks, school
colours, and one body companion per water band - the palette builds once per
day/night stage, exactly like the 12 palette stages themselves. Atmospheric
perspective therefore costs one array index per fish per frame rather than a
colour mix per glyph. Vertical position and distance stay independent: where a
fish swims in the water column still picks its band companion, and how far away
it is picks how far that companion has already faded into the water.

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

Sun shafts, the receding floor, and the edge falloff are background rectangles,
not scene objects or per-pixel effects, so they cost plain `fillRect` calls
inside damage regions the compositor was already going to repaint. A noon
landscape background is 6 water bands, 95 shaft rectangles, 60 edge
rectangles, 4 floor slabs, and the existing 132 terrain columns; portrait is
70 shafts against 80 terrain columns, and a deep-night background keeps only
21 and 14 shafts respectively. After overlap culling an ordinary 10 fps frame
asks for about 117 of those in landscape and 99 in portrait, worst observed 169
and 139 - well under the dithered band transitions, which remain the most
expensive thing in the background. The shafts lean with the sun on their own
two-hour stage clock, so they add 12 whole-field repaints a simulated day beside
the 12 the palette already spends, and none during ordinary animation. Measured
over 200 frames at 10 fps, damage is 22.7% of the landscape framebuffer and
35.1% of portrait, which is where it was before the depth axis existed.

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

The three depth groups are now separated by size as well as by colour: a
foreground specimen draws at 1.12 and a background one at 0.76, with each
species mixed towards the water on the same fog ramp as the fish. The
background floor is deliberate rather than tuned by eye - a stem is a column of
glyphs, and much below 0.75 the glyphs stop touching and a distant reed reads as
a dashed line.

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
src/render/    scene composition, depth lanes, plant glyph mapping, palette,
               font, damage
src/platform/  browser-only persistence adapter
tests/         deterministic simulation, art, persistence, and renderer checks
```

## Artwork and license

Fish artwork comes from `asciiquarium` 1.1 by Kirk Baucom, with most ASCII art
credited to Joan Stark. See `THIRD_PARTY_NOTICES.md`. This repository is
licensed under GPL v2 or later; see `LICENSE`.
