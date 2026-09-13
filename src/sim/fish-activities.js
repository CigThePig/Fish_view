/*
 * Fish activity facade.
 *
 * Phase 7.4 leaves the mature activity-selection vocabulary in
 * fish-activities-core.js and owns only the spatial plant-weave route here.
 * Keeping the route beside the public facade lets weave progression carry two
 * bounded runtime scalars without turning the older activity selector into a
 * second pathfinding system. All non-weave behavior delegates byte-for-byte to
 * the existing implementation.
 */

import * as core from "./fish-activities-core.js";
import { clamp, traitsFromSeed } from "./entities.js";
import { sceneTuning } from "./choreography-tuning.js";
import { choreographyFor } from "./fish-choreography.js";
import { fishSpriteWidth } from "./fish-growth.js";
import { affinitiesFromSeed } from "./fish-personality.js";
import { plantHeight } from "./plants.js";
import { mix32, sample01, sampleRange, sampleSigned } from "./prng.js";
import { substrateSafeY, surfaceSafeY } from "./fish-motion.js";

export * from "./fish-activities-core.js";

export const WEAVE_ROUTE_STAGE_COUNT = 5;
const WEAVE_ROUTE_LAST_STAGE = WEAVE_ROUTE_STAGE_COUNT - 1;
const WEAVE_ARRIVAL_RADIUS = 0.62;
const WEAVE_MIN_CLEARANCE_COLUMNS = 1.6;
const WEAVE_MAX_CLEARANCE_COLUMNS = 2.55;
const WEAVE_EMERGE_EXTRA_COLUMNS = 1.65;
const WEAVE_ROUTE_MAX_SECONDS = 70;

export const DWELL_SECONDS = Object.freeze({
  ...core.DWELL_SECONDS,
  // Successful routes finish through spatial completion. This ceiling exists
  // only so an activity cannot survive forever if habitat geometry changes
  // underneath a fish mid-route.
  [core.ACTIVITIES.plantWeave]: [8, 55, WEAVE_ROUTE_MAX_SECONDS],
});

function spriteHalfWidth(fish) {
  return fishSpriteWidth(fish) / 2;
}

function boundedPlantPoint(fish, state, x, y) {
  const halfWidth = spriteHalfWidth(fish);
  const boundedX = clamp(x, halfWidth, state.cols - halfWidth);
  const top = surfaceSafeY(fish, state, boundedX);
  const bottom = substrateSafeY(fish, state, boundedX);
  return {
    x: boundedX,
    y: clamp(y, Math.min(top, bottom), Math.max(top, bottom)),
  };
}

function suitablePlant(plant) {
  return Number.isFinite(plant?.x)
    && Number.isFinite(plantHeight(plant))
    && plantHeight(plant) >= 1.25;
}

function findPlant(state, seed) {
  return state.plants?.find((plant) => plant.seed === seed) ?? null;
}

function weaveClearanceColumns(fish) {
  return clamp(
    spriteHalfWidth(fish) * 0.48 + 0.65,
    WEAVE_MIN_CLEARANCE_COLUMNS,
    WEAVE_MAX_CLEARANCE_COLUMNS,
  );
}

function secondWeavePlant(fish, first, state) {
  // A second stem only helps if the fish body can visibly clear one specimen
  // before threading toward the next. Very close stems make mathematically
  // opposite waypoints disappear beneath one adult sprite.
  const clearance = weaveClearanceColumns(fish);
  const minimumDistance = clearance * 2 + 0.8;
  const maximumDistance = Math.max(8, state.cols * 0.2);
  const idealDistance = Math.min(maximumDistance, minimumDistance + 2.7);
  return (state.plants ?? [])
    .filter((plant) => plant.seed !== first.seed && suitablePlant(plant))
    .map((plant) => ({
      plant,
      distance: Math.abs(plant.x - first.x),
      preference: core.favoritePlantScore(fish.seed, plant),
    }))
    .filter(({ distance }) => distance >= minimumDistance && distance <= maximumDistance)
    .sort((left, right) => (
      (Math.abs(left.distance - idealDistance) - left.preference * 1.6)
        - (Math.abs(right.distance - idealDistance) - right.preference * 1.6)
      || left.plant.seed - right.plant.seed
    ))[0]?.plant ?? null;
}

function weavePlantPoint(fish, plant, state, side, lift, distance) {
  const base = core.plantTargetPosition(fish, plant, state);
  return {
    ...boundedPlantPoint(fish, state, plant.x + side * distance, base.y + lift),
    plant,
    side,
  };
}

