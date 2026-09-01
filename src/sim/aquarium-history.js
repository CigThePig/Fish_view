/*
 * Long-horizon aquarium history.
 *
 * Phase 1 made a fish's behaviour readable and Phase 2 made it personal. Both
 * of those are answered inside a single visible moment. This module answers a
 * question no frame can: what has happened to this aquarium over its lifetime?
 *
 * Three things distinguish it from the rest of the simulation.
 *
 * 1. It runs on the full simulated aquarium age. Everything a fish physically
 *    *does* is bounded by real time, because reaching the substrate is a swim
 *    rather than a calculation (see MAX_DRIVE_HOURS_PER_REAL_SECOND). A plant
 *    needs no real-time permission for a week to pass while the device is off,
 *    so growth, propagation, and one-time milestones use `totalDays` directly,
 *    including debug acceleration and offline elapsed time.
 *
 * 2. It is the single owner of long-horizon advancement. `tick()` and
 *    `advanceOffline()` both call `advanceAquariumHistory()` rather than each
 *    aging plants and crossing event boundaries in their own way.
 *
 * 3. It advances chronologically rather than to the end state. A plant's
 *    maturity can be reached *inside* a large offline interval, so ages are
 *    carried forward to each event boundary before that boundary is evaluated.
 *    Adding ninety days to every plant and then asking which of them could have
 *    reproduced would let a plant reproduce before it actually matured.
 *
 * The aquarium's physical contents are the historical record. There is no event
 * log: a fish that arrived is present, a shoot that took is present and its age
 * says when it appeared. The only persisted bookkeeping is a tiny bounded
 * cursor (`state.content`), which exists so a boundary is not resolved twice.
 */

import { RARE_PLANT_IDS } from "../art/plants.js";
import { clamp, createIndividualFromSeed, individualSeedFor } from "./entities.js";
import { ACTIVITIES, createActivityState } from "./fish-activities.js";
import {
  fishAgeDays,
  fishGrowth,
  fishSpriteWidth,
  initialFishAgeDays,
} from "./fish-growth.js";
import { fishVerticalClearanceRows, substrateSafeY, surfaceSafeY } from "./fish-motion.js";
import {
  createPlantFromSeed,
  initialPlantSeeds,
  plantCapFor,
  plantGrowthState,
  plantSpecies,
} from "./plants.js";
import { mix32, sample01, sampleRange, sampleSigned } from "./prng.js";

export const CONTENT_VERSION = 1;

// The initial cast, and the ceiling persistence has always supported. Phase 3
// lets an aquarium grow 6 -> 7 -> 8 over its first few months and stop there.
export const INITIAL_INDIVIDUAL_COUNT = 6;
export const MAX_INDIVIDUALS = 8;

// Reproduction is evaluated on coarse epochs rather than per frame. At real
// time a frame costs one integer comparison; a week-per-second debug run may
// cross several epochs inside one frame and every crossed epoch still resolves
// exactly once.
export const PROPAGATION_EPOCH_DAYS = 12;
// Not every epoch produces a shoot, and an epoch produces at most one. Together
// with the caps this is what stretches the change across months instead of
// filling the substrate in a fortnight.
export const PROPAGATION_EPOCH_CHANCE = 0.34;
export const PROPAGATION_CANDIDATE_OFFSETS = 4;

// Seeded windows, in aquarium days. Two aquariums with different seeds get
// noticeably different histories; the same seed always gets the same one.
export const ARRIVAL_WINDOW_DAYS = Object.freeze([
  Object.freeze([10, 24]),
  Object.freeze([45, 85]),
]);
export const RARE_EMERGENCE_WINDOW_DAYS = Object.freeze([
  Object.freeze([24, 50]),
  Object.freeze([80, 150]),
]);

// A corrupt cursor must not be able to ask for millions of epochs. Nothing
// legitimate comes close: the offline clamp is a year and the largest single
// tick is under two simulated days.
const MAX_EPOCHS_PER_ADVANCE = 4096;
const MAX_CONTENT_EPOCH = 1e7;

