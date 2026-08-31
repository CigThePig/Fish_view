import assert from "node:assert/strict";
import test from "node:test";

import { PLANT_SPECIES } from "../src/art/plants.js";
import { glyphPixelRects } from "../src/render/bitmap-font.js";
import {
  MAX_RENDERED_PLANT_GLYPHS,
  MAX_SAMPLES_PER_SEGMENT,
  MAX_STRUCTURAL_GAP_PX,
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

// Continuity is measured against the ink the renderer actually paints, not
// against the layout arithmetic that decided where to paint it. A regression
// that moves glyphs without covering the skeleton cannot satisfy this.
function inkRaster(record) {
  const lit = new Set();
  for (const glyph of record.glyphs) {
    for (const rectangle of glyphPixelRects(glyph)) {
      for (let dy = 0; dy < rectangle.height; dy += 1) {
        for (let dx = 0; dx < rectangle.width; dx += 1) {
          lit.add(`${rectangle.x + dx},${rectangle.y + dy}`);
        }
      }
    }
  }
  return { lit };
}

// A lit pixel within this radius of a point on the skeleton counts as covering
// it. Two strokes this close read as one on the panel; anything further apart
// is a hole the eye finds.
const JOIN_RADIUS_PX = 3;
const DISC = (() => {
  const offsets = [];
  for (let dy = -JOIN_RADIUS_PX; dy <= JOIN_RADIUS_PX; dy += 1) {
    for (let dx = -JOIN_RADIUS_PX; dx <= JOIN_RADIUS_PX; dx += 1) {
      if (dx * dx + dy * dy <= JOIN_RADIUS_PX * JOIN_RADIUS_PX) offsets.push([dx, dy]);
    }
  }
  return offsets;
})();

function inkedAt(raster, x, y) {
  const px = Math.round(x);
  const py = Math.round(y);
  return DISC.some(([dx, dy]) => raster.lit.has(`${px + dx},${py + dy}`));
}

// The longest stretch of one posed bone, in physical pixels, that carries no
// ink at all. A leaf drawn only at its far tip shows up here as the whole
// length of its own bone.
function uninkedRun(record, point, metrics, raster, from = 0, to = 1) {
  const parent = record.pose.points[point.parent];
  if (!parent) return 0;
  const x1 = parent.x * metrics.cellWidth;
  const y1 = parent.y * metrics.cellHeight;
  const x2 = point.x * metrics.cellWidth;
  const y2 = point.y * metrics.cellHeight;
  const length = Math.hypot(x2 - x1, y2 - y1);
  if (length < EPSILON) return 0;
  const steps = Math.max(2, Math.ceil(length));
  let worst = 0;
  let run = 0;
  for (let index = 0; index <= steps; index += 1) {
    const t = from + (to - from) * (index / steps);
    if (inkedAt(raster, x1 + (x2 - x1) * t, y1 + (y2 - y1) * t)) run = 0;
    else {
      run += (length * (to - from)) / steps;
      worst = Math.max(worst, run);
    }
  }
  return worst;
}

function validateContinuity(record, metrics, label) {
  const raster = inkRaster(record);
  const scale = plantGlyphScale(record.plant, record.layerName);
  let sampledSegments = 0;
  for (const point of record.pose.joints) {
    const gap = uninkedRun(record, point, metrics, raster);
    assert.ok(
      gap <= MAX_STRUCTURAL_GAP_PX + EPSILON,
      `${label} bone ${point.index} (${point.role}) leaves ${gap.toFixed(1)}px of skeleton uninked`,
    );

    const layout = plantAttachmentLayout(record.plant, record.pose, point, metrics, scale);
    assert.ok(layout.progresses.length >= 1);
    assert.ok(
      layout.progresses.length <= MAX_SAMPLES_PER_SEGMENT,
      `${label} bone ${point.index} exceeded the sample ceiling`,
    );
    if (layout.progresses.length > 1) sampledSegments += 1;

    // The last sample lands on the joint itself. That is what carries the
    // species' authored ink and what lets the child bone start from ink rather
    // than from a hole.
    assert.ok(
      Math.abs(layout.progresses.at(-1) - 1) <= EPSILON,
      `${label} bone ${point.index} stops short of its own joint`,
    );
    assert.ok(layout.progresses.every((progress, index, all) => index === 0 || progress > all[index - 1]));

    if (point.parent === 0) {
      const rootGap = Math.max(
        0,
        layout.progresses[0] * layout.segmentLengthPixels - layout.projectedCoveragePixels / 2,
      );
      assert.ok(rootGap <= MAX_STRUCTURAL_GAP_PX + EPSILON, `${label} floats ${rootGap.toFixed(2)}px above root`);
    }
  }
  return { sampledSegments };
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

test("every posed bone is inked end to end across sizes, orientations, and currents", () => {
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
          sampledCases += validateContinuity(record, metrics, label).sampledSegments;
          assert.ok(record.glyphs.length >= record.pose.activeJointCount, `${label} lost visible structure`);
          assert.ok(record.glyphs.length <= MAX_RENDERED_PLANT_GLYPHS, `${label} exceeded render ceiling`);
          assert.ok(record.glyphs.every((glyph) => [glyph.x, glyph.y, glyph.scaleX, glyph.scaleY].every(Number.isFinite)));
        }
      }
    }
  }
  assert.ok(sampledCases > 0, "the regression matrix never exercised segment subdivision");
});

