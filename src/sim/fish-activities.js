import { WATERLINE_ROWS } from "./config.js";
import { clamp, traitsFromSeed } from "./entities.js";
import { plantRootY } from "./environment.js";
import { fishSpriteWidth } from "./fish-growth.js";
import {
  FORAGE_PITCH_BIAS_DEGREES,
  SURFACE_PITCH_BIAS_DEGREES,
  forageActivity,
  forageEligible,
  substrateSafeY,
  surfaceSafeY,
} from "./fish-motion.js";
import {
  affinitiesFromSeed,
  familiarityFor,
  pairCompatibility,
} from "./fish-personality.js";
import {
  plantGrowthState,
  plantHeight,
  plantLifecycle,
  plantSpecies,
} from "./plants.js";
import { mix32, sample01, sampleRange, sampleSigned } from "./prng.js";

const TAU = Math.PI * 2;

// Reach of a single school member's company, and how many such neighbors add
// up to full engagement, so one passing stray is not a whole school.
const SCHOOL_CONTACT_RADIUS = 4.6;
const SCHOOL_CONTACT_SATURATION = 2;

export const BEHAVIORS = Object.freeze(["cruise", "explore", "social", "forage", "rest"]);

export const ACTIVITIES = Object.freeze({
  cruise: "cruise",
  wander: "open-water-wander",
  plantInvestigate: "plant-investigate",
  plantWeave: "plant-weave",
  bubbleInvestigate: "bubble-investigate",
  surfaceInvestigate: "surface-investigate",
  schoolFollow: "school-follow",
  individualFollow: "individual-follow",
  companionCruise: "companion-cruise",
  playfulChase: "playful-chase",
  substrateSearch: "substrate-search",
  openWaterRest: "open-water-rest",
  plantShelter: "plant-shelter",
  touchReact: "touch-react",
  // Appended last on purpose: activity salts are derived from position in this
  // list, so inserting anywhere else would reroll every existing fish's dwell
  // times. A new fish is never *chosen* into this activity - it is the transient
  // state a Phase 3 arrival is created in, and it exits into ordinary explore.
  arrivalEnter: "arrival-enter",
});

const ACTIVITY_LIST = Object.freeze(Object.values(ACTIVITIES));
const ACTIVITY_BEHAVIOR = Object.freeze({
  [ACTIVITIES.cruise]: "cruise",
  [ACTIVITIES.wander]: "explore",
  [ACTIVITIES.plantInvestigate]: "explore",
  [ACTIVITIES.plantWeave]: "explore",
  [ACTIVITIES.bubbleInvestigate]: "explore",
  [ACTIVITIES.surfaceInvestigate]: "explore",
  [ACTIVITIES.schoolFollow]: "social",
  [ACTIVITIES.individualFollow]: "social",
  [ACTIVITIES.companionCruise]: "social",
  [ACTIVITIES.playfulChase]: "social",
  [ACTIVITIES.substrateSearch]: "forage",
  [ACTIVITIES.openWaterRest]: "rest",
  [ACTIVITIES.plantShelter]: "rest",
  [ACTIVITIES.arrivalEnter]: "explore",
});

const DWELL_SECONDS = Object.freeze({
  [ACTIVITIES.cruise]: [6, 18, 28],
  [ACTIVITIES.wander]: [7, 18, 30],
  [ACTIVITIES.plantInvestigate]: [6, 14, 23],
  [ACTIVITIES.plantWeave]: [8, 15, 24],
  [ACTIVITIES.bubbleInvestigate]: [5, 12, 21],
  [ACTIVITIES.surfaceInvestigate]: [6, 12, 20],
  [ACTIVITIES.schoolFollow]: [7, 17, 28],
  [ACTIVITIES.individualFollow]: [7, 16, 26],
  [ACTIVITIES.companionCruise]: [8, 20, 34],
  [ACTIVITIES.playfulChase]: [3.8, 5.6, 7.6],
  [ACTIVITIES.substrateSearch]: [7, 18, 30],
  [ACTIVITIES.openWaterRest]: [9, 24, 40],
  [ACTIVITIES.plantShelter]: [11, 30, 50],
  [ACTIVITIES.touchReact]: [0, 3.2, 3.2],
  [ACTIVITIES.arrivalEnter]: [4.5, 9, 14],
});

function positiveModulo(value, modulus) {
  return ((value % modulus) + modulus) % modulus;
}

function safeNormalize(x, y, fallbackX = 1, fallbackY = 0) {
  const length = Math.hypot(x, y);
  if (length < 0.00001) return { x: fallbackX, y: fallbackY };
  return { x: x / length, y: y / length };
}

function spriteHalfWidth(fish) {
  return fishSpriteWidth(fish) / 2;
}