const FAMILY = Object.freeze({
  arrival: 1,
  emergence: 2,
  propagation: 3,
  offspring: 4,
});

// Deterministic identity for one long-horizon event. Everything the resolver
// decides hangs off this: never Math.random(), never Date.now(), never an array
// length or a wall clock.
function eventSeed(aquariumSeed, family, ordinal) {
  return mix32((aquariumSeed >>> 0) ^ Math.imul(((family * 977 + ordinal) >>> 0) + 1, 0x9e3779b1));
}

let scheduleCache = null;

// The complete one-time milestone schedule for an aquarium seed. Dates are
// derived, never stored: "store identity and learned history, derive fixed
// characteristics" is the same rule affinities and pair compatibility follow.
// It is deliberately independent of orientation, so a portrait and a landscape
// view of one seed are the same aquarium with the same history.
export function contentSchedule(seed) {
  const base = seed >>> 0;
  if (scheduleCache?.seed === base) return scheduleCache.milestones;

  const milestones = [];
  for (let ordinal = 0; ordinal < ARRIVAL_WINDOW_DAYS.length; ordinal += 1) {
    const [minimum, maximum] = ARRIVAL_WINDOW_DAYS[ordinal];
    const event = eventSeed(base, FAMILY.arrival, ordinal);
    milestones.push(Object.freeze({
      id: `fish-arrival:${ordinal}`,
      type: "fish-arrival",
      ordinal,
      day: sampleRange(event, 1, minimum, maximum),
      eventSeed: event,
      fishSeed: individualSeedFor(base, INITIAL_INDIVIDUAL_COUNT + ordinal),
    }));
  }
  for (let ordinal = 0; ordinal < RARE_EMERGENCE_WINDOW_DAYS.length; ordinal += 1) {
    const [minimum, maximum] = RARE_EMERGENCE_WINDOW_DAYS[ordinal];
    const event = eventSeed(base, FAMILY.emergence, ordinal);
    const speciesIndex = Math.floor(sample01(event, 2) * RARE_PLANT_IDS.length) % RARE_PLANT_IDS.length;
    milestones.push(Object.freeze({
      id: `rare-emergence:${ordinal}`,
      type: "rare-emergence",
      ordinal,
      day: sampleRange(event, 1, minimum, maximum),
      eventSeed: event,
      speciesId: RARE_PLANT_IDS[speciesIndex],
      plantSeed: mix32(event ^ 0x5bf03635),
    }));
  }

  const sorted = Object.freeze(milestones.sort((left, right) => (
    left.day - right.day || left.type.localeCompare(right.type) || left.ordinal - right.ordinal
  )));
  scheduleCache = { seed: base, milestones: sorted };
  return sorted;
}

export function createContentState() {
  // `milestones` is a bitmask over the schedule (four bits today). It is
  // computational bookkeeping, never a user-facing statistic, and it cannot
  // grow with aquarium age.
  return { version: CONTENT_VERSION, propagationEpoch: 0, milestones: 0 };
}

function safeEpoch(value) {
  if (!Number.isFinite(value)) return 0;
  return clamp(Math.floor(value), 0, MAX_CONTENT_EPOCH);
}

function safeMilestoneMask(value, schedule) {
  if (!Number.isFinite(value)) return 0;
  const allBits = (1 << schedule.length) - 1;
  return Math.max(0, Math.floor(value)) & allBits;
}

// Historical bookkeeping arrives from disk like everything else: possibly
// absent, possibly corrupt. `totalDays` is the anchor a missing cursor is
// rebuilt from, which is also the migration policy for a Phase 2 save - see
// `migrateContent`.
export function sanitizeContent(content, { totalDays = 0, seed = 0 } = {}) {
  const schedule = contentSchedule(seed);
  if (!content || typeof content !== "object" || content.version !== CONTENT_VERSION) {
    return migrateContent(totalDays);
  }
  return {
    version: CONTENT_VERSION,
    propagationEpoch: safeEpoch(content.propagationEpoch),
    milestones: safeMilestoneMask(content.milestones, schedule),
  };
}

