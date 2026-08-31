import assert from "node:assert/strict";
import test from "node:test";

import { createBubbleWorldRecords } from "../src/sim/bubbles.js";
import { DRIVE_MAXIMUM } from "../src/sim/config.js";
import { traitsFromSeed } from "../src/sim/entities.js";
import {
  ACTIVITIES,
  activityUtilities,
  createActivityState,
  favoritePlantScore,
  plantGrowthNovelty,
  plantTargetPosition,
  tickFishActivity,
} from "../src/sim/fish-activities.js";
import { substrateSafeY, surfaceSafeY } from "../src/sim/fish-motion.js";
import { AFFINITY_KEYS, affinitiesFromSeed } from "../src/sim/fish-personality.js";
import { plantSpecies } from "../src/sim/plants.js";
import {
  applyTouch,
  createAquariumState,
  withSettings,
} from "../src/sim/state.js";
import { behaviorUtilities, tick } from "../src/sim/tick.js";

function affinities(overrides = {}) {
  return Object.fromEntries(AFFINITY_KEYS.map((key) => [key, overrides[key] ?? 0.4]));
}

function withBehavior(fish, current) {
  return {
    ...fish,
    behavior: { current, previous: current, blend: 1, ageSeconds: 0 },
    activity: createActivityState(current === "explore" ? ACTIVITIES.wander : ACTIVITIES.cruise),
  };
}

function manualBubble(fish) {
  return {
    id: "bubble:test:large",
    seed: 123,
    kind: "stream",
    phase: "rise",
    sizeClass: "large",
    speed: 0.5,
    progress: 0.4,
    distance: 0.6,
    worldX: fish.x + 2,
    worldY: fish.y - 1,
  };
}

test("specific affinities raise matching activity utility under equivalent opportunity", () => {
  const base = createAquariumState({ orientation: "landscape", seed: 92, wallClockHours: 12 });
  const fish = withBehavior(base.individuals[4], "explore");
  const state = { ...base, individuals: base.individuals.map((value, index) => index === 4 ? fish : value) };
  const traits = traitsFromSeed(fish.seed, fish.history);
  const bubble = manualBubble(fish);

  const utility = (key, value, activity) => activityUtilities(fish, 4, state, {
    traits,
    affinities: affinities({ [key]: value }),
    bubbles: [bubble],
  })[activity];

  assert.ok(utility("bubble", 0.9, ACTIVITIES.bubbleInvestigate) > utility("bubble", 0.15, ACTIVITIES.bubbleInvestigate));
  assert.ok(utility("plant", 0.9, ACTIVITIES.plantInvestigate) > utility("plant", 0.15, ACTIVITIES.plantInvestigate));
  assert.ok(utility("wander", 0.9, ACTIVITIES.wander) > utility("wander", 0.15, ACTIVITIES.wander));
});

test("school and shelter affinities shape social and rest expression", () => {
  const base = createAquariumState({ orientation: "landscape", seed: 193, wallClockHours: 12 });
  const social = withBehavior(base.individuals[3], "social");
  const resting = withBehavior(base.individuals[4], "rest");
  const state = {
    ...base,
    plants: base.plants.map((plant) => ({ ...plant, ageDays: 200, matureHeight: Math.max(5, plant.matureHeight) })),
    individuals: base.individuals.map((fish, index) => index === 3 ? social : index === 4 ? resting : fish),
  };
  const socialLow = activityUtilities(social, 3, state, { affinities: affinities({ school: 0.15 }) });
  const socialHigh = activityUtilities(social, 3, state, { affinities: affinities({ school: 0.92 }) });
  assert.ok(socialHigh[ACTIVITIES.schoolFollow] > socialLow[ACTIVITIES.schoolFollow]);

  const restLow = activityUtilities(resting, 4, state, { affinities: affinities({ shelter: 0.15 }) });
  const restHigh = activityUtilities(resting, 4, state, { affinities: affinities({ shelter: 0.92 }) });
  assert.ok(Number.isFinite(restHigh[ACTIVITIES.plantShelter]));
  assert.ok(restHigh[ACTIVITIES.plantShelter] > restLow[ACTIVITIES.plantShelter]);
});

