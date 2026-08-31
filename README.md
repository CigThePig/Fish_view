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
- Sunlight that comes in through the waves. Each shaft samples the swell at its
  own entry column and takes three things from it: the height of the water
  there slides the entry point along the sun's lean, the slope of that facet
  bends the beam under it, and the curvature of the facet focuses or spreads
  it. Two of the three scale with the lean, so the coupling changes character
  across the day - at noon a passing crest mostly pinches a shaft narrower and
  brighter, and under a low sun the same crest also swings it sideways and
  lights the flanks turned towards the light more than the flanks turned away.
  It fades out with depth, the way real caustics do.
- A real water surface. The air/water boundary used to be the straight top edge
  of the first water band with a handful of `~` glyphs floating above it. It is
  now a travelling swell of three unrelated wavelengths, painted as narrow
  columns that carry water up over every crest and open the air behind every
  trough, with a lit meniscus riding the cut that brightens where the crest
  stands highest. The ripple glyphs sit on that same swell and drift along it,
  so the top of the tank reads as moving water rather than as a ruled line.
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

The receding floor and the edge falloff are background rectangles, and the sun
shafts are scene objects; none of them is a per-pixel effect, so all of them
cost plain `fillRect` calls inside damage regions the compositor was already
going to repaint. A noon landscape frame is 6 water bands, 60 edge rectangles,
4 floor slabs, the existing 132 terrain columns, and 95 shaft rectangles;
portrait is 70 shafts against 80 terrain columns, and a deep night keeps only
20 and 14 shafts respectively. Worst frame observed across the test seeds is
288 of them in landscape, against 252 before the shafts started moving - the
increase is a shaft damaging the region its own rectangles sit in, which is
what it costs for the swell to be able to move one. The dithered band
transitions remain the most expensive thing in the background.

The sun's lean is still quantized to two-hour stages, but it no longer restages
the field at all: the shafts left the background when they started following
the water, so moving the sun now rebuilds four scene objects instead of
repainting the tank, and the 12 whole-field repaints a simulated day that the
sun used to spend are gone. Measured over 200 frames at 10 fps, damage is 27.3%
of the landscape framebuffer and 40.2% of portrait, against 20.9% and 34.7%
before the water surface started moving. Two things account for the difference,
both of them the price of the boundary being water instead of the edge of a
band: the surface is re-cut across the full width every frame, about 15 rows of
pixels, and the head of one shaft repaints each frame. Only the head - the
swell's reach down the column is finite, and below it a shaft is exactly the
shaft it would have been with no waves at all, so the still half of the water
never enters a damage rectangle.

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
of scaling finished artwork. Those joints are the simulation skeleton only.
They define topology, growth, sway, current response, and disturbance, but they
are deliberately too sparse to dictate the final number of visible characters.

Rendering is a second, still bounded resolution. Each posed structural bone is
measured in physical panel pixels after the plant's depth scale has been applied.
A short bone keeps one structural glyph. A bone whose scaled 5×7 ink would leave
a visible hole receives a second attachment sampled directly between its current
posed parent and child. Explicit decorations such as leaves, tips, beads,
lanterns, and bells remain one authored glyph at their endpoint; an authored
structural marker such as `Y` is likewise emitted once at the joint while stem
attachments cover the incoming bone. Attachments have no stored animation or
physics state. Their coordinates are derived from the posed bone every render,
so growth and motion remain owned entirely by the sparse skeleton.

The continuity decision uses the bitmap font's real 10×21 lit-pixel envelope,
not a guessed logical row count. The regression contract allows at most 12
physical pixels of uncovered distance along a structural segment. Slight
structural scaling remains secondary polish and is capped at 1.35 rather than
being stretched into a vector-like bar. When a long first bone needs two
attachments they begin near the buried root and continue up the segment, keeping
vegetation visibly planted without reopening the old first-to-second-glyph gap.

The three depth groups stay separated by size as well as by colour: a foreground
specimen draws around 1.12 and a background one around 0.76, with seeded spread,
while each species is mixed towards the water on the same fog ramp as the fish.
The smaller background glyphs therefore request denser structural sampling only
when their reduced physical ink actually needs it. Depth remains visually useful
instead of being flattened back to scale 1.0 merely to hide sparse stems.

`activeJoints` in render diagnostics still means active simulated skeletal
joints. `glyphs` now means actual emitted render glyphs, and is intentionally
allowed to be larger. Diagnostics also expose structural and decorative
attachment counts plus the maximum attachments emitted by one segment. The
algorithm is statically bounded at two sampled stem glyphs per structural bone,
with one additional authored structural marker possible at the endpoint. With a
12-joint simulation ceiling that gives an absolute renderer ceiling of 36 glyphs
per specimen, though the measured mature scenes stay well below it.

Five mature deterministic seeds (`5`, `29`, `83`, `147`, and `818`) measured at
10 fps produce 186–196 plant glyphs in landscape, averaging 189, with a maximum
of 14 glyphs on one specimen. Portrait produces 166–182, averaging 176, with a
maximum specimen of 24 in the physically taller stress cases. The regression
budgets remain deliberately above those measurements at 260 landscape glyphs
and 210 portrait glyphs so normal seeded variation has room without making the
limit meaningless. Before segment sampling the same five seeds produced
182–193 glyphs in landscape, averaging 184.4, and 128–141 in portrait, averaging
133.2. The larger portrait increase is the intended cost of covering long bones
that previously appeared as dashed columns.

There is no soft-body solver, recursion, per-pixel plant effect, rotation, or
per-glyph collision work. Three low-frequency current samples are shared by the
garden. Each plant adds two seeded harmonics, one root-level touch calculation,
and, outside the background layer, one coarse nearest-individual disturbance.
Background poses quantize to 5 Hz while nearer plants use the aquarium's 10 Hz
cadence. A future fixed-point/LUT port can replace the small bounded set of
trigonometric calls without changing the descriptors. The normal bitmap-glyph
backend simply rounds each sampled glyph to pixels.

Every specimen remains one stable scene object. Its old and new tight bounds
enter the existing dirty-rectangle compositor, and opaque fish are painted
after background/midground plants but before foreground plants. Reduced-detail
rendering can omit alternating leaf attachments while retaining the same
skeleton and species identity. Across the same five mature seeds, 200 frames per
seed and orientation, sampled attachments raise average whole-scene damage from
46.77% to 49.49% in landscape and from 64.70% to 68.18% in portrait. Average
dirty-rectangle counts move from 30.40 to 27.99 in landscape and from 14.78 to
13.17 in portrait. None of the 1,000 measured 10 fps transitions in either
orientation requests a full-screen repaint. The repair therefore costs a modest
number of simple bitmap draws without multiplying simulation complexity or
turning plant motion into full-frame redraws.

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
