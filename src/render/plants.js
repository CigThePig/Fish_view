import { MAX_PLANT_JOINTS } from "../art/plants.js";
import { CELL_HEIGHT, CELL_WIDTH } from "../sim/config.js";
import { sample01 } from "../sim/prng.js";
import { createPlantFrameContext, posePlant } from "../sim/plants.js";
import { GLYPH_PIXEL_HEIGHT, GLYPH_PIXEL_WIDTH } from "./bitmap-font.js";
import { addGlyphObject, positionedGlyph } from "./scene.js";

// Simulation joints deliberately stay sparse. Rendering may add a second stem
// glyph to a long structural bone, but never more than two sampled fillers.
// An explicitly authored structural marker such as Y may add one endpoint glyph,
// so the absolute algorithmic ceiling remains tiny and statically bounded.
export const MAX_STRUCTURAL_SAMPLES_PER_SEGMENT = 2;
export const MAX_RENDERED_PLANT_GLYPHS = MAX_PLANT_JOINTS * (MAX_STRUCTURAL_SAMPLES_PER_SEGMENT + 1);

// This is an uncovered physical-pixel allowance, not a target glyph spacing.
// The 5x7 font has 21px of vertical ink inside its 24px authoring cell. A small
// gap is perceptually continuous at panel distance; a whole blank text row is
// not. Sampling uses the actual posed length and scaled ink projection below.
export const MAX_STRUCTURAL_GAP_PX = 12;

const STRUCTURAL_STRETCH_PER_WORLD_UNIT = 0.3;
const STRUCTURAL_SCALE_CAP = 1.35;

function seededChoice(values, seed, salt) {
  return values[Math.floor(sample01(seed, salt) * values.length) % values.length];
}

function stemGlyph(species, point, seed, attachmentIndex = 0) {
  // Geometry moves freely, but only a conservative portion of that bend is
  // allowed to affect glyph choice. This keeps orientation readable without
  // flickering between punctuation at every current zero-crossing.
  const displayAngle = point.restAngle + (point.angle - point.restAngle) * 0.34;
  const horizontal = Math.cos(displayAngle);
  const family = horizontal > 0.28
    ? species.stemGlyphs.right
    : horizontal < -0.28
      ? species.stemGlyphs.left
      : species.stemGlyphs.upright;
  return seededChoice(family, seed, 410 + point.index * 3 + attachmentIndex);
}

export function glyphForPlantJoint(plant, pose, point) {
  const species = pose.species;
  if (point.glyph) {
    return Array.isArray(point.glyph)
      ? seededChoice(point.glyph, plant.seed, 430 + point.index)
      : point.glyph;
  }
  // isTip is also used for an ordinary stem that merely has no active child.
  // Those implicit terminal stems still have to paint the final bone; only an
  // explicitly authored tip role should switch from stem ink to tip punctuation.
  if (point.role === "tip") {
    return seededChoice(species.tipGlyphs, plant.seed, 450 + point.index);
  }
  return stemGlyph(species, point, plant.seed);
}

// The three authored depth groups differ in size as well as colour so the
// garden occupies a volume. Segment sampling compensates for the smaller far
// glyphs, so background plants no longer need to sit on an artificial scale
// floor merely to keep a one-glyph-per-joint stem from turning into dashes.
export function plantGlyphScale(plant, layer) {
  const base = layer === "background" ? 0.76 : layer === "foreground" ? 1.12 : 0.9;
  const spread = layer === "midground" ? 0.12 : 0.09;
  return base + (sample01(plant.seed, 470) - 0.5) * spread;
}

function colorForPoint(plant, pose, point, palette) {
  const species = pose.species;
  const slot = (species.paletteSlot + plant.paletteSlot + (sample01(plant.seed, 480 + point.index) > 0.87 ? 1 : 0)) % 3;
  const specialTip = point.isTip || point.role === "tip" || point.role === "lantern" || point.role === "bell";
  if (species.glowTips && specialTip) return palette.plants.glowTip;
  if (specialTip && point.maturity < 0.78) return palette.plants.growthTip;
  return palette.plants[species.layer][slot];
}

function structuralPoint(point) {
  return !point.glyph || point.role === "stem" || point.role === "fork";
}

function structuralScale(baseScale, span) {
  return Math.min(
    STRUCTURAL_SCALE_CAP,
    baseScale * (1 + Math.abs(span) * STRUCTURAL_STRETCH_PER_WORLD_UNIT),
  );
}

