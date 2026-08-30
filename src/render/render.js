import { glyphFlip, mirrorRows, normalizeRows } from "../art/mirror.js";
import {
  individualSprites,
  plantArt,
  schoolGlyphs,
  spriteDimensions,
  substrateArt,
} from "../art/sprites.js";
import { CELL_HEIGHT, CELL_WIDTH, orientationConfig, SUBSTRATE_ROWS, WATERLINE_ROWS } from "../sim/config.js";
import { plantHeight, spriteForSeed } from "../sim/entities.js";
import { sample01, sampleRange, sampleSigned } from "../sim/prng.js";
import { glyphPixels } from "./bitmap-font.js";
import { BODY_PROFILES, DEFAULT_BODY_PROFILE } from "./body-profiles.js?v=final-body-profiles-20260830";
import { bodyFillForDepth, MASK_SYMBOLS, scenePalette } from "./palette.js?v=opaque-bodies-20260830";
import {
  addGlyphObject,
  createSceneBuilder,
  finalizeScene,
  positionedGlyph,
  sceneMetrics,
} from "./scene.js?v=opaque-bodies-20260830";

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

// One pose function owns the geometry for both glyphs and the opaque body.
// Keeping this shared is important: the fish flexes by column, so any underlay
// generated from a separate rigid transform will visibly drift behind the ink.
function poseCoordinate(source, column, row, {
  facing = 1,
  phase = 0,
  deformationStrength = 1,
  turnScale = 1,
} = {}) {
  const tail = source.width <= 1
    ? 0
    : clamp(1 - column / (source.width - 1), 0, 1);
  const displayColumn = facing < 0 ? source.width - 1 - column : column;
  const columnSpacing = 1 + Math.sin(phase + tail * 0.9) * 0.018 * deformationStrength;
  const rowSpacing = 1 + Math.sin(phase * 0.72 + column * 0.31) * 0.012 * deformationStrength;
  const localX = (displayColumn - (source.width - 1) / 2) * columnSpacing * turnScale;
  const localY = (row - (source.height - 1) / 2) * rowSpacing;
  const tailWeight = 0.1 + Math.pow(tail, 1.65) * 0.9;
  const bodyWave = Math.sin(phase - column * 0.22) * 0.145 * tailWeight * deformationStrength;
  const tailBeat = Math.sin(phase * 1.04 + 0.45) * 0.065 * Math.pow(tail, 3) * deformationStrength;
  return {
    x: localX,
    y: localY + bodyWave + tailBeat,
    tail,
  };
}

