// Phase 3: a growing aquarium has to survive a reload. Restoration is keyed on
// stable plant seeds instead of the original habitat roster, and a save written
// before Phase 3 has to come back safely and keep going.
import assert from "node:assert/strict";
import test from "node:test";

import { PLANT_SPECIES_BY_ID, RARE_PLANT_IDS } from "../src/art/plants.js";
import {
  CONTENT_VERSION,
  INITIAL_INDIVIDUAL_COUNT,
  MAX_INDIVIDUALS,
  PROPAGATION_EPOCH_DAYS,
  advanceAquariumHistory,
  contentSchedule,
} from "../src/sim/aquarium-history.js";
import { MAX_SOCIAL_MEMORY } from "../src/sim/fish-personality.js";
import { plantCapFor, plantCountFor, plantVariationFromSeed } from "../src/sim/plants.js";
import {
  PERSISTENCE_VERSION,
  advanceOffline,
  createAquariumState,
  restorePersistentState,
  serializePersistentState,
} from "../src/sim/state.js";

const SEED = 0xa51c0a7e;

function base(orientation = "landscape", seed = SEED) {
  return createAquariumState({ orientation, seed });
}

function roundTrip(state, orientation = state.orientation, seed = state.seed) {
  return restorePersistentState(base(orientation, seed), serializePersistentState(state));
}

test("a grown roster of propagated and rare plants survives save and restore", () => {
  for (const orientation of ["landscape", "portrait"]) {
    const original = base(orientation);
    const originalSeeds = new Set(original.plants.map((plant) => plant.seed));
    const grown = advanceAquariumHistory(original, 500);
    const added = grown.plants.filter((plant) => !originalSeeds.has(plant.seed));
    const rareAdded = added.filter((plant) => RARE_PLANT_IDS.includes(plant.speciesId));
    assert.ok(added.length >= 3, "the fixture did not produce enough new plants to be meaningful");
    assert.ok(rareAdded.length >= 1, "the fixture contains no delayed rare plant");

    const restored = roundTrip(grown);
    // The whole persistent roster comes back - restoration no longer truncates
    // a garden to the orientation's original habitat layout.
    assert.equal(restored.plants.length, grown.plants.length);
    assert.ok(restored.plants.length > plantCountFor(orientation));
    assert.deepEqual(restored.plants, grown.plants);
    assert.deepEqual(restored.individuals.map((fish) => fish.seed), grown.individuals.map((fish) => fish.seed));
    assert.deepEqual(restored.content, grown.content);

    // And it keeps growing from there rather than restarting its history.
    const continued = advanceAquariumHistory(restored, 400);
    assert.ok(continued.plants.length >= restored.plants.length);
    assert.ok(continued.plants.length <= plantCapFor(orientation));
  }
});

test("the original habitat roster is preserved exactly across the upgrade", () => {
  for (const orientation of ["landscape", "portrait"]) {
    for (const seed of [SEED, 818, 991]) {
      const original = base(orientation, seed);
      const evolved = {
        ...original,
        plants: original.plants.map((plant, index) => ({ ...plant, ageDays: plant.ageDays + index + 3.5 })),
      };
      const restored = restorePersistentState(original, serializePersistentState(evolved));
      assert.deepEqual(restored.plants, evolved.plants, "restoring reshuffled the original garden");
    }
  }
});

test("dynamic plant identity is the stable seed, not the array position", () => {
  const grown = advanceAquariumHistory(base(), 400);
  const saved = serializePersistentState(grown);
  // Storage order is a convenience. Reordering it must not change which plants
  // come back, only the order they come back in.
  const shuffled = { ...saved, plants: [...saved.plants].reverse() };
  const restored = restorePersistentState(base(), shuffled);
  assert.deepEqual(
    restored.plants.map((plant) => plant.seed).sort(),
    grown.plants.map((plant) => plant.seed).sort(),
  );
  for (const plant of restored.plants) {
    const source = grown.plants.find((candidate) => candidate.seed === plant.seed);
    assert.deepEqual(plant, source);
  }
});

