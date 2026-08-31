import {
  BUBBLE_SIZE_CLASSES,
  bubbleEmitterCount,
  createBubbleWorldRecords,
} from "../sim/bubbles.js";
import { SUBSTRATE_ROWS } from "../sim/config.js";
import { SURFACE_Y_ROWS } from "../sim/environment.js";
import { sampleSigned } from "../sim/prng.js";
import { laneForDepth } from "./depth.js?v=visual-depth-20260830";
import { mixColor } from "./palette.js?v=visual-depth-20260830";
import { addGlyphObject, positionedGlyph } from "./scene.js?v=opaque-bodies-20260830";

const NEAR_BUBBLE_SCALE = 0.28;

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function smoothstep(value) {
  const amount = clamp(value, 0, 1);
  return amount * amount * (3 - 2 * amount);
}

function waterTop() {
  return SURFACE_Y_ROWS + 0.28;
}

function depthAt(state, worldY) {
  const top = waterTop();
  const bottom = state.rows - SUBSTRATE_ROWS;
  return clamp((worldY - top) / Math.max(1, bottom - top), 0, 1);
}

function bubbleColor(state, palette, worldY, distance = 1) {
  const depth = depthAt(state, worldY);
  const bandIndex = Math.min(
    palette.waterBands.length - 1,
    Math.floor(depth * palette.waterBands.length),
  );
  const water = palette.waterBands[bandIndex];
  const visible = mixColor(water, palette.ambient, 0.44 + (1 - depth) * 0.24);
  const lit = mixColor(visible, palette.waterline, (1 - depth) * 0.24);
  return mixColor(lit, palette.fog, palette.depthLanes[laneForDepth(distance)].haze);
}

function bubbleGlyphs(metrics, {
  sizeClass,
  progress,
  worldX,
  worldY,
  color,
  seed,
  sizeMultiplier = 1,
}) {
  const config = BUBBLE_SIZE_CLASSES[sizeClass];
  const growth = smoothstep(progress);
  const scale = (config.scale[0] + (config.scale[1] - config.scale[0]) * growth) * sizeMultiplier;
  let chars;
  if (sizeClass === "micro") {
    chars = [progress < 0.7 ? "." : "'"];
  } else if (sizeClass === "normal") {
    chars = [progress < 0.16 ? "." : "o"];
  } else if (sizeClass === "large") {
    chars = [progress < 0.18 ? "." : progress < 0.58 ? "o" : "O"];
  } else {
    chars = progress < 0.12 ? ["o"] : progress < 0.7 ? ["O"] : ["(", ")"];
  }

  const glyphs = chars.map((char, index) => positionedGlyph(metrics, {
    char,
    worldX: worldX + (chars.length === 2 ? (index === 0 ? -0.2 : 0.2) : 0),
    worldY,
    fg: color,
    scaleX: chars.length === 2 ? scale * 0.74 : scale,
    scaleY: scale,
  }));

  if ((sizeClass === "large" || sizeClass === "jumbo") && progress > 0.62) {
    glyphs.push(positionedGlyph(metrics, {
      char: "'",
      worldX: worldX - 0.22 + sampleSigned(seed, 71) * 0.04,
      worldY: worldY - 0.34,
      fg: color,
      scaleX: 0.5,
      scaleY: 0.5,
    }));
  }
  return glyphs;
}

function popGlyphs(metrics, {
  sizeClass,
  progress,
  worldX,
  worldY,
  color,
}) {
  const large = sizeClass === "large" || sizeClass === "jumbo";
  if (progress < 0.28) {
    return [positionedGlyph(metrics, {
      char: large ? "O" : "o",
      worldX,
      worldY,
      fg: color,
      scaleX: large ? 0.95 : 0.76,
      scaleY: Math.max(0.5, (large ? 0.8 : 0.68) * (1 - progress * 1.25)),
    })];
  }
  if (progress < 0.62) {
    return [positionedGlyph(metrics, {
      char: "*",
      worldX,
      worldY: worldY - 0.06,
      fg: color,
      scaleX: large ? 0.72 : 0.6,
      scaleY: large ? 0.72 : 0.6,
    })];
  }
  return [
    positionedGlyph(metrics, {
      char: "~",
      worldX,
      worldY: worldY + 0.03,
      fg: color,
      scaleX: large ? 0.86 : 0.68,
      scaleY: 0.56,
    }),
    positionedGlyph(metrics, {
      char: "'",
      worldX: worldX + 0.22,
      worldY: worldY - 0.2,
      fg: color,
      scaleX: 0.5,
      scaleY: 0.5,
    }),
  ];
}

function decorateBubbleRecord(state, palette, metrics, record) {
  const distance = Number.isFinite(record.distance) ? record.distance : 1;
  if (record.phase === "pop") {
    const color = mixColor(
      bubbleColor(state, palette, record.worldY, distance),
      palette.waterline,
      0.38,
    );
    return {
      ...record,
      glyphs: popGlyphs(metrics, { ...record, color }),
    };
  }

  const color = bubbleColor(state, palette, record.worldY, distance);
  const sizeMultiplier = record.kind === "touch" ? 1 : 1 + distance * NEAR_BUBBLE_SCALE;
  return {
    ...record,
    glyphs: bubbleGlyphs(metrics, { ...record, color, sizeMultiplier }),
  };
}

export function createBubbleRenderRecords(state, palette, metrics) {
  return createBubbleWorldRecords(state).map((record) => (
    decorateBubbleRecord(state, palette, metrics, record)
  ));
}

export function drawBubbles(builder, state, palette, metrics, layer) {
  const records = createBubbleRenderRecords(state, palette, metrics);
  for (const record of records) {
    addGlyphObject(builder, {
      id: record.id,
      layer,
      glyphs: record.glyphs,
      padding: 2,
    });
  }
  builder.metadata.bubbles = {
    emitters: bubbleEmitterCount(state.orientation),
    active: records.length,
    stream: records.filter((record) => record.kind === "stream").length,
    isolated: records.filter((record) => record.kind === "isolated").length,
    fish: records.filter((record) => record.kind === "fish").length,
    touch: records.filter((record) => record.kind === "touch").length,
    pops: records.filter((record) => record.phase === "pop").length,
  };
  return records;
}

export {
  bubbleEmitterCount,
  createBubbleEmitters,
  createBubbleWorldRecords,
} from "../sim/bubbles.js";
