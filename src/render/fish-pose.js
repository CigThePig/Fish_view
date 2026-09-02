import { glyphFlip, normalizeRows } from "../art/mirror.js";
import { spriteDimensions } from "../art/sprites.js";
import { CELL_HEIGHT, CELL_WIDTH } from "../sim/config.js";
import { pitchCoordinate } from "./fish-pitch.js";

// One pose implementation owns the geometry for every part of a fish: glyph
// anchors, glyph ink orientation, and the opaque body silhouette all come
// through here. Keeping it shared is what keeps them registered - the fish
// flexes by column, so anything generated from a second transform visibly
// drifts behind the ink - and it is why the artwork lab and the tank cannot
// disagree about what a profile looks like.

const spritePointCache = new Map();

export function spritePoints(sprite) {
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
  const result = Object.freeze({ id: sprite.id, width, height, points: Object.freeze(points) });
  spritePointCache.set(sprite.id, result);
  return result;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

// Source column/row -> fish-local cell offsets from the body centre.
//
// The ordering is deliberate and is the conceptual model for the whole
// renderer: authored artwork, then the living swimming deformation, then one
// rigid pitch rotation of the deformed body, then world placement and depth
// scale by the caller. Pitch rotates the swimming fish; it does not replace its
// motion, and it is not itself expressed as deformation.
export function poseCoordinate(source, column, row, {
  facing = 1,
  phase = 0,
  deformationStrength = 1,
  turnScale = 1,
  pitch = 0,
  cellAspect = CELL_HEIGHT / CELL_WIDTH,
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
  const pitched = pitchCoordinate(localX, localY + bodyWave + tailBeat, {
    facing,
    pitch,
    cellAspect,
    turnScale,
  });
  return {
    x: pitched.x,
    y: pitched.y,
    tail,
  };
}

export function poseSprite(sprite, {
  facing = 1,
  phase = 0,
  deformationStrength = 1,
  turnScale = 1,
  pitch = 0,
  cellAspect = CELL_HEIGHT / CELL_WIDTH,
} = {}) {
  const source = spritePoints(sprite);
  return source.points.map((point) => {
    const posed = poseCoordinate(source, point.column, point.row, {
      facing,
      phase,
      deformationStrength,
      turnScale,
      pitch,
      cellAspect,
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

// How wide a glyph bitmap is drawn relative to its cell. Turn compression moves
// glyph anchors together but deliberately keeps each character readable, so the
// bitmaps stay near full width while the body they sit on narrows. The opaque
// body has to know this to stay behind them.
export function glyphWidthScale(turnScale) {
  return 0.9 + clamp(Number.isFinite(turnScale) ? turnScale : 1, 0, 1) * 0.1;
}
