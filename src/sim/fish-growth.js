/*
 * Fish growth.
 *
 * Phase 3 gave the aquarium a history made of arrivals and vegetation. This is
 * the same long horizon expressed by the cast itself: a fish is hatched as a
 * speck, develops fins over a season, and eventually reaches its species' adult
 * form. Nothing here is a score, a level, or a reward - a fish gets larger
 * because it is older, and the only way to see it is to keep the aquarium.
 *
 * Three rules shape it.
 *
 * 1. A stage is a week or more. `MINIMUM_STAGE_DAYS` is a floor, not a target:
 *    the seeded pace spreads a single stage across one to three and a half
 *    weeks, so no fish can be watched changing and none of it is legible inside
 *    one sitting. Growth belongs to the calendar, like plant growth, and runs on
 *    the same simulated aquarium age rather than on the real-time clock that
 *    bounds what a fish can physically do.
 *
 * 2. Every fish grows at its own rate. Two fish of the same species hatched on
 *    the same day reach the same fin at different times.
 *
 * 3. Every healthy fish eventually reaches the adult artwork for its species.
 *    Variation comes from pace and timing, not from permanently trapping some
 *    identities in a juvenile sprite. This keeps the long-term progression
 *    legible: if enough aquarium time has passed, every fish really does grow
 *    up.
 *
 * Like affinities and pair compatibility, none of it is stored. A fish stores
 * its identity (seed) and its age; its pace and stage boundaries are derived.
 *
 * Every fish in the aquarium hatched in it. There is no stocked initial cast
 * with seeded starting ages any more: the founder is created at age zero on the
 * day the aquarium is, and every later arrival is created at age zero on its own
 * fortnightly milestone (see sim/fish-roster.js). A fish's age is therefore
 * always the aquarium's age minus the day it arrived, which is what lets a save
 * written without ages be reconstructed exactly rather than guessed at.
 */

import { growthStagesFor, individualSprites, spriteDimensions } from "../art/sprites.js";
import { sampleRange } from "./prng.js";

// A stage may never pass faster than this. The whole point of growth here is
// that it is invisible at the timescale of a visit.
export const MINIMUM_STAGE_DAYS = 7;
// Before the pace multiplier. A slow fish stretches the upper end to about
// three and a half weeks per stage.
const STAGE_SPAN_DAYS = Object.freeze([8, 19]);
const PACE_RANGE = Object.freeze([0.78, 1.5]);

const PACE_SALT = 1200;
const STAGE_SALT = 1210;

// Species selection is unchanged in kind - a pure function of the fish seed -
// and lives here so growth never has to import the entity constructors that
// depend on it.
export function speciesForSeed(seed) {
  return individualSprites[(seed >>> 0) % individualSprites.length];
}

// Bottom feeding is a species capability, not a temporary consequence of the
// fish's current growth stage. A fry belonging to a five-row adult must not
// learn to graze for a few months and then mysteriously lose the behaviour when
// it grows. The compact adults are the ones whose posture still reads cleanly
// against the substrate; the tall five-row silhouettes stay in open water.
export const MAX_BOTTOM_FEEDING_ADULT_ROWS = 3;

export function speciesCanBottomFeed(seed) {
  return spriteDimensions(speciesForSeed(seed)).height <= MAX_BOTTOM_FEEDING_ADULT_ROWS;
}

export function growthStagesForSeed(seed) {
  return growthStagesFor(speciesForSeed(seed).id);
}

function safeSeed(value) {
  return Number.isFinite(value) ? value >>> 0 : 0;
}

export function fishAgeDays(fish) {
  const age = fish?.ageDays;
  return Number.isFinite(age) ? Math.max(0, age) : 0;
}

// An aquarium holds at most fifteen individuals, and every one of them asks for
// its plan several times a frame - clearance, tank margins, exhale placement,
// the renderer. The plan is a pure function of the seed, so it is memoized
// against a cap a little above the roster ceiling and dropped wholesale rather
// than evicted one entry at a time. Nothing here may grow with aquarium age.
const PROFILE_CACHE_LIMIT = 32;
const profileCache = new Map();

/**
 * The complete growth plan for one fish seed.
 *
 * `thresholds[i]` is the aquarium-relative age in days at which stage `i`
 * begins, so `thresholds[0]` is always 0 and the array is strictly increasing
 * by at least MINIMUM_STAGE_DAYS. `terminalStage` remains part of the profile
 * shape for compatibility with callers, but it is always the species' final
 * adult stage.
 */
export function fishGrowthProfile(seed) {
  const numericSeed = safeSeed(seed);
  const cached = profileCache.get(numericSeed);
  if (cached) return cached;
  const stages = growthStagesForSeed(numericSeed);
  const pace = sampleRange(numericSeed, PACE_SALT, PACE_RANGE[0], PACE_RANGE[1]);
  const thresholds = [0];
  for (let index = 1; index < stages.length; index += 1) {
    const span = sampleRange(numericSeed, STAGE_SALT + index, STAGE_SPAN_DAYS[0], STAGE_SPAN_DAYS[1]);
    thresholds.push(thresholds[index - 1] + Math.max(MINIMUM_STAGE_DAYS, span / pace));
  }

  const terminalStage = stages.length - 1;
  const profile = Object.freeze({
    stages,
    thresholds: Object.freeze(thresholds),
    terminalStage,
    pace,
    // How long this fish takes to reach its species' adult form.
    fullGrowthDays: thresholds[terminalStage],
  });
  if (profileCache.size >= PROFILE_CACHE_LIMIT) profileCache.clear();
  profileCache.set(numericSeed, profile);
  return profile;
}

/**
 * Where a fish is in its own growth, right now.
 */
export function fishGrowth(fish, profile = fishGrowthProfile(fish?.seed)) {
  const ageDays = fishAgeDays(fish);
  let stageIndex = 0;
  while (
    stageIndex < profile.terminalStage
    && ageDays + 1e-9 >= profile.thresholds[stageIndex + 1]
  ) {
    stageIndex += 1;
  }
  const sprite = profile.stages[stageIndex];
  const adult = stageIndex === profile.stages.length - 1;
  return {
    ageDays,
    sprite,
    stageIndex,
    stageCount: profile.stages.length,
    terminalStage: profile.terminalStage,
    label: sprite.label ?? "max",
    // A fish is only finished growing once it has reached the adult sprite.
    grown: adult,
    adult,
    nextStageDay: adult ? null : profile.thresholds[stageIndex + 1],
    fullGrowthDays: profile.fullGrowthDays,
  };
}

// The artwork a live fish is currently drawn and measured from. Everything that
// asks how big a fish is - clearance, tank margins, exhale placement, the
// renderer - goes through this rather than through the species adult.
export function spriteForFish(fish) {
  if (fish?.shape) return fish;
  return fishGrowth(fish).sprite;
}

export function fishSpriteWidth(fish) {
  return spriteDimensions(spriteForFish(fish)).width;
}

// Every fish is created on the day it hatches, founder and arrival alike, so
// there is one age to create a fish at and it is zero. It is a named constant
// rather than a bare literal because persistence, the history resolver and the
// entity constructor all have to agree on it.
export const HATCHLING_AGE_DAYS = 0;