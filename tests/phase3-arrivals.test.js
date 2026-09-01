// Phase 3: new fish arrive over months, enter from a water edge, and are
// ordinary Phase 2 individuals from their first frame.
import assert from "node:assert/strict";
import test from "node:test";

import {
  INITIAL_INDIVIDUAL_COUNT,
  MAX_INDIVIDUALS,
  advanceAquariumHistory,
  contentSchedule,
} from "../src/sim/aquarium-history.js";
import { WATERLINE_ROWS } from "../src/sim/config.js";
import { individualSeedFor, traitsFromSeed } from "../src/sim/entities.js";
import { fishSpriteWidth } from "../src/sim/fish-growth.js";
import {
  ACTIVITIES,
  activityUtilities,
  selectActivity,
  tickFishActivity,
} from "../src/sim/fish-activities.js";
import {
  MAX_FISH_PITCH_DEGREES,
  forageActivity,
  forageEligible,
  substrateSafeY,
  surfaceSafeY,
} from "../src/sim/fish-motion.js";
import {
  MAX_SOCIAL_MEMORY,
  affinitiesFromSeed,
  pairCompatibility,
  sanitizeSocialMemory,
  updateSocialMemories,
} from "../src/sim/fish-personality.js";
import { applyTouch, createAquariumState, withSettings } from "../src/sim/state.js";
import { behaviorUtilities, tick } from "../src/sim/tick.js";

const SEED = 0xa51c0a7e;

function atDay(day, { orientation = "landscape", seed = SEED } = {}) {
  return advanceAquariumHistory(createAquariumState({ orientation, seed }), day);
}

// An arrival hatches as a fry, so it is bounded by the artwork it is drawn
// from now rather than by the adult it grows into.
function halfWidth(fish) {
  return fishSpriteWidth(fish) / 2;
}

test("the aquarium grows from six to eight persistent fish and stops", () => {
  for (const orientation of ["landscape", "portrait"]) {
    for (const seed of [SEED, 5, 77, 4242]) {
      const schedule = contentSchedule(seed).filter((milestone) => milestone.type === "fish-arrival");
      const before = atDay(schedule[0].day - 0.5, { orientation, seed });
      assert.equal(before.individuals.length, INITIAL_INDIVIDUAL_COUNT);

      const afterFirst = atDay(schedule[0].day + 0.5, { orientation, seed });
      assert.equal(afterFirst.individuals.length, INITIAL_INDIVIDUAL_COUNT + 1);

      const betweenArrivals = atDay(schedule[1].day - 0.5, { orientation, seed });
      assert.equal(betweenArrivals.individuals.length, INITIAL_INDIVIDUAL_COUNT + 1);

      const afterSecond = atDay(schedule[1].day + 0.5, { orientation, seed });
      assert.equal(afterSecond.individuals.length, MAX_INDIVIDUALS);

      const distantFuture = atDay(2000, { orientation, seed });
      assert.equal(distantFuture.individuals.length, MAX_INDIVIDUALS);
      assert.equal(new Set(distantFuture.individuals.map((fish) => fish.seed)).size, MAX_INDIVIDUALS);
    }
  }
});

test("a fresh aquarium still begins with exactly the current six individuals", () => {
  for (const orientation of ["landscape", "portrait"]) {
    for (const seed of [SEED, 991, 12]) {
      const state = createAquariumState({ orientation, seed });
      assert.equal(state.individuals.length, INITIAL_INDIVIDUAL_COUNT);
      state.individuals.forEach((fish, index) => {
        assert.equal(fish.seed, individualSeedFor(seed, index), "Phase 3 rerolled an existing fish");
      });
    }
  }
});

test("arrival identity is stable, unique, and the same in both orientations", () => {
  for (const seed of [SEED, 5, 77, 4242, 100003]) {
    const schedule = contentSchedule(seed).filter((milestone) => milestone.type === "fish-arrival");
    const landscape = atDay(200, { orientation: "landscape", seed }).individuals.map((fish) => fish.seed);
    const portrait = atDay(200, { orientation: "portrait", seed }).individuals.map((fish) => fish.seed);
    assert.deepEqual(landscape, portrait);
    assert.deepEqual(landscape.slice(INITIAL_INDIVIDUAL_COUNT), schedule.map((milestone) => milestone.fishSeed));
    assert.equal(new Set(landscape).size, landscape.length);
    // Repeating the run reaches the same cast.
    assert.deepEqual(atDay(200, { orientation: "landscape", seed }).individuals.map((fish) => fish.seed), landscape);
  }
});