test("surface affinity modifies the existing eligible surface opportunity", () => {
  const base = createAquariumState({ orientation: "landscape", seed: 447, wallClockHours: 12 });
  const fish = withBehavior(base.individuals[4], "explore");
  let opportunity = null;
  for (let seconds = 0; seconds < 240; seconds += 0.5) {
    const state = {
      ...base,
      // The surface opportunity window is a locomotion cycle on real seconds.
      elapsedSimSeconds: seconds,
      elapsedRealSeconds: seconds,
      individuals: base.individuals.map((value, index) => index === 4 ? fish : value),
    };
    const low = activityUtilities(fish, 4, state, { affinities: affinities({ surface: 0.15 }) });
    if (Number.isFinite(low[ACTIVITIES.surfaceInvestigate])) {
      const high = activityUtilities(fish, 4, state, { affinities: affinities({ surface: 0.92 }) });
      opportunity = { low, high };
      break;
    }
  }
  assert.ok(opportunity);
  assert.ok(opportunity.high[ACTIVITIES.surfaceInvestigate] > opportunity.low[ACTIVITIES.surfaceInvestigate]);

  const protectedFish = withBehavior(base.individuals[1], "explore");
  const protectedUtilities = activityUtilities(protectedFish, 1, base, {
    affinities: affinities({ surface: 0.99 }),
  });
  assert.equal(ACTIVITIES.surfaceInvestigate in protectedUtilities, false);
});

test("substrate affinity influences forage readiness without overpowering low hunger", () => {
  let lowSeed = null;
  let highSeed = null;
  for (let seed = 1; seed < 5000 && (lowSeed === null || highSeed === null); seed += 1) {
    const value = affinitiesFromSeed(seed).substrate;
    if (value < 0.2) lowSeed = seed;
    if (value > 0.66) highSeed = seed;
  }
  assert.ok(lowSeed !== null && highSeed !== null);

  const state = createAquariumState({ orientation: "landscape", seed: 52, wallClockHours: 12 });
  const template = state.individuals[4];
  const traits = traitsFromSeed(template.seed, template.history);
  const make = (seed, hunger) => ({
    ...template,
    seed,
    drives: { ...template.drives, hunger, energy: 0.62 },
  });
  const high = behaviorUtilities(make(highSeed, 0.65), state, traits);
  const low = behaviorUtilities(make(lowSeed, 0.65), state, traits);
  assert.ok(high.forage > low.forage);
  const satiated = behaviorUtilities(make(highSeed, 0.15), state, traits);
  assert.ok(satiated.forage < satiated.cruise);
});

test("plant targets use stable plant seeds and real root, height, and water bounds", () => {
  const state = createAquariumState({ orientation: "portrait", seed: 74, wallClockHours: 12 });
  const fish = state.individuals[4];
  const plant = state.plants.find((candidate) => candidate.matureHeight > 3);
  assert.ok(plant);
  assert.equal(favoritePlantScore(fish.seed, plant), favoritePlantScore(fish.seed, plant));
  const point = plantTargetPosition(fish, plant, state);
  assert.ok(Math.abs(point.x - plant.x) < 1.5);
  assert.ok(point.y >= surfaceSafeY(fish, state, point.x) - 1e-10);
  assert.ok(point.y <= substrateSafeY(fish, state, point.x) + 1e-10);

  const movedPlant = { ...plant, x: plant.x + 2, matureHeight: plant.matureHeight * 0.7 };
  const movedPoint = plantTargetPosition(fish, movedPlant, state);
  assert.notDeepEqual(movedPoint, point);

  const explorer = withBehavior(fish, "explore");
  const utilitiesState = {
    ...state,
    individuals: state.individuals.map((value, index) => index === 4 ? explorer : value),
  };
  const frame = tickFishActivity(explorer, 4, utilitiesState, 0.1, {
    affinities: affinities({ plant: 0.96, wander: 0.12, bubble: 0.12 }),
    bubbles: [],
  });
  if (frame.activity.targetType === "plant") {
    assert.ok(state.plants.some((candidate) => candidate.seed === frame.activity.targetId));
  }
});

