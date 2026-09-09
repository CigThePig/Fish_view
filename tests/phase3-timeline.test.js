// Phase 3: the deterministic long-horizon schedule and the shared interval
// resolver that turns simulated aquarium age into discrete historical events.
import assert from "node:assert/strict";
import test from "node:test";

import { RARE_PLANT_IDS } from "../src/art/plants.js";
import {
  ARRIVAL_INTERVAL_DAYS,
  CONTENT_VERSION,
  INITIAL_INDIVIDUAL_COUNT,
  MAX_INDIVIDUALS,
  PROPAGATION_EPOCH_DAYS,
  RARE_EMERGENCE_WINDOW_DAYS,
  advanceAquariumHistory,
  contentSchedule,
  createContentState,
  historyDiagnostics,
  migrateContent,
  sanitizeContent,
} from "../src/sim/aquarium-history.js";
import { ROSTER_SIZE, aquariumRoster } from "../src/sim/fish-roster.js";
import { plantCapFor } from "../src/sim/plants.js";
import { advanceOffline, createAquariumState, withSettings } from "../src/sim/state.js";
import { tick } from "../src/sim/tick.js";

const SEEDS = Array.from({ length: 80 }, (_, index) => index * 7717 + 3);

function milestonesOfType(seed, type) {
  return contentSchedule(seed).filter((milestone) => milestone.type === type);
}

// The persistent projection of an aquarium's history. Fish positions and
// transient intentions are deliberately excluded: offline advancement never
// replays locomotion, so only the durable roster has to agree between step
// sizes.
function historyProjection(state) {
  return {
    totalDays: Number(state.totalDays.toFixed(6)),
    content: state.content,
    individuals: state.individuals.map((fish) => fish.seed),
    plants: state.plants.map((plant) => ({
      seed: plant.seed,
      speciesId: plant.speciesId,
      x: Number(plant.x.toFixed(9)),
      layer: plant.layer,
      matureHeight: Number(plant.matureHeight.toFixed(9)),
      ageDays: Number(plant.ageDays.toFixed(5)),
    })),
  };
}

function advanceInSteps(state, targetDay, stepDays) {
  let result = state;
  while (result.totalDays < targetDay - 1e-9) {
    const step = Math.min(stepDays, targetDay - result.totalDays);
    result = advanceAquariumHistory(result, step);
  }
  return result;
}

test("one-time milestone schedules are deterministic, ordered, and inside their windows", () => {
  for (const seed of SEEDS) {
    const schedule = contentSchedule(seed);
    assert.deepEqual(schedule, contentSchedule(seed), `schedule for ${seed} is not stable`);
    const expectedArrivals = ROSTER_SIZE - INITIAL_INDIVIDUAL_COUNT;
    assert.equal(schedule.length, expectedArrivals + RARE_EMERGENCE_WINDOW_DAYS.length);
    assert.equal(new Set(schedule.map((milestone) => milestone.id)).size, schedule.length);

    const arrivals = milestonesOfType(seed, "fish-arrival");
    const emergences = milestonesOfType(seed, "rare-emergence");
    assert.equal(arrivals.length, expectedArrivals);
    arrivals.forEach((milestone, ordinal) => {
      // A fixed fortnightly calendar, not a seeded window: what a seed decides
      // is which fish arrives, never whether one does.
      assert.equal(milestone.day, (ordinal + INITIAL_INDIVIDUAL_COUNT) * ARRIVAL_INTERVAL_DAYS);
    });
    emergences.forEach((milestone, ordinal) => {
      const [minimum, maximum] = RARE_EMERGENCE_WINDOW_DAYS[ordinal];
      assert.ok(milestone.day >= minimum && milestone.day <= maximum);
      assert.ok(RARE_PLANT_IDS.includes(milestone.speciesId), "emergence drew a non-rare species");
    });

    // No arrival immediately after creation, and no two arrivals share a day.
    assert.ok(arrivals[0].day >= ARRIVAL_INTERVAL_DAYS);
    assert.equal(new Set(arrivals.map((milestone) => milestone.day)).size, arrivals.length);

    // Arrival identity is a pure function of the aquarium seed and the roster
    // slot, and can never collide with the fish the aquarium was founded on.
    const cast = aquariumRoster(seed).slice(0, INITIAL_INDIVIDUAL_COUNT).map((entry) => entry.seed);
    const arrivalSeeds = arrivals.map((milestone) => milestone.fishSeed);
    assert.equal(new Set([...cast, ...arrivalSeeds]).size, cast.length + arrivalSeeds.length);
    for (const value of [...arrivalSeeds, ...emergences.map((milestone) => milestone.plantSeed)]) {
      assert.ok(Number.isSafeInteger(value) && value >= 0 && value <= 0xffffffff);
    }
  }
});


