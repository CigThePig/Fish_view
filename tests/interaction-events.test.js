/*
 * The transient event model: stimuli, impulses, and the rules that keep them
 * from becoming a log.
 *
 * The behaviour a tap produces is tested where that behaviour lives - the
 * school steering in the simulation tests, the plant bend in the plant tests,
 * the ripple in the renderer tests. What is tested here is the architecture the
 * plan requires: that a thing to notice and a disturbance in the water are two
 * separate concepts, that events are created, identified, coalesced, capped and
 * expired deterministically, and that none of it can ever reach the save.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_IMPULSES,
  MAX_STIMULI,
  TOUCH_SECONDS,
  ageInteractionEvents,
  createImpulse,
  createStimulus,
  dominantStimulus,
  impulseStrength,
  registerTouch,
  stimulusSalience,
} from "../src/sim/interaction-events.js";
import { assignAttention } from "../src/sim/attention.js";
import { createPlantFrameContext, posePlant } from "../src/sim/plants.js";
import { ACTIVITIES, tickFishActivity } from "../src/sim/fish-activities.js";
import {
  advanceOffline,
  applyTouch,
  createAquariumState,
  restorePersistentState,
  serializePersistentState,
} from "../src/sim/state.js";
import { tick } from "../src/sim/tick.js";
import { stockedAquarium } from "./support/aquarium.js";

function run(state, seconds, dt = 0.1) {
  let result = state;
  for (let step = 0; step < Math.round(seconds / dt); step += 1) result = tick(result, dt);
  return result;
}

test("a press creates one thing to notice and one disturbance in the water", () => {
  const state = stockedAquarium({ seed: 12, wallClockHours: 12 });
  assert.deepEqual([...state.stimuli], []);
  assert.deepEqual([...state.impulses], []);

  const touched = applyTouch(state, 24, 9);
  assert.equal(touched.stimuli.length, 1);
  assert.equal(touched.impulses.length, 1);
  const [stimulus] = touched.stimuli;
  const [impulse] = touched.impulses;
  assert.equal(stimulus.source, "touch");
  assert.equal(impulse.source, "touch");
  assert.equal(stimulus.durationSeconds, TOUCH_SECONDS);
  assert.equal(impulse.contact, "water");
  assert.equal(stimulusSalience(stimulus), 1);
  // The impulse envelope rises and falls; a brand new one has not peaked yet.
  assert.equal(impulseStrength(impulse), 0);
  assert.ok(impulseStrength({ ...impulse, ageSeconds: TOUCH_SECONDS / 2 }) > 0);

  // A press on the sand is the same event with something else under it.
  const substrate = applyTouch(state, 24, state.rows - 5);
  assert.equal(substrate.impulses[0].contact, "substrate");

  // Nothing else in an ordinary evening creates one.
  assert.deepEqual([...run(state, 3).stimuli], []);
  assert.deepEqual([...run(state, 3).impulses], []);
});

test("perception and disturbance are separate channels", () => {
  const base = stockedAquarium({ seed: 18, wallClockHours: 12 });
  const plant = base.plants.reduce((tallest, candidate) =>
    (candidate.matureHeight > tallest.matureHeight ? candidate : tallest));
  const fish = base.individuals[4];
  const at = { x: plant.x, y: 9 };

  // A stimulus with no impulse: a fish answers it, the plant never knows.
  const stimulus = createStimulus({ id: "touch:test", ...at, radius: Math.hypot(base.cols, base.rows) });
  const attention = assignAttention({ ...base, stimuli: [stimulus] }, stimulus, {});
  const responder = attention.findIndex((record) => record?.role === "investigate");
  const noticed = {
    ...base,
    stimuli: [stimulus],
    individuals: base.individuals.map((one, index) => ({ ...one, attention: attention[index] })),
  };
  assert.ok(responder >= 0, "nothing was assigned to answer the stimulus");
  assert.equal(
    tickFishActivity(noticed.individuals[responder], responder, noticed, 0.1).activity.current,
    ACTIVITIES.touchReact,
  );
  assert.equal(
    posePlant(plant, noticed, { frameContext: createPlantFrameContext(noticed) }).disturbance,
    0,
    "a plant reacted to something that only moved a fish's attention",
  );

  // An impulse with no stimulus: the plant bends, the fish carries on.
  const disturbed = {
    ...base,
    individuals: [],
    impulses: [createImpulse({ id: "touch:test", ...at, ageSeconds: TOUCH_SECONDS / 2 })],
  };
  assert.ok(
    Math.abs(posePlant(plant, disturbed, { frameContext: createPlantFrameContext(disturbed) }).disturbance) > 0,
  );
  assert.notEqual(tickFishActivity(fish, 4, disturbed, 0.1).activity.current, ACTIVITIES.touchReact);
});

test("events expire the moment they are spent, and nothing else removes them", () => {
  const touched = applyTouch(stockedAquarium({ seed: 21 }), 30, 9);
  const alive = run(touched, TOUCH_SECONDS - 0.2);
  assert.equal(alive.stimuli.length, 1);
  assert.equal(alive.impulses.length, 1);
  assert.ok(alive.stimuli[0].ageSeconds > 2.9);

  const spent = run(touched, TOUCH_SECONDS + 0.1);
  assert.deepEqual([...spent.stimuli], []);
  assert.deepEqual([...spent.impulses], []);

  // Ageing is the only removal, and it is exact.
  const aged = ageInteractionEvents(touched, TOUCH_SECONDS);
  assert.deepEqual([...aged.stimuli], []);
  assert.deepEqual([...aged.impulses], []);
});

test("event identity is deterministic, stable while it lives, and unique between events", () => {
  const state = stockedAquarium({ seed: 33 });
  assert.equal(applyTouch(state, 20, 9).stimuli[0].id, applyTouch(state, 20, 9).stimuli[0].id);

  const first = applyTouch(state, 20, 9);
  const aged = run(first, 1);
  assert.equal(aged.stimuli[0].id, first.stimuli[0].id, "an event was renamed while it was still ringing");

  const second = applyTouch(first, 50, 12);
  assert.equal(second.stimuli.length, 2);
  assert.notEqual(second.stimuli[0].id, second.stimuli[1].id);

  // The identity counter wraps rather than growing without bound.
  let repeated = state;
  for (let index = 0; index < 40; index += 1) repeated = applyTouch(repeated, 20, 9);
  assert.ok(repeated.interactionSequence <= 0xffff);
});

test("a near-repeat refreshes the event it repeats instead of taking another slot", () => {
  const state = stockedAquarium({ seed: 41 });
  const first = applyTouch(state, 30, 9);
  const aged = run(first, 1);
  const again = applyTouch(aged, 30.4, 9.2);

  assert.equal(again.stimuli.length, 1, "drumming on one spot filled the event list");
  assert.equal(again.stimuli[0].id, first.stimuli[0].id, "the refreshed event lost its identity");
  assert.equal(again.stimuli[0].ageSeconds, 0, "the refreshed event kept its old age");
  assert.deepEqual(
    { x: again.stimuli[0].x, y: again.stimuli[0].y },
    { x: 30.4, y: 9.2 },
    "the refreshed event stayed at the old position",
  );

  // Far enough apart is a second event, which is the whole point of the model.
  const elsewhere = applyTouch(aged, 12, 9);
  assert.equal(elsewhere.stimuli.length, 2);

  // And what the responders were pointed at is the event that is actually
  // there. Handing them the identity of the press that was merged away would
  // leave every response attached to an event the aquarium does not hold.
  const live = new Set(again.stimuli.map((stimulus) => stimulus.id));
  for (const fish of again.individuals) {
    if (!fish.attention) continue;
    assert.ok(live.has(fish.attention.stimulusId), `${fish.attention.stimulusId} is not a live stimulus`);
    if (fish.activity.targetType === "touch") assert.ok(live.has(fish.activity.targetId));
  }
});

test("the event lists are capped, and the faintest event is what makes way", () => {
  let state = stockedAquarium({ seed: 55 });
  for (let index = 0; index < 20; index += 1) {
    state = applyTouch(state, 3 + index * 3, 5 + (index % 4));
    state = tick(state, 0.1);
  }
  assert.ok(state.stimuli.length <= MAX_STIMULI, `${state.stimuli.length} live stimuli`);
  assert.ok(state.impulses.length <= MAX_IMPULSES, `${state.impulses.length} live impulses`);

  // What survived is what the aquarium would still be answering: the youngest
  // presses, not an arbitrary window of the list.
  const oldest = Math.max(...state.stimuli.map((stimulus) => stimulus.ageSeconds));
  assert.ok(oldest < TOUCH_SECONDS);
  assert.equal(dominantStimulus(state).ageSeconds, Math.min(...state.stimuli.map((s) => s.ageSeconds)));
});

test("the same aquarium and the same event history give the same aquarium", () => {
  const script = [[18, 8], [18.2, 8.1], [44, 13], [30, 15]];
  const replay = () => {
    let state = stockedAquarium({ seed: 61, wallClockHours: 12 });
    for (const [x, y] of script) {
      state = applyTouch(state, x, y);
      state = run(state, 0.5);
    }
    return run(state, 4);
  };
  assert.deepEqual(replay(), replay());
});

test("transient events never reach the save, and a restore starts quiet", () => {
  const touched = applyTouch(stockedAquarium({ seed: 77 }), 26, 15);
  assert.equal(touched.stimuli.length, 1);

  const payload = serializePersistentState(touched);
  assert.equal(JSON.stringify(payload).includes("touch:"), false);

  const restored = restorePersistentState(createAquariumState({ seed: 77 }), payload);
  assert.deepEqual([...restored.stimuli], []);
  assert.deepEqual([...restored.impulses], []);

  // Even a save that has been tampered with cannot smuggle one back in.
  const forged = restorePersistentState(createAquariumState({ seed: 77 }), {
    ...payload,
    stimuli: [createStimulus({ id: "touch:forged", x: 5, y: 5 })],
    impulses: [createImpulse({ id: "touch:forged", x: 5, y: 5 })],
  });
  assert.deepEqual([...forged.stimuli], []);
  assert.deepEqual([...forged.impulses], []);
});

test("an offline gap clears live events rather than resuming them", () => {
  const touched = applyTouch(stockedAquarium({ seed: 88 }), 33, 9);
  const resumed = advanceOffline(touched, 3600);
  assert.deepEqual([...resumed.stimuli], []);
  assert.deepEqual([...resumed.impulses], []);
  assert.equal(resumed.individuals.some((fish) => fish.activity.current === ACTIVITIES.touchReact), false);
});
