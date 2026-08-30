import assert from "node:assert/strict";
import test from "node:test";

import {
  bubbleEmitterCount,
  createBubbleEmitters,
  createBubbleRenderRecords,
} from "../src/render/bubbles.js";
import { render } from "../src/render/aquarium-renderer.js";
import { scenePalette } from "../src/render/palette.js";
import { glyphsForObject } from "../src/render/scene.js";
import { orientationConfig } from "../src/sim/config.js";
import { substrateSurfaceY } from "../src/sim/environment.js";
import { applyTouch, createAquariumState } from "../src/sim/state.js";

function metricsFor(state) {
  const target = orientationConfig(state.orientation);
  return {
    cellWidth: target.pixelWidth / state.cols,
    cellHeight: target.pixelHeight / state.rows,
  };
}

function recordsAt(state, seconds) {
  const timed = { ...state, elapsedRealSeconds: seconds };
  return createBubbleRenderRecords(timed, scenePalette(timed), metricsFor(timed));
}

test("aquarium renderer deterministically replaces legacy ambient particles with bubbles", () => {
  const state = createAquariumState({ orientation: "landscape", seed: 0x51a7, wallClockHours: 12 });
  const first = render(state);
  const second = render(state);
  assert.deepEqual(first, second);
  assert.equal(first.objects.some((object) => object.id.startsWith("ambient:")), false);
  assert.ok(first.objects.some((object) => object.id.startsWith("bubble:")));
  assert.equal(first.metadata.bubbles.emitters, 5);
  assert.ok(first.metadata.bubbles.active > 0);
});

test("bubble emitters are few, stable, and physically grounded at the substrate", () => {
  for (const orientation of ["portrait", "landscape"]) {
    const state = createAquariumState({ orientation, seed: 44, wallClockHours: 12 });
    const emitters = createBubbleEmitters(state);
    assert.equal(emitters.length, bubbleEmitterCount(orientation));
    assert.equal(emitters.length, orientation === "portrait" ? 3 : 5);
    for (const emitter of emitters) {
      assert.ok(emitter.burstCount >= 2 && emitter.burstCount <= 5);
      assert.ok(emitter.burstSpacing >= 0.48 && emitter.burstSpacing <= 0.92);
      assert.ok(Math.abs(emitter.y - (substrateSurfaceY(state, emitter.x) - 0.18)) < 1e-10);
    }
    assert.deepEqual(emitters, createBubbleEmitters(state));
  }
});

test("rising bubbles are several times faster than the old ambient drift and keep size variety", () => {
  const classes = new Set();
  const speeds = [];
  for (let seed = 1; seed <= 24; seed += 1) {
    const state = createAquariumState({ orientation: "landscape", seed, wallClockHours: 12 });
    for (let seconds = 0; seconds <= 160; seconds += 4) {
      for (const record of recordsAt(state, seconds)) {
        classes.add(record.sizeClass);
        if (record.kind === "stream" && record.phase === "rise") speeds.push(record.speed);
      }
    }
  }
  assert.ok(speeds.length > 100);
  assert.ok(Math.min(...speeds) >= 0.24);
  assert.ok(Math.max(...speeds) > 0.5);
  assert.deepEqual([...classes].sort(), ["jumbo", "large", "micro", "normal"]);
});

test("bubble lifecycles grow into richer glyphs and actually pop at the surface", () => {
  const state = createAquariumState({ orientation: "landscape", seed: 9, wallClockHours: 12 });
  let sawMicro = false;
  let sawCircle = false;
  let sawJumboPair = false;
  let sawPop = false;
  let sawPopBurst = false;

  for (let tenth = 0; tenth <= 1900; tenth += 1) {
    const records = recordsAt(state, tenth / 10);
    for (const record of records) {
      const chars = record.glyphs.map((glyph) => glyph.char).join("");
      if (chars.includes(".")) sawMicro = true;
      if (chars.includes("o") || chars.includes("O")) sawCircle = true;
      if (chars.includes("(") && chars.includes(")")) sawJumboPair = true;
      if (record.phase === "pop") {
        sawPop = true;
        if (chars.includes("*") || chars.includes("~")) sawPopBurst = true;
      }
    }
    if (sawMicro && sawCircle && sawJumboPair && sawPop && sawPopBurst) break;
  }

  assert.ok(sawMicro);
  assert.ok(sawCircle);
  assert.ok(sawJumboPair);
  assert.ok(sawPop);
  assert.ok(sawPopBurst);
});