test("corrupt saved plant data is sanitized without crashing or growing unbounded", () => {
  const orientation = "landscape";
  const original = base(orientation);
  const grown = advanceAquariumHistory(original, 300);
  const saved = serializePersistentState(grown);
  const good = saved.plants[0];

  const corrupt = {
    ...saved,
    plants: [
      ...saved.plants,
      // Duplicate stable seeds.
      { ...good },
      { ...good, x: 3 },
      // Invalid species.
      { ...good, seed: 12345, speciesId: "brain-coral" },
      { ...good, seed: 12346, speciesId: 42 },
      // Non-finite geometry and age.
      { ...good, seed: 12347, x: Number.NaN },
      { ...good, seed: 12348, ageDays: Number.POSITIVE_INFINITY },
      { ...good, seed: 12349, x: -900 },
      { ...good, seed: 12350, matureHeight: Number.NaN },
      // Malformed records.
      null,
      "plant",
      { seed: 1.5, speciesId: "needle-grass", x: 4, ageDays: 2 },
      { seed: -1, speciesId: "needle-grass", x: 4, ageDays: 2 },
      { seed: 0x1ffffffff, speciesId: "needle-grass", x: 4, ageDays: 2 },
      // Far more plants than the cap allows.
      ...Array.from({ length: 400 }, (_, index) => ({
        ...good,
        seed: 900000 + index,
        x: (index % 60) + 0.5,
      })),
    ],
  };

  const restored = restorePersistentState(original, corrupt);
  assert.ok(restored.plants.length <= plantCapFor(orientation), "a corrupt save grew an unbounded roster");
  assert.equal(new Set(restored.plants.map((plant) => plant.seed)).size, restored.plants.length);
  for (const plant of restored.plants) {
    assert.ok(PLANT_SPECIES_BY_ID[plant.speciesId], `invalid species ${plant.speciesId} survived restore`);
    assert.equal(plant.layer, PLANT_SPECIES_BY_ID[plant.speciesId].layer);
    assert.ok(Number.isFinite(plant.x) && plant.x > 0 && plant.x < restored.cols);
    assert.ok(Number.isFinite(plant.ageDays) && plant.ageDays >= 0);
    assert.ok(Number.isFinite(plant.matureHeight) && plant.matureHeight >= 1.2);
    for (const key of ["phase", "frequency", "sway", "lean", "stiffness", "secondaryPhase"]) {
      assert.ok(Number.isFinite(plant[key]), `${key} restored non-finite`);
    }
    assert.ok(Number.isInteger(plant.paletteSlot) && plant.paletteSlot >= 0 && plant.paletteSlot <= 2);
  }
  // The garden the aquarium actually had is still at the front of the roster.
  for (const plant of grown.plants) {
    assert.ok(restored.plants.some((candidate) => candidate.seed === plant.seed));
  }
});

test("missing plant motion traits are re-derived from the plant's own seed", () => {
  const original = base();
  const grown = advanceAquariumHistory(original, 300);
  const saved = serializePersistentState(grown);
  const stripped = {
    ...saved,
    plants: saved.plants.map(({ seed, speciesId, x, ageDays, matureHeight }) => ({
      seed,
      speciesId,
      x,
      ageDays,
      matureHeight,
    })),
  };
  const restored = restorePersistentState(original, stripped);
  assert.equal(restored.plants.length, grown.plants.length);
  for (const plant of restored.plants) {
    const derived = plantVariationFromSeed(plant.seed);
    assert.equal(plant.phase, derived.phase);
    assert.equal(plant.secondaryPhase, derived.secondaryPhase);
    assert.equal(plant.paletteSlot, derived.paletteSlot);
  }
});