function activitySalt(activity) {
  return 8000 + Math.max(0, ACTIVITY_LIST.indexOf(activity)) * 29;
}

function activityDwell(fish, activity) {
  const [minimum, maximumLow, maximumHigh] = DWELL_SECONDS[activity] ?? [5, 14, 24];
  return {
    minimum: sampleRange(fish.seed, activitySalt(activity), minimum * 0.9, minimum * 1.1),
    maximum: sampleRange(fish.seed, activitySalt(activity) + 1, maximumLow, maximumHigh),
  };
}

export function defaultActivityForBehavior(behavior) {
  if (behavior === "explore") return ACTIVITIES.wander;
  if (behavior === "social") return ACTIVITIES.schoolFollow;
  if (behavior === "forage") return ACTIVITIES.substrateSearch;
  if (behavior === "rest") return ACTIVITIES.openWaterRest;
  return ACTIVITIES.cruise;
}

export function createActivityState(current = ACTIVITIES.cruise, previous = current) {
  return {
    current,
    previous,
    ageRealSeconds: 0,
    targetType: null,
    targetId: null,
    targetX: null,
    targetY: null,
  };
}

function normalizedActivity(fish) {
  const source = fish.activity;
  const fallback = defaultActivityForBehavior(fish.behavior?.current);
  const current = ACTIVITY_LIST.includes(source?.current) || source?.current === ACTIVITIES.touchReact
    ? source.current
    : fallback;
  return {
    current,
    previous: typeof source?.previous === "string" ? source.previous : current,
    ageRealSeconds: Math.max(0, Number.isFinite(source?.ageRealSeconds) ? source.ageRealSeconds : 0),
    targetType: typeof source?.targetType === "string" ? source.targetType : null,
    targetId: typeof source?.targetId === "string" || Number.isSafeInteger(source?.targetId)
      ? source.targetId
      : null,
    targetX: Number.isFinite(source?.targetX) ? source.targetX : null,
    targetY: Number.isFinite(source?.targetY) ? source.targetY : null,
  };
}

function activityMatchesBehavior(activity, behavior) {
  return ACTIVITY_BEHAVIOR[activity] === behavior;
}

export function schoolSummary(school, state) {
  if (!school?.length) {
    return { x: state.cols / 2, y: state.rows / 2, vx: 0.2, vy: 0 };
  }
  const total = school.reduce((sum, fish) => ({
    x: sum.x + fish.x,
    y: sum.y + fish.y,
    vx: sum.vx + fish.vx,
    vy: sum.vy + fish.vy,
  }), { x: 0, y: 0, vx: 0, vy: 0 });
  return {
    x: total.x / school.length,
    y: total.y / school.length,
    vx: total.vx / school.length,
    vy: total.vy / school.length,
  };
}

// A curious fish notices what has recently changed. Phase 3 gives it two more
// things to notice: a shoot that was not there last week, and a rare plant that
// is doing its slow glowing thing again. Both raise utility; neither commands
// anybody. A plant-lover may cross the tank for a new seedling while a
// bubble-obsessed wanderer never looks at it, which is the whole point of
// Phase 2 deciding who cares.
export function plantGrowthNovelty(plant) {
  const species = plantSpecies(plant);
  const growth = plantGrowthState(plant, species);
  const lifecycle = plantLifecycle(plant, species, growth);
  const bloom = lifecycle.active ? 0.32 + lifecycle.intensity * 0.28 : 0;
  const ageDays = Math.max(0, Number.isFinite(plant.ageDays) ? plant.ageDays : 0);
  if (growth.currentStage <= 0) {
    // A brand new specimen has revealed no structural stage yet, so the old
    // stage-based window returned nothing for exactly the plants that are most
    // novel. A true seedling gets its own short window instead.
    const seedlingWindow = Math.max(1.5, species.growthStepDays * 0.9);
    return Math.max(bloom, clamp(1 - ageDays / seedlingWindow, 0, 1));
  }
  const revealDay = growth.currentStage * species.growthStepDays;
  const ageSinceReveal = Math.max(0, ageDays - revealDay);
  const windowDays = Math.max(0.75, species.growthStepDays * 0.42);
  return Math.max(bloom, clamp(1 - ageSinceReveal / windowDays, 0, 1));
}

export function favoritePlantScore(fishSeed, plant) {
  const seed = mix32((fishSeed >>> 0) ^ Math.imul(plant.seed >>> 0, 0x85ebca6b));
  const species = plantSpecies(plant);
  const layerBias = species.layer === "foreground" ? 0.08 : species.layer === "midground" ? 0.04 : 0;
  return clamp(sampleRange(seed, 8100, 0.08, 0.94) + layerBias, 0, 1);
}

function suitablePlant(plant, { shelter = false } = {}) {
  const height = plantHeight(plant);
  if (!Number.isFinite(plant.x) || !Number.isFinite(height)) return false;
  if (shelter) return plant.layer === "foreground" && height >= 2.4;
  return height >= 1.25;
}