function weaveRoute(fish, primary, state) {
  const tuning = sceneTuning(state, core.ACTIVITIES.plantWeave);
  const secondary = secondWeavePlant(fish, primary, state);
  const pairSeed = mix32((fish.seed >>> 0) ^ Math.imul(primary.seed >>> 0, 0x85ebca6b));
  const clearance = weaveClearanceColumns(fish);
  const verticalSign = sample01(pairSeed, 8161) < 0.5 ? -1 : 1;
  const seededTravel = sample01(pairSeed, 8162) < 0.5 ? -1 : 1;
  const travelSide = secondary ? (Math.sign(secondary.x - primary.x) || seededTravel) : seededTravel;
  const entrySide = -travelSide;
  const asymmetry = (stage) => sampleSigned(pairSeed, 8170 + stage) * tuning.asymmetryRows;

  // Plants originate near the substrate. Both vertical lanes stay above the
  // anchor so the floor clamp cannot collapse a crossing into a near-180°
  // reversal, which used to make the steering controller look stalled.
  const primaryEntryLift = verticalSign > 0 ? -0.35 : -1.35;
  const primaryCrossLift = verticalSign > 0 ? -1.45 : -0.25;
  const gapLift = verticalSign > 0 ? -0.62 : -1.08;
  const secondaryCrossLift = verticalSign > 0 ? -1.58 : -0.32;
  const emergeLift = -0.82;
  const point = (plant, side, lift, distance, stage, leg) => ({
    ...weavePlantPoint(fish, plant, state, side, lift + asymmetry(stage), distance),
    stage,
    leg,
  });

  if (secondary) {
    return [
      point(primary, entrySide, primaryEntryLift, clearance, 0, "entry-primary"),
      point(primary, travelSide, primaryCrossLift, clearance, 1, "cross-primary"),
      point(secondary, -travelSide, gapLift, clearance, 2, "thread-gap"),
      point(secondary, travelSide, secondaryCrossLift, clearance, 3, "cross-secondary"),
      point(secondary, travelSide, emergeLift, clearance + WEAVE_EMERGE_EXTRA_COLUMNS, 4, "emerge"),
    ];
  }

  // Habitat can change after a route begins. A one-plant fallback still reads
  // as traversal: cross, cross back, cross once more, then emerge past the
  // outer side instead of invalidating the activity or inventing path history.
  return [
    point(primary, entrySide, primaryEntryLift, clearance, 0, "entry-primary"),
    point(primary, travelSide, primaryCrossLift, clearance, 1, "cross-primary"),
    point(primary, entrySide, gapLift, clearance, 2, "cross-back"),
    point(primary, travelSide, secondaryCrossLift, clearance, 3, "cross-again"),
    point(primary, travelSide, emergeLift, clearance + WEAVE_EMERGE_EXTRA_COLUMNS, 4, "emerge"),
  ];
}

function weavePoint(fish, primary, state, activity) {
  const tuning = sceneTuning(state, core.ACTIVITIES.plantWeave);
  const route = weaveRoute(fish, primary, state);
  const stage = clamp(Number.isInteger(activity?.weaveStage) ? activity.weaveStage : 0, 0, WEAVE_ROUTE_LAST_STAGE);
  const waypoint = route[stage];
  const pairSeed = mix32((fish.seed >>> 0) ^ Math.imul(primary.seed >>> 0, 0x85ebca6b));
  const timeoutSeconds = sampleRange(
    pairSeed,
    8190 + stage,
    tuning.legTimeoutSecondsMin,
    tuning.legTimeoutSecondsMax,
  );
  return {
    ...waypoint,
    timeoutSeconds,
    arrivalRadius: WEAVE_ARRIVAL_RADIUS,
    final: stage === WEAVE_ROUTE_LAST_STAGE,
  };
}

function normalizedWeaveProgress(activity) {
  const ageRealSeconds = Math.max(0, Number.isFinite(activity?.ageRealSeconds) ? activity.ageRealSeconds : 0);
  return {
    ...activity,
    ageRealSeconds,
    weaveStage: Number.isInteger(activity?.weaveStage)
      ? clamp(activity.weaveStage, 0, WEAVE_ROUTE_LAST_STAGE)
      : 0,
    weaveStageStartedAt: Number.isFinite(activity?.weaveStageStartedAt)
      ? clamp(activity.weaveStageStartedAt, 0, ageRealSeconds)
      : 0,
  };
}

function advanceWeaveProgress(fish, state, activity) {
  const primary = findPlant(state, activity.targetId);
  if (!suitablePlant(primary)) return activity;
  const point = weavePoint(fish, primary, state, activity);
  const distance = Math.hypot(point.x - fish.x, point.y - fish.y);
  const stageAge = Math.max(0, activity.ageRealSeconds - activity.weaveStageStartedAt);
  const arrived = distance <= point.arrivalRadius;
  // Time is only an escape hatch for a stale/unreachable middle leg. Entry and
  // emergence must physically happen or the defining visual sentence is lost.
  const safetyAdvance = point.stage > 0
    && point.stage < WEAVE_ROUTE_LAST_STAGE
    && stageAge >= point.timeoutSeconds;
  if ((arrived || safetyAdvance) && point.stage < WEAVE_ROUTE_LAST_STAGE) {
    return {
      ...activity,
      weaveStage: point.stage + 1,
      weaveStageStartedAt: activity.ageRealSeconds,
    };
  }
  return activity;
}

