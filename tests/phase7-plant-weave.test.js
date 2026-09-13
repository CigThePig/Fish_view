import assert from "node:assert/strict";
import test from "node:test";

import {
  ACTIVITIES,
  WEAVE_ROUTE_STAGE_COUNT,
  resolveActivityTarget,
} from "../src/sim/fish-activities.js";
import * as core from "../src/sim/fish-activities-core.js";
import {
  createShowcaseState,
  showcaseSubjects,
  showcaseTarget,
  tickShowcase,
} from "../src/dev/behavior-showcase.js";
import { hashSeed } from "../src/sim/prng.js";

function subject(state, activity = ACTIVITIES.plantWeave) {
  return showcaseSubjects(state, activity)[0];
}

function runWeave(label) {
  let state = createShowcaseState({ scenario: ACTIVITIES.plantWeave, seed: hashSeed(label) });
  const seen = new Map();
  const transitions = [];
  let exit = null;

  for (let step = 0; step < 420; step += 1) {
    const { index, fish } = subject(state);
    if (fish.activity.current !== ACTIVITIES.plantWeave) {
      exit = { seconds: step * 0.1, activity: fish.activity.current };
      break;
    }
    const target = showcaseTarget(state, ACTIVITIES.plantWeave);
    assert.ok(target);
    if (!seen.has(target.weaveStage)) {
      seen.set(target.weaveStage, {
        stage: target.weaveStage,
        leg: target.weaveLeg,
        plantSeed: target.weavePlantSeed,
        plantX: target.weavePlantX,
        side: target.weaveSide,
        x: target.x,
        y: target.y,
        seconds: step * 0.1,
      });
    }

    const distance = Math.hypot(target.x - fish.x, target.y - fish.y);
    const next = tickShowcase(state, 0.1, ACTIVITIES.plantWeave);
    const nextFish = next.individuals[index];
    if (nextFish.activity.current === ACTIVITIES.plantWeave) {
      const nextTarget = showcaseTarget(next, ACTIVITIES.plantWeave);
      if (nextTarget.weaveStage > target.weaveStage) {
        transitions.push({
          from: target.weaveStage,
          to: nextTarget.weaveStage,
          distance,
          radius: target.weaveArrivalRadius,
          stageAge: fish.activity.ageRealSeconds - (fish.activity.weaveStageStartedAt ?? 0),
          timeout: target.weaveLegTimeoutSeconds,
        });
      }
    } else {
      exit = {
        seconds: (step + 1) * 0.1,
        activity: nextFish.activity.current,
        fromStage: target.weaveStage,
        distance,
        radius: target.weaveArrivalRadius,
      };
      state = next;
      break;
    }
    state = next;
  }
  return { seen, transitions, exit };
}

test("plant weave no longer advances because activity age changed", () => {
  const state = createShowcaseState({ scenario: ACTIVITIES.plantWeave });
  const { index, fish } = subject(state);
  const first = showcaseTarget(state, ACTIVITIES.plantWeave);
  const agedFish = { ...fish, activity: { ...fish.activity, ageRealSeconds: 999 } };
  const agedState = {
    ...state,
    individuals: state.individuals.map((entry, slot) => slot === index ? agedFish : entry),
  };
  const aged = resolveActivityTarget(agedFish, index, agedState, agedFish.activity);
  assert.equal(first.weaveStage, 0);
  assert.equal(aged.weaveStage, 0);
  assert.equal(aged.weaveLeg, first.weaveLeg);
  assert.equal(aged.x, first.x);
  assert.equal(aged.y, first.y);
});

test("six deterministic production routes physically cross both plants and emerge", () => {
  for (const label of [
    "phase7-weave-a",
    "phase7-weave-b",
    "phase7-weave-c",
    "phase7-weave-d",
    "phase7-weave-e",
    "phase7-weave-f",
  ]) {
    const result = runWeave(label);
    assert.deepEqual([...result.seen.keys()], [0, 1, 2, 3, 4], `${label}: route skipped a leg`);
    assert.deepEqual(
      result.transitions.map(({ from, to }) => [from, to]),
      [[0, 1], [1, 2], [2, 3], [3, 4]],
      `${label}: route progression was not ordered`,
    );
    for (const transition of result.transitions) {
      assert.ok(
        transition.distance <= transition.radius + 0.08,
        `${label}: stage ${transition.from} advanced ${transition.distance.toFixed(2)} rows from its waypoint`,
      );
      assert.ok(
        transition.stageAge < transition.timeout,
        `${label}: stage ${transition.from} used the safety timeout instead of traversal`,
      );
    }
    assert.ok(result.exit, `${label}: route did not finish`);
    assert.equal(result.exit.fromStage, WEAVE_ROUTE_STAGE_COUNT - 1, `${label}: route exited before emergence`);
    assert.ok(result.exit.distance <= result.exit.radius + 0.08, `${label}: route ended before reaching emergence`);
    assert.ok(result.exit.seconds < 32, `${label}: route took too long to read`);

    const entry = result.seen.get(0);
    const primaryCross = result.seen.get(1);
    const gap = result.seen.get(2);
    const secondaryCross = result.seen.get(3);
    const emerge = result.seen.get(4);
    assert.equal(entry.plantSeed, primaryCross.plantSeed);
    assert.equal(entry.side, -primaryCross.side, `${label}: primary plant was not crossed`);
    assert.equal(gap.plantSeed, secondaryCross.plantSeed);
    assert.equal(gap.side, -secondaryCross.side, `${label}: secondary plant was not crossed`);
    assert.equal(emerge.plantSeed, secondaryCross.plantSeed);
    assert.equal(emerge.side, secondaryCross.side);
    assert.ok(
      Math.abs(emerge.x - emerge.plantX) > Math.abs(secondaryCross.x - secondaryCross.plantX) + 1,
      `${label}: final leg did not emerge beyond the vegetation`,
    );
  }
});

test("plant investigation and shelter targets remain delegated to the frozen implementation", () => {
  for (const activity of [ACTIVITIES.plantInvestigate, ACTIVITIES.plantShelter]) {
    const state = createShowcaseState({ scenario: activity });
    const { index, fish } = subject(state, activity);
    assert.deepEqual(
      resolveActivityTarget(fish, index, state, fish.activity),
      core.resolveActivityTarget(fish, index, state, fish.activity),
      `${activity} changed while Phase 7.4 was scoped to weave`,
    );
  }
});
