import { CELL_HEIGHT, CELL_WIDTH } from "../sim/config.js";
import { glyphRasterBounds } from "./glyph-raster.js?v=true-rotation-20260902";

// A thousandth of a glyph's own scale: a step moves the far edge of the tallest
// character by a fortieth of a pixel, and makes the raster reproducible from a
// number the damage signature can hold exactly.
export const SCALE_STEPS = 1000;

export function quantizeScale(scale) {
  return Number.isFinite(scale) ? Math.round(scale * SCALE_STEPS) / SCALE_STEPS : 0;
}

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
    // The rasteriser rounds every span edge through the glyph's own scale, so
    // an arbitrarily small change of scale can still move a lit pixel: it only
    // has to push some offset across a half. No precision of hash fixes that,
    // because there is no precision below which a crossing is impossible -
    // which is why the scale is snapped in positionedGlyph to exactly the grid
    // hashed here. The raster is then a pure function of numbers this carries
    // exactly, and ink that moved cannot hash the same.
    hash = hashText(hash, Math.round(glyph.scaleX * SCALE_STEPS));
    hash = hashText(hash, Math.round(glyph.scaleY * SCALE_STEPS));
    // Rotation is raster state exactly like the scales are: it moves lit pixels
    // inside a cell whose rounded anchor has not moved, so a signature blind to
    // it leaves the previous ink standing until some other property happens to
    // change. The rasteriser reads nothing but these two integers, so ink that
    // moved cannot hash the same - which is the practical dividend of
    // quantising the rotation rather than carrying a float.
    hash = hashText(hash, glyph.spin ?? 0);
    hash = hashText(hash, glyph.spinAspect ?? 0);
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

// Exactly the rectangle this glyph paints into, rotation included. A rotated
// character reaches well outside its own cell - a pipe turned thirty degrees
// spans eleven extra units sideways - and damage tracking restores only inside
// these bounds, so ink outside them would smear across the water it left.
export function glyphBounds(glyph) {
  return glyphRasterBounds(glyph);
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

// Individual fish use five coarse depth lanes for palette lookup, but their
// apparent size still follows continuous distance. Two fish can therefore share
// a layer while one is visibly nearer than the other. Their opaque bodies make
// an ID-based tie-breaker incorrect: the farther fish can be painted last and
// erase part of the nearer fish. scaleY is monotonic with the same continuous
// depth value and is already snapped to a thousandth for damage tracking, so it
// gives us a matching, effectively free within-lane occlusion key.
function individualOcclusionOrder(builder, object) {
  if (!object.id.startsWith("individual:") || object.glyphCount <= 0) return 0;
  const firstGlyph = builder.glyphs[object.glyphStart];
  return Math.round(firstGlyph.scaleY * 1000);
}

export function finalizeScene(builder) {
  builder.objects.sort((left, right) => {
    const layerOrder = left.layer - right.layer;
    if (layerOrder) return layerOrder;

    const depthOrder = individualOcclusionOrder(builder, left) - individualOcclusionOrder(builder, right);
    if (depthOrder) return depthOrder;

    return left.id.localeCompare(right.id);
  });
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
  // Which cached glyph rotation to draw, and at what unit aspect. Zero is the
  // upright raster, which is what everything but a pitched fish uses.
  spin = 0,
  spinAspect = 0,
}) {
  const physicalScaleX = quantizeScale((metrics.cellWidth / CELL_WIDTH) * scaleX);
  const physicalScaleY = quantizeScale((metrics.cellHeight / CELL_HEIGHT) * scaleY);
  return {
    char,
    x: worldX * metrics.cellWidth - (CELL_WIDTH * physicalScaleX) / 2,
    y: worldY * metrics.cellHeight - (CELL_HEIGHT * physicalScaleY) / 2,
    fg,
    scaleX: physicalScaleX,
    scaleY: physicalScaleY,
    spin,
    spinAspect,
  };
}

export function glyphsForObject(scene, object) {
  return scene.glyphs.slice(object.glyphStart, object.glyphStart + object.glyphCount);
}