// A save written before Phase 3 has a real aquarium age and a garden that has
// never propagated. Replaying six months of hypothetical colony reproduction
// into it would invent a history that never happened, so the propagation cursor
// simply starts where the save already is and future epochs run from there. The
// bounded one-time milestones are left unresolved: those are exactly
// reconstructable, and materializing the overdue ones is what stops a long-lived
// old aquarium from being permanently stuck at six fish.
export function migrateContent(totalDays) {
  const days = Number.isFinite(totalDays) ? Math.max(0, totalDays) : 0;
  return {
    version: CONTENT_VERSION,
    propagationEpoch: safeEpoch(Math.floor(days / PROPAGATION_EPOCH_DAYS)),
    milestones: 0,
  };
}

// How old a fish in a save written before growth existed must be today.
//
// A fish's age is reconstructable rather than guessable, because every fish in
// an aquarium got there in one of exactly two ways. The initial cast was
// created with the aquarium and has been aging ever since, so it is its seeded
// starting age plus the aquarium's age. An arrival hatched on its own milestone
// day, which the schedule still knows. Nothing else can be in the roster.
export function inferredFishAgeDays(aquariumSeed, fishSeed, totalDays) {
  const days = Number.isFinite(totalDays) ? Math.max(0, totalDays) : 0;
  const arrival = contentSchedule(aquariumSeed).find((milestone) => (
    milestone.type === "fish-arrival" && (milestone.fishSeed >>> 0) === (fishSeed >>> 0)
  ));
  if (arrival) return Math.max(0, days - arrival.day);
  return initialFishAgeDays(fishSeed) + days;
}

// An arrival is a fry, so it is measured as one. Using the adult silhouette
// here would hold a newly hatched fish several columns off the glass it
// actually entered through.
function arrivalHalfWidth(seed) {
  return fishSpriteWidth({ seed, ageDays: 0 }) / 2;
}

// --- spacing and composition -------------------------------------------------

// New roots keep a modest distance from existing ones. The authored layout is
// denser than this in places, which is deliberate: propagation is not allowed to
// thicken a colony beyond what was composed by hand.
export function minimumRootSpacing(cols) {
  return Math.max(0.55, cols * 0.014);
}

function propagationSpread(cols) {
  return Math.max(1.4, cols * 0.03);
}

function emergenceSpread(cols) {
  return Math.max(2.2, cols * 0.055);
}

function localDensityRadius(cols) {
  return Math.max(1.8, cols * 0.045);
}

const MAX_LOCAL_ROOTS = 4;
// The initial habitats deliberately leave open water between them. That space
// is composition, not unused memory, so a candidate root that would close the
// aquarium's widest gap is rejected however well it satisfies every local rule.
const MIN_OPEN_WATER_FRACTION = 0.06;

function largestRootGap(xs) {
  if (xs.length < 2) return Number.POSITIVE_INFINITY;
  const sorted = [...xs].sort((left, right) => left - right);
  let largest = 0;
  for (let index = 1; index < sorted.length; index += 1) {
    largest = Math.max(largest, sorted[index] - sorted[index - 1]);
  }
  return largest;
}

export function rootIsPlantable(plants, x, cols) {
  if (!Number.isFinite(x)) return false;
  const margin = 0.48;
  if (x < margin || x > cols - margin) return false;
  const spacing = minimumRootSpacing(cols);
  const radius = localDensityRadius(cols);
  let neighbours = 0;
  for (const plant of plants) {
    const distance = Math.abs(plant.x - x);
    if (distance < spacing) return false;
    if (distance <= radius) neighbours += 1;
  }
  if (neighbours > MAX_LOCAL_ROOTS) return false;
  return largestRootGap([...plants.map((plant) => plant.x), x]) >= cols * MIN_OPEN_WATER_FRACTION;
}