function projectedInkCoveragePixels(metrics, dxPixels, dyPixels, scaleX, scaleY) {
  const segmentLength = Math.hypot(dxPixels, dyPixels);
  if (segmentLength <= 1e-9) return Number.POSITIVE_INFINITY;
  const unitX = Math.abs(dxPixels) / segmentLength;
  const unitY = Math.abs(dyPixels) / segmentLength;
  const inkWidth = GLYPH_PIXEL_WIDTH * (metrics.cellWidth / CELL_WIDTH) * scaleX;
  const inkHeight = GLYPH_PIXEL_HEIGHT * (metrics.cellHeight / CELL_HEIGHT) * scaleY;
  return unitX * inkWidth + unitY * inkHeight;
}

function structuralProgresses(point, sampleCount) {
  if (sampleCount <= 1) return [point.parent === 0 ? 0.3 : 0.5];
  // Keep the first root attachment low enough to read as planted while spacing
  // the pair evenly enough that maximum-height portrait stems do not reopen an
  // internal hole. Other bones use symmetric quarter points.
  return point.parent === 0 ? [0.2, 0.72] : [0.25, 0.75];
}

function singleAttachmentGap(point, segmentLengthPixels, projectedCoveragePixels) {
  const progress = point.parent === 0 ? 0.3 : 0.5;
  const edgeDistance = Math.max(progress, 1 - progress) * segmentLengthPixels;
  return Math.max(0, edgeDistance - projectedCoveragePixels / 2);
}

// This is the render-resolution boundary of the plant system. The pose remains
// a sparse hierarchy; this helper decides how much typographic ink one posed
// bone needs at the current physical glyph scale. Tests use the same layout to
// verify coverage rather than pinning a particular attachment count.
export function plantAttachmentLayout(pose, point, metrics, baseScale) {
  const parent = pose.points[point.parent];
  if (!parent) {
    return {
      structural: false,
      authoredStructuralGlyph: false,
      progresses: [1],
      scaleX: baseScale,
      scaleY: baseScale,
      segmentLengthPixels: 0,
      projectedCoveragePixels: 0,
    };
  }

  const structural = structuralPoint(point);
  if (!structural) {
    return {
      structural: false,
      authoredStructuralGlyph: false,
      progresses: [1],
      scaleX: baseScale,
      scaleY: baseScale,
      segmentLengthPixels: Math.hypot(
        (point.x - parent.x) * metrics.cellWidth,
        (point.y - parent.y) * metrics.cellHeight,
      ),
      projectedCoveragePixels: 0,
    };
  }

  const dx = point.x - parent.x;
  const dy = point.y - parent.y;
  const scaleX = structuralScale(baseScale, dx);
  const scaleY = structuralScale(baseScale, dy);
  const dxPixels = dx * metrics.cellWidth;
  const dyPixels = dy * metrics.cellHeight;
  const segmentLengthPixels = Math.hypot(dxPixels, dyPixels);
  const projectedCoveragePixels = projectedInkCoveragePixels(
    metrics,
    dxPixels,
    dyPixels,
    scaleX,
    scaleY,
  );
  // Measure the actual one-glyph placement instead of assuming every sample is
  // centred. The grounded first glyph deliberately sits at 30% of its bone, so
  // its child-side gap can require subdivision sooner than an ordinary segment.
  const sampleCount = singleAttachmentGap(point, segmentLengthPixels, projectedCoveragePixels)
      <= MAX_STRUCTURAL_GAP_PX
    ? 1
    : MAX_STRUCTURAL_SAMPLES_PER_SEGMENT;

  return {
    structural: true,
    authoredStructuralGlyph: Boolean(point.glyph),
    progresses: structuralProgresses(point, sampleCount),
    scaleX,
    scaleY,
    segmentLengthPixels,
    projectedCoveragePixels,
  };
}

function glyphAtProgress(metrics, point, parent, progress, {
  char,
  fg,
  scaleX,
  scaleY,
}) {
  return positionedGlyph(metrics, {
    char,
    worldX: parent.x + (point.x - parent.x) * progress,
    worldY: parent.y + (point.y - parent.y) * progress,
    fg,
    scaleX,
    scaleY,
  });
}

