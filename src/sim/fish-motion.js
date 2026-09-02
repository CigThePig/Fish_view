import { spriteDimensions } from "../art/sprites.js";
import { sceneTuning } from "./choreography-tuning.js";
import {
  CELL_HEIGHT,
  CELL_WIDTH,
  INDIVIDUAL_VISUAL_SCALE_MAX,
  PITCH_CLEARANCE_FRACTION,
} from "./config.js";
import { individualDepthScale, spreadDepth } from "./depth.js";
import { spriteForFish } from "./fish-growth.js";
import { substrateSurfaceY, waterSurfaceY } from "./environment.js";
import { affinitiesFromSeed } from "./fish-personality.js";
import { sample01, sampleRange } from "./prng.js";

export const MAX_FISH_PITCH_DEGREES = 32;
// The authored forage and surface numbers. Every one of them is also an entry
// in the "substrate-search" / "surface-investigate" scene tuning, which is what
// the simulation actually reads and what the behaviour choreography lab edits;
// these exports remain the values that tuning starts from.
export const FORAGE_PITCH_BIAS_DEGREES = 20;
export const SURFACE_PITCH_BIAS_DEGREES = -10;
export const FORAGE_SEARCH_DISTANCE_ROWS = 0.82;
// How far the belly is allowed to meet the substrate crest while grazing, and
// how far the strike itself drives the fish down. Both are authored against the
// drawn artwork rather than the swimming envelope: a feeding fish that keeps
// its swimming clearance hovers a row above the sand and never reads as eating.
export const FORAGE_GRAZE_CONTACT_ROWS = 0.06;
export const FORAGE_PECK_ROWS = 0.30;
// The logical sprite box and the renderer's opaque-body box intentionally do
// not share font/profile internals, and this is the measured reserve for that
// mismatch after the exact depth scale is applied. It is now zero: the reserve
// was covering an opaque body that, at pitch, was drawn as the axis-aligned
// bounding box around each rotated slice and so reached further below the fish
// than the fish did. The body is rasterised as the rotated silhouette itself
// now, and the two models agree closely enough that adding to the reserve only
// lifts a feeding fish off the sand it is supposed to be working. The constant
// stays because it is where a measured disagreement belongs - `npm run
// measure:screen` reports the gap the panel receives, and the seed sweep in
// tests/review-regressions.test.js grades the other side of it.
const FORAGE_GRAZE_MODEL_MARGIN_ROWS = 0;
// The furthest ahead a grazing fish will chase its route point. The forage
// route drifts across the tank faster than a fish creeping along at a tenth of
// a row per second can follow, and an unreachable target makes the steering
// direction almost purely horizontal - which is what used to leave nothing of
// the peck for the vertical axis.
export const FORAGE_ROUTE_LEAD_COLUMNS = 1.15;

const MAX_PITCH_RADIANS = MAX_FISH_PITCH_DEGREES * Math.PI / 180;
const CLEARANCE_MARGIN_ROWS = 0.18;
const PECK_PATTERNS = Object.freeze([
  Object.freeze([0.08, 0.38, 0.49, 0.76]),
  Object.freeze([0.1, 0.22, 0.55]),
  Object.freeze([0.07, 0.43, 0.68, 0.79]),
]);
const DEBRIS_TAIL_SECONDS = 0.82;

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function positiveModulo(value, modulus) {
  return ((value % modulus) + modulus) % modulus;
}

function spriteFor(value) {
  if (value?.shape) return value;
  // A growing fish is measured at the size it is now, not at the size it will
  // eventually be: a fry legitimately fits closer to the substrate and the
  // surface than the adult it becomes.
  return spriteForFish(value ?? { seed: 0 });
}

// Simulation clearance is deliberately conservative. A fish can be enlarged by
// visual depth and its horizontal silhouette contributes to its vertical
// envelope when pitched. The calculation stays in pure logical/authoring units,
// using the same 12x24 cell aspect as the bitmap artwork, so sim never imports
// render/depth.js or any backend geometry. width/2 and height/2 already include
// the half-cell of bitmap ink beyond the outermost authored glyph centres.
export function fishVerticalClearanceRows(fishOrSprite) {
  const sprite = spriteFor(fishOrSprite);
  const { width, height } = spriteDimensions(sprite);
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const horizontalAsRows = halfWidth * (CELL_WIDTH / CELL_HEIGHT);
  const projected = halfHeight * Math.cos(MAX_PITCH_RADIANS)
    + horizontalAsRows * Math.sin(MAX_PITCH_RADIANS);
  return projected * INDIVIDUAL_VISUAL_SCALE_MAX + CLEARANCE_MARGIN_ROWS;
}

