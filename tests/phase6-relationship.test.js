import assert from "node:assert/strict";
import test from "node:test";

import {
  relationshipRoster,
  relationshipSnapshot,
  withObservedGlassFamiliarity,
} from "../src/dev/relationship-observation.js";
import {
  advanceOffline,
  applyContact,
  applyRelease,
  applyTouch,
  createAquariumState,
  restorePersistentState,
  serializePersistentState,
} from "../src/sim/state.js";
import { tick } from "../src/sim/tick.js";
import {
  GLASS_FAMILIARITY_DEFAULT,
  VIEWER_SATURATION_HALF_LIFE_SECONDS,
  glassFamiliarityFor,
  sanitizeGlassFamiliarity,
  shapeAttentionForSaturation,
  viewerSaturationFor,
  withGlassFamiliarity,
} from "../src/sim/viewer-relationship.js";
import { stockedAquarium } from "./support/aquarium.js";

const SEED = 0x6a55f00d;

function base() {
  return createAquariumState({ seed: SEED });
}

function roundTrip(state) {
  return restorePersistentState(base(), serializePersistentState(state));
}

function totalFamiliarity(state) {
  return state.individuals.reduce((sum, fish) => sum + glassFamiliarityFor(fish), 0);
}

test("new persistent fish begin unfamiliar without an interaction history", () => {
  const state = base();
  assert.ok(state.individuals.length > 0);
  for (const fish of state.individuals) {
    assert.equal(fish.history.glassFamiliarity, GLASS_FAMILIARITY_DEFAULT);
    assert.equal(glassFamiliarityFor(fish), GLASS_FAMILIARITY_DEFAULT);
    assert.equal(Array.isArray(fish.history.viewerInteractions), false);
    assert.equal(fish.viewerRelationship, undefined);
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

test("a real response earns familiarity without rewriting personality", () => {
  const state = base();
  const before = state.individuals[0];
  const touched = applyTouch(state, before.x, before.y);
  const after = touched.individuals[0];

  assert.equal(after.attention?.role, "investigate");
  assert.ok(after.history.glassFamiliarity > before.history.glassFamiliarity);
  assert.ok(viewerSaturationFor(after, touched.elapsedRealSeconds) > 0);
  assert.equal(after.history.touches, before.history.touches, "legacy nearest-touch tally still learned from a press");
  assert.equal(after.history.boldnessDrift, before.history.boldnessDrift);
  assert.equal(after.history.sociabilityDrift, before.history.sociabilityDrift);
});

test("rapid repetition has diminishing returns and changes response style without going inert", () => {
  let state = base();
  const point = { x: state.individuals[0].x, y: state.individuals[0].y };
  const gains = [];
  const roles = [];

  for (let index = 0; index < 20; index += 1) {
    const before = totalFamiliarity(state);
    state = applyTouch(state, point.x, point.y);
    gains.push(totalFamiliarity(state) - before);
    const current = state.individuals.filter((fish) =>
      fish.viewerRelationship?.responseSequence === state.interactionSequence
      && fish.attention);
    assert.ok(current.length >= 1, `touch ${index + 1} lost its visible animal response`);
    roles.push(current[0].attention.role);
  }

  assert.ok(gains[0] > 0);
  assert.ok(gains.at(-1) < gains[0] * 0.3,
    `rapid repetition still paid ${(gains.at(-1) / gains[0]).toFixed(2)}x the first interaction`);
  assert.ok(viewerSaturationFor(state.individuals[0], state.elapsedRealSeconds) > 0.8);
  assert.equal(roles[0], "investigate");
  assert.ok(roles.some((role) => role !== "investigate"),
    `saturation never changed response style: ${roles.join(", ")}`);
});

test("short-term saturation decays naturally without changing long-term familiarity", () => {
  let state = base();
  const point = { x: state.individuals[0].x, y: state.individuals[0].y };
  for (let index = 0; index < 8; index += 1) state = applyTouch(state, point.x, point.y);

  const fish = state.individuals[0];
  const familiarity = fish.history.glassFamiliarity;
  const now = viewerSaturationFor(fish, state.elapsedRealSeconds);
  const later = viewerSaturationFor(
    fish,
    state.elapsedRealSeconds + VIEWER_SATURATION_HALF_LIFE_SECONDS * 2,
  );

  assert.ok(now > 0.8);
  assert.ok(later > 0 && later < now * 0.3);
  assert.ok(Math.abs(later - now * 0.25) < 1e-9);
  assert.equal(fish.history.glassFamiliarity, familiarity);
});

test("a saturated primary can hand the prominent response to a fresher cast member", () => {
  const state = stockedAquarium({ seed: 0x6b00b135, wallClockHours: 12 });
  const fish = state.individuals.slice(0, 2).map((one, index) => ({
    ...one,
    viewerRelationship: {
      saturation: index === 0 ? 0.9 : 0.1,
      saturationAt: 0,
    },
  }));
  const assignments = [
    { role: "investigate", distance: 2 },
    { role: "watch", distance: 3 },
  ];

  const shaped = shapeAttentionForSaturation(fish, assignments, { guarantee: true });
  assert.equal(shaped[0].role, "watch");
  assert.equal(shaped[1].role, "investigate");
});

test("remaining close to a held presence earns more than the initial response alone", () => {
  const original = base();
  const point = { x: original.individuals[0].x, y: original.individuals[0].y };
  const tap = applyTouch(original, point.x, point.y);
  const tapGain = tap.individuals[0].history.glassFamiliarity;

  let held = applyTouch(original, point.x, point.y);
  for (let step = 1; step <= 30; step += 1) {
    held = tick(held, 0.1);
    held = applyContact(held, point.x, point.y, step * 0.1);
  }
  held = applyRelease(held);

  assert.ok(held.individuals[0].history.glassFamiliarity > tapGain,
    "a fish that actually stayed at the viewer earned no engagement credit");
});

test("offline progression preserves familiarity, clears saturation, and fabricates no interactions", () => {
  const state = base();
  const seed = state.individuals[0].seed;
  const familiar = withObservedGlassFamiliarity(state, seed, 0.7);
  const touched = applyTouch(familiar, familiar.individuals[0].x, familiar.individuals[0].y);
  const before = touched.individuals[0];
  assert.ok(before.viewerRelationship);

  const advanced = advanceOffline(touched, 120 * 86400);
  const sameFish = advanced.individuals.find((fish) => fish.seed === seed);

  assert.ok(sameFish);
  assert.equal(sameFish.history.glassFamiliarity, before.history.glassFamiliarity);
  assert.equal(sameFish.history.touches, before.history.touches);
  assert.equal(sameFish.viewerRelationship, undefined);
  assert.equal(viewerSaturationFor(sameFish, advanced.elapsedRealSeconds), 0);
});

test("the persistent relationship footprint stays fixed-size and excludes saturation", () => {
  const state = base();
  const seed = state.individuals[0].seed;
  let familiar = state;
  for (let index = 0; index < 1000; index += 1) {
    familiar = withObservedGlassFamiliarity(familiar, seed, index / 999);
  }
  familiar = applyTouch(familiar, familiar.individuals[0].x, familiar.individuals[0].y);
  assert.ok(familiar.individuals[0].viewerRelationship);

  const saved = serializePersistentState(familiar);
  const history = saved.individuals[0].history;
  assert.deepEqual(
    Object.keys(history).sort(),
    ["boldnessDrift", "glassFamiliarity", "sociabilityDrift", "socialMemory", "touches"].sort(),
  );
  assert.equal(typeof history.glassFamiliarity, "number");
  assert.ok(history.glassFamiliarity >= 0 && history.glassFamiliarity <= 1);
  assert.equal(Object.values(history).filter(Array.isArray).length, 1, "only bounded social memory may be an array");
  assert.equal("viewerRelationship" in saved.individuals[0], false);
});

test("developer relationship snapshots expose long and short clocks beside fixed personality", () => {
  const state = base();
  const fish = state.individuals[0];
  const familiar = withObservedGlassFamiliarity(state, fish.seed, 0.5);
  const touched = applyTouch(familiar, fish.x, fish.y);
  const snapshot = relationshipSnapshot(touched.individuals[0], touched.elapsedRealSeconds);
  const roster = relationshipRoster(touched);

  assert.equal(snapshot.seed, fish.seed);
  assert.ok(snapshot.glassFamiliarity > 0.5);
  assert.ok(snapshot.attentionSaturation > 0);
  assert.ok(snapshot.fixedGlassAffinity >= 0 && snapshot.fixedGlassAffinity <= 1);
  assert.ok(snapshot.boldness >= 0 && snapshot.boldness <= 1);
  assert.ok(snapshot.curiosity >= 0 && snapshot.curiosity <= 1);
  assert.equal(roster.length, touched.individuals.length);
  assert.equal(roster[0].attentionSaturation, snapshot.attentionSaturation);
});

test("relationship round trips retain familiarity but discard short-term saturation", () => {
  const state = base();
  const seed = state.individuals[0].seed;
  const familiar = withObservedGlassFamiliarity(state, seed, 0.4);
  const touched = applyTouch(familiar, familiar.individuals[0].x, familiar.individuals[0].y);
  const restored = roundTrip(touched);

  assert.equal(restored.individuals[0].history.glassFamiliarity, touched.individuals[0].history.glassFamiliarity);
  assert.equal(restored.individuals[0].history.boldnessDrift, touched.individuals[0].history.boldnessDrift);
  assert.equal(restored.individuals[0].history.sociabilityDrift, touched.individuals[0].history.sociabilityDrift);
  assert.deepEqual(restored.individuals[0].history.socialMemory, touched.individuals[0].history.socialMemory);
  assert.equal(restored.individuals[0].viewerRelationship, undefined);
  assert.equal(viewerSaturationFor(restored.individuals[0]), 0);
});
