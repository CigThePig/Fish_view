import assert from "node:assert/strict";
import test from "node:test";

import { WATERLINE_ROWS } from "../src/sim/config.js";
import { MAX_FISH_PITCH_DEGREES, forageActivity, forageEligible, substrateGrazeY, substrateSafeY, surfaceSafeY } from "../src/sim/fish-motion.js";
import { substrateSurfaceY, waterSurfaceY } from "../src/sim/environment.js";
import {
  createAquariumState,
  restorePersistentState,
  serializePersistentState,
  withSettings,
} from "../src/sim/state.js";
import { tick, trajectoryPitchDegrees } from "../src/sim/tick.js";

function run(state, count, dt = 0.1) {
  let result = state;
  for (let index = 0; index < count; index += 1) result = tick(result, dt);
  return result;
}

test("new individuals start with bounded level pitch state", () => {
  for (const orientation of ["landscape", "portrait"]) {
    const state = createAquariumState({ orientation, seed: 912 });
    for (const fish of state.individuals) {
      assert.equal(fish.visual.pitch, 0);
      assert.equal(fish.visual.targetPitch, 0);
      assert.ok(Math.abs(fish.visual.pitch) <= MAX_FISH_PITCH_DEGREES);
    }
  }
});

test("trajectory pitch has a dead zone, readable sign, and hard bound", () => {
  assert.equal(trajectoryPitchDegrees(0.35, 0.01), 0);
  assert.equal(trajectoryPitchDegrees(-0.35, -0.02), 0);
  assert.ok(trajectoryPitchDegrees(0.28, 0.22) > 15, "downward travel should pitch nose-down");
  assert.ok(trajectoryPitchDegrees(-0.28, -0.22) < -15, "upward travel should pitch nose-up");
  assert.equal(trajectoryPitchDegrees(0.00001, 0.00001), 0);
  assert.equal(trajectoryPitchDegrees(0.01, 50), MAX_FISH_PITCH_DEGREES);
  assert.equal(trajectoryPitchDegrees(-0.01, -50), -MAX_FISH_PITCH_DEGREES);
});

test("visual pitch is deterministic, smooth, and remains real-time under accelerated biology", () => {
  const base = createAquariumState({ orientation: "landscape", seed: 220, wallClockHours: 12 });
  const diving = {
    ...base,
    reaction: { x: base.individuals[0].x + 1, y: base.individuals[0].y + 8, ageSeconds: 0, durationSeconds: 3.2 },
    individuals: base.individuals.map((fish, index) => index === 0
      ? { ...fish, vx: 0.25, vy: 0.8, visual: { ...fish.visual, pitch: 0, targetPitch: 0 } }
      : fish),
  };
  const normal = tick(diving, 0.1);
  const repeat = tick(diving, 0.1);
  assert.deepEqual(normal.individuals[0].visual, repeat.individuals[0].visual);
  assert.ok(normal.individuals[0].visual.targetPitch > 0);
  assert.ok(normal.individuals[0].visual.pitch > 0);
  assert.ok(normal.individuals[0].visual.pitch < normal.individuals[0].visual.targetPitch, "one frame snapped to target pitch");

  // Accelerated simulation time is allowed to change biological intent, so the
  // target itself need not equal the real-time run. What must remain real-time
  // is the visual response: one 100 ms frame may only ease partway from level.
  const accelerated = tick(withSettings(diving, { timeScale: 604800 }), 0.1);
  const acceleratedVisual = accelerated.individuals[0].visual;
  assert.ok(Number.isFinite(acceleratedVisual.pitch));
  assert.ok(Number.isFinite(acceleratedVisual.targetPitch));
  assert.ok(Math.abs(acceleratedVisual.pitch) <= MAX_FISH_PITCH_DEGREES);
  assert.ok(Math.abs(acceleratedVisual.targetPitch) <= MAX_FISH_PITCH_DEGREES);
  assert.ok(Math.abs(acceleratedVisual.pitch) < Math.abs(acceleratedVisual.targetPitch), "accelerated biology snapped visual pitch to its target");
  assert.ok(Math.abs(acceleratedVisual.pitch) < MAX_FISH_PITCH_DEGREES * 0.4, "one accelerated frame rotated too far");
});

test("horizontal turn state remains valid while pitch changes", () => {
  const base = createAquariumState({ orientation: "landscape", seed: 71, wallClockHours: 12 });
  const state = {
    ...base,
    individuals: base.individuals.map((fish, index) => index === 4
      ? {
        ...fish,
        vx: -0.7,
        vy: 0.34,
        visual: { facing: 1, targetFacing: 1, turnProgress: 1, pitch: -8, targetPitch: -8 },
      }
      : fish),
  };
  const next = tick(state, 0.05).individuals[4];
  assert.equal(next.visual.facing, 1);
  assert.equal(next.visual.targetFacing, -1);
  assert.ok(next.visual.turnProgress > 0 && next.visual.turnProgress < 1);
  assert.ok(Number.isFinite(next.visual.pitch));
  assert.ok(Math.abs(next.visual.pitch) <= MAX_FISH_PITCH_DEGREES);
});