function nearbyFishCount(state, worldX, worldY, radius, selfSeed) {
  let count = 0;
  for (const fish of state.individuals ?? []) {
    if (fish.seed === selfSeed) continue;
    if (Math.hypot(fish.x - worldX, fish.y - worldY) < radius) count += 1;
  }
  return count;
}

export function plantTargetPosition(fish, plant, state, {
  shelter = false,
  alternateSide = false,
} = {}) {
  const height = plantHeight(plant);
  const pairSeed = mix32((fish.seed >>> 0) ^ Math.imul(plant.seed >>> 0, 0xc2b2ae35));
  const side = (sample01(pairSeed, 8110) < 0.5 ? -1 : 1) * (alternateSide ? -1 : 1);
  const sideDistance = shelter
    ? sampleRange(pairSeed, 8111, 0.55, 1.05)
    : sampleRange(pairSeed, 8111, 0.72, 1.38);
  const fraction = shelter
    ? sampleRange(pairSeed, 8112, 0.22, 0.39)
    : sampleRange(pairSeed, 8112, 0.43, 0.72);
  const halfWidth = spriteHalfWidth(fish);
  const x = clamp(plant.x + side * sideDistance, halfWidth, state.cols - halfWidth);
  const top = surfaceSafeY(fish, state, x);
  const bottom = substrateSafeY(fish, state, x);
  const rawY = plantRootY(state, plant.x) - height * fraction;
  return {
    x,
    y: clamp(rawY, Math.min(top, bottom), Math.max(top, bottom)),
  };
}

function selectPlantTarget(fish, state, traits, affinities, { shelter = false } = {}) {
  let best = null;
  for (const plant of state.plants ?? []) {
    if (!suitablePlant(plant, { shelter })) continue;
    const point = plantTargetPosition(fish, plant, state, { shelter });
    const distance = Math.hypot(point.x - fish.x, point.y - fish.y);
    const favorite = favoritePlantScore(fish.seed, plant);
    const novelty = shelter ? 0 : plantGrowthNovelty(plant) * traits.curiosity;
    const socialProof = (1 - traits.boldness)
      * Math.min(2, nearbyFishCount(state, point.x, point.y, 3.2, fish.seed)) * 0.07;
    const score = favorite * (shelter ? 0.58 : 0.42)
      + novelty * 0.3
      + affinities.plant * 0.16
      + socialProof
      - distance / Math.max(8, state.cols) * 0.42;
    if (!best || score > best.score || (score === best.score && plant.seed < best.plant.seed)) {
      best = { plant, point, score };
    }
  }
  return best;
}

function secondWeavePlant(fish, first, state) {
  const candidates = (state.plants ?? [])
    .filter((plant) => plant.seed !== first.seed && suitablePlant(plant))
    .map((plant) => ({
      plant,
      distance: Math.abs(plant.x - first.x),
      preference: favoritePlantScore(fish.seed, plant),
    }))
    .filter((candidate) => candidate.distance <= Math.max(7, state.cols * 0.18))
    .sort((left, right) => (
      (left.distance - left.preference * 2) - (right.distance - right.preference * 2)
      || left.plant.seed - right.plant.seed
    ));
  return candidates[0]?.plant ?? null;
}

function sizeInterest(sizeClass) {
  if (sizeClass === "jumbo") return 1;
  if (sizeClass === "large") return 0.78;
  if (sizeClass === "normal") return 0.34;
  return 0.08;
}

function selectBubbleTarget(fish, state, traits, affinities, bubbles) {
  const radius = Math.min(state.cols * 0.38, state.orientation === "portrait" ? 12 : 18);
  let best = null;
  for (const bubble of bubbles ?? []) {
    if (bubble.phase !== "rise"
      || !["stream", "isolated", "touch"].includes(bubble.kind)) continue;
    const distance = Math.hypot(bubble.worldX - fish.x, bubble.worldY - fish.y);
    if (!Number.isFinite(distance) || distance > radius) continue;
    const crowding = (state.individuals ?? []).filter((other) => (
      other.seed !== fish.seed
      && other.activity?.current === ACTIVITIES.bubbleInvestigate
      && other.activity?.targetId === bubble.id
    )).length;
    const socialProof = (1 - traits.boldness)
      * Math.min(2, nearbyFishCount(state, bubble.worldX, bubble.worldY, 2.8, fish.seed)) * 0.09;
    const score = sizeInterest(bubble.sizeClass) * 0.48
      + affinities.bubble * 0.24
      + socialProof
      - distance / radius * 0.46
      - crowding * 0.17;
    if (!best || score > best.score || (score === best.score && bubble.id < best.bubble.id)) {
      best = { bubble, score };
    }
  }
  return best;
}

