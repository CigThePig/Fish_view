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
export const BODY_PROFILES = Object.freeze({
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

export function bodyProfileForId(id) {
  return BODY_PROFILES[id] ?? DEFAULT_BODY_PROFILE;
}
