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
  SURFACE_Y_ROWS,
  substrateSurfaceY,
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
