import assert from "node:assert/strict";
import test from "node:test";

import { CHASE_ARC_PHASES } from "../src/sim/chase-arc.js";
import { sceneTuning } from "../src/sim/choreography-tuning.js";
import { ACTIVITIES, createActivityState } from "../src/sim/fish-activities.js";
import {
  chaseEvasionForFish,
  chasePhase,
  chaseSemanticPhase,
} from "../src/sim/fish-choreography.js";
import { stockedAquarium } from "./support/aquarium.js";

function chasing(source, targetId, ageRealSeconds, x, y) {
  return {
    ...source,
    x,
    y,
    activity: {
      ...createActivityState(ACTIVITIES.playfulChase),
      ageRealSeconds,
      targetType: "fish",
      targetId,
    },
  };
}

test("a live chase outranks another chaser's stronger release coast", () => {
  const base = stockedAquarium({ seed: 7878, wallClockHours: 12 });
  const evaderSource = base.individuals[1];
  const activeSource = base.individuals[0];
  const releasingSource = base.individuals[2];
  const evader = { ...evaderSource, x: 24.7, y: 8, vx: 0.25, vy: 0 };

  // Past forcedEscapeStart, but near the outside of recognition, the live
  // escape is intentionally mild. A different chaser just entering release has
  // a numerically stronger coast. Arbitration must still pick the live chase.
  const active = chasing(activeSource, evader.seed, 3.2, 20, 8);
  const releasing = chasing(releasingSource, evader.seed, 6.25, 46, 9);
  const state = {
    ...base,
    individuals: base.individuals.map((fish, index) => (
      index === 0 ? active : index === 1 ? evader : index === 2 ? releasing : fish
    )),
  };

  const evasion = chaseEvasionForFish(evader, state);
  assert.ok(evasion, "two valid chasers produced no evasion");
  assert.equal(
    evasion.sourceSeed,
    active.seed,
    "release coast from an old chase displaced the currently active chase",
  );
});

test("production chase cannot rewind to engage after its escape opens the gap", () => {
  const state = stockedAquarium({ seed: 7878, wallClockHours: 12 });
  const tuning = sceneTuning(state, ACTIVITIES.playfulChase);

  assert.equal(chaseSemanticPhase(0.4, 6, tuning), CHASE_ARC_PHASES.engage);
  assert.equal(chaseSemanticPhase(1, 1.6, tuning), CHASE_ARC_PHASES.escape);
  assert.equal(
    chaseSemanticPhase(2.5, 6, tuning),
    CHASE_ARC_PHASES.escape,
    "widened gap restarted the opening instead of preserving the escape beat",
  );
  assert.equal(chasePhase(2.5, 6, tuning), "break");
});
