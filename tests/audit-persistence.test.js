import assert from "node:assert/strict";
import test from "node:test";
import { render } from "../src/render/render.js";
import { MAX_INDIVIDUALS, SETTING_LIMITS } from "../src/sim/config.js";
import { createIndividualFromSeed } from "../src/sim/entities.js";
import { advanceAquariumHistory } from "../src/sim/aquarium-history.js";
import { createAquariumState, restorePersistentState, serializePersistentState, withSettings } from "../src/sim/state.js";
import { tick } from "../src/sim/tick.js";
import { loadPersistedState, savePersistedState, clearPersistedState } from "../src/platform/storage.js";
import { createPlantSpecimen, plantSpecies } from "../src/sim/plants.js";

// A fully stocked aquarium, which is what most of these audits want to damage:
// a fresh tank holds a single fish, so a save written from one has no slot 2 to
// corrupt and no fourth identity to displace.
function stocked(seed) {
  return advanceAquariumHistory(createAquariumState({ seed }), 400);
}

function assertHealthy(state) {
  assert.ok(state.individuals.length >= 1 && state.individuals.length <= MAX_INDIVIDUALS);
  assert.equal(new Set(state.individuals.map((fish) => fish.seed)).size, state.individuals.length);
  for (const [key, [minimum, maximum]] of Object.entries(SETTING_LIMITS)) {
    assert.ok(Number.isFinite(state.settings[key]) && state.settings[key] >= minimum && state.settings[key] <= maximum, key);
  }
  const next = tick(state, 0.1);
  assert.ok(Number.isFinite(next.totalDays) && Number.isFinite(next.timeOfDayHours));
  const scene = render(next);
  assert.ok(scene.glyphs.every((glyph) => Number.isFinite(glyph.x) && Number.isFinite(glyph.y)));
}

test("damaged fish slots do not reset healthy identities or the aquarium's history", () => {
  const base = stocked(5);
  for (const damaged of [null, [], false, "fish", { seed: -1 }, { seed: 1.5 }]) {
    const saved = serializePersistentState(base);
    saved.totalDays = 9;
    saved.individuals[0].history.touches = 37;
    saved.individuals[2] = damaged;
    const restored = restorePersistentState(base, saved);
    assert.equal(restored.totalDays, 9);
    assert.equal(restored.individuals[0].history.touches, 37);
    assert.deepEqual(restored.individuals.map((fish) => fish.seed), base.individuals.map((fish) => fish.seed));
    assertHealthy(restored);
  }
});

test("duplicate identities are repaired without displacing a valid later record", () => {
  const base = stocked(83);
  const saved = serializePersistentState(base);
  saved.individuals[1] = { ...saved.individuals[0] };
  saved.individuals[4].history.touches = 82;
  const restored = restorePersistentState(base, saved);
  assertHealthy(restored);
  assert.equal(restored.individuals.find((fish) => fish.seed === base.individuals[4].seed).history.touches, 82);
  assert.ok(restored.individuals.some((fish) => fish.seed === base.individuals[1].seed));
});

test("missing saved traits fall back to their own identity rather than their array slot", () => {
  // Part-grown rather than stocked, so the roster still has a free slot for the
  // unknown identity pushed in below instead of dropping it at the ceiling.
  const base = advanceAquariumHistory(createAquariumState({ seed: 147 }), 100);
  const saved = serializePersistentState(base);
  saved.individuals.reverse();
  for (const fish of saved.individuals) delete fish.drives;
  const restored = restorePersistentState(base, saved);
  for (const fish of restored.individuals) {
    const original = base.individuals.find((candidate) => candidate.seed === fish.seed);
    assert.deepEqual(fish.drives, original.drives);
  }
  const seed = 123456;
  saved.individuals.push({ seed });
  const arrival = restorePersistentState(base, saved).individuals.find((fish) => fish.seed === seed);
  assert.ok(arrival, "an unknown but valid identity was dropped");
  // Drives come from the fish's own seed, never from where it sat in the save.
  assert.deepEqual(arrival.drives, createIndividualFromSeed(seed, 0, base.cols, base.rows).drives);
});

test("save restoration admits biological fields, never injected sprite or transient state", () => {
  const base = stocked(5);
  const saved = serializePersistentState(base);
  Object.assign(saved.individuals[0], {
    shape: [""], mask: null, id: "round-fin", body: false,
    activity: { current: "playful-chase", targetId: saved.individuals[0].seed },
    choreography: { maximumSpeed: 1e300 },
  });
  const restored = restorePersistentState(base, saved);
  for (const field of ["shape", "mask", "id", "body", "choreography"]) assert.ok(!(field in restored.individuals[0]));
  assert.equal(restored.individuals[0].activity.targetId, null);
  assertHealthy(restored);
});

test("all settings entry points bound allocation and reject non-numeric or unknown values", () => {
  for (const value of [null, "bad", Infinity, NaN, -1e300, 1e300]) {
    const patch = Object.fromEntries(Object.keys(SETTING_LIMITS).map((key) => [key, value]));
    patch.unrecognized = 47;
    const base = advanceAquariumHistory(createAquariumState({ seed: 5, settings: patch }), 400);
    assertHealthy(base);
    // A stocked aquarium's school has finished filling, so it is the setting's
    // own bounds that have to hold rather than a fraction of them.
    assert.ok(base.settings.schoolCount >= 25 && base.settings.schoolCount <= 40);
    const tuned = withSettings(base, patch);
    const saved = serializePersistentState(base);
    saved.settings = patch;
    for (const state of [tuned, restorePersistentState(base, saved)]) {
      assert.ok(!("unrecognized" in state.settings));
      assertHealthy(state);
    }
  }
});

test("inherited object keys are not plant species in either save schema", () => {
  const base = stocked(5);
  for (const persistenceVersion of [1, 2]) for (const speciesId of ["constructor", "__proto__", "toString"]) {
    const saved = serializePersistentState(base);
    saved.persistenceVersion = persistenceVersion;
    saved.plants[0].speciesId = speciesId;
    assertHealthy(restorePersistentState(base, saved));
  }
});

test("species lookup rejects inherited keys outside persistence as well", () => {
  for (const speciesId of ["constructor", "__proto__", "toString"]) {
    assert.throws(() => createPlantSpecimen({ speciesId, seed: 5, rows: 20 }), /Unknown plant species/);
    assert.equal(plantSpecies({ speciesId }).id, "soft-ribbon");
  }
});

test("legacy plant migration repairs duplicate plant identities", () => {
  const base = stocked(83);
  const saved = serializePersistentState(base);
  saved.persistenceVersion = 1;
  saved.plants[1].seed = saved.plants[0].seed;
  const restored = restorePersistentState(base, saved);
  assert.equal(new Set(restored.plants.map((plant) => plant.seed)).size, restored.plants.length);
  assert.equal(restored.plants[2].seed, saved.plants[2].seed);
  assert.equal(restored.plants.length, base.plants.length);
});

test("rejected save envelopes do not apply offline age to a new aquarium", () => {
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const base = stocked(5);
  try {
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
      getItem: () => JSON.stringify({ savedAtMs: 0, state: { persistenceVersion: 99 } }),
    } });
    assert.strictEqual(loadPersistedState(base, 90 * 86400 * 1000), base);
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: undefined });
    assert.equal(savePersistedState(base), false);
    assert.equal(clearPersistedState(base), false);
  } finally {
    if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
    else delete globalThis.localStorage;
  }
});
