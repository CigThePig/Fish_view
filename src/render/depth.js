import { sample01, sampleRange } from "../sim/prng.js";

// Fish View has always had a vertical axis - which water band a fish swims in -
// but never a distance axis. Every fish was drawn at one size, in one set of
// colours, on one plane, which is what made a tank full of motion still read as
// a flat sheet of text. This module owns the missing axis.
//
// Depth is continuous in [0, 1]: 0 is the far wall of the tank, 1 is right
// against the glass. Two consumers read it, and they read it differently on
// purpose:
//
//   * Geometry - scale, and therefore the damage rectangle - interpolates
//     continuously, so a fish drifting nearer grows smoothly instead of
//     stepping between sizes.
//   * Colour is quantized to DEPTH_LANES stages and looked up in a table the
//     palette builds once per day/night stage, exactly like the existing 12
//     palette stages. A port then spends one array index per fish per frame on
//     atmospheric perspective instead of a per-glyph colour mix.
export const DEPTH_LANES = 5;

// Individuals carry the effect: a near fish is about 60% larger on screen than
// the same sprite at the far wall, which is the single strongest cue available
// without leaving the bitmap-glyph budget.
const LANE_SCALE = Object.freeze([0.7, 0.84, 0.98, 1.12, 1.26]);
// School fish are already small and already numerous, so they take a narrower
// spread. Their job is parallax, not silhouette.
const SCHOOL_LANE_SCALE = Object.freeze([0.82, 0.9, 0.99, 1.08, 1.16]);
// How far each lane's ink is mixed towards the water it is seen through.
// Tuned against a matured tank rather than an empty one. Past about 0.45 the
// far fish stop being hazy fish and start being smudges, and the aquarium is
// supposed to be about the fish.
export const LANE_HAZE = Object.freeze([0.42, 0.29, 0.17, 0.07, 0]);
// The two nearest lanes get a small daylight-only lift so "near" is contrast
// and not only size. At night this is scaled to nothing: the nightlight arc
// keeps its single warm field.
export const LANE_CLARITY = Object.freeze([0, 0, 0, 0.05, 0.11]);

// One slow breath per fish, about 140 seconds long. Enough that the tank is
// never a set of fixed cut-outs, small enough that the change per frame stays
// far below the damage a swimming fish already generates.
const DRIFT_RATE = 0.045;
const DRIFT_AMOUNT = 0.1;

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function interpolate(table, depth) {
  const position = clamp(depth, 0, 1) * (table.length - 1);
  const index = Math.min(table.length - 2, Math.floor(position));
  const progress = position - index;
  return table[index] + (table[index + 1] - table[index]) * progress;
}

export function laneForDepth(depth) {
  return clamp(Math.round(clamp(depth, 0, 1) * (DEPTH_LANES - 1)), 0, DEPTH_LANES - 1);
}

export function depthScale(depth) {
  return interpolate(LANE_SCALE, depth);
}

export function schoolDepthScale(depth) {
  return interpolate(SCHOOL_LANE_SCALE, depth);
}

function drift(seed, salt, elapsedRealSeconds) {
  const phase = sampleRange(seed, salt + 1, 0, Math.PI * 2);
  return Math.sin(elapsedRealSeconds * DRIFT_RATE + phase) * DRIFT_AMOUNT;
}

// Unconstrained per-fish depth is fine for a 32-strong school but not for six
// named individuals: seeds that happen to agree leave the whole cast on one
// plane and the effect disappears. Each individual is given its own slice of
// the tank and jitters inside it, with the slice order rotated by the aquarium
// seed so depth is not permanently welded to creation index.
export function spreadDepth(baseSeed, seed, index, count, elapsedRealSeconds = 0) {
  const rotation = Math.floor(sample01(baseSeed, 3300) * count);
  const slot = (index + rotation) % count;
  const base = (slot + sampleRange(seed, 60, 0.16, 0.84)) / count;
  return clamp(base + drift(seed, 60, elapsedRealSeconds), 0, 1);
}

export function scatteredDepth(seed, salt, elapsedRealSeconds = 0) {
  return clamp(
    sampleRange(seed, salt, 0.04, 0.96) + drift(seed, salt, elapsedRealSeconds),
    0,
    1,
  );
}
