# Living bubble system

Fish View keeps bubbles procedural rather than turning them into persistent particle entities. The renderer derives a bounded set of bubble records from the aquarium seed, real elapsed time, fish positions, the current touch reaction, and the same environmental current used by the skeletal plants.

## Visual behavior

- Landscape uses five persistent bottom emitters; portrait uses three.
- Emitters release irregular bursts of two to five bubbles, then stay quiet for long seeded intervals.
- Some emitters sit beside deterministic plant roots while others occupy open substrate, avoiding evenly spaced bubble columns.
- A few isolated bubbles begin away from the main streams so the scene does not look like a set of elevators.
- Four seeded size classes are used: micro, normal, large, and rare jumbo bubbles.
- Rise speed is roughly 0.24 to 0.68 logical rows per real second before the small portrait compensation, several times the old 0.035 to 0.085 range.
- Bubbles grow as they rise. Their glyph vocabulary progresses through `.`, `'`, `o`, `O`, and, for rare jumbo bubbles near the surface, `()`.
- Large bubbles can carry a tiny typographic highlight.
- Every rising path combines the shared aquarium current with two inexpensive harmonics. This creates a slow bend plus a quicker local wobble.
- Individual fish perform a coarse nearby displacement only. A passing fish can shove a bubble sideways and give it a small upward kick; schooling fish are deliberately excluded from this work.
- Individual fish occasionally exhale one small bubble near the mouth on a seeded 32 to 118 second cadence.
- A touch that reaches the substrate's existing lower interaction clamp releases a deterministic burst of three to six small bubbles from the floor.
- Reaching the real physical water surface starts a short pop phase rather than wrapping directly to the bottom. The bubble compresses, flashes as `*`, and ends as a tiny `~`/`'` surface disturbance.
- Bubble colour is depth aware and remains inside the existing day/twilight/night palette. Deep bubbles borrow more of the local water band; near-surface bubbles borrow more of the waterline colour.

## ESP32 budget

The system does not allocate, integrate, serialize, or restore a particle simulation. Stable emitter, isolated, fish, and touch slots are evaluated directly from time. Each visible bubble is one scene object containing at most three bitmap glyphs, so the existing dirty-rectangle compositor can repaint a small local area instead of the framebuffer.

`drawBubbles()` is called directly by the existing core scene composer at the ambient layer. There is no second scene pass and no copy of the fish, plant, or background objects. Existing fish fill spans, plant bounds, layering, signatures, and dirty-rectangle behavior therefore stay on the same rendering path used before the bubble upgrade.

Regression tests cap the living system at 42 simultaneous bubble objects and 96 bubble glyphs while checking deterministic output, grounded emitters, speed, glyph/lifecycle variety, surface pops, fish exhalation, fish displacement, and substrate-touch bursts.