// A small fixed set of deterministic candidate positions. A failed opportunity
// is not a failure state: if none of them fits, the epoch simply produces
// nothing rather than searching the substrate.
function candidateOffsets(seed, cols, spread) {
  const minimum = minimumRootSpacing(cols) * 1.15;
  const offsets = [];
  for (let index = 0; index < PROPAGATION_CANDIDATE_OFFSETS; index += 1) {
    const side = sample01(seed, 60 + index) < 0.5 ? -1 : 1;
    offsets.push(side * sampleRange(seed, 70 + index, minimum, Math.max(minimum + 0.2, spread)));
  }
  return offsets;
}

// Seeds are the only long-term identity in the aquarium, so a new plant may
// never reuse one. Collisions are astronomically unlikely; the bounded walk
// exists so a collision cannot loop or silently produce a duplicate.
function uniquePlantSeed(plants, candidate) {
  const taken = new Set(plants.map((plant) => plant.seed >>> 0));
  let seed = candidate >>> 0;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (!taken.has(seed)) return seed;
    seed = mix32(seed ^ Math.imul(attempt + 1, 0x9e3779b1));
  }
  return null;
}

function uniqueFishSeed(individuals, candidate) {
  const taken = new Set(individuals.map((fish) => fish.seed >>> 0));
  let seed = candidate >>> 0;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (!taken.has(seed)) return seed;
    seed = mix32(seed ^ Math.imul(attempt + 1, 0x85ebca6b));
  }
  return null;
}

// --- fish arrivals -----------------------------------------------------------

// A fish that materialized in the middle of the tank would read as a rendering
// fault, so an arrival swims in from a water edge with real clearance and
// inward velocity. The entry side alternates by ordinal, which is also what
// keeps two overdue arrivals resolved in the same instant from landing inside
// one another.
export function arrivalPlacement(state, milestone, seed) {
  const { cols, rows } = state;
  // Deliberately posed against a still surface: an arrival's entry pose must
  // not depend on how many real seconds the app happened to have been running.
  const world = { seed: state.seed, cols, rows, elapsedRealSeconds: 0 };
  const fish = { seed, ageDays: 0 };
  const event = milestone.eventSeed;
  // The entry side alternates strictly by ordinal from one seeded choice made
  // for the aquarium as a whole. Deriving it per event instead would let both
  // arrivals pick the same edge, which matters when a migration or a very large
  // accelerated jump resolves them in the same instant.
  const side = (sample01(state.seed, 3401) < 0.5 ? -1 : 1) * (milestone.ordinal % 2 === 0 ? 1 : -1);
  const halfWidth = arrivalHalfWidth(seed);
  const x = clamp(
    side < 0 ? halfWidth + 0.25 : cols - halfWidth - 0.25,
    halfWidth,
    Math.max(halfWidth, cols - halfWidth),
  );
  const clearance = fishVerticalClearanceRows(fish);
  const top = surfaceSafeY(fish, world, x);
  const bottom = Math.max(top + 0.1, substrateSafeY(fish, world, x));
  const depth = sampleRange(event, 11 + milestone.ordinal, 0.2, 0.74);
  const y = clamp(top + (bottom - top) * depth, top, bottom);
  const speed = sampleRange(event, 14, 0.26, 0.42);
  const inward = -side;
  const targetX = clamp(
    x + inward * sampleRange(event, 15, cols * 0.2, cols * 0.36),
    halfWidth,
    Math.max(halfWidth, cols - halfWidth),
  );
  const targetY = clamp(y + sampleSigned(event, 16) * clearance * 0.8, top, bottom);
  return {
    side,
    x,
    y,
    vx: inward * speed,
    vy: sampleSigned(event, 17) * 0.05,
    targetX,
    targetY,
  };
}

