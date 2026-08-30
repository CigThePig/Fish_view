# ASCII Aquarium — Phase 0 Brief

**Status:** Phase 0 (web prototype). Architecture for Phase 1 deliberately unresolved — see Open Decisions.

**Rendering revision (August 2026):** the original strict cell-grid output was
useful for proving the simulation, but made the aquarium read as a terminal.
The renderer now preserves floating-point positions through visual composition
and places bundled bitmap glyphs independently in physical space. This revision
supersedes only the old CellGrid/quantize-at-render contract; the deterministic
simulation and hardware-conscious constraints remain in force.

---

## 1. What this is

A slow, persistent ASCII aquarium that runs 24/7 on a wall- or shelf-mounted
display in a child's bedroom, doubling as a nightlight.

It borrows its ASCII art from Kirk Baucom's `asciiquarium` (GPL v2) and almost
nothing else. The original is a screensaver: entities spawn offscreen, drift
across at constant velocity, and are destroyed on the far side. They have no
identity, no persisted state, and no reaction to anything. **This project
inverts that core loop.** Treat the original as a sprite sheet, not as a
reference implementation.

**Primary success criterion:** it is interesting to glance at, repeatedly, over
months. Not impressive on first load — *rewarding on the four hundredth look.*

**Audience:** one 8-year-old, autistic, developmentally around 5 in most areas.
This drives specific requirements in §6. It is not a general-purpose app and
should not be designed as one.

---

## 2. Target hardware (Phase 1 — do not build for it yet, but do not preclude it)

Waveshare **ESP32-S3-Touch-LCD-7**

| | |
|---|---|
| SoC | ESP32-S3, dual-core LX7 @ 240MHz, 512KB SRAM |
| PSRAM | 8MB octal SPI |
| Flash | 8 or 16MB |
| Panel | 7" 800×480, EK9716, **parallel RGB565, no panel-side framebuffer** |
| Touch | GT911, 5-point capacitive, I2C |
| Backlight | via CH422G I2C IO expander — **PWM dimming unverified, must confirm before purchase** |
| Active area | ~152mm × 91mm |

Consequences that constrain the design:

- The 750KB framebuffer lives in PSRAM and is DMA'd out continuously. PSRAM
  bandwidth is the ceiling. Waveshare's own LVGL benchmark reaches ~26fps.
- A continuous bitmap-glyph renderer uses **damage rectangles** around changed
  scene objects. Representative ordinary 10fps frames are required to damage
  less than 45% of either framebuffer, and commonly touch substantially less.
  Full-frame redraw during ordinary animation remains forbidden.
- Plan for ESP-IDF RGB bounce-buffer mode to avoid tearing.
- No battery-backed RTC. Time comes from NTP over WiFi, with freewheel
  fallback from last known time.
- Target framerate: **8–10fps.** This is a slow aquarium. Do not design for 60.

---

## 3. Locked constraints

These are decided. Do not relitigate them without an explicit gate.

1. **Nothing dies.** No fish loss, ever, under any condition. This is a
   hard product requirement, not a difficulty setting.
2. **Two independent entity layers** (see §5). They share a world and a
   renderer, not a behavior model.
3. **The reactive layer is deterministic.** Any user touch produces an
   immediate, identical, non-probabilistic response every single time.
   Zero emergence here. A fish is never "too busy" to respond.
4. **The simulation layer is emergent but bounded.** Utility-driven behavior
   over trait and drive vectors, with hard invariants layered on top
   (§5.3). Never scripted sequences; never unbounded either.
5. **All internal state must have a visible correlate.** No bars, no numbers,
   no text, no icons anywhere in the UI. If a variable cannot be expressed
   through position, motion, color, or posture, it should not exist.
6. **Positions remain floats through visual composition.** Logical cell-sized
   units remain useful for simulation and ASCII authoring, but glyph positions
   are mapped continuously to physical pixels and never snapped to rows or
   columns as part of scene creation.
7. **Deterministic RNG throughout.** Seeded, reproducible, replayable. Store
   per-entity seeds, never derived traits.
8. **The sim and scene composer are pure.** No DOM, canvas, localStorage,
   browser timer, or CSS dependency enters simulation or composition code.
   `tick(state, dt) -> state` and `render(state) -> RenderScene`. This keeps the
   Phase 1 language decision genuinely open.

---

## 4. Open decisions (do NOT resolve unilaterally)