test("arrivals enter from a safe water edge with inward velocity", () => {
  for (const orientation of ["landscape", "portrait"]) {
    for (const seed of [SEED, 5, 77, 4242, 100003, 8]) {
      const schedule = contentSchedule(seed).filter((milestone) => milestone.type === "fish-arrival");
      for (let ordinal = 0; ordinal < schedule.length; ordinal += 1) {
        const state = atDay(schedule[ordinal].day + 0.01, { orientation, seed });
        const fish = state.individuals.at(-1);
        const width = halfWidth(fish);
        assert.equal(fish.seed, schedule[ordinal].fishSeed);
        assert.ok(fish.x >= width - 1e-9 && fish.x <= state.cols - width + 1e-9, "arrival spawned out of bounds");
        // Near an edge, not popped into the middle of the tank.
        const fromEdge = Math.min(fish.x - width, (state.cols - width) - fish.x);
        assert.ok(fromEdge < 0.6, `arrival appeared ${fromEdge} columns from either edge`);
        // Swimming inward.
        assert.ok(fish.x < state.cols / 2 ? fish.vx > 0 : fish.vx < 0, "arrival swims out of the tank");
        assert.ok(Math.abs(fish.vx) > 0.1);
        // Real clearance from the moving surface and the terrain.
        assert.ok(fish.y >= surfaceSafeY(fish, state, fish.x) - 0.35);
        assert.ok(fish.y <= substrateSafeY(fish, state, fish.x) + 0.35);
        assert.ok(fish.y > WATERLINE_ROWS - 1);
        // A valid transient entry state that the ordinary systems understand.
        assert.equal(fish.activity.current, ACTIVITIES.arrivalEnter);
        assert.equal(fish.behavior.current, "explore");
        assert.ok(Number.isFinite(fish.activity.targetX) && Number.isFinite(fish.activity.targetY));
        assert.equal(fish.visual.pitch, 0);
        assert.ok(Math.abs(fish.visual.targetPitch) <= MAX_FISH_PITCH_DEGREES);
        assert.deepEqual(fish.history.socialMemory, []);
        assert.equal(fish.history.touches, 0);
        assert.equal(fish.history.boldnessDrift, 0);
        assert.equal(fish.history.sociabilityDrift, 0);
      }
    }
  }
});

test("two overdue arrivals resolved at once do not stack on top of each other", () => {
  for (const orientation of ["landscape", "portrait"]) {
    for (const seed of [SEED, 5, 77, 4242, 100003, 8, 313]) {
      // One jump past both windows: migration, a huge accelerated leap, and a
      // long offline gap all take this path.
      const state = atDay(400, { orientation, seed });
      const [first, second] = state.individuals.slice(INITIAL_INDIVIDUAL_COUNT);
      assert.ok(first && second);
      assert.ok(Math.abs(first.x - second.x) > 4, "both arrivals entered from the same place");
      assert.ok(Math.sign(first.vx) !== Math.sign(second.vx), "both arrivals share one entry direction");
      assert.notEqual(first.seed, second.seed);
    }
  }
});

