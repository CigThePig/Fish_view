import { glyphFlip, mirrorRows, normalizeRows } from "../art/mirror.js";
import {
  individualSprites,
  plantArt,
  schoolGlyphs,
  spriteDimensions,
  substrateArt,
  waterlineArt,
} from "../art/sprites.js";
import { orientationConfig, SUBSTRATE_ROWS, WATERLINE_ROWS } from "../sim/config.js";
import { plantHeight, spriteForSeed } from "../sim/entities.js";
import { sample01, sampleRange, sampleSigned } from "../sim/prng.js";
import { MASK_SYMBOLS, scenePalette } from "./palette.js";
import {
  addGlyphObject,
  createSceneBuilder,
  finalizeScene,
  positionedGlyph,
  sceneMetrics,
} from "./scene.js";

const TAU = Math.PI * 2;
const BAYER_4 = Object.freeze([
  Object.freeze([0, 8, 2, 10]),
  Object.freeze([12, 4, 14, 6]),
  Object.freeze([3, 11, 1, 9]),
  Object.freeze([15, 7, 13, 5]),
]);

export const LAYERS = Object.freeze({
  waterline: 10,
  backgroundPlants: 20,
  ambient: 25,
  school: 30,
  individuals: 40,
  reaction: 45,
  foregroundPlants: 50,
  substrate: 60,
});

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function smoothstep(value) {
  const amount = clamp(value, 0, 1);
  return amount * amount * (3 - 2 * amount);
}

function positiveModulo(value, modulus) {
  return ((value % modulus) + modulus) % modulus;
}

function maskColor(symbol, seed, palette) {
  if (!symbol || symbol === " ") return palette.masks.C;
  if (symbol === "4" || symbol === "W" || symbol === "w") return palette.masks.W;
  if (/^[1-9]$/.test(symbol)) {
    const slot = Number(symbol);
    const choice = Math.floor(sample01(seed, slot * 37) * MASK_SYMBOLS.length) % MASK_SYMBOLS.length;
    return palette.masks[MASK_SYMBOLS[choice]];
  }
  return palette.masks[symbol] ?? palette.masks.C;
}

const spritePointCache = new Map();

function spritePoints(sprite) {
  if (spritePointCache.has(sprite.id)) return spritePointCache.get(sprite.id);
  const { width, height } = spriteDimensions(sprite);
  const shape = normalizeRows(sprite.shape, width);
  const mask = normalizeRows(sprite.mask, width);
  const points = [];
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const char = [...shape[row]][column];
      if (!char || char === " ") continue;
      points.push({ char, mask: [...mask[row]][column], column, row });
    }
  }
  const result = Object.freeze({ width, height, points: Object.freeze(points) });
  spritePointCache.set(sprite.id, result);
  return result;
}

export function poseSprite(sprite, {
  facing = 1,
  phase = 0,
  deformationStrength = 1,
  turnScale = 1,
} = {}) {
  const source = spritePoints(sprite);
  return source.points.map((point) => {
    const tail = source.width <= 1 ? 0 : 1 - point.column / (source.width - 1);
    const displayColumn = facing < 0 ? source.width - 1 - point.column : point.column;
    const columnSpacing = 1 + Math.sin(phase + tail * 0.9) * 0.018 * deformationStrength;
    const rowSpacing = 1 + Math.sin(phase * 0.72 + point.column * 0.31) * 0.012 * deformationStrength;
    const localX = (displayColumn - (source.width - 1) / 2) * columnSpacing * turnScale;
    const localY = (point.row - (source.height - 1) / 2) * rowSpacing;
    const tailWeight = 0.1 + Math.pow(tail, 1.65) * 0.9;
    const bodyWave = Math.sin(phase - point.column * 0.22) * 0.145 * tailWeight * deformationStrength;
    const tailBeat = Math.sin(phase * 1.04 + 0.45) * 0.065 * Math.pow(tail, 3) * deformationStrength;
    return {
      char: facing < 0 ? (glyphFlip[point.char] ?? point.char) : point.char,
      mask: point.mask,
      x: localX,
      y: localY + bodyWave + tailBeat,
      tail,
    };
  });
}

