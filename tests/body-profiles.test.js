import assert from "node:assert/strict";
import test from "node:test";

import {
  ADULT_BODY_PROFILES,
  BODY_PROFILES,
  GROWTH_STAGE_BODY_PROFILES,
} from "../src/render/body-profiles.js";
import { growthStagesBySpecies, individualSprites } from "../src/art/sprites.js";

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
  "twin-sail": Object.freeze({
    offsetX: -0.77,
    offsetY: -0.5,
    radiusXScale: 1.32,
    radiusYScale: 0.62,
    rearShoulder: 0.5,
    frontShoulder: 1.5,
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

const expectedGrowthStageProfiles = Object.freeze({
  "double-fin:young-juvenile": Object.freeze({
    offsetX: -0.4,
    offsetY: 0,
    radiusXScale: 1,
    radiusYScale: 1.5,
    rearShoulder: 2,
    frontShoulder: 1.25,
  }),
  "double-fin:juvenile": Object.freeze({
    offsetX: 0,
    offsetY: 0,
    radiusXScale: 1,
    radiusYScale: 0.85,
    rearShoulder: 3,
    frontShoulder: 3,
  }),
  "double-fin:subadult": Object.freeze({
    offsetX: -0.41,
    offsetY: -0.49,
    radiusXScale: 1,
    radiusYScale: 1.14,
    rearShoulder: 1.5,
    frontShoulder: 1.05,
  }),
  "round-fin:young-juvenile": Object.freeze({
    offsetX: -0.36,
    offsetY: 0,
    radiusXScale: 1,
    radiusYScale: 1.5,
    rearShoulder: 2.55,
    frontShoulder: 0.9,
  }),
  "round-fin:juvenile": Object.freeze({
    offsetX: 0,
    offsetY: 0,
    radiusXScale: 1,
    radiusYScale: 0.85,
    rearShoulder: 3,
    frontShoulder: 3,
  }),
  "round-fin:subadult": Object.freeze({
    offsetX: -0.93,
    offsetY: 0,
    radiusXScale: 1.17,
    radiusYScale: 0.9,
    rearShoulder: 2.1,
    frontShoulder: 2.05,
  }),
  "tiny-dart:juvenile": Object.freeze({
    offsetX: -0.67,
    offsetY: -0.04,
    radiusXScale: 1.5,
    radiusYScale: 1,
    rearShoulder: 0.5,
    frontShoulder: 0.85,
  }),
  "single-fin:young-juvenile": Object.freeze({
    offsetX: -0.48,
    offsetY: 0,
    radiusXScale: 1.2,
    radiusYScale: 1.5,
    rearShoulder: 0.6,
    frontShoulder: 0.7,
  }),
  "single-fin:juvenile": Object.freeze({
    offsetX: -0.41,
    offsetY: -0.52,
    radiusXScale: 1,
    radiusYScale: 1.3,
    rearShoulder: 1.1,
    frontShoulder: 1,
  }),
  "comma-tail:juvenile": Object.freeze({
    offsetX: 0,
    offsetY: 0,
    radiusXScale: 0.71,
    radiusYScale: 0.7,
    rearShoulder: 3,
    frontShoulder: 3,
  }),
  "box-fin:juvenile": Object.freeze({
    offsetX: -0.54,
    offsetY: -0.09,
    radiusXScale: 1.43,
    radiusYScale: 0.9,
    rearShoulder: 2.05,
    frontShoulder: 2.05,
  }),
  "twin-sail:young-juvenile": Object.freeze({
    offsetX: -0.86,
    offsetY: -0.45,
    radiusXScale: 1.35,
    radiusYScale: 0.5,
    rearShoulder: 0.5,
    frontShoulder: 1.5,
  }),
  "twin-sail:juvenile": Object.freeze({
    offsetX: -0.83,
    offsetY: -0.48,
    radiusXScale: 1.35,
    radiusYScale: 0.5,
    rearShoulder: 0.5,
    frontShoulder: 1.5,
  }),
  "twin-sail:subadult": Object.freeze({
    offsetX: -0.9,
    offsetY: -0.51,
    radiusXScale: 1.4,
    radiusYScale: 0.5,
    rearShoulder: 0.5,
    frontShoulder: 1.5,
  }),
});

test("production body profiles match the final motion-lab tuning", () => {
  assert.deepEqual(ADULT_BODY_PROFILES, expectedProfiles);
});

// A growth stage the lab cannot address is a growth stage nobody can sculpt.
test("every growth stage that carries an opaque body has a tunable profile", () => {
  for (const [speciesId, stages] of Object.entries(growthStagesBySpecies)) {
    for (const stage of stages) {
      if (stage.id === speciesId) continue;
      const tunable = stage.body !== false;
      assert.equal(
        Object.hasOwn(GROWTH_STAGE_BODY_PROFILES, stage.id),
        tunable,
        stage.id + (tunable ? " is missing a profile" : " has a profile but draws no body"),
      );
    }
  }
});

test("growth stage body profiles match the final motion-lab tuning", () => {
  assert.deepEqual(GROWTH_STAGE_BODY_PROFILES, expectedGrowthStageProfiles);
});

test("the flat lookup carries every adult and every stage", () => {
  for (const sprite of individualSprites) assert.ok(BODY_PROFILES[sprite.id], sprite.id);
  for (const id of Object.keys(GROWTH_STAGE_BODY_PROFILES)) assert.ok(BODY_PROFILES[id], id);
});
