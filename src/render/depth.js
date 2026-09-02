import { scatteredDepth, spreadDepth } from "../sim/depth.js";
export { individualDepthScale as depthScale } from "../sim/depth.js";

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
// without leaving the bitmap-glyph budget. Its continuous scale lives beside
// the trajectory in sim/depth.js because grazing clearance needs the exact
// apparent size drawn on the panel.
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

export function schoolDepthScale(depth) {
  return interpolate(SCHOOL_LANE_SCALE, depth);
}

// Compatibility exports keep the renderer API stable while the trajectories
// themselves live on the neutral simulation side.
export { scatteredDepth, spreadDepth };
