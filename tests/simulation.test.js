import assert from "node:assert/strict";
import test from "node:test";

import { DRIVE_MAXIMUM, WATERLINE_ROWS } from "../src/sim/config.js";
import { forageActivity } from "../src/sim/fish-motion.js";
import {
  advanceOffline,
  applyTouch,
  createAquariumState,
  restorePersistentState,
  serializePersistentState,
  withSettings,
} from "../src/sim/state.js";
import { tick } from "../src/sim/tick.js";

function run(state, count, dt = 0.1) {
  let result = state;
  for (let index = 0; index < count; index += 1) result = tick(result, dt);
  return result;
}

test("the same seed and inputs produce an identical run", () => {
  const options = { orientation: "landscape", seed: 123456, wallClockHours: 14.25 };
  const left = run(createAquariumState(options), 120);
  const right = run(createAquariumState(options), 120);
  assert.deepEqual(left, right);
});

test("tick is pure and leaves its input untouched", () => {
  const state = createAquariumState({ orientation: "portrait", seed: 44, wallClockHours: 8 });
  const snapshot = structuredClone(state);
  const next = tick(state, 0.1);
  assert.deepEqual(state, snapshot);
  assert.notStrictEqual(next, state);
  assert.notStrictEqual(next.school, state.school);
  assert.notStrictEqual(next.individuals, state.individuals);
});

test("touch response is immediate, reproducible, and not probabilistic", () => {
  const state = createAquariumState({ orientation: "landscape", seed: 7, wallClockHours: 12 });
  const first = applyTouch(state, 20, 9);
  const second = applyTouch(state, 20, 9);
  assert.deepEqual(first, second);
  assert.deepEqual(first.reaction, { x: 20, y: 9, ageSeconds: 0, durationSeconds: 3.2 });
  assert.notDeepEqual(first.school[0], state.school[0]);
  assert.equal(first.individuals.reduce((sum, fish) => sum + fish.history.touches, 0), 1);
});

test("individual facing uses hysteresis and a deterministic turn pose", () => {
  const base = createAquariumState({ orientation: "landscape", seed: 71, wallClockHours: 12 });
  const withVelocity = (vx) => ({
    ...base,
    individuals: base.individuals.map((fish, index) => index === 0
      ? {
        ...fish,
        vx,
        visual: { facing: 1, targetFacing: 1, turnProgress: 1 },
      }
      : fish),
  });

  const indecisive = tick(withVelocity(-0.05), 0.01).individuals[0];
  assert.equal(indecisive.visual.facing, 1);
  assert.equal(indecisive.visual.targetFacing, 1);
  assert.equal(indecisive.visual.turnProgress, 1);
  assert.ok(Number.isFinite(indecisive.visual.pitch));
  assert.ok(Number.isFinite(indecisive.visual.targetPitch));

  const turning = tick(withVelocity(-0.7), 0.01).individuals[0];
  assert.equal(turning.visual.facing, 1);
  assert.equal(turning.visual.targetFacing, -1);
  assert.ok(turning.visual.turnProgress > 0 && turning.visual.turnProgress < 0.1);
});

test("bounded emergence keeps fish visible and drives away from extremes", () => {
  const state = createAquariumState({ orientation: "portrait", seed: 9001, wallClockHours: 2 });
  const result = run(state, 2000);
  for (const fish of result.individuals) {
    assert.ok(fish.x >= 0 && fish.x <= result.cols);
    assert.ok(fish.y >= WATERLINE_ROWS && fish.y < result.rows - 4);
    assert.ok(Object.values(fish.drives).every((drive) => drive >= 0.15 && drive <= 0.85));
  }
  assert.ok(result.individuals.slice(0, 3).every((fish) => fish.y < WATERLINE_ROWS + (result.rows - 6) * 0.68));
});

