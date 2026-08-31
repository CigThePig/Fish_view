// TEMPORARY diagnostic test for the Phase 2 personality/relationship work.
// It drives several months of simulation time through tick() and checks that
// (a) nothing degenerates over that span and (b) repeating the identical run
// produces byte-identical state every time. Delete once the question is
// answered; it is slower than the regular suite by design.
//
// It asserts only what should always hold (finite state, clamped drives,
// bounded memory, in-tank positions, byte-identical repeats). The drive
// saturation and behaviour-mix numbers it prints are diagnostics, not
// assertions: they describe how the cast settles after months rather than
// defining a contract.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { SUBSTRATE_ROWS, WATERLINE_ROWS } from "../src/sim/config.js";
import { MAX_FISH_PITCH_DEGREES } from "../src/sim/fish-motion.js";
import { ACTIVITIES, BEHAVIORS } from "../src/sim/fish-activities.js";
import { MAX_SOCIAL_MEMORY } from "../src/sim/fish-personality.js";
import { MAX_INDIVIDUALS, contentSchedule } from "../src/sim/aquarium-history.js";
import { plantCapFor } from "../src/sim/plants.js";
import {
  applyTouch,
  createAquariumState,
  restorePersistentState,
  serializePersistentState,
  withSettings,
} from "../src/sim/state.js";
import { tick } from "../src/sim/tick.js";
import { render } from "../src/render/render.js";

const ACTIVITY_NAMES = new Set(Object.values(ACTIVITIES));
const DAY_SECONDS = 86400;

const SCENARIOS = [
  {
    // ~180 sim days at an hour of biology per real second: the long, fine
    // grained run where drives, behaviour switching and drift all accumulate.
    name: "6 months at 1h/s (fine steps)",
    orientation: "landscape",
    seed: 0xa51c0a7e,
    wallClockHours: 12,
    timeScale: 3600,
    dt: 0.1,
    ticks: 43200,
    sampleEvery: 240,
    touchEvery: 6000,
  },
  {
    // Same span reached in day-sized leaps: exercises the coarse-delta path
    // where a single tick advances hours of hunger/energy at once.
    name: "6 months at 1d/s (coarse steps)",
    orientation: "portrait",
    seed: 987654,
    wallClockHours: 3.5,
    timeScale: DAY_SECONDS,
    dt: 0.1,
    ticks: 1800,
    sampleEvery: 10,
    touchEvery: 250,
  },
  {
    // The maximum configurable time scale with the maximum accepted frame
    // delta: ~1.75 sim days per tick, the worst case the clamps must survive.
    name: "6 months at max timeScale",
    orientation: "landscape",
    seed: 31337,
    wallClockHours: 21,
    timeScale: 604800,
    dt: 0.25,
    ticks: 104,
    sampleEvery: 1,
    touchEvery: 25,
  },
];

function nonFiniteNumbers(value, path = "state", found = []) {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) found.push(`${path}=${value}`);
    return found;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => nonFiniteNumbers(entry, `${path}[${index}]`, found));
    return found;
  }
  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) nonFiniteNumbers(entry, `${path}.${key}`, found);
  }
  return found;
}

// Phase 3 lets the persistent cast grow from six to eight over an aquarium's
// first months, so per-fish accumulators are keyed by stable seed rather than by
// array position: a fish that arrives on simulated day 60 must not shift the
// records of the fish that were already here.
function fishRecord() {
  return {
    behaviors: new Set(),
    activities: new Set(),
    distance: 0,
    hungerPinnedFromDay: null,
    hungerPinnedSamples: 0,
    samples: 0,
    firstSeenDay: null,
  };
}