test("history advancement is step-size invariant", () => {
  {

    for (const seed of [3, 91, 2024, 0xa51c0a7e]) {
      const base = createAquariumState({ seed });
      const fine = advanceInSteps(base, 180, 1);
      const medium = advanceInSteps(base, 180, 7);
      const coarse = advanceAquariumHistory(base, 180);

      const reference = historyProjection(coarse);
      for (const [name, candidate] of [["fine", fine], ["medium", medium]]) {
        const projection = historyProjection(candidate);
        assert.deepEqual(
          { ...projection, plants: projection.plants.map(({ ageDays: _age, ...rest }) => rest) },
          { ...reference, plants: reference.plants.map(({ ageDays: _age, ...rest }) => rest) },
          `${name} advancement produced a different landscape aquarium at day 180`,
        );
        // Ages accumulate in floating point, so they are compared with a
        // tolerance rather than for bit equality. Nothing downstream reads them
        // more finely than a growth stage.
        projection.plants.forEach((plant, index) => {
          assert.ok(
            Math.abs(plant.ageDays - reference.plants[index].ageDays) < 1e-4,
            `${name} plant ${plant.seed} aged differently`,
          );
        });
      }
    }
  }
});

test("advancement is chronological rather than evaluated against the final age", () => {
  // A shoot that appears in the middle of a large jump matures inside that same
  // jump and may take part in a later epoch. Evaluating every propagation
  // opportunity against the end-state age would instead let a plant reproduce
  // before it had actually matured.
  const base = createAquariumState({ seed: 4242 });
  const single = advanceAquariumHistory(base, 300);
  const stepped = advanceInSteps(base, 300, 3);
  assert.deepEqual(
    single.plants.map((plant) => [plant.seed, plant.speciesId]),
    stepped.plants.map((plant) => [plant.seed, plant.speciesId]),
  );
  const original = new Set(base.plants.map((plant) => plant.seed));
  const grown = single.plants.filter((plant) => !original.has(plant.seed));
  assert.ok(grown.length >= 2, "300 days produced almost no new vegetation");
  // Later generations exist: at least one new plant is much younger than the
  // first one that appeared.
  const ages = grown.map((plant) => plant.ageDays).sort((left, right) => right - left);
  assert.ok(ages[0] - ages.at(-1) > 40, "every new plant appeared at the same time");
});

test("crossed boundaries resolve exactly once at any frame granularity", () => {
  const targets = [30, 90, 180, 365];
  for (const target of targets) {
    const base = createAquariumState({ seed: 55 });
    const reference = advanceAquariumHistory(base, target);
    // A single frame at maximum debug acceleration skips several calendar
    // boundaries; every one of them still has to resolve.
    const leaps = advanceInSteps(base, target, 1.75);
    assert.equal(leaps.individuals.length, reference.individuals.length);
    assert.deepEqual(
      leaps.plants.map((plant) => plant.seed).sort(),
      reference.plants.map((plant) => plant.seed).sort(),
    );
    assert.equal(new Set(leaps.plants.map((plant) => plant.seed)).size, leaps.plants.length);
    assert.equal(new Set(leaps.individuals.map((fish) => fish.seed)).size, leaps.individuals.length);
  }
});

test("resolving the same interval twice adds nothing", () => {
  let state = advanceAquariumHistory(createAquariumState({ seed: 808 }), 200);
  const before = historyProjection(state);
  for (let repeat = 0; repeat < 5; repeat += 1) state = advanceAquariumHistory(state, 0);
  const after = historyProjection(state);
  assert.deepEqual(after.individuals, before.individuals);
  assert.deepEqual(after.plants, before.plants);
  assert.deepEqual(after.content, before.content);
});

test("live accelerated ticks cross the same boundaries as offline advancement", () => {
  const seed = 20260831;
  let live = withSettings(
    createAquariumState({ seed, wallClockHours: 12 }),
    { timeScale: 86400 },
  );
  for (let frame = 0; frame < 900; frame += 1) live = tick(live, 0.1);
  const offline = advanceOffline(createAquariumState({ seed, wallClockHours: 12 }), 90 * 86400);

  assert.ok(Math.abs(live.totalDays - offline.totalDays) < 1e-6);
  // Positions and transient activity legitimately differ; the persistent
  // history must not.
  assert.deepEqual(
    live.individuals.map((fish) => fish.seed),
    offline.individuals.map((fish) => fish.seed),
  );
  assert.deepEqual(
    live.plants.map((plant) => [plant.seed, plant.speciesId]),
    offline.plants.map((plant) => [plant.seed, plant.speciesId]),
  );
  assert.equal(live.content.milestones, offline.content.milestones);
  assert.equal(live.content.propagationEpoch, offline.content.propagationEpoch);
});

test("long-horizon content stays bounded for years without an event log", () => {
  {

    for (const seed of [11, 4096, 0xa51c0a7e]) {
      let state = createAquariumState({ seed });
      for (const day of [30, 90, 180, 365, 730]) {
        state = advanceAquariumHistory(state, day - state.totalDays);
        assert.ok(state.individuals.length <= MAX_INDIVIDUALS, `cast exceeded its ceiling at day ${day}`);
        assert.ok(state.plants.length <= plantCapFor(), `garden exceeded its cap at day ${day}`);
        assert.equal(new Set(state.plants.map((plant) => plant.seed)).size, state.plants.length);
        assert.equal(new Set(state.individuals.map((fish) => fish.seed)).size, state.individuals.length);
        assert.ok(state.plants.every((plant) => Number.isFinite(plant.x) && Number.isFinite(plant.ageDays)));
        assert.ok(state.plants.every((plant) => plant.x > 0 && plant.x < state.cols));
        // The whole persisted history record is three numbers, whatever the age.
        assert.deepEqual(Object.keys(state.content).sort(), ["milestones", "propagationEpoch", "version"]);
        // One bit per scheduled milestone and not one more, however old the
        // aquarium gets: the cursor is bounded by the schedule, not by age.
        assert.ok(state.content.milestones < 2 ** contentSchedule(seed).length);
      }
      // Nothing disappears through age.
      const original = createAquariumState({ seed });
      for (const plant of original.plants) {
        assert.ok(state.plants.some((candidate) => candidate.seed === plant.seed));
      }
      for (const fish of original.individuals) {
        assert.ok(state.individuals.some((candidate) => candidate.seed === fish.seed));
      }
    }
  }
});

test("corrupt historical bookkeeping is clamped rather than trusted", () => {
  const seed = 616;
  const corrupt = [
    null,
    undefined,
    "content",
    { version: 99, propagationEpoch: 4, milestones: 3 },
    { version: CONTENT_VERSION, propagationEpoch: Number.NaN, milestones: Number.POSITIVE_INFINITY },
    { version: CONTENT_VERSION, propagationEpoch: -50_000, milestones: -7 },
    { version: CONTENT_VERSION, propagationEpoch: 1e30, milestones: 0xffffffff },
  ];
  for (const value of corrupt) {
    const content = sanitizeContent(value, { totalDays: 40, seed });
    assert.equal(content.version, CONTENT_VERSION);
    assert.ok(Number.isSafeInteger(content.propagationEpoch) && content.propagationEpoch >= 0);
    assert.ok(content.propagationEpoch <= 1e7);
    assert.ok(content.milestones >= 0 && content.milestones < 2 ** contentSchedule(seed).length);
  }

  // A cursor left absurdly far in the past must not loop millions of epochs or
  // spawn thousands of plants.
  const base = createAquariumState({ seed });
  const started = Date.now();
  const advanced = advanceAquariumHistory(
    { ...base, totalDays: 500, content: { version: CONTENT_VERSION, propagationEpoch: 0, milestones: 0 } },
    10,
  );
  assert.ok(Date.now() - started < 4000, "a stale cursor made advancement expensive");
  assert.ok(advanced.plants.length <= plantCapFor());
  assert.ok(advanced.individuals.length <= MAX_INDIVIDUALS);
});

test("a fresh content cursor and a migrated one describe the same bookkeeping shape", () => {
  const fresh = createContentState();
  assert.deepEqual(fresh, { version: CONTENT_VERSION, propagationEpoch: 0, milestones: 0 });
  const migrated = migrateContent(180);
  assert.equal(migrated.version, CONTENT_VERSION);
  assert.equal(migrated.propagationEpoch, Math.floor(180 / PROPAGATION_EPOCH_DAYS));
  assert.equal(migrated.milestones, 0);
});

test("developer diagnostics describe history without the aquarium showing it", () => {
  const state = advanceOffline(createAquariumState({ seed: 909 }), 120 * 86400);
  const diagnostics = historyDiagnostics(state);
  assert.equal(diagnostics.individualCap, MAX_INDIVIDUALS);
  assert.equal(diagnostics.plantCap, plantCapFor());
  assert.equal(diagnostics.milestones.length, contentSchedule(909).length);
  assert.ok(diagnostics.milestones.every((milestone) => Number.isFinite(milestone.day)));
  assert.equal(diagnostics.arrivedSeeds.length, state.individuals.length - INITIAL_INDIVIDUAL_COUNT);
  assert.ok(diagnostics.grownPlantCount >= 0);
});
