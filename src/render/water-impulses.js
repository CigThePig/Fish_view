import { SUBSTRATE_ROWS } from "../sim/config.js";
import {
  SUBSTRATE_RELIEF_ROWS,
  substrateSurfaceY,
  SURFACE_Y_ROWS,
  surfaceWaveOffset,
} from "../sim/environment.js";
import { ROW_ASPECT } from "../sim/pointer-path.js";
import { mixColor } from "./palette.js";
import { addGlyphObject } from "./scene.js";

const clamp01 = (value) => Math.max(0, Math.min(1, value));
const positiveModulo = (value, modulus) => ((value % modulus) + modulus) % modulus;
// Two broken crests, 32 short raster spans each. No particles, alpha buffer,
// canvas paths or framebuffer sampling: firmware can draw these as RGB565 fills.
const ARC_STEPS = 32;
const ARC = Object.freeze(Array.from({ length: ARC_STEPS + 1 }, (_, index) => {
  const angle = -0.88 + index / ARC_STEPS * 1.76;
  return Object.freeze({ x: Math.cos(angle), y: Math.sin(angle) });
}));
export const MAX_WATER_SPANS_PER_IMPULSE = ARC_STEPS * 2;

export function waterImpulseGeometry(impulse) {
  const progress = clamp01(impulse.ageSeconds / impulse.durationSeconds);
  const directed = Boolean(impulse.dirX || impulse.dirY);
  const glassPerCell = Math.hypot(impulse.dirX ?? 0, (impulse.dirY ?? 0) * ROW_ASPECT) || 1;
  const flowX = (impulse.dirX ?? 0) / glassPerCell;
  const flowY = (impulse.dirY ?? 0) * ROW_ASPECT / glassPerCell;
  // Visible crests occupy only the inner part of the pressure field. A weak
  // release must also *look* weaker than a press, not repeat a full-size ring.
  const strength = clamp01(impulse.strength);
  const radius = (0.32 + Math.sqrt(progress) * Math.min(2.35, impulse.radius * 0.32))
    * (0.55 + strength * 0.45);
  const drift = directed ? progress * 2.2 / glassPerCell : 0;
  return { progress, radius, directed, flowX, flowY,
    x: impulse.x + (impulse.dirX ?? 0) * drift,
    y: impulse.y + (impulse.dirY ?? 0) * drift,
    visibility: (0.3 + strength * 0.3) * (1 - progress) ** 1.6 };
}

export function waterBandIndexAtY(state, y, bandCount) {
  const surface = SURFACE_Y_ROWS;
  const substrate = Math.min(state.rows, state.rows - SUBSTRATE_ROWS + SUBSTRATE_RELIEF_ROWS);
  const waterHeight = Math.max(Number.EPSILON, substrate - surface);
  const depth = clamp01((y - surface) / waterHeight);
  return Math.min(bandCount - 1, Math.floor(depth * bandCount));
}

// Reconstruct the color already painted beneath a crest span from the scene's
// background recipe. This stays on the same cheap raster model as the rest of
// the renderer: no framebuffer readback, alpha buffer, or per-pixel history.
// Bands and ordered-dither transitions are applied in the same order as the
// canvas renderer, then the side falloff wins last just as it does on screen.
export function backgroundWaterColorAtPixel(builder, x, y) {
  const background = builder.background;
  let color = background.baseColor;

  for (const band of background.bands ?? []) {
    if (x >= 0 && x < builder.width && y >= band.y && y < band.y + band.height + 1) {
      color = band.color;
    }
  }

  for (const transition of background.transitions ?? []) {
    const block = transition.blockSize;
    const startY = transition.y - transition.height / 2;
    const endY = transition.y + transition.height / 2;
    const blockY = Math.floor(y / block) * block;
    const firstY = Math.floor(startY / block) * block;
    if (blockY < firstY || blockY >= endY) continue;
    const progress = clamp01((blockY + block / 2 - startY) / transition.height);
    const matrixY = positiveModulo(Math.floor(blockY / block), 4);
    const matrixX = positiveModulo(Math.floor(x / block), 4);
    const threshold = (transition.matrix[matrixY][matrixX] + 0.5) / 16;
    color = threshold < progress ? transition.to : transition.from;
  }

  for (const edge of background.edges ?? []) {
    if (x >= edge.x && x < edge.x + edge.width && y >= edge.y && y < edge.y + edge.height) {
      color = edge.color;
    }
  }

  return color;
}

export function drawWaterImpulses(builder, state, palette, metrics) {
  for (const impulse of state.impulses ?? []) {
    const shape = waterImpulseGeometry(impulse);
    if (shape.visibility < 0.018 || impulse.strength <= 0) continue;
    // A tap has two opposing curved glints, not a closed target ring. A wake
    // turns those glints along the sides of the flow and carries them with it.
    const axisX = shape.directed ? -shape.flowY : 0;
    const axisY = shape.directed ? shape.flowX : 1;
    const fill = [];
    for (const side of [-1, 1]) {
      let previous = null;
      for (const unit of ARC) {
        let dx = side * (unit.x * axisX - unit.y * axisY) * shape.radius;
        let dy = side * (unit.x * axisY + unit.y * axisX) * shape.radius;
        if (shape.directed) {
          const along = dx * shape.flowX + dy * shape.flowY;
          dx += along * shape.flowX * 0.35;
          dy += along * shape.flowY * 0.35;
        }
        const x = Math.round((shape.x + dx) * metrics.cellWidth);
        const y = Math.round((shape.y + dy / ROW_ASPECT) * metrics.cellHeight);
        if (previous) {
          const left = Math.min(x, previous.x), top = Math.min(y, previous.y);
          const width = Math.abs(x - previous.x) + 1, height = Math.abs(y - previous.y) + 1;
          const centerX = left + width / 2;
          const centerY = top + height / 2;
          const worldX = centerX / metrics.cellWidth;
          const surface = (SURFACE_Y_ROWS + surfaceWaveOffset(state, worldX)) * metrics.cellHeight;
          const floor = substrateSurfaceY(state, worldX) * metrics.cellHeight;
          if (left >= 0 && left + width <= builder.width && top >= surface && top + height <= floor) {
            const water = backgroundWaterColorAtPixel(builder, centerX, centerY);
            const color = mixColor(water, palette.ambient, shape.visibility);
            fill.push({ x: left, y: top, width, height, color });
          }
        }
        previous = { x, y };
      }
    }
    // Behind inhabitants: water glints must never stamp over a fish's face or
    // paint a bright line across a rooted stem. Identity stays stable for damage.
    addGlyphObject(builder, { id: `reaction:ripple:${impulse.id}`, layer: 18, glyphs: [], fill, padding: 1 });
  }
}