function turnPose(fish) {
  const visual = fish.visual ?? {
    facing: fish.vx < 0 ? -1 : 1,
    targetFacing: fish.vx < 0 ? -1 : 1,
    turnProgress: 1,
  };
  if (visual.turnProgress >= 1) return { facing: visual.targetFacing, widthScale: 1 };
  if (visual.turnProgress < 0.5) {
    return {
      facing: visual.facing,
      widthScale: 1 - smoothstep(visual.turnProgress * 2) * 0.68,
    };
  }
  return {
    facing: visual.targetFacing,
    widthScale: 0.32 + smoothstep((visual.turnProgress - 0.5) * 2) * 0.68,
  };
}

function createBackground(dimensions, palette, seed, withSubstrate = true) {
  const metrics = sceneMetrics(dimensions);
  const waterBottom = withSubstrate
    ? (dimensions.logicalHeight - SUBSTRATE_ROWS) * metrics.cellHeight
    : dimensions.height;
  const bandHeight = waterBottom / palette.waterBands.length;
  const bands = palette.waterBands.map((color, index) => ({
    y: index * bandHeight,
    height: index === palette.waterBands.length - 1 ? waterBottom - index * bandHeight : bandHeight,
    color,
  }));
  const transitions = bands.slice(1).map((band, index) => ({
    y: band.y,
    height: Math.min(18, metrics.cellHeight * 0.72),
    from: bands[index].color,
    to: band.color,
    matrix: BAYER_4,
    blockSize: 4,
  }));
  const substrateSegments = [];
  if (withSubstrate) {
    for (let column = 0; column < Math.ceil(dimensions.logicalWidth); column += 1) {
      const top = waterBottom + sampleSigned(seed, 700 + column) * metrics.cellHeight * 0.14;
      substrateSegments.push({
        x: column * metrics.cellWidth,
        y: top,
        width: metrics.cellWidth + 1,
        height: dimensions.height - top,
        color: sample01(seed, 900 + column) > 0.62 ? palette.substrateAlt : palette.substrateBg,
      });
    }
  }
  return {
    signature: [
      dimensions.width,
      dimensions.height,
      dimensions.logicalWidth,
      dimensions.logicalHeight,
      palette.paletteStage,
      seed >>> 0,
      withSubstrate ? 1 : 0,
    ].join(":"),
    baseColor: palette.waterBands[0],
    bands,
    transitions,
    substrateSegments,
  };
}

function builderForState(state, palette) {
  const target = orientationConfig(state.orientation);
  const dimensions = {
    width: target.pixelWidth,
    height: target.pixelHeight,
    logicalWidth: state.cols,
    logicalHeight: state.rows,
  };
  return createSceneBuilder({
    ...dimensions,
    background: createBackground(dimensions, palette, state.seed),
    metadata: {
      orientation: state.orientation,
      paletteStage: palette.paletteStage,
      daylight: palette.daylight,
      night: palette.night,
      recommendedBacklight: palette.recommendedBacklight,
      elapsedRealSeconds: state.elapsedRealSeconds,
    },
  });
}

function drawWaterline(builder, state, palette, metrics) {
  const chunks = new Map();
  const vocabulary = [...new Set(waterlineArt.join(""))].filter((char) => char !== " ");
  const count = Math.ceil(state.cols / 1.42);
  for (let index = 0; index < count; index += 1) {
    const worldX = 0.55 + index * 1.42 + sampleSigned(state.seed, 1100 + index) * 0.14;
    if (worldX >= state.cols) continue;
    const wave = Math.sin(state.elapsedRealSeconds * 0.42 + worldX * 0.34 + sampleRange(state.seed, 1200 + index, 0, TAU));
    const worldY = 0.64 + wave * 0.075 + sampleSigned(state.seed, 1300 + index) * 0.025;
    const char = index % 11 === 0 ? "'" : index % 7 === 0 ? "^" : vocabulary[index % vocabulary.length];
    const chunk = Math.floor(worldX / 8);
    if (!chunks.has(chunk)) chunks.set(chunk, []);
    chunks.get(chunk).push(positionedGlyph(metrics, {
      char,
      worldX,
      worldY: char === "'" ? worldY + 0.38 : worldY,
      fg: palette.waterline,
      scaleX: char === "'" ? 0.78 : 0.94,
      scaleY: char === "'" ? 0.78 : 0.9,
    }));
  }
  for (const [chunk, glyphs] of chunks) {
    addGlyphObject(builder, { id: `waterline:${chunk}`, layer: LAYERS.waterline, glyphs });
  }
}

