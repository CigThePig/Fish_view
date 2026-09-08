/*
 * The aquarium's fish roster, as a calendar.
 *
 * An aquarium is not handed over stocked. It is handed over as one hatchling in
 * a quarter of a school, and everything else in it arrives later: a new
 * individual every fortnight, one of each species before any species repeats,
 * and the schooling glyphs filling in continuously underneath. That is the
 * whole of the long-horizon fish content, and this module is the single place
 * that decides it.
 *
 * Three properties matter and are what the rest of the simulation relies on.
 *
 * 1. It is a pure function of the aquarium seed. Which species founds the tank,
 *    which order the other seven arrive in, and which order the duplicates
 *    arrive in are all derived - never stored, never rolled at runtime - so the
 *    same seed reaches the same roster at day 200 whether it got there in one
 *    accelerated frame or across seven months of real evenings.
 *
 * 2. A fish's species is still `individualSprites[seed % length]`, exactly as it
 *    has always been. The schedule does not annotate a fish with a species; it
 *    *chooses the seed* whose species is the one the calendar wants, by walking
 *    a deterministic sequence until it lands on one. Species therefore remains
 *    derived from identity alone, and nothing about the roster has to be
 *    written to disk for a save to come back with the right fish.
 *
 * 3. Slot ordinal, arrival day, and identity are one triple. `slot * 14` is the
 *    day that fish hatches, which is also how its age is reconstructed from an
 *    aquarium age alone - see `inferredFishAgeDays`.
 */

import { individualSprites } from "../art/sprites.js";
import { speciesForSeed } from "./fish-growth.js";
import { mix32, sample01 } from "./prng.js";

// One new individual per fortnight, from the day the aquarium is created.
export const ARRIVAL_INTERVAL_DAYS = 14;

// The species that shoal rather than hold a territory of their own. They are
// excluded from founding an aquarium: a tank whose only fish spends its first
// fortnight trailing the school reads as empty, and the founder is the one fish
// a new aquarium has to be able to watch.
export const SHOALING_SPECIES_IDS = Object.freeze(["ribbed-dart"]);
const SHOALING = new Set(SHOALING_SPECIES_IDS);

export function isShoalingSpecies(speciesId) {
  return SHOALING.has(speciesId);
}

export function fishShoals(seed) {
  return SHOALING.has(speciesForSeed(seed).id);
}

// What the tank has room for beyond one of each species: the three smallest
// bodies in the roster doubled or tripled, and nothing that would crowd the
// large finned species. Order within the list is seeded, not authored.
export const EXTRA_ARRIVAL_SPECIES_IDS = Object.freeze([
  "tiny-dart",
  "tiny-dart",
  "comma-tail",
  "comma-tail",
  "box-fin",
  "ribbed-dart",
  "ribbed-dart",
]);

export const SPECIES_COUNT = individualSprites.length;
// One of every species, then the duplicates. Fifteen individuals in all.
export const ROSTER_SIZE = SPECIES_COUNT + EXTRA_ARRIVAL_SPECIES_IDS.length;
// The day the last unmet species arrives, and with it the day the school
// finishes filling - the two halves of "the aquarium is now fully stocked with
// what it will keep one of" happen together on purpose.
export const SPECIES_COMPLETE_DAY = ARRIVAL_INTERVAL_DAYS * (SPECIES_COUNT - 1);
// The day the last duplicate arrives and the tank is full.
export const ROSTER_COMPLETE_DAY = ARRIVAL_INTERVAL_DAYS * (ROSTER_SIZE - 1);

// A new aquarium opens with a quarter of the school it will eventually hold.
export const INITIAL_SCHOOL_FRACTION = 0.25;

const SPECIES_INDEX_BY_ID = Object.freeze(Object.fromEntries(
  individualSprites.map((sprite, index) => [sprite.id, index]),
));

const FOUNDER_SALT = 3500;
const SPECIES_ORDER_SALT = 3520;
const EXTRA_ORDER_SALT = 3560;

// Individual identity is a pure function of the aquarium seed and a creation
// ordinal. Exposing it separately is what lets the schedule name a fish that
// has not arrived yet without rerolling, or even constructing, the roster.
// mix32 is a bijection over uint32 and `index + 17` scaled by an odd multiplier
// is injective, so two different ordinals can never collide.
export function individualSeedFor(baseSeed, index) {
  return mix32((baseSeed >>> 0) ^ Math.imul((index + 17) >>> 0, 0x85ebca6b));
}

