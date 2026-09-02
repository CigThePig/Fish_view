import assert from "node:assert/strict";
import test from "node:test";

import {
  ADULT_BODY_PROFILES,
  BODY_PROFILES,
  DEFAULT_BODY_PROFILE,
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
    offsetX: -0.45,
    offsetY: 0,
    radiusXScale: 1.05,
    radiusYScale: 0.95,
    rearShoulder: 1.1,
    frontShoulder: 0.7,
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

// The entries exist so the lab can reach them, not to change the aquarium. A
// growth stage fell back to the shared default before they were added, so every
// stage still has to start there.
test("growth stage profiles start at the geometry the renderer already used", () => {
  for (const profile of Object.values(GROWTH_STAGE_BODY_PROFILES)) {
    assert.deepEqual(profile, DEFAULT_BODY_PROFILE);
  }
});

test("the flat lookup carries every adult and every stage", () => {
  for (const sprite of individualSprites) assert.ok(BODY_PROFILES[sprite.id], sprite.id);
  for (const id of Object.keys(GROWTH_STAGE_BODY_PROFILES)) assert.ok(BODY_PROFILES[id], id);
});