function resolveFishArrival(context, milestone) {
  if (context.individuals.length >= MAX_INDIVIDUALS) return;
  if (context.individuals.some((fish) => (fish.seed >>> 0) === (milestone.fishSeed >>> 0))) return;
  const seed = uniqueFishSeed(context.individuals, milestone.fishSeed);
  if (seed === null) return;

  const placement = arrivalPlacement(context, milestone, seed);
  const index = context.individuals.length;
  context.individuals = [
    ...context.individuals,
    createIndividualFromSeed(seed, index, context.cols, context.rows, {
      // An arrival is a hatchling, not a full-grown fish dropped into the tank.
      // It enters at the size of the school it swims through and becomes its own
      // species over the following months, which is the whole point of the
      // event: the aquarium gained something that is still going to change.
      ageDays: 0,
      x: placement.x,
      y: placement.y,
      vx: placement.vx,
      vy: placement.vy,
      // The newcomer joins through the ordinary behaviour/activity system: a
      // short transient swim inward, then whatever its own personality wants.
      behavior: { current: "explore", previous: "cruise", blend: 0, ageSeconds: 0, ageRealSeconds: 0 },
      activity: {
        ...createActivityState(ACTIVITIES.arrivalEnter, ACTIVITIES.cruise),
        targetType: "waypoint",
        targetX: placement.targetX,
        targetY: placement.targetY,
      },
    }),
  ];
}

// --- rare emergence ----------------------------------------------------------

// A delayed rare plant belongs in vegetation, not in the deliberate open water
// at the middle of the tank, so it roots near an existing specimen - preferring
// one that already shares its depth layer. A bounded three hosts are tried.
function emergenceHosts(context, milestone, species) {
  return context.plants
    .map((plant) => ({
      plant,
      score: sample01(mix32((plant.seed >>> 0) ^ milestone.eventSeed), 3)
        + (plant.layer === species.layer ? 0.5 : 0),
    }))
    .sort((left, right) => right.score - left.score || left.plant.seed - right.plant.seed)
    .slice(0, 3)
    .map((entry) => entry.plant);
}

function resolveRareEmergence(context, milestone) {
  const cap = plantCapFor(context.orientation);
  if (context.plants.length >= cap) return;
  if (context.plants.some((plant) => (plant.seed >>> 0) === (milestone.plantSeed >>> 0))) return;
  const seed = uniquePlantSeed(context.plants, milestone.plantSeed);
  if (seed === null) return;
  const species = plantSpecies({ speciesId: milestone.speciesId });
  const spread = emergenceSpread(context.cols);

  for (const host of emergenceHosts(context, milestone, species)) {
    for (const offset of candidateOffsets(mix32(seed ^ (host.seed >>> 0)), context.cols, spread)) {
      const x = host.x + offset;
      if (!rootIsPlantable(context.plants, x, context.cols)) continue;
      context.plants = [...context.plants, createPlantFromSeed({
        seed,
        speciesId: milestone.speciesId,
        x,
        // A seedling, not a decoration dropped in fully grown. One event
        // becomes weeks of content as the ordinary skeletal growth system
        // reveals it.
        ageDays: 0,
        rows: context.rows,
      })];
      return;
    }
  }
}

// --- propagation -------------------------------------------------------------

function propagationParent(context, epochSeed) {
  let best = null;
  for (const plant of context.plants) {
    const species = plantSpecies(plant);
    // Rare specimens do not spread. Delayed emergence is the way an unusual
    // plant enters the aquarium; letting one colonise would make it ordinary.
    if (species.rare) continue;
    // Real species maturity, not an age threshold: growth schedules differ by
    // several days between a ground tuft and a leaf reed.
    if (!plantGrowthState(plant, species).mature) continue;
    const score = sample01(mix32((plant.seed >>> 0) ^ epochSeed), 2);
    if (!best || score > best.score || (score === best.score && plant.seed < best.plant.seed)) {
      best = { plant, score };
    }
  }
  return best?.plant ?? null;
}

