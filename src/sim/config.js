export const ORIENTATIONS = Object.freeze({
  portrait: Object.freeze({
    id: "portrait",
    cols: 40,
    rows: 33,
    pixelWidth: 480,
    pixelHeight: 800,
  }),
  landscape: Object.freeze({
    id: "landscape",
    cols: 66,
    rows: 20,
    pixelWidth: 800,
    pixelHeight: 480,
  }),
});

// Authoring metrics for the bundled bitmap glyphs. Physical scene dimensions
// are mapped continuously and are not constrained to multiples of these values.
export const CELL_WIDTH = 12;
export const CELL_HEIGHT = 24;
// This remains the simulation's safe swimming clearance. The visible surface
// is a separate sub-row boundary owned by sim/environment.js.
export const WATERLINE_ROWS = 2;
// Keep the floor physically present without surrendering a fifth of landscape
// mode to a decorative band. Terrain relief is applied around this baseline.
export const SUBSTRATE_ROWS = 2;
// Continuous visual depth can enlarge an individual beyond its authored logical
// footprint. The simulation uses the same hard ceiling for conservative water
// and substrate clearance without importing the renderer's depth module.
export const INDIVIDUAL_VISUAL_SCALE_MAX = 1.26;
// How much of a true rotation the drawn pitch pose performs. The renderer turns
// a pitched fish bodily by this share of its angle, and the simulation has to
// reserve room for the same lean when it decides how close a nose-down fish may
// work the substrate. A clearance computed against a different lean than the one
// drawn is how a feeding fish ends up either hovering above its own debris or
// buried in the floor.
//
// The share deliberately over-states the physical angle - a thirty degree pitch
// draws as about thirty-eight - because the characters cannot be rotated, only
// their positions can, and a body assembled from upright letters reads flatter
// than its own axis. The ink is sheared to lean with it (see pitchSlant), which
// carries much of the impression and lets the positions stay tighter than they
// would otherwise have to be: past about 1.0 the glyphs start spreading off the
// body instead of travelling with it.
export const PITCH_POSE_ROTATION_FRACTION = 0.8;
// What the substrate clearance reserves for that lean. It is not simply the
// share above: the renderer builds its opaque body from a box of its own - tail
// columns excluded, a swell added, a per-sprite scale - which this side
// deliberately cannot see, and the two disagree by up to a third of a row in
// either direction depending on the sprite. So this is a reservation tuned
// against rendered frames rather than a second model of the artwork: the seed
// sweep in tests/review-regressions.test.js grades where feeding fish actually
// land, and `npm run measure:screen` reports the lean the panel receives.
export const PITCH_POSE_TOTAL_FRACTION = 0.95;
export const DEFAULT_SEED = 0xa51c0a7e;

// Drives never reach 0 or 1: a fish is never perfectly satisfied and never
// starves to death. Behaviour selection has to account for the ceiling, because
// a drive resting against it can no longer express that its need is still
// growing.
export const DRIVE_MINIMUM = 0.15;
export const DRIVE_MAXIMUM = 0.85;

// Biology only counts while a fish can still act on it. Hunger accrues on
// simulated time, but answering it costs real time: reaching the substrate is a
// swim, not a calculation. Left uncapped, an hour of appetite per rendered
// frame outruns any amount of foraging and the whole cast starves at the fast
// time scales. Drives therefore track simulated time up to this rate and no
// faster, the same concession relationship learning already makes.
export const MAX_DRIVE_HOURS_PER_REAL_SECOND = 1;

// A behavior has to be held long enough for the fish to actually carry it out.
// The simulated-seconds floor is the original commitment and still governs at
// real time; the real-seconds floor keeps that commitment meaningful once
// simulated time runs faster, where 38 simulated seconds elapse inside a single
// frame and a fish would abandon foraging long before it finished descending.
// Together they keep the pace of behavior change readable at every time scale.
export const MIN_BEHAVIOR_SIM_SECONDS = 38;
export const MIN_BEHAVIOR_REAL_SECONDS = 12;

export const DEFAULT_SETTINGS = Object.freeze({
  timeScale: 1,
  schoolCount: 32,
  separation: 1.25,
  alignment: 0.72,
  cohesion: 0.48,
  boundary: 1.1,
  depthPreference: 0.24,
  schoolSpeed: 1.45,
});

export function orientationConfig(orientation) {
  const config = ORIENTATIONS[orientation];
  if (!config) throw new Error(`Unknown orientation: ${orientation}`);
  return config;
}

export function waterBounds(state) {
  return {
    top: WATERLINE_ROWS,
    bottom: state.rows - SUBSTRATE_ROWS,
    height: state.rows - WATERLINE_ROWS - SUBSTRATE_ROWS,
  };
}
