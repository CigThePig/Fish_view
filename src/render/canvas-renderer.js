import { glyphPixelRects } from "./glyph-raster.js?v=true-rotation-20260902";
import { calculateDamage, coalesceDamage, rectanglesOverlap } from "./damage.js";
import { glyphBounds } from "./scene.js?v=true-rotation-20260902";

function drawBackground(context, scene, region) {
  const background = scene.background;
  context.fillStyle = background.baseColor;
  context.fillRect(region.x, region.y, region.width, region.height);

  for (const band of background.bands) {
    if (!rectanglesOverlap(region, { x: 0, y: band.y, width: scene.width, height: band.height })) continue;
    context.fillStyle = band.color;
    context.fillRect(0, band.y, scene.width, band.height + 1);
  }

  for (const transition of background.transitions) {
    const block = transition.blockSize;
    const startY = transition.y - transition.height / 2;
    const endY = transition.y + transition.height / 2;
    if (endY < region.y || startY > region.y + region.height) continue;
    const firstY = Math.floor(Math.max(startY, region.y) / block) * block;
    const firstX = Math.floor(region.x / block) * block;
    const lastX = region.x + region.width;
    for (let y = firstY; y < endY; y += block) {
      if (y > region.y + region.height) break;
      const progress = Math.max(0, Math.min(1, (y + block / 2 - startY) / transition.height));
      for (let x = firstX; x < lastX; x += block) {
        const matrixY = positiveModulo(Math.floor(y / block), 4);
        const matrixX = positiveModulo(Math.floor(x / block), 4);
        const threshold = (transition.matrix[matrixY][matrixX] + 0.5) / 16;
        context.fillStyle = threshold < progress ? transition.to : transition.from;
        context.fillRect(x, y, block, block);
      }
    }
  }

  for (const segment of background.substrateSegments) {
    if (!rectanglesOverlap(region, segment)) continue;
    context.fillStyle = segment.color;
    context.fillRect(segment.x, segment.y, segment.width, segment.height);
  }

  // The unbroken part of the floor, painted after the terrain crest so the
  // silhouette above it survives.
  for (const slab of background.floorSlabs ?? []) {
    if (!rectanglesOverlap(region, slab)) continue;
    context.fillStyle = slab.color;
    context.fillRect(slab.x, slab.y, slab.width, slab.height);
  }

  // Side falloff goes last: it dims the water and the floor alike. The sun
  // shafts are scene objects and carry the same dimming in their own colours.
  for (const edge of background.edges ?? []) {
    if (!rectanglesOverlap(region, edge)) continue;
    context.fillStyle = edge.color;
    context.fillRect(edge.x, edge.y, edge.width, edge.height);
  }
}

function positiveModulo(value, modulus) {
  return ((value % modulus) + modulus) % modulus;
}

function drawGlyph(context, glyph) {
  context.fillStyle = glyph.fg;
  for (const rectangle of glyphPixelRects(glyph)) {
    context.fillRect(rectangle.x, rectangle.y, rectangle.width, rectangle.height);
  }
}

function debugKey(debug) {
  return [
    Boolean(debug?.anchors),
    Boolean(debug?.bounds),
    Boolean(debug?.damage),
    Boolean(debug?.skeleton),
    Boolean(debug?.spans),
    Boolean(debug?.ink),
  ].join(":");
}

function expanded(rectangle, amount = 2) {
  return {
    x: rectangle.x - amount,
    y: rectangle.y - amount,
    width: rectangle.width + amount * 2,
    height: rectangle.height + amount * 2,
  };
}

