import { sampleRange } from "./prng.js";
import { substrateSurfaceY } from "./environment.js";

// One distance axis for the whole aquarium: 0 = rear wall, 1 = front glass.
// Stable specimen seeds keep existing saves and propagated plants in place.
export function plantDepth(plant) {
  const range = plant.layer === "background" ? [0.04, 0.52]
    : plant.layer === "foreground" ? [0.12, 0.94] : [0.12, 0.82];
  return sampleRange(plant.seed, 6150, ...range);
}

export function plantDepthScale(plant) {
  return 0.84 + plantDepth(plant) * 0.24;
}

// Project a position on the sand, leaving room for the nearest roots and feet.
// The relief remains strongest at the rear; all depths converge on the same
// front lip. A higher screen position alone is never an occlusion key.
export function groundY(state, x, depth) {
  const far = substrateSurfaceY(state, x);
  return far + (state.rows - 0.48 - far) * Math.max(0, Math.min(1, depth));
}

export function plantGroundY(state, plant) {
  return groundY(state, plant.x, plantDepth(plant));
}

export function woodDepth(index) { return index === 0 ? 0.29 : 0.57; }

export function meadowDepth(seed, patch, slot = 0) {
  return Math.max(0.04, Math.min(0.94,
    sampleRange(seed, 12700 + patch, 0.14, 0.85)
      + sampleRange(seed, 12720 + patch * 17 + slot, -0.11, 0.11)));
}