**4.1 — Orientation. This is what Phase 0 exists to test.**

Build both. Make it a runtime toggle, not a build flag.

| | Portrait | Landscape |
|---|---|---|
| Panel | 480 × 800 | 800 × 480 |
| Logical authoring layout | **40 × 33** | **66 × 20** |
| Waterline | 2 rows | 2 rows |
| Substrate | 4 rows | 4 rows |
| Water column | 27 rows | 14 rows |

The tension: portrait gives a deep tank that rewards vertical movement and
plant growth, but may be too narrow for a 30-fish school to spread out and
read as a school. Landscape gives the school room but flattens the water
column and shrinks the plant canopy. **The prototype must make this
answerable by looking at it, not by reasoning about it.**

**4.2 — Phase 1 implementation language.** Either a C core compiled to WASM
for web and native for ESP32 (one source of truth, slower iteration loop), or
TypeScript now and a C rewrite later (fast iteration, sim written twice).
Deferred until after the orientation test. §3.8 keeps both viable.

**4.3 — Whether the individual-fish layer survives.** Build it, evaluate it.
It is designed to be removable without touching the school.

---

## 5. Architecture

### 5.1 Renderer

- Pure scene, `RenderScene = { width, height, background, glyphs, objects }`.
  Glyph commands carry continuous physical coordinates, bitmap scale, colour,
  and layer; scene objects provide stable IDs and bounds for damage tracking.
- Z-sorted compositing. Depth bands: waterline, background plants, ambient
  marks, school, individuals, reaction, foreground plants, substrate.
- Damage-region tracking. A changed object's previous and current bounds are
  restored from the deterministic background recipe, then every intersecting
  current layer is recomposed. Ordinary frames do not clear the canvas.
- Web output is exactly 480×800 or 800×480 and uses the bundled bitmap font,
  never canvas text or browser fonts. Glyph pixel runs are precomputed and
  rasterized without smoothing.
- Day/night colour belongs to the scene. Quantized palette stages and ordered
  band transitions replace CSS brightness as an artwork dependency; physical
  backlight control remains a separate eventual hardware responsibility.

### 5.2 Layer A — the school

25–40 fish, 1–3 glyphs each (`><>`, `>>`, `·`). No identity, no persistence,
no per-fish state beyond position and velocity.

Standard boids: separation, alignment, cohesion, plus soft boundary repulsion
and a mild depth preference. This is roughly forty lines of logic and is the
highest interest-per-line in the entire project. Get it right before anything
else.

### 5.3 Layer B — the individuals

5–8 fish, 5×3 to 7×3 glyphs, persistent across power loss.

- **Traits** (fixed at creation, rolled from stored seed): boldness,
  sociability, activity, preferred depth, curiosity.
- **Drives** (fluctuating): hunger, energy, social need.
- **Behavior:** utility selection over traits + drives + local environment.
  Never a scripted sequence.
- **Drift:** interaction history slowly shifts traits over weeks. Feed one
  often and its boldness toward the front glass rises. The relationship is
  expressed through the sim, not through a friendship counter.

**Invariants clamped over the sim output** (these are rendering guarantees,
not behavior scripts):
- Minimum N individuals visible in the mid-water band at all times.
- Velocity ceilings and floors.
- Drive values clamped away from degenerate extremes.
- No state transition faster than an easing floor.

Rationale: a free-running sim will eventually produce a stretch where every
fish is low-energy and hidden. To this user, an empty tank does not read as
"they're resting," it reads as *gone*. That failure mode is unacceptable.

### 5.4 Layer C — plants

Anchored in the 4-row substrate, growing upward into the water column. Mature
canopy should occupy roughly a third of the available water rows.

Because nothing dies, **plant growth is the primary long-horizon change
signal** — the main reason month six looks different from month one. Tune the
growth curve so it cannot be watched happening but is unmistakable across
weeks.

### 5.5 Timescales

Every one of these must be present:

| Horizon | What changes |
|---|---|
| Seconds | Motion, schooling, drift |
| Minutes | Behavior shifts, grouping, depth changes |
| Hours | Day/night cycle |
| Days | Drive rhythms, individual mood |
| Weeks | Plant growth, trait drift, new arrivals |

**Guarantee:** something visibly different every time she looks.

---

## 6. Day / night — the nightlight requirement

This device replaces a nightlight. That is a functional requirement, not a
theme, and it inverts the naive design.

