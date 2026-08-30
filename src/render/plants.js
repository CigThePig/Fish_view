import { sample01 } from "../sim/prng.js";
import { createPlantFrameContext, posePlant } from "../sim/plants.js";
import { addGlyphObject, positionedGlyph } from "./scene.js";

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
  return seededChoice(family, seed, 410 + point.index);
}

export function glyphForPlantJoint(plant, pose, point) {
  const species = pose.species;
  if (point.glyph) {
    return Array.isArray(point.glyph)
      ? seededChoice(point.glyph, plant.seed, 430 + point.index)
      : point.glyph;
  }
  if (point.isTip || point.role === "tip") {
    return seededChoice(species.tipGlyphs, plant.seed, 450 + point.index);
  }
  return stemGlyph(species, point, plant.seed);
}

function glyphScale(plant, layer) {
  const base = layer === "background" ? 0.82 : layer === "foreground" ? 0.97 : 0.9;
  return base + (sample01(plant.seed, 470) - 0.5) * 0.06;
}

function colorForPoint(plant, pose, point, palette) {
  const species = pose.species;
  const slot = (species.paletteSlot + plant.paletteSlot + (sample01(plant.seed, 480 + point.index) > 0.87 ? 1 : 0)) % 3;
  const specialTip = point.isTip || point.role === "tip" || point.role === "lantern" || point.role === "bell";
  if (species.glowTips && specialTip) return palette.plants.glowTip;
  if (specialTip && point.maturity < 0.78) return palette.plants.growthTip;
  return palette.plants[species.layer][slot];
}

function placementForPoint(pose, point, baseScale) {
  const parent = pose.points[point.parent];
  if (!parent) {
    return { worldX: point.x, worldY: point.y, scaleX: baseScale, scaleY: baseScale };
  }

  const endpointDecoration = point.isTip
    || point.role === "tip"
    || point.role === "lantern"
    || point.role === "bell"
    || point.role === "bead";
  if (endpointDecoration) {
    return { worldX: point.x, worldY: point.y, scaleX: baseScale, scaleY: baseScale };
  }

  // A joint is the end of a skeletal segment, but drawing every glyph only at
  // those ends left the large portrait plants looking like dotted lines. Place
  // ordinary segment glyphs on their bone instead. The first segment sits
  // deliberately closer to its buried root so every species visibly emerges
  // from the terrain; later segments stay centred. Stretch only structural
  // glyphs, keeping the existing one-glyph-per-joint ESP32 budget.
  const spanX = Math.abs(point.x - parent.x);
  const spanY = Math.abs(point.y - parent.y);
  const structural = !point.glyph || point.role === "stem" || point.role === "fork";
  const progress = point.parent === 0 ? 0.3 : 0.5;
  return {
    worldX: parent.x + (point.x - parent.x) * progress,
    worldY: parent.y + (point.y - parent.y) * progress,
    scaleX: structural ? Math.min(1.45, baseScale * (1 + spanX * 0.34)) : baseScale,
    scaleY: structural ? Math.min(1.45, baseScale * (1 + spanY * 0.34)) : baseScale,
  };
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
  const scale = glyphScale(plant, pose.species.layer);
  const glyphs = pose.joints.map((point) => {
    const placement = placementForPoint(pose, point, scale);
    return positionedGlyph(metrics, {
      char: glyphForPlantJoint(plant, pose, point),
      worldX: placement.worldX,
      worldY: placement.worldY,
      fg: colorForPoint(plant, pose, point, palette),
      scaleX: placement.scaleX,
      scaleY: placement.scaleY,
    });
  });
  return {
    id,
    plant,
    layerName: pose.species.layer,
    glyphs,
    pose,
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
