import assert from "node:assert/strict";
import test from "node:test";

import {
  ACTIVITIES,
  createActivityState,
  preferredCompanion,
} from "../src/sim/fish-activities.js";
import {
  MAX_SOCIAL_MEMORY,
  sanitizeSocialMemory,
  updateSocialMemories,
} from "../src/sim/fish-personality.js";
import {
  createAquariumState,
  restorePersistentState,
  serializePersistentState,
  withSettings,
} from "../src/sim/state.js";
import { tick } from "../src/sim/tick.js";

function socialFish(fish, targetSeed, x, y) {
  return {
    ...fish,
    x,
    y,
    behavior: { current: "social", previous: "cruise", blend: 0, ageSeconds: 0 },
    activity: {
      ...createActivityState(ACTIVITIES.individualFollow),
      targetType: "fish",
      targetId: targetSeed,
    },
    history: { ...fish.history, socialMemory: [] },
  };
}

function evolveMemory(individuals, frames = 1200, dt = 0.25) {
  let result = individuals;
  for (let frame = 0; frame < frames; frame += 1) result = updateSocialMemories(result, dt);
  return result;
}

test("new fish begin without fake learned relationships", () => {
  for (const count of [5, 6]) {
    const state = createAquariumState({ orientation: "landscape", seed: 91 });
    assert.ok(state.individuals.slice(0, count).every((fish) => fish.history.socialMemory.length === 0));
  }
});

test("familiarity grows from visible proximity and not from a distant shared state label", () => {
  const base = createAquariumState({ orientation: "landscape", seed: 300 });
  const left = base.individuals[0];
  const right = base.individuals[1];
  const near = [
    socialFish(left, right.seed, 20, 8),
    socialFish(right, left.seed, 21, 8.2),
  ];
  const far = [
    socialFish(left, right.seed, 4, 6),
    socialFish(right, left.seed, 60, 14),
  ];
  const nearResult = evolveMemory(near);
  const farResult = evolveMemory(far);
  assert.ok(nearResult[0].history.socialMemory[0].familiarity > 0.1);
  assert.ok(nearResult[1].history.socialMemory[0].familiarity > 0.1);
  assert.deepEqual(farResult[0].history.socialMemory, []);
  assert.deepEqual(farResult[1].history.socialMemory, []);
});

test("social memory is hard-bounded, seed-addressed, and cannot remember self", () => {
  const base = createAquariumState({ orientation: "landscape", seed: 512 });
  const eight = Array.from({ length: 8 }, (_, index) => {
    const source = base.individuals[index % base.individuals.length];
    return {
      ...source,
      seed: (source.seed + index * 7919 + 1) >>> 0,
      x: 20 + (index % 3) * 0.12,
      y: 8 + (index % 2) * 0.12,
      history: { ...source.history, socialMemory: [] },
      activity: createActivityState(ACTIVITIES.openWaterRest),
      behavior: { current: "rest", previous: "cruise", blend: 1, ageSeconds: 10 },
    };
  });
  const result = evolveMemory(eight, 400);
  for (const fish of result) {
    assert.ok(fish.history.socialMemory.length <= MAX_SOCIAL_MEMORY);
    assert.ok(fish.history.socialMemory.every((entry) => entry.seed !== fish.seed));
    assert.ok(fish.history.socialMemory.every((entry) => Number.isFinite(entry.familiarity)
      && entry.familiarity >= 0 && entry.familiarity <= 1));
  }
});

test("malformed, duplicate, and self relationships are clamped and rejected deterministically", () => {
  const selfSeed = 99;
  const available = new Set([99, 101, 102, 103]);
  const cleaned = sanitizeSocialMemory([
    { seed: 99, familiarity: 1 },
    { seed: 101, familiarity: 0.2 },
    { seed: 101, familiarity: 0.8 },
    { seed: 102, familiarity: Number.POSITIVE_INFINITY },
    { seed: -1, familiarity: 0.5 },
    { seed: 103, familiarity: 4 },
    { seed: 200, familiarity: 0.9 },
  ], selfSeed, available);
  assert.deepEqual(cleaned, [
    { seed: 103, familiarity: 1 },
    { seed: 101, familiarity: 0.8 },
  ]);
});

test("a familiar fish wins companion selection over a merely compatible stranger", () => {
  const base = createAquariumState({ orientation: "landscape", seed: 701 });
  const subject = {
    ...base.individuals[0],
    x: 20,
    y: 8,
    history: {
      ...base.individuals[0].history,
      socialMemory: [
        { seed: base.individuals[1].seed, familiarity: 0.85 },
        { seed: base.individuals[2].seed, familiarity: 0.03 },
      ],
    },
  };
  const state = {
    ...base,
    individuals: base.individuals.map((fish, index) => index === 0
      ? subject
      : index === 1 || index === 2
        ? { ...fish, x: 24, y: 8 }
        : fish),
  };
  assert.equal(preferredCompanion(subject, 0, state).fish.seed, base.individuals[1].seed);

  const reordered = {
    ...state,
    individuals: [state.individuals[2], state.individuals[0], state.individuals[1], ...state.individuals.slice(3)],
  };
  assert.equal(preferredCompanion(subject, 1, reordered).fish.seed, base.individuals[1].seed);
});

