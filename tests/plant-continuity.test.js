import assert from "node:assert/strict";
import test from "node:test";

import { PLANT_SPECIES } from "../src/art/plants.js";
import {
  MAX_RENDERED_PLANT_GLYPHS,
  MAX_STRUCTURAL_GAP_PX,
  MAX_STRUCTURAL_SAMPLES_PER_SEGMENT,
  plantAttachmentLayout,
  plantGlyphScale,
  plantRenderRecord,
} from "../src/render/plants.js";
import { scenePalette } from "../src/render/palette.js";
import { orientationConfig } from "../src/sim/config.js";
import { createPlantFrameContext, createPlantSpecimen } from "../src/sim/plants.js";
import { createAquariumState } from "../src/sim/state.js";

const EPSILON = 1e-6;

function specimenRecord(speciesId, {
  orientation = "landscape",
  size = "maximum",
  currentMultiplier = 0,
  seed = 901,
  ageDays = 200,
} = {}) {
  const target = orientationConfig(orientation);
  const state = {
    ...createAquariumState({ orientation, seed, wallClockHours: 12 }),
    elapsedRealSeconds: 6.3,
    individuals: [],
    reaction: null,
  };
  const metrics = {
    cellWidth: target.pixelWidth / target.cols,
    cellHeight: target.pixelHeight / target.rows,
  };
  const plant = createPlantSpecimen({
    speciesId,
    seed,
    x: target.cols / 2,
    ageDays,
    rows: target.rows,
    size,
  });
  const frameContext = createPlantFrameContext(state, {
    currentMultiplier,
    still: currentMultiplier === 0,
    interactions: false,
  });
  return {
    metrics,
    plant,
    record: plantRenderRecord(plant, 0, state, scenePalette(state), metrics, { frameContext, ageDays }),
  };
}

function coverageProgresses(layout) {
  const progresses = [...layout.progresses];
  if (layout.authoredStructuralGlyph && !progresses.includes(1)) progresses.push(1);
  return progresses.sort((left, right) => left - right);
}

function maximumUncoveredGap(layout) {
  if (!layout.structural || layout.segmentLengthPixels <= EPSILON) return 0;
  const progresses = coverageProgresses(layout);
  const radius = layout.projectedCoveragePixels / 2;
  let maximum = Math.max(
    0,
    progresses[0] * layout.segmentLengthPixels - radius,
    (1 - progresses.at(-1)) * layout.segmentLengthPixels - radius,
  );
  for (let index = 1; index < progresses.length; index += 1) {
    maximum = Math.max(
      maximum,
      (progresses[index] - progresses[index - 1]) * layout.segmentLengthPixels
        - layout.projectedCoveragePixels,
    );
  }
  return maximum;
}

function validateStructuralCoverage(record, metrics, label) {
  const scale = plantGlyphScale(record.plant, record.layerName);
  let sampledSegments = 0;
  let structuralSegments = 0;
  for (const point of record.pose.joints) {
    const layout = plantAttachmentLayout(record.pose, point, metrics, scale);
    if (!layout.structural) {
      assert.deepEqual(layout.progresses, [1], `${label} replicated decorative point ${point.index}`);
      continue;
    }

    structuralSegments += 1;
    assert.ok(layout.progresses.length >= 1);
    assert.ok(layout.progresses.length <= MAX_STRUCTURAL_SAMPLES_PER_SEGMENT);
    if (layout.progresses.length > 1) sampledSegments += 1;

    const gap = maximumUncoveredGap(layout);
    assert.ok(
      gap <= MAX_STRUCTURAL_GAP_PX + EPSILON,
      `${label} segment ${point.index} leaves ${gap.toFixed(2)}px uncovered`,
    );

    // A segment that one glyph already covers must not receive filler merely
    // because the species is mature. Density is driven by rendered length.
    if (layout.segmentLengthPixels <= layout.projectedCoveragePixels + MAX_STRUCTURAL_GAP_PX + EPSILON) {
      assert.equal(layout.progresses.length, 1, `${label} oversampled short segment ${point.index}`);
    }

    if (point.parent === 0) {
      assert.ok(layout.progresses[0] <= 0.3, `${label} starts too far above the root`);
      const rootGap = Math.max(
        0,
        layout.progresses[0] * layout.segmentLengthPixels - layout.projectedCoveragePixels / 2,
      );
      assert.ok(rootGap <= MAX_STRUCTURAL_GAP_PX + EPSILON, `${label} floats ${rootGap.toFixed(2)}px above root`);
    }
  }
  return { sampledSegments, structuralSegments };
}

