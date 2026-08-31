import { sample01, sampleRange } from "./prng.js";

// Continuous distance from the glass is world state, even though most of its
// consumers are visual. Keeping the tiny deterministic trajectories here lets
// simulation-side bubble kinematics and the renderer agree without either one
// importing the other.
const DRIFT_RATE = 0.045;
const DRIFT_AMOUNT = 0.1;

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
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