function weaveTarget(fish, index, state, activity, options = {}) {
  const primary = findPlant(state, activity.targetId);
  if (!suitablePlant(primary)) return null;
  const traits = options.traits ?? traitsFromSeed(fish.seed, fish.history);
  const affinities = options.affinities ?? affinitiesFromSeed(fish.seed);
  const tuning = sceneTuning(state, core.ACTIVITIES.plantWeave);
  const point = weavePoint(fish, primary, state, activity);
  const cautious = 0.7 + traits.boldness * 0.3;
  return {
    x: point.x,
    y: point.y,
    speed: (tuning.speedBase + traits.activity * tuning.speedActivity
      + affinities.plant * tuning.speedAffinity) * cautious,
    postureBias: 0,
    plantTarget: true,
    weaveStage: point.stage,
    weaveLeg: point.leg,
    weavePlantSeed: point.plant.seed,
    weavePlantX: point.plant.x,
    weaveSide: point.side,
    weaveArrivalRadius: point.arrivalRadius,
    weaveLegTimeoutSeconds: point.timeoutSeconds,
    weaveFinal: point.final,
    choreographyPhase: `weave-${point.stage + 1}`,
    choreography: choreographyFor(state, core.ACTIVITIES.plantWeave),
  };
}

export function createActivityState(current = core.ACTIVITIES.cruise, previous = current) {
  return {
    ...core.createActivityState(current, previous),
    weaveStage: 0,
    weaveStageStartedAt: 0,
  };
}

export function selectActivity(fish, index, state, context = {}) {
  const selected = core.selectActivity(fish, index, state, context);
  return selected.current === core.ACTIVITIES.plantWeave
    ? { ...selected, weaveStage: 0, weaveStageStartedAt: 0 }
    : selected;
}

export function resolveActivityTarget(fish, index, state, activity, options = {}) {
  if (activity?.current !== core.ACTIVITIES.plantWeave) {
    return core.resolveActivityTarget(fish, index, state, activity, options);
  }
  return weaveTarget(fish, index, state, normalizedWeaveProgress(activity), options);
}

function customWeaveResult(fish, index, state, realDelta, context, coreResult, startingWeave) {
  let activity;
  if (startingWeave) {
    const previous = normalizedWeaveProgress(fish.activity);
    activity = {
      ...previous,
      ageRealSeconds: previous.ageRealSeconds + realDelta,
    };
  } else {
    activity = normalizedWeaveProgress(coreResult.activity);
  }

  activity = advanceWeaveProgress(fish, state, activity);
  let target = weaveTarget(fish, index, state, activity, context);
  if (!target) return coreResult;

  const distance = Math.hypot(target.x - fish.x, target.y - fish.y);
  const completed = activity.weaveStage === WEAVE_ROUTE_LAST_STAGE
    && distance <= target.weaveArrivalRadius;
  const expired = activity.ageRealSeconds >= WEAVE_ROUTE_MAX_SECONDS;
  if (completed || expired) {
    const next = selectActivity({ ...fish, activity }, index, state, context);
    return {
      activity: next,
      attention: coreResult.attention,
      target: resolveActivityTarget(fish, index, state, next, context),
    };
  }

  return {
    activity,
    attention: coreResult.attention,
    target,
  };
}

export function tickFishActivity(fish, index, state, realDelta, context = {}) {
  const startingWeave = fish.activity?.current === core.ACTIVITIES.plantWeave;
  let shadowFish = fish;

  if (startingWeave) {
    const activity = normalizedWeaveProgress(fish.activity);
    // The core implementation still contains the historical timer-driven weave
    // and its nine-second natural-completion check. Keep that delegated pass in
    // its pre-completion window; this facade supplies the real route target and
    // the real age immediately afterwards.
    const shadowAge = Math.min(activity.ageRealSeconds, 8);
    shadowFish = {
      ...fish,
      activity: { ...activity, ageRealSeconds: shadowAge },
      attention: fish.attention
        ? { ...fish.attention, resume: fish.attention.resume ?? activity }
        : fish.attention,
    };
  }

  const coreResult = core.tickFishActivity(shadowFish, index, state, realDelta, context);
  if (coreResult.activity?.current !== core.ACTIVITIES.plantWeave) return coreResult;
  return customWeaveResult(fish, index, state, realDelta, context, coreResult, startingWeave);
}