test("an arrival is a full Phase 2 individual, not a simplified newcomer", () => {
  const state = atDay(400, { orientation: "landscape", seed: SEED });
  const index = state.individuals.length - 1;
  const fish = state.individuals[index];

  const affinities = affinitiesFromSeed(fish.seed);
  assert.equal(Object.values(affinities).every((value) => value > 0 && value < 1), true);
  const traits = traitsFromSeed(fish.seed, fish.history);
  assert.ok(Object.values(traits).every(Number.isFinite));

  const utilities = behaviorUtilities(fish, state, traits, forageEligible(index));
  assert.ok(Object.values(utilities).every(Number.isFinite));
  assert.ok(forageEligible(index), "a late arrival should be able to forage like the other later fish");
  assert.ok(Number.isFinite(forageActivity(fish, index, state).peck));

  const activity = selectActivity(fish, index, state, { traits, affinities, bubbles: [] });
  assert.ok(Number.isFinite(activityUtilities(fish, index, state, { traits, affinities, bubbles: [] })[activity.current] ?? 1));
  const frame = tickFishActivity(fish, index, state, 0.1, { traits, affinities, bubbles: [], school: state.school });
  assert.ok(frame.target && Number.isFinite(frame.target.x) && Number.isFinite(frame.target.y));

  // Pair compatibility exists immediately; familiarity does not.
  for (const other of state.individuals) {
    if (other.seed === fish.seed) continue;
    assert.ok(pairCompatibility(fish.seed, other.seed) > 0);
  }
  assert.deepEqual(sanitizeSocialMemory(fish.history.socialMemory, fish.seed), []);

  // Touch still works on the newcomer.
  const touched = applyTouch(state, fish.x, fish.y);
  assert.equal(touched.individuals.length, state.individuals.length);
  assert.equal(touched.individuals.reduce((sum, member) => sum + member.history.touches, 0), 1);
});

test("existing relationships survive an arrival without gaining fake familiarity", () => {
  const schedule = contentSchedule(SEED).filter((milestone) => milestone.type === "fish-arrival");
  const before = atDay(schedule[0].day - 0.5);
  const seeded = {
    ...before,
    individuals: before.individuals.map((fish, index) => (index < 2
      ? {
        ...fish,
        history: {
          ...fish.history,
          touches: 3,
          socialMemory: [{ seed: before.individuals[index === 0 ? 1 : 0].seed, familiarity: 0.42 }],
        },
      }
      : fish)),
  };
  const after = advanceAquariumHistory(seeded, 1);
  assert.equal(after.individuals.length, before.individuals.length + 1);
  for (let index = 0; index < before.individuals.length; index += 1) {
    assert.deepEqual(after.individuals[index].history, seeded.individuals[index].history);
  }
  const newcomer = after.individuals.at(-1);
  assert.deepEqual(newcomer.history.socialMemory, []);

  // The sanitation pass simply recognises that another valid seed now exists.
  const normalized = updateSocialMemories(after.individuals, 0);
  assert.deepEqual(normalized[0].history.socialMemory, seeded.individuals[0].history.socialMemory);
  assert.ok(normalized.every((fish) => fish.history.socialMemory.length <= MAX_SOCIAL_MEMORY));
  assert.ok(normalized.every((fish) => fish.history.socialMemory.every((entry) => entry.seed !== fish.seed)));
});

test("an arrival swims in and then joins the ordinary activity system", () => {
  let state = withSettings(
    advanceAquariumHistory(createAquariumState({ orientation: "landscape", seed: SEED, wallClockHours: 12 }), 13.5),
    { timeScale: 1 },
  );
  assert.equal(state.individuals.length, INITIAL_INDIVIDUAL_COUNT + 1);
  const startX = state.individuals.at(-1).x;
  const startSide = startX < state.cols / 2 ? -1 : 1;

  const seen = new Set();
  for (let frame = 0; frame < 400; frame += 1) {
    state = tick(state, 0.1);
    seen.add(state.individuals.at(-1).activity.current);
  }
  const fish = state.individuals.at(-1);
  assert.ok(seen.has(ACTIVITIES.arrivalEnter), "the entry swim never happened");
  assert.ok(seen.size > 1, "the arrival never left its entry activity");
  assert.ok(startSide < 0 ? fish.x > startX : fish.x < startX, "the arrival never swam inward");
  assert.ok(Number.isFinite(fish.visual.pitch) && Math.abs(fish.visual.pitch) <= MAX_FISH_PITCH_DEGREES);
});

test("arrivals do not join the protected mid-water trio", () => {
  let state = withSettings(atDay(400, { orientation: "landscape", seed: SEED }), { timeScale: 3600 });
  for (let frame = 0; frame < 600; frame += 1) state = tick(state, 0.1);
  const ceiling = WATERLINE_ROWS + (state.rows - 6) * 0.68;
  assert.ok(state.individuals.slice(0, 3).every((fish) => fish.y < ceiling));
  assert.ok(state.individuals.slice(INITIAL_INDIVIDUAL_COUNT).every((_, offset) =>
    forageEligible(INITIAL_INDIVIDUAL_COUNT + offset)));
});
