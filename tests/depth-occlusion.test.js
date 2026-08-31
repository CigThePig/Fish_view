import assert from "node:assert/strict";
import test from "node:test";

import {
  addGlyphObject,
  createSceneBuilder,
  finalizeScene,
} from "../src/render/scene.js";

function builder() {
  return createSceneBuilder({
    width: 800,
    height: 480,
    logicalWidth: 66,
    logicalHeight: 20,
    background: { signature: "test" },
  });
}

function fishGlyph(scaleY) {
  return {
    char: ">",
    x: 100,
    y: 100,
    fg: "#ffffff",
    scaleX: scaleY,
    scaleY,
  };
}

function fishFill() {
  return [{ x: 100, y: 100, width: 20, height: 10, color: "#123456" }];
}

test("opaque individuals sort by continuous apparent depth inside one palette lane", () => {
  const sceneBuilder = builder();

  // These deliberately share the same coarse layer. ID order would put the
  // visibly nearer fish first, then let the farther fish's opaque body erase it.
  addGlyphObject(sceneBuilder, {
    id: "individual:1:near",
    layer: 42,
    glyphs: [fishGlyph(1.2)],
    fill: fishFill(),
  });
  addGlyphObject(sceneBuilder, {
    id: "individual:9:far",
    layer: 42,
    glyphs: [fishGlyph(0.8)],
    fill: fishFill(),
  });

  const scene = finalizeScene(sceneBuilder);
  const individuals = scene.objects.filter((object) => object.id.startsWith("individual:"));

  assert.deepEqual(
    individuals.map((object) => object.id),
    ["individual:9:far", "individual:1:near"],
    "the farther opaque fish must paint before the nearer fish",
  );
  assert.ok(individuals.every((object) => object.fill.length > 0));
});

test("continuous fish tie-breaking does not change ordinary same-layer object order", () => {
  const sceneBuilder = builder();
  addGlyphObject(sceneBuilder, {
    id: "ambient:z",
    layer: 25,
    glyphs: [fishGlyph(0.6)],
  });
  addGlyphObject(sceneBuilder, {
    id: "ambient:a",
    layer: 25,
    glyphs: [fishGlyph(1.4)],
  });

  const scene = finalizeScene(sceneBuilder);
  assert.deepEqual(
    scene.objects.map((object) => object.id),
    ["ambient:a", "ambient:z"],
  );
});
