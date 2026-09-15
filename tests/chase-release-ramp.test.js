import assert from "node:assert/strict";
import test from "node:test";

import { ACTIVITIES, createActivityState } from "../src/sim/fish-activities.js";
import { choreographyFor, steerActivityVelocity } from "../src/sim/fish-choreography.js";
import { sceneTuning } from "../src/sim/choreography-tuning.js";
import { stockedAquarium } from "./support/aquarium.js";

function breakTarget(state, fish) {
  const tuning = sceneTuning(state, ACTIVITIES.playfulChase);
  return {
    x: fish.x + 4,
    y: fish.y,
    speed: tuning.breakGlideSpeed,
    postureBias: 0,
    companionTarget: true,
    playfulChase: true,
    chaseTuning: tuning,
    choreographyPhase: "break",
    choreography: choreographyFor(state, ACTIVITIES.playfulChase, "playful-chase:break"),
  };
}

function chaseFish(source, ageRealSeconds) {
  return {
    ...source,
    vx: 2.9,
    vy: 0,
    activity: {
      ...createActivityState(ACTIVITIES.playfulChase),
      ageRealSeconds,
      targetType: "fish",
      targetId: 12345,
    },
  };
}

test("first ending-break frame eases down from intercept speed instead of snapping to the break cap", () => {
  const state = stockedAquarium({ seed: 4242, wallClockHours: 12 });
  // Steering receives the pre-tick fish while the target has already been
  // resolved from the activity after this 0.1s frame. 6.15 -> 6.25 therefore
  // crosses the authored 6.2s break boundary in this call.
  const fish = chaseFish(state.individuals[0], 6.15);
  const steered = steerActivityVelocity(fish, breakTarget(state, fish), {
    realDelta: 0.1,
    motionScale: 1,
    behaviorBlend: 1,
  });
  const speed = Math.hypot(steered.vx, steered.vy);

  assert.ok(speed > 2.4, `first break frame collapsed to ${speed.toFixed(3)} rows/s`);
  assert.ok(speed < 2.9, `first break frame did not begin decelerating: ${speed.toFixed(3)} rows/s`);
});

test("opening chase hesitation still uses the quiet break profile", () => {
  const state = stockedAquarium({ seed: 4242, wallClockHours: 12 });
  const fish = chaseFish(state.individuals[0], 1);
  const steered = steerActivityVelocity(fish, breakTarget(state, fish), {
    realDelta: 0.1,
    motionScale: 1,
    behaviorBlend: 1,
  });
  const speed = Math.hypot(steered.vx, steered.vy);

  assert.ok(speed <= 0.421, `opening hesitation inherited ending release speed: ${speed.toFixed(3)} rows/s`);
});
