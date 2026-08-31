// Phase 3: a garden that grows. Mature ordinary plants establish local shoots,
// delayed rare specimens emerge as seedlings, and unusual species acquire a
// slow recurring lifecycle - all inside hard, measured caps.
import assert from "node:assert/strict";
import test from "node:test";

import { PLANT_SPECIES, PLANT_SPECIES_BY_ID, RARE_PLANT_IDS } from "../src/art/plants.js";
import {
  PROPAGATION_EPOCH_DAYS,
  advanceAquariumHistory,
  contentSchedule,
  minimumRootSpacing,
  rootIsPlantable,
} from "../src/sim/aquarium-history.js";
import { plantGrowthNovelty } from "../src/sim/fish-activities.js";
import {
  PLANT_CAPS,
  PLANT_LIFECYCLE_STAGES,
  createPlantFromSeed,
  createPlantSpecimen,
  plantCapFor,
  plantCountFor,
  plantGrowthState,
  plantLifecycle,
  plantSpecies,
} from "../src/sim/plants.js";
import { createAquariumState } from "../src/sim/state.js";

const SEEDS = [3, 5, 29, 83, 147, 818, 4242, 0xa51c0a7e];

function grown(orientation, seed, day) {
  return advanceAquariumHistory(createAquariumState({ orientation, seed }), day);
}

function newPlants(orientation, seed, day) {
  const base = createAquariumState({ orientation, seed });
  const original = new Set(base.plants.map((plant) => plant.seed));
  return grown(orientation, seed, day).plants.filter((plant) => !original.has(plant.seed));
}

test("a mature ordinary plant can propagate and an immature one cannot", () => {
  // Real species maturity, not a shared age threshold: growth schedules differ
  // by several days between a ground tuft and a leaf reed.
  const orientation = "landscape";
  const base = createAquariumState({ orientation, seed: 61 });
  const juvenile = {
    ...base,
    plants: base.plants.map((plant) => ({ ...plant, ageDays: 0 })),
    content: { version: 1, propagationEpoch: 0, milestones: 15 },
  };
  // Every plant is a seedling for the first stretch, so no epoch can produce a
  // shoot however many of them are crossed.
  const stillJuvenile = advanceAquariumHistory(
    { ...juvenile, plants: juvenile.plants.map((plant) => ({ ...plant, ageDays: 0 })) },
    PROPAGATION_EPOCH_DAYS * 0.9,
  );
  assert.equal(stillJuvenile.plants.length, juvenile.plants.length);
  assert.ok(stillJuvenile.plants.every((plant) => !plantGrowthState(plant).mature));

  // The same aquarium, its garden already mature, does grow.
  const mature = {
    ...base,
    plants: base.plants.map((plant) => ({ ...plant, ageDays: 200 })),
    content: { version: 1, propagationEpoch: 0, milestones: 15 },
  };
  assert.ok(mature.plants.every((plant) => plantGrowthState(plant).mature));
  const advanced = advanceAquariumHistory(mature, 400);
  assert.ok(advanced.plants.length > mature.plants.length, "a mature garden never propagated");
});

test("ordinary propagation keeps the parent species and stays local to it", () => {
  const spread = { landscape: 0, portrait: 0 };
  for (const orientation of ["landscape", "portrait"]) {
    let checked = 0;
    for (const seed of SEEDS) {
      const base = createAquariumState({ orientation, seed });
      const originals = new Map(base.plants.map((plant) => [plant.seed, plant]));
      const emergenceSeeds = new Set(contentSchedule(seed)
        .filter((milestone) => milestone.type === "rare-emergence")
        .map((milestone) => milestone.plantSeed));
      const state = grown(orientation, seed, 720);
      for (const plant of state.plants) {
        if (originals.has(plant.seed) || emergenceSeeds.has(plant.seed)) continue;
        checked += 1;
        // A colony is recognisable because a shoot is the same plant as its
        // parent, and it roots beside it rather than across the tank.
        const parents = state.plants.filter((candidate) => candidate.speciesId === plant.speciesId
          && candidate.seed !== plant.seed);
        assert.ok(parents.length > 0, `${plant.speciesId} offspring has no same-species neighbour`);
        const nearest = Math.min(...parents.map((candidate) => Math.abs(candidate.x - plant.x)));
        assert.ok(nearest <= Math.max(1.4, state.cols * 0.03) + 1e-9,
          `${plant.speciesId} offspring rooted ${nearest} columns from any same-species plant`);
        spread[orientation] = Math.max(spread[orientation], nearest);
        assert.ok(!plantSpecies(plant).rare, "a rare species propagated normally");
      }
    }
    assert.ok(checked > 0, `${orientation} produced no propagated plants to inspect`);
  }
  assert.ok(spread.landscape > 0 && spread.portrait > 0);
});