function plantGlyph(plant, offset, height) {
  if (offset === height) return plantArt.tip;
  if (offset % 4 === 0) {
    const variants = (plant.seed + offset) % 2 ? plantArt.left : plantArt.right;
    return variants[(plant.seed + offset) % variants.length];
  }
  return plantArt.stem;
}

function drawPlant(builder, plant, index, state, palette, metrics, foreground) {
  const height = plantHeight(plant);
  const rootY = state.rows - SUBSTRATE_ROWS + 0.18;
  const phase = sampleRange(plant.seed, 80, 0, TAU);
  const amplitude = sampleRange(plant.seed, 81, 0.18, 0.34);
  const staticLean = sampleSigned(plant.seed, 82) * 0.13;
  const glyphs = [];
  for (let offset = 1; offset <= height; offset += 1) {
    const progress = offset / Math.max(1, height);
    const sway = Math.sin(state.elapsedRealSeconds * 0.36 + phase + progress * 0.82)
      * amplitude
      * Math.pow(progress, 1.75);
    const curl = Math.sin(phase * 0.7 + progress * 2.2) * 0.035 * progress;
    glyphs.push(positionedGlyph(metrics, {
      char: plantGlyph(plant, offset, height),
      worldX: plant.x + staticLean * progress + sway + curl,
      worldY: rootY - offset * 0.83 + Math.abs(sway) * 0.018,
      fg: foreground ? palette.plantFront : palette.plantBack,
      scaleX: foreground ? 0.96 : 0.88,
      scaleY: foreground ? 0.96 : 0.9,
    }));
  }
  addGlyphObject(builder, {
    id: `plant:${index}`,
    layer: foreground ? LAYERS.foregroundPlants : LAYERS.backgroundPlants,
    glyphs,
  });
}

function drawAmbient(builder, state, palette, metrics) {
  const waterTop = WATERLINE_ROWS + 0.2;
  const waterBottom = state.rows - SUBSTRATE_ROWS - 0.2;
  const travel = waterBottom - waterTop;
  const count = state.orientation === "portrait" ? 8 : 13;
  for (let index = 0; index < count; index += 1) {
    const initialY = sampleRange(state.seed, 1400 + index, 0, travel);
    const speed = sampleRange(state.seed, 1500 + index, 0.035, 0.085);
    const path = positiveModulo(initialY + state.elapsedRealSeconds * speed, travel);
    const phase = sampleRange(state.seed, 1600 + index, 0, TAU);
    const worldX = sampleRange(state.seed, 1700 + index, 1, state.cols - 1)
      + Math.sin(state.elapsedRealSeconds * 0.18 + phase) * 0.18;
    const worldY = waterBottom - path;
    const char = index % 9 === 0 ? "o" : index % 4 === 0 ? "'" : ".";
    addGlyphObject(builder, {
      id: `ambient:${index}`,
      layer: LAYERS.ambient,
      glyphs: [positionedGlyph(metrics, {
        char,
        worldX,
        worldY,
        fg: palette.ambient,
        scaleX: char === "o" ? 0.72 : 0.62,
        scaleY: char === "o" ? 0.72 : 0.62,
      })],
    });
  }
}

