import assert from "node:assert/strict";
import test from "node:test";

import { ACTIVITIES, resolveActivityTarget } from "../src/sim/fish-activities.js";
import { createShowcaseState, showcaseSubjects, showcaseTarget, tickShowcase } from "../src/dev/behavior-showcase.js";
import { hashSeed } from "../src/sim/prng.js";

const LABELS = ["phase7-plant-a", "phase7-plant-b", "phase7-plant-c", "phase7-plant-d", "phase7-plant-e", "phase7-plant-f"];

function subject(state, activity) {
  return showcaseSubjects(state, activity)[0];
}

function runVisit(label, activity) {
  let state = createShowcaseState({ scenario: activity, seed: hashSeed(label) });
  const seen = new Map();
  const transitions = [];
  let exit = null;
  for (let step = 0; step < 460; step += 1) {
    const { index, fish } = subject(state, activity);
    if (fish.activity.current !== activity) {
      exit = { seconds: step * 0.1, activity: fish.activity.current };
      break;
    }
    const target = showcaseTarget(state, activity);
    assert.ok(target, `${label}: ${activity} lost its target`);
    const plant = state.plants.find((entry) => entry.seed === fish.activity.targetId);
    assert.ok(plant, `${label}: ${activity} lost its plant`);
    const stage = target.plantVisitStage;
    if (!seen.has(stage)) seen.set(stage, {
      stage, phase: target.choreographyPhase, x: target.x, y: target.y,
      plantX: plant.x, speed: target.speed, seconds: step * 0.1,
      hold: target.plantVisitHoldSeconds, radius: target.plantVisitArrivalRadius,
    });
    const distance = Math.hypot(target.x - fish.x, target.y - fish.y);
    const stageAge = fish.activity.ageRealSeconds - (fish.activity.plantVisitStageStartedAt ?? 0);
    const next = tickShowcase(state, 0.1, activity);
    const nextFish = next.individuals[index];
    if (nextFish.activity.current === activity) {
      const nextTarget = showcaseTarget(next, activity);
      if (nextTarget.plantVisitStage > stage) transitions.push({
        from: stage, to: nextTarget.plantVisitStage, distance, radius: target.plantVisitArrivalRadius,
        stageAge, hold: target.plantVisitHoldSeconds,
      });
    } else {
      exit = {
        seconds: (step + 1) * 0.1, activity: nextFish.activity.current,
        fromStage: stage, distance, radius: target.plantVisitArrivalRadius,
      };
      state = next;
      break;
    }
    state = next;
  }
  return { seen, transitions, exit };
}

test("plant visit phases do not advance from activity age alone", () => {
  for (const activity of [ACTIVITIES.plantInvestigate, ACTIVITIES.plantShelter]) {
    const state = createShowcaseState({ scenario: activity });
    const { index, fish } = subject(state, activity);
    const agedFish = { ...fish, activity: { ...fish.activity, ageRealSeconds: 999 } };
    const agedState = { ...state, individuals: state.individuals.map((entry, slot) => slot === index ? agedFish : entry) };
    const target = resolveActivityTarget(agedFish, index, agedState, agedFish.activity);
    assert.equal(target.plantVisitStage, 0, activity + " skipped its physical entry");
  }
});

test("plant investigation reads approach, stable inspect, deliberate retreat across six seeds", () => {
  for (const label of LABELS) {
    const result = runVisit(label, ACTIVITIES.plantInvestigate);
    assert.deepEqual([...result.seen.keys()], [0, 1, 2], label + ": investigation skipped a beat");
    assert.deepEqual([...result.seen.values()].map((beat) => beat.phase), ["approach", "inspect", "retreat"], label);
    assert.deepEqual(result.transitions.map(({ from, to }) => [from, to]), [[0, 1], [1, 2]], label);
    const entryTransition = result.transitions[0];
    assert.ok(entryTransition.distance <= entryTransition.radius + 0.1, label + ": inspect started before arrival");
    const inspectTransition = result.transitions[1];
    assert.ok(inspectTransition.stageAge + 0.11 >= inspectTransition.hold, label + ": retreat began before inspection beat finished");
    const approach = result.seen.get(0);
    const inspect = result.seen.get(1);
    const retreat = result.seen.get(2);
    assert.ok(inspect.speed < approach.speed, label + ": inspection did not visibly slow");
    assert.ok(inspect.speed < retreat.speed, label + ": retreat was not distinct from inspection");
    assert.ok(Math.abs(retreat.x - retreat.plantX) > Math.abs(inspect.x - inspect.plantX) + 1.2, label + ": retreat did not clear the plant");
    assert.equal(Math.sign(retreat.x - retreat.plantX), Math.sign(inspect.x - inspect.plantX), label + ": investigation turned into a weave crossing");
    assert.ok(result.exit, label + ": investigation never completed");
    assert.equal(result.exit.fromStage, 2, label + ": investigation exited before retreat");
    assert.ok(result.exit.distance <= result.exit.radius + 0.1, label + ": investigation ended before reaching retreat");
  }
});

test("plant shelter reads enter, quiet, emerge across six seeds", () => {
  for (const label of LABELS) {
    const result = runVisit(label, ACTIVITIES.plantShelter);
    assert.deepEqual([...result.seen.keys()], [0, 1, 2], label + ": shelter skipped a beat");
    assert.deepEqual([...result.seen.values()].map((beat) => beat.phase), ["enter", "quiet", "emerge"], label);
    assert.deepEqual(result.transitions.map(({ from, to }) => [from, to]), [[0, 1], [1, 2]], label);
    const entryTransition = result.transitions[0];
    assert.ok(entryTransition.distance <= entryTransition.radius + 0.1, label + ": quiet began before cover was reached");
    const quietTransition = result.transitions[1];
    assert.ok(quietTransition.stageAge + 0.11 >= quietTransition.hold, label + ": emergence began before quiet beat finished");
    const enter = result.seen.get(0);
    const quiet = result.seen.get(1);
    const emerge = result.seen.get(2);
    assert.ok(quiet.speed < enter.speed * 0.45, label + ": shelter never became quiet");
    assert.ok(quiet.speed < emerge.speed * 0.35, label + ": emergence was not a visible energy change");
    assert.ok(Math.abs(emerge.x - emerge.plantX) > Math.abs(quiet.x - quiet.plantX) + 1.2, label + ": emergence did not leave cover");
    assert.equal(Math.sign(emerge.x - emerge.plantX), Math.sign(quiet.x - quiet.plantX), label + ": shelter exit crossed through the plant");
    assert.ok(result.exit, label + ": shelter never completed");
    assert.equal(result.exit.fromStage, 2, label + ": shelter exited before emergence");
    assert.ok(result.exit.distance <= result.exit.radius + 0.1, label + ": shelter ended before reaching emergence");
    assert.notEqual(result.exit.activity, ACTIVITIES.plantShelter, label + ": shelter immediately re-entered cover instead of peeling away");
  }
});

test("plant weave remains the separate traversal vocabulary", () => {
  const state = createShowcaseState({ scenario: ACTIVITIES.plantWeave });
  const target = showcaseTarget(state, ACTIVITIES.plantWeave);
  assert.ok(target.weaveLeg);
  assert.equal(target.plantVisitStage, undefined);
  assert.match(target.choreographyPhase, /^weave-/);
});
