import assert from "node:assert/strict";
import test from "node:test";

import { createPlantRenderRecords } from "../src/render/plants.js";
import { scenePalette } from "../src/render/palette.js";
import { render } from "../src/render/render.js";
import { sceneMetrics } from "../src/render/scene.js";
import { CELL_HEIGHT, SUBSTRATE_ROWS } from "../src/sim/config.js";
import {
  PLANT_ROOT_BURIAL_ROWS,
  SUBSTRATE_RELIEF_ROWS,
  SURFACE_WAVE_ROWS,
  SURFACE_Y_ROWS,
  substrateSurfaceY,
  surfaceWaveOffset,
  waterSurfaceY,
} from "../src/sim/environment.js";
import { posePlant } from "../src/sim/plants.js";
import { createAquariumState } from "../src/sim/state.js";

function matureState(orientation, seed = 77) {
  const state = createAquariumState({ orientation, seed, wallClockHours: 12 });
  return {
    ...state,
    plants: state.plants.map((plant) => ({ ...plant, ageDays: 200 })),
  };
}

test("the compact substrate uses a bounded deterministic terrain profile", () => {
  assert.equal(SUBSTRATE_ROWS, 2);
  const state = matureState("landscape", 91);
  const baseline = state.rows - SUBSTRATE_ROWS;
  const first = Array.from({ length: 133 }, (_, index) => substrateSurfaceY(state, index * 0.5));
  const second = Array.from({ length: 133 }, (_, index) => substrateSurfaceY(state, index * 0.5));
  assert.deepEqual(first, second);
  assert.ok(first.some((value) => Math.abs(value - baseline) > 0.05));
  for (const value of first) {
    assert.ok(value >= baseline - SUBSTRATE_RELIEF_ROWS - 1e-9);
    assert.ok(value <= baseline + SUBSTRATE_RELIEF_ROWS + 1e-9);
  }
  for (let index = 1; index < first.length; index += 1) {
    assert.ok(Math.abs(first[index] - first[index - 1]) < 0.12, "terrain changed too sharply");
  }
});

test("the visible water surface is a real boundary with air above it", () => {
  const state = matureState("landscape", 33);
  const palette = scenePalette(state);
  const scene = render(state);
  const expectedSurface = SURFACE_Y_ROWS * (scene.height / scene.logicalHeight);
  assert.equal(scene.background.baseColor, palette.airBg);
  assert.ok(expectedSurface > 0 && expectedSurface < 24);
  assert.ok(Math.abs(scene.background.bands[0].y - expectedSurface) < 1e-9);
  assert.ok(scene.background.substrateSegments.length <= state.cols * 2 + 1);
  assert.ok(Math.min(...scene.background.substrateSegments.map((segment) => segment.y)) > scene.height * 0.85);
});

test("the water surface is a travelling swell rather than a ruled line", () => {
  const state = matureState("landscape", 33);
  const at = (seconds, worldX) => surfaceWaveOffset({ ...state, elapsedRealSeconds: seconds }, worldX);
  const profile = (seconds) => Array.from({ length: 265 }, (_, index) => at(seconds, index * 0.25));

  const still = profile(0);
  assert.deepEqual(still, profile(0));
  // The swell has to stay inside the air strip above the band, or a crest
  // would paint over the top edge of the panel.
  assert.ok(SURFACE_WAVE_ROWS < SURFACE_Y_ROWS - 0.2);
  for (const offset of still) assert.ok(Math.abs(offset) <= SURFACE_WAVE_ROWS + 1e-9);
  // Visibly not flat, and shallow enough that the renderer's four-pixel
  // sampling step never turns the crest into a stair.
  assert.ok(Math.max(...still) - Math.min(...still) > SURFACE_WAVE_ROWS);
  const cellHeight = 480 / state.rows;
  for (let index = 1; index < still.length; index += 1) {
    const step = Math.abs(still[index] - still[index - 1]) * cellHeight;
    assert.ok(step < 1.5, `the surface stepped ${step.toFixed(2)}px in a quarter column`);
  }
  // No single component owns the shape: the crest spacing has to vary.
  const crests = [];
  for (let index = 1; index < still.length - 1; index += 1) {
    if (still[index] > still[index - 1] && still[index] >= still[index + 1]) crests.push(index * 0.25);
  }
  assert.ok(crests.length >= 3);
  const gaps = crests.slice(1).map((value, index) => value - crests[index]);
  assert.ok(new Set(gaps.map((gap) => gap.toFixed(2))).size > 1, "the swell repeats on one wavelength");

  // It travels, and slowly enough that a 10 fps frame never jumps a pixel.
  assert.notDeepEqual(profile(1.5), still);
  for (let seconds = 0; seconds < 30; seconds += 0.1) {
    for (let worldX = 0; worldX < state.cols; worldX += 0.5) {
      const moved = Math.abs(at(seconds + 0.1, worldX) - at(seconds, worldX)) * cellHeight;
      assert.ok(moved < 1, `the surface moved ${moved.toFixed(2)}px in one frame`);
    }
  }
  assert.equal(waterSurfaceY(state, 7.5), SURFACE_Y_ROWS + at(state.elapsedRealSeconds, 7.5));
});