test("recent structural growth creates temporary plant novelty", () => {
  const state = createAquariumState({ orientation: "landscape", seed: 105 });
  const plant = state.plants.find((candidate) => plantSpecies(candidate).maximumStage >= 1);
  assert.ok(plant);
  const species = plantSpecies(plant);
  const recent = { ...plant, ageDays: species.growthStepDays + 0.05 };
  const old = { ...plant, ageDays: species.growthStepDays * (species.maximumStage + 2) };
  assert.ok(plantGrowthNovelty(recent) > plantGrowthNovelty(old));
  assert.ok(plantGrowthNovelty(recent) > 0);
});

test("tiny plants are excluded from shelter and suitable foreground growth enables it", () => {
  const base = createAquariumState({ orientation: "landscape", seed: 88 });
  const fish = withBehavior(base.individuals[4], "rest");
  const tiny = {
    ...base,
    individuals: base.individuals.map((value, index) => index === 4 ? fish : value),
    plants: base.plants.map((plant) => ({ ...plant, ageDays: 0, matureHeight: 0.5 })),
  };
  assert.equal(ACTIVITIES.plantShelter in activityUtilities(fish, 4, tiny), false);

  const grown = {
    ...tiny,
    plants: base.plants.map((plant) => ({ ...plant, ageDays: 200, matureHeight: Math.max(6, plant.matureHeight) })),
  };
  assert.ok(Number.isFinite(activityUtilities(fish, 4, grown)[ACTIVITIES.plantShelter]));
});

test("activity continuity retains a valid target through its minimum real-time dwell", () => {
  const state = createAquariumState({ orientation: "landscape", seed: 309 });
  let fish = withBehavior(state.individuals[4], "explore");
  fish.activity = {
    ...createActivityState(ACTIVITIES.wander),
    targetType: "waypoint",
    targetX: fish.x + 5,
    targetY: fish.y,
  };
  const initialTarget = { x: fish.activity.targetX, y: fish.activity.targetY };
  for (let frame = 0; frame < 30; frame += 1) {
    const currentState = {
      ...state,
      elapsedRealSeconds: frame * 0.1,
      individuals: state.individuals.map((value, index) => index === 4 ? fish : value),
    };
    const result = tickFishActivity(fish, 4, currentState, 0.1, { bubbles: [] });
    fish = { ...fish, activity: result.activity };
    assert.equal(fish.activity.current, ACTIVITIES.wander);
    assert.deepEqual({ x: fish.activity.targetX, y: fish.activity.targetY }, initialTarget);
  }
  assert.ok(fish.activity.ageRealSeconds > 2.9 && fish.activity.ageRealSeconds < 3.1);
});

test("invalid targets and broad behavior changes reselect deterministic safe activities", () => {
  const state = createAquariumState({ orientation: "landscape", seed: 613 });
  const source = state.individuals[4];
  const missingPlant = {
    ...withBehavior(source, "explore"),
    activity: {
      ...createActivityState(ACTIVITIES.plantInvestigate),
      targetType: "plant",
      targetId: 0xffffffff,
    },
  };
  const invalid = tickFishActivity(missingPlant, 4, state, 0.1, { bubbles: [] });
  assert.notEqual(invalid.activity.targetId, 0xffffffff);
  assert.ok(invalid.target && Number.isFinite(invalid.target.x) && Number.isFinite(invalid.target.y));

  const nowResting = { ...missingPlant, behavior: { ...missingPlant.behavior, current: "rest" } };
  const changed = tickFishActivity(nowResting, 4, state, 0.1, { bubbles: [] });
  assert.ok([ACTIVITIES.openWaterRest, ACTIVITIES.plantShelter].includes(changed.activity.current));
});

