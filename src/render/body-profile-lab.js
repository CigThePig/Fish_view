import { normalizeRows } from "../art/mirror.js";
import { spriteDimensions } from "../art/sprites.js";
import { CELL_HEIGHT, CELL_WIDTH } from "../sim/config.js";
import { glyphPixels } from "./bitmap-font.js";
import { pitchCoordinate } from "./fish-pitch.js?v=phase4-growth-20260901";
import { BODY_PROFILES, DEFAULT_BODY_PROFILE } from "./body-profiles.js?v=phase4-growth-20260901";
import { glyphBounds } from "./scene.js?v=opaque-bodies-20260830";

const BODY_SPANS = 9;
const BODY_SWELL = 0.2;
const BODY_SLICE_OVERLAP = 1;
const FIN_GLYPHS = new Set(["/", "\\"]);
const TAIL_GLYPHS = new Set([">", "<", "=", "/", "\\"]);

export const DEFAULT_TUNABLE_BODY_PROFILE = DEFAULT_BODY_PROFILE;

const spritePointCache = new Map();
const bodyBoxCache = new Map();

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function spritePoints(sprite) {
  if (spritePointCache.has(sprite.id)) return spritePointCache.get(sprite.id);
  const { width, height } = spriteDimensions(sprite);
  const shape = normalizeRows(sprite.shape, width);
  const points = [];
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const char = [...shape[row]][column];
      if (!char || char === " ") continue;
      points.push({ char, column, row });
    }
  }
  const result = Object.freeze({ id: sprite.id, width, height, points: Object.freeze(points) });
  spritePointCache.set(sprite.id, result);
  return result;
}

function poseCoordinate(source, column, row, {
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
  return pitchCoordinate(localX, localY + bodyWave + tailBeat, {
    facing,
    pitch,
    cellAspect,
    spriteId: source.id,
    column,
    row,
    width: source.width,
    height: source.height,
  });
}

function inkExtent(char) {
  const pixels = glyphPixels(char);
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let reach = 0;
  for (const pixel of pixels) {
    minY = Math.min(minY, pixel.y);
    maxY = Math.max(maxY, pixel.y + pixel.height);
    reach = Math.max(
      reach,
      Math.abs(pixel.x - CELL_WIDTH / 2),
      Math.abs(pixel.x + pixel.width - CELL_WIDTH / 2),
    );
  }
  return {
    reach: reach / CELL_WIDTH,
    top: (minY - CELL_HEIGHT / 2) / CELL_HEIGHT,
    bottom: (maxY - CELL_HEIGHT / 2) / CELL_HEIGHT,
  };
}

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
    offsetX: (left + right) / 2 - (source.width - 1) / 2,
    offsetY: (top + bottom) / 2 - (source.height - 1) / 2,
    radiusX: (right - left) / 2,
    radiusY: (bottom - top) / 2,
  });
  bodyBoxCache.set(sprite.id, box);
  return box;
}

function finiteOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function bodyProfileForSprite(sprite) {
  return { ...(BODY_PROFILES[sprite.id] ?? DEFAULT_BODY_PROFILE) };
}

export function normalizeTunableBodyProfile(profile, fallback = DEFAULT_TUNABLE_BODY_PROFILE) {
  return {
    offsetX: finiteOr(profile?.offsetX, fallback.offsetX),
    offsetY: finiteOr(profile?.offsetY, fallback.offsetY),
    radiusXScale: Math.max(0.1, finiteOr(profile?.radiusXScale, fallback.radiusXScale)),
    radiusYScale: Math.max(0.1, finiteOr(profile?.radiusYScale, fallback.radiusYScale)),
    rearShoulder: Math.max(0.05, finiteOr(profile?.rearShoulder, fallback.rearShoulder)),
    frontShoulder: Math.max(0.05, finiteOr(profile?.frontShoulder, fallback.frontShoulder)),
  };
}