function drawSchool(builder, state, palette, metrics) {
  state.school.forEach((fish, index) => {
    const source = schoolGlyphs[index % schoolGlyphs.length];
    const facing = fish.vx < 0 ? -1 : 1;
    const displayed = facing < 0 ? mirrorRows([source])[0] : source;
    const chars = [...displayed];
    const seed = state.seed ^ Math.imul(index + 1, 0x9e3779b1);
    const phase = state.elapsedRealSeconds * sampleRange(seed, 1800, 2.2, 3.2)
      + sampleRange(seed, 1801, 0, TAU);
    const bob = Math.sin(phase * 0.46) * 0.035;
    const compression = 0.58 + clamp(Math.abs(fish.vx) / 0.34, 0, 1) * 0.42;
    const scale = sampleRange(seed, 1802, 0.76, 0.88);
    const depth = clamp((fish.y - WATERLINE_ROWS) / Math.max(1, state.rows - WATERLINE_ROWS - SUBSTRATE_ROWS), 0, 0.999);
    const color = palette.school[Math.floor(depth * palette.school.length)];
    const glyphs = chars.map((char, offset) => {
      const tail = chars.length <= 1 ? 0 : facing > 0 ? 1 - offset / (chars.length - 1) : offset / (chars.length - 1);
      return positionedGlyph(metrics, {
        char,
        worldX: fish.x + (offset - (chars.length - 1) / 2) * 0.82 * compression,
        worldY: fish.y + bob + Math.sin(phase - offset * 0.55) * 0.045 * tail,
        fg: color,
        scaleX: scale,
        scaleY: scale,
      });
    });
    addGlyphObject(builder, {
      id: `school:${index}`,
      layer: LAYERS.school + Math.floor(depth * 3),
      glyphs,
    });
  });
}

function individualGlyphs(fish, state, palette, metrics, deformationStrength = 1) {
  const sprite = spriteForSeed(fish.seed);
  const turning = turnPose(fish);
  const frequency = sampleRange(fish.seed, 100, 0.55, 0.78) * (0.64 + palette.daylight * 0.36);
  const phase = state.elapsedRealSeconds * TAU * frequency + sampleRange(fish.seed, 101, 0, TAU);
  const bob = Math.sin(state.elapsedRealSeconds * TAU * sampleRange(fish.seed, 102, 0.12, 0.19)
    + sampleRange(fish.seed, 103, 0, TAU)) * sampleRange(fish.seed, 104, 0.045, 0.085);
  const points = poseSprite(sprite, {
    facing: turning.facing,
    phase,
    deformationStrength,
    turnScale: turning.widthScale,
  });
  return points.map((point) => positionedGlyph(metrics, {
    char: point.char,
    worldX: fish.x + point.x,
    worldY: fish.y + point.y + bob,
    fg: maskColor(point.mask, fish.seed, palette),
    scaleX: 0.9 + turning.widthScale * 0.1,
    scaleY: 1,
  }));
}

function drawIndividuals(builder, state, palette, metrics, deformationStrength) {
  state.individuals.forEach((fish, index) => {
    addGlyphObject(builder, {
      id: `individual:${index}:${fish.seed}`,
      layer: LAYERS.individuals,
      glyphs: individualGlyphs(fish, state, palette, metrics, deformationStrength),
      padding: 2,
    });
  });
}

function drawReaction(builder, reaction, palette, metrics) {
  if (!reaction) return;
  const progress = clamp(reaction.ageSeconds / reaction.durationSeconds, 0, 1);
  const radius = 0.62 + smoothstep(progress) * 5.15;
  const samples = 16;
  const glyphs = [];
  for (let index = 0; index < samples; index += 1) {
    const angle = (index / samples) * TAU;
    const char = progress < 0.3 ? "O" : progress < 0.68 ? "o" : index % 2 ? "." : "'";
    glyphs.push(positionedGlyph(metrics, {
      char,
      worldX: reaction.x + Math.cos(angle) * radius,
      worldY: reaction.y + Math.sin(angle) * radius * 0.5,
      fg: palette.ripple,
      scaleX: 0.78,
      scaleY: 0.78,
    }));
  }
  glyphs.push(positionedGlyph(metrics, {
    char: progress < 0.5 ? "o" : ".",
    worldX: reaction.x,
    worldY: reaction.y,
    fg: palette.ripple,
    scaleX: 0.72,
    scaleY: 0.72,
  }));
  addGlyphObject(builder, { id: "reaction:ripple", layer: LAYERS.reaction, glyphs, padding: 2 });
}