export function poseSprite(sprite, {
  facing = 1,
  phase = 0,
  deformationStrength = 1,
  turnScale = 1,
} = {}) {
  const source = spritePoints(sprite);
  return source.points.map((point) => {
    const posed = poseCoordinate(source, point.column, point.row, {
      facing,
      phase,
      deformationStrength,
      turnScale,
    });
    return {
      char: facing < 0 ? (glyphFlip[point.char] ?? point.char) : point.char,
      mask: point.mask,
      x: posed.x,
      y: posed.y,
      tail: posed.tail,
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
        color: palette.substrateBg,
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
  const spacing = 1.65;
  const count = Math.ceil(state.cols / spacing);
  for (let index = 0; index < count; index += 1) {
    if (sample01(state.seed, 1050 + index) > 0.9) continue;
    const worldX = 0.55 + index * spacing + sampleSigned(state.seed, 1100 + index) * 0.18;
    if (worldX >= state.cols) continue;
    const wave = Math.sin(state.elapsedRealSeconds * 0.42 + worldX * 0.34 + sampleRange(state.seed, 1200 + index, 0, TAU));
    const worldY = 0.64 + wave * 0.09 + sampleSigned(state.seed, 1300 + index) * 0.03;
    const char = index % 13 === 0 ? "'" : index % 9 === 0 ? "^" : "~";
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

// ASCII fish used to be see-through: water bands, plants, and every other fish
// read straight through the sprite, which is what made a crowded school look
// like scattered line fragments. Each fish gets one opaque body behind its
// strokes. The body is nine vertical slices across a soft ellipse, and each
// slice goes through the same pose transform as the glyph column beside it.
// That keeps the fill attached while the fish flexes and during the edge-on
// turn pose, without asking the panel driver to do anything but fillRect.
const BODY_SPANS = 9;
// A little more height than the ink strictly occupies, in cell units. `_` draws
// along the bottom of its cell, so the roof and belly sit right on the body's
// edge. A small swell backs those strokes without turning the silhouette square.
const BODY_SWELL = 0.2;
// One or two pixels of overlap keeps adjacent integer-snapped slices from
// opening hairline water gaps as their centres move independently.
const BODY_SLICE_OVERLAP = 1;

// The source artwork is deliberately varied, so each sprite gets an authored
// profile for body position, scale and taper. Those final values live in
// body-profiles.js and are shared with the Typographic Motion Lab so Reset in
// the lab always returns to the exact production geometry.
const bodyBoxCache = new Map();
const FIN_GLYPHS = new Set(["/", "\\"]);
// The vocabulary asciiquarium draws a tail from: the fin itself, the stroke
// pair that fans it, and the peduncle joining it to the body.
const TAIL_GLYPHS = new Set([">", "<", "=", "/", "\\"]);

// The body is fitted to the artwork rather than to the sprite's bounding box,
// which is a good deal larger than the fish inside it. Two kinds of row are
// fins, and fins stay outside the body so they keep their open ASCII
// silhouette: a row carrying a single stroke, and an outermost row drawn only
// from `/` and `\`. Everything else is fish and has to be backed - including
// the `_` roof and belly of the short sprites, which any fixed fraction of the
// sprite height leaves bare.
// A glyph's lit pixels, as offsets in cell units from the cell's own centre.
// Measuring the real ink matters: `_` draws along the bottom of its cell, so a
// body sized from cell centres reaches most of a cell above the roof it backs
// and leaves a tab sticking out over the fish. The horizontal extent is
// symmetrised because the same body serves both facings, and a mirrored glyph
// puts its ink on the other side of the cell.
function inkExtent(char) {
  const pixels = glyphPixels(char);
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let reach = 0;
  for (const pixel of pixels) {
    minY = Math.min(minY, pixel.y);
    maxY = Math.max(maxY, pixel.y + pixel.height);
    reach = Math.max(reach, Math.abs(pixel.x - CELL_WIDTH / 2), Math.abs(pixel.x + pixel.width - CELL_WIDTH / 2));
  }
  return {
    reach: reach / CELL_WIDTH,
    top: (minY - CELL_HEIGHT / 2) / CELL_HEIGHT,
    bottom: (maxY - CELL_HEIGHT / 2) / CELL_HEIGHT,
  };
}

// Sprites are authored facing right, so the tail is the run of columns at the
// trailing edge drawn only from tail glyphs. It stops at the first column
// carrying anything else, which is where the body proper starts. The tail is
// left open like the fins: an opaque body behind it would read as one blunt
// mass rather than as a fish.
function tailColumns(source) {
  const columns = new Map();
  for (const point of source.points) {
    columns.set(point.column, (columns.get(point.column) ?? true) && TAIL_GLYPHS.has(point.char));
  }
  let end = 0;
  while (columns.get(end) === true) end += 1;
  return end;
}

function spriteBodyBox(sprite) {
  if (bodyBoxCache.has(sprite.id)) return bodyBoxCache.get(sprite.id);
  const source = spritePoints(sprite);
  const tail = tailColumns(source);
  const rows = new Map();
  for (const point of source.points) {
    const row = rows.get(point.row) ?? { count: 0, points: [], strokesOnly: true };
    row.count += 1;
    row.points.push(point);
    row.strokesOnly = row.strokesOnly && FIN_GLYPHS.has(point.char);
    rows.set(point.row, row);
  }
  let top = Number.POSITIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  let left = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  for (const [index, row] of rows) {
    const edge = index === 0 || index === source.height - 1;
    if (row.count < 2 || (edge && row.strokesOnly)) continue;
    for (const point of row.points) {
      if (point.column < tail) continue;
      const ink = inkExtent(point.char);
      top = Math.min(top, index + ink.top);
      bottom = Math.max(bottom, index + ink.bottom);
      left = Math.min(left, point.column - ink.reach);
      right = Math.max(right, point.column + ink.reach);
    }
  }
  const box = Object.freeze({
    // Cell units, measured from the sprite's own centre, so a body that sits
    // off-centre inside its box travels with the fish.
    offsetX: (left + right) / 2 - (source.width - 1) / 2,
    offsetY: (top + bottom) / 2 - (source.height - 1) / 2,
    radiusX: (right - left) / 2,
    radiusY: (bottom - top) / 2,
  });
  bodyBoxCache.set(sprite.id, box);
  return box;
}

function bodyFill(sprite, metrics, {
  worldX,
  worldY,
  turnScale,
  facing,
  phase,
  deformationStrength,
  color,
}) {
  const source = spritePoints(sprite);
  const box = spriteBodyBox(sprite);
  const profile = BODY_PROFILES[sprite.id] ?? DEFAULT_BODY_PROFILE;
  const centerColumn = (source.width - 1) / 2 + box.offsetX + profile.offsetX;
  const centerRow = (source.height - 1) / 2 + box.offsetY + profile.offsetY;
  const radiusX = box.radiusX * profile.radiusXScale;
  const radiusY = (box.radiusY + BODY_SWELL) * profile.radiusYScale;
  const sliceSourceWidth = (radiusX * 2) / BODY_SPANS;
  // Glyph centres compress with turnScale, but each bitmap intentionally stays
  // readable. Preserve that local ink width around each compressed slice so the
  // body does not collapse to 32% while the characters remain about 93% wide.
  const glyphScaleX = 0.9 + turnScale * 0.1;
  const pose = { facing, phase, deformationStrength, turnScale };
  const fill = [];

  for (let index = 0; index < BODY_SPANS; index += 1) {
    const localLeft = -radiusX + index * sliceSourceWidth;
    const localRight = localLeft + sliceSourceWidth;
    const localCenter = (localLeft + localRight) / 2;
    const waist = radiusX > 0 ? Math.abs(localCenter) / radiusX : 0;
    // Positive source-space X is the nose because all source sprites face right.
    // Using a separate front shoulder lets pointed fish close around `>` instead
    // of carrying a round bubble beyond it, while the rear half stays unchanged.
    const shoulder = localCenter >= 0 ? profile.frontShoulder : profile.rearShoulder;
    const taper = Math.sqrt(Math.max(0, 1 - waist ** shoulder));
    const halfHeight = radiusY * taper;
    if (halfHeight <= 0) continue;

    const sourceColumn = centerColumn + localCenter;
    const center = poseCoordinate(source, sourceColumn, centerRow, pose);
    const top = poseCoordinate(source, sourceColumn, centerRow - halfHeight, pose);
    const bottom = poseCoordinate(source, sourceColumn, centerRow + halfHeight, pose);
    const leftEdge = poseCoordinate(source, centerColumn + localLeft, centerRow, pose);
    const rightEdge = poseCoordinate(source, centerColumn + localRight, centerRow, pose);

    const geometricWidth = Math.abs(rightEdge.x - leftEdge.x) * metrics.cellWidth;
    const localInkWidth = sliceSourceWidth * metrics.cellWidth * glyphScaleX;
    // Narrow the end slices as well as shortening them. Besides keeping the
    // silhouette round, this preserves the old renderer contract that a body
    // cannot become a rectangular block.
    const sliceWidth = Math.max(
      2,
      Math.max(geometricWidth, localInkWidth) * (0.6 + taper * 0.4) + BODY_SLICE_OVERLAP,
    );
    const centerX = (worldX + center.x) * metrics.cellWidth;
    const left = Math.round(centerX - sliceWidth / 2);
    const right = Math.round(centerX + sliceWidth / 2) + 1;
    const spanTop = Math.round((worldY + Math.min(top.y, bottom.y)) * metrics.cellHeight);
    const spanBottom = Math.round((worldY + Math.max(top.y, bottom.y)) * metrics.cellHeight) + 1;
    if (right - left < 1 || spanBottom - spanTop < 1) continue;

    fill.push({
      x: left,
      y: spanTop,
      width: right - left,
      height: spanBottom - spanTop,
      color,
    });
  }
  return fill;
}

function individualParts(fish, state, palette, metrics, deformationStrength = 1, depth = 0) {
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
  const glyphs = points.map((point) => positionedGlyph(metrics, {
    char: point.char,
    worldX: fish.x + point.x,
    worldY: fish.y + point.y + bob,
    fg: maskColor(point.mask, fish.seed, palette),
    scaleX: 0.9 + turning.widthScale * 0.1,
    scaleY: 1,
  }));
  const fill = bodyFill(sprite, metrics, {
    worldX: fish.x,
    worldY: fish.y + bob,
    turnScale: turning.widthScale,
    facing: turning.facing,
    phase,
    deformationStrength,
    color: bodyFillForDepth(palette, depth),
  });
  return { glyphs, fill };
}

// createBackground spreads its six water bands from logical y = 0 down to the
// substrate, so a body has to be normalised against that same extent and
// origin. Measuring from the waterline instead put the band boundaries in
// different places and picked the companion of a band the fish was not
// actually swimming in.
function waterBandDepth(state, worldY) {
  return clamp(worldY / Math.max(1, state.rows - SUBSTRATE_ROWS), 0, 0.999);
}

function drawIndividuals(builder, state, palette, metrics, deformationStrength) {
  state.individuals.forEach((fish, index) => {
    const depth = waterBandDepth(state, fish.y);
    const parts = individualParts(fish, state, palette, metrics, deformationStrength, depth);
    addGlyphObject(builder, {
      id: `individual:${index}:${fish.seed}`,
      layer: LAYERS.individuals,
      glyphs: parts.glyphs,
      fill: parts.fill,
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
        worldX: column + 0.5 + sampleSigned(state.seed, salt + 900) * 0.32,
        worldY: start + row + 0.5 + sampleSigned(state.seed, salt + 1100) * 0.27,
        fg: palette.substrateFg,
        scaleX: sampleRange(state.seed, salt + 1300, 0.74, 0.88),
        scaleY: sampleRange(state.seed, salt + 1500, 0.68, 0.82),
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
  turnScale = 1,
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
  const effectiveDeformation = staticPose ? 0 : deformationStrength;
  const facingValue = facing === "left" ? -1 : 1;
  const points = poseSprite(sprite, {
    facing: facingValue,
    phase,
    deformationStrength: effectiveDeformation,
    turnScale,
  });
  const spriteSeed = individualSprites.indexOf(sprite) + 1;
  const glyphs = points.map((point) => positionedGlyph(metrics, {
    char: point.char,
    worldX: logicalWidth / 2 + point.x,
    worldY: logicalHeight / 2 + point.y,
    fg: maskColor(point.mask, spriteSeed, palette),
    scaleX: 0.9 + turnScale * 0.1,
    scaleY: 1,
  }));
  addGlyphObject(builder, {
    id: `lab:${sprite.id}:${facing}`,
    layer: LAYERS.individuals,
    glyphs,
    fill: bodyFill(sprite, metrics, {
      worldX: logicalWidth / 2,
      worldY: logicalHeight / 2,
      turnScale,
      facing: facingValue,
      phase,
      deformationStrength: effectiveDeformation,
      color: bodyFillForDepth(palette, 0.5),
    }),
    padding: 3,
  });
  return finalizeScene(builder);
}

export { individualSprites };