test("individual fish occasionally exhale bubbles without becoming particle emitters", () => {
  const state = createAquariumState({ orientation: "landscape", seed: 13, wallClockHours: 12 });
  let fishRecords = [];
  for (let seconds = 0; seconds <= 120 && fishRecords.length === 0; seconds += 1) {
    fishRecords = recordsAt(state, seconds).filter((record) => record.kind === "fish");
  }
  assert.ok(fishRecords.length > 0);
  assert.ok(fishRecords.length <= state.individuals.length);
  assert.ok(fishRecords.every((record) => record.id.startsWith("bubble:fish:")));
});

test("nearby individual fish shove and lift rising bubbles", () => {
  const base = createAquariumState({ orientation: "landscape", seed: 21, wallClockHours: 12 });
  let seconds = 0;
  let target = null;
  for (; seconds <= 160 && !target; seconds += 0.5) {
    target = recordsAt(base, seconds).find((record) => record.kind === "stream" && record.phase === "rise");
  }
  assert.ok(target);

  const disturbed = {
    ...base,
    individuals: base.individuals.map((fish, index) => index === 0
      ? { ...fish, x: target.worldX - 0.35, y: target.worldY + 0.2, vx: 0.7 }
      : fish),
  };
  const changed = recordsAt(disturbed, seconds - 0.5).find((record) => record.id === target.id);
  assert.ok(changed);
  assert.ok(
    Math.abs(changed.worldX - target.worldX) > 0.01 || Math.abs(changed.worldY - target.worldY) > 0.01,
  );
});

test("a substrate touch releases a small deterministic bubble burst", () => {
  const base = createAquariumState({ orientation: "landscape", seed: 33, wallClockHours: 12 });
  const floorTouch = applyTouch(base, base.cols * 0.42, base.rows - 0.2);
  const floorRecords = createBubbleRenderRecords(floorTouch, scenePalette(floorTouch), metricsFor(floorTouch))
    .filter((record) => record.kind === "touch");
  assert.ok(floorRecords.length >= 1 && floorRecords.length <= 6);
  assert.ok(floorRecords.every((record) => record.id.startsWith("bubble:touch:")));

  const midTouch = applyTouch(base, base.cols * 0.42, base.rows * 0.45);
  const midRecords = createBubbleRenderRecords(midTouch, scenePalette(midTouch), metricsFor(midTouch))
    .filter((record) => record.kind === "touch");
  assert.equal(midRecords.length, 0);
});

test("living bubbles stay inside a small dirty-rectangle friendly budget", () => {
  for (const orientation of ["portrait", "landscape"]) {
    let maximumObjects = 0;
    let maximumGlyphs = 0;
    const state = createAquariumState({ orientation, seed: 77, wallClockHours: 12 });
    for (let seconds = 0; seconds <= 240; seconds += 1) {
      const scene = render({ ...state, elapsedRealSeconds: seconds });
      const bubbles = scene.objects.filter((object) => object.id.startsWith("bubble:"));
      const glyphCount = bubbles.reduce(
        (sum, object) => sum + glyphsForObject(scene, object).length,
        0,
      );
      maximumObjects = Math.max(maximumObjects, bubbles.length);
      maximumGlyphs = Math.max(maximumGlyphs, glyphCount);
      assert.ok(bubbles.every((object) => object.glyphCount <= 3));
    }
    assert.ok(maximumObjects <= 42, `${orientation} emitted ${maximumObjects} bubble objects`);
    assert.ok(maximumGlyphs <= 96, `${orientation} emitted ${maximumGlyphs} bubble glyphs`);
  }
});