export function preferredCompanion(fish, index, state, traits = traitsFromSeed(fish.seed, fish.history)) {
  let best = null;
  for (let otherIndex = 0; otherIndex < (state.individuals?.length ?? 0); otherIndex += 1) {
    const other = state.individuals[otherIndex];
    if (otherIndex === index || other.seed === fish.seed) continue;
    const familiarity = familiarityFor(fish, other.seed);
    const compatibility = pairCompatibility(fish.seed, other.seed);
    const distance = Math.hypot(other.x - fish.x, other.y - fish.y);
    const score = familiarity * 0.9
      + compatibility * 0.34
      + traits.sociability * 0.1
      - distance / Math.max(10, state.cols) * 0.16;
    if (!best || score > best.score || (score === best.score && other.seed < best.fish.seed)) {
      best = { fish: other, index: otherIndex, familiarity, compatibility, distance, score };
    }
  }
  return best;
}

function selectionNoise(fish, state, activity) {
  const period = sampleRange(fish.seed, activitySalt(activity) + 4, 11, 19);
  const offset = sampleRange(fish.seed, activitySalt(activity) + 5, 0, period);
  const epoch = Math.floor((state.elapsedRealSeconds + offset) / period);
  return sampleRange(fish.seed, activitySalt(activity) + 10 + positiveModulo(epoch, 97), -0.035, 0.035);
}

function waypointFor(fish, index, state, traits, affinities, purpose) {
  const salt = purpose === "rest" ? 8300 : purpose === "surface" ? 8340 : 8320;
  const bucketLength = sampleRange(fish.seed, salt, 14, 24);
  const epoch = Math.floor((state.elapsedRealSeconds + sampleRange(fish.seed, salt + 1, 0, bucketLength)) / bucketLength);
  const waypointSeed = mix32((fish.seed >>> 0) ^ Math.imul(epoch + 1, 0x9e3779b1));
  const halfWidth = spriteHalfWidth(fish);
  const x = sampleRange(waypointSeed, salt + 2, halfWidth, state.cols - halfWidth);
  const top = surfaceSafeY(fish, state, x);
  const substrateBottom = substrateSafeY(fish, state, x);
  const protectedBottom = WATERLINE_ROWS
    + Math.max(0, substrateBottom - WATERLINE_ROWS) * 0.68;
  const bottom = index < 3 ? Math.min(substrateBottom, protectedBottom) : substrateBottom;
  if (purpose === "surface") return { x, y: top };
  const randomDepth = sample01(waypointSeed, salt + 3);
  const range = 0.38 + affinities.wander * 0.62;
  const depth = purpose === "rest"
    ? clamp(traits.preferredDepth * 0.55 + 0.34, 0.42, 0.86)
    : clamp(traits.preferredDepth * (1 - range) + randomDepth * range, 0.06, 0.94);
  return { x, y: top + Math.max(0, bottom - top) * depth };
}

function choice(activity, utility, target = {}) {
  return {
    activity,
    utility,
    targetType: target.targetType ?? null,
    targetId: target.targetId ?? null,
    targetX: Number.isFinite(target.targetX) ? target.targetX : null,
    targetY: Number.isFinite(target.targetY) ? target.targetY : null,
  };
}

