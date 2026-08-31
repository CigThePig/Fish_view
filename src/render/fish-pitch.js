import { CELL_HEIGHT, CELL_WIDTH } from "../sim/config.js";
import { MAX_FISH_PITCH_DEGREES } from "../sim/fish-motion.js";

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

// Pitch is semantic rather than source-axis rotation: positive always means the
// fish's nose points down, even after the sprite has mirrored to face left.
// Coordinates are converted into physical cell proportions before rotation so
// a 24px logical row cannot accidentally count as the same distance as a 12px
// logical column. The bitmap glyphs themselves remain upright; only anchors and
// the fillRect-compatible body geometry pass through this transform.
export function pitchCoordinate(x, y, {
  facing = 1,
  pitch = 0,
  cellAspect = CELL_HEIGHT / CELL_WIDTH,
} = {}) {
  const boundedPitch = clamp(Number.isFinite(pitch) ? pitch : 0, -MAX_FISH_PITCH_DEGREES, MAX_FISH_PITCH_DEGREES);
  if (Math.abs(boundedPitch) < 1e-12) return { x, y };
  const aspect = Number.isFinite(cellAspect) && cellAspect > 0 ? cellAspect : CELL_HEIGHT / CELL_WIDTH;
  const angle = boundedPitch * Math.PI / 180 * (facing < 0 ? -1 : 1);
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const physicalY = y * aspect;
  return {
    x: x * cosine - physicalY * sine,
    y: (x * sine + physicalY * cosine) / aspect,
  };
}