function drawSubstrate(builder, state, palette, metrics) {
  const start = state.rows - SUBSTRATE_ROWS;
  const chunks = new Map();
  for (let row = 0; row < SUBSTRATE_ROWS; row += 1) {
    const density = 0.35 + row * 0.16;
    for (let column = 0; column < state.cols; column += 1) {
      const salt = 2000 + row * 211 + column;
      if (sample01(state.seed, salt) > density) continue;
      const chunk = Math.floor(column / 10);
      if (!chunks.has(chunk)) chunks.set(chunk, []);
      const choice = Math.floor(sample01(state.seed, salt + 700) * substrateArt.length) % substrateArt.length;
      chunks.get(chunk).push(positionedGlyph(metrics, {
        char: row === 0 && column % 4 === 0 ? "_" : substrateArt[choice],
        worldX: column + 0.5 + sampleSigned(state.seed, salt + 900) * 0.22,
        worldY: start + row + 0.5 + sampleSigned(state.seed, salt + 1100) * 0.13,
        fg: palette.substrateFg,
        scaleX: 0.82,
        scaleY: 0.76,
      }));
    }
  }
  for (const [chunk, glyphs] of chunks) {
    addGlyphObject(builder, { id: `substrate:${chunk}`, layer: LAYERS.substrate, glyphs });
  }
}

export function render(state, { deformationStrength = 1 } = {}) {
  const palette = scenePalette(state);
  const builder = builderForState(state, palette);
  const metrics = sceneMetrics(builder);

  drawWaterline(builder, state, palette, metrics);
  state.plants.forEach((plant, index) => {
    if ((plant.seed & 1) === 0) drawPlant(builder, plant, index, state, palette, metrics, false);
  });
  drawAmbient(builder, state, palette, metrics);
  drawSchool(builder, state, palette, metrics);
  drawIndividuals(builder, state, palette, metrics, deformationStrength);
  drawReaction(builder, state.reaction, palette, metrics);
  state.plants.forEach((plant, index) => {
    if ((plant.seed & 1) === 1) drawPlant(builder, plant, index, state, palette, metrics, true);
  });
  drawSubstrate(builder, state, palette, metrics);
  return finalizeScene(builder);
}

export function renderSpriteScene(sprite, {
  facing = "right",
  phase = 0,
  deformationStrength = 1,
  paletteMode = "day",
  staticPose = false,
} = {}) {
  const { width: spriteWidth, height: spriteHeight } = spriteDimensions(sprite);
  const logicalWidth = spriteWidth + 4;
  const logicalHeight = spriteHeight + 3;
  const dimensions = {
    width: Math.round(logicalWidth * 18),
    height: Math.round(logicalHeight * 28),
    logicalWidth,
    logicalHeight,
  };
  const palette = scenePalette({ timeOfDayHours: paletteMode === "night" ? 2 : 12 });
  const builder = createSceneBuilder({
    ...dimensions,
    background: createBackground(dimensions, palette, 0x51a7, false),
    metadata: { paletteStage: palette.paletteStage, lab: true },
  });
  const metrics = sceneMetrics(builder);
  const points = poseSprite(sprite, {
    facing: facing === "left" ? -1 : 1,
    phase,
    deformationStrength: staticPose ? 0 : deformationStrength,
    turnScale: 1,
  });
  const spriteSeed = individualSprites.indexOf(sprite) + 1;
  const glyphs = points.map((point) => positionedGlyph(metrics, {
    char: point.char,
    worldX: logicalWidth / 2 + point.x,
    worldY: logicalHeight / 2 + point.y,
    fg: maskColor(point.mask, spriteSeed, palette),
    scaleX: 1,
    scaleY: 1,
  }));
  addGlyphObject(builder, { id: `lab:${sprite.id}:${facing}`, layer: LAYERS.individuals, glyphs, padding: 3 });
  return finalizeScene(builder);
}

export { individualSprites };
