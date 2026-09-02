import { INDIVIDUAL_VISUAL_SCALE_MAX } from "./config.js";
import { sample01, sampleRange } from "./prng.js";

// Continuous distance from the glass is world state, even though most of its
// consumers are visual. Keeping the tiny deterministic trajectories here lets
// simulation-side bubble kinematics and the renderer agree without either one
// importing the other.
const DRIFT_RATE = 0.045;
const DRIFT_AMOUNT = 0.1;

// Apparent size is part of the shared depth model, not renderer-only state.
// Most simulation bounds remain conservatively sized for the largest possible
// fish, but substrate grazing has to meet the artwork at the scale actually
// drawn or a far-plane fish hovers above debris placed on the floor.
const INDIVIDUAL_SCALE = Object.freeze([0.7, 0.84, 0.98, 1.12, INDIVIDUAL_VISUAL_SCALE_MAX]);

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function interpolate(table, depth) {
  const position = clamp(depth, 0, 1) * (table.length - 1);
  const index = Math.min(table.length - 2, Math.floor(position));
  const progress = position - index;
  return table[index] + (table[index + 1] - table[index]) * progress;
}

export function individualDepthScale(depth) {
  return interpolate(INDIVIDUAL_SCALE, depth);
}

function drift(seed, salt, elapsedRealSeconds) {
  const phase = sampleRange(seed, salt + 1, 0, Math.PI * 2);
  return Math.sin(elapsedRealSeconds * DRIFT_RATE + phase) * DRIFT_AMOUNT;
}

// Six persistent fish are deliberately spread through deterministic slices of
// tank depth so a seed cannot accidentally place the whole cast on one plane.
export function spreadDepth(baseSeed, seed, index, count, elapsedRealSeconds = 0) {
  const safeCount = Math.max(1, count);
  const rotation = Math.floor(sample01(baseSeed, 3300) * safeCount);
  const slot = (index + rotation) % safeCount;
  const base = (slot + sampleRange(seed, 60, 0.16, 0.84)) / safeCount;
  return clamp(base + drift(seed, 60, elapsedRealSeconds), 0, 1);
}

export function scatteredDepth(seed, salt, elapsedRealSeconds = 0) {
  return clamp(
    sampleRange(seed, salt, 0.04, 0.96) + drift(seed, salt, elapsedRealSeconds),
    0,
    1,
  );
}
