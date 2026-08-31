import assert from "node:assert/strict";
import test from "node:test";

import {
  AFFINITY_KEYS,
  affinitiesFromSeed,
  pairCompatibility,
  topAffinities,
} from "../src/sim/fish-personality.js";
import { createAquariumState, serializePersistentState } from "../src/sim/state.js";

test("fixed affinities are deterministic, bounded, and reconstructed from only the fish seed", () => {
  for (let seed = 0; seed < 200; seed += 1) {
    const first = affinitiesFromSeed(seed);
    const second = affinitiesFromSeed(seed);
    assert.deepEqual(first, second);
    assert.deepEqual(Object.keys(first), AFFINITY_KEYS);
    assert.ok(Object.values(first).every((value) => Number.isFinite(value) && value >= 0.12 && value <= 0.96));
  }
  assert.notDeepEqual(affinitiesFromSeed(71), affinitiesFromSeed(72));
});

test("each personality deliberately accents two or three visible signature interests", () => {
  for (let seed = 1; seed <= 300; seed += 1) {
    const affinities = affinitiesFromSeed(seed);
    const strong = Object.entries(affinities).filter(([, value]) => value >= 0.74);
    const weak = Object.entries(affinities).filter(([, value]) => value <= 0.3);
    assert.ok(strong.length >= 2 && strong.length <= 3, `seed ${seed} has ${strong.length} accents`);
    assert.ok(weak.length >= 2, `seed ${seed} has no readable weak interests`);
    assert.ok(Math.max(...Object.values(affinities)) - Math.min(...Object.values(affinities)) >= 0.5);
    assert.ok(strong.every(([key]) => key !== "surface" && key !== "substrate"));
  }
});

test("diagnostic affinity ranking is stable and learned history cannot reroll personality", () => {
  const state = createAquariumState({ orientation: "landscape", seed: 913 });
  for (const fish of state.individuals) {
    const before = topAffinities(fish.seed);
    const changedHistory = {
      ...fish,
      history: {
        ...fish.history,
        touches: 999,
        boldnessDrift: 0.18,
        sociabilityDrift: 0.12,
        socialMemory: [{ seed: fish.seed ^ 12345, familiarity: 0.8 }],
      },
    };
    assert.deepEqual(topAffinities(changedHistory.seed), before);
  }
});

test("pair compatibility is symmetric, bounded, and never treats self as a companion", () => {
  for (let left = 1; left < 30; left += 1) {
    for (let right = left + 1; right < 35; right += 1) {
      const forward = pairCompatibility(left, right);
      assert.equal(forward, pairCompatibility(right, left));
      assert.ok(forward >= 0.24 && forward <= 0.92);
    }
    assert.equal(pairCompatibility(left, left), 0);
  }
});

test("derived affinities are not redundantly persisted", () => {
  const saved = serializePersistentState(createAquariumState({ orientation: "portrait", seed: 881 }));
  for (const fish of saved.individuals) {
    assert.equal("affinities" in fish, false);
    assert.equal("personality" in fish, false);
    assert.equal("activity" in fish, false);
  }
});