test("completed plant visits return to open water before choosing vegetation again", () => {
  const base = createAquariumState({ orientation: "landscape", seed: 614 });
  const plant = base.plants.find((candidate) => candidate.matureHeight > 2);
  assert.ok(plant);
  for (const activity of [ACTIVITIES.plantInvestigate, ACTIVITIES.plantWeave]) {
    const fish = {
      ...withBehavior(base.individuals[4], "explore"),
      activity: {
        ...createActivityState(activity),
        ageRealSeconds: 40,
        targetType: "plant",
        targetId: plant.seed,
      },
    };
    const state = { ...base, individuals: base.individuals.map((value, index) => index === 4 ? fish : value) };
    const result = tickFishActivity(fish, 4, state, 0.1, { bubbles: [] });
    assert.equal(result.activity.current, ACTIVITIES.wander);
    assert.equal(result.activity.targetType, "waypoint");
  }
});

test("touch immediately overrides every major activity and remains deterministic", () => {
  const base = createAquariumState({ orientation: "landscape", seed: 771 });
  const kinds = [
    ACTIVITIES.bubbleInvestigate,
    ACTIVITIES.plantInvestigate,
    ACTIVITIES.companionCruise,
    ACTIVITIES.plantShelter,
    ACTIVITIES.schoolFollow,
    ACTIVITIES.wander,
  ];
  const prepared = {
    ...base,
    individuals: base.individuals.map((fish, index) => ({
      ...fish,
      activity: {
        ...createActivityState(kinds[index]),
        targetType: index === 0 ? "bubble" : index === 1 || index === 3 ? "plant" : index === 2 ? "fish" : "school",
        targetId: index === 2 ? base.individuals[0].seed : 1234,
      },
    })),
  };
  const first = applyTouch(prepared, 30, 8);
  const second = applyTouch(prepared, 30, 8);
  assert.deepEqual(first, second);
  for (let index = 0; index < first.individuals.length; index += 1) {
    const before = prepared.individuals[index];
    const fish = first.individuals[index];
    assert.equal(fish.activity.current, ACTIVITIES.touchReact);
    assert.equal(fish.activity.targetType, "touch");
    assert.ok(fish.vx * (30 - before.x) + fish.vy * (8 - before.y) > 0);
  }
});

test("glass affinity changes deterministic approach style without allowing refusal", () => {
  let lowSeed = null;
  let highSeed = null;
  for (let seed = 1; seed < 5000 && (lowSeed === null || highSeed === null); seed += 1) {
    const value = affinitiesFromSeed(seed).glass;
    if (value < 0.16) lowSeed = seed;
    if (value > 0.9) highSeed = seed;
  }
  assert.ok(lowSeed !== null && highSeed !== null);
  const base = createAquariumState({ orientation: "landscape", seed: 1010 });
  const template = { ...base.individuals[0], x: 12, y: 8 };
  const stateForSeed = (seed) => ({
    ...base,
    individuals: base.individuals.map((fish, index) => index === 0
      ? { ...template, seed, history: { ...template.history, socialMemory: [] } }
      : fish),
  });
  const low = applyTouch(stateForSeed(lowSeed), 30, 9).individuals[0];
  const high = applyTouch(stateForSeed(highSeed), 30, 9).individuals[0];
  assert.equal(low.activity.current, ACTIVITIES.touchReact);
  assert.equal(high.activity.current, ACTIVITIES.touchReact);
  assert.ok(Math.hypot(high.vx, high.vy) > Math.hypot(low.vx, low.vy));

  const lowTarget = tickFishActivity(low, 0, { ...stateForSeed(lowSeed), reaction: { x: 30, y: 9 } }, 0.1).target;
  const highTarget = tickFishActivity(high, 0, { ...stateForSeed(highSeed), reaction: { x: 30, y: 9 } }, 0.1).target;
  assert.ok(Math.hypot(highTarget.x - 30, highTarget.y - 9) < Math.hypot(lowTarget.x - 30, lowTarget.y - 9));
});