function bodyFill(sprite, metrics, profile, {
  worldX,
  worldY,
  turnScale,
  facing,
  phase,
  deformationStrength,
  pitch = 0,
  color,
}) {
  const source = spritePoints(sprite);
  const box = spriteBodyBox(sprite);
  const centerColumn = (source.width - 1) / 2 + box.offsetX + profile.offsetX;
  const centerRow = (source.height - 1) / 2 + box.offsetY + profile.offsetY;
  const radiusX = box.radiusX * profile.radiusXScale;
  const radiusY = (box.radiusY + BODY_SWELL) * profile.radiusYScale;
  const sliceSourceWidth = (radiusX * 2) / BODY_SPANS;
  const glyphScaleX = 0.9 + turnScale * 0.1;
  const cellAspect = metrics.cellHeight / metrics.cellWidth;
  const pose = { facing, phase, deformationStrength, turnScale, pitch, cellAspect };
  const fill = [];

  for (let index = 0; index < BODY_SPANS; index += 1) {
    const localLeft = -radiusX + index * sliceSourceWidth;
    const localRight = localLeft + sliceSourceWidth;
    const localCenter = (localLeft + localRight) / 2;
    const waist = radiusX > 0 ? Math.abs(localCenter) / radiusX : 0;
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
    const sliceWidth = Math.max(
      2,
      Math.max(geometricWidth, localInkWidth) * (0.6 + taper * 0.4) + BODY_SLICE_OVERLAP,
    );
    const centerX = (worldX + center.x) * metrics.cellWidth;
    let left;
    let right;
    let spanTop;
    let spanBottom;
    if (Math.abs(pitch) < 1e-12) {
      left = Math.round(centerX - sliceWidth / 2);
      right = Math.round(centerX + sliceWidth / 2) + 1;
      spanTop = Math.round((worldY + Math.min(top.y, bottom.y)) * metrics.cellHeight);
      spanBottom = Math.round((worldY + Math.max(top.y, bottom.y)) * metrics.cellHeight) + 1;
    } else {
      const corners = [
        poseCoordinate(source, centerColumn + localLeft, centerRow - halfHeight, pose),
        poseCoordinate(source, centerColumn + localLeft, centerRow + halfHeight, pose),
        poseCoordinate(source, centerColumn + localRight, centerRow - halfHeight, pose),
        poseCoordinate(source, centerColumn + localRight, centerRow + halfHeight, pose),
      ];
      const cornerLeft = (worldX + Math.min(...corners.map((point) => point.x))) * metrics.cellWidth;
      const cornerRight = (worldX + Math.max(...corners.map((point) => point.x))) * metrics.cellWidth;
      const cornerTop = (worldY + Math.min(...corners.map((point) => point.y))) * metrics.cellHeight;
      const cornerBottom = (worldY + Math.max(...corners.map((point) => point.y))) * metrics.cellHeight;
      const pitchFraction = Math.min(1, Math.abs(pitch) / 30);
      // The level body deliberately preserves enough local glyph width to
      // stay opaque through an edge-on turn. Once the body pitches, that
      // same safety width can extend through the authored tail at the rear
      // end. Inset only the trailing edge of the first two source slices,
      // proportional to pitch, while leaving their noseward edge and every
      // interior slice untouched.
      const rearBaseInset = sliceWidth
        * (index === 0 ? 0.42 : index === 1 ? 0.08 : 0)
        * pitchFraction;
      let baseLeft = centerX - sliceWidth / 2;
      let baseRight = centerX + sliceWidth / 2;
      if (facing < 0) baseRight -= rearBaseInset;
      else baseLeft += rearBaseInset;
      const fullLeft = Math.min(cornerLeft, baseLeft);
      const fullRight = Math.max(cornerRight, baseRight);
      // Bounding the slightly skewed authored slice as a rectangle still adds
      // tiny empty corners. At the rear those corners can reach into the open
      // ASCII tail, so taper only that trailing-side excess across the two rear
      // slices while retaining full coverage through the enclosed body.
      const rearExpansionFactor = index === 0 ? 0 : index === 1 ? 0.45 : 1;
      if (facing < 0) {
        left = Math.round(fullLeft);
        right = Math.round(baseRight + (fullRight - baseRight) * rearExpansionFactor) + 1;
      } else {
        left = Math.round(baseLeft - (baseLeft - fullLeft) * rearExpansionFactor);
        right = Math.round(fullRight) + 1;
      }
      spanTop = Math.round(cornerTop);
      spanBottom = Math.round(cornerBottom) + 1;
    }
    if (right - left < 1 || spanBottom - spanTop < 1) continue;

    fill.push({ x: left, y: spanTop, width: right - left, height: spanBottom - spanTop, color });
  }
  return fill;
}

function boundsForObject(scene, object, fill, padding = 3) {
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  const end = object.glyphStart + object.glyphCount;
  for (let index = object.glyphStart; index < end; index += 1) {
    const bounds = glyphBounds(scene.glyphs[index]);
    left = Math.min(left, bounds.x);
    top = Math.min(top, bounds.y);
    right = Math.max(right, bounds.x + bounds.width);
    bottom = Math.max(bottom, bounds.y + bounds.height);
  }
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

export function applyBodyProfileToSpriteScene(scene, sprite, profile, {
  facing = "right",
  phase = 0,
  deformationStrength = 1,
  staticPose = false,
  turnScale = 1,
  pitch = 0,
} = {}) {
  const object = scene.objects.find((candidate) => candidate.id.startsWith(`lab:${sprite.id}:`));
  if (!object) return scene;

  const normalized = normalizeTunableBodyProfile(profile, bodyProfileForSprite(sprite));
  const metrics = {
    cellWidth: scene.width / scene.logicalWidth,
    cellHeight: scene.height / scene.logicalHeight,
  };
  const effectiveDeformation = staticPose ? 0 : deformationStrength;
  const color = object.fill[0]?.color ?? "#000000";
  const fill = bodyFill(sprite, metrics, normalized, {
    worldX: scene.logicalWidth / 2,
    worldY: scene.logicalHeight / 2,
    turnScale,
    facing: facing === "left" ? -1 : 1,
    phase,
    deformationStrength: effectiveDeformation,
    pitch,
    color,
  });

  object.fill = fill;
  object.bounds = boundsForObject(scene, object, fill);
  object.signature += `:lab-profile:${[
    normalized.offsetX,
    normalized.offsetY,
    normalized.radiusXScale,
    normalized.radiusYScale,
    normalized.rearShoulder,
    normalized.frontShoulder,
    pitch,
  ].join(":")}`;
  return scene;
}