export function forageEligible(index) {
  // The first three individuals are the permanent mid-water cast. Keeping them
  // out of forage is the simplest deterministic way to preserve that visibility
  // invariant without letting a fish claim to eat from several rows above the
  // substrate.
  return index >= 3;
}

export function substrateSafeY(fish, state, worldX = fish.x) {
  return substrateSurfaceY(state, worldX) - fishVerticalClearanceRows(fish);
}

// Grazing is measured against the artwork, not against the swimming envelope.
// The envelope above reserves room for a full-pitch rotation that the authored
// pitch pose only partly performs, and reserves it at the largest depth scale
// any fish can be drawn at; both are the right call for a fish crossing open
// water and both are wrong for one working the substrate, where the reserve
// simply parks it in mid-water with its debris falling out of reach below.
// The posture is the forage lean, not the fish's instantaneous pitch. Tracking
// the live angle makes the graze line climb exactly as the strike drives the
// fish down - the reservation grows with the lean, the clamp lifts the fish,
// and the two cancel almost perfectly. Reserving for the steady feeding posture
// instead leaves the strike free to reach past it, which is the whole point of
// a strike: the nose goes into the sand and comes back out.
export function fishGrazeClearanceRows(
  fishOrSprite,
  pitchDegrees = FORAGE_PITCH_BIAS_DEGREES,
  visualScale = INDIVIDUAL_VISUAL_SCALE_MAX,
  contactRows = FORAGE_GRAZE_CONTACT_ROWS,
) {
  const sprite = spriteFor(fishOrSprite);
  const { width, height } = spriteDimensions(sprite);
  // A nose-down fish is longer than it is tall in the vertical direction that
  // matters here: the renderer turns the drawing bodily, so part of the body's
  // length projects downwards and the lowest ink is no longer the belly. A
  // height-only clearance was right while the pose was a gentle shear and buries
  // a wide fish by a whole row now that it leans for real.
  const pitch = clamp(Math.abs(Number.isFinite(pitchDegrees) ? pitchDegrees : 0), 0, MAX_FISH_PITCH_DEGREES)
    * Math.PI / 180;
  const horizontalAsRows = width / 2 * (CELL_WIDTH / CELL_HEIGHT);
  const projected = height / 2 * Math.cos(pitch)
    + horizontalAsRows * Math.sin(pitch) * PITCH_CLEARANCE_FRACTION;
  const scale = clamp(
    Number.isFinite(visualScale) ? visualScale : INDIVIDUAL_VISUAL_SCALE_MAX,
    0,
    INDIVIDUAL_VISUAL_SCALE_MAX,
  );
  return Math.max(
    0.2,
    projected * scale + FORAGE_GRAZE_MODEL_MARGIN_ROWS - contactRows,
  );
}

export function individualVisualScale(fish, index, state) {
  const individuals = state?.individuals ?? [];
  const resolvedIndex = Number.isInteger(index) && index >= 0 && index < individuals.length
    ? index
    : individuals.findIndex((candidate) => candidate === fish || candidate.seed === fish?.seed);
  if (resolvedIndex < 0 || !Number.isFinite(state?.seed)) return INDIVIDUAL_VISUAL_SCALE_MAX;
  const distance = spreadDepth(
    state.seed,
    fish.seed,
    resolvedIndex,
    individuals.length,
    state.elapsedRealSeconds,
  );
  return individualDepthScale(distance);
}

export function substrateGrazeY(fish, state, worldX = fish.x, index = null) {
  // Rotation and distance together: the lean the fish feeds at decides how much
  // of its body projects downwards, and the contact allowance decides how close
  // that projection may come to the crest.
  const tuning = sceneTuning(state, "substrate-search");
  return substrateSurfaceY(state, worldX)
    - fishGrazeClearanceRows(
      fish,
      tuning.grazePitchDegrees,
      individualVisualScale(fish, index, state),
      tuning.grazeContactRows,
    );
}

export function surfaceSafeY(fish, state, worldX = fish.x) {
  return waterSurfaceY(state, worldX) + fishVerticalClearanceRows(fish);
}

