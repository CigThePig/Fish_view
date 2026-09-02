const BODY_SHOULDER = 3;

export const DEFAULT_BODY_PROFILE = Object.freeze({
  offsetX: 0,
  offsetY: 0,
  radiusXScale: 1,
  radiusYScale: 1,
  rearShoulder: BODY_SHOULDER,
  frontShoulder: BODY_SHOULDER,
});

// Final visually tuned profiles from the Typographic Motion Lab. These values
// are authored against the right-facing source art; the shared pose transform
// mirrors them automatically for left-facing fish.
export const ADULT_BODY_PROFILES = Object.freeze({
  "double-fin": Object.freeze({
    ...DEFAULT_BODY_PROFILE,
    offsetX: 0,
    offsetY: 0,
    radiusXScale: 1,
    radiusYScale: 1,
    rearShoulder: 3,
    frontShoulder: 3,
  }),
  "round-fin": Object.freeze({
    ...DEFAULT_BODY_PROFILE,
    offsetX: -1.02,
    offsetY: 0.13,
    radiusXScale: 1.38,
    radiusYScale: 0.8,
    rearShoulder: 0.9,
    frontShoulder: 0.9,
  }),
  "tiny-dart": Object.freeze({
    ...DEFAULT_BODY_PROFILE,
    offsetX: -0.7,
    offsetY: 0.05,
    radiusXScale: 1.29,
    radiusYScale: 0.9,
    rearShoulder: 0.65,
    frontShoulder: 1.05,
  }),
  "single-fin": Object.freeze({
    ...DEFAULT_BODY_PROFILE,
    offsetX: -0.42,
    offsetY: 0,
    radiusXScale: 1,
    radiusYScale: 1,
    rearShoulder: 1.2,
    frontShoulder: 0.7,
  }),
  "comma-tail": Object.freeze({
    ...DEFAULT_BODY_PROFILE,
    offsetX: -0.23,
    offsetY: 0,
    radiusXScale: 0.9,
    radiusYScale: 0.9,
    rearShoulder: 0.6,
    frontShoulder: 0.5,
  }),
  "box-fin": Object.freeze({
    ...DEFAULT_BODY_PROFILE,
    offsetX: -0.51,
    offsetY: 0,
    radiusXScale: 1.25,
    radiusYScale: 0.9,
    rearShoulder: 1.75,
    frontShoulder: 1.75,
  }),
  "twin-sail": Object.freeze({
    ...DEFAULT_BODY_PROFILE,
    offsetX: -0.77,
    offsetY: -0.5,
    radiusXScale: 1.32,
    radiusYScale: 0.62,
    rearShoulder: 0.5,
    frontShoulder: 1.5,
  }),
});

