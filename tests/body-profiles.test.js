import assert from "node:assert/strict";
import test from "node:test";

import { BODY_PROFILES } from "../src/render/body-profiles.js";

const expectedProfiles = Object.freeze({
  "double-fin": Object.freeze({
    offsetX: 0,
    offsetY: 0,
    radiusXScale: 1,
    radiusYScale: 1,
    rearShoulder: 3,
    frontShoulder: 3,
  }),
  "round-fin": Object.freeze({
    offsetX: -1.02,
    offsetY: 0.13,
    radiusXScale: 1.38,
    radiusYScale: 0.8,
    rearShoulder: 0.9,
    frontShoulder: 0.9,
  }),
  "tiny-dart": Object.freeze({
    offsetX: -0.7,
    offsetY: 0.05,
    radiusXScale: 1.29,
    radiusYScale: 0.9,
    rearShoulder: 0.65,
    frontShoulder: 1.05,
  }),
  "single-fin": Object.freeze({
    offsetX: -0.42,
    offsetY: 0,
    radiusXScale: 1,
    radiusYScale: 1,
    rearShoulder: 1.2,
    frontShoulder: 0.7,
  }),
  "comma-tail": Object.freeze({
    offsetX: -0.23,
    offsetY: 0,
    radiusXScale: 0.9,
    radiusYScale: 0.9,
    rearShoulder: 0.6,
    frontShoulder: 0.5,
  }),
  "box-fin": Object.freeze({
    offsetX: -0.51,
    offsetY: 0,
    radiusXScale: 1.25,
    radiusYScale: 0.9,
    rearShoulder: 1.75,
    frontShoulder: 1.75,
  }),
});

test("production body profiles match the final motion-lab tuning", () => {
  assert.deepEqual(BODY_PROFILES, expectedProfiles);
});