- **An ASCII field is mostly black and emits almost no light.** At 20%
  backlight, sparse glyphs on black is a dark rectangle, not a nightlight.
  The night state must therefore invert or wash: a dim filled water field with
  fish rendered *darker against it*, or at minimum a background wash on all
  water cells. This means water cells are non-transparent at night, which
  affects both the background damage recipe and the color mask format. Design
  for it up front.
- **Warm night palette.** Cyan and blue — asciiquarium's entire palette — are
  the worst spectrum for sleep. Night shifts to dim amber and low-saturation
  deep teal. Cool blues are daytime only. This also makes day and night
  genuinely distinct rather than merely brighter and dimmer.
- **Motion must not stop at night.** Slow it, but keep it alive. A still tank
  at 3am reads as broken or empty, which is the opposite of comforting.
- **A reliable daily arc.** A consistent "waking up" moment each morning that
  looks the same every day.
- Backlight PWM must ramp, never step.

---

## 7. Art extraction (do this first)

Source: `asciiquarium` (single 1492-line Perl script, GPL v2). Extract all art
into a structured data file. Preserve the GPL notice and attribute Kirk Baucom
and Joan Stark.

Parsing notes:

- Art blocks use two quote delimiters: `q{...}` (89 occurrences) and `q#...#`
  (8 occurrences, used where the art contains braces).
- Blocks alternate **shape, then color mask**, in pairs.
- Color masks use letters for colors (`c`/`C` cyan, `r`/`R` red, `y`/`Y`,
  `b`/`B`, `g`/`G`, `m`/`M` — lowercase dim, uppercase bright) and digits
  `1`–`9` as randomization slots resolved per-instance. `4` is the eye slot and
  maps to white.
- `auto_trans => 1` entities use `?` as the transparent character (see the
  shark art). Non-auto-trans entities use space.
- Measured fish dimensions: 5×3 up to 25×9. **Discard anything over 8 wide.**
  The large fish exist because the original targeted an 80-column terminal.
- Do not extract: ducks, boats, ships, the whale, monsters, the shark, the
  splat, the castle. Out of scope.

Also build a **sprite mirror function** with a glyph-flip table
(`<`↔`>`, `/`↔`\`, `(`↔`)`, `[`↔`]`). The original stores every fish twice,
once per facing direction. Author only right-facing sprites and generate the
left. This halves the art work and eliminates the class of bug where the two
directions drift out of sync.

---

## 8. Phase 0 deliverables

Static site deployed to GitHub Pages, developable from a phone.

1. Art extracted from the Perl into a structured data file, with mirror
   function and a visual sprite-sheet test page.
2. Continuous glyph-scene renderer with damage rectangles and runtime-
   switchable exact physical dimensions.
3. Layer A schooling, 25–40 fish, tunable boids parameters exposed in a debug
   panel.
4. Layer B individuals, 5–8, with traits, drives, utility selection, and
   localStorage persistence.
5. Layer C plants with a growth curve, plus a debug time-acceleration control
   to inspect months of growth in seconds.
6. Day/night cycle including the night inversion from §6.
7. Touch/click reactive layer — deterministic, immediate.
8. **Orientation toggle between 40×33 and 66×20, switchable live.**

### Acceptance criteria

- Runs on a phone browser at a steady 8–10fps without heating the device.
- Both orientations viewable side by side or toggled instantly, with the school
  at full size, for a real judgment call on §4.1.
- Zero DOM/platform dependencies inside simulation code.
- Same seed produces an identical run.
- Time acceleration makes weeks of plant growth and trait drift inspectable in
  a single sitting.
- No numbers, bars, or text visible anywhere in the aquarium view. Debug panel
  is separate and hideable.

### Explicitly out of scope for Phase 0

ESP32 build, C/WASM, WiFi, NTP, OTA, enclosure, sound, feeding mechanics
beyond a single deterministic touch response, new arrivals scheduling, any
species not in the original art.

---

## 9. Guardrails

- Do not add death, illness, or loss in any form.
- Do not add text, tutorials, numbers, or explanatory UI to the aquarium view.
- Do not make a user-facing interaction probabilistic.
- Do not optimize for first-impression spectacle at the cost of long-horizon
  interest.
- Do not resolve §4 unilaterally. Surface the tradeoff and stop.
- Do not let full-frame redraw creep into ordinary animation; it forecloses
  Phase 1. Slow global palette stages may deliberately invalidate the field,
  but do not change every 100ms at real-time speed.