function activityChoices(fish, index, state, {
  traits = traitsFromSeed(fish.seed, fish.history),
  affinities = affinitiesFromSeed(fish.seed),
  bubbles = [],
} = {}) {
  const behavior = fish.behavior?.current;
  const continuity = (activity) => fish.activity?.current === activity ? 0.09 : 0;
  const jitter = (activity) => selectionNoise(fish, state, activity);

  if (behavior === "forage") {
    if (!forageEligible(index)) return [choice(ACTIVITIES.cruise, 1)];
    return [choice(ACTIVITIES.substrateSearch, 1 + affinities.substrate * 0.16)];
  }
  if (behavior === "rest") {
    const openPoint = waypointFor(fish, index, state, traits, affinities, "rest");
    const choices = [choice(
      ACTIVITIES.openWaterRest,
      0.43 + (1 - affinities.shelter) * 0.36 + continuity(ACTIVITIES.openWaterRest) + jitter(ACTIVITIES.openWaterRest),
      { targetType: "waypoint", targetX: openPoint.x, targetY: openPoint.y },
    )];
    const plant = selectPlantTarget(fish, state, traits, affinities, { shelter: true });
    if (plant) {
      choices.push(choice(
        ACTIVITIES.plantShelter,
        0.2 + affinities.shelter * 0.76 + affinities.plant * 0.12 + plant.score * 0.2
          + continuity(ACTIVITIES.plantShelter) + jitter(ACTIVITIES.plantShelter),
        { targetType: "plant", targetId: plant.plant.seed },
      ));
    }
    return choices;
  }
  if (behavior === "social") {
    const companion = preferredCompanion(fish, index, state, traits);
    const choices = [choice(
      ACTIVITIES.schoolFollow,
      0.21 + affinities.school * 0.72 + traits.sociability * 0.17
        + continuity(ACTIVITIES.schoolFollow) + jitter(ACTIVITIES.schoolFollow),
      { targetType: "school" },
    )];
    if (companion) {
      choices.push(choice(
        ACTIVITIES.individualFollow,
        0.23 + traits.sociability * 0.24 + companion.score * 0.58
          + continuity(ACTIVITIES.individualFollow) + jitter(ACTIVITIES.individualFollow),
        { targetType: "fish", targetId: companion.fish.seed },
      ));
      if (companion.familiarity >= 0.045) {
        choices.push(choice(
          ACTIVITIES.companionCruise,
          0.18 + traits.sociability * 0.2 + companion.familiarity * 0.98 + companion.compatibility * 0.14
            + continuity(ACTIVITIES.companionCruise) + jitter(ACTIVITIES.companionCruise),
          { targetType: "fish", targetId: companion.fish.seed },
        ));
      }
      const playPeriod = sampleRange(fish.seed, 8400, 37, 61);
      const playWindow = positiveModulo(
        state.elapsedRealSeconds + sampleRange(fish.seed, 8401, 0, playPeriod),
        playPeriod,
      ) / playPeriod;
      const daylight = state.timeOfDayHours >= 6 && state.timeOfDayHours < 20;
      if (fish.activity?.current !== ACTIVITIES.playfulChase
        && daylight && playWindow < 0.16 && fish.drives.energy > 0.48
        && traits.activity > 0.48 && traits.sociability > 0.44 && companion.familiarity >= 0.035) {
        choices.push(choice(
          ACTIVITIES.playfulChase,
          0.42 + traits.activity * 0.34 + traits.sociability * 0.18 + companion.familiarity * 0.2
            + continuity(ACTIVITIES.playfulChase) + jitter(ACTIVITIES.playfulChase),
          { targetType: "fish", targetId: companion.fish.seed },
        ));
      }
    }
    return choices;
  }
  if (behavior === "explore") {
    const waypoint = waypointFor(fish, index, state, traits, affinities, "wander");
    const choices = [choice(
      ACTIVITIES.wander,
      0.35 + affinities.wander * 0.62 + traits.curiosity * 0.17
        + continuity(ACTIVITIES.wander) + jitter(ACTIVITIES.wander),
      { targetType: "waypoint", targetX: waypoint.x, targetY: waypoint.y },
    )];

    // Completed/invalid vegetation visits deliberately exit into open water
    // for one readable route before the same favourite can win again.
    if (fish.activity?.current === ACTIVITIES.plantWeave
      || fish.activity?.current === ACTIVITIES.plantInvestigate) return choices;

    const plant = selectPlantTarget(fish, state, traits, affinities);
    if (plant) {
      choices.push(choice(
        ACTIVITIES.plantInvestigate,
        0.2 + affinities.plant * 0.7 + traits.curiosity * 0.18 + plant.score * 0.24
          + continuity(ACTIVITIES.plantInvestigate) + jitter(ACTIVITIES.plantInvestigate),
        { targetType: "plant", targetId: plant.plant.seed },
      ));
      if (secondWeavePlant(fish, plant.plant, state)) {
        choices.push(choice(
          ACTIVITIES.plantWeave,
          0.13 + affinities.plant * 0.58 + traits.activity * 0.14 + plant.score * 0.17
            + continuity(ACTIVITIES.plantWeave) + jitter(ACTIVITIES.plantWeave),
          { targetType: "plant", targetId: plant.plant.seed },
        ));
      }
    }

    const bubble = selectBubbleTarget(fish, state, traits, affinities, bubbles);
    if (bubble) {
      choices.push(choice(
        ACTIVITIES.bubbleInvestigate,
        0.16 + affinities.bubble * 0.78 + traits.curiosity * 0.17 + bubble.score * 0.27
          + continuity(ACTIVITIES.bubbleInvestigate) + jitter(ACTIVITIES.bubbleInvestigate),
        { targetType: "bubble", targetId: bubble.bubble.id },
      ));
    }

    if (index >= 3) {
      const period = sampleRange(fish.seed, 2400, 72, 112);
      const offset = sampleRange(fish.seed, 2401, 0, period);
      const cycle = positiveModulo(state.elapsedRealSeconds + offset, period) / period;
      const window = 0.06 + traits.curiosity * 0.07 + affinities.surface * 0.06;
      if (cycle <= window) {
        const point = waypointFor(fish, index, state, traits, affinities, "surface");
        choices.push(choice(
          ACTIVITIES.surfaceInvestigate,
          0.12 + affinities.surface * 0.8 + traits.curiosity * 0.16
            + continuity(ACTIVITIES.surfaceInvestigate) + jitter(ACTIVITIES.surfaceInvestigate),
          { targetType: "surface", targetX: point.x, targetY: point.y },
        ));
      }
    }
    return choices;
  }

  return [choice(ACTIVITIES.cruise, 1 + continuity(ACTIVITIES.cruise))];
}

