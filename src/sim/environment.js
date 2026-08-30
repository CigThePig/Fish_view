import { SUBSTRATE_ROWS } from "./config.js";
import { sampleSigned } from "./prng.js";

// The visible water surface is deliberately independent from WATERLINE_ROWS.
// Fish need a larger clearance for their multi-row artwork, while the physical
// water/air boundary can sit close to the top edge without wasting screen area.
export const SURFACE_Y_ROWS = 0.72;
export const SUBSTRATE_RELIEF_ROWS = 0.3;
export const PLANT_ROOT_BURIAL_ROWS = 0.18;

const TERRAIN_SPAN_ROWS = 5.5;
const TERRAIN_SALT = 6100;

function smoothstep(value) {
  const amount = Math.max(0, Math.min(1, value));
  return amount * amount * (3 - 2 * amount);
}

export function substrateSurfaceY(state, worldX) {
  const baseline = state.rows - SUBSTRATE_ROWS;
  // Tiny isolated pose tests and future tooling may not provide full aquarium
  // dimensions. Preserve the old flat baseline in that case instead of making
  // a helper require synthetic scene state.
  if (!Number.isFinite(state.cols) || !Number.isFinite(state.seed) || !Number.isFinite(worldX)) {
    return baseline;
  }

  const normalized = Math.max(0, worldX) / TERRAIN_SPAN_ROWS;
  const index = Math.floor(normalized);
  const progress = smoothstep(normalized - index);
  const left = sampleSigned(state.seed, TERRAIN_SALT + index) * SUBSTRATE_RELIEF_ROWS;
  const right = sampleSigned(state.seed, TERRAIN_SALT + index + 1) * SUBSTRATE_RELIEF_ROWS;
  return baseline + left + (right - left) * progress;
}

export function plantRootY(state, worldX) {
  return substrateSurfaceY(state, worldX) + PLANT_ROOT_BURIAL_ROWS;
}
