/*
 * Fish growth.
 *
 * Phase 3 gave the aquarium a history made of arrivals and vegetation. This is
 * the same long horizon expressed by the cast itself: a fish is hatched as a
 * speck, develops fins over a season, and stops growing somewhere its own seed
 * decided. Nothing here is a score, a level, or a reward - a fish gets larger
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
 * 3. Not every fry becomes an adult. A seeded terminal stage stops many fish
 *    short of their species' maximum, permanently, which is what keeps a mature
 *    aquarium a population of different sizes instead of eight identical
 *    silhouettes. A fish stopped early is not stunted or unwell: it is simply a
 *    small fish, and nothing in the tank treats it as a failure.
 *
 * Like affinities and pair compatibility, none of it is stored. A fish stores
 * its identity (seed) and its age; its pace, its stage boundaries, and how far
 * it will ever grow are derived.
 */

import { growthStagesFor, individualSprites, spriteDimensions } from "../art/sprites.js";
import { sample01, sampleRange } from "./prng.js";

// A stage may never pass faster than this. The whole point of growth here is
// that it is invisible at the timescale of a visit.
export const MINIMUM_STAGE_DAYS = 7;
// Before the pace multiplier. A slow fish stretches the upper end to about
// three and a half weeks per stage.
const STAGE_SPAN_DAYS = Object.freeze([8, 19]);
const PACE_RANGE = Object.freeze([0.78, 1.5]);
// The share of fish that eventually reach their species' maximum. The rest stop
// at one of the earlier developed stages, evenly spread.
const FULL_GROWTH_SHARE = 0.56;

const PACE_SALT = 1200;
const STAGE_SALT = 1210;
const TERMINAL_SALT = 1240;
const INITIAL_AGE_SALT = 1260;
// An aquarium is handed over as an established tank rather than as six eggs, so
// most of the initial cast starts at or near the size it will keep. This is the
// share that starts genuinely young instead - about one fish in an aquarium,
// which is the one that visibly changes over the first weeks.
const YOUNG_START_SHARE = 0.2;
// Somewhere along its own development, expressed as a fraction of the span it
// has left to grow. Only the lowest part of this range is still a fry.
const YOUNG_START_SPAN = Object.freeze([0.08, 0.92]);
// Finished, with a spread of how long ago. A fraction of 1 is the day the fish
// reached its terminal stage, so every fish on this branch starts grown.
const ESTABLISHED_START_SPAN = Object.freeze([1, 1.75]);
const ESTABLISHED_START_BIAS = 0.72;

// Species selection is unchanged in kind - a pure function of the fish seed -
// and lives here so growth never has to import the entity constructors that
// depend on it.
export function speciesForSeed(seed) {
  return individualSprites[(seed >>> 0) % individualSprites.length];
}

export function growthStagesForSeed(seed) {
  return growthStagesFor(speciesForSeed(seed).id);
}

// A stage a fish may still be at when it stops growing for good. The shared fry
// forms are excluded: a permanent speck would read as a rendering fault rather
// than as a small fish, and every species develops recognisable anatomy before
// its first stoppable stage.
function firstTerminalStage(stages) {
  const index = stages.findIndex((stage) => !String(stage.label).startsWith("fry"));
  return index < 0 ? stages.length - 1 : index;
}

function safeSeed(value) {
  return Number.isFinite(value) ? value >>> 0 : 0;
}

export function fishAgeDays(fish) {
  const age = fish?.ageDays;
  return Number.isFinite(age) ? Math.max(0, age) : 0;
}

// An aquarium holds at most eight individuals, and every one of them asks for
// its plan several times a frame - clearance, tank margins, exhale placement,
// the renderer. The plan is a pure function of the seed, so it is memoized
// against a cap a little above the roster ceiling and dropped wholesale rather
// than evicted one entry at a time. Nothing here may grow with aquarium age.
const PROFILE_CACHE_LIMIT = 16;
const profileCache = new Map();

/**
 * The complete growth plan for one fish seed.
 *
 * `thresholds[i]` is the aquarium-relative age in days at which stage `i`
 * begins, so `thresholds[0]` is always 0 and the array is strictly increasing
 * by at least MINIMUM_STAGE_DAYS. `terminalStage` is the last stage this fish
 * will ever reach; stages beyond it never open, however old the fish gets.
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

  const last = stages.length - 1;
  const earliest = firstTerminalStage(stages);
  let terminalStage = last;
  if (earliest < last) {
    const roll = sample01(numericSeed, TERMINAL_SALT);
    if (roll >= FULL_GROWTH_SHARE) {
      const span = last - earliest;
      const step = 1 + Math.floor(((roll - FULL_GROWTH_SHARE) / (1 - FULL_GROWTH_SHARE)) * span);
      terminalStage = Math.max(earliest, last - Math.min(span, step));
    }
  }

  const profile = Object.freeze({
    stages,
    thresholds: Object.freeze(thresholds),
    terminalStage,
    pace,
    // How long this fish takes to finish growing, whatever it finishes as.
    fullGrowthDays: thresholds[terminalStage],
  });
  if (profileCache.size >= PROFILE_CACHE_LIMIT) profileCache.clear();
  profileCache.set(numericSeed, profile);
  return profile;
}

/**
 * Where a fish is in its own growth, right now.
 *
 * `stageIndex` never exceeds the fish's terminal stage, so a fish that stops at
 * the juvenile form stays there for the rest of the aquarium's life.
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
  const grown = stageIndex >= profile.terminalStage;
  return {
    ageDays,
    sprite,
    stageIndex,
    stageCount: profile.stages.length,
    terminalStage: profile.terminalStage,
    label: sprite.label ?? "max",
    // "Grown" means this fish is finished, which is not the same as reaching
    // the species maximum.
    grown,
    adult: stageIndex === profile.stages.length - 1,
    nextStageDay: grown ? null : profile.thresholds[stageIndex + 1],
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

/**
 * The age the initial cast is created at.
 *
 * A starting age is a seeded fraction of the fish's own full growth span, so it
 * means the same thing for a fish that finishes in a fortnight and one that
 * takes three months. Most of the cast is already grown on day one - an empty
 * tank of specks is not an aquarium - while roughly one fish in six starts
 * young, and that fish is the first thing the aquarium visibly does.
 */
export function initialFishAgeDays(seed) {
  const numericSeed = safeSeed(seed);
  const profile = fishGrowthProfile(numericSeed);
  const roll = sample01(numericSeed, INITIAL_AGE_SALT);
  const fraction = roll < YOUNG_START_SHARE
    ? sampleRange(numericSeed, INITIAL_AGE_SALT + 1, YOUNG_START_SPAN[0], YOUNG_START_SPAN[1])
    : ESTABLISHED_START_SPAN[0]
      + Math.pow(sample01(numericSeed, INITIAL_AGE_SALT + 2), ESTABLISHED_START_BIAS)
        * (ESTABLISHED_START_SPAN[1] - ESTABLISHED_START_SPAN[0]);
  return profile.fullGrowthDays * fraction;
}
