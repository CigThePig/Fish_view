import { CELL_HEIGHT, CELL_WIDTH } from "../sim/config.js";
import { MAX_FISH_PITCH_DEGREES } from "../sim/fish-motion.js";

const AUTHORED_PITCH_LIMIT_DEGREES = 30;
const GENERIC_STRONG_SLOPE = Math.tan(14 * Math.PI / 180);

// These are not rotated bitmap poses. Each table is the strong nose-down
// silhouette for one authored fish, expressed in physical cell-width units.
// `columnRise` keeps the body line connected by moving whole source columns
// only a fraction of a row. `rowLean` gives fins and the belly a tiny opposing
// horizontal lean so the silhouette reads as pitched without pulling the ASCII
// drawing apart. Nose-up is the exact signed inverse, and intermediate pitch
// values interpolate continuously from the level artwork.
const PITCH_POSES = Object.freeze({
  "double-fin": Object.freeze({
    columnRise: Object.freeze([-0.63, -0.41, -0.18, 0.06, 0.34, 0.63]),
    rowLean: Object.freeze([0.08, 0.04, 0, -0.04, -0.08]),
  }),
  "round-fin": Object.freeze({
    columnRise: Object.freeze([-0.75, -0.52, -0.28, -0.03, 0.2, 0.47, 0.75]),
    rowLean: Object.freeze([0.08, 0.04, 0, -0.04, -0.08]),
  }),
  "tiny-dart": Object.freeze({
    columnRise: Object.freeze([-0.49, -0.28, -0.02, 0.26, 0.49]),
    rowLean: Object.freeze([0.05, 0, -0.05]),
  }),
  "single-fin": Object.freeze({
    columnRise: Object.freeze([-0.62, -0.4, -0.17, 0.07, 0.33, 0.62]),
    rowLean: Object.freeze([0.08, 0.04, 0, -0.04, -0.08]),
  }),
  "comma-tail": Object.freeze({
    columnRise: Object.freeze([-0.5, -0.27, -0.01, 0.25, 0.5]),
    rowLean: Object.freeze([0.05, 0, -0.05]),
  }),
  "box-fin": Object.freeze({
    columnRise: Object.freeze([-0.49, -0.25, 0, 0.25, 0.49]),
    rowLean: Object.freeze([0.05, 0, -0.05]),
  }),
});

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function sampleCurve(curve, coordinate) {
  if (!curve?.length) return 0;
  const bounded = clamp(coordinate, 0, curve.length - 1);
  const lower = Math.floor(bounded);
  const upper = Math.min(curve.length - 1, lower + 1);
  const amount = bounded - lower;
  return curve[lower] + (curve[upper] - curve[lower]) * amount;
}

function genericColumnRise(column, width) {
  if (!Number.isFinite(column) || !Number.isFinite(width) || width <= 1) return 0;
  return (column - (width - 1) / 2) * GENERIC_STRONG_SLOPE;
}

function genericRowLean(row, height) {
  if (!Number.isFinite(row) || !Number.isFinite(height) || height <= 1) return 0;
  const centered = row - (height - 1) / 2;
  return -centered * (0.1 / Math.max(1, (height - 1) / 2));
}

export function pitchCoordinate(x, y, {
  facing = 1,
  pitch = 0,
  cellAspect = CELL_HEIGHT / CELL_WIDTH,
  spriteId = null,
  column = null,
  row = null,
  width = null,
  height = null,
} = {}) {
  const boundedPitch = clamp(
    Number.isFinite(pitch) ? pitch : 0,
    -MAX_FISH_PITCH_DEGREES,
    MAX_FISH_PITCH_DEGREES,
  );
  if (Math.abs(boundedPitch) < 1e-12) return { x, y };

  const aspect = Number.isFinite(cellAspect) && cellAspect > 0
    ? cellAspect
    : CELL_HEIGHT / CELL_WIDTH;
  const factor = clamp(
    boundedPitch / AUTHORED_PITCH_LIMIT_DEGREES,
    -1,
    1,
  );
  const pose = PITCH_POSES[spriteId] ?? null;
  const rise = pose && Number.isFinite(column)
    ? sampleCurve(pose.columnRise, column)
    : genericColumnRise(column, width);
  const lean = pose && Number.isFinite(row)
    ? sampleCurve(pose.rowLean, row)
    : genericRowLean(row, height);

  return {
    x: x + lean * factor * (facing < 0 ? -1 : 1),
    y: y + (rise * factor) / aspect,
  };
}
