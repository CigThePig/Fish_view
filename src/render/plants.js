import { MAX_PLANT_JOINTS } from "../art/plants.js";
import { CELL_HEIGHT, CELL_WIDTH } from "../sim/config.js";
import { sample01 } from "../sim/prng.js";
import { createPlantFrameContext, posePlant } from "../sim/plants.js";
import { glyphInkExtent } from "./bitmap-font.js";
import { addGlyphObject, positionedGlyph } from "./scene.js";

// Simulation joints deliberately stay sparse, but a bone is a length, not a
// point: every posed bone is inked along its whole span so the plant reads as a
// connected stroke instead of a constellation of marks. Sampling is driven by
// the glyph's own projected ink at the current scale and is statically bounded.
export const MAX_SAMPLES_PER_SEGMENT = 8;
export const MAX_RENDERED_PLANT_GLYPHS = MAX_PLANT_JOINTS * MAX_SAMPLES_PER_SEGMENT;

// Consecutive samples on one bone overlap slightly. Sampling always lands a
// glyph on the child joint itself, so the parent's own joint glyph closes the
// far end and bones join without a seam at the shared joint.
export const SAMPLE_OVERLAP = 0.82;

// The residual allowance used by the continuity tests: the largest stretch of a
// bone that may carry no ink. The 5x7 font has 21px of vertical ink inside its
// 24px authoring cell, so a few pixels read as a join and a whole blank text row
// does not.
export const MAX_STRUCTURAL_GAP_PX = 6;

function seededChoice(values, seed, salt) {
  return values[Math.floor(sample01(seed, salt) * values.length) % values.length];
}

function stemGlyph(species, point, seed) {
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
  return seededChoice(family, seed, 410 + point.index * 3);
}

// Leaf and petal bones are not part of the species' stem vocabulary, so their
// filler follows the bone's real on-screen slope instead. Cells are twice as
// tall as they are wide, so the decision has to be made in pixels: a bone that
// looks diagonal in world units is nearly upright once it is drawn.
function strokeGlyphForSlope(dxPixels, dyPixels) {
  const horizontal = Math.abs(dxPixels);
  const vertical = Math.abs(dyPixels);
  if (vertical > horizontal * 2.2) return "|";
  if (horizontal > vertical * 2.2) return "-";
  return dxPixels * dyPixels < 0 ? "/" : "\\";
}

