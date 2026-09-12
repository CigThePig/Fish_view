import assert from "node:assert/strict";
import test from "node:test";

import {
  relationshipRoster,
  relationshipSnapshot,
  withObservedGlassFamiliarity,
} from "../src/dev/relationship-observation.js";
import {
  advanceOffline,
  createAquariumState,
  restorePersistentState,
  serializePersistentState,
} from "../src/sim/state.js";
import {
  GLASS_FAMILIARITY_DEFAULT,
  glassFamiliarityFor,
  sanitizeGlassFamiliarity,
  withGlassFamiliarity,
} from "../src/sim/viewer-relationship.js";

const SEED = 0x6a55f00d;

function base() {
  return createAquariumState({ seed: SEED });
}

function roundTrip(state) {
  return restorePersistentState(base(), serializePersistentState(state));
}

test("new persistent fish begin unfamiliar without an interaction history", () => {
  const state = base();
  assert.ok(state.individuals.length > 0);
  for (const fish of state.individuals) {
    assert.equal(fish.history.glassFamiliarity, GLASS_FAMILIARITY_DEFAULT);
    assert.equal(glassFamiliarityFor(fish), GLASS_FAMILIARITY_DEFAULT);
    assert.equal(Array.isArray(fish.history.viewerInteractions), false);
  }
});

test("glass familiarity is a bounded scalar", () => {
  assert.equal(sanitizeGlassFamiliarity(-1), 0);
  assert.equal(sanitizeGlassFamiliarity(0.42), 0.42);
  assert.equal(sanitizeGlassFamiliarity(7), 1);
  assert.equal(sanitizeGlassFamiliarity(Number.NaN), 0);
  assert.equal(sanitizeGlassFamiliarity(Number.POSITIVE_INFINITY), 0);
  assert.equal(sanitizeGlassFamiliarity(undefined, 0.35), 0.35);

  const fish = base().individuals[0];
  assert.equal(withGlassFamiliarity(fish, -5).history.glassFamiliarity, 0);
  assert.equal(withGlassFamiliarity(fish, 0.625).history.glassFamiliarity, 0.625);
  assert.equal(withGlassFamiliarity(fish, 9).history.glassFamiliarity, 1);
});

test("glass familiarity survives save and restore", () => {
  const state = base();
  const seed = state.individuals[0].seed;
  const familiar = withObservedGlassFamiliarity(state, seed, 0.625);
  const saved = serializePersistentState(familiar);

  assert.equal(saved.individuals[0].history.glassFamiliarity, 0.625);
  const restored = restorePersistentState(base(), saved);
  assert.equal(restored.individuals[0].seed, seed);
  assert.equal(restored.individuals[0].history.glassFamiliarity, 0.625);
});

test("old saves without glass familiarity restore as unfamiliar", () => {
  const state = base();
  const saved = serializePersistentState(state);
  saved.individuals[0].history.touches = 17;
  saved.individuals[0].history.boldnessDrift = 0.08;
  delete saved.individuals[0].history.glassFamiliarity;

  const restored = restorePersistentState(base(), saved);
  assert.equal(restored.individuals[0].history.glassFamiliarity, 0);
  assert.equal(restored.individuals[0].history.touches, 17);
  assert.equal(restored.individuals[0].history.boldnessDrift, 0.08);
});

test("malformed saved familiarity is sanitized without rejecting the aquarium", () => {
  for (const [value, expected] of [
    [-10, 0],
    [4, 1],
    [Number.NaN, 0],
    [Number.POSITIVE_INFINITY, 0],
  ]) {
    const saved = serializePersistentState(base());
    saved.individuals[0].history.glassFamiliarity = value;
    const restored = restorePersistentState(base(), saved);
    assert.equal(restored.individuals[0].history.glassFamiliarity, expected);
  }
});

test("offline progression preserves familiarity and fabricates no interactions", () => {
  const state = base();
  const seed = state.individuals[0].seed;
  const familiar = withObservedGlassFamiliarity(state, seed, 0.7);
  const beforeTouches = familiar.individuals[0].history.touches;
  const advanced = advanceOffline(familiar, 120 * 86400);
  const sameFish = advanced.individuals.find((fish) => fish.seed === seed);

  assert.ok(sameFish);
  assert.equal(sameFish.history.glassFamiliarity, 0.7);
  assert.equal(sameFish.history.touches, beforeTouches);
});

test("the persistent relationship footprint stays fixed-size", () => {
  const state = base();
  const seed = state.individuals[0].seed;
  let familiar = state;
  for (let index = 0; index < 1000; index += 1) {
    familiar = withObservedGlassFamiliarity(familiar, seed, index / 999);
  }

  const saved = serializePersistentState(familiar);
  const history = saved.individuals[0].history;
  assert.deepEqual(
    Object.keys(history).sort(),
    ["boldnessDrift", "glassFamiliarity", "sociabilityDrift", "socialMemory", "touches"].sort(),
  );
  assert.equal(typeof history.glassFamiliarity, "number");
  assert.ok(history.glassFamiliarity >= 0 && history.glassFamiliarity <= 1);
  assert.equal(Object.values(history).filter(Array.isArray).length, 1, "only bounded social memory may be an array");
});

test("developer relationship snapshots expose familiarity beside fixed personality", () => {
  const state = base();
  const fish = state.individuals[0];
  const familiar = withObservedGlassFamiliarity(state, fish.seed, 0.5);
  const snapshot = relationshipSnapshot(familiar.individuals[0]);
  const roster = relationshipRoster(familiar);

  assert.equal(snapshot.seed, fish.seed);
  assert.equal(snapshot.glassFamiliarity, 0.5);
  assert.ok(snapshot.fixedGlassAffinity >= 0 && snapshot.fixedGlassAffinity <= 1);
  assert.ok(snapshot.boldness >= 0 && snapshot.boldness <= 1);
  assert.ok(snapshot.curiosity >= 0 && snapshot.curiosity <= 1);
  assert.equal(roster.length, familiar.individuals.length);
  assert.equal(roster[0].glassFamiliarity, 0.5);
});

test("relationship round trips do not alter personality drift or social memory", () => {
  const state = base();
  const seed = state.individuals[0].seed;
  const familiar = withObservedGlassFamiliarity(state, seed, 0.4);
  const restored = roundTrip(familiar);

  assert.equal(restored.individuals[0].history.glassFamiliarity, 0.4);
  assert.equal(restored.individuals[0].history.boldnessDrift, familiar.individuals[0].history.boldnessDrift);
  assert.equal(restored.individuals[0].history.sociabilityDrift, familiar.individuals[0].history.sociabilityDrift);
  assert.deepEqual(restored.individuals[0].history.socialMemory, familiar.individuals[0].history.socialMemory);
});