export function activityUtilities(fish, index, state, context = {}) {
  return Object.fromEntries(activityChoices(fish, index, state, context)
    .map((candidate) => [candidate.activity, candidate.utility]));
}

export function selectActivity(fish, index, state, context = {}) {
  const choices = activityChoices(fish, index, state, context);
  const selected = choices.reduce((best, candidate) => (
    candidate.utility > best.utility ? candidate : best
  ), choices[0]);
  const previous = normalizedActivity(fish).current;
  return {
    current: selected.activity,
    previous,
    ageRealSeconds: 0,
    targetType: selected.targetType,
    targetId: selected.targetId,
    targetX: selected.targetX,
    targetY: selected.targetY,
  };
}

function findPlant(state, seed) {
  return state.plants?.find((plant) => plant.seed === seed) ?? null;
}

function findFish(state, seed, selfSeed) {
  if (seed === selfSeed) return null;
  return state.individuals?.find((fish) => fish.seed === seed) ?? null;
}

function companionOffset(fish, companion, activity) {
  const pairSeed = mix32(Math.min(fish.seed, companion.seed)
    ^ Math.imul(Math.max(fish.seed, companion.seed), 0x27d4eb2f));
  const velocity = safeNormalize(companion.vx, companion.vy, companion.vx < 0 ? -1 : 1, 0);
  const side = sample01(pairSeed, 8500) < 0.5 ? -1 : 1;
  const perpendicular = { x: -velocity.y * side, y: velocity.x * side };
  const trailing = activity === ACTIVITIES.individualFollow ? 1.7 : 0.9;
  const beside = activity === ACTIVITIES.companionCruise ? 1.35 : 0.65;
  return {
    x: companion.x - velocity.x * trailing + perpendicular.x * beside,
    y: companion.y - velocity.y * trailing + perpendicular.y * beside * 0.55,
  };
}

