import { SUBSTRATE_ROWS } from "./config.js";
import { sampleRange, sampleSigned } from "./prng.js";

// The visible water surface is deliberately independent from WATERLINE_ROWS.
// Fish need a larger clearance for their multi-row artwork, while the physical
// water/air boundary can sit close to the top edge without wasting screen area.
export const SURFACE_Y_ROWS = 0.72;
export const SUBSTRATE_RELIEF_ROWS = 0.3;
export const PLANT_ROOT_BURIAL_ROWS = 0.18;

const TERRAIN_SPAN_ROWS = 5.5;
const TERRAIN_SALT = 6100;
const SURFACE_SALT = 6300;
const TAU = Math.PI * 2;

// The air/water boundary is a swell, never a ruled line. Three travelling
// components with unrelated wavelengths and drift directions keep the crest
// from ever repeating across a tank width, and the slowest of them is what
// makes the surface read as water rather than as a scrolling texture.
const SURFACE_WAVES = Object.freeze([
  Object.freeze({ amplitude: 0.098, wavelength: 17.5, speed: 1.05 }),
  Object.freeze({ amplitude: 0.072, wavelength: 8.3, speed: -0.68 }),
  Object.freeze({ amplitude: 0.038, wavelength: 4.6, speed: 0.85 }),
]);

// The whole swell has to fit inside the air strip above SURFACE_Y_ROWS, so the
// renderer sizes its crest fills from the same total the waves can reach.
export const SURFACE_WAVE_ROWS = SURFACE_WAVES.reduce((sum, wave) => sum + wave.amplitude, 0);

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

// Signed displacement of the water surface at `worldX`, in rows. Negative is
// a crest standing above the still-water line. Deterministic in the seed and
// the elapsed clock, so every consumer of the surface agrees frame by frame
// without any of them keeping wave state of their own.
export function surfaceWaveOffset(state, worldX) {
  if (!Number.isFinite(worldX)) return 0;
  const seconds = Number.isFinite(state?.elapsedRealSeconds) ? state.elapsedRealSeconds : 0;
  const seed = Number.isFinite(state?.seed) ? state.seed : 0;
  let offset = 0;
  for (let index = 0; index < SURFACE_WAVES.length; index += 1) {
    const wave = SURFACE_WAVES[index];
    const phase = sampleRange(seed, SURFACE_SALT + index, 0, TAU);
    offset += wave.amplitude
      * Math.sin(((worldX - seconds * wave.speed) / wave.wavelength) * TAU + phase);
  }
  return offset;
}

// Where the water actually stops, as opposed to where its band happens to be
// painted. This is the surface counterpart of substrateSurfaceY.
export function waterSurfaceY(state, worldX) {
  return SURFACE_Y_ROWS + surfaceWaveOffset(state, worldX);
}

export function plantRootY(state, worldX) {
  return substrateSurfaceY(state, worldX) + PLANT_ROOT_BURIAL_ROWS;
}