function resolvePropagationEpoch(context, epoch) {
  const cap = plantCapFor(context.orientation);
  if (context.plants.length >= cap) return;
  const epochSeed = eventSeed(context.seed, FAMILY.propagation, epoch);
  if (sample01(epochSeed, 1) >= PROPAGATION_EPOCH_CHANCE) return;

  const parent = propagationParent(context, epochSeed);
  if (!parent) return;

  const childSeed = uniquePlantSeed(
    context.plants,
    mix32((parent.seed >>> 0) ^ eventSeed(context.seed, FAMILY.offspring, epoch)),
  );
  if (childSeed === null) return;

  const spread = propagationSpread(context.cols);
  for (const offset of candidateOffsets(childSeed, context.cols, spread)) {
    const x = parent.x + offset;
    if (!rootIsPlantable(context.plants, x, context.cols)) continue;
    context.plants = [...context.plants, createPlantFromSeed({
      seed: childSeed,
      // A colony is recognisable because a shoot is the same plant as its
      // parent. A ribbon does not give birth to a broadleaf.
      speciesId: parent.speciesId,
      x,
      ageDays: 0,
      rows: context.rows,
    })];
    return;
  }
}

// --- advancement -------------------------------------------------------------

function agePlants(plants, days) {
  if (days <= 0) return plants;
  return plants.map((plant) => ({ ...plant, ageDays: plant.ageDays + days }));
}

// A fish ages on exactly the same clock as a plant, and for the same reason: a
// week passes while the device is off whether or not anything was watching.
// Growth itself is derived from this age, so nothing about which stage a fish
// has reached is stored, replayed, or able to drift between two devices.
function ageIndividuals(individuals, days) {
  if (days <= 0) return individuals;
  return individuals.map((fish) => ({ ...fish, ageDays: fishAgeDays(fish) + days }));
}

function historyBoundaries(state, content, fromDay, toDay) {
  const schedule = contentSchedule(state.seed);
  const boundaries = [];

  for (let index = 0; index < schedule.length; index += 1) {
    if (content.milestones & (1 << index)) continue;
    const milestone = schedule[index];
    if (milestone.day > toDay) continue;
    // A milestone due before the interval started belongs to an aquarium that
    // was restored from an older save; it resolves at the start of the interval
    // rather than being lost. Everything else resolves on its own day.
    boundaries.push({ day: Math.max(fromDay, milestone.day), order: 0, index, milestone });
  }

  const lastEpoch = safeEpoch(Math.floor(toDay / PROPAGATION_EPOCH_DAYS));
  let epoch = content.propagationEpoch + 1;
  if (lastEpoch - epoch > MAX_EPOCHS_PER_ADVANCE) epoch = lastEpoch - MAX_EPOCHS_PER_ADVANCE;
  for (; epoch <= lastEpoch; epoch += 1) {
    boundaries.push({ day: Math.max(fromDay, epoch * PROPAGATION_EPOCH_DAYS), order: 1, epoch });
  }

  return boundaries.sort((left, right) => (
    left.day - right.day
    || left.order - right.order
    || (left.index ?? left.epoch) - (right.index ?? right.epoch)
  ));
}

/**
 * Advance the aquarium's long horizon by `deltaDays` of simulated aquarium age.
 *
 * Returns a new state with `totalDays`, `plants`, `individuals`, and `content`
 * updated. It never replays locomotion: a jump from day 24 to day 120 costs a
 * few dozen operations, not ninety-six days of 10 fps simulation.
 *
 * Boundaries are detected as crossings, never as equality with the current day,
 * so a one-week-per-second debug frame that skips several calendar boundaries
 * still resolves every one of them exactly once. Because both the boundary days
 * and the decisions taken at them are pure functions of the aquarium seed, the
 * same aquarium reaches the same content at day 180 whether it got there in one
 * step, twenty-six, or a hundred and eighty.
 */