export function resolveActivityTarget(fish, index, state, activity, {
  traits = traitsFromSeed(fish.seed, fish.history),
  affinities = affinitiesFromSeed(fish.seed),
  bubbles = [],
  school = state.school,
} = {}) {
  if (activity.current === ACTIVITIES.touchReact) {
    if (!state.reaction) return null;
    const away = safeNormalize(fish.x - state.reaction.x, fish.y - state.reaction.y, fish.vx < 0 ? -1 : 1, 0);
    const standoff = 0.2 + (1 - affinities.glass) * 0.82;
    return {
      x: state.reaction.x + away.x * standoff,
      y: state.reaction.y + away.y * standoff,
      speed: 0.56 + affinities.glass * 0.25,
      postureBias: 0,
      touchReact: true,
    };
  }
  if (activity.current === ACTIVITIES.wander) {
    if (!Number.isFinite(activity.targetX) || !Number.isFinite(activity.targetY)) return null;
    return {
      x: activity.targetX,
      y: activity.targetY,
      speed: 0.27 + traits.curiosity * 0.24 + affinities.wander * 0.08,
      postureBias: 0,
    };
  }
  // Joining the aquarium is just swimming: ordinary pitch, turn, and body
  // deformation carry it. No text, no marker, no cinematic.
  if (activity.current === ACTIVITIES.arrivalEnter) {
    if (!Number.isFinite(activity.targetX) || !Number.isFinite(activity.targetY)) return null;
    return {
      x: activity.targetX,
      y: activity.targetY,
      speed: 0.3 + traits.activity * 0.16,
      postureBias: 0,
      arrivalEntry: true,
    };
  }
  if (activity.current === ACTIVITIES.plantInvestigate
    || activity.current === ACTIVITIES.plantShelter
    || activity.current === ACTIVITIES.plantWeave) {
    const primary = findPlant(state, activity.targetId);
    const shelter = activity.current === ACTIVITIES.plantShelter;
    if (!primary || !suitablePlant(primary, { shelter })) return null;
    let targetPlant = primary;
    let alternateSide = false;
    if (activity.current === ACTIVITIES.plantWeave && activity.ageRealSeconds > 6.4) {
      targetPlant = secondWeavePlant(fish, primary, state);
      if (!targetPlant) return null;
      alternateSide = true;
    }
    const point = plantTargetPosition(fish, targetPlant, state, { shelter, alternateSide });
    const cautious = 0.7 + traits.boldness * 0.3;
    return {
      x: point.x,
      y: point.y,
      speed: shelter
        ? 0.075 + traits.activity * 0.055
        : (0.18 + traits.curiosity * 0.16) * cautious,
      postureBias: shelter ? 0 : 0,
      plantTarget: true,
    };
  }
  if (activity.current === ACTIVITIES.bubbleInvestigate) {
    const bubble = bubbles.find((record) => record.id === activity.targetId && record.phase === "rise");
    if (!bubble || !["stream", "isolated", "touch"].includes(bubble.kind)) return null;
    const away = safeNormalize(fish.x - bubble.worldX, fish.y - bubble.worldY, fish.vx < 0 ? -1 : 1, 0);
    const standoff = 0.18 + (1 - traits.boldness) * 0.82;
    const socialProof = nearbyFishCount(state, bubble.worldX, bubble.worldY, 2.8, fish.seed) > 0;
    return {
      x: bubble.worldX + away.x * standoff,
      y: bubble.worldY + away.y * standoff,
      speed: (0.26 + traits.curiosity * 0.2 + affinities.bubble * 0.08)
        * (0.72 + traits.boldness * 0.28 + (socialProof ? (1 - traits.boldness) * 0.12 : 0)),
      postureBias: 0,
      bubbleTarget: true,
    };
  }
  if (activity.current === ACTIVITIES.surfaceInvestigate) {
    if (index < 3 || !Number.isFinite(activity.targetX)) return null;
    const y = surfaceSafeY(fish, state, activity.targetX);
    const near = Math.abs(fish.y - y) < 1.1;
    return {
      x: activity.targetX,
      y,
      speed: near ? 0.1 + traits.activity * 0.04 : 0.22 + traits.curiosity * 0.15,
      postureBias: SURFACE_PITCH_BIAS_DEGREES,
      surfaceInspect: true,
    };
  }
  if (activity.current === ACTIVITIES.schoolFollow) {
    const center = schoolSummary(school, state);
    const direction = safeNormalize(center.vx, center.vy, sample01(fish.seed, 8510) < 0.5 ? -1 : 1, 0);
    const trailing = sampleRange(fish.seed, 8511, -1.5, 2.3);
    const vertical = sampleSigned(fish.seed, 8512) * 1.15;
    return {
      x: center.x - direction.x * trailing,
      y: center.y + vertical,
      speed: 0.28 + traits.sociability * 0.22 + affinities.school * 0.07,
      postureBias: 0,
      schoolTarget: true,
    };
  }
  if (activity.current === ACTIVITIES.individualFollow
    || activity.current === ACTIVITIES.companionCruise
    || activity.current === ACTIVITIES.playfulChase) {
    const companion = findFish(state, activity.targetId, fish.seed);
    if (!companion) return null;
    if (activity.current === ACTIVITIES.playfulChase) {
      return {
        x: companion.x + companion.vx * 1.15,
        y: companion.y + companion.vy * 0.7,
        speed: clamp(0.45 + traits.activity * 0.22, 0.5, 0.68),
        postureBias: 0,
        companionTarget: true,
      };
    }
    const point = companionOffset(fish, companion, activity.current);
    return {
      x: point.x,
      y: point.y,
      speed: activity.current === ACTIVITIES.companionCruise
        ? 0.27 + traits.sociability * 0.18
        : 0.3 + traits.sociability * 0.2,
      postureBias: 0,
      companionTarget: true,
    };
  }
  if (activity.current === ACTIVITIES.substrateSearch) {
    if (!forageEligible(index)) return null;
    const forage = forageActivity(fish, index, state);
    const halfWidth = spriteHalfWidth(fish);
    const searchSpan = Math.min(6.8, state.cols * (0.065 + affinities.substrate * 0.055));
    const searchPhase = (fish.behavior.ageRealSeconds ?? 0) * (0.15 + traits.activity * 0.075)
      + sampleRange(fish.seed, 25, 0, TAU);
    const patchCenter = state.cols * (
      0.5 + 0.34 * Math.sin(state.elapsedRealSeconds / 97 + sampleRange(fish.seed, 26, 0, TAU))
    );
    const x = clamp(patchCenter + Math.sin(searchPhase) * searchSpan, halfWidth, state.cols - halfWidth);
    const dip = forage.searching ? forage.peck * 0.14 : 0;
    return {
      x,
      y: substrateSafeY(fish, state, x) + dip,
      speed: forage.searching
        ? 0.07 + traits.activity * 0.075 + affinities.substrate * 0.025
        : 0.23 + traits.activity * 0.22,
      postureBias: forage.searching ? FORAGE_PITCH_BIAS_DEGREES + forage.peck * 4 : 0,
      forageSearching: forage.searching,
      peck: forage.peck,
    };
  }
  if (activity.current === ACTIVITIES.openWaterRest) {
    if (!Number.isFinite(activity.targetX) || !Number.isFinite(activity.targetY)) return null;
    return {
      x: activity.targetX,
      y: activity.targetY,
      speed: 0.085 + traits.activity * 0.06,
      postureBias: 0,
    };
  }

  // Cruise stays a moving broad behavior, not a waypoint activity.
  const top = surfaceSafeY(fish, state, fish.x);
  const bottom = substrateSafeY(fish, state, fish.x);
  const preferredY = top + Math.max(0, bottom - top) * traits.preferredDepth;
  return {
    x: fish.vx < 0 ? 0 : state.cols,
    y: preferredY + Math.sin(state.elapsedRealSeconds / 33 + sampleRange(fish.seed, 23, 0, TAU)) * 0.8,
    speed: 0.2 + traits.activity * 0.32,
    postureBias: 0,
  };
}

