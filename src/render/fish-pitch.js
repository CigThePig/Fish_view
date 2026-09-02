import { CELL_HEIGHT, CELL_WIDTH, PITCH_ROTATION_FRACTION } from "../sim/config.js";
import { MAX_FISH_PITCH_DEGREES } from "../sim/fish-motion.js";
import { quantizeSpin, quantizeUnitAspect } from "./glyph-raster.js";

// The single authoritative pitch transform.
//
// Everything the renderer draws for a pitched fish - glyph anchors, the ink
// inside each glyph, the opaque body silhouette, object bounds - is derived
// from the one angle this module computes and the one rotation it applies.
//
// It used to be three different things at once: a hand-authored per-species
// shear table ("columnRise" / "rowLean") that bent the drawing, a rigid
// rotation of the glyph anchors at eight tenths of the physical angle, and a
// horizontal shear of the glyph bitmaps at a third angle again. The shear
// tables existed only because a five-by-seven bitmap could not be turned, and
// the eight-tenths exaggeration existed only to make a body assembled from
// upright letters read as tilted at all. The ink is genuinely rotated now
// (see glyph-raster.js), so both compensations are gone and the drawn angle is
// simply the angle.
const DEGREES_TO_RADIANS = Math.PI / 180;

// Every point of one fish shares a pitch, a facing and a turn, so the two
// trigonometric calls happen once per pose rather than once per glyph. The
// memo is three scalars rather than an object with a key: this runs per glyph
// per frame on a microcontroller, where an allocation per call would be the
// expensive part of the whole transform.
let memoAngle = Number.NaN;
let rotationSin = 0;
let rotationCos = 1;

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function syncRotation(angle) {
  if (angle === memoAngle) return;
  memoAngle = angle;
  rotationSin = Math.sin(angle);
  rotationCos = Math.cos(angle);
}

// The signed angle, in degrees, that the drawing is actually turned through.
//
// A fish turning through the glass is drawn compressed, and a body seen close
// to edge-on has little length left to tilt: its nose and tail are nearly on
// top of each other. Foreshortening the turn is therefore how much of the lean
// can show, which is also what keeps the compressed body from swinging over its
// own authored tail ink mid-turn.
//
// Mirroring is a sign flip because the sprite's own nose has moved to the other
// side of its centre: a left-facing fish diving still has to put its nose down.
export function pitchAngleDegrees(pitch, facing = 1, turnScale = 1) {
  const bounded = clamp(
    Number.isFinite(pitch) ? pitch : 0,
    -MAX_FISH_PITCH_DEGREES,
    MAX_FISH_PITCH_DEGREES,
  );
  if (bounded === 0) return 0;
  const turn = clamp(Number.isFinite(turnScale) ? turnScale : 1, 0, 1);
  return bounded * PITCH_ROTATION_FRACTION * turn * (facing < 0 ? -1 : 1);
}

// How tall one authoring unit is on the panel relative to how wide it is. The
// glyph rasteriser needs this to turn ink by the same angle the anchors turn
// by; a scene that does not keep the font's 12x24 cell proportion would
// otherwise shear its characters while rotating their positions.
export function glyphUnitAspect(cellAspect) {
  const aspect = Number.isFinite(cellAspect) && cellAspect > 0
    ? cellAspect
    : CELL_HEIGHT / CELL_WIDTH;
  return aspect / (CELL_HEIGHT / CELL_WIDTH);
}

// The raster state one pitched fish hands to every glyph it draws: which cached
// rotation to use, and at which unit aspect. Both are integers, so the damage
// signature can carry them exactly - quantised rotation is what makes "the ink
// moved" and "the signature changed" the same statement.
export function pitchGlyphSpin(pitch, facing = 1, turnScale = 1, cellAspect = CELL_HEIGHT / CELL_WIDTH) {
  const spin = quantizeSpin(pitchAngleDegrees(pitch, facing, turnScale));
  return { spin, spinAspect: spin === 0 ? 0 : quantizeUnitAspect(glyphUnitAspect(cellAspect)) };
}

// Turn a point of the fish about the body centre. The two axes are different
// physical sizes, so the rotation is done in row units - a column is 1/aspect
// of a row - and converted back, or the fish would shear instead of turn.
export function pitchCoordinate(x, y, {
  facing = 1,
  pitch = 0,
  cellAspect = CELL_HEIGHT / CELL_WIDTH,
  turnScale = 1,
} = {}) {
  const angle = pitchAngleDegrees(pitch, facing, turnScale);
  if (angle === 0) return { x, y };
  const aspect = Number.isFinite(cellAspect) && cellAspect > 0
    ? cellAspect
    : CELL_HEIGHT / CELL_WIDTH;
  syncRotation(angle * DEGREES_TO_RADIANS);
  if (rotationSin === 0) return { x, y };
  const rowsX = x / aspect;
  return {
    x: (rowsX * rotationCos - y * rotationSin) * aspect,
    y: rowsX * rotationSin + y * rotationCos,
  };
}