export function advanceAquariumHistory(state, deltaDays) {
  const days = Number.isFinite(deltaDays) ? Math.max(0, deltaDays) : 0;
  const fromDay = Number.isFinite(state.totalDays) ? Math.max(0, state.totalDays) : 0;
  const toDay = fromDay + days;
  const content = sanitizeContent(state.content, { totalDays: fromDay, seed: state.seed });
  const boundaries = historyBoundaries(state, content, fromDay, toDay);

  if (!boundaries.length) {
    return {
      ...state,
      totalDays: toDay,
      plants: agePlants(state.plants, days),
      individuals: ageIndividuals(state.individuals, days),
      content,
    };
  }

  const context = {
    seed: state.seed,
    orientation: state.orientation,
    cols: state.cols,
    rows: state.rows,
    plants: state.plants,
    individuals: state.individuals,
  };
  let milestones = content.milestones;
  let propagationEpoch = content.propagationEpoch;
  let cursorDay = fromDay;

  for (const boundary of boundaries) {
    // Chronological, not terminal: ages are carried to the boundary before the
    // boundary is evaluated, so an offspring that matured mid-interval is
    // eligible for a later epoch inside the same jump and a plant that had not
    // yet matured cannot reproduce retroactively.
    const step = boundary.day - cursorDay;
    if (step > 0) {
      context.plants = agePlants(context.plants, step);
      // Carried to the boundary before it is evaluated, exactly like plant age:
      // a fish that arrives at day 50 inside a jump to day 180 is a hundred and
      // thirty days old at the end of it, not newly hatched.
      context.individuals = ageIndividuals(context.individuals, step);
      cursorDay = boundary.day;
    }
    if (boundary.milestone) {
      if (boundary.milestone.type === "fish-arrival") resolveFishArrival(context, boundary.milestone);
      else resolveRareEmergence(context, boundary.milestone);
      milestones |= 1 << boundary.index;
    } else {
      resolvePropagationEpoch(context, boundary.epoch);
      propagationEpoch = Math.max(propagationEpoch, boundary.epoch);
    }
  }

  const remainder = toDay - cursorDay;
  return {
    ...state,
    totalDays: toDay,
    plants: remainder > 0 ? agePlants(context.plants, remainder) : context.plants,
    individuals: remainder > 0 ? ageIndividuals(context.individuals, remainder) : context.individuals,
    content: {
      version: CONTENT_VERSION,
      propagationEpoch: safeEpoch(Math.max(propagationEpoch, Math.floor(toDay / PROPAGATION_EPOCH_DAYS))),
      milestones,
    },
  };
}

// Developer diagnostics only. Nothing here is allowed near the aquarium view.
export function historyDiagnostics(state) {
  const schedule = contentSchedule(state.seed);
  const content = sanitizeContent(state.content, { totalDays: state.totalDays, seed: state.seed });
  const baseSeeds = new Set(Array.from(
    { length: INITIAL_INDIVIDUAL_COUNT },
    (_, index) => individualSeedFor(state.seed, index),
  ));
  return {
    ageDays: state.totalDays,
    content,
    plantCount: state.plants.length,
    plantCap: plantCapFor(state.orientation),
    grownPlantCount: (() => {
      const original = new Set(initialPlantSeeds(state.seed, state.orientation));
      return state.plants.filter((plant) => !original.has(plant.seed >>> 0)).length;
    })(),
    individualCount: state.individuals.length,
    individualCap: MAX_INDIVIDUALS,
    growth: state.individuals.map((fish) => {
      const growth = fishGrowth(fish);
      return {
        seed: fish.seed >>> 0,
        speciesId: growth.sprite.speciesId ?? growth.sprite.id,
        label: growth.label,
        stageIndex: growth.stageIndex,
        terminalStage: growth.terminalStage,
        stageCount: growth.stageCount,
        ageDays: growth.ageDays,
        nextStageDay: growth.nextStageDay,
        grown: growth.grown,
      };
    }),
    arrivedSeeds: state.individuals
      .filter((fish) => !baseSeeds.has(fish.seed >>> 0))
      .map((fish) => fish.seed >>> 0),
    milestones: schedule.map((milestone, index) => ({
      id: milestone.id,
      day: milestone.day,
      resolved: Boolean(content.milestones & (1 << index)),
      speciesId: milestone.speciesId ?? null,
      fishSeed: milestone.fishSeed ?? null,
    })),
    nextMilestone: schedule.find((_, index) => !(content.milestones & (1 << index)))?.id ?? null,
  };
}
