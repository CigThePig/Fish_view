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

function fillCenterX(object) {
  const left = Math.min(...object.fill.map((span) => span.x));
  const right = Math.max(...object.fill.map((span) => span.x + span.width));
  return (left + right) / 2;
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

test("per-sprite body offsets mirror cleanly with the fish", () => {
  for (const id of ["round-fin", "tiny-dart", "box-fin"]) {
    const sprite = individualSprites.find((candidate) => candidate.id === id);
    assert.ok(sprite, "missing sprite " + id);
    const rightScene = renderSpriteScene(sprite, { facing: "right", staticPose: true });
    const leftScene = renderSpriteScene(sprite, { facing: "left", staticPose: true });
    const right = objectByPrefix(rightScene, "lab:");
    const left = objectByPrefix(leftScene, "lab:");
    assert.ok(
      Math.abs(fillCenterX(right) + fillCenterX(left) - rightScene.width) <= 2,
      id + " body calibration does not mirror with its facing",
    );
  }
});

test("pointed fish noses close sharply instead of carrying a round body bubble", () => {
  for (const id of ["single-fin", "comma-tail"]) {
    const sprite = individualSprites.find((candidate) => candidate.id === id);
    assert.ok(sprite, "missing sprite " + id);
    for (const facing of ["right", "left"]) {
      const object = objectByPrefix(
        renderSpriteScene(sprite, { facing, staticPose: true }),
        "lab:",
      );
      // Fill slices stay in authored tail-to-nose order even when the pose is
      // mirrored, so the last slice is always the pointed front of the fish.
      const nose = object.fill.at(-1);
      const tallest = Math.max(...object.fill.map((span) => span.height));
      assert.ok(
        nose.height <= tallest * 0.4,
        id + " nose body is too round: " + nose.height + "px versus " + tallest + "px body height facing " + facing,
      );
    }
  }
});
