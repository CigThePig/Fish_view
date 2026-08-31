import { spriteDimensions } from "../art/sprites.js";
import {
  CELL_HEIGHT,
  CELL_WIDTH,
  INDIVIDUAL_VISUAL_SCALE_MAX,
} from "./config.js";
import { spriteForSeed } from "./entities.js";
import { substrateSurfaceY, waterSurfaceY } from "./environment.js";
import { affinitiesFromSeed } from "./fish-personality.js";
import { sampleRange } from "./prng.js";

export const MAX_FISH_PITCH_DEGREES = 32;
export const FORAGE_PITCH_BIAS_DEGREES = 8;
export const SURFACE_PITCH_BIAS_DEGREES = -6;
export const FORAGE_SEARCH_DISTANCE_ROWS = 0.72;

const MAX_PITCH_RADIANS = MAX_FISH_PITCH_DEGREES * Math.PI / 180;
const CLEARANCE_MARGIN_ROWS = 0.18;
const PECK_WINDOW = 0.2;

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function positiveModulo(value, modulus) {
  return ((value % modulus) + modulus) % modulus;
}

function spriteFor(value) {
  if (value?.shape) return value;
  return spriteForSeed(value?.seed ?? 0);
}

// Simulation clearance is deliberately conservative. A fish can be enlarged by
// visual depth and its horizontal silhouette contributes to its vertical
// envelope when pitched. The calculation stays in pure logical/authoring units,
// using the same 12x24 cell aspect as the bitmap artwork, so sim never imports
// render/depth.js or any backend geometry. width/2 and height/2 already include
// the half-cell of bitmap ink beyond the outermost authored glyph centres.
export function fishVerticalClearanceRows(fishOrSprite) {
  const sprite = spriteFor(fishOrSprite);
  const { width, height } = spriteDimensions(sprite);
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const horizontalAsRows = halfWidth * (CELL_WIDTH / CELL_HEIGHT);
  const projected = halfHeight * Math.cos(MAX_PITCH_RADIANS)
    + horizontalAsRows * Math.sin(MAX_PITCH_RADIANS);
  return projected * INDIVIDUAL_VISUAL_SCALE_MAX + CLEARANCE_MARGIN_ROWS;
}

export function forageEligible(index) {
  // The first three individuals are the permanent mid-water cast. Keeping them
  // out of forage is the simplest deterministic way to preserve that visibility
  // invariant without letting a fish claim to eat from several rows above the
  // substrate.
  return index >= 3;
}

export function substrateSafeY(fish, state, worldX = fish.x) {
  return substrateSurfaceY(state, worldX) - fishVerticalClearanceRows(fish);
}

export function surfaceSafeY(fish, state, worldX = fish.x) {
  return waterSurfaceY(state, worldX) + fishVerticalClearanceRows(fish);
}

// Forage contact has no persistent animation state. Search and peck phases are
// reconstructed from behavior age + seed, which keeps saves compact and makes
// the substrate puff renderer observe exactly the same event as the simulation.
export function forageActivity(fish, index, state) {
  const eligible = forageEligible(index);
  const surfaceY = substrateSurfaceY(state, fish.x);
  const targetY = surfaceY - fishVerticalClearanceRows(fish);
  const distanceRows = Math.abs(fish.y - targetY);
  const searching = eligible
    && fish.behavior?.current === "forage"
    && distanceRows <= FORAGE_SEARCH_DISTANCE_ROWS;

  const substrateAffinity = affinitiesFromSeed(fish.seed).substrate;
  const period = sampleRange(fish.seed, 4600, 4.2, 6.6) * (1.08 - substrateAffinity * 0.24);
  const offset = sampleRange(fish.seed, 4601, 0, period);
  const cycle = positiveModulo((fish.behavior?.ageRealSeconds ?? 0) + offset, period) / period;
  const peckPhase = searching && cycle < PECK_WINDOW ? cycle / PECK_WINDOW : null;
  const peck = peckPhase === null ? 0 : Math.sin(Math.PI * clamp(peckPhase, 0, 1));

  return {
    eligible,
    searching,
    peck,
    peckPhase,
    surfaceY,
    targetY,
    distanceRows,
  };
}