function topOfBranch(pose, rootChildIndex) {
  const belongsToBranch = (point) => {
    let current = point;
    while (current && current.parent > 0) {
      if (current.index === rootChildIndex) return true;
      current = pose.points[current.parent];
    }
    return current?.index === rootChildIndex;
  };
  return pose.joints
    .filter(belongsToBranch)
    .reduce((top, point) => (point.y < top.y ? point : top));
}

test("all species keep structural bones visually covered across sizes, orientations, and currents", () => {
  let sampledCases = 0;
  for (const orientation of ["landscape", "portrait"]) {
    for (const size of ["minimum", "typical", "maximum"]) {
      for (const currentMultiplier of [0, 1, 1.85]) {
        for (const [index, species] of PLANT_SPECIES.entries()) {
          const { metrics, record } = specimenRecord(species.id, {
            orientation,
            size,
            currentMultiplier,
            seed: 701 + index * 17,
          });
          const label = `${species.id}/${orientation}/${size}/current-${currentMultiplier}`;
          const coverage = validateStructuralCoverage(record, metrics, label);
          sampledCases += coverage.sampledSegments;
          assert.ok(record.glyphs.length >= record.pose.activeJointCount, `${label} lost visible structure`);
          assert.ok(record.glyphs.length <= MAX_RENDERED_PLANT_GLYPHS, `${label} exceeded render ceiling`);
          assert.ok(record.glyphs.every((glyph) => [glyph.x, glyph.y, glyph.scaleX, glyph.scaleY].every(Number.isFinite)));
        }
      }
    }
  }
  assert.ok(sampledCases > 0, "the regression matrix never exercised segment subdivision");
});

test("growth samples only the posed portion of a developing bone", () => {
  const seedling = specimenRecord("tall-forkgrass", {
    orientation: "landscape",
    size: "maximum",
    seed: 777,
    ageDays: 2,
  });
  const mature = specimenRecord("tall-forkgrass", {
    orientation: "landscape",
    size: "maximum",
    seed: 777,
    ageDays: 200,
  });

  validateStructuralCoverage(seedling.record, seedling.metrics, "tall-forkgrass seedling");
  validateStructuralCoverage(mature.record, mature.metrics, "tall-forkgrass mature");
  assert.ok(seedling.record.pose.activeJointCount < mature.record.pose.activeJointCount);
  assert.ok(seedling.record.glyphs.length < mature.record.glyphs.length);
});

test("Tall forkgrass has a continuous grounded trunk while preserving its authored fork", () => {
  const { metrics, record } = specimenRecord("tall-forkgrass", {
    orientation: "landscape",
    size: "maximum",
    seed: 147,
  });
  const coverage = validateStructuralCoverage(record, metrics, "tall-forkgrass");
  const fork = record.pose.joints.find((point) => point.role === "fork");
  assert.ok(fork, "fork marker disappeared");
  const children = record.pose.joints.filter((point) => point.parent === fork.index);

  assert.ok(coverage.sampledSegments > 0, "tall forkgrass never received extra structural ink");
  assert.ok(record.glyphs.length > record.pose.activeJointCount, "glyph count stayed locked to joint count");
  assert.equal(record.glyphs.filter((glyph) => glyph.char === "Y").length, 1, "fork marker was replicated");
  assert.ok(children.length >= 2, "fork topology collapsed");
  assert.ok(
    Math.max(...children.map((point) => point.x)) - Math.min(...children.map((point) => point.x)) > 0.2,
    "fork branches collapsed into one column",
  );
});

test("Split reed keeps two separately covered stems rooted in the same substrate region", () => {
  const { metrics, record } = specimenRecord("split-reed", {
    orientation: "landscape",
    size: "maximum",
    seed: 83,
  });
  const coverage = validateStructuralCoverage(record, metrics, "split-reed");
  const rootChildren = record.pose.joints.filter((point) => point.parent === 0);

  assert.equal(rootChildren.length, 2, "split reed no longer begins as two stems");
  assert.ok(coverage.sampledSegments >= 2, "both long stems were not sampled densely enough");
  assert.ok(record.glyphs.length > record.pose.activeJointCount, "split reed stayed one glyph per joint");
  const tops = rootChildren.map((child) => topOfBranch(record.pose, child.index));
  const physicalSeparation = Math.abs(tops[0].x - tops[1].x) * metrics.cellWidth;
  assert.ok(physicalSeparation > 8, `split reed stems merged to ${physicalSeparation.toFixed(1)}px separation`);
  assert.ok(record.glyphs.length <= MAX_RENDERED_PLANT_GLYPHS);
});