function createObservation(state) {
  return {
    violations: [],
    behaviorCounts: Object.fromEntries(BEHAVIORS.map((behavior) => [behavior, 0])),
    activityCounts: {},
    perFish: new Map(state.individuals.map((fish) => [fish.seed, fishRecord()])),
    samples: 0,
    fishSamples: 0,
    maxIndividuals: state.individuals.length,
    maxPlants: state.plants.length,
    driveAtFloor: { hunger: 0, energy: 0, social: 0 },
    driveAtCeiling: { hunger: 0, energy: 0, social: 0 },
    arrivalOrder: [],
    minY: Number.POSITIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
    minSchoolY: Number.POSITIVE_INFINITY,
    maxSchoolY: Number.NEGATIVE_INFINITY,
    maxSpeed: 0,
    maxFamiliarity: 0,
  };
}

function observe(observation, state, previous, scenario) {
  const water = { top: WATERLINE_ROWS, bottom: state.rows - SUBSTRATE_ROWS };
  const castSeeds = new Set(state.individuals.map((fish) => fish.seed >>> 0));
  const previousBySeed = new Map(previous.individuals.map((fish) => [fish.seed, fish]));

  observation.maxIndividuals = Math.max(observation.maxIndividuals, state.individuals.length);
  observation.maxPlants = Math.max(observation.maxPlants, state.plants.length);
  if (state.individuals.length > MAX_INDIVIDUALS) {
    observation.violations.push(`${scenario.name}: cast grew to ${state.individuals.length} individuals`);
  }
  if (state.plants.length > plantCapFor(state.orientation)) {
    observation.violations.push(`${scenario.name}: garden grew to ${state.plants.length} plants`);
  }
  if (castSeeds.size !== state.individuals.length) {
    observation.violations.push(`${scenario.name}: duplicate fish seed in the cast`);
  }
  if (new Set(state.plants.map((plant) => plant.seed)).size !== state.plants.length) {
    observation.violations.push(`${scenario.name}: duplicate plant seed in the garden`);
  }

  state.individuals.forEach((fish, index) => {
    let record = observation.perFish.get(fish.seed);
    if (!record) {
      record = fishRecord();
      record.firstSeenDay = state.totalDays;
      observation.perFish.set(fish.seed, record);
      observation.arrivalOrder.push({ seed: fish.seed, index, day: state.totalDays });
    }
    const before = previousBySeed.get(fish.seed);
    if (before) record.distance += Math.hypot(fish.x - before.x, fish.y - before.y);

    if (!(fish.x >= 0 && fish.x <= state.cols)) {
      observation.violations.push(`${scenario.name}: fish ${index} x=${fish.x} outside [0, ${state.cols}]`);
    }
    if (!(fish.y >= water.top - 1 && fish.y <= water.bottom + 1)) {
      observation.violations.push(`${scenario.name}: fish ${index} y=${fish.y} outside water column`);
    }
    for (const [key, value] of Object.entries(fish.drives)) {
      if (!(value >= 0.15 - 1e-9 && value <= 0.85 + 1e-9)) {
        observation.violations.push(`${scenario.name}: fish ${index} drive ${key}=${value} outside [0.15, 0.85]`);
      }
      if (value <= 0.15 + 1e-6) observation.driveAtFloor[key] += 1;
      if (value >= 0.85 - 1e-6) observation.driveAtCeiling[key] += 1;
    }
    if (fish.drives.hunger >= 0.85 - 1e-6) {
      record.hungerPinnedSamples += 1;
      if (record.hungerPinnedFromDay === null) record.hungerPinnedFromDay = state.totalDays;
    } else {
      record.hungerPinnedFromDay = null;
    }
    if (!BEHAVIORS.includes(fish.behavior.current)) {
      observation.violations.push(`${scenario.name}: fish ${index} unknown behavior ${fish.behavior.current}`);
    }
    if (!ACTIVITY_NAMES.has(fish.activity.current)) {
      observation.violations.push(`${scenario.name}: fish ${index} unknown activity ${fish.activity.current}`);
    }
    if (Math.abs(fish.visual.pitch) > MAX_FISH_PITCH_DEGREES + 1e-9) {
      observation.violations.push(`${scenario.name}: fish ${index} pitch ${fish.visual.pitch} exceeds limit`);
    }
    if (!(fish.history.boldnessDrift >= 0 && fish.history.boldnessDrift <= 0.18 + 1e-9)) {
      observation.violations.push(`${scenario.name}: fish ${index} boldnessDrift ${fish.history.boldnessDrift} unbounded`);
    }
    if (!(fish.history.sociabilityDrift >= 0 && fish.history.sociabilityDrift <= 0.12 + 1e-9)) {
      observation.violations.push(`${scenario.name}: fish ${index} sociabilityDrift ${fish.history.sociabilityDrift} unbounded`);
    }

    const memory = fish.history.socialMemory;
    if (memory.length > MAX_SOCIAL_MEMORY) {
      observation.violations.push(`${scenario.name}: fish ${index} social memory grew to ${memory.length}`);
    }
    const seen = new Set();
    for (const entry of memory) {
      if (entry.seed === fish.seed) {
        observation.violations.push(`${scenario.name}: fish ${index} remembers itself`);
      }
      if (!castSeeds.has(entry.seed)) {
        observation.violations.push(`${scenario.name}: fish ${index} remembers unknown seed ${entry.seed}`);
      }
      if (seen.has(entry.seed)) {
        observation.violations.push(`${scenario.name}: fish ${index} has duplicate memory of ${entry.seed}`);
      }
      seen.add(entry.seed);
      if (!(entry.familiarity >= 0 && entry.familiarity <= 1)) {
        observation.violations.push(`${scenario.name}: fish ${index} familiarity ${entry.familiarity} outside [0, 1]`);
      }
      observation.maxFamiliarity = Math.max(observation.maxFamiliarity, entry.familiarity);
    }

    observation.behaviorCounts[fish.behavior.current] += 1;
    observation.activityCounts[fish.activity.current] = (observation.activityCounts[fish.activity.current] ?? 0) + 1;
    record.behaviors.add(fish.behavior.current);
    record.activities.add(fish.activity.current);
    record.samples += 1;
    observation.fishSamples += 1;
    observation.minY = Math.min(observation.minY, fish.y);
    observation.maxY = Math.max(observation.maxY, fish.y);
    observation.maxSpeed = Math.max(observation.maxSpeed, Math.hypot(fish.vx, fish.vy));
  });

  for (const fish of state.school) {
    if (!(fish.x >= -0.5 && fish.x <= state.cols + 0.5)) {
      observation.violations.push(`${scenario.name}: school fish x=${fish.x} outside tank`);
    }
    observation.minSchoolY = Math.min(observation.minSchoolY, fish.y);
    observation.maxSchoolY = Math.max(observation.maxSchoolY, fish.y);
  }

  observation.samples += 1;
}