test("learned memory survives persistence while Phase 1 saves start empty", () => {
  const base = createAquariumState({ orientation: "portrait", seed: 808 });
  const companionSeed = base.individuals[1].seed;
  const learned = {
    ...base,
    individuals: base.individuals.map((fish, index) => index === 0
      ? {
        ...fish,
        history: { ...fish.history, socialMemory: [{ seed: companionSeed, familiarity: 0.64 }] },
      }
      : fish),
  };
  const saved = serializePersistentState(learned);
  const restored = restorePersistentState(base, saved);
  assert.deepEqual(restored.individuals[0].history.socialMemory, [{ seed: companionSeed, familiarity: 0.64 }]);
  assert.ok(saved.individuals.every((fish) => !("activity" in fish)));

  for (const fish of saved.individuals) delete fish.history.socialMemory;
  const phase1 = restorePersistentState(base, saved);
  assert.ok(phase1.individuals.every((fish) => fish.history.socialMemory.length === 0));
});

test("restore remains safe for the supported five-to-eight fish range", () => {
  const base = createAquariumState({ orientation: "landscape", seed: 990 });
  const saved = serializePersistentState(base);
  const five = { ...saved, individuals: saved.individuals.slice(0, 5) };
  assert.equal(restorePersistentState(base, five).individuals.length, 5);

  const eight = structuredClone(saved);
  for (let index = 0; index < 2; index += 1) {
    eight.individuals.push({
      ...structuredClone(saved.individuals[index]),
      seed: (saved.individuals[index].seed ^ (0x5f3759df + index)) >>> 0,
    });
  }
  const restored = restorePersistentState(base, eight);
  assert.equal(restored.individuals.length, 8);
  assert.equal(new Set(restored.individuals.map((fish) => fish.seed)).size, 8);
  assert.ok(restored.individuals.every((fish) => fish.history.socialMemory.length <= MAX_SOCIAL_MEMORY));
});

test("social need relief and sociability drift require actual physical engagement", () => {
  const base = withSettings(createAquariumState({ orientation: "landscape", seed: 404 }), { timeScale: 3600 });
  const left = base.individuals[0];
  const right = base.individuals[1];
  const make = (distance) => {
    const first = socialFish(left, right.seed, 20, 8);
    const second = { ...right, x: 20 + distance, y: 8, history: { ...right.history, socialMemory: [] } };
    return {
      ...base,
      individuals: base.individuals.map((fish, index) => index === 0 ? first : index === 1 ? second : fish),
    };
  };
  const nearState = make(1.2);
  const farState = make(20);
  const near = tick(nearState, 0.1).individuals[0];
  const far = tick(farState, 0.1).individuals[0];
  assert.ok(near.drives.social < far.drives.social, "crossing the aquarium received full social relief");
  assert.ok(near.history.sociabilityDrift > far.history.sociabilityDrift);
});

test("being near the school also provides truthful social relief", () => {
  const base = withSettings(createAquariumState({ orientation: "landscape", seed: 505 }), { timeScale: 3600 });
  // Company means school fish within reach, not the school's aggregate center,
  // which can sit in open water when the shoal is spread out.
  const densest = base.school.reduce((best, fish) => {
    const neighbors = base.school.filter((other) => Math.hypot(other.x - fish.x, other.y - fish.y) < 4.6).length;
    return neighbors > best.neighbors ? { fish, neighbors } : best;
  }, { fish: base.school[0], neighbors: 0 }).fish;
  const make = (x, y) => ({
    ...base,
    individuals: base.individuals.map((fish, index) => index === 0
      ? {
        ...fish,
        x,
        y,
        behavior: { current: "social", previous: "cruise", blend: 0, ageSeconds: 0 },
        activity: { ...createActivityState(ACTIVITIES.schoolFollow), targetType: "school" },
      }
      : fish),
  });
  const near = tick(make(densest.x, densest.y), 0.1).individuals[0];
  const far = tick(make(2, base.rows - 5), 0.1).individuals[0];
  assert.ok(near.drives.social < far.drives.social);
});

test("tick remains pure through nested activity targets and social-memory arrays", () => {
  const base = createAquariumState({ orientation: "landscape", seed: 610 });
  const state = {
    ...base,
    individuals: base.individuals.map((fish, index) => ({
      ...fish,
      history: {
        ...fish.history,
        socialMemory: index === 0 ? [{ seed: base.individuals[1].seed, familiarity: 0.3 }] : [],
      },
      activity: index === 0
        ? {
          ...createActivityState(ACTIVITIES.individualFollow),
          targetType: "fish",
          targetId: base.individuals[1].seed,
        }
        : fish.activity,
    })),
  };
  const snapshot = structuredClone(state);
  const next = tick(state, 0.1);
  assert.deepEqual(state, snapshot);
  assert.notStrictEqual(next.individuals[0].history.socialMemory, state.individuals[0].history.socialMemory);
  assert.notStrictEqual(next.individuals[0].activity, state.individuals[0].activity);
});

test("accelerated Phase 2 simulations remain finite and bounded", () => {
  let state = withSettings(createAquariumState({ orientation: "portrait", seed: 1234 }), { timeScale: 604800 });
  for (let frame = 0; frame < 300; frame += 1) state = tick(state, 0.1);
  for (const fish of state.individuals) {
    assert.ok(Number.isFinite(fish.x) && Number.isFinite(fish.y));
    assert.ok(Number.isFinite(fish.vx) && Number.isFinite(fish.vy));
    assert.ok(Number.isFinite(fish.activity.ageRealSeconds));
    assert.ok(fish.activity.ageRealSeconds >= 0 && fish.activity.ageRealSeconds <= 55);
    assert.ok(fish.history.socialMemory.length <= MAX_SOCIAL_MEMORY);
    assert.ok(fish.history.socialMemory.every((entry) => Number.isFinite(entry.familiarity)
      && entry.familiarity >= 0 && entry.familiarity <= 1));
  }
});
