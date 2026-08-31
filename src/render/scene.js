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

function glyphSignature(glyphs, layer, fill) {
  let hash = hashText(0x811c9dc5, layer);
  for (const glyph of glyphs) {
    hash = hashText(hash, glyph.char);
    hash = hashText(hash, Math.round(glyph.x));
    hash = hashText(hash, Math.round(glyph.y));
    // The backend rounds every lit-pixel offset through the glyph's own scale,
    // so a change too small to move the scale by one part in a hundred can
    // still move a pixel. Hashing at 1% left stretched plant stems repainting
    // one column late and trailing a stale stroke behind them.
    hash = hashText(hash, Math.round(glyph.scaleX * 1000));
    hash = hashText(hash, Math.round(glyph.scaleY * 1000));
    hash = hashText(hash, glyph.fg);
  }
  for (const rectangle of fill) {
    hash = hashText(hash, Math.round(rectangle.x));
    hash = hashText(hash, Math.round(rectangle.y));
    hash = hashText(hash, Math.round(rectangle.width));
    hash = hashText(hash, Math.round(rectangle.height));
    hash = hashText(hash, rectangle.color);
  }
  return `${glyphs.length}:${fill.length}:${hash >>> 0}`;
}

export function glyphBounds(glyph) {
  return {
    x: glyph.x,
    y: glyph.y,
    width: CELL_WIDTH * glyph.scaleX,
    height: CELL_HEIGHT * glyph.scaleY,
  };
}

function combinedBounds(glyphs, padding = 1, fill = []) {
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
  // Bounds have to cover everything the object paints, not just its glyphs.
  // The damage renderer repaints an object only inside them, so a fill span
  // reaching past would leave the body behind at its previous position.
  for (const span of fill) {
    left = Math.min(left, span.x);
    top = Math.min(top, span.y);
    right = Math.max(right, span.x + span.width);
    bottom = Math.max(bottom, span.y + span.height);
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

export function addGlyphObject(builder, { id, layer, glyphs, padding = 1, fill = [] }) {
  const visible = glyphs
    .filter((glyph) => glyph.char && glyph.char !== " ")
    .map((glyph) => ({ ...glyph, layer }));
  // An object may be pure fill. The water surface is painted as spans that cut
  // the air/water edge along the swell, and a stretch of it carrying no ripple
  // glyph still has to reach the framebuffer.
  if (!visible.length && !fill.length) return null;
  const glyphStart = builder.glyphs.length;
  builder.glyphs.push(...visible);
  const object = {
    id,
    layer,
    glyphStart,
    glyphCount: visible.length,
    fill,
    bounds: combinedBounds(visible, padding, fill),
    signature: glyphSignature(visible, layer, fill),
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