test("propagation respects root spacing, local density, and the open-water gaps", () => {
  for (const orientation of ["landscape", "portrait"]) {
    const cap = plantCapFor(orientation);
    for (const seed of SEEDS) {
      // Force every epoch across two years: the deterministic opportunity is
      // exercised as hard as it can be.
      const state = grown(orientation, seed, 730);
      assert.ok(state.plants.length <= cap, `${orientation}/${seed} exceeded ${cap} plants`);
      assert.ok(state.plants.length >= plantCountFor(orientation));

      const base = createAquariumState({ orientation, seed });
      const originals = new Set(base.plants.map((plant) => plant.seed));
      const spacing = minimumRootSpacing(state.cols);
      for (const plant of state.plants) {
        if (originals.has(plant.seed)) continue;
        for (const other of state.plants) {
          if (other.seed === plant.seed) continue;
          assert.ok(Math.abs(other.x - plant.x) >= spacing - 1e-9,
            `${orientation}/${seed} rooted two plants ${Math.abs(other.x - plant.x)} apart`);
        }
        assert.ok(plant.x > 0.4 && plant.x < state.cols - 0.4);
      }

      // Deliberate open water survives a lifetime of colony growth.
      const sorted = state.plants.map((plant) => plant.x).sort((left, right) => left - right);
      const largestGap = Math.max(...sorted.slice(1).map((x, index) => x - sorted[index]));
      assert.ok(largestGap > state.cols * 0.055,
        `${orientation}/${seed} carpeted the substrate (largest gap ${largestGap.toFixed(2)})`);
    }
  }
});

test("a failed propagation opportunity is harmless rather than a retry storm", () => {
  const orientation = "landscape";
  const base = createAquariumState({ orientation, seed: 5 });
  // A garden already at its cap: every later epoch must simply produce nothing.
  const packed = {
    ...base,
    plants: base.plants.map((plant) => ({ ...plant, ageDays: 300 })),
  };
  const filled = advanceAquariumHistory(packed, 2000);
  assert.ok(filled.plants.length <= plantCapFor(orientation));
  const stable = advanceAquariumHistory(filled, 2000);
  assert.equal(stable.plants.length, filled.plants.length);
  assert.deepEqual(stable.plants.map((plant) => plant.seed), filled.plants.map((plant) => plant.seed));

  // The spacing predicate itself refuses an impossible root without searching.
  assert.equal(rootIsPlantable(base.plants, base.plants[0].x, base.cols), false);
  assert.equal(rootIsPlantable(base.plants, Number.NaN, base.cols), false);
  assert.equal(rootIsPlantable(base.plants, -3, base.cols), false);
  assert.equal(rootIsPlantable(base.plants, base.cols + 3, base.cols), false);
});

test("propagation unfolds over months instead of filling the tank in a fortnight", () => {
  for (const orientation of ["landscape", "portrait"]) {
    const cap = plantCapFor(orientation);
    const initial = plantCountFor(orientation);
    const counts = SEEDS.map((seed) => [14, 90, 180, 365].map((day) => grown(orientation, seed, day).plants.length));
    for (const [fortnight, quarter, half, year] of counts) {
      assert.ok(fortnight <= initial + 2, `${orientation} gained ${fortnight - initial} plants in two weeks`);
      assert.ok(quarter >= fortnight && half >= quarter && year >= half, "the garden shrank");
      assert.ok(year <= cap);
    }
    const averageHalf = counts.reduce((sum, row) => sum + row[2], 0) / counts.length;
    assert.ok(averageHalf > initial + 1, `${orientation} barely changed in six months`);
    assert.ok(averageHalf < cap, `${orientation} was already at its cap by six months`);
  }
});