// The first seed in slot `slot`'s own deterministic sequence that is both the
// requested species and unused. The walk is bounded because a bounded walk can
// never loop; it does not need a fallback policy beyond returning what it has,
// since eight species over a bijective mix means the first match arrives in
// eight steps on average and five hundred steps miss with probability far below
// one in a billion.
function rosterSeedFor(baseSeed, slot, speciesIndex, taken) {
  let seed = individualSeedFor(baseSeed, slot) >>> 0;
  for (let attempt = 0; attempt < 512; attempt += 1) {
    if (seed % SPECIES_COUNT === speciesIndex && !taken.has(seed)) return seed;
    seed = mix32(seed ^ Math.imul(attempt + 1, 0x9e3779b1)) >>> 0;
  }
  return seed;
}

// A seeded permutation. Sorting on a per-item sample rather than swapping in
// place keeps it a pure function of the seed and stable against ties.
function seededOrder(baseSeed, salt, items) {
  return items
    .map((item, index) => ({ item, index, key: sample01(baseSeed, salt + index) }))
    .sort((left, right) => left.key - right.key || left.index - right.index)
    .map((entry) => entry.item);
}

// One entry, because an aquarium view only ever has one seed in hand. The
// by-seed index lives beside the plan because `spreadDepth` asks for a fish's
// slot once per fish per frame, and a linear scan of fifteen entries there is
// the kind of per-frame cost this project measures.
let rosterCache = null;

/**
 * The complete fifteen-slot roster for an aquarium seed.
 *
 * Entry `i` is `{ slot, speciesId, seed, day }`: the fish that hatches on day
 * `i * 14`, its identity, and the artwork it will grow into. Slot 0 is the
 * founder and is present from the moment the aquarium is created; every other
 * slot is a milestone the history resolver materializes on its own day.
 */
export function aquariumRoster(aquariumSeed) {
  const base = aquariumSeed >>> 0;
  if (rosterCache?.seed === base) return rosterCache.plan;

  const speciesIds = individualSprites.map((sprite) => sprite.id);
  const founders = speciesIds.filter((id) => !SHOALING.has(id));
  const founder = founders[Math.floor(sample01(base, FOUNDER_SALT) * founders.length) % founders.length];
  const order = [
    founder,
    ...seededOrder(base, SPECIES_ORDER_SALT, speciesIds.filter((id) => id !== founder)),
    ...seededOrder(base, EXTRA_ORDER_SALT, [...EXTRA_ARRIVAL_SPECIES_IDS]),
  ];

  const taken = new Set();
  const plan = Object.freeze(order.map((speciesId, slot) => {
    const seed = rosterSeedFor(base, slot, SPECIES_INDEX_BY_ID[speciesId], taken);
    taken.add(seed);
    return Object.freeze({
      slot,
      speciesId,
      seed,
      day: slot * ARRIVAL_INTERVAL_DAYS,
    });
  }));
  rosterCache = {
    seed: base,
    plan,
    bySeed: new Map(plan.map((entry) => [entry.seed, entry])),
  };
  return plan;
}

export function rosterEntryForSeed(aquariumSeed, fishSeed) {
  aquariumRoster(aquariumSeed);
  return rosterCache.bySeed.get(fishSeed >>> 0) ?? null;
}

// --- the school --------------------------------------------------------------

/**
 * How much of its eventual school the aquarium is showing on a given day.
 *
 * A quarter on day one, all of it by the time the last unmet species arrives,
 * and a straight line between - about one more schooling glyph every four days,
 * which is slow enough that nobody watching sees one appear and obvious enough
 * that a tank left alone for a month has visibly filled out.
 */
export function schoolFillFraction(totalDays) {
  const days = Number.isFinite(totalDays) ? Math.max(0, totalDays) : 0;
  if (SPECIES_COMPLETE_DAY <= 0) return 1;
  const progress = Math.min(1, days / SPECIES_COMPLETE_DAY);
  return INITIAL_SCHOOL_FRACTION + (1 - INITIAL_SCHOOL_FRACTION) * progress;
}

// `schoolCount` is the size the school grows *to*, not the size it starts at.
export function schoolCountFor(fullCount, totalDays) {
  const full = Math.max(0, Math.round(Number.isFinite(fullCount) ? fullCount : 0));
  if (full <= 0) return 0;
  return Math.max(1, Math.min(full, Math.round(full * schoolFillFraction(totalDays))));
}
