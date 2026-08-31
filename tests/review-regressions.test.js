import assert from "node:assert/strict";
import test from "node:test";

import {
  plantAttachmentLayout,
  plantGlyphScale,
  plantRenderRecord,
} from "../src/render/plants.js";
import { scenePalette } from "../src/render/palette.js";
import { orientationConfig } from "../src/sim/config.js";
import {
  ACTIVITIES,
  createActivityState,
  schoolSummary,
  socialEngagement,
} from "../src/sim/fish-activities.js";
import { createPlantFrameContext, createPlantSpecimen } from "../src/sim/plants.js";
import { createAquariumState, withSettings } from "../src/sim/state.js";
import { tick } from "../src/sim/tick.js";

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
    const layout = plantAttachmentLayout(record.plant, record.pose, point, metrics, scale);
    assert.ok(layout.progresses.length >= 1);
    // The final bone of an implicit terminal stem is painted like any other:
    // filler along the span and the stem's own ink on the joint that ends it.
    // It must never collapse to a lone tip decoration floating past the bone.
    assert.equal(layout.progresses.at(-1), 1);
    assert.ok(layout.progresses.every((progress) => progress > 0 && progress <= 1));
    assert.ok(
      layout.segmentLengthPixels <= layout.projectedCoveragePixels * 1.4 || layout.progresses.length > 1,
      `terminal stem ${point.index} left a long bone on a single glyph`,
    );
  }

  // Tall forkgrass should still be visually made from its authored stem
  // vocabulary, even though long bones now receive several attachments.
  const stemInk = record.glyphs.filter((glyph) => stemCharacters.has(glyph.char)).length;
  assert.ok(record.attachmentStats.fillerAttachments > 0);
  assert.ok(stemInk >= record.attachmentStats.jointAttachments);
});

test("school engagement comes from nearby school fish, not an empty centroid", () => {
  const base = withSettings(createAquariumState({ orientation: "landscape", seed: 2 }), { timeScale: 3600 });
  const center = schoolSummary(base.school, base);
  const nearestToCenter = Math.min(
    ...base.school.map((fish) => Math.hypot(fish.x - center.x, fish.y - center.y)),
  );
  // Seed 2 starts with a school scattered around an empty middle: the centroid
  // is the shape of the shoal, never a fish that another fish can swim beside.
  assert.ok(nearestToCenter > 5, "seed 2 no longer has an empty school centroid to guard");

  const follow = (x, y) => ({
    ...base,
    individuals: base.individuals.map((fish, index) => index === 0
      ? {
        ...fish,
        x,
        y,
        behavior: { current: "social", previous: "cruise", blend: 0, ageSeconds: 0 },
        activity: { ...createActivityState(ACTIVITIES.schoolFollow), targetType: "school" },
      }
      : fish),
  });

  const atCentroid = follow(center.x, center.y);
  assert.equal(socialEngagement(atCentroid.individuals[0], atCentroid, atCentroid.school), 0);

  const member = base.school[0];
  const beside = follow(member.x + 0.4, member.y);
  assert.ok(socialEngagement(beside.individuals[0], beside, beside.school) > 0);

  // A phantom contact must not relieve the social drive or drift sociability
  // any more than swimming alone in a corner does.
  const alone = tick(follow(1.5, base.rows - 5), 0.1).individuals[0];
  const phantom = tick(atCentroid, 0.1).individuals[0];
  const company = tick(beside, 0.1).individuals[0];
  assert.equal(phantom.drives.social, alone.drives.social);
  assert.equal(phantom.history.sociabilityDrift, alone.history.sociabilityDrift);
  assert.ok(company.drives.social < phantom.drives.social);
  assert.ok(company.history.sociabilityDrift > phantom.history.sociabilityDrift);
});
