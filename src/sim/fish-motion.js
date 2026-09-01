import { spriteDimensions } from "../art/sprites.js";
import {
  CELL_HEIGHT,
  CELL_WIDTH,
  INDIVIDUAL_VISUAL_SCALE_MAX,
} from "./config.js";
import { spriteForFish } from "./fish-growth.js";
import { substrateSurfaceY, waterSurfaceY } from "./environment.js";
import { affinitiesFromSeed } from "./fish-personality.js";
import { sample01, sampleRange } from "./prng.js";

export const MAX_FISH_PITCH_DEGREES = 32;
export const FORAGE_PITCH_BIAS_DEGREES = 20;
export const SURFACE_PITCH_BIAS_DEGREES = -10;
export const FORAGE_SEARCH_DISTANCE_ROWS = 0.82;

const MAX_PITCH_RADIANS = MAX_FISH_PITCH_DEGREES * Math.PI / 180;
const CLEARANCE_MARGIN_ROWS = 0.18;
const PECK_PATTERNS = Object.freeze([
  Object.freeze([0.08, 0.38, 0.49, 0.76]),
  Object.freeze([0.1, 0.22, 0.55]),
  Object.freeze([0.07, 0.43, 0.68, 0.79]),
]);
const DEBRIS_TAIL_SECONDS = 0.82;

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function positiveModulo(value, modulus) {
  return ((value % modulus) + modulus) % modulus;
}

function spriteFor(value) {
  if (value?.shape) return value;
  // A growing fish is measured at the size it is now, not at the size it will
  // eventually be: a fry legitimately fits closer to the substrate and the
  // surface than the adult it becomes.
  return spriteForFish(value ?? { seed: 0 });
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

// Forage contact has no persistent animation state. Search and clustered peck
// phases are reconstructed from activity age + seed, which keeps saves compact
// and makes the substrate puff renderer observe exactly the same event as the
// simulation. The deliberately uneven patterns read as feeding rather than a
// metronome: single pecks, close pairs, a lateral scoot, then a longer pause.
export function forageActivity(fish, index, state) {
  const eligible = forageEligible(index);
  const surfaceY = substrateSurfaceY(state, fish.x);
  const targetY = surfaceY - fishVerticalClearanceRows(fish);
  const distanceRows = Math.abs(fish.y - targetY);
  const searching = eligible
    && fish.behavior?.current === "forage"
    && distanceRows <= FORAGE_SEARCH_DISTANCE_ROWS;

  const substrateAffinity = affinitiesFromSeed(fish.seed).substrate;
  const period = sampleRange(fish.seed, 4600, 5.4, 7.8) * (1.08 - substrateAffinity * 0.2);
  const offset = sampleRange(fish.seed, 4601, 0, period);
  const age = Math.max(0, fish.activity?.current === "substrate-search"
    && Number.isFinite(fish.activity?.ageRealSeconds)
    ? fish.activity.ageRealSeconds
    : fish.behavior?.ageRealSeconds ?? 0);
  const absoluteClock = age + offset;
  const cycleIndex = Math.floor(absoluteClock / period);
  const cycleSeconds = positiveModulo(absoluteClock, period);
  const pattern = PECK_PATTERNS[Math.floor(sample01(fish.seed, 4602) * PECK_PATTERNS.length)
    % PECK_PATTERNS.length];
  let peckPhase = null;
  let peckEvent = null;
  let debrisPhase = null;
  let debrisEvent = null;
  for (let event = 0; event < pattern.length; event += 1) {
    const start = pattern[event] * period;
    const duration = sampleRange(fish.seed, 4610 + event, 0.3, 0.46);
    const elapsed = cycleSeconds - start;
    if (searching && elapsed >= 0 && elapsed < duration) {
      peckPhase = elapsed / duration;
      peckEvent = event;
    }
    const debrisAge = elapsed - duration * 0.34;
    if (searching && debrisAge >= 0 && debrisAge < DEBRIS_TAIL_SECONDS
      && (debrisPhase === null || debrisAge < debrisPhase * DEBRIS_TAIL_SECONDS)) {
      debrisPhase = debrisAge / DEBRIS_TAIL_SECONDS;
      debrisEvent = event;
    }
  }
  const peck = peckPhase === null ? 0 : Math.sin(Math.PI * clamp(peckPhase, 0, 1));
  const sizeFactor = clamp(fishVerticalClearanceRows(fish) / 2.2, 0.88, 1.04);
  const displacementAmplitude = (0.3 + substrateAffinity * 0.1) * sizeFactor;
  const eventSeed = (cycleIndex * 7 + (peckEvent ?? debrisEvent ?? 0)) >>> 0;
  const scootDirection = sample01(fish.seed ^ eventSeed, 4630) < 0.5 ? -1 : 1;
  const recovery = peckPhase === null ? 0 : smoothRecovery(peckPhase);

  return {
    eligible,
    searching,
    peck,
    peckPhase,
    peckEvent,
    peckDisplacement: peck * displacementAmplitude,
    displacementAmplitude,
    recovery,
    debrisPhase,
    debrisEvent,
    eventSeed,
    scootDirection,
    clusterSize: pattern.length,
    clusterProgress: cycleSeconds / period,
    surfaceY,
    targetY,
    distanceRows,
  };
}

function smoothRecovery(peckPhase) {
  const progress = clamp((peckPhase - 0.52) / 0.48, 0, 1);
  return Math.sin(progress * Math.PI);
}
