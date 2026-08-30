import assert from "node:assert/strict";
import test from "node:test";

import { mirrorRows, mirrorSprite, normalizeRows } from "../src/art/mirror.js";
import { individualSprites, spriteDimensions } from "../src/art/sprites.js";

test("every extracted fish respects the eight-cell Phase 0 limit", () => {
  assert.ok(individualSprites.length >= 5);
  for (const sprite of individualSprites) {
    const { width, height } = spriteDimensions(sprite);
    assert.ok(width <= 8, `${sprite.id} is ${width} cells wide`);
    assert.equal(sprite.mask.length, height);
    assert.ok(sprite.mask.every((row) => [...row].length <= width));
  }
});

test("mirroring twice restores the normalized source art", () => {
  for (const sprite of individualSprites) {
    const width = spriteDimensions(sprite).width;
    const mirroredTwice = mirrorSprite(mirrorSprite(sprite));
    assert.deepEqual(mirroredTwice.shape, normalizeRows(sprite.shape, width));
    assert.deepEqual(mirroredTwice.mask, normalizeRows(sprite.mask, width));
  }
});

test("mirror flips directional glyphs as well as row order", () => {
  assert.equal(mirrorRows([">/("])[0], ")\\<");
});

