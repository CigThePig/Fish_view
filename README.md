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
  bias, perform uneven clusters of several-pixel peck/dip motions, and kick up a
  sparse 2-5 glyph puff synchronized to contact.
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
- An aquarium that accumulates a history. Over weeks and months a seventh and
  then an eighth persistent fish swims in from a water edge, mature plants
  establish nearby shoots so colonies visibly widen, an unusual plant comes up
  long after the tank was set up, and rare species light their tips for a few
  days every several weeks. All of it is seed-derived, resolved from simulated
  aquarium age, and delivered whether or not the device was running at the time.
  There is no unlock screen, notification, calendar, achievement, progress
  meter, or chore anywhere in it: the history is only what is now living inside
  the tank.
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
- A deterministic [behaviour choreography lab](https://cigthepig.github.io/Fish_view/behaviors.html)
  that forces every major activity through the production simulation and renderer
  in either orientation, with phase, speed, pitch, spacing, and loop diagnostics
  kept outside the aquarium canvas.
- A deterministic [skeletal plant lab](https://cigthepig.github.io/Fish_view/plants.html)
  showing all 28 species as seedlings and mature specimens, with day/night,
  orientation, size, current, disturbance, quality, bounds, damage, and bone
  overlay controls.

No fish or plant can die, become ill, disappear as a penalty, or be lost through
neglect, and time away from the aquarium is never punished.

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

### Behaviour readability workflow

The choreography lab is backed by a repeatable capture tool that runs the real
scene composer, bitmap glyph renderer, body fills, depth ordering, and
dirty-rectangle canvas renderer without a browser. It writes deterministic
landscape and portrait contact sheets plus a machine-readable snapshot manifest:

```sh
npm install
npm run capture:behaviors
```

Captures go to the ignored `.behavior-captures/` directory. Narrow a tuning pass
to one activity, keep native resolution, or also emit an animated loop with:

```sh
npm run capture:behaviors -- --scenario bubble-investigate --orientation portrait --scale 1 --gif
```

`@napi-rs/canvas` is development-only; the aquarium and GitHub Pages build still
have no runtime dependency or build step.

## The tuning labs

Two developer pages exist to author numbers rather than to demonstrate them.
Both are laid out the same way: the thing being judged and the controls that
shape it stay on screen together, so a tuning pass never scrolls between a
slider and its result, and both print their values back out as source that can
be pasted straight into the table it came from.

### Typographic motion lab — `sprites.html`

Sculpts the opaque body that sits behind a fish's ASCII strokes, **one life
stage at a time**. The roster on the left is a picker: every species lists its
whole growth sequence, youngest first, and clicking any stage loads it into the
pinned workbench on the right, where it is drawn static, animated right, and
animated left directly above the six profile sliders. Switching species keeps
the life stage selected, so two juveniles can be compared in one click.

The values live in `src/render/body-profiles.js` in two frozen tables:
`ADULT_BODY_PROFILES`, keyed by species, and `GROWTH_STAGE_BODY_PROFILES`, keyed
by the stage sprite id (`"round-fin:juvenile"`). The renderer reads one flat
lookup across both, because an adult and a growth stage reach their profile the
same way. Every stage entry starts at the shared default, which is exactly what
the renderer used for a growth stage before the entries existed: adding them
changed nothing on screen, it only made the geometry addressable. A fry is
marked `body: false`, has no opaque body at all, and so has no profile - the lab
says so rather than offering dead sliders.

Copy prints the selected stage, the selected fish's whole sequence, or every
profile in the aquarium, grouped under the table each entry belongs to.

### Behaviour choreography lab — `behaviors.html`

Runs the production simulation and renderer on a forced activity, with every
tunable number of that activity beside the tank. Moving a slider changes the
running scene immediately; nothing is restarted and no motion is faked.

The numbers live in `src/sim/choreography-tuning.js` in two tables:

```text
STEERING_PROFILES  how the steering controller answers a target - response,
                   speed ceilings, approach radius, how it arrives - keyed by
                   activity, and by "activity:phase" for the short-lived
                   variants an activity switches into
SCENE_TUNING       the distances, speeds and rotations that shape the target
                   itself, keyed by activity
```

A phase profile such as `"playful-chase:break"` or `"substrate-search:graze"`
layers over its activity's profile rather than over the controller default, so
it lists only what it changes. The lab shows an activity's own profile and every
phase profile that belongs to it, and prints each one back as the fields it
actually changes - which reproduces the authored entries exactly when nothing is
tuned.

Scene tuning is where the shape of a behaviour lives. Bottom feeding, for
instance, exposes its graze rotation and peck rotation in degrees, how close the
belly may come to the substrate crest, how deep a strike drives the fish, and
the speeds of the descent and the creep. A chase exposes both fish: the chaser's
approach and pursuit speeds and its lunge, and the evader's burst speed and how
hard proximity panics it, because a chase is read from the gap between two fish
rather than from how fast either one travels.

Overrides ride on the state being ticked (`state.choreographyTuning`) rather
than in a module-level register, so `tick(state, dt)` stays a pure function of
the state it is handed and a lab session cannot leak tuning into the aquarium.
Production never sets the field: `steeringProfile()` and `sceneTuning()` hand
back the authored frozen object itself when no override is present.

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

Swimming clearance and grazing clearance are deliberately different shapes, and
they are measured to different parts of the fish. A fish crossing open water
reserves the box that bounds its artwork, which is the right answer for "how
much room does this need". A fish working the substrate is measured to its
**mouth**, because that is what it eats with and what the puff of silt a strike
lifts is drawn from.

That distinction is the whole of bottom feeding. On a one-row fry the mouth *is*
the lowest ink, so a fry always fed correctly. On a five-row adult the belly fin
hangs better than a row below the nose, so parking the fish by its lowest ink
left its mouth in open water with its own debris rising a body's depth beneath
it - and it did so in proportion to the fish. The taller the artwork, the
further the mouth from the sand: measured against the drawn frame, a fry's mouth
struck 0.14 rows into the crest while a grown round-fin's stopped 0.61 rows
above it and never reached at all. Bottom feeding got worse the more fish there
was doing it.

The graze line now brings the mouth down to the crest and lets the underside
follow it in, as far as the authored `grazeBurialRows` bite and no further; the
fish stops at whichever of the two comes first. The feeding lean does the rest
of the work - rotating the drawing moves the mouth down and the tail up at once
- which is why the authored graze rotation is steep rather than the gentle tilt
it used to be. It stops six degrees short of the pitch ceiling because the
strike's own rotation is added on top and the two share that ceiling: authored
to reach it exactly, so the lean is as steep as it can be and every degree of
the peck rotation is still drawn rather than clipped away in `tickVisualPose()`.

Over every growth stage of all seven species in both orientations, the mouth
grazes between 0.05 rows under the crest and 0.04 rows over it, and strikes
0.14 to 0.43 rows in; the whole roster sits inside a twelfth of a row of itself.
Across four tanks of ordinary ticks, every full strike now lands its mouth at or
under the crest, where the worst used to hover 0.61 rows above it.

Three pieces of geometry make that measurable, all of them properties of the
artwork and all cached per sprite:

- **`glyphInkReach`** - the lit pixels of a character that can be its lowest
  when the drawing leans. A cell is not the mark drawn in it: an apostrophe inks
  the top third of its cell, and the `·` a first-stage fry is made of is one dot
  in the middle of an empty one. Nor is the mark the box around it: a `>` reaches
  furthest right halfway down and furthest down at its back, and bounding those
  together invents ink at a corner the rasteriser never paints. What is kept is
  the staircase - the pixels no other pixel of the same glyph is both lower and
  further forward than - taken from the rasteriser's own rectangles in the same
  12x24 cell `positionedGlyph` places them in. That is why
  `src/art/bitmap-font.js` sits in the art layer: the character artwork is
  artwork, and the simulation is entitled to ask how big the marks it is placing
  actually are. Over the roster the model predicts the rendered ink to within
  three hundredths of a row, so the authored allowances mean what they say.
- **`spriteUndersideProfile`** - the points whose ink can be the lowest thing
  the drawing has when it leans. Within a column the cells rotate as a stack, so
  the prune is by dominance: a cell is dropped only when another in the same
  column reaches at least as far down *and* as far forward. Every roster sprite
  comes out at one point per column, so the projection is at most seven points.
- **`spriteMouthOffset`** - where the mouth is. The artwork already says: mask
  slot `5` is the nose glyph the way slot `4` is the eye. The renderer uses the
  same offset to throw the contact mark and the silt from the mouth it actually
  drew, instead of from a fixed fraction of the sprite's width.

The crest is sampled under the mouth rather than under the fish. Terrain is not
flat, a grown fish's nose leads its centre by two to three columns, and the
relief changes by more than a tenth of a row across that span - so a graze line
taken at the centre floated or buried the fish depending on which way it faced,
while the contact mark it threw was already being drawn against the terrain
under the mouth. Both now ask `turnPose()`, which moved to the simulation side
for the purpose: `visual.turnProgress` is simulation state, and the fish, the
sand it is measured against and the puff it throws must not come apart mid-turn.

### Working the substrate, and striking it

These are two different claims and the simulation makes them separately.

**Working it** is `searching`: the fish is on its graze line, in the feeding
posture it holds there. It is measured against the *authored* lean rather than
the fish's live pitch, because the fish only adopts that lean while it is
searching - reading its instantaneous angle back would mean it could never
start. This is what drives the lean, the hunger relief and the debris already in
the water.

**Striking it** is `contacting`, and it is about the nose the fish is actually
drawn with. Three things lift that nose off the sand while the fish is otherwise
perfectly placed. A fish turning through the glass is compressed to a third of
its width with its lean foreshortened to match; the drawn pitch answers the
fish's own trajectory as well as its posture, so the drift back up after each
strike used to cancel most of the authored lean; and a fish that arrives at the
line on the way up is drawn pointing away from the sand entirely. Gating the
strike, its contact mark and the silt it lifts on the drawn mouth actually
reaching takes the worst mid-turn strike from 0.55 rows of clear water to 0.16,
and `pitchScale` on the graze phase profile drops to 0.2 so a feeding fish holds
its feeding posture rather than unleaning itself - the fifth percentile of its
drawn lean rises from 18 to 24 degrees.

The test is deliberately one-sided: only a mouth held *above* the sand withholds
a strike, never one driven into it. Testing the distance either way meant the
plunge invalidated its own gate - the fish dips, the gate closes, the peck reads
zero, the clamp lifts it back and the event resumes a frame later - which
collapsed 18% of strike arcs mid-swing. That fragmentation is also why the peck
counts above read 4 rather than 7: `peckStarts` counts transitions into a
strike, so a broken arc was being counted twice.

How far off the crest a drawn mouth may be and still land is its own authored
number, `strikeReachRows`, and it is tighter than the search band: being on the
graze line in the feeding posture is what makes a fish a grazer, but putting a
bright mark and a puff of silt on the sand is a claim that the nose is *there*.
At a third of a row the worst strike across three tanks fires from 0.29 rows up
rather than 0.47, and it costs three strikes in a hundred - the knee of the
curve, since a fifth of a row buys another 0.05 for ten.

Silt belongs to a strike that landed, so the tail is keyed to the event that
landed it rather than to the contact of the moment. That is the whole of
forage's animation state: the tick latches the last two contacting events on the
activity - two, because close peck pairs overlap and the newer strike's own tail
does not begin until a third of the way through the older one - and the renderer
reads the same latch. Deciding it per frame instead drew a puff for ten strikes
in six hundred that never made contact at all.

`npm run measure:feeding` walks the whole roster and prints, per stage, how far
the mouth sits above the crest at rest and at the deepest strike and how much of
the fish went into the sand to get there; `--sheet` writes a magnified contact
sheet of the same poses beside a drawn crest, and `--tune key=value` runs the
sweep against a scene-tuning override, because authoring a feeding posture is a
matter of looking at candidates.

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

Simulated and real time are deliberately separated. The world runs on simulated
time: plants age, the clock advances, and daylight turns at whatever rate the
time scale asks for. Everything a fish physically *does* runs on real time,
because a fish answers hunger by swimming to the substrate, not by calculating.
Locomotion phases — the foraging sweep and its patch drift, the cruise bob, the
peck cadence, the surface-inspection window, the school's depth drift — are all
driven by real seconds, matching the bubble world, and the minimum time a broad
behavior is held has a real-seconds floor alongside its original simulated one.
Drives themselves track simulated time only up to
`MAX_DRIVE_HOURS_PER_REAL_SECOND`. Without that ceiling the two clocks diverge
without bound: at a day or a week per second, appetite outruns any amount of
foraging and the whole cast starves permanently while behavior changes several
times a second. The trade is that the fast time scales advance the aquarium
faster than they advance its inhabitants' bodies, which is the same concession
relationship learning already makes — accelerated biology cannot manufacture
hours of friendship, or hours of feeding, from a single rendered frame.

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

### Visual choreography and the two-second rule

Activity selection already knew whether a fish was inspecting a plant, chasing a
bubble, following a companion, or feeding. The readability failure was one layer
lower: nearly every activity became a target point and speed, then passed through
the same normalized steering and vertical damping. Correct intentions therefore
collapsed into the same smooth swim.

`src/sim/fish-choreography.js` inserts one small data-driven layer without
replacing the behavior/activity model:

```text
behavior -> activity -> target + choreography -> locomotion -> visual pose
```

An activity target can now carry bounded acceleration and turning response,
vertical speed scale, minimum/maximum speed, approach radius and slowdown,
position gain, target-velocity matching, pitch scale/response, and turn duration.
`steerActivityVelocity()` applies the same compact vector equations to every
profile; an activity does not own a private physics engine. The renderer reads a
similarly small body-motion profile to make the existing ASCII tail/body wave
quieter at rest and more energetic during bubble pursuit and play. No shader,
spline library, pathfinder, dynamic mesh, or unbounded particle system was added.

Short visible stages are derived from activity age, distance, seeded clocks, and
live target records rather than persisted animation state:

- Bubble interest visibly acquires and pitches toward a real bubble, predicts its
  rise while pursuing from below/behind, then slows into a small hover/lunge. A
  nearby pop produces only a brief overshoot/search.
- Play is reciprocal. The chaser closes and leads the companion; once it enters a
  bounded recognition radius, the other fish receives a derived acceleration and
  curved vertical dodge while keeping its own biological behavior. Pursuit breaks
  after 4.8 seconds and the evasion fades, so neither fish is corrupted or saved
  in a chase sub-state.
- School follow trails one stable school member and matches part of its velocity;
  individual follow maintains a rear offset; mutual companion cruise occupies
  stable staggered side slots with strong velocity matching; chase alone uses the
  high-energy burst and sharp-turn profile.
- Forage commits horizontally while descending, follows the actual terrain at
  low speed with a 20-degree search bias, and uses three deterministic uneven
  peck-cluster patterns. A peck displaces 0.30-0.45 logical rows, adds up to six
  degrees of feeding pitch, rebounds/scoots, and shares its event phase with a
  bounded 2-5 glyph debris puff.
- Plant investigation slows into seeded vertical stations and alternating head
  sweeps around one specimen. Plant weave follows five asymmetric, alternating
  route points across one or two plants. Surface investigation commits to an
  ascent, slows below the live meniscus, probes upward, and remains clamped to
  conservative body clearance. Open-water and plant rest use near-level posture,
  very low velocity, slow turns, and reduced body wave.

Personality still decides what wins. Affinity only restrains the choreography:
bubble affinity slightly increases pursuit enthusiasm, substrate affinity widens
the search and tightens cluster timing, plant affinity extends inspection, and
activity/sociability tune chase and formation energy. Bounded seed-derived
real-time opportunity windows now give a genuine hunger, fatigue, or social need
a chance to become visible during a normal viewing session; they cannot create a
need when its drive is low. Play, bubble, weave, follow, and surface utility
windows were also widened modestly without bypassing the utility selector.

The developer lab at `behaviors.html` loops the acquisition and close-range
portions of eleven representative activities. The numerical companion is:

```sh
npm run measure:readability
```

It records average/peak speed, average/peak absolute pitch, vertical travel, a
turn-rate proxy, social spacing, bubble intercept distance, peck starts, chase
evasion frames, damage, full redraws, and `tick + render` time. The
substrate-search loop runs twenty seconds rather than fifteen: the graze line is
measured to the mouth now and sits the better part of two rows lower, so a
shorter loop was almost entirely descent. It also runs an
ordinary deterministic ten-minute watch rather than only forced poses. Current
representative signatures are:

| Activity | Landscape signature | Portrait signature |
| --- | --- | --- |
| Cruise | 0.34 peak speed, 0.0° max pitch | 0.34, 0.0° |
| Bubble pursuit | 1.00, 32.0°, 1.55-row intercept | 1.00, 32.0°, 1.57-row intercept |
| Plant weave | 0.43, 25.7°, four alternating stages | 0.44, 30.2°, four alternating stages |
| Companion cruise | 0.49, 3.6°, 3.69-row mean spacing | 0.49, 3.6°, 3.69-row mean spacing |
| Playful chase | 0.84, 50 evasion frames | 0.84, 50 evasion frames |
| Substrate search | 0.57, 32.0°, 4 pecks | 0.58, 32.0°, 4 pecks |
| Surface investigation | 0.68, 32.0°, 6.36 rows vertical travel | 0.68, 32.0°, 7.46 rows |
| Open-water rest | 0.04 peak / 0.02 average speed | 0.04 / 0.02 |

With the default seed at noon, the ordinary ten-minute diagnostic recorded six
to eight bubble investigations, three playful chases, three companion cruises,
eight individual follows, one substrate-search bout with 9-11 visible pecks,
four plant/rest-shelter visits, and six open-water rests in each orientation;
portrait also reached two surface investigations. These are opportunity audits,
not quotas: other personalities and world seeds retain their own mix.

The established Phase 1, Phase 2, and Phase 4 measurement scripts still report
zero full redraws across all 3,200 transitions and keep the opaque-body ceiling
at nine fills. The 2,190 forced readability transitions also report zero full
redraws. Compared with the pre-overhaul tree, ordinary average damage changed
from 22.18% to 21.92% in landscape and 24.35% to 23.59% in portrait; bubble-heavy
changed from 20.87% to 20.84% and 17.55% to 17.24%. The deliberately dense
plant/social case changed from 32.87% to 33.38% in landscape and 58.19% to 61.17%
in portrait, with the existing 96% portrait maximum unchanged. At the mature
day-420 population, average damage is 50.11% landscape and 74.48% portrait,
within 0.31 percentage points of the pre-overhaul measurements. The slowest
current Node `tick + render` average in those established scenarios was 4.01 ms;
this is comparative developer evidence, not an ESP32 hardware benchmark.

The persistence schema remains version 2. Choreography profiles are constants;
bubble offsets, route stages, peck micro-phases, chase evasion, and pop responses
are all reconstructed transiently after reload.

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

## Phase 3 aquarium history

Phase 1 answered "what is that fish doing?" and Phase 2 answered "which fish is
that?" Both are questions a single visible moment can settle. Phase 3 answers a
question no frame can: "how has this aquarium changed since I last looked?" It
turns time itself into content, so an aquarium visibly accumulates a past across
weeks and months instead of being the same entities with larger `ageDays`.

Nothing about that history is a screen. There is no unlock, notification,
calendar, achievement, inventory, progress meter, daily reward, chore, or
feeding requirement, and no text of any kind is added to the aquarium. The
history exists only as what is now living inside the tank: a seventh and then an
eighth persistent fish, a patch of needle grass that is slowly getting wider, an
unusual plant that came up months after the tank was set up and now glows for a
few days every several weeks.

### Two clocks, and which one history uses

Phase 2 established that the world runs on simulated time while everything a
fish physically *does* runs on real time, because a fish answers hunger by
swimming to the substrate rather than by calculating; drives therefore track
simulated time only up to `MAX_DRIVE_HOURS_PER_REAL_SECOND`.

Phase 3 sits on the other side of that split. Plant growth and aquarium history
are long-horizon biological world state, not something an animal has to find
time to carry out. A plant needs no real-time permission for a week to pass
while the device is off. Long-horizon advancement therefore uses the full
simulated aquarium age - `totalDays`, `simDelta / 86400` - including debug time
acceleration and offline elapsed time, and is deliberately *not* subject to the
drive cap. Short visible actions remain exactly as real-time bounded as they
were.

### One shared long-horizon resolver

`src/sim/aquarium-history.js` owns every chronological long-horizon change.
`tick()` and `advanceOffline()` both call the same

```text
advanceAquariumHistory(state, deltaDays) -> state
```

instead of each aging plants and crossing event boundaries in their own way, so
live accelerated simulation and offline catch-up cannot drift apart. It returns
updated `totalDays`, `plants`, `individuals`, and `content`; `tick()` no longer
ages plants or advances the day counter itself.

Events are detected as *crossings*, never as equality with the current day:
`if (totalDays === 30)` is unreliable under floating point and coarse steps, and
a one-week-per-second debug frame legitimately skips several calendar boundaries
at once. Every crossed boundary still resolves exactly once. Advancing from day
24.2 to day 120.6 costs a few dozen operations - the milestone days and
propagation epochs inside the interval - not ninety-six days of replayed 10 fps
simulation.

### Why the resolver is chronological rather than terminal

**A plant's maturity can be reached inside a large offline interval, so
propagation opportunities are evaluated at their historical boundaries rather
than against only the final plant age.** Adding seventy days to every plant and
then asking which of them could have reproduced would let a plant reproduce
before it had actually matured, and would hide the later generations entirely:
an offspring that appears on day 60 and matures by day 100 is legitimately
eligible for an opportunity at day 132 inside a single jump to day 180. Ages are
therefore carried forward to each boundary before that boundary is evaluated.
The number of boundaries is small enough to do this correctly. A future port
that "optimizes" this into a single terminal evaluation would silently change
what the aquarium becomes.

The same property makes advancement step-size invariant. Reaching day 180 in one
180-day step, twenty-six week-sized steps, or a hundred and eighty day-sized
steps produces the same persistent fish roster, the same fish seeds, the same
plant roster, seeds, species and mature sizes, and the same processing cursor.
Fish positions and transient activities deliberately do not match, because
offline advancement never replays locomotion. Plant ages agree to within
floating-point accumulation, which nothing downstream reads more finely than a
growth stage.

### Deterministic milestone schedule

`contentSchedule(seed)` is a pure function returning this aquarium's four
one-time milestones: two fish arrivals and two delayed rare-plant emergences.
Dates are derived, never stored - the same rule affinities and pair
compatibility already follow. Seeded windows keep different aquariums on
different histories:

| Milestone | Window (aquarium days) |
| --- | ---: |
| `fish-arrival:0` | 10 – 24 |
| `rare-emergence:0` | 24 – 50 |
| `fish-arrival:1` | 45 – 85 |
| `rare-emergence:1` | 80 – 150 |

The schedule is orientation-independent on purpose. Portrait and landscape are
two views of one aquarium, so for a given seed the same fish arrives on the same
aquarium day and the same rare species is scheduled; only the physical plant
positions differ, because the two habitats differ. Switching orientation or
entering compare mode cannot generate an arrival, duplicate an event, change an
arrival seed, or reroll a date.

Every long-horizon decision derives from the aquarium seed, the event family,
and an ordinal or epoch through the existing PRNG helpers. `Math.random()` and
`Date.now()` appear nowhere in simulation code.

### New fish arrivals

The aquarium begins with the same six persistent individuals it always has, and
grows 6 → 7 → 8 over its first few months. Eight is the hard ceiling persistence
has always supported and it is never exceeded. No new fish artwork or species is
introduced: arrivals use the existing individual sprite system, and new
ecological resident types remain Phase 4 work.

Individual identity is now `individualSeedFor(baseSeed, index)`, and
`createIndividualFromSeed(seed, index, cols, rows, options)` is the single
construction path. `mix32` is a bijection over uint32 and `index + 17` scaled by
an odd multiplier is injective, so an arrival seed can never collide with the
initial six or with the other arrival; the resolver still carries a bounded
uniqueness walk rather than trusting that argument at runtime. Existing aquarium
seeds keep their exact Phase 1/2 cast.

An arrival enters from a water edge with real body clearance, a sensible depth,
and inward velocity, all derived from its stable event seed. A fish popping into
the middle of the tank would read as a rendering fault. The entry side alternates
strictly by ordinal from one seeded choice made for the aquarium as a whole,
which is what stops two overdue arrivals - from an old-save migration, a very
large accelerated jump, or a long offline gap - from landing inside one another.

The newcomer is created in a short transient `arrival-enter` activity, which is
an ordinary Phase 2 explore activity with a dwell and a waypoint: it swims
inward using the normal pitch, turn, and body deformation, then exits into
whatever its own personality wants. It is never *chosen*; nothing can re-enter
it. There is no arrival text, icon, flash, or cinematic. The correct reaction is
that the user notices the fish.

From its first frame the arrival is an ordinary persistent individual: traits,
affinities, sprite, preferred depth, and pair compatibility all come from its
seed, and it participates in behaviour selection, activity selection, foraging,
touch, and relationship learning like anybody else. There is no simplified "new
fish AI". It starts with `socialMemory: []`, `touches: 0`, and zero drift:
familiarity is learned through visible proximity, never granted. Adding a fish
does not touch the existing cast's memories, drift, or touch history - the
available-seed sanitation simply recognises that another valid seed exists. The
first three individuals remain Phase 1's protected mid-water cast; arrivals join
at index 6 and 7 and behave like the existing later individuals.

### Dynamic plant populations

`state.plants` now grows over an aquarium's lifetime. The skeletal architecture
is unchanged - the skeleton defines the plant and ASCII glyphs decorate the
skeleton - and a propagated plant is simply another normal specimen with a
stable seed, species, root x, age, mature height, layer, and seeded motion
variation. No joints are copied and nothing is persisted that was not persisted
before.

Reproduction is evaluated on coarse epochs (`PROPAGATION_EPOCH_DAYS = 12`)
rather than per frame, so at real time it costs one integer comparison. A
crossed epoch has a seeded 34% chance of an opportunity at all, and an
opportunity produces at most one shoot. Eligibility uses the real
`plantGrowthState(plant).mature` rule rather than an age threshold, because
growth schedules differ by several days between a ground tuft and a leaf reed:
an immature plant cannot propagate. Rare species never propagate - delayed
emergence is how an unusual plant enters, and letting one colonise would make it
ordinary. A shoot keeps its parent's species, which is what makes a colony
recognisable: a patch of needle grass slowly becomes a larger patch of needle
grass, and a ribbon never gives birth to a broadleaf.

Placement tries a small fixed set of four deterministic candidate offsets around
the parent and stops. A failed opportunity is not a failure state - it simply
produces nothing rather than searching the substrate. A candidate root must:

- lie within the local propagation spread of its parent (`max(1.4, cols × 0.03)`
  columns, so colonies stay local rather than jumping across the tank);
- keep at least `max(0.55, cols × 0.014)` columns from every existing root;
- have at most four other roots inside `max(1.8, cols × 0.045)` columns;
- and leave the aquarium's widest open-water gap at or above 6% of the tank
  width.

That last rule is the one worth keeping. The authored habitats deliberately
contain open water between them; that space is composition, not unused memory,
so a candidate that would close the widest gap is rejected however well it
satisfies every local rule. Across 40 seeds and two simulated years the widest
gap never falls below 5.4 columns in landscape or 4.4 in portrait.

Plant counts are hard-capped at **30 in landscape and 22 in portrait**, against
initial rosters of 22 and 16. These are measured rendering budgets, not
permission (see the table below). Combined with the sparse epochs they stretch
the change across months: a landscape aquarium typically gains one or two plants
in its first month, three to five by month three, and reaches its cap somewhere
between month six and its first year. Several seeds settle permanently below the
cap because spacing and density, not the count, are the real limit. Every shoot
starts at `ageDays = 0` and is itself weeks of subsequent content. Nothing marks
a propagated plant sterile: once it matures months later it is an ordinary
candidate, which is what lets a colony keep spreading slowly. The caps and the
spacing rules are the safety mechanism, not a generation counter.

### Delayed rare emergence and the rare lifecycle

The existing habitat generator can already seed rare plants and is untouched.
Phase 3 adds the possibility that another unusual plant comes up later. A
scheduled emergence roots a **seedling** - `ageDays ≈ 0`, revealed over the
following weeks by the ordinary skeletal growth system - beside an existing
specimen, preferring one that already shares its depth layer, so it lands in
vegetation rather than in the deliberate open middle of the tank. It respects
the same spacing, density, open-water, and cap rules, and tries a bounded three
hosts before giving up.

A rare plant that has finished growing would otherwise be finished forever, so
`plantLifecycle(plant, species)` gives unusual and glow-tipped species a slow
recurring phase: a seeded 35–70 day cycle with a `dormant → opening → active →
fading` progression, roughly two to four simulated days per open stage. It is
derived entirely from the plant's seed and age - no `nextBloomDay` is stored -
and it is not a health, decay, or death model. Nothing in the aquarium ever
dies, rots, withers, or disappears; a bloom ending simply returns the plant to
its ordinary mature state.

The bloom is expressed through a palette slot the renderer already has: a
glow-tipped species' special tips take `plants.glowTip` while its cycle is open
and `plants.growthTip` while it is closed. No shader, blur, alpha bloom,
per-pixel halo, or new primitive is added, and the mature scene still uses no
more than the eleven plant colours it used before. Stages are coarse on purpose:
at real time the change is imperceptible, across visits it is noticeable, and it
cannot invalidate a plant's scene object every 100 ms for days.

### How Phase 3 feeds Phase 2

`plantGrowthNovelty()` previously returned zero for a plant that had revealed no
structural stage - which was exactly the plants a Phase 3 aquarium makes most
interesting. A true seedling now gets its own short novelty window, and a rare
plant in its active lifecycle receives a temporary bonus. Both raise activity
*utility*; neither commands anybody. A plant-affine curious fish may cross the
tank for a new shoot while a bubble-obsessed wanderer never looks at it, which
is exactly the intended interaction between the two phases. Existing favourite
plants stay preferred, because that scoring is keyed on stable fish and plant
seeds; new plants simply become additional candidates.

### Persistence, migration, and offline behaviour

Persistence remains **version 2**. The stored schema did not become
incompatible: the only addition is one optional top-level record, and the
existing defensive restoration already tolerates its absence.

```text
content: { version: 1, propagationEpoch: <integer>, milestones: <4-bit mask> }
```

That is the entire persisted history. There is no event log. Fish View may run
for years, so the aquarium's physical state *is* the historical record - a fish
that arrived is present, a shoot that took is present, and its age says when it
appeared. `content` is a bounded processing cursor that exists so a boundary is
not resolved twice, and it is computational bookkeeping rather than a hidden
user-facing statistic. It is validated on restore: an unsupported version,
non-finite, negative, or absurd value is clamped or rebuilt rather than trusted,
so corrupt bookkeeping cannot loop millions of epochs, spawn thousands of
plants, duplicate an arrival, or crash restore.

**Dynamic plant restoration is the mandatory persistence change.** Serialization
always saved however many plants existed, but restore rebuilt the garden by
mapping the orientation's *original* habitat roster - which would have silently
deleted every propagated shoot and every delayed rare plant on the next reload.
A plant's identity is its stable seed, never its array position, so a version 2
save is now restored from the saved roster itself: seeds are validated and
deduplicated, species IDs are checked, `x` and `ageDays` must be finite, mature
height is clamped, the depth layer is taken from the species rather than the
save, motion traits fall back to the plant's own `plantVariationFromSeed()`
rather than to another specimen's animation, and the roster is capped. A saved
plant whose seed matches an original specimen still falls back to that specimen
for anything missing, which is what keeps an existing garden byte-identical
across the upgrade - no original plant's seed, species, root, age, or mature
size moves. Version 1 saves keep their original index-based path exactly.

This matters for the eventual ESP32 implementation: plant restoration is no
longer bounded by the initial habitat roster, and an NVS layout has to store a
variable-length garden up to the orientation cap.

Migration policy for a pre-Phase-3 save is deliberately asymmetric, and the
reasoning is worth keeping:

- **Propagation is not replayed.** An old save has a real aquarium age and a
  garden that has never propagated. Generating six months of hypothetical colony
  reproduction into it would invent a history that never happened, so the
  propagation cursor simply starts at the save's current age and future epochs
  run from there.
- **One-time milestones are reconciled.** Arrivals and rare emergences are
  bounded, exactly reconstructable events, so any that the save is already
  overdue for are materialized on restore - respecting the fish and plant caps
  and the alternating entry placement. Without this a long-lived Phase 2
  aquarium would be permanently stuck at six fish.

Offline advancement is catch-up, never a neglect simulation. A month away costs
an aquarium nothing: no fish is lost, no plant dies, no relationship is
punished, and no milestone that fell inside the gap is missed. Nothing in Phase 3
requires touch, feeding, checking in, or a streak. A fish that arrived while the
device was off keeps its entry swim, so the next viewer effectively sees it
joining rather than finding it already parked.

### Phase 3 performance

Timeline bookkeeping is close to free - most frames pay a boundary comparison
against four milestone days and one integer epoch. The real cost is the entities
history eventually adds, so the useful measurement is a mature aquarium at the
caps rather than a fresh one. `tools/measure-phase3.mjs` reproduces both against
any supplied tree: 200 frames at 10 fps, seeds 5/83/147, after a 20-frame settle.
"Mature" means eight individuals, the hard plant cap, every specimen grown, the
ordinary 32-fish school, and the existing bubbles.

| Orientation / scenario | Fish | Plants | Plant glyphs | `main` avg | Phase 3 avg | `main` max | Phase 3 max | Full redraws | Avg rects | Max body fill |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Landscape fresh | 6 | 22 | 137 | 27.88% | 27.88% | 58.16% | 58.16% | 0 | 32.5 | 9 |
| Landscape mature | 6→8 | 22→30 | 491→681 | 42.16% | 52.49% | 91.46% | 92.92% | 0 | 24.2 | 9 |
| Portrait fresh | 6 | 16 | 160 | 32.87% | 32.87% | 94.38% | 94.38% | 0 | 24.6 | 9 |
| Portrait mature | 6→8 | 16→22 | 564→823 | 65.52% | 75.21% | 96.00% | 96.00% | 0 | 9.8 | 9 |

A fresh aquarium is bit-identical to `main`: Phase 3 costs nothing on day one,
which is the point - the tank is left room to develop. The mature rows are the
honest cost of two more fish and eight more mature plants, and it is paid in
draw calls inside the same dirty rectangles rather than in a new kind of work.
None of the 2,400 measured transitions requests a full-frame redraw, the maximum
individual body fill stays at exactly nine rectangles, and the slowest observed
`tick + render` average was 3.91 ms - a relative development measurement rather
than an ESP32 benchmark, still comfortably inside the 100 ms frame interval.
Portrait mature is the tightest case and is where a real panel measurement would
first push back on the caps; lowering the portrait cap to 20 recovers about
three and a half points of average damage if it ever needs to be spent.

A plant appearing changes its own region on the frame it appears, exactly as any
other plant does when it moves. There is no global "history changed" flag and
nothing invalidates the framebuffer beyond that frame. Long-run memory is
hard-bounded in every direction: at most eight individuals, a tested plant cap,
at most two social memories per fish, a four-bit milestone mask, one integer
epoch cursor, and the existing bounded transient activity targets. No Phase 3
array grows with aquarium age.

### Phase 3 test coverage

`npm test` runs 216 tests. The 46 added by Phase 3 live in
`tests/phase3-timeline.test.js`, `tests/phase3-arrivals.test.js`,
`tests/phase3-plants.test.js`, `tests/phase3-persistence.test.js`, and
`tests/phase3-mature-render.test.js`, and cover schedule determinism across 80
seeds, orientation independence, step-size invariance, chronological ordering,
crossing at every frame granularity, idempotency, corrupt-cursor safety,
arrival identity/placement/Phase 2 compatibility, relationship preservation,
propagation maturity/species/locality/spacing/density/caps/pacing, later
generations, rare containment, rare emergence and its derived lifecycle,
seedling and bloom novelty, dynamic and corrupt plant persistence, Phase 2 save
migration, offline catch-up, and mature maximum-population rendering. The
existing multi-month accelerated determinism tests are retained and extended
with Phase 3 assertions rather than weakened.

## Phase 4 fish growth

Phase 3 gave the aquarium a history made of arrivals and vegetation. Phase 4
gives it to the cast: a fish is hatched as a speck, develops fins over a
season, and stops growing somewhere its own seed decided. Nothing about it is a
score, a level, or a reward. A fish is larger because it is older, there is no
way to make it grow faster, and the only way to see any of it is to keep the
aquarium.

Growth is deliberately illegible inside a single sitting. It is the same
contract the plants already make - the tank looks the same this evening as it
did this morning, and different from how it looked last month.

### A fish now stores its age

`ageDays` is the one field added to an individual, and it is the only thing
about growth that is ever written to disk. Everything else - the fish's pace,
the day each of its stages opens, and the stage it will stop at forever - is
derived in `src/sim/fish-growth.js` from the seed that already decides its
traits, affinities, colours, and species. This is the same rule Phase 2
established for personality: *store identity and learned history, derive fixed
characteristics.*

Age advances on the aquarium clock, inside the shared long-horizon resolver,
one line away from the plants:

```text
advanceAquariumHistory(state, deltaDays)
  -> plants aged, fish aged, boundaries resolved, cursor updated
```

That placement is the whole of the offline story. A week passes while the
device is off whether or not anything was watching, so `tick()` and
`advanceOffline()` grow fish identically, a month away costs nothing, and
reaching day 300 in one step, sixty steps, or three hundred steps produces the
same fish at the same stages. Ages are carried to each event boundary before
that boundary is evaluated, exactly as plant ages are, so a fish that arrives
on day 50 inside a jump to day 180 ends that jump a hundred and thirty days
old rather than newly hatched.

Growth is *not* subject to `MAX_DRIVE_HOURS_PER_REAL_SECOND`. That cap exists
because answering hunger is a swim rather than a calculation; getting older is
not something a fish has to find time to do.

### The growth ladder

`src/art/sprites.js` holds one ordered stage list per species, youngest first.
Most species begin at the shared fry forms the school is drawn from - `·`,
`>>`, `><>` - and then develop their own anatomy:

```text
double-fin   ><>  →  young-juvenile  →  juvenile  →  subadult  →  max
twin-sail    ><>  →  young-juvenile  →  juvenile  →  subadult  →  max
round-fin    ><>  →  young-juvenile  →  juvenile  →  subadult  →  max
single-fin   ><>  →  young-juvenile  →  juvenile  →  max
comma-tail   ·  →  >>  →  ><>  →  juvenile  →  max
tiny-dart    ·  →  >>  →  ><>  →  juvenile  →  max
box-fin      <o>  →  juvenile  →  max
```

**The last stage of every list is the adult sprite object itself, not a copy of
it.** A fully grown aquarium is therefore drawn from exactly the artwork it was
drawn from before growth existed, and the renderer's per-id sprite point cache,
body box, authored pitch pose, and tuned body profile all still resolve against
the sprite they were calibrated against. Every earlier stage is its own drawing
with its own body profile, tuned per stage in the motion lab. An eighth-cell width limit, mask
dimensions, and glyph-aware mirroring hold for every stage, not only the adults.

Mask digits stay on the same anatomy from stage to stage (1/2/3 fins, 4 eye,
5 mouth, 6 tail, 7 body), so a fish keeps its seeded colours as it grows
instead of being recoloured every time it develops a fin.

The smallest stages are marked `body: false` and carry no opaque body underlay.
A speck has no silhouette to make opaque, and a solid slab behind three
characters reads as a rendering fault rather than as a young fish, so a fry is
drawn as open ink exactly like the school it is the size of. The nine-rectangle
body ceiling is unchanged for everything that does have a body.

### Pace

A stage takes a week or more. `MINIMUM_STAGE_DAYS = 7` is a floor rather than a
target: a seeded per-fish pace spreads one stage over roughly one to three and
a half weeks, so two fish of the same species hatched on the same day reach the
same fin at different times, and a five-stage species takes between about a
month and three months to finish. A fish cannot be watched changing.

### Not every fry becomes an adult

A seeded terminal stage stops roughly two fish in five permanently short of
their species' maximum, and the aquarium never revisits that decision - ten
simulated years later the fish is exactly where it stopped. This is what keeps
a mature tank a population of different sizes instead of eight identical
silhouettes, and it is why growth cannot be read as progress: there is nothing
to complete, and a fish that stops early is simply a small fish. Nothing in the
aquarium treats it as stunted, unwell, or failed.

The shared fry forms are excluded from that choice. A permanent speck would
read as a rendering fault, so every species develops recognisable anatomy
before its first stoppable stage.

### Day one is still an aquarium

An aquarium is handed over as an established tank rather than as six eggs. A
starting age is a seeded fraction of the fish's own growth span, so about four
in five of the initial cast are already finished growing, roughly one fish in
ten starts as a fry, and about half of aquariums have a visibly young fish on
the first day. Phase 3's two arrivals hatch at `ageDays = 0` and grow up inside
the tank, which is the point of the event: the aquarium gained something that
is still going to change.

### The seventh species

`twin-sail` is drawn for Fish View in the same eight-cell vocabulary rather
than lifted from asciiquarium, and is appended last so every existing sprite
keeps its roster index, its authored body profile, and its pitch pose. It has
its own body profile and pitch pose and passes the same body-registration,
taper, open-tail, and mirroring regressions as the original six.

Species selection is still `individualSprites[seed % individualSprites.length]`,
so a seven-species roster changes which species a given aquarium seed draws.
A fish's identity is untouched - same seed, traits, affinities, memories,
relationships, position, and saved history - but an existing aquarium may find
one of its fish now wears different artwork. Species has never been persisted
and is always derived, so no save is invalidated by this.

### What growth touches elsewhere

Everything that asks how big a fish is now asks the stage it has grown to
rather than the species adult: vertical clearance and the substrate/surface
envelope, the tank-edge margin in `tick`, exhale placement, activity geometry,
and the renderer. A fry legitimately fits closer to the substrate and the
surface than the adult it becomes, and an arrival is placed at the glass with a
fry's half-width instead of hovering three columns off it.

Growing is the one thing that must not change how a fish feeds, and the graze
line above is measured over every stage of every species for exactly that
reason: a fish that has grown up works the sand the way it did as a fry rather
than reading as increasingly unable to reach it.

Nothing else changes. Behaviour, activity selection, foraging eligibility, the
protected mid-water trio, relationship learning, and the eight-fish ceiling are
all exactly as Phase 3 left them; a small fish is not a different kind of
character.

### Persistence and migration

Persistence stays at **version 2**. The only addition is `ageDays` on each
saved individual - no stage, no pace, no terminal stage, and no growth log.

A save written before Phase 4 carries no ages, and they are reconstructed
rather than reset, because every fish in a roster got there in exactly one of
two ways: the initial cast was created with the aquarium and has aged ever
since (its seeded starting age plus the aquarium's age), and an arrival hatched
on its own milestone day, which the deterministic schedule still knows. A
long-lived Phase 3 aquarium therefore comes back with the grown fish it earned
rather than a tank of newborns. A non-finite, negative, or non-numeric age is
clamped like every other restored field.

### Phase 4 performance

`tools/measure-phase4.mjs` reproduces the scenarios against any supplied tree,
so `main` and this branch are directly comparable: 200 frames at 10 fps, seeds
5/83/147, after a 40-frame settle, at three aquarium ages.

| Orientation / age | Fish | `main` avg | Phase 4 avg | `main` max | Phase 4 max | Full redraws | Fish glyphs (main → Phase 4) | Max body fill |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Landscape day 0 | 6 | 28.13% | 25.29% | 58.16% | 59.28% | 0 | 75.0 → 61.0 | 9 |
| Landscape day 120 | 8 | 49.79% | 47.91% | 92.29% | 92.29% | 0 | 98.3 → 90.3 | 9 |
| Landscape day 420 | 8 | 51.97% | 50.09% | 92.50% | 92.50% | 0 | 98.3 → 91.0 | 9 |
| Portrait day 0 | 6 | 34.43% | 27.02% | 94.50% | 67.75% | 0 | 75.0 → 61.0 | 9 |
| Portrait day 120 | 8 | 72.09% | 70.89% | 96.00% | 96.00% | 0 | 98.3 → 90.3 | 9 |
| Portrait day 420 | 8 | 74.48% | 74.17% | 96.00% | 96.00% | 0 | 98.3 → 91.0 | 9 |

Growth cannot cost more than `main`, and the reason is structural rather than
lucky: a stage is never larger than the adult that used to be drawn, so a fully
grown aquarium is at worst identical and is in practice slightly cheaper
because some fish stop short of maximum. A young aquarium is cheaper still. No
full-frame redraw is requested in any of the 3,600 measured transitions and the
maximum individual body fill stays at exactly nine rectangles.

Per-frame bookkeeping is a comparison against the fish's own stage thresholds.
The derived plan is memoized against a sixteen-entry cache - twice the roster
ceiling - which is cleared wholesale rather than evicted entry by entry, so no
Phase 4 structure grows with aquarium age.

### Phase 4 test coverage

The 22 tests in `tests/phase4-growth.test.js` cover stage ordering and adult
identity, stage mirroring, mask dimensions and the eight-cell limit, the
one-week floor and pace variation, the terminal-stage distribution and its
permanence, monotonic stage progression, day-one population shape, aging in
step with plants, step-size invariance across 300 days, offline/accelerated
equivalence, arrivals hatching as fry and growing up, fry clearance and tank
bounds, stage-accurate rendering with no body under a fry, a growing fish
repainting only itself, exact save round-tripping, pre-growth save migration,
age reconstruction for both ways a fish can be in the roster, corrupt-age
safety, and the save staying one number per fish. The existing Phase 1-3
suites are retained unchanged.

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
src/sim/       seeded state, behaviors, boids, skeletal plant growth and pose,
               derived fish growth, the authored choreography tuning tables,
               and the shared long-horizon aquarium-history resolver
src/dev/       deterministic production-state setup for visual choreography QA,
               and the slider metadata the tuning labs are built from
src/render/    scene composition, depth lanes, plant glyph mapping, palette,
               font, damage
src/platform/  browser-only persistence adapter
tools/         local server plus repeatable damage, performance, and readability measurements
tests/         deterministic simulation, art, persistence, and renderer checks
```

## Artwork and license

Fish artwork comes from `asciiquarium` 1.1 by Kirk Baucom, with most ASCII art
credited to Joan Stark. The `twin-sail` species and every pre-adult growth
stage were drawn for Fish View in the same eight-cell vocabulary. See
`THIRD_PARTY_NOTICES.md`. This repository is licensed under GPL v2 or later;
see `LICENSE`.