test("propagated plants begin as seedlings and later generations can follow", () => {
  const state = grown("landscape", 4242, 500);
  const base = createAquariumState({ orientation: "landscape", seed: 4242 });
  const originals = new Set(base.plants.map((plant) => plant.seed));
  const grownPlants = state.plants.filter((plant) => !originals.has(plant.seed));
  assert.ok(grownPlants.length >= 3);
  // Every new plant is younger than the aquarium, i.e. it emerged rather than
  // being dropped in fully formed.
  for (const plant of grownPlants) {
    assert.ok(plant.ageDays < state.totalDays - 1e-9);
    assert.ok(plant.ageDays >= 0);
  }
  const ages = grownPlants.map((plant) => plant.ageDays).sort((left, right) => right - left);
  assert.ok(ages[0] > 200, "no early generation survived to be old");
  assert.ok(ages[0] - ages.at(-1) > 60, "every shoot appeared at the same time");

  // Nothing marks a propagated plant as sterile: once it matures months later
  // it is an ordinary candidate, which is what lets a colony keep spreading
  // slowly instead of stopping after one generation. Every other specimen here
  // is turned into a rare species - which never propagates - so any further
  // shoot can only have descended from the propagated plant.
  const child = grownPlants.find((plant) => !plantSpecies(plant).rare);
  const existing = new Set(state.plants.map((plant) => plant.seed));
  const isolated = {
    ...state,
    // Trimmed back under the cap so there is room for a further shoot at all.
    plants: state.plants
      .filter((plant, index) => plant.seed === child.seed || index < 16)
      .map((plant) => (plant.seed === child.seed
        ? { ...plant, ageDays: 400 }
        : { ...plant, speciesId: "spiral-weed", layer: "midground", ageDays: 400 })),
    content: { version: 1, propagationEpoch: 0, milestones: 15 },
    totalDays: 0,
  };
  const descendants = advanceAquariumHistory(isolated, 900).plants
    .filter((plant) => !existing.has(plant.seed));
  assert.ok(descendants.length > 0, "a propagated plant was never allowed to become a parent");
  assert.ok(descendants.every((plant) => plant.speciesId === child.speciesId));
});

test("rare species stay rare: only delayed emergence introduces them", () => {
  let rareInitial = 0;
  let rareGrown = 0;
  let total = 0;
  for (const orientation of ["landscape", "portrait"]) {
    for (let seed = 0; seed < 90; seed += 1) {
      const base = createAquariumState({ orientation, seed });
      const state = grown(orientation, seed, 730);
      const scheduled = new Set(contentSchedule(seed)
        .filter((milestone) => milestone.type === "rare-emergence")
        .map((milestone) => milestone.plantSeed));
      const originals = new Set(base.plants.map((plant) => plant.seed));
      rareInitial += base.plants.filter((plant) => RARE_PLANT_IDS.includes(plant.speciesId)).length;
      total += state.plants.length;
      for (const plant of state.plants) {
        if (!RARE_PLANT_IDS.includes(plant.speciesId)) continue;
        rareGrown += 1;
        // Every rare plant is either part of the original habitat generator or
        // one of this seed's two scheduled emergences. Nothing copies one.
        assert.ok(originals.has(plant.seed) || scheduled.has(plant.seed),
          `an unscheduled rare ${plant.speciesId} appeared`);
      }
    }
  }
  assert.ok(rareGrown > rareInitial, "delayed emergence never happened");
  assert.ok(rareGrown / total < 0.12, `rare plants reached ${(rareGrown / total * 100).toFixed(1)}% of the garden`);
});

test("a delayed rare plant emerges as a real seedling near existing vegetation", () => {
  for (const orientation of ["landscape", "portrait"]) {
    for (const seed of SEEDS) {
      const milestone = contentSchedule(seed).find((entry) => entry.type === "rare-emergence");
      const before = grown(orientation, seed, milestone.day - 0.5);
      assert.equal(before.plants.some((plant) => plant.seed === milestone.plantSeed), false);

      const after = grown(orientation, seed, milestone.day + 0.25);
      const plant = after.plants.find((candidate) => candidate.seed === milestone.plantSeed);
      assert.ok(plant, `${orientation}/${seed} skipped its first rare emergence`);
      assert.equal(plant.speciesId, milestone.speciesId);
      assert.ok(RARE_PLANT_IDS.includes(plant.speciesId));
      assert.ok(plant.ageDays >= 0 && plant.ageDays <= 0.3, "the rare plant arrived already grown");
      assert.equal(plant.layer, PLANT_SPECIES_BY_ID[plant.speciesId].layer);
      assert.ok(Number.isFinite(plant.matureHeight) && plant.matureHeight > 1);
      assert.equal(plantGrowthState(plant).mature, false);

      // It rooted in vegetation, not in the deliberate open middle.
      const neighbours = after.plants.filter((candidate) => candidate.seed !== plant.seed
        && Math.abs(candidate.x - plant.x) <= Math.max(2.2, after.cols * 0.055) + 1e-9);
      assert.ok(neighbours.length > 0, "the rare plant emerged in open water");

      // And it grows through the ordinary skeletal system from there.
      const later = grown(orientation, seed, milestone.day + 200);
      const matured = later.plants.find((candidate) => candidate.seed === milestone.plantSeed);
      assert.ok(matured.ageDays > 190);
      assert.ok(plantGrowthState(matured).currentStage > plantGrowthState(plant).currentStage);
    }
  }
});