export class CanvasSceneRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d", { alpha: false, desynchronized: true });
    this.previous = null;
    this.previousDebugRectangles = [];
    this.previousDebugKey = debugKey();
    this.context.imageSmoothingEnabled = false;
  }

  reset() {
    this.previous = null;
    this.previousDebugRectangles = [];
  }

  draw(scene, debug = {}) {
    if (this.canvas.width !== scene.width || this.canvas.height !== scene.height) {
      this.canvas.width = scene.width;
      this.canvas.height = scene.height;
      this.context = this.canvas.getContext("2d", { alpha: false, desynchronized: true });
      this.context.imageSmoothingEnabled = false;
      this.reset();
    }

    const nextDebugKey = debugKey(debug);
    if (nextDebugKey !== this.previousDebugKey) this.reset();
    const damage = calculateDamage(this.previous, scene);
    const cleanup = this.previousDebugRectangles.map((rectangle) => expanded(rectangle, 2));
    const paintRectangles = coalesceDamage([...damage.rects, ...cleanup]);
    for (const rectangle of paintRectangles) this.drawRegion(scene, rectangle);

    if (debug.anchors || debug.bounds || debug.damage || debug.skeleton || debug.spans || debug.ink) {
      this.drawDebug(scene, damage.rects, debug);
    }
    this.previousDebugRectangles = [
      ...(debug.damage ? damage.rects : []),
      ...(debug.spans ? scene.objects.flatMap((object) => object.fill ?? []) : []),
      ...(debug.ink ? scene.glyphs.map((glyph) => glyphBounds(glyph)) : []),
      ...(debug.skeleton ? (scene.metadata.skeletonLines ?? []).map((line) => ({
        x: Math.min(line.x1, line.x2),
        y: Math.min(line.y1, line.y2),
        width: Math.max(1, Math.abs(line.x2 - line.x1)),
        height: Math.max(1, Math.abs(line.y2 - line.y1)),
      })) : []),
    ];
    this.previousDebugKey = nextDebugKey;
    this.previous = scene;
    return {
      damagedPixels: damage.area,
      totalPixels: damage.total,
      damageRectangles: damage.rects.length,
      damagedPercent: damage.total ? (damage.area / damage.total) * 100 : 0,
      full: damage.full,
    };
  }

  drawRegion(scene, rectangle) {
    const context = this.context;
    context.save();
    context.beginPath();
    context.rect(rectangle.x, rectangle.y, rectangle.width, rectangle.height);
    context.clip();
    drawBackground(context, scene, rectangle);
    for (const object of scene.objects) {
      if (!rectanglesOverlap(object.bounds, rectangle)) continue;
      // Opaque spans go down first so the object's own strokes stay on top of
      // its body instead of being erased by it.
      for (const span of object.fill ?? []) {
        context.fillStyle = span.color;
        context.fillRect(span.x, span.y, span.width, span.height);
      }
      const end = object.glyphStart + object.glyphCount;
      for (let index = object.glyphStart; index < end; index += 1) drawGlyph(context, scene.glyphs[index]);
    }
    context.restore();
  }

  drawDebug(scene, damageRectangles, debug) {
    const context = this.context;
    context.save();
    context.lineWidth = 1;
    if (debug.bounds) {
      context.strokeStyle = "#ffcf5a";
      for (const object of scene.objects) {
        context.strokeRect(
          Math.floor(object.bounds.x) + 0.5,
          Math.floor(object.bounds.y) + 0.5,
          Math.ceil(object.bounds.width) - 1,
          Math.ceil(object.bounds.height) - 1,
        );
      }
    }
    // Every rectangle the opaque body actually asks the panel for. Seeing the
    // spans is how a rasterisation problem is told apart from a shape problem:
    // a staircase of wide blocks and a smooth diagonal look alike until the
    // rectangles are outlined.
    if (debug.spans) {
      context.strokeStyle = "#7be3a2";
      for (const object of scene.objects) {
        for (const span of object.fill ?? []) {
          context.strokeRect(span.x + 0.5, span.y + 0.5, Math.max(1, span.width - 1), Math.max(1, span.height - 1));
        }
      }
    }
    // The exact rectangle each glyph's rotated raster paints into, which is also
    // what damage tracking restores from.
    if (debug.ink) {
      context.strokeStyle = "#c58cff";
      for (const glyph of scene.glyphs) {
        const bounds = glyphBounds(glyph);
        context.strokeRect(bounds.x + 0.5, bounds.y + 0.5, Math.max(1, bounds.width - 1), Math.max(1, bounds.height - 1));
      }
    }
    if (debug.anchors) {
      context.fillStyle = "#ff6d7a";
      for (const glyph of scene.glyphs) {
        const bounds = glyphBounds(glyph);
        context.fillRect(Math.round(bounds.x + bounds.width / 2) - 1, Math.round(bounds.y + bounds.height / 2) - 1, 3, 3);
      }
    }
    if (debug.skeleton) {
      context.strokeStyle = "#ff7693";
      context.fillStyle = "#ffd4dd";
      for (const line of scene.metadata.skeletonLines ?? []) {
        context.beginPath();
        context.moveTo(Math.round(line.x1) + 0.5, Math.round(line.y1) + 0.5);
        context.lineTo(Math.round(line.x2) + 0.5, Math.round(line.y2) + 0.5);
        context.stroke();
        context.fillRect(Math.round(line.x2) - 1, Math.round(line.y2) - 1, 3, 3);
      }
    }
    if (debug.damage) {
      context.strokeStyle = "#72f0ff";
      for (const rectangle of damageRectangles) {
        context.strokeRect(rectangle.x + 0.5, rectangle.y + 0.5, rectangle.width - 1, rectangle.height - 1);
      }
    }
    context.restore();
  }
}
