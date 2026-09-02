import { CELL_HEIGHT, CELL_WIDTH, PITCH_POSE_ROTATION_FRACTION } from "../sim/config.js";
import { MAX_FISH_PITCH_DEGREES } from "../sim/fish-motion.js";

const AUTHORED_PITCH_LIMIT_DEGREES = 30;
const GENERIC_STRONG_SLOPE = Math.tan(14 * Math.PI / 180);
// The authored poses alone put about eleven degrees of tilt on the panel at a
// full thirty-two degree pitch: a four pixel offset across a fifty pixel fish,
// which is most of a posture cue thrown away before it reaches the glass. They
// cannot simply be scaled up - they are hand-authored shears, and tripling one
// pulls the ink off its own body. So the drawing is also turned bodily about
// its centre by this share of the pitch. A rotation keeps every glyph in the
// same arrangement relative to its neighbours, so the silhouette leans as one
// piece and the authored pose keeps supplying the character on top of it.
//
// The share lives in sim/config.js because the substrate clearance has to
// reserve room for exactly the lean that gets drawn.
const RIGID_PITCH_FRACTION = PITCH_POSE_ROTATION_FRACTION;
const DEGREES_TO_RADIANS = Math.PI / 180;

// Every point of one fish shares a pitch, a facing and a turn, so the two
// trigonometric calls happen once per pose rather than once per glyph. The
// memo is three scalars rather than an object with a key: this runs per glyph
// per frame on a microcontroller, where an allocation per call would be the
// expensive part of the whole transform.
let memoPitch = Number.NaN;
let memoFacing = 0;
let memoTurnScale = Number.NaN;
let rotationSin = 0;
let rotationCos = 1;

// A fish turning through the glass is drawn compressed, and a body seen close
// to edge-on has little length left to tilt: its nose and tail are nearly on
// top of each other. Foreshortening the turn is therefore how much of it can
// show, which is also what keeps the compressed body from swinging over its
// own authored tail ink mid-turn.
function syncRotation(pitch, facing, turnScale) {
  if (pitch === memoPitch && facing === memoFacing && turnScale === memoTurnScale) return;
  memoPitch = pitch;
  memoFacing = facing;
  memoTurnScale = turnScale;
  const angle = pitch * RIGID_PITCH_FRACTION * turnScale
    * DEGREES_TO_RADIANS * (facing < 0 ? -1 : 1);
  rotationSin = Math.sin(angle);
  rotationCos = Math.cos(angle);
}

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
  "twin-sail": Object.freeze({
    columnRise: Object.freeze([-0.72, -0.5, -0.27, -0.03, 0.21, 0.46, 0.72]),
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

// The tangent of the turn actually applied to the drawing. The ink is sheared
// by the same angle the body is turned through, so a character leans with the
// fish rather than standing upright inside a leaning arrangement.
export function pitchSlant(pitch, facing = 1, turnScale = 1) {
  const bounded = clamp(Number.isFinite(pitch) ? pitch : 0, -MAX_FISH_PITCH_DEGREES, MAX_FISH_PITCH_DEGREES);
  if (bounded === 0) return 0;
  syncRotation(bounded, facing, clamp(Number.isFinite(turnScale) ? turnScale : 1, 0, 1));
  return rotationCos === 0 ? 0 : rotationSin / rotationCos;
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
  turnScale = 1,
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

  const posedX = x + lean * factor * (facing < 0 ? -1 : 1);
  const posedY = y + (rise * factor) / aspect;

  // Turn the posed point about the body centre. The two axes are different
  // physical sizes, so the rotation is done in row units - a column is 1/aspect
  // of a row - and converted back, or the fish would shear instead of turn.
  syncRotation(boundedPitch, facing, clamp(Number.isFinite(turnScale) ? turnScale : 1, 0, 1));
  if (rotationSin === 0) return { x: posedX, y: posedY };
  const rowsX = posedX / aspect;
  return {
    x: (rowsX * rotationCos - posedY * rotationSin) * aspect,
    y: rowsX * rotationSin + posedY * rotationCos,
  };
}