test("the painted surface re-cuts the water band along that swell", () => {
  for (const orientation of ["landscape", "portrait"]) {
    const state = { ...matureState(orientation, 21), elapsedRealSeconds: 6.4 };
    const scene = render(state);
    const palette = scenePalette(state);
    const metrics = sceneMetrics(scene);
    const spans = scene.objects
      .filter((object) => object.id.startsWith("surface:"))
      .flatMap((object) => object.fill.map((span) => ({ ...span, bounds: object.bounds })));
    assert.ok(spans.length > 0, orientation + " painted no surface");

    const tops = new Set();
    const covered = new Uint8Array(scene.width);
    for (const span of spans) {
      assert.match(span.color, /^#[0-9a-f]{6}$/i);
      // The renderer hands these straight to fillRect while the damage
      // signature hashes them rounded, so fractional edges would let the
      // surface move without ever being repainted.
      assert.ok(Number.isInteger(span.x) && Number.isInteger(span.y));
      assert.ok(Number.isInteger(span.width) && Number.isInteger(span.height));
      assert.ok(span.width > 0 && span.height > 0);
      assert.ok(span.x >= span.bounds.x && span.y >= span.bounds.y);
      assert.ok(span.x + span.width <= span.bounds.x + span.bounds.width);
      assert.ok(span.y + span.height <= span.bounds.y + span.bounds.height);
      // Nothing the surface paints may reach the top of the panel or the
      // second row of water.
      assert.ok(span.y > 0 && span.y + span.height < 2 * metrics.cellHeight);
      tops.add(span.y);
      covered.fill(1, span.x, span.x + span.width);
    }
    // The whole width is re-cut. A gap between neighbouring columns would show
    // as a notch of the old straight band edge.
    assert.ok(covered.every((column) => column === 1), orientation + " left a gap in the surface");
    assert.ok(tops.size > 3, orientation + " painted a straight waterline");

    // Air is uncovered in the troughs and water carried up over the crests,
    // which is what stops the boundary reading as a band edge.
    const colors = new Set(spans.map((span) => span.color));
    assert.ok(colors.has(palette.airBg), orientation + " never opened a trough");
    assert.ok(colors.has(palette.waterBands[0]), orientation + " never raised a crest");
  }
});

test("aquarium plants share the terrain height and visually reach the floor", () => {
  for (const orientation of ["landscape", "portrait"]) {
    const state = matureState(orientation, 147);
    const palette = scenePalette(state);
    const dimensions = orientation === "landscape"
      ? { width: 800, height: 480, logicalWidth: state.cols, logicalHeight: state.rows }
      : { width: 480, height: 800, logicalWidth: state.cols, logicalHeight: state.rows };
    const metrics = sceneMetrics(dimensions);
    const { records } = createPlantRenderRecords(state, palette, metrics, { still: true, interactions: false });

    for (const record of records) {
      const expectedRoot = substrateSurfaceY(state, record.plant.x) + PLANT_ROOT_BURIAL_ROWS;
      const pose = posePlant(record.plant, state);
      assert.ok(Math.abs(pose.root.y - expectedRoot) < 1e-10);

      const firstGlyph = record.glyphs[0];
      const visibleFloor = substrateSurfaceY(state, record.plant.x) * metrics.cellHeight;
      const glyphBottom = firstGlyph.y + CELL_HEIGHT * firstGlyph.scaleY;
      assert.ok(glyphBottom >= visibleFloor - 4, `${record.plant.speciesId} still floats above the floor`);
    }
  }
});