test("a pre-Phase-3 save restores safely and starts its history from where it is", () => {
  const orientation = "landscape";
  const original = base(orientation);
  const phase2Like = {
    ...original,
    totalDays: 180,
    individuals: original.individuals.map((fish, index) => ({
      ...fish,
      history: {
        ...fish.history,
        touches: index,
        socialMemory: index < 2
          ? [{ seed: original.individuals[index === 0 ? 1 : 0].seed, familiarity: 0.4 }]
          : [],
      },
    })),
    plants: original.plants.map((plant) => ({ ...plant, ageDays: plant.ageDays + 180 })),
  };
  const saved = serializePersistentState(phase2Like);
  // Exactly the shape a Phase 2 save has on disk: no content record at all.
  delete saved.content;
  assert.equal(saved.persistenceVersion, PERSISTENCE_VERSION);

  const restored = restorePersistentState(original, saved);
  // The existing cast, its learned history, and its garden all survive.
  for (let index = 0; index < INITIAL_INDIVIDUAL_COUNT; index += 1) {
    assert.equal(restored.individuals[index].seed, phase2Like.individuals[index].seed);
    assert.equal(restored.individuals[index].history.touches, index);
    assert.deepEqual(
      restored.individuals[index].history.socialMemory,
      phase2Like.individuals[index].history.socialMemory,
    );
  }
  for (const plant of phase2Like.plants) {
    const restoredPlant = restored.plants.find((candidate) => candidate.seed === plant.seed);
    assert.ok(restoredPlant, "an original plant was dropped by migration");
    assert.deepEqual(restoredPlant, plant);
  }

  // Bounded one-time milestones the save is overdue for are materialized...
  assert.equal(restored.individuals.length, MAX_INDIVIDUALS);
  assert.equal(restored.content.version, CONTENT_VERSION);
  assert.equal(restored.content.milestones, (1 << contentSchedule(SEED).length) - 1);
  // ...while six months of hypothetical colony reproduction is deliberately not
  // invented: propagation simply begins from the save's own age.
  assert.equal(restored.content.propagationEpoch, Math.floor(180 / PROPAGATION_EPOCH_DAYS));
  const grownPlants = restored.plants.filter((plant) => !phase2Like.plants.some((old) => old.seed === plant.seed));
  assert.ok(grownPlants.length <= contentSchedule(SEED).filter((m) => m.type === "rare-emergence").length,
    "migration invented a retrospective propagation forest");

  // And the aquarium keeps developing from there.
  const later = advanceAquariumHistory(restored, 400);
  assert.ok(later.plants.length > restored.plants.length, "a migrated save stopped growing");
  assert.ok(later.plants.length <= plantCapFor(orientation));
  assert.equal(later.individuals.length, MAX_INDIVIDUALS);
  assert.ok(later.individuals.every((fish) => fish.history.socialMemory.length <= MAX_SOCIAL_MEMORY));
});

test("a version 1 save still restores to the original habitat roster", () => {
  const original = base("landscape", 818);
  const saved = serializePersistentState(original);
  const legacy = {
    ...saved,
    persistenceVersion: 1,
    content: undefined,
    plants: saved.plants.slice(0, 12).map((plant) => ({
      seed: plant.seed,
      x: Math.round(plant.x),
      ageDays: plant.ageDays,
      maxHeight: Math.round(plant.matureHeight),
    })),
  };
  const migrated = restorePersistentState(original, legacy);
  assert.equal(migrated.plants.length, original.plants.length);
  assert.equal(migrated.plants[0].x, legacy.plants[0].x);
  assert.ok(migrated.plants.every((plant) => PLANT_SPECIES_BY_ID[plant.speciesId]));
  assert.equal(migrated.content.version, CONTENT_VERSION);
});

test("offline catch-up delivers every milestone crossed while the device was off", () => {
  const orientation = "landscape";
  const original = base(orientation);
  const schedule = contentSchedule(SEED);
  const lastMilestone = Math.max(...schedule.map((milestone) => milestone.day));

  let state = original;
  // Several separate power cycles rather than one big jump.
  for (const days of [20, 15, 40, 60, 70]) state = advanceOffline(state, days * 86400);
  assert.ok(state.totalDays > lastMilestone);
  assert.equal(state.individuals.length, MAX_INDIVIDUALS);
  for (const milestone of schedule) {
    if (milestone.type === "fish-arrival") {
      assert.ok(state.individuals.some((fish) => fish.seed === milestone.fishSeed));
    } else {
      assert.ok(state.plants.some((plant) => plant.seed === milestone.plantSeed));
    }
  }
  assert.ok(state.plants.length > original.plants.length, "no propagation epoch resolved offline");

  // One long gap reaches the same content as the several short ones.
  const single = advanceOffline(original, 205 * 86400);
  assert.deepEqual(
    single.individuals.map((fish) => fish.seed),
    state.individuals.map((fish) => fish.seed),
  );
  assert.deepEqual(
    single.plants.map((plant) => [plant.seed, plant.speciesId]),
    state.plants.map((plant) => [plant.seed, plant.speciesId]),
  );
  assert.deepEqual(single.content, state.content);

  // Everything the gap delivered survives the next save/restore.
  const restored = roundTrip(single);
  assert.deepEqual(restored.plants.map((plant) => plant.seed), single.plants.map((plant) => plant.seed));
  assert.deepEqual(restored.individuals.map((fish) => fish.seed), single.individuals.map((fish) => fish.seed));
});

test("restoring the same save repeatedly is idempotent", () => {
  const grown = advanceAquariumHistory(base(), 400);
  const saved = serializePersistentState(grown);
  let restored = restorePersistentState(base(), saved);
  for (let repeat = 0; repeat < 4; repeat += 1) {
    const again = restorePersistentState(base(), serializePersistentState(restored));
    assert.deepEqual(again.plants, restored.plants);
    assert.deepEqual(again.individuals, restored.individuals);
    assert.deepEqual(again.content, restored.content);
    restored = again;
  }
});