test("familiar energetic fish can select a brief bounded playful chase", () => {
  const base = createAquariumState({ orientation: "landscape", seed: 2020, wallClockHours: 12 });
  const targetSeed = base.individuals[1].seed;
  const fish = {
    ...withBehavior(base.individuals[0], "social"),
    drives: { ...base.individuals[0].drives, energy: 0.8 },
    history: {
      ...base.individuals[0].history,
      socialMemory: [{ seed: targetSeed, familiarity: 0.8 }],
    },
  };
  const traits = {
    ...traitsFromSeed(fish.seed, fish.history),
    activity: 0.9,
    sociability: 0.9,
  };
  let opportunity = null;
  for (let seconds = 0; seconds < 100; seconds += 0.5) {
    const state = {
      ...base,
      elapsedRealSeconds: seconds,
      individuals: base.individuals.map((value, index) => index === 0 ? fish : value),
    };
    const utilities = activityUtilities(fish, 0, state, { traits });
    if (Number.isFinite(utilities[ACTIVITIES.playfulChase])) {
      opportunity = { state, utilities };
      break;
    }
  }
  assert.ok(opportunity);
  const chasing = {
    ...fish,
    activity: {
      ...createActivityState(ACTIVITIES.playfulChase),
      targetType: "fish",
      targetId: targetSeed,
    },
  };
  let current = chasing;
  for (let frame = 0; frame < 90; frame += 1) {
    const state = {
      ...opportunity.state,
      elapsedRealSeconds: opportunity.state.elapsedRealSeconds + frame * 0.1,
      individuals: opportunity.state.individuals.map((value, index) => index === 0 ? current : value),
    };
    const result = tickFishActivity(current, 0, state, 0.1, { traits });
    current = { ...current, activity: result.activity };
  }
  assert.notEqual(current.activity.current, ACTIVITIES.playfulChase);
  assert.equal("health" in current, false);
  assert.equal("fear" in current, false);
});

test("activity timers remain real-time under week-per-second biology", () => {
  const base = withSettings(createAquariumState({ orientation: "portrait", seed: 998 }), { timeScale: 604800 });
  const fish = {
    ...withBehavior(base.individuals[0], "explore"),
    behavior: { current: "explore", previous: "cruise", blend: 0, ageSeconds: 0 },
    activity: {
      ...createActivityState(ACTIVITIES.wander),
      targetType: "waypoint",
      targetX: base.individuals[0].x + 2,
      targetY: base.individuals[0].y,
    },
  };
  const state = { ...base, individuals: base.individuals.map((value, index) => index === 0 ? fish : value) };
  const next = tick(state, 0.1).individuals[0];
  assert.ok(next.activity.ageRealSeconds >= 0.099 && next.activity.ageRealSeconds <= 0.101);
  assert.ok(next.behavior.ageSeconds > 60_000);
});

test("bubble crowding lowers utility without ownership locks", () => {
  const base = createAquariumState({ orientation: "landscape", seed: 717 });
  const fish = withBehavior(base.individuals[4], "explore");
  const bubble = manualBubble(fish);
  const alone = {
    ...base,
    individuals: base.individuals.map((value, index) => index === 4 ? fish : value),
  };
  const crowded = {
    ...alone,
    individuals: alone.individuals.map((value, index) => index < 3
      ? {
        ...value,
        activity: {
          ...createActivityState(ACTIVITIES.bubbleInvestigate),
          targetType: "bubble",
          targetId: bubble.id,
        },
      }
      : value),
  };
  const context = { affinities: affinities({ bubble: 0.9 }), bubbles: [bubble] };
  const aloneUtility = activityUtilities(fish, 4, alone, context)[ACTIVITIES.bubbleInvestigate];
  const crowdedUtility = activityUtilities(fish, 4, crowded, context)[ACTIVITIES.bubbleInvestigate];
  assert.ok(crowdedUtility < aloneUtility);
  assert.ok(Number.isFinite(crowdedUtility));
});

