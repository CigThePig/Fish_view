/*
 * What a press landed on.
 *
 * A tap in open water and a tap on the sand beside a feeding fish are not the
 * same event, and Phase 2 needs that difference without giving the viewer a
 * mode to select. The classification is read from the aquarium itself: the
 * press has a position, the world has things in it, and the first notable thing
 * the press is near names the event.
 *
 * Precedence runs from the most specific thing present to the least: a fish,
 * then a bubble, then the two boundaries of the water, then a plant, then open
 * water. "She tapped next to the little one" is what happened, even if the
 * little one was also near a plant. The sand and the surface outrank a plant
 * because plants line the whole bottom - almost every press low enough to puff
 * silt is also within reach of a stem, and what a viewer sees there is the
 * sand.
 *
 * The classification only shapes who finds the press interesting. What the
 * water physically touched is the impulse's business, and the two can disagree:
 * a press on the sand beside a plant rings the substrate and interests the
 * plant-lovers.
 */

import { createBubbleWorldRecords, isInvestigableBubble } from "./bubbles.js";
import { TOUCH_FLOOR_ROWS } from "./config.js";
import { substrateSurfaceY, waterSurfaceY } from "./environment.js";
import { plantGroundY } from "./habitat-depth.js";
import { plantHeight } from "./plants.js";

// A press this close to a fish is a press *at* that fish. Roughly one grown
// body length: near enough that a person would say they were pointing at it.
const FISH_CELLS = 2.6;
// Bubbles are small and move; a press has to be nearly on one.
const BUBBLE_CELLS = 2;
// Plants are tall and thin, so the reach is measured across the stem and along
// its height rather than as one radius.
const PLANT_COLUMN_CELLS = 1.8;
const PLANT_CANOPY_MARGIN_ROWS = 1.2;
// The two boundaries of the water. A press is at one of them when it is within
// about a row - or, for the sand, when it is as low as a press can go, which is
// the case that matters: a viewer cannot reach the gravel itself.
const SUBSTRATE_ROWS = 1.2;
const SURFACE_ROWS = 1.4;

export const STIMULUS_CONTEXTS = Object.freeze([
  "fish",
  "bubble",
  "substrate",
  "surface",
  "plant",
  "open-water",
]);

function nearFish(state, x, y) {
  for (const fish of state.individuals ?? []) {
    if (Math.hypot(fish.x - x, fish.y - y) <= FISH_CELLS) return true;
  }
  return false;
}

function nearBubble(state, x, y) {
  for (const bubble of createBubbleWorldRecords(state)) {
    if (!isInvestigableBubble(bubble)) continue;
    if (Math.hypot(bubble.worldX - x, bubble.worldY - y) <= BUBBLE_CELLS) return true;
  }
  return false;
}

function nearPlant(state, x, y) {
  for (const plant of state.plants ?? []) {
    if (Math.abs(plant.x - x) > PLANT_COLUMN_CELLS) continue;
    const rootY = plantGroundY(state, plant);
    if (y <= rootY + PLANT_CANOPY_MARGIN_ROWS
      && y >= rootY - plantHeight(plant) - PLANT_CANOPY_MARGIN_ROWS) return true;
  }
  return false;
}

/** Which of `STIMULUS_CONTEXTS` a press at this point belongs to. */
export function classifyStimulusContext(state, x, y) {
  if (nearFish(state, x, y)) return "fish";
  if (nearBubble(state, x, y)) return "bubble";
  if (y >= Math.min(substrateSurfaceY(state, x) - SUBSTRATE_ROWS, state.rows - TOUCH_FLOOR_ROWS - 0.01)) {
    return "substrate";
  }
  if (y <= waterSurfaceY(state, x) + SURFACE_ROWS) return "surface";
  if (nearPlant(state, x, y)) return "plant";
  return "open-water";
}

// Which taste a context appeals to. A fish already inclined toward the sand is
// the one that comes to look at a disturbance in it; the affinities are the ones
// it already has, not a new set invented for interaction.
const CONTEXT_AFFINITY = Object.freeze({
  fish: "school",
  bubble: "bubble",
  plant: "plant",
  substrate: "substrate",
  surface: "surface",
  "open-water": "wander",
});

export function contextAffinityKey(context) {
  return CONTEXT_AFFINITY[context] ?? "glass";
}