function runScenario(scenario) {
  const base = createAquariumState({
    orientation: scenario.orientation,
    seed: scenario.seed,
    wallClockHours: scenario.wallClockHours,
  });
  let state = withSettings(base, { timeScale: scenario.timeScale });
  const startPlantAge = new Map(state.plants.map((plant) => [plant.seed, plant.ageDays]));
  const startFishSeeds = state.individuals.map((fish) => fish.seed);
  const observation = createObservation(state);

  for (let index = 1; index <= scenario.ticks; index += 1) {
    const previous = state;
    state = tick(state, scenario.dt);
    // A deterministic, evenly spaced tap so the touch/reaction path is part of
    // the long run rather than an untested branch.
    if (index % scenario.touchEvery === 0) {
      state = applyTouch(state, (index % state.cols), WATERLINE_ROWS + 2 + (index % 5));
    }
    if (index % scenario.sampleEvery === 0 || index === scenario.ticks) {
      observe(observation, state, previous, scenario);
    }
  }

  const nonFinite = nonFiniteNumbers(state);
  const scene = render(state);
  const restored = restorePersistentState(
    createAquariumState({
      orientation: scenario.orientation,
      seed: scenario.seed,
      wallClockHours: scenario.wallClockHours,
    }),
    serializePersistentState(state),
  );

  return {
    scenario: scenario.name,
    simDays: state.totalDays,
    simDaysFromSeconds: state.elapsedSimSeconds / DAY_SECONDS,
    realSeconds: state.elapsedRealSeconds,
    timeOfDayHours: state.timeOfDayHours,
    nonFinite,
    violations: observation.violations,
    samples: observation.samples,
    fishSamples: observation.fishSamples,
    behaviorCounts: observation.behaviorCounts,
    activityCounts: observation.activityCounts,
    perFish: [...observation.perFish.entries()].map(([seed, record]) => ({
      seed,
      behaviors: [...record.behaviors].sort(),
      activities: [...record.activities].sort(),
      distance: record.distance,
      hungerPinnedFromDay: record.hungerPinnedFromDay,
      hungerPinnedFraction: record.samples ? record.hungerPinnedSamples / record.samples : 0,
      arrived: record.firstSeenDay !== null,
      firstSeenDay: record.firstSeenDay,
      index: state.individuals.findIndex((fish) => fish.seed === seed),
    })),
    arrivalOrder: observation.arrivalOrder,
    maxIndividuals: observation.maxIndividuals,
    maxPlants: observation.maxPlants,
    plantCap: plantCapFor(scenario.orientation),
    startFishSeeds,
    finalFishSeeds: state.individuals.map((fish) => fish.seed),
    finalPlantSeeds: state.plants.map((plant) => plant.seed),
    content: state.content,
    schedule: contentSchedule(scenario.seed).map((milestone) => ({
      id: milestone.id,
      day: milestone.day,
    })),
    restoredPlantSeeds: null,
    minY: observation.minY,
    maxY: observation.maxY,
    minSchoolY: observation.minSchoolY,
    maxSchoolY: observation.maxSchoolY,
    maxSpeed: observation.maxSpeed,
    maxFamiliarity: observation.maxFamiliarity,
    driveAtFloor: observation.driveAtFloor,
    driveAtCeiling: observation.driveAtCeiling,
    finalDrives: state.individuals.map((fish) => fish.drives),
    // Original specimens only: a propagated shoot legitimately began part way
    // through the run and has not aged by the whole span.
    plantAgeGrowth: state.plants
      .filter((plant) => startPlantAge.has(plant.seed))
      .map((plant) => plant.ageDays - startPlantAge.get(plant.seed)),
    originalPlantsPresent: [...startPlantAge.keys()]
      .every((seed) => state.plants.some((plant) => plant.seed === seed)),
    memorySizes: state.individuals.map((fish) => fish.history.socialMemory.length),
    touches: state.individuals.map((fish) => fish.history.touches),
    finalIndividuals: state.individuals,
    sceneObjectCount: scene.objects.length,
    sceneDigest: createHash("sha256").update(JSON.stringify(scene)).digest("hex").slice(0, 16),
    restoredMatchesLive: {
      plantSeeds: restored.plants.map((plant) => plant.seed),
      individualSeeds: restored.individuals.map((fish) => fish.seed),
      individuals: restored.individuals.map((fish) => ({
        seed: fish.seed,
        x: fish.x,
        y: fish.y,
        drives: fish.drives,
        socialMemory: fish.history.socialMemory,
      })),
      totalDays: restored.totalDays,
    },
  };
}