test("old saves without pitch fields restore safely at level", () => {
  const base = createAquariumState({ orientation: "portrait", seed: 904 });
  const saved = serializePersistentState(run(base, 12));
  for (const fish of saved.individuals) {
    delete fish.visual.pitch;
    delete fish.visual.targetPitch;
  }
  const restored = restorePersistentState(base, saved);
  assert.equal(restored.individuals.length, saved.individuals.length);
  for (const fish of restored.individuals) {
    assert.equal(fish.visual.pitch, 0);
    assert.equal(fish.visual.targetPitch, 0);
  }

  saved.individuals[0].visual.pitch = Number.POSITIVE_INFINITY;
  saved.individuals[0].visual.targetPitch = -999;
  const corrupted = restorePersistentState(base, saved).individuals[0];
  assert.equal(corrupted.visual.pitch, 0);
  assert.equal(corrupted.visual.targetPitch, -MAX_FISH_PITCH_DEGREES);
});

test("the permanent mid-water cast cannot select or receive successful forage", () => {
  const base = createAquariumState({ orientation: "landscape", seed: 17, wallClockHours: 12 });
  assert.deepEqual(base.individuals.map((_, index) => forageEligible(index)), [false, false, false, true, true, true]);
  const forced = {
    ...base,
    individuals: base.individuals.map((fish, index) => index < 3
      ? {
        ...fish,
        drives: { ...fish.drives, hunger: 0.8 },
        behavior: { current: "forage", previous: "cruise", blend: 1, ageSeconds: 100 },
      }
      : fish),
  };
  const next = tick(forced, 0.1);
  for (let index = 0; index < 3; index += 1) {
    assert.notEqual(next.individuals[index].behavior.current, "forage");
    assert.equal(forageActivity(next.individuals[index], index, next).searching, false);
    assert.ok(next.individuals[index].drives.hunger >= forced.individuals[index].drives.hunger);
  }
});

test("permanent mid-water cast keeps its clearance-adjusted ceiling during long runs", () => {
  let state = createAquariumState({ orientation: "landscape", seed: 0, wallClockHours: 12 });
  for (let frame = 0; frame < 4000; frame += 1) {
    state = tick(state, 0.1);
    for (const fish of state.individuals.slice(0, 3)) {
      const clearanceAdjustedBottom = substrateSafeY(fish, state, fish.x);
      const ceiling = WATERLINE_ROWS
        + Math.max(0, clearanceAdjustedBottom - WATERLINE_ROWS) * 0.68;
      assert.ok(
        fish.y <= ceiling + 1e-10,
        `protected fish drifted below clearance-adjusted ceiling: ${fish.y} > ${ceiling}`,
      );
    }
  }
});

test("hunger relief begins only after a forage fish reaches the real substrate search zone", () => {
  const base = withSettings(createAquariumState({ orientation: "landscape", seed: 501, wallClockHours: 12 }), { timeScale: 3600 });
  const index = 3;
  const source = base.individuals[index];
  const onFloor = {
    ...source,
    x: 22.5,
    drives: { ...source.drives, hunger: 0.7 },
    behavior: { current: "forage", previous: "cruise", blend: 0, ageSeconds: 2 },
  };
  // The search zone is the graze line, not the swimming envelope: a fish is
  // working the substrate when its mouth is at the sand, and the envelope that
  // keeps a fish crossing open water clear of terrain sits well above that.
  onFloor.y = substrateGrazeY(onFloor, base, onFloor.x, index);
  const above = { ...onFloor, y: onFloor.y - 2 };
  const nearState = { ...base, individuals: base.individuals.map((fish, i) => i === index ? onFloor : fish) };
  const farState = { ...base, individuals: base.individuals.map((fish, i) => i === index ? above : fish) };
  assert.equal(forageActivity(onFloor, index, nearState).searching, true);
  assert.equal(forageActivity(above, index, farState).searching, false);

  const near = tick(nearState, 0.1).individuals[index];
  const far = tick(farState, 0.1).individuals[index];
  assert.ok(near.drives.hunger < onFloor.drives.hunger, "actual substrate search did not relieve hunger");
  assert.ok(far.drives.hunger > above.drives.hunger, "approaching the substrate incorrectly relieved hunger");
});

test("fish clearance follows the deterministic terrain and moving surface helpers", () => {
  const state = createAquariumState({ orientation: "landscape", seed: 91, wallClockHours: 12 });
  const fish = state.individuals[4];
  const xs = Array.from({ length: 20 }, (_, index) => 2 + index * 2.7);
  const terrain = xs.map((x) => substrateSurfaceY(state, x));
  const safe = xs.map((x) => substrateSafeY(fish, state, x));
  const clearance = terrain[0] - safe[0];
  assert.ok(Math.max(...terrain) - Math.min(...terrain) > 0.05);
  for (let index = 0; index < xs.length; index += 1) {
    assert.ok(Math.abs((terrain[index] - safe[index]) - clearance) < 1e-10);
    assert.ok(surfaceSafeY(fish, state, xs[index]) > waterSurfaceY(state, xs[index]));
  }
});

test("accelerated simulation keeps pitch and forage state finite and bounded", () => {
  let state = withSettings(createAquariumState({ orientation: "portrait", seed: 700 }), { timeScale: 604800 });
  for (let frame = 0; frame < 120; frame += 1) state = tick(state, 0.1);
  for (const fish of state.individuals) {
    assert.ok(Number.isFinite(fish.x) && Number.isFinite(fish.y));
    assert.ok(Number.isFinite(fish.visual.pitch) && Number.isFinite(fish.visual.targetPitch));
    assert.ok(Math.abs(fish.visual.pitch) <= MAX_FISH_PITCH_DEGREES);
    assert.ok(Math.abs(fish.visual.targetPitch) <= MAX_FISH_PITCH_DEGREES);
  }
  assert.ok(state.individuals.slice(0, 3).every((fish) => fish.behavior.current !== "forage"));
});