// Forage contact has no persistent animation state. Search and clustered peck
// phases are reconstructed from activity age + seed, which keeps saves compact
// and makes the substrate puff renderer observe exactly the same event as the
// simulation. The deliberately uneven patterns read as feeding rather than a
// metronome: single pecks, close pairs, a lateral scoot, then a longer pause.
// `activity` defaults to the fish's own stored activity, which is what the
// renderer and the drive tick observe. Callers that have already advanced the
// activity for this frame pass that state in, so the target, the pitch, and the
// puff of debris all describe the same contact instead of drifting a frame — up
// to a quarter second on a delayed step — apart.
export function forageActivity(fish, index, state, activity = fish?.activity) {
  const eligible = forageEligible(index);
  const tuning = sceneTuning(state, "substrate-search");
  const surfaceY = substrateSurfaceY(state, fish.x);
  const targetY = substrateGrazeY(fish, state, fish.x, index);
  const distanceRows = Math.abs(fish.y - targetY);
  const searching = eligible
    && fish.behavior?.current === "forage"
    && distanceRows <= tuning.searchDistanceRows;

  const substrateAffinity = affinitiesFromSeed(fish.seed).substrate;
  const period = sampleRange(fish.seed, 4600, 5.4, 7.8) * (1.08 - substrateAffinity * 0.2);
  const offset = sampleRange(fish.seed, 4601, 0, period);
  const age = Math.max(0, activity?.current === "substrate-search"
    && Number.isFinite(activity?.ageRealSeconds)
    ? activity.ageRealSeconds
    : fish.behavior?.ageRealSeconds ?? 0);
  const absoluteClock = age + offset;
  const cycleIndex = Math.floor(absoluteClock / period);
  const cycleSeconds = positiveModulo(absoluteClock, period);
  const pattern = PECK_PATTERNS[Math.floor(sample01(fish.seed, 4602) * PECK_PATTERNS.length)
    % PECK_PATTERNS.length];
  let peckPhase = null;
  let peckEvent = null;
  let debrisPhase = null;
  let debrisEvent = null;
  for (let event = 0; event < pattern.length; event += 1) {
    const start = pattern[event] * period;
    const duration = sampleRange(fish.seed, 4610 + event, 0.3, 0.46);
    const elapsed = cycleSeconds - start;
    if (searching && elapsed >= 0 && elapsed < duration) {
      peckPhase = elapsed / duration;
      peckEvent = event;
    }
    const debrisAge = elapsed - duration * 0.34;
    if (searching && debrisAge >= 0 && debrisAge < DEBRIS_TAIL_SECONDS
      && (debrisPhase === null || debrisAge < debrisPhase * DEBRIS_TAIL_SECONDS)) {
      debrisPhase = debrisAge / DEBRIS_TAIL_SECONDS;
      debrisEvent = event;
    }
  }
  const peck = peckPhase === null ? 0 : Math.sin(Math.PI * clamp(peckPhase, 0, 1));
  const sizeFactor = clamp(fishVerticalClearanceRows(fish) / 2.2, 0.88, 1.04);
  const displacementAmplitude = (tuning.peckRows + substrateAffinity * 0.1) * sizeFactor;
  const eventSeed = (cycleIndex * 7 + (peckEvent ?? debrisEvent ?? 0)) >>> 0;
  // Close peck pairs overlap: the previous peck's debris is still rising when
  // the next peck starts. Salting the debris with the peck event would swap the
  // particle count, glyphs, spread, and rise partway through a tail that is
  // already on screen, so the debris keeps the seed of the event that raised it
  // while scoot behaviour stays with the peck the fish is performing.
  const debrisSeed = debrisEvent === null ? eventSeed : (cycleIndex * 7 + debrisEvent) >>> 0;
  const scootDirection = sample01(fish.seed ^ eventSeed, 4630) < 0.5 ? -1 : 1;
  const recovery = peckPhase === null ? 0 : smoothRecovery(peckPhase);

  return {
    eligible,
    searching,
    peck,
    peckPhase,
    peckEvent,
    peckDisplacement: peck * displacementAmplitude,
    displacementAmplitude,
    recovery,
    debrisPhase,
    debrisEvent,
    eventSeed,
    debrisSeed,
    scootDirection,
    clusterSize: pattern.length,
    clusterProgress: cycleSeconds / period,
    surfaceY,
    targetY,
    distanceRows,
  };
}

function smoothRecovery(peckPhase) {
  const progress = clamp((peckPhase - 0.52) / 0.48, 0, 1);
  return Math.sin(progress * Math.PI);
}
