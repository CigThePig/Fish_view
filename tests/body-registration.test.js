import assert from "node:assert/strict";
import test from "node:test";

import { individualSprites, renderSpriteScene } from "../src/render/render.js";

function objectByPrefix(scene, prefix) {
  const object = scene.objects.find((candidate) => candidate.id.startsWith(prefix));
  assert.ok(object, "missing scene object " + prefix);
  return object;
}

function fillWidth(object) {
  const left = Math.min(...object.fill.map((span) => span.x));
  const right = Math.max(...object.fill.map((span) => span.x + span.width));
  return right - left;
}

test("opaque fish bodies follow the animated body wave instead of staying rigid", () => {
  for (const sprite of individualSprites) {
    for (const facing of ["right", "left"]) {
      const poses = [0, 1.3, 2.7].map((phase) => objectByPrefix(
        renderSpriteScene(sprite, { facing, phase }),
        "lab:",
      ).fill);
      const unique = new Set(poses.map((fill) => JSON.stringify(fill)));
      assert.ok(
        unique.size > 1,
        sprite.id + " keeps an identical rigid body while its glyphs animate facing " + facing,
      );
    }
  }
});

test("edge-on turns keep enough body width to stay registered behind readable glyphs", () => {
  for (const sprite of individualSprites) {
    for (const facing of ["right", "left"]) {
      const normal = objectByPrefix(
        renderSpriteScene(sprite, { facing, phase: 1.1, turnScale: 1 }),
        "lab:",
      );
      const edgeOn = objectByPrefix(
        renderSpriteScene(sprite, { facing, phase: 1.1, turnScale: 0.32 }),
        "lab:",
      );
      const normalWidth = fillWidth(normal);
      const edgeWidth = fillWidth(edgeOn);
      assert.ok(
        edgeWidth >= normalWidth * 0.38,
        sprite.id + " body collapses from " + normalWidth + "px to " + edgeWidth
          + "px while its glyph bitmaps remain readable facing " + facing,
      );
      assert.ok(
        edgeWidth < normalWidth,
        sprite.id + " no longer reads as turning edge-on facing " + facing,
      );
    }
  }
});
