import assert from "node:assert/strict";
import test from "node:test";

import {
  plantAttachmentLayout,
  plantGlyphScale,
  plantRenderRecord,
} from "../src/render/plants.js";
import { scenePalette } from "../src/render/palette.js";
import { orientationConfig } from "../src/sim/config.js";
import { createPlantFrameContext, createPlantSpecimen } from "../src/sim/plants.js";
import { createAquariumState } from "../src/sim/state.js";

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
  const scale = plantGlyphScale(plant, record.pose.species.layer);
  const terminalStems = record.pose.joints.filter((point) => point.isTip && point.role === "stem");
  const stemCharacters = new Set([
    ...record.pose.species.stemGlyphs.left,
    ...record.pose.species.stemGlyphs.upright,
    ...record.pose.species.stemGlyphs.right,
  ]);

  assert.ok(terminalStems.length > 0);
  for (const point of terminalStems) {
    const layout = plantAttachmentLayout(record.pose, point, metrics, scale);
    assert.equal(layout.structural, true);
    assert.ok(layout.progresses.length >= 1);
    assert.ok(layout.progresses.every((progress) => progress > 0 && progress < 1));
  }

  // Tall forkgrass should still be visually made from its authored stem
  // vocabulary, even though long bones may now receive multiple attachments.
  const structuralCount = record.attachmentStats.structuralAttachments;
  assert.ok(structuralCount > 0);
  assert.ok(record.glyphs.filter((glyph) => stemCharacters.has(glyph.char)).length >= structuralCount - 1);
});
