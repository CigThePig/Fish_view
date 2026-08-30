import assert from "node:assert/strict";
import test from "node:test";

import {
  applyBodyProfileToSpriteScene,
  bodyProfileForSprite,
} from "../src/render/body-profile-lab.js";
import { individualSprites, renderSpriteScene } from "../src/render/render.js";

function objectByPrefix(scene, prefix) {
  const object = scene.objects.find((candidate) => candidate.id.startsWith(prefix));
  assert.ok(object, "missing scene object " + prefix);
  return object;
}

test("saved lab profiles reproduce the production body geometry exactly", () => {
  for (const sprite of individualSprites) {
    for (const facing of ["right", "left"]) {
      for (const phase of [0, 1.3, 3.1]) {
        const expectedScene = renderSpriteScene(sprite, { facing, phase });
        const expected = objectByPrefix(expectedScene, "lab:").fill;
        const labScene = renderSpriteScene(sprite, { facing, phase });
        applyBodyProfileToSpriteScene(labScene, sprite, bodyProfileForSprite(sprite), {
          facing,
          phase,
        });
        assert.deepEqual(
          objectByPrefix(labScene, "lab:").fill,
          expected,
          sprite.id + " lab default drifted from production facing " + facing + " at phase " + phase,
        );
      }
    }
  }
});

test("lab profile overrides change only the opaque body", () => {
  const sprite = individualSprites.find((candidate) => candidate.id === "round-fin");
  assert.ok(sprite);
  const original = renderSpriteScene(sprite, { facing: "right", staticPose: true });
  const tuned = renderSpriteScene(sprite, { facing: "right", staticPose: true });
  const glyphsBefore = structuredClone(tuned.glyphs);
  const profile = {
    ...bodyProfileForSprite(sprite),
    offsetX: -0.42,
    offsetY: 0.08,
    radiusXScale: 0.92,
    radiusYScale: 0.84,
    rearShoulder: 1.7,
    frontShoulder: 1.35,
  };
  applyBodyProfileToSpriteScene(tuned, sprite, profile, {
    facing: "right",
    staticPose: true,
  });

  assert.notDeepEqual(objectByPrefix(tuned, "lab:").fill, objectByPrefix(original, "lab:").fill);
  assert.deepEqual(tuned.glyphs, glyphsBefore);
});