function naturalCompletion(fish, activity, target, dwell) {
  if (activity.ageRealSeconds < dwell.minimum || !target) return false;
  const distance = Math.hypot(target.x - fish.x, target.y - fish.y);
  if (activity.current === ACTIVITIES.wander || activity.current === ACTIVITIES.openWaterRest) return distance < 0.7;
  if (activity.current === ACTIVITIES.plantInvestigate) return distance < 0.62;
  if (activity.current === ACTIVITIES.plantWeave) return activity.ageRealSeconds > 9 && distance < 0.75;
  if (activity.current === ACTIVITIES.surfaceInvestigate) return distance < 0.72;
  if (activity.current === ACTIVITIES.arrivalEnter) return distance < 0.9;
  return false;
}

export function tickFishActivity(fish, index, state, realDelta, context = {}) {
  const traits = context.traits ?? traitsFromSeed(fish.seed, fish.history);
  const affinities = context.affinities ?? affinitiesFromSeed(fish.seed);
  if (state.reaction) {
    const previous = normalizedActivity(fish);
    const activity = previous.current === ACTIVITIES.touchReact
      ? { ...previous, ageRealSeconds: previous.ageRealSeconds + realDelta }
      : {
        ...createActivityState(ACTIVITIES.touchReact, previous.current),
        targetType: "touch",
        targetX: state.reaction.x,
        targetY: state.reaction.y,
      };
    return {
      activity,
      target: resolveActivityTarget(fish, index, state, activity, { ...context, traits, affinities }),
    };
  }

  let activity = normalizedActivity(fish);
  const compatible = activityMatchesBehavior(activity.current, fish.behavior?.current);
  if (!compatible) activity = selectActivity(fish, index, state, { ...context, traits, affinities });
  else activity = { ...activity, ageRealSeconds: activity.ageRealSeconds + realDelta };

  let target = resolveActivityTarget(fish, index, state, activity, { ...context, traits, affinities });
  const dwell = activityDwell(fish, activity.current);
  if (!target || activity.ageRealSeconds >= dwell.maximum || naturalCompletion(fish, activity, target, dwell)) {
    activity = selectActivity({ ...fish, activity }, index, state, { ...context, traits, affinities });
    target = resolveActivityTarget(fish, index, state, activity, { ...context, traits, affinities });
  }

  if (!target) {
    activity = createActivityState(defaultActivityForBehavior(fish.behavior?.current), activity.current);
    target = resolveActivityTarget(fish, index, state, activity, { ...context, traits, affinities });
  }
  return { activity, target };
}

// Company is only company when there are fish within reach of it. A school
// spread around an empty centroid must not relieve the social drive, so
// engagement counts the members actually close by rather than the aggregate
// center the follower happens to be steering toward.
export function schoolContact(fish, school) {
  if (!school?.length) return 0;
  let contact = 0;
  for (const member of school) {
    const distance = Math.hypot(fish.x - member.x, fish.y - member.y);
    if (distance >= SCHOOL_CONTACT_RADIUS) continue;
    contact += 1 - distance / SCHOOL_CONTACT_RADIUS;
  }
  return clamp(contact / SCHOOL_CONTACT_SATURATION, 0, 1);
}

export function socialEngagement(fish, state, school = state.school) {
  if (fish.behavior?.current !== "social") return 0;
  const activity = normalizedActivity(fish);
  if (activity.current === ACTIVITIES.schoolFollow) {
    return schoolContact(fish, school);
  }
  if ([ACTIVITIES.individualFollow, ACTIVITIES.companionCruise, ACTIVITIES.playfulChase].includes(activity.current)) {
    const companion = findFish(state, activity.targetId, fish.seed);
    if (!companion) return 0;
    const radius = activity.current === ACTIVITIES.companionCruise ? 3.5 : 4.3;
    return clamp(1 - Math.hypot(fish.x - companion.x, fish.y - companion.y) / radius, 0, 1);
  }
  return 0;
}