function runDigest(run) {
  const { scenario: _name, ...comparable } = run;
  return createHash("sha256").update(JSON.stringify(comparable)).digest("hex").slice(0, 32);
}

const REPEATS = 3;

for (const scenario of SCENARIOS) {
  test(`multi-month run is stable and repeatable: ${scenario.name}`, { timeout: 600000 }, () => {
    const runs = [];
    for (let repeat = 0; repeat < REPEATS; repeat += 1) runs.push(runScenario(scenario));
    const [first] = runs;

    const expectedDays = scenario.ticks * scenario.dt * scenario.timeScale / DAY_SECONDS;
    console.log(`\n[${scenario.name}]`);
    console.log(`  sim days: ${first.simDays.toFixed(2)} (expected ${expectedDays.toFixed(2)}), `
      + `real seconds driven: ${first.realSeconds.toFixed(1)}, samples: ${first.samples}`);
    console.log(`  behaviour mix: ${Object.entries(first.behaviorCounts)
      .map(([key, value]) => `${key}=${(value / Math.max(1, first.fishSamples) * 100).toFixed(1)}%`)
      .join(" ")}`);
    console.log(`  distinct activities seen: ${Object.keys(first.activityCounts).sort().join(", ")}`);
    console.log(`  y range fish ${first.minY.toFixed(2)}..${first.maxY.toFixed(2)}, `
      + `school ${first.minSchoolY.toFixed(2)}..${first.maxSchoolY.toFixed(2)}, max speed ${first.maxSpeed.toFixed(3)}`);
    console.log(`  social memory sizes: [${first.memorySizes.join(", ")}], `
      + `max familiarity ${first.maxFamiliarity.toFixed(6)}, touches ${first.touches.join("/")}`);
    console.log(`  behaviour sample counts: ${JSON.stringify(first.behaviorCounts)} of `
      + `${first.fishSamples} fish-samples`);
    console.log(`  plant age growth: ${Math.min(...first.plantAgeGrowth).toFixed(2)}..`
      + `${Math.max(...first.plantAgeGrowth).toFixed(2)} days, scene objects ${first.sceneObjectCount}`);
    console.log(`  drives pinned at floor ${JSON.stringify(first.driveAtFloor)} / `
      + `ceiling ${JSON.stringify(first.driveAtCeiling)} of `
      + `${first.fishSamples} fish-samples`);
    console.log(`  final drives: ${first.finalDrives
      .map((d) => `h${d.hunger.toFixed(2)}/e${d.energy.toFixed(2)}/s${d.social.toFixed(2)}`).join("  ")}`);
    console.log(`  hunger pinned at 0.85 since sim day: [${first.perFish
      .map((record) => (record.hungerPinnedFromDay === null ? "never" : record.hungerPinnedFromDay.toFixed(1)))
      .join(", ")}] (fraction of samples: `
      + `${first.perFish.map((record) => record.hungerPinnedFraction.toFixed(2)).join(", ")})`);
    console.log(`  behaviours per fish: ${first.perFish.map((record) => record.behaviors.join("|")).join("  ")}`);
    console.log(`  Phase 3: cast ${first.startFishSeeds.length} -> ${first.finalFishSeeds.length} `
      + `(max ${first.maxIndividuals}/${MAX_INDIVIDUALS}), garden ${first.plantAgeGrowth.length} -> `
      + `${first.finalPlantSeeds.length} (cap ${first.plantCap}), content ${JSON.stringify(first.content)}`);
    console.log(`  milestone schedule: ${first.schedule
      .map((milestone) => `${milestone.id}@${milestone.day.toFixed(1)}d`).join(" ")}`);
    console.log(`  arrivals observed: ${first.arrivalOrder
      .map((entry) => `${entry.seed.toString(16)}@${entry.day.toFixed(1)}d`).join(" ") || "none"}`);
    console.log(`  non-finite values: ${first.nonFinite.length}, invariant violations: ${first.violations.length}`);
    console.log(`  run digest: ${runDigest(first)} (scene ${first.sceneDigest})`);

    assert.deepEqual(first.nonFinite, [], "no NaN/Infinity should appear anywhere in the state");
    assert.deepEqual(first.violations.slice(0, 10), [], "invariants must hold across the whole run");
    assert.ok(Math.abs(first.simDays - expectedDays) < 1e-6, "simulated days should match the driven span");
    assert.ok(first.simDays >= 150, "the run should cover several months of simulation time");
    assert.ok(first.sceneObjectCount > 0, "the scene should still render after months of simulation");

    for (const growth of first.plantAgeGrowth) {
      assert.ok(Math.abs(growth - expectedDays) < 1e-6, "plants should age by the simulated span");
    }
    assert.ok(first.originalPlantsPresent, "no plant may disappear through age");
    first.perFish.forEach((record) => {
      // A fish that arrived in the final samples of a coarse run has barely
      // been ticked, so only the cast that lived through the run must travel.
      if (record.arrived && record.firstSeenDay > first.simDays - 20) return;
      assert.ok(record.distance > 1, `fish ${record.seed} should keep moving (travelled ${record.distance})`);
    });

    // --- Phase 3 long-horizon assertions -----------------------------------
    assert.ok(first.maxIndividuals <= MAX_INDIVIDUALS, "persistent cast exceeded eight fish");
    assert.ok(first.maxPlants <= first.plantCap, "garden exceeded its hard plant cap");
    assert.equal(new Set(first.finalFishSeeds).size, first.finalFishSeeds.length, "duplicate fish seed");
    assert.equal(new Set(first.finalPlantSeeds).size, first.finalPlantSeeds.length, "duplicate plant seed");
    for (const seed of first.startFishSeeds) {
      assert.ok(first.finalFishSeeds.includes(seed), `original fish ${seed} disappeared`);
    }
    // Six months crosses both seeded arrival windows, in schedule order.
    assert.equal(first.finalFishSeeds.length, MAX_INDIVIDUALS, "both arrivals should have happened by month six");
    assert.deepEqual(
      first.arrivalOrder.map((entry) => entry.index),
      first.arrivalOrder.map((_, ordinal) => first.startFishSeeds.length + ordinal),
      "arrivals joined the roster out of order",
    );
    for (let index = 1; index < first.arrivalOrder.length; index += 1) {
      assert.ok(
        first.arrivalOrder[index].day >= first.arrivalOrder[index - 1].day,
        "the second arrival preceded the first",
      );
    }
    assert.ok(first.finalPlantSeeds.length > first.plantAgeGrowth.length, "the garden did not change in six months");
    assert.equal(first.content.version, 1);
    assert.ok(Number.isInteger(first.content.propagationEpoch) && first.content.propagationEpoch >= 0);
    assert.ok(first.content.milestones >= 0 && first.content.milestones < 16);
    // Everything the aquarium acquired survives a save/restore round trip.
    assert.deepEqual(first.restoredMatchesLive.plantSeeds, first.finalPlantSeeds);
    assert.deepEqual(first.restoredMatchesLive.individualSeeds, first.finalFishSeeds);
    // Behaviour churn is gated on real seconds (blend needs ~1.8s), not on
    // simulated time, so only runs that drive enough frames can be expected to
    // show variety. The max-timeScale run covers 6 sim months in 26 real
    // seconds and legitimately shows very few switches.
    //
    // The one accepted exception is a forage-eligible fish that spends the run
    // pinned at maximum hunger. Above roughly an hour of simulated time per
    // real second, hunger grows on simulated time while reaching the substrate
    // costs real time, so such a fish is genuinely starving and committing to
    // the search is the correct reading rather than a stuck state machine.
    if (first.realSeconds >= 120) {
      first.perFish.forEach((record) => {
        // A late arrival has not been in the tank long enough to have shown a
        // range of behaviour; the cast that lived through the run has.
        if (record.arrived && record.firstSeenDay > first.simDays - 60) return;
        const behaviors = record.behaviors;
        const starving = record.index >= 3 && record.hungerPinnedFraction > 0.9;
        if (starving && behaviors.length === 1) {
          assert.deepEqual(behaviors, ["forage"], `fish ${record.seed} starved into ${behaviors}`);
          return;
        }
        assert.ok(behaviors.length >= 2, `fish ${record.seed} should not be stuck in one behaviour (${behaviors})`);
      });
    }

    for (let repeat = 1; repeat < REPEATS; repeat += 1) {
      assert.deepEqual(runs[repeat], first, `run ${repeat + 1} diverged from run 1`);
    }
  });
}
