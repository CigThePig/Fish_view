import assert from "node:assert/strict";
import test from "node:test";

import { plantRenderRecord } from "../src/render/plants.js";
import { scenePalette } from "../src/render/palette.js";
import { CELL_HEIGHT, CELL_WIDTH, orientationConfig } from "../src/sim/config.js";
import { createPlantFrameContext, createPlantSpecimen } from "../src/sim/plants.js";
import { createAquariumState } from "../src/sim/state.js";

function glyphWorldCentre(glyph, metrics) {
  return {
    x: (glyph.x + CELL_WIDTH * glyph.scaleX / 2) / metrics.cellWidth,
    y: (glyph.y + CELL_HEIGHT * glyph.scaleY / 2) / metrics.cellHeight,
  };
}

test("implicit terminal stems stay structural instead of becoming detached tip decorations", () => {
  const state = {
    ...createAquariumState({ orientation: "portrait", seed: 147, wallClockHours: 12 }),
    individuals: [],
    reaction: null,
  };
  const target = orientationConfig("portrait");
  const metrics = {
    cellWidth: target.pixelWidth / target.cols,
    cellHeight: target.pixelHeight / target.rows,
  };
  const plant = createPlantSpecimen({
    speciesId: "tall-forkgrass",
    seed: 147,
    x: 20,
    ageDays: 200,
    rows: state.rows,
    size: "maximum",
  });
  const frameContext = createPlantFrameContext(state, {
    currentMultiplier: 0,
    still: true,
    interactions: false,
  });
  const record = plantRenderRecord(plant, 0, state, scenePalette(state), metrics, { frameContext });
  const stemCharacters = new Set([
    ...record.pose.species.stemGlyphs.left,
    ...record.pose.species.stemGlyphs.upright,
    ...record.pose.species.stemGlyphs.right,
  ]);
  const terminalStems = record.pose.joints
    .map((point, glyphIndex) => ({ point, glyph: record.glyphs[glyphIndex] }))
    .filter(({ point }) => point.isTip && point.role === "stem");

  assert.ok(terminalStems.length > 0);
  for (const { point, glyph } of terminalStems) {
    const parent = record.pose.points[point.parent];
    const centre = glyphWorldCentre(glyph, metrics);
    const midpoint = {
      x: parent.x + (point.x - parent.x) * 0.5,
      y: parent.y + (point.y - parent.y) * 0.5,
    };
    assert.ok(stemCharacters.has(glyph.char), `${glyph.char} should remain structural stem ink`);
    assert.ok(Math.abs(centre.x - midpoint.x) < 1e-9);
    assert.ok(Math.abs(centre.y - midpoint.y) < 1e-9);
    assert.ok(glyph.scaleY > 1.1, "long portrait terminal stem should retain structural stretch");
  }
});