test("a valid live bubble target remains stable while its world position moves", () => {
  let base = createAquariumState({ orientation: "landscape", seed: 321, wallClockHours: 12 });
  let target = null;
  for (let frame = 0; frame < 1200 && !target; frame += 1) {
    const records = createBubbleWorldRecords(base);
    target = records.find((record) => record.phase === "rise" && record.progress < 0.7
      && ["stream", "isolated"].includes(record.kind));
    if (!target) base = { ...base, elapsedRealSeconds: base.elapsedRealSeconds + 0.1 };
  }
  assert.ok(target);
  const index = 4;
  const fish = {
    ...withBehavior(base.individuals[index], "explore"),
    activity: {
      ...createActivityState(ACTIVITIES.bubbleInvestigate),
      targetType: "bubble",
      targetId: target.id,
    },
  };
  const state = { ...base, individuals: base.individuals.map((value, i) => i === index ? fish : value) };
  const next = tick(state, 0.1).individuals[index];
  assert.equal(next.activity.current, ACTIVITIES.bubbleInvestigate);
  assert.equal(next.activity.targetId, target.id);
});

test("a starving fish suppresses company and curiosity but never its need to rest", () => {
  const state = createAquariumState({ orientation: "landscape", seed: 52, wallClockHours: 12 });
  const template = state.individuals[4];
  const traits = traitsFromSeed(template.seed, template.history);
  const withHunger = (hunger) => ({
    ...template,
    drives: { ...template.drives, hunger, energy: 0.5 },
    behavior: { ...template.behavior, current: "cruise" },
  });

  const comfortable = behaviorUtilities(withHunger(0.55), state, traits, true);
  const starving = behaviorUtilities(withHunger(DRIVE_MAXIMUM), state, traits, true);
  assert.ok(starving.social < comfortable.social);
  assert.ok(starving.explore < comfortable.explore);
  // Rest is exempt: a fish that cannot feed must still be able to settle rather
  // than swim itself to exhaustion.
  assert.ok(starving.rest >= comfortable.rest);

  // The mid-water cast can never reach the substrate, so hunger must not damp
  // it at all - suppressing its alternatives would only park it in rest. Its
  // explore utility still carries the plain hunger term every fish has, so the
  // comparison is against the same fish with damping applied.
  const ineligible = behaviorUtilities(withHunger(DRIVE_MAXIMUM), state, traits, false);
  assert.equal(ineligible.social, comfortable.social);
  assert.ok(ineligible.social > starving.social);
  assert.ok(ineligible.explore > starving.explore);
});

test("forage-eligible fish still feed once hunger reaches its ceiling", () => {
  // Regression guard: hunger stops rising at DRIVE_MAXIMUM, so a fish whose
  // saturated social drive permanently outbids forage stops eating for good.
  let state = withSettings(
    createAquariumState({ orientation: "landscape", seed: 5, wallClockHours: 12 }),
    { timeScale: 3600 },
  );
  const eligible = [3, 4, 5];
  const fed = new Map(eligible.map((index) => [index, false]));
  const starved = new Map(eligible.map((index) => [index, 0]));
  const steps = 14400;

  for (let step = 0; step < steps; step += 1) {
    state = tick(state, 0.1);
    for (const index of eligible) {
      const hunger = state.individuals[index].drives.hunger;
      if (hunger >= DRIVE_MAXIMUM - 1e-6) starved.set(index, starved.get(index) + 1);
      else if (hunger < DRIVE_MAXIMUM - 0.05) fed.set(index, true);
    }
  }

  for (const index of eligible) {
    assert.ok(fed.get(index), `fish ${index} never fed across 60 simulated days`);
    const pinned = starved.get(index) / steps;
    assert.ok(pinned < 0.6, `fish ${index} sat at maximum hunger for ${(pinned * 100).toFixed(1)}% of the run`);
  }
});
