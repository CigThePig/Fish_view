import { CELL_HEIGHT, CELL_WIDTH } from "../sim/config.js";

function hashText(hash, value) {
  const text = String(value);
  let result = hash >>> 0;
  for (let index = 0; index < text.length; index += 1) {
    result ^= text.charCodeAt(index);
    result = Math.imul(result, 0x01000193);
  }
  return result >>> 0;
}

function glyphSignature(glyphs, layer) {
  let hash = hashText(0x811c9dc5, layer);
  for (const glyph of glyphs) {
    hash = hashText(hash, glyph.char);
    hash = hashText(hash, Math.round(glyph.x));
    hash = hashText(hash, Math.round(glyph.y));
    hash = hashText(hash, Math.round(glyph.scaleX * 100));
    hash = hashText(hash, Math.round(glyph.scaleY * 100));
    hash = hashText(hash, glyph.fg);
  }
  return `${glyphs.length}:${hash >>> 0}`;
}

export function glyphBounds(glyph) {
  return {
    x: glyph.x,
    y: glyph.y,
    width: CELL_WIDTH * glyph.scaleX,
    height: CELL_HEIGHT * glyph.scaleY,
  };
}

function combinedBounds(glyphs, padding = 1) {
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  for (const glyph of glyphs) {
    const bounds = glyphBounds(glyph);
    left = Math.min(left, bounds.x);
    top = Math.min(top, bounds.y);
    right = Math.max(right, bounds.x + bounds.width);
    bottom = Math.max(bottom, bounds.y + bounds.height);
  }
  return {
    x: left - padding,
    y: top - padding,
    width: right - left + padding * 2,
    height: bottom - top + padding * 2,
  };
}

export function createSceneBuilder({
  width,
  height,
  logicalWidth,
  logicalHeight,
  background,
  metadata = {},
}) {
  return {
    width,
    height,
    logicalWidth,
    logicalHeight,
    background,
    metadata,
    glyphs: [],
    objects: [],
  };
}

export function addGlyphObject(builder, { id, layer, glyphs, padding = 1 }) {
  const visible = glyphs
    .filter((glyph) => glyph.char && glyph.char !== " ")
    .map((glyph) => ({ ...glyph, layer }));
  if (!visible.length) return null;
  const glyphStart = builder.glyphs.length;
  builder.glyphs.push(...visible);
  const object = {
    id,
    layer,
    glyphStart,
    glyphCount: visible.length,
    bounds: combinedBounds(visible, padding),
    signature: glyphSignature(visible, layer),
  };
  builder.objects.push(object);
  return object;
}

export function finalizeScene(builder) {
  builder.objects.sort((left, right) => left.layer - right.layer || left.id.localeCompare(right.id));
  return {
    type: "glyph-scene",
    width: builder.width,
    height: builder.height,
    logicalWidth: builder.logicalWidth,
    logicalHeight: builder.logicalHeight,
    background: builder.background,
    metadata: builder.metadata,
    glyphs: builder.glyphs,
    objects: builder.objects,
  };
}

export function sceneMetrics({ width, height, logicalWidth, logicalHeight }) {
  return {
    cellWidth: width / logicalWidth,
    cellHeight: height / logicalHeight,
  };
}

export function positionedGlyph(metrics, {
  char,
  worldX,
  worldY,
  fg,
  scaleX = 1,
  scaleY = 1,
}) {
  const physicalScaleX = (metrics.cellWidth / CELL_WIDTH) * scaleX;
  const physicalScaleY = (metrics.cellHeight / CELL_HEIGHT) * scaleY;
  return {
    char,
    x: worldX * metrics.cellWidth - (CELL_WIDTH * physicalScaleX) / 2,
    y: worldY * metrics.cellHeight - (CELL_HEIGHT * physicalScaleY) / 2,
    fg,
    scaleX: physicalScaleX,
    scaleY: physicalScaleY,
  };
}

export function glyphsForObject(scene, object) {
  return scene.glyphs.slice(object.glyphStart, object.glyphStart + object.glyphCount);
}