// The defect this replaces: a leaf, bead, lantern, or bell bone was treated as
// a single decoration painted at the far end of its own bone, so a mature
// portrait fan grass hung its blades 80px clear of the stem they grow from.
test("leaf and ornament bones are strokes from the stem, not marks floating off it", () => {
  const ornamental = new Set(["leaf", "bell", "bead", "lantern", "tip"]);
  let checked = 0;
  for (const orientation of ["landscape", "portrait"]) {
    for (const [index, species] of PLANT_SPECIES.entries()) {
      const { metrics, record } = specimenRecord(species.id, {
        orientation,
        size: "maximum",
        seed: 601 + index * 13,
      });
      const scale = plantGlyphScale(record.plant, record.layerName);
      const raster = inkRaster(record);
      for (const point of record.pose.joints) {
        if (!ornamental.has(point.role)) continue;
        const layout = plantAttachmentLayout(record.plant, record.pose, point, metrics, scale);
        checked += 1;

        // Ink has to reach back to the joint the ornament grows from. The
        // stem-side half of the bone is exactly what the old renderer left
        // bare when it painted the ornament at the far tip and nowhere else.
        const attachmentGap = uninkedRun(record, point, metrics, raster, 0, 0.5);
        assert.ok(
          attachmentGap <= MAX_STRUCTURAL_GAP_PX + EPSILON,
          `${species.id}/${orientation} ${point.role} ${point.index} detaches ${attachmentGap.toFixed(1)}px from its stem`,
        );
        assert.ok(
          uninkedRun(record, point, metrics, raster) <= MAX_STRUCTURAL_GAP_PX + EPSILON,
          `${species.id}/${orientation} ${point.role} ${point.index} left its own bone bare`,
        );

        // A bone longer than one glyph must actually be subdivided.
        if (layout.segmentLengthPixels > layout.projectedCoveragePixels * 1.4) {
          assert.ok(
            layout.progresses.length > 1,
            `${species.id}/${orientation} ${point.role} ${point.index} stayed a single mark on a long bone`,
          );
        }
      }
    }
  }
  assert.ok(checked > 0, "no ornamental bones were exercised");
});

test("authored ornament ink stays on the joint and is never repeated down the bone", () => {
  const { record } = specimenRecord("lantern-plant", { orientation: "portrait", size: "maximum", seed: 321 });
  const lanterns = record.pose.joints.filter((point) => point.role === "lantern");
  assert.ok(lanterns.length >= 2, "lantern plant lost its lanterns");
  assert.equal(
    record.glyphs.filter((glyph) => glyph.char === "*").length,
    record.pose.joints.filter((point) => point.role === "lantern" || point.role === "tip").length,
    "lantern glyphs were replicated along the stalk",
  );
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

  validateContinuity(seedling.record, seedling.metrics, "tall-forkgrass seedling");
  validateContinuity(mature.record, mature.metrics, "tall-forkgrass mature");
  assert.ok(seedling.record.pose.activeJointCount < mature.record.pose.activeJointCount);
  assert.ok(seedling.record.glyphs.length < mature.record.glyphs.length);
});

test("Tall forkgrass has a continuous grounded trunk while preserving its authored fork", () => {
  const { metrics, record } = specimenRecord("tall-forkgrass", {
    orientation: "landscape",
    size: "maximum",
    seed: 147,
  });
  const coverage = validateContinuity(record, metrics, "tall-forkgrass");
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
  const coverage = validateContinuity(record, metrics, "split-reed");
  const rootChildren = record.pose.joints.filter((point) => point.parent === 0);

  assert.equal(rootChildren.length, 2, "split reed no longer begins as two stems");
  assert.ok(coverage.sampledSegments >= 2, "both long stems were not sampled densely enough");
  assert.ok(record.glyphs.length > record.pose.activeJointCount, "split reed stayed one glyph per joint");
  const tops = rootChildren.map((child) => topOfBranch(record.pose, child.index));
  const physicalSeparation = Math.abs(tops[0].x - tops[1].x) * metrics.cellWidth;
  assert.ok(physicalSeparation > 8, `split reed stems merged to ${physicalSeparation.toFixed(1)}px separation`);
  assert.ok(record.glyphs.length <= MAX_RENDERED_PLANT_GLYPHS);
});
