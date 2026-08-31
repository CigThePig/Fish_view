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
// renderer sizes its crest fills from the same total the waves can reach. The
// slope and curvature ceilings normalize the refraction the sun shafts take
// from the surface, so a tuning change to the waves cannot quietly rescale how
// hard the light bends.
export const SURFACE_WAVE_ROWS = SURFACE_WAVES.reduce((sum, wave) => sum + wave.amplitude, 0);
export const SURFACE_WAVE_SLOPE = SURFACE_WAVES.reduce(
  (sum, wave) => sum + wave.amplitude * (TAU / wave.wavelength),
  0,
);
export const SURFACE_WAVE_CURVATURE = SURFACE_WAVES.reduce(
  (sum, wave) => sum + wave.amplitude * ((TAU / wave.wavelength) ** 2),
  0,
);

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
  return surfaceWaveTerm(state, worldX, 0);
}

// First and second derivatives of the same swell, in rows per column and rows
// per column squared. They are taken analytically rather than by sampling the
// offset twice: the renderer needs the slope of a surface it only ever draws
// as whole pixels, and a finite difference across those would quantize the
// tilt into steps long before the crest itself stepped.
export function surfaceWaveSlope(state, worldX) {
  return surfaceWaveTerm(state, worldX, 1);
}

export function surfaceWaveCurvature(state, worldX) {
  return surfaceWaveTerm(state, worldX, 2);
}

// `order` selects the offset, its slope, or its curvature. Differentiating a
// sine only advances its phase by a quarter turn and scales it by the angular
// frequency, so all three come out of one loop.
function surfaceWaveTerm(state, worldX, order) {
  if (!Number.isFinite(worldX)) return 0;
  const seconds = Number.isFinite(state?.elapsedRealSeconds) ? state.elapsedRealSeconds : 0;
  const seed = Number.isFinite(state?.seed) ? state.seed : 0;
  let total = 0;
  for (let index = 0; index < SURFACE_WAVES.length; index += 1) {
    const wave = SURFACE_WAVES[index];
    const frequency = TAU / wave.wavelength;
    const phase = sampleRange(seed, SURFACE_SALT + index, 0, TAU);
    total += wave.amplitude * (frequency ** order)
      * Math.sin((worldX - seconds * wave.speed) * frequency + phase + order * (Math.PI / 2));
  }
  return total;
}

// Where the water actually stops, as opposed to where its band happens to be
// painted. This is the surface counterpart of substrateSurfaceY.
export function waterSurfaceY(state, worldX) {
  return SURFACE_Y_ROWS + surfaceWaveOffset(state, worldX);
}

export function plantRootY(state, worldX) {
  return substrateSurfaceY(state, worldX) + PLANT_ROOT_BURIAL_ROWS;
}
