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
  utility-selected behavior, interaction history, and local persistence. Their
  body posture now exposes that behavior: meaningful climbs and dives ease into
  bounded vertical pitch, while tiny velocity noise leaves them nearly level.
- Those six fish now have seed-derived, deliberately accented interests beneath
  their broad temperament. A bounded real-time activity layer turns explore into
  open-water wandering, plant inspection/weaving, bubble pursuit, or the existing
  surface inspection; social behavior can follow the anonymous school, follow a
  persistent fish, cruise with a familiar companion, or briefly play chase; rest
  can settle beside suitable foreground vegetation. No labels, icons, names, or
  meters appear over the aquarium: identity is expressed only through repeated
  movement choices and preferred places.
- Persistent fish learn at most two positive familiarities from actual time spent
  visibly near another stable fish seed. Familiarity feeds later companion choice,
  while social need relief and sociability drift now require real physical contact
  with the school or a companion instead of merely selecting the word `social`.
- Substrate-aware foraging. Eligible individuals approach the real deterministic
  terrain contour, slow into a lateral search, carry a deliberate nose-down
  bias, make small seeded peck/dip motions, and kick up a sparse 1-4 glyph puff.
  Hunger relief begins only after the fish actually reaches that search zone.
  The first three permanently visible mid-water individuals do not select forage,
  which keeps the visibility invariant without phantom feeding above the floor.
- Curious exploration can occasionally become a brief surface inspection using
  the same pure moving-water helper as the renderer. Fish climb nose-up, slow
  below the actual swell, then return to ordinary exploration.
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
  poses, with phase, pitch intent (-35°..+35°), turn compression, palette, deformation,
  anchor, bounds, damage, and live body-profile controls.
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
coordinates, a bitmap scale, colour, and layer. Fish pitch deliberately does not
rotate that whole coordinate plane: doing so left every bitmap glyph upright while
scattering the authored drawing diagonally. Instead each of the six fish has a
tiny strong-pitch pose table. The table supplies a hand-tuned rise for each source
column and a much smaller opposing lean for each source row, expressed in physical
cell-width units. Continuous simulation pitch interpolates from the exact level art
towards those poses; a +/-30 degree intent reads as roughly a 14 degree typographic
climb or dive, and the renderer saturates there even though simulation state remains
bounded to +/-32 degrees. This keeps neighbouring marks knitted together while
still making vertical travel obvious. Glyph bitmaps themselves remain upright and
crisp, positive pitch always means nose-down after either facing is applied, and
physical cell-aspect conversion keeps the cue consistent in portrait, landscape,
and the motion lab.

The opaque body passes through that exact authored pose. Its nine calibrated source
slices become nine axis-aligned bounding rectangles around the gently skewed slice
quadrilaterals, preserving the ESP32-friendly fillRect budget instead of adding
polygon rotation or a per-pixel mask. A level pitch takes the original integer
geometry path exactly, so existing profile calibration remains unchanged. The two
rear slices trim only their trailing-side bounding-box excess during pitch so the
open ASCII tail is not swallowed at the most compressed turn pose.

Phase 1 keeps the dirty-rectangle cost effectively flat. Over the repeatable 200-frame
10 fps measurement, current `main` averaged 27.45% framebuffer damage in landscape
and 37.74% in portrait; this branch averages 27.51% and 37.94% respectively. The
landscape maxima are 44.61% on `main` and 47.02% here, while portrait remains 75.24%
on both. Forced forage measures 27.44% average / 52.50% max in landscape and 34.63%
average / 56.46% max in portrait. Every scenario records zero full-frame redraws,
and the maximum individual body fill count remains exactly nine rectangles before
and after the change.

Fish/substrate clearance stays on the simulation side. A single shared maximum
individual visual scale is exposed from sim/config.js and the simulation uses a
conservative logical envelope for the strongest permitted pitch; it never imports
render/depth.js. Forage and surface targets then come from substrateSurfaceY()
and waterSurfaceY() respectively.

## Phase 2 personality and activity architecture

The original five broad behaviors remain the biological explanation for motion:
`cruise`, `explore`, `social`, `forage`, and `rest`. Hunger, energy, social need,
daylight, and the original broad traits still decide which one wins. Phase 2 adds
a smaller intention immediately below it. In other words, behavior answers
"why?" while activity answers "what specifically?" A hungry fish still forages;
substrate affinity only changes the breadth and rhythm of its real terrain search.
A tired bubble lover still rests. Touch remains an unconditional, immediate
override for every fish and only uses glass affinity to vary speed and standoff.