// A growth stage is its own drawing, not a scaled adult: `round-fin` loses a
// whole dorsal row before it is a subadult, and `box-fin` juvenile is three
// characters shorter than the fish it becomes. Each stage that carries an
// opaque body therefore gets a profile of its own, keyed by the stage sprite id
// that art/sprites.js builds ("<species>:<stage label>"), and is tuned one life
// stage at a time in the Typographic Motion Lab.
//
// Every entry starts at the shared default because that is exactly what the
// renderer used for a growth stage before these entries existed: adding them
// changes nothing on screen, it only makes the geometry addressable. Stages
// drawn with `body: false` - the fry - have no opaque body at all and so have
// no profile here.
export const GROWTH_STAGE_BODY_PROFILES = Object.freeze({
  "double-fin:young-juvenile": Object.freeze({
    ...DEFAULT_BODY_PROFILE,
    offsetX: -0.4,
    offsetY: 0,
    radiusXScale: 1,
    radiusYScale: 1.5,
    rearShoulder: 2,
    frontShoulder: 1.25,
  }),
  "double-fin:juvenile": Object.freeze({
    ...DEFAULT_BODY_PROFILE,
    offsetX: 0,
    offsetY: 0,
    radiusXScale: 1,
    radiusYScale: 0.85,
    rearShoulder: 3,
    frontShoulder: 3,
  }),
  "double-fin:subadult": Object.freeze({
    ...DEFAULT_BODY_PROFILE,
    offsetX: -0.41,
    offsetY: -0.49,
    radiusXScale: 1,
    radiusYScale: 1.14,
    rearShoulder: 1.5,
    frontShoulder: 1.05,
  }),
  "round-fin:young-juvenile": Object.freeze({
    ...DEFAULT_BODY_PROFILE,
    offsetX: -0.36,
    offsetY: 0,
    radiusXScale: 1,
    radiusYScale: 1.5,
    rearShoulder: 2.55,
    frontShoulder: 0.9,
  }),
  "round-fin:juvenile": Object.freeze({
    ...DEFAULT_BODY_PROFILE,
    offsetX: 0,
    offsetY: 0,
    radiusXScale: 1,
    radiusYScale: 0.85,
    rearShoulder: 3,
    frontShoulder: 3,
  }),
  "round-fin:subadult": Object.freeze({
    ...DEFAULT_BODY_PROFILE,
    offsetX: -0.93,
    offsetY: 0,
    radiusXScale: 1.17,
    radiusYScale: 0.9,
    rearShoulder: 2.1,
    frontShoulder: 2.05,
  }),
  "tiny-dart:juvenile": Object.freeze({
    ...DEFAULT_BODY_PROFILE,
    offsetX: -0.67,
    offsetY: -0.04,
    radiusXScale: 1.5,
    radiusYScale: 1,
    rearShoulder: 0.5,
    frontShoulder: 0.85,
  }),
  "single-fin:young-juvenile": Object.freeze({
    ...DEFAULT_BODY_PROFILE,
    offsetX: -0.48,
    offsetY: 0,
    radiusXScale: 1.2,
    radiusYScale: 1.5,
    rearShoulder: 0.6,
    frontShoulder: 0.7,
  }),
  "single-fin:juvenile": Object.freeze({
    ...DEFAULT_BODY_PROFILE,
    offsetX: -0.41,
    offsetY: -0.52,
    radiusXScale: 1,
    radiusYScale: 1.3,
    rearShoulder: 1.1,
    frontShoulder: 1,
  }),
  "comma-tail:juvenile": Object.freeze({
    ...DEFAULT_BODY_PROFILE,
    offsetX: 0,
    offsetY: 0,
    radiusXScale: 0.71,
    radiusYScale: 0.7,
    rearShoulder: 3,
    frontShoulder: 3,
  }),
  "box-fin:juvenile": Object.freeze({
    ...DEFAULT_BODY_PROFILE,
    offsetX: -0.54,
    offsetY: -0.09,
    radiusXScale: 1.43,
    radiusYScale: 0.9,
    rearShoulder: 2.05,
    frontShoulder: 2.05,
  }),
  "twin-sail:young-juvenile": Object.freeze({
    ...DEFAULT_BODY_PROFILE,
    offsetX: -0.86,
    offsetY: -0.45,
    radiusXScale: 1.35,
    radiusYScale: 0.5,
    rearShoulder: 0.5,
    frontShoulder: 1.5,
  }),
  "twin-sail:juvenile": Object.freeze({
    ...DEFAULT_BODY_PROFILE,
    offsetX: -0.83,
    offsetY: -0.48,
    radiusXScale: 1.35,
    radiusYScale: 0.5,
    rearShoulder: 0.5,
    frontShoulder: 1.5,
  }),
  "twin-sail:subadult": Object.freeze({
    ...DEFAULT_BODY_PROFILE,
    offsetX: -0.9,
    offsetY: -0.51,
    radiusXScale: 1.4,
    radiusYScale: 0.5,
    rearShoulder: 0.5,
    frontShoulder: 1.5,
  }),
});

// One flat lookup keyed by sprite id, because that is what the renderer has in
// hand: an adult and a growth stage reach their profile the same way.
export const BODY_PROFILES = Object.freeze({
  ...ADULT_BODY_PROFILES,
  ...GROWTH_STAGE_BODY_PROFILES,
});

export function bodyProfileForId(id) {
  return BODY_PROFILES[id] ?? DEFAULT_BODY_PROFILE;
}