// The filler glyph for the span leading into a joint. One bone gets one stroke
// so it reads as a single continuous line; the joint itself keeps its authored
// ink, which is the only place a species' punctuation belongs.
export function fillerGlyph(pose, point, seed, dxPixels, dyPixels) {
  if (point.role === "leaf" || point.role === "bell") return strokeGlyphForSlope(dxPixels, dyPixels);
  return stemGlyph(pose.species, point, seed);
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

// How far one glyph's ink reaches along a bone. Ink is a box, so travelling
// along the bone exhausts whichever axis of that box runs out first: a pipe is
// twenty-one rows tall but only two columns wide, so it carries a vertical bone
// a long way and a diagonal one barely at all. Summing the two projections
// instead would credit that pipe with bridging a sideways offset it never
// paints, which is how leaves ended up hanging clear of their stems.
function projectedInkCoveragePixels(metrics, dxPixels, dyPixels, scale, char) {
  const segmentLength = Math.hypot(dxPixels, dyPixels);
  if (segmentLength <= 1e-9) return Number.POSITIVE_INFINITY;
  const unitX = Math.abs(dxPixels) / segmentLength;
  const unitY = Math.abs(dyPixels) / segmentLength;
  const extent = glyphInkExtent(char);
  const inkWidth = extent.width * (metrics.cellWidth / CELL_WIDTH) * scale;
  const inkHeight = extent.height * (metrics.cellHeight / CELL_HEIGHT) * scale;
  const alongX = unitX <= 1e-9 ? Number.POSITIVE_INFINITY : inkWidth / unitX;
  const alongY = unitY <= 1e-9 ? Number.POSITIVE_INFINITY : inkHeight / unitY;
  return Math.max(1, Math.min(alongX, alongY));
}

// Two neighbouring glyphs bridge the distance between them with half of each
// one's ink, so the allowance for a step depends on the pair that step joins.
// This is what stops a short leaf bone ending in a hyphen - three pixels of ink
// where a pipe has twenty-one - from being declared covered by one glyph.
function pairAllowance(left, right) {
  return ((left + right) / 2) * SAMPLE_OVERLAP;
}

function sampleCountForSpan(span, entryCoverage, fillerCoverage, jointCoverage, limit) {
  for (let steps = 1; steps < limit; steps += 1) {
    const step = span / steps;
    // With one step the bone runs straight from its parent's ink to its own
    // joint; with more, the interior steps join filler to filler.
    const entry = pairAllowance(entryCoverage, steps === 1 ? jointCoverage : fillerCoverage);
    const exit = pairAllowance(steps === 1 ? entryCoverage : fillerCoverage, jointCoverage);
    const interior = steps > 2 ? fillerCoverage * SAMPLE_OVERLAP : Number.POSITIVE_INFINITY;
    if (step <= Math.min(entry, exit, interior)) return steps;
  }
  return Math.max(1, limit);
}

// This is the render-resolution boundary of the plant system. The pose stays a
// sparse hierarchy; this helper decides where along one posed bone glyphs have
// to land for the bone to read as a continuous stroke at the current scale.
//
// The last sample is always the joint itself, which is where the species' own
// authored ink belongs, and which is also the point the child bone starts from.
// Bones therefore meet at their shared joint and the chain has no seams.
export function plantAttachmentLayout(plant, pose, point, metrics, baseScale) {
  const parent = pose.points[point.parent];
  if (!parent) {
    return {
      grounded: false,
      progresses: [1],
      fillerChar: null,
      jointChar: glyphForPlantJoint(plant, pose, point),
      scaleX: baseScale,
      scaleY: baseScale,
      segmentLengthPixels: 0,
      projectedCoveragePixels: 0,
    };
  }

  const dxPixels = (point.x - parent.x) * metrics.cellWidth;
  const dyPixels = (point.y - parent.y) * metrics.cellHeight;
  const segmentLengthPixels = Math.hypot(dxPixels, dyPixels);

  const fillerChar = fillerGlyph(pose, point, plant.seed, dxPixels, dyPixels);
  const jointChar = glyphForPlantJoint(plant, pose, point);
  const coverage = (char) => projectedInkCoveragePixels(metrics, dxPixels, dyPixels, baseScale, char);
  const fillerCoverage = coverage(fillerChar);
  const jointCoverage = coverage(jointChar);

  // The root carries no glyph of its own, so a bone rising out of the substrate
  // has to place its own first sample low enough to touch the ground rather
  // than starting a coverage step above it. Every other bone starts from the
  // ink its parent already painted on their shared joint.
  const grounded = point.parent === 0;
  const entryCoverage = grounded
    ? fillerCoverage
    : coverage(glyphForPlantJoint(plant, pose, parent));
  const startProgress = grounded && segmentLengthPixels > 1e-9
    ? Math.min(0.5, (fillerCoverage * 0.3) / segmentLengthPixels)
    : 0;

  const span = (1 - startProgress) * segmentLengthPixels;
  const limit = MAX_SAMPLES_PER_SEGMENT - (grounded ? 1 : 0);
  const steps = sampleCountForSpan(span, entryCoverage, fillerCoverage, jointCoverage, limit);

  const progresses = grounded ? [startProgress] : [];
  for (let step = 1; step <= steps; step += 1) {
    progresses.push(startProgress + (1 - startProgress) * (step / steps));
  }

  return {
    grounded,
    progresses,
    fillerChar,
    jointChar,
    scaleX: baseScale,
    scaleY: baseScale,
    segmentLengthPixels,
    projectedCoveragePixels: Math.min(fillerCoverage, jointCoverage),
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
  let jointAttachments = 0;
  let fillerAttachments = 0;
  let maximumAttachmentsPerSegment = 0;

  for (const point of pose.joints) {
    const parent = pose.points[point.parent];
    const layout = plantAttachmentLayout(plant, pose, point, metrics, scale);
    const fg = colorForPoint(plant, pose, point, palette);

    if (!parent) {
      glyphs.push(positionedGlyph(metrics, {
        char: layout.jointChar,
        worldX: point.x,
        worldY: point.y,
        fg,
        scaleX: scale,
        scaleY: scale,
      }));
      jointAttachments += 1;
      maximumAttachmentsPerSegment = Math.max(maximumAttachmentsPerSegment, 1);
      continue;
    }

    const terminal = layout.progresses.length - 1;

    for (let attachmentIndex = 0; attachmentIndex < layout.progresses.length; attachmentIndex += 1) {
      // Only the sample that lands on the joint carries the species' authored
      // ink: a fork's Y, a lantern's *, a leaf's blade. Everything before it is
      // the stroke that leads into it, which is what makes the bone visible.
      const isJoint = attachmentIndex === terminal;
      glyphs.push(glyphAtProgress(metrics, point, parent, layout.progresses[attachmentIndex], {
        char: isJoint ? layout.jointChar : layout.fillerChar,
        fg,
        scaleX: layout.scaleX,
        scaleY: layout.scaleY,
      }));
      if (isJoint) jointAttachments += 1;
      else fillerAttachments += 1;
    }

    maximumAttachmentsPerSegment = Math.max(maximumAttachmentsPerSegment, layout.progresses.length);
  }

  return {
    id,
    plant,
    layerName: pose.species.layer,
    glyphs,
    pose,
    renderScale: scale,
    attachmentStats: {
      jointAttachments,
      fillerAttachments,
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
    jointAttachments: records.reduce((sum, record) => sum + record.attachmentStats.jointAttachments, 0),
    fillerAttachments: records.reduce((sum, record) => sum + record.attachmentStats.fillerAttachments, 0),
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