test("the rare lifecycle is derived, bounded, coarse, and recurring", () => {
  const rare = PLANT_SPECIES.filter((species) => species.rare || species.glowTips);
  assert.ok(rare.length > 0);
  for (const species of rare) {
    for (const seed of [7, 4242, 90210]) {
      const plant = createPlantSpecimen({ speciesId: species.id, seed, x: 9, ageDays: 0, rows: 20 });
      // Nothing is stored: the same seed and age always give the same stage.
      const sample = (ageDays) => plantLifecycle({ ...plant, ageDays });
      assert.deepEqual(sample(140), sample(140));
      assert.equal(sample(0).active, false, "an immature specimen bloomed");

      const stages = new Map();
      let previous = null;
      let transitions = 0;
      for (let day = 0; day <= 400; day += 0.25) {
        const lifecycle = sample(day);
        assert.ok(PLANT_LIFECYCLE_STAGES.includes(lifecycle.stage));
        assert.ok(lifecycle.intensity >= 0 && lifecycle.intensity <= 1);
        assert.ok(lifecycle.cycleDays >= 35 && lifecycle.cycleDays <= 70);
        stages.set(lifecycle.stage, (stages.get(lifecycle.stage) ?? 0) + 1);
        if (previous !== null && lifecycle.stage !== previous) transitions += 1;
        previous = lifecycle.stage;
      }
      assert.ok(stages.get("active") > 0, `${species.id} never bloomed in 400 days`);
      assert.ok(stages.get("dormant") > stages.get("active"), "the bloom is not rare within the cycle");
      // Coarse: a handful of stage changes per year, not per frame.
      assert.ok(transitions < 40, `${species.id} changed stage ${transitions} times in 400 days`);
      // The bloom ends by returning to the ordinary mature state, never by
      // resetting, decaying, or removing the plant.
      assert.equal(sample(400).capable, true);
    }
  }
  // An ordinary species has no lifecycle at all.
  const ordinary = createPlantSpecimen({ speciesId: "needle-grass", seed: 12, x: 4, ageDays: 300, rows: 20 });
  assert.equal(plantLifecycle(ordinary).capable, false);
  assert.equal(plantLifecycle(ordinary).active, false);
});

test("very young shoots and blooming rare plants attract Phase 2 curiosity", () => {
  const seedling = createPlantFromSeed({ speciesId: "bushy-grass", seed: 77, x: 8, ageDays: 0, rows: 20 });
  assert.ok(plantGrowthNovelty(seedling) > 0.6, "an age-zero shoot was invisible to curious fish");
  const species = PLANT_SPECIES_BY_ID["bushy-grass"];
  assert.ok(plantGrowthNovelty({ ...seedling, ageDays: species.growthStepDays * 0.9 })
    < plantGrowthNovelty(seedling), "seedling novelty does not decay");

  // A mature ordinary plant is not permanently interesting.
  const settled = { ...seedling, ageDays: species.growthStepDays * (species.maximumStage + 3) };
  assert.equal(plantGrowthNovelty(settled), 0);

  // A rare plant in its active window is temporarily worth another look.
  const lantern = createPlantSpecimen({ speciesId: "lantern-plant", seed: 4242, x: 9, ageDays: 0, rows: 20 });
  let bloomed = null;
  let dormant = null;
  for (let day = 100; day <= 400; day += 0.5) {
    const candidate = { ...lantern, ageDays: day };
    if (!bloomed && plantLifecycle(candidate).stage === "active") bloomed = candidate;
    if (!dormant && plantLifecycle(candidate).stage === "dormant"
      && plantGrowthState(candidate).currentStage === plantGrowthState(candidate).activeJointCount * 0) dormant = candidate;
    if (!dormant && plantLifecycle(candidate).stage === "dormant") dormant = candidate;
  }
  assert.ok(bloomed && dormant);
  assert.ok(plantGrowthNovelty(bloomed) > plantGrowthNovelty(dormant),
    "a blooming rare plant is no more interesting than a dormant one");
});

test("plant caps are the tested budget rather than an aspiration", () => {
  assert.deepEqual(PLANT_CAPS, { landscape: 30, portrait: 22 });
  assert.equal(plantCapFor("landscape"), 30);
  assert.equal(plantCapFor("portrait"), 22);
  assert.ok(plantCapFor("landscape") > plantCountFor("landscape"));
  assert.ok(plantCapFor("portrait") > plantCountFor("portrait"));
});