Drives are clamped to a band (`DRIVE_MINIMUM`/`DRIVE_MAXIMUM`) so a fish is never
perfectly satisfied and never starves to death, which means a drive resting
against the ceiling can no longer express that its need is still growing. Once
hunger reaches that ceiling, forage utility plateaus, and an equally saturated
social drive can outbid it indefinitely — the fish keeps choosing company and
never eats again. Hunger past a comfort point therefore damps the behaviors that
compete with feeding for the same active time (cruise, explore, social) rather
than inflating forage past everything, which would also outrank rest and leave
the fish exhausted. The damping applies only where foraging is reachable: the
protected mid-water cast never forages, so suppressing its alternatives would
buy nothing and simply park it in a permanent rest.

Broad traits (`boldness`, `sociability`, `activity`, `preferredDepth`, and
`curiosity`) remain the temperament model. The specific bubble, plant, school,
glass, wander, surface, shelter, and substrate affinities are regenerated from
the stable fish seed. A rank-and-accent pass gives every fish two or three strong
interests and suppresses two weak ones, instead of hoping six narrow random ranges
look distinct. The strongest accents are selected from activities every member
of the cast can perform, so Phase 1's first three protected mid-water fish are
never defined by inaccessible surface or substrate quirks. Affinities are never
saved and interaction history never rerolls them.

Activities use bounded deterministic utility: affinity and traits combine with
environmental opportunity, distance, continuity, social proof, target crowding,
and learned familiarity. Each activity has a seeded minimum and maximum real-time
dwell. A valid plant, bubble, or companion target is retained rather than rescanned
for a new winner every 100 ms. The stable identity stored in transient intention
is always a fish seed, plant seed, or deterministic bubble ID, never an array
index or object reference. Missing plants, popped bubbles, self/missing companions,
top-level behavior changes, and touch all have explicit deterministic fallback.
This keeps week-per-second biology visually coherent even though broad intent can
advance quickly.

Plant intelligence uses only pure biological records: root position, current
height, species growth state, layer, age, and seed. A stable fish/plant preference
causes repeat visits, a short score derived around a newly revealed growth stage
adds novelty, and foreground height gates shelter. The AI never imports or searches
the rendered bone/glyph skeleton. Coarse anchors are enough for inspection and
weaving, while the existing fish disturbance and foreground compositing provide
the secondary visual feedback for free.

Bubble positions now have one source of truth in `src/sim/bubbles.js`. That module
owns emitter layout, stable IDs, lifecycle, rise/pop position, current, depth-speed,
fish disturbance, exhalations, and touch bursts as bounded world records. The
renderer maps those same records to glyphs, colour, fog, scale, and pop artwork.
The tiny continuous distance trajectories shared by fish and bubbles moved to the
neutral `src/sim/depth.js`; simulation never imports `src/render/depth.js`.
Consequently a bubble-oriented fish cannot chase a mathematical bubble drawn in a
different place.

Learned social state is deliberately smaller than a relationship graph. Each fish
remembers at most two `{ seed, familiarity }` entries in `[0, 1]`. A bounded pair
post-pass over the current 5–8 fish grows those entries from actual proximity,
with extra weight for deliberate following, companion cruising, or resting close.
Compatibility is symmetric and seed-derived; familiarity is learned and saved.
There is no dislike, decay penalty, dominance, fear, health effect, or offline fake
trajectory replay. A missing, duplicate, malformed, non-finite, or self relationship
is discarded during restore.

Persistence remains version 2. Broad behavior, motion, drives, visual pose, touch
history, trait drift, and bounded familiarity are durable. Affinities and pair
compatibility are derived. Current bubble/plant/fish targets, chase state, and
activity clocks are transient and safely reconstructed after power loss, so an old
Phase 1 save simply starts with empty familiarity. The hidden tuning panel includes
a developer-only per-fish line showing seed, behavior/activity, target, top
affinities, and strongest familiarity; none of it enters the aquarium view.

The repeatable 200-frame, 10 fps measurement compares the Phase 1 merge against
Phase 2 with the same seed and forced representative opportunities:

| Orientation / scenario | Phase 1 avg damage | Phase 2 avg damage | Phase 1 max | Phase 2 max | Phase 2 avg rects | Max bubbles |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Landscape ordinary | 27.51% | 27.75% | 47.02% | 41.59% | 29.2 | 2 |
| Portrait ordinary | 37.94% | 33.92% | 75.24% | 67.25% | 13.7 | 2 |
| Landscape bubble-heavy | 28.74% | 25.95% | 43.24% | 55.82% | 38.9 | 23 |
| Portrait bubble-heavy | 27.69% | 20.75% | 72.15% | 49.81% | 41.2 | 12 |
| Landscape plant/social | 35.61% | 37.64% | 57.94% | 76.95% | 26.6 | 2 |
| Portrait plant/social | 60.45% | 63.61% | 96.00% | 96.00% | 13.2 | 2 |