test("week-per-second acceleration exposes plant growth without removing entities", () => {
  const state = withSettings(createAquariumState({ orientation: "portrait", seed: 3 }), { timeScale: 604800 });
  const ages = state.plants.map((plant) => plant.ageDays);
  const result = run(state, 50);
  assert.equal(result.plants.length, state.plants.length);
  assert.equal(result.individuals.length, state.individuals.length);
  assert.ok(result.plants.every((plant, index) => plant.ageDays > ages[index] + 30));
});

test("persistence stores individuals and plants but not the identity-free school", () => {
  const base = createAquariumState({ orientation: "landscape", seed: 81 });
  const evolved = run(applyTouch(base, 12, 8), 30);
  const saved = serializePersistentState(evolved);
  assert.equal("school" in saved, false);
  assert.ok(saved.individuals.every((fish) => !("activity" in fish)));
  const restored = restorePersistentState(base, saved);
  for (let index = 0; index < restored.individuals.length; index += 1) {
    const { activity: restoredActivity, ...restoredPersistent } = restored.individuals[index];
    const { activity: evolvedActivity, ...evolvedPersistent } = evolved.individuals[index];
    assert.deepEqual(restoredPersistent, evolvedPersistent);
    assert.equal(restoredActivity.current, evolvedPersistent.behavior.current);
    assert.equal(restoredActivity.targetType, null);
    assert.equal(evolvedActivity.current, "touch-react");
  }
  assert.deepEqual(restored.plants, evolved.plants);
  assert.deepEqual(restored.school, base.school);
});

test("offline time advances the long horizon without simulating loss", () => {
  const state = createAquariumState({ orientation: "landscape", seed: 19 });
  const advanced = advanceOffline(state, 14 * 86400);
  assert.equal(advanced.individuals.length, state.individuals.length);
  assert.equal(advanced.plants.length, state.plants.length);
  assert.ok(advanced.totalDays >= 14);
  assert.ok(advanced.plants[0].ageDays >= state.plants[0].ageDays + 14);
});

test("simulated speed does not change how a fish behaves in real time", () => {
  // Hunger accrues on simulated time while answering it - swimming down to the
  // substrate - costs real time. If the two are allowed to diverge, raising the
  // time scale starves the cast and shreds the pace of behavior change, so the
  // same real-time budget must produce the same life at any speed.
  const sample = (timeScale) => {
    let state = withSettings(
      createAquariumState({ orientation: "landscape", seed: 5, wallClockHours: 12 }),
      { timeScale },
    );
    let previous = state.individuals.map((fish) => fish.behavior.current);
    let switches = 0;
    let searching = 0;
    let starving = 0;
    let samples = 0;

    for (let step = 0; step < 6000; step += 1) {
      state = tick(state, 0.1);
      state.individuals.forEach((fish, index) => {
        if (fish.behavior.current !== previous[index]) {
          switches += 1;
          previous[index] = fish.behavior.current;
        }
        if (index < 3) return;
        samples += 1;
        if (forageActivity(fish, index, state).searching) searching += 1;
        if (fish.drives.hunger >= DRIVE_MAXIMUM - 1e-6) starving += 1;
      });
    }
    return { switches, searching: searching / samples, starving: starving / samples };
  };

  const hourPerSecond = sample(3600);
  for (const timeScale of [86400, 604800]) {
    const fast = sample(timeScale);
    assert.ok(
      Math.abs(fast.searching - hourPerSecond.searching) < 0.03,
      `feeding at ${timeScale}x drifted to ${(fast.searching * 100).toFixed(1)}% `
        + `from ${(hourPerSecond.searching * 100).toFixed(1)}%`,
    );
    assert.ok(
      Math.abs(fast.switches - hourPerSecond.switches) / hourPerSecond.switches < 0.3,
      `behavior changed ${fast.switches} times at ${timeScale}x against ${hourPerSecond.switches} at 3600x`,
    );
    assert.ok(
      fast.starving < 0.4,
      `fish sat at maximum hunger ${(fast.starving * 100).toFixed(1)}% of the run at ${timeScale}x`,
    );
  }
});