export function plantRenderRecord(plant, index, state, palette, metrics, {
  frameContext = createPlantFrameContext(state),
  ageDays = plant.ageDays,
  quality = 1,
  disturbanceOverride = null,
  id = `plant:${index}:${plant.seed}`,
} = {}) {
  const pose = posePlant(plant, state, {
    frameContext,
    ageDays,
    quality,
    disturbanceOverride,
  });
  const scale = plantGlyphScale(plant, pose.species.layer);
  const glyphs = [];
  let structuralAttachments = 0;
  let decorativeAttachments = 0;
  let maximumAttachmentsPerSegment = 0;

  for (const point of pose.joints) {
    const parent = pose.points[point.parent];
    const layout = plantAttachmentLayout(pose, point, metrics, scale);
    const fg = colorForPoint(plant, pose, point, palette);

    if (!layout.structural || !parent) {
      glyphs.push(positionedGlyph(metrics, {
        char: glyphForPlantJoint(plant, pose, point),
        worldX: point.x,
        worldY: point.y,
        fg,
        scaleX: scale,
        scaleY: scale,
      }));
      decorativeAttachments += 1;
      maximumAttachmentsPerSegment = Math.max(maximumAttachmentsPerSegment, 1);
      continue;
    }

    for (let attachmentIndex = 0; attachmentIndex < layout.progresses.length; attachmentIndex += 1) {
      glyphs.push(glyphAtProgress(metrics, point, parent, layout.progresses[attachmentIndex], {
        char: stemGlyph(pose.species, point, plant.seed, attachmentIndex),
        fg,
        scaleX: layout.scaleX,
        scaleY: layout.scaleY,
      }));
      structuralAttachments += 1;
    }

    // A fork marker is structural information, not a leaf decoration. Keep it
    // authored exactly once at the actual joint while sampled stem glyphs cover
    // the bone that leads into it. This preserves Y-shaped topology without
    // repeating Y down the branch.
    if (layout.authoredStructuralGlyph) {
      glyphs.push(glyphAtProgress(metrics, point, parent, 1, {
        char: glyphForPlantJoint(plant, pose, point),
        fg,
        scaleX: scale,
        scaleY: scale,
      }));
      structuralAttachments += 1;
    }

    maximumAttachmentsPerSegment = Math.max(
      maximumAttachmentsPerSegment,
      layout.progresses.length + (layout.authoredStructuralGlyph ? 1 : 0),
    );
  }

  return {
    id,
    plant,
    layerName: pose.species.layer,
    glyphs,
    pose,
    renderScale: scale,
    attachmentStats: {
      structuralAttachments,
      decorativeAttachments,
      maximumAttachmentsPerSegment,
    },
  };
}

export function createPlantRenderRecords(state, palette, metrics, options = {}) {
  const frameContext = options.frameContext ?? createPlantFrameContext(state, options);
  const records = state.plants.map((plant, index) => plantRenderRecord(
    plant,
    index,
    state,
    palette,
    metrics,
    { ...options, frameContext },
  ));
  const diagnostics = {
    instances: records.length,
    activeJoints: records.reduce((sum, record) => sum + record.pose.activeJointCount, 0),
    glyphs: records.reduce((sum, record) => sum + record.glyphs.length, 0),
    maximumActiveJoints: records.reduce((maximum, record) => Math.max(maximum, record.pose.activeJointCount), 0),
    maximumGlyphs: records.reduce((maximum, record) => Math.max(maximum, record.glyphs.length, 0), 0),
    structuralCapacity: records.reduce((sum, record) => sum + record.pose.maximumJointCount, 0),
    structuralAttachments: records.reduce((sum, record) => sum + record.attachmentStats.structuralAttachments, 0),
    decorativeAttachments: records.reduce((sum, record) => sum + record.attachmentStats.decorativeAttachments, 0),
    maximumAttachmentsPerSegment: records.reduce(
      (maximum, record) => Math.max(maximum, record.attachmentStats.maximumAttachmentsPerSegment),
      0,
    ),
    background: records.filter((record) => record.layerName === "background").length,
    midground: records.filter((record) => record.layerName === "midground").length,
    foreground: records.filter((record) => record.layerName === "foreground").length,
  };
  return { records, diagnostics, frameContext };
}

export function addPlantRecord(builder, record, layer) {
  return addGlyphObject(builder, {
    id: record.id,
    layer,
    glyphs: record.glyphs,
    padding: 1,
  });
}

export function skeletonLinesForRecord(record, metrics) {
  const lines = [];
  for (const point of record.pose.joints) {
    const parent = record.pose.points[point.parent];
    if (!parent) continue;
    lines.push({
      x1: parent.x * metrics.cellWidth,
      y1: parent.y * metrics.cellHeight,
      x2: point.x * metrics.cellWidth,
      y2: point.y * metrics.cellHeight,
    });
  }
  return lines;
}
