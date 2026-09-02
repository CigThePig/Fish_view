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
  // Two dorsal sails and a long enclosed belly: the body has to reach further
  // back than a pointed fish's and still close around the nose.
  "twin-sail": Object.freeze({
    ...DEFAULT_BODY_PROFILE,
    offsetX: -0.45,
    offsetY: 0,
    radiusXScale: 1.05,
    radiusYScale: 0.95,
    rearShoulder: 1.1,
    frontShoulder: 0.7,
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
  "double-fin:young-juvenile": Object.freeze({ ...DEFAULT_BODY_PROFILE }),
  "double-fin:juvenile": Object.freeze({ ...DEFAULT_BODY_PROFILE }),
  "double-fin:subadult": Object.freeze({ ...DEFAULT_BODY_PROFILE }),
  "round-fin:young-juvenile": Object.freeze({ ...DEFAULT_BODY_PROFILE }),
  "round-fin:juvenile": Object.freeze({ ...DEFAULT_BODY_PROFILE }),
  "round-fin:subadult": Object.freeze({ ...DEFAULT_BODY_PROFILE }),
  "tiny-dart:juvenile": Object.freeze({ ...DEFAULT_BODY_PROFILE }),
  "single-fin:young-juvenile": Object.freeze({ ...DEFAULT_BODY_PROFILE }),
  "single-fin:juvenile": Object.freeze({ ...DEFAULT_BODY_PROFILE }),
  "comma-tail:juvenile": Object.freeze({ ...DEFAULT_BODY_PROFILE }),
  "box-fin:juvenile": Object.freeze({ ...DEFAULT_BODY_PROFILE }),
  "twin-sail:young-juvenile": Object.freeze({ ...DEFAULT_BODY_PROFILE }),
  "twin-sail:juvenile": Object.freeze({ ...DEFAULT_BODY_PROFILE }),
  "twin-sail:subadult": Object.freeze({ ...DEFAULT_BODY_PROFILE }),
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
