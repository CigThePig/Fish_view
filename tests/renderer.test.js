import assert from "node:assert/strict";
import test from "node:test";

import { glyphFlip } from "../src/art/mirror.js";
import { individualSprites } from "../src/art/sprites.js";
import { isSupportedGlyph } from "../src/render/bitmap-font.js";
import { calculateDamage } from "../src/render/damage.js";
import { PALETTE_STEPS, scenePalette } from "../src/render/palette.js";
import { LAYERS, poseSprite, render } from "../src/render/render.js";
import { glyphsForObject } from "../src/render/scene.js";
import { orientationConfig } from "../src/sim/config.js";
import { applyTouch, createAquariumState } from "../src/sim/state.js";
import { tick } from "../src/sim/tick.js";

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function objectByPrefix(scene, prefix) {
  const object = scene.objects.find((candidate) => candidate.id.startsWith(prefix));
  assert.ok(object, "missing scene object " + prefix);
  return object;
}

function channel(color, offset) {
  return Number.parseInt(color.slice(offset, offset + 2), 16);
}

function colorLuminance(color) {
  return channel(color, 1) * 0.2126 + channel(color, 3) * 0.7152 + channel(color, 5) * 0.0722;
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

test("same state produces an exactly identical continuous glyph scene", () => {
  const state = createAquariumState({ orientation: "landscape", seed: 1, wallClockHours: 14.5 });
  assert.deepEqual(render(state), render(state));
});

test("renderer emits the exact physical panel dimensions", () => {
  const portrait = render(createAquariumState({ orientation: "portrait", seed: 1 }));
  const landscape = render(createAquariumState({ orientation: "landscape", seed: 1 }));
  assert.deepEqual([portrait.width, portrait.height], [480, 800]);
  assert.deepEqual([landscape.width, landscape.height], [800, 480]);
  assert.deepEqual([portrait.logicalWidth, portrait.logicalHeight], [40, 33]);
  assert.deepEqual([landscape.logicalWidth, landscape.logicalHeight], [66, 20]);
});

test("movement within one former character column changes physical glyph coordinates", () => {
  const base = createAquariumState({ orientation: "landscape", seed: 8, wallClockHours: 12 });
  const at = (x) => ({
    ...base,
    individuals: base.individuals.map((fish, index) => index === 0 ? { ...fish, x } : fish),
  });
  const left = render(at(24.18));
  const right = render(at(24.72));
  assert.equal(Math.floor(24.18), Math.floor(24.72));
  const leftGlyph = glyphsForObject(left, objectByPrefix(left, "individual:0:"))[0];
  const rightGlyph = glyphsForObject(right, objectByPrefix(right, "individual:0:"))[0];
  assert.notEqual(leftGlyph.x, rightGlyph.x);
  assert.ok(Math.abs(rightGlyph.x - leftGlyph.x) > 6);
});

test("every scene command uses a supported crisp glyph and sane values", () => {
  for (const orientation of ["portrait", "landscape"]) {
    const scene = render(createAquariumState({ orientation, seed: 33, wallClockHours: 7 }));
    const ids = new Set();
    for (const object of scene.objects) {
      assert.equal(ids.has(object.id), false, "duplicate object id " + object.id);
      ids.add(object.id);
      assert.ok(Number.isFinite(object.layer) && object.layer >= LAYERS.waterline && object.layer <= LAYERS.substrate);
      assert.ok(Number.isFinite(object.bounds.x) && Number.isFinite(object.bounds.y));
      assert.ok(object.bounds.width > 0 && object.bounds.height > 0);
      assert.ok(object.glyphStart >= 0 && object.glyphStart + object.glyphCount <= scene.glyphs.length);
    }
    for (const glyph of scene.glyphs) {
      assert.ok(isSupportedGlyph(glyph.char), "unsupported glyph " + glyph.char);
      assert.ok(Number.isFinite(glyph.x) && Number.isFinite(glyph.y));
      assert.ok(Number.isFinite(glyph.scaleX) && glyph.scaleX >= 0.5 && glyph.scaleX <= 1.5);
      assert.ok(Number.isFinite(glyph.scaleY) && glyph.scaleY >= 0.5 && glyph.scaleY <= 1.5);
      assert.match(glyph.fg, HEX_COLOR);
      assert.ok(Number.isFinite(glyph.layer) && glyph.layer >= LAYERS.waterline && glyph.layer <= LAYERS.substrate);
      assert.ok(glyph.x > -scene.width && glyph.x < scene.width * 2);
      assert.ok(glyph.y > -scene.height && glyph.y < scene.height * 2);
    }
  }
});

test("animated left poses preserve glyph-aware mirroring", () => {
  for (const sprite of individualSprites) {
    const right = poseSprite(sprite, { facing: 1, phase: 1.3, deformationStrength: 1 });
    const left = poseSprite(sprite, { facing: -1, phase: 1.3, deformationStrength: 1 });
    assert.equal(left.length, right.length);
    for (let index = 0; index < right.length; index += 1) {
      assert.equal(left[index].char, glyphFlip[right[index].char] ?? right[index].char);
      assert.ok(Math.abs(left[index].x + right[index].x) < 1e-10);
      assert.equal(left[index].y, right[index].y);
    }
  }
});

test("deep night is one coherent warm field that darkens with depth", () => {
  const state = createAquariumState({ orientation: "landscape", seed: 2, wallClockHours: 2 });
  const scene = render(state);
  assert.equal(scene.metadata.night, 1);
  const bands = scene.background.bands;
  assert.ok(bands.every((band) => HEX_COLOR.test(band.color) && band.color !== "#000000"));
  for (const band of bands) {
    // One hue family across the whole field. The night water used to drift
    // from warm brown at the surface to cold green at the floor, which is what
    // made deep night read as mud rather than as a nightlight.
    assert.ok(channel(band.color, 1) > channel(band.color, 5), band.color + " should be warm");
  }
  for (let index = 1; index < bands.length; index += 1) {
    assert.ok(
      colorLuminance(bands[index].color) < colorLuminance(bands[index - 1].color),
      "band " + index + " should be darker than the band above it",
    );
  }
});

test("the night floor stays quieter than the water it sits under", () => {
  const scene = render(createAquariumState({ orientation: "portrait", seed: 2, wallClockHours: 2 }));
  const deepestWater = colorLuminance(scene.background.bands.at(-1).color);
  const floor = colorLuminance(scene.background.substrateSegments[0].color);
  assert.ok(floor <= deepestWater, floor + " floor should not outshine " + deepestWater + " water");
  const grain = scene.objects
    .filter((object) => object.id.startsWith("substrate:"))
    .flatMap((object) => glyphsForObject(scene, object));
  assert.ok(grain.length > 0);
  // Grain far from the floor colour reads as speckle rather than as texture.
  assert.ok(average(grain.map((glyph) => Math.abs(colorLuminance(glyph.fg) - floor))) < 14);
});

test("deep night draws fish as dark silhouettes on the warm field", () => {
  const scene = render(createAquariumState({ orientation: "landscape", seed: 2, wallClockHours: 2 }));
  const individuals = scene.objects.filter((object) => object.id.startsWith("individual:"));
  const fishGlyphs = individuals.flatMap((object) => glyphsForObject(scene, object));
  const fishLuminance = average(fishGlyphs.map((glyph) => colorLuminance(glyph.fg)));
  const waterLuminance = average(scene.background.bands.map((band) => colorLuminance(band.color)));
  assert.ok(fishLuminance < waterLuminance, fishLuminance + " should be darker than " + waterLuminance);
  const bodies = individuals.flatMap((object) => object.fill);
  assert.ok(bodies.length > 0);
  assert.ok(average(bodies.map((span) => colorLuminance(span.color))) < waterLuminance);
});

test("the day and night ends of the arc are joined without a grey stage", () => {
  // Day teal and night amber are complementary, so interpolating straight
  // between them washes dusk out. Every stage has to keep visible colour.
  for (let stage = 0; stage <= PALETTE_STEPS; stage += 1) {
    const palette = scenePalette({ timeOfDayHours: 18.4 + (stage / PALETTE_STEPS) * 1.85 });
    for (const color of palette.waterBands.slice(0, 2)) {
      const levels = [1, 3, 5].map((offset) => channel(color, offset));
      const saturation = (Math.max(...levels) - Math.min(...levels)) / Math.max(...levels);
      assert.ok(saturation > 0.2, color + " is too grey at stage " + palette.paletteStage);
    }
  }
});

test("every individual fish is opaque, through every pose it swims", () => {
  for (const orientation of ["portrait", "landscape"]) {
    let state = createAquariumState({ orientation, seed: 11, wallClockHours: 13 });
    const cellWidth = orientationConfig(orientation).pixelWidth / state.cols;
    let checked = 0;
    // Long enough for every individual to turn, bob, and change depth band.
    for (let frame = 0; frame < 240; frame += 1) {
      state = tick(state, 0.1);
      const scene = render(state);
      const individuals = scene.objects.filter((object) => object.id.startsWith("individual:"));
      assert.ok(individuals.length > 0);
      for (const object of individuals) {
        assert.ok(object.fill.length > 0, object.id + " has no body");
        // Cheap enough for a panel driver even with every fish on screen.
        assert.ok(object.fill.length <= 9, object.id + " costs too many fills");
        const widest = Math.max(...object.fill.map((span) => span.width));
        assert.ok(widest > cellWidth, object.id + " body is narrower than one cell");
        for (const span of object.fill) {
          assert.match(span.color, HEX_COLOR);
          assert.ok(span.width > 0 && span.height > 0);
          // The damage renderer only repaints an object inside its own bounds,
          // so a body reaching past them would leave trails behind the fish.
          assert.ok(span.x >= object.bounds.x && span.y >= object.bounds.y);
          assert.ok(span.x + span.width <= object.bounds.x + object.bounds.width);
          assert.ok(span.y + span.height <= object.bounds.y + object.bounds.height);
        }
        checked += 1;
      }
    }
    assert.ok(checked > 1000);
  }
});

test("a moved fish repaints its body as well as its glyphs", () => {
  const base = createAquariumState({ orientation: "landscape", seed: 8, wallClockHours: 12 });
  const at = (x) => render({
    ...base,
    individuals: base.individuals.map((fish, index) => index === 0 ? { ...fish, x } : fish),
  });
  const before = at(24.18);
  const after = at(26.4);
  const moved = objectByPrefix(before, "individual:0:");
  const settled = objectByPrefix(after, "individual:0:");
  assert.notEqual(moved.signature, settled.signature);
  assert.notDeepEqual(moved.fill, settled.fill);
});

test("ordinary 10 fps frames damage a minority of either framebuffer", () => {
  for (const orientation of ["landscape", "portrait"]) {
    let state = createAquariumState({ orientation, seed: 5, wallClockHours: 12 });
    for (let index = 0; index < 100; index += 1) state = tick(state, 0.1);
    const before = render(state);
    const after = render(tick(state, 0.1));
    const damage = calculateDamage(before, after);
    assert.equal(damage.full, false);
    assert.ok(damage.rects.length > 0);
    assert.ok(damage.area < damage.total * 0.45, orientation + " damaged " + (damage.area / damage.total * 100).toFixed(1) + "%");
  }
});

test("touch ripple is immediate, deterministic, and expands continuously", () => {
  const state = createAquariumState({ orientation: "landscape", seed: 7, wallClockHours: 12 });
  const first = render(applyTouch(state, 20.25, 9.4));
  const second = render(applyTouch(state, 20.25, 9.4));
  assert.deepEqual(first, second);
  const initial = objectByPrefix(first, "reaction:ripple");
  assert.equal(initial.glyphCount, 17);

  const touched = applyTouch(state, 20.25, 9.4);
  const expandedScene = render(tick(touched, 0.1));
  const expanded = objectByPrefix(expandedScene, "reaction:ripple");
  assert.ok(expanded.bounds.width > initial.bounds.width);
  assert.ok(expanded.bounds.width - initial.bounds.width < 12);
});