Every one of the 2,400 measured transitions records zero full redraws and every
individual stays at the nine-fill body ceiling. The slowest observed Phase 2
`tick + render` average in the final Node measurement was 3.48 ms; that is a relative
development measurement rather than an ESP32 benchmark, but remains comfortably
inside the prototype's 100 ms frame interval. `tools/measure-phase2.mjs` reproduces
the ordinary, bubble-heavy, and plant/social scenarios against any supplied tree.

A scene object may also carry
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

Rendering is a second, still bounded resolution, and its unit is the bone rather
than the joint. A bone is a length, so every posed bone is inked along its whole
span: samples are laid from the parent joint to the child joint at a spacing
taken from the glyph's own ink, and the last sample always lands exactly on the
child joint. That final sample is the one that carries the species' authored ink
- a fork's `Y`, a lantern's `*`, a leaf's blade - while the samples before it are
the stroke leading into it. Because every bone ends on its own joint, and the
next bone starts from that same joint, the chain has no seam where bones meet.
Leaves, tips, beads, lanterns, and bells are bones like any other and are covered
the same way; treating them as single marks painted at the far end of their own
bone is what previously left a mature portrait fan grass with its blades hanging
80 physical pixels clear of the stem they grow from. Attachments have no stored
animation or physics state. Their coordinates are derived from the posed bone
every render, so growth and motion remain owned entirely by the sparse skeleton.

Spacing uses each glyph's real lit-pixel extent, not the font's maximum envelope:
a hyphen is ten columns by three rows where a pipe is two by twenty-one, and
treating them alike is what let a ladder leaf's blade drift off its stem. It also
uses the distance that ink can actually bridge along the bone's direction, which
is set by whichever axis of the ink box runs out first rather than by the sum of
the two projections. A pipe carries a vertical bone a long way and a diagonal one
barely at all; crediting it with the sideways reach it never paints is what left
pearl sprout's leaf brackets detached under a strong current. The step into each
joint is measured against the pair of glyphs that step joins, so a bone ending in
thin ink is subdivided where a bone ending in tall ink is not.

The regression contract is measured against the ink the renderer actually paints.
The continuity test rasterizes each specimen through the same shared glyph
rasterizer the canvas backend uses and walks every posed bone looking for a
stretch with no lit pixel within three physical pixels; it allows at most six.
Across all species, both orientations, three sizes, three current strengths, and
the full growth range, the worst measured stretch is three pixels. Arithmetic
about where glyphs were placed cannot satisfy that test - only ink can.

That shared rasterizer also fixed a defect visible on every glyph in the scene,
not only on plants. Each lit source pixel had its origin and its size rounded
independently, so at any scale above 1 the three-pixel-tall source rows drifted
apart and opened one-pixel seams inside a single character. Rounding the far edge
instead makes neighbouring rows and columns tile exactly, and stems that were
already sampled continuously stopped looking dashed.

The three depth groups stay separated by size as well as by colour: a foreground
specimen draws around 1.12 and a background one around 0.76, with seeded spread,
while each species is mixed towards the water on the same fog ramp as the fish.
The smaller background glyphs therefore request denser sampling only when their
reduced physical ink actually needs it. Depth remains visually useful instead of
being flattened back to scale 1.0 merely to hide sparse stems.

`activeJoints` in render diagnostics still means active simulated skeletal
joints. `glyphs` means actual emitted render glyphs, and is intentionally allowed
to be larger. Diagnostics expose `jointAttachments` - the glyphs sitting on
joints, which equals the active joint count exactly - and `fillerAttachments`,
everything painted along the bones between them, plus the maximum attachments
emitted by one bone. The algorithm is statically bounded at eight samples per
bone, which with the 12-joint simulation ceiling gives an absolute renderer
ceiling of 96 glyphs per specimen; the measured mature scenes stay well below it.

Five mature deterministic seeds (`5`, `29`, `83`, `147`, and `818`) measured at
10 fps produce 431–491 plant glyphs in landscape, averaging 468, with a maximum
of 40 glyphs on one specimen. Portrait produces 546–556, averaging 546, with a
maximum specimen of 71 in the physically taller stress cases. Before continuous
bone coverage the same seeds produced 186–196 in landscape and 166–182 in
portrait. The regression budgets sit above the measurements at 520 landscape and
560 portrait so normal seeded variation has room without making the limit
meaningless.

Roughly two and a half times the glyphs is the honest cost, and it is paid in
draw calls rather than in repainted pixels. Whole-scene damage over the same
sample actually fell, from 49.5% to 44.0% average in landscape and from 68.2% to
65.7% in portrait, with no full redraws in either: continuous ink clusters into
tighter, more stable object bounds than scattered marks did, so the dirty
rectangles it produces are smaller even though there are more glyphs inside them.

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
