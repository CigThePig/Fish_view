/*
 * The Phase 0 interaction observation harness.
 *
 * These tests are about the instrument, not about the behaviour it measures.
 * What a tap currently does to the cast is the thing Stage 2 is going to
 * change, so pinning today's numbers here would only mean deleting them in
 * Phase 1. What has to keep holding is that a pointer history is bounded and
 * replayable, that a replay is exactly the production interaction path, and
 * that an observation of an untouched aquarium reports nothing happening.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  INTERACTION_SCENARIOS,
  POINTER_HISTORY_LIMIT,
  STOCKED_AQUARIUM_DAY,
  applyPointerEvent,
  createObservationAquarium,
  decodePointerHistory,
  drag,
  encodePointerHistory,
  hold,
  observeInteraction,
  pointerHistory,
  prepareScenario,
  repeatedTaps,
  swipe,
  tap,
} from "../src/dev/interaction-observation.js";
import { DISPLAY } from "../src/sim/config.js";
import { applyTouch } from "../src/sim/state.js";

// Settled far less than a measurement run settles for: these tests need a tank
// with a cast in it, not a representative evening.
function aquarium(options = {}) {
  return createObservationAquarium({ seed: 5, days: STOCKED_AQUARIUM_DAY, settleSeconds: 4, ...options });
}

test("every gesture the plan asks for produces a sorted, bounded pointer history", () => {
  const histories = {
    tap: pointerHistory(tap(20, 9)),
    hold: pointerHistory(hold(20, 9, { seconds: 1.6 })),
    slowDrag: pointerHistory(drag([{ x: 10, y: 9 }, { x: 50, y: 7 }], { seconds: 3 })),
    swipe: pointerHistory(swipe({ x: 10, y: 9 }, { x: 50, y: 7 }, { seconds: 0.3 })),
    repeated: pointerHistory(repeatedTaps(20, 9, { count: 5 })),
  };
  for (const [name, history] of Object.entries(histories)) {
    assert.ok(history.length > 0, `${name} produced no events`);
    assert.ok(history.length <= POINTER_HISTORY_LIMIT, `${name} exceeded the event cap`);
    assert.equal(history[0].type, "down", `${name} did not start with a press`);
    assert.equal(history.at(-1).type, "up", `${name} did not end with a release`);
    for (let index = 1; index < history.length; index += 1) {
      assert.ok(history[index].seconds >= history[index - 1].seconds, `${name} is not in time order`);
    }
  }
  // A slow drag and a fast swipe are the same path at different speeds, which
  // is the distinction Phase 4 has to respond to.
  assert.equal(histories.slowDrag.at(-1).seconds > histories.swipe.at(-1).seconds, true);
});

test("a pointer history is capped, and survives a round trip through text", () => {
  assert.throws(
    () => pointerHistory(drag([{ x: 4, y: 9 }, { x: 60, y: 9 }], { seconds: 12 })),
    /exceeds the 64-event cap/,
  );

  const history = pointerHistory(hold(31.5, 8.25, { seconds: 1 }));
  const encoded = encodePointerHistory(history);
  assert.deepEqual(decodePointerHistory(encoded), history);
  assert.equal(encodePointerHistory(decodePointerHistory(encoded)), encoded);
  // One finger is written without a finger number, so every history recorded
  // before the harness knew about fingers still reads and replays.
  assert.equal(encoded.includes(":1:"), false);
  assert.deepEqual(decodePointerHistory("1:d:33:9.5 1.1:u:33:9.5").map((event) => event.pointerId), [1, 1]);

  const twoFingers = pointerHistory(tap(20, 9), tap(45, 11, { at: 0.2, pointerId: 2 }));
  assert.equal(encodePointerHistory(twoFingers).includes(":2"), true);
  assert.deepEqual(decodePointerHistory(encodePointerHistory(twoFingers)), twoFingers);
  assert.throws(() => pointerHistory(tap(20, 9, { pointerId: 9 })), /pointer ids run from 1 to 5/);
});

test("replaying a pointer event is the production interaction path, unchanged", () => {
  const state = aquarium();

  // A press is applyTouch on the mapped point and nothing else. This is the one
  // seam Phase 1 replaces; if it ever stops matching, the harness has started
  // measuring an aquarium the product does not have.
  const press = applyPointerEvent(state, { type: "down", x: 33, y: 9.5, seconds: 0 });
  assert.equal(press.delivered, true);
  assert.deepEqual(press.state, applyTouch(state, 33, 9.5));

  // Movement, hold duration and release carry no meaning today. The harness
  // delivers them and records that the aquarium ignored them.
  for (const type of ["move", "up"]) {
    const result = applyPointerEvent(state, { type, x: 33, y: 9.5, seconds: 0.2 });
    assert.equal(result.delivered, false);
    assert.equal(result.reason, "inert-today");
    assert.equal(result.state, state);
  }

  // The hidden developer corner is not part of the aquarium's interaction
  // surface, and a scenario cannot accidentally tap through it.
  const hotspot = applyPointerEvent(state, { type: "down", x: DISPLAY.cols - 1, y: 0.5, seconds: 0 });
  assert.equal(hotspot.delivered, false);
  assert.equal(hotspot.reason, "developer-hotspot");
  assert.equal(hotspot.state, state);
});

test("only the primary pointer reaches the aquarium", () => {
  const state = aquarium();

  // The panel takes five fingers and the app answers one, so a second finger
  // placed while the first is down reaches nothing. A harness that delivered it
  // anyway would credit the aquarium with a response no viewer can produce.
  assert.equal(applyPointerEvent(state, { type: "down", x: 33, y: 9.5 }, { primary: false }).delivered, false);
  assert.equal(
    applyPointerEvent(state, { type: "down", x: 33, y: 9.5 }, { primary: false }).reason,
    "not-the-primary-pointer",
  );
  assert.equal(applyPointerEvent(state, { type: "down", x: 33, y: 9.5 }, { button: 2 }).delivered, false);

  const twoFingers = observeInteraction(state, {
    history: pointerHistory(
      tap(20, 9, { at: 0.5, holdSeconds: 0.6 }),
      tap(45, 11, { at: 0.7, pointerId: 2 }),
    ),
    observeSeconds: 2,
  });
  assert.equal(twoFingers.pointer.delivered, 1, "a second finger was answered");
  assert.equal(twoFingers.pointer.nonPrimary, 2);
  assert.equal(twoFingers.aquarium.bubblesCreated + twoFingers.aquarium.plantsDisturbed >= 0, true);

  // The same two places, one finger, one after the other: both land.
  const twoPresses = observeInteraction(state, {
    history: pointerHistory(tap(20, 9, { at: 0.5 }), tap(45, 11, { at: 0.9 })),
    observeSeconds: 2,
  });
  assert.equal(twoPresses.pointer.delivered, 2);
  assert.equal(twoPresses.pointer.nonPrimary, 0);

  // A finger that goes down after the first has lifted is primary again.
  const history = pointerHistory(tap(20, 9, { at: 0.5 }), tap(45, 11, { at: 0.9, pointerId: 3 }));
  assert.equal(observeInteraction(state, { history, observeSeconds: 2 }).pointer.delivered, 2);
});

test("an observation with no input reports an aquarium that was not touched", () => {
  const observation = observeInteraction(aquarium(), { history: [], observeSeconds: 2 });

  assert.equal(observation.pointer.delivered, 0);
  assert.equal(observation.aquarium.respondingStrongly, 0);
  assert.equal(observation.aquarium.respondingWeakly, 0);
  assert.equal(observation.aquarium.unaffected, observation.fish.length);
  assert.equal(observation.aquarium.plantsDisturbed, 0);
  assert.equal(observation.aquarium.bubblesCreated, 0);
  assert.equal(observation.aquarium.residentsAffected, 0);
  assert.equal(observation.aquarium.schoolCentroidDisplacement, 0);
  for (const frame of observation.timeline) assert.equal(frame.deviation, 0);
  // Ordinary life still costs the renderer something, and the harness has to
  // report that rather than a zero.
  assert.ok(observation.render.averageDamagePercent > 0);
  assert.equal(observation.render.fullRedraws, 0);
});

test("the same history replayed twice measures the same aquarium", () => {
  const state = aquarium();
  const history = pointerHistory(tap(33, 9.5, { at: 0.5 }));
  const first = observeInteraction(state, { history, observeSeconds: 3 });
  const second = observeInteraction(state, { history: decodePointerHistory(first.pointer.encoded), observeSeconds: 3 });

  assert.deepEqual(second.fish, first.fish);
  assert.deepEqual(second.aquarium, first.aquarium);
  assert.deepEqual(second.render, first.render);
  assert.deepEqual(second.moments, first.moments);

  // A phone shows the same aquarium scaled, so the same world point delivered
  // through a half-size viewport has to reach the same water.
  const scaled = observeInteraction(state, { history, observeSeconds: 3, viewportScale: 0.5 });
  assert.deepEqual(scaled.fish, first.fish);
});

test("an observed tap carries the per-fish measurements the phase gate asks for", () => {
  const state = aquarium();
  const observation = observeInteraction(state, {
    history: pointerHistory(tap(33, 9.5, { at: 0.5 })),
    observeSeconds: 4,
  });

  assert.equal(observation.fish.length, state.individuals.length);
  for (const fish of observation.fish) {
    assert.equal(typeof fish.id, "string");
    for (const trait of ["boldness", "sociability", "activity", "preferredDepth", "curiosity"]) {
      assert.ok(Number.isFinite(fish.traits[trait]), `${trait} is not measured`);
    }
    assert.ok(Number.isFinite(fish.glassAffinity));
    assert.ok(Number.isFinite(fish.familiarity.touches));
    assert.ok(Number.isFinite(fish.startDistance));
    assert.ok(Number.isFinite(fish.closestDistance));
    assert.ok(fish.distanceTravelled >= 0);
    assert.ok(fish.peakSpeed >= fish.averageSpeed);
    assert.ok(fish.peakAcceleration >= 0);
    assert.ok(fish.peakPitch >= 0);
    assert.ok(fish.turnCount >= 0);
    assert.ok(fish.secondsNearStimulus >= 0);
    assert.ok(["unaffected", "resumed", "changed", "replaced"].includes(fish.outcome));
    assert.ok(fish.startActivity && fish.endingActivity);
  }

  // The whole-aquarium readings the plan lists, and the damage the interaction
  // cost the incremental renderer.
  const { aquarium: whole, render: cost } = observation;
  assert.equal(whole.respondingStrongly + whole.respondingWeakly + whole.unaffected, observation.fish.length);
  assert.ok(whole.schoolCentroidDisplacement >= 0);
  assert.ok(cost.averageRectangles > 0);
  assert.ok(cost.objects > 0 && cost.glyphs > 0);
});

test("a response that only changes posture still counts as a response", () => {
  const state = aquarium();
  const observation = observeInteraction(state, {
    history: pointerHistory(tap(33, 9.5, { at: 0.5 })),
    observeSeconds: 4,
  });

  // Phase 2's quietest roles answer without leaving their line, so a measure
  // that only watched position would file them as unaffected. Anything the
  // harness calls unaffected has to be unmoved in every channel it measures.
  for (const fish of observation.fish) {
    if (fish.outcome !== "unaffected") continue;
    assert.equal(fish.peakSpeedDeviation <= 0.01, true, `${fish.id} changed speed but was called unaffected`);
    assert.equal(fish.peakPitchDeviation <= 0.5, true, `${fish.id} changed posture but was called unaffected`);
    assert.equal(fish.responseLatencySeconds, null);
  }
  // And a fish that answered in any channel is counted as responding.
  const answered = observation.fish.filter((fish) => fish.peakSpeedDeviation > 0.01
    || fish.peakPitchDeviation > 0.5
    || fish.peakDeviation > 0.01);
  assert.equal(
    answered.length,
    observation.aquarium.respondingStrongly + observation.aquarium.respondingWeakly,
  );
});

test("each fish is measured against the disturbance it is answering", () => {
  const state = aquarium();
  // Two presses, half a tank apart. A fish that crosses to answer the second
  // one must not have its distances recorded against the first.
  const left = 14;
  const right = 50;
  const observation = observeInteraction(state, {
    history: pointerHistory(tap(left, 9, { at: 0.5 }), tap(right, 11, { at: 1.2 })),
    observeSeconds: 6,
  });
  assert.equal(observation.pointer.delivered, 2);

  for (const fish of observation.fish) {
    if (fish.startDistance === null) continue;
    // Every recorded distance belongs to one of the two presses, not to a
    // point measured from the wrong one.
    assert.ok(fish.closestDistance <= fish.startDistance + 40);
    assert.ok(fish.startDistance >= 0);
  }

  // At least one fish ends up nearer the second press than it ever was to the
  // first; measured against the first press alone, its answer would read as a
  // fish wandering off.
  const start = state.individuals.map((fish) => ({
    toLeft: Math.hypot(left - fish.x, 9 - fish.y),
    toRight: Math.hypot(right - fish.x, 11 - fish.y),
  }));
  assert.ok(start.some((distances) => distances.toRight < distances.toLeft),
    "the fixture has no fish nearer the second press");
});

test("latency is measured from the press a fish answers", () => {
  const state = aquarium();
  const left = 14;
  const right = 52;
  const observation = observeInteraction(state, {
    history: pointerHistory(tap(left, 9, { at: 0.5 }), tap(right, 11, { at: 1.2 })),
    observeSeconds: 6,
  });
  assert.equal(observation.pointer.delivered, 2);

  // A fish out of range of the first press that answers the second one answered
  // in a frame, not in the 0.8 s between the two presses. Measuring every fish
  // from whichever press opened the observation turned a prompt response into a
  // slow one.
  const far = state.individuals
    .map((fish, index) => ({ index, fish }))
    .filter(({ fish }) => Math.hypot(left - fish.x, 9 - fish.y) > 30
      && Math.hypot(right - fish.x, 11 - fish.y) <= 30);
  assert.ok(far.length > 0, "the fixture has no fish that only the second press reaches");
  for (const { fish } of far) {
    const record = observation.fish.find((entry) => entry.id === fish.seed.toString(16));
    if (record.responseLatencySeconds === null) continue;
    assert.ok(record.responseLatencySeconds <= 0.3,
      `${record.id} answered the second press but was recorded at ${record.responseLatencySeconds}s`);
  }
});

test("a press at the very start of a history still has an untouched frame", () => {
  // tap() defaults to t = 0, and a decoded history can too. The before moment
  // has to be the aquarium before the press, not the frame it landed in.
  const observation = observeInteraction(aquarium(), {
    history: pointerHistory(tap(33, 9.5)),
    observeSeconds: 3,
  });
  const before = observation.moments.find((moment) => moment.moment === "before");
  const first = observation.moments.find((moment) => moment.moment === "first-response");
  assert.equal(before.frame, 0);
  assert.equal(before.deviation, 0);
  assert.notEqual(before.frame, first.frame);
});

test("recovery waits for the fish that answered late", () => {
  const state = aquarium();
  const observation = observeInteraction(state, {
    history: pointerHistory(tap(33, 9.5, { at: 0.5 })),
    observeSeconds: 12,
  });
  const recovery = observation.moments.find((moment) => moment.moment === "recovery");
  if (!recovery) return;
  // Nothing may still be holding the activity the press imposed when the
  // aquarium is called recovered - including a delayed investigator, which
  // enters that activity a beat after the press rather than in its frame.
  assert.equal(recovery.holdingStimulusActivity, 0);
  const imposed = new Set(observation.fish
    .filter((fish) => fish.activityAfterInput !== fish.startActivity)
    .map((fish) => fish.activityAfterInput));
  const stillHolding = observation.timeline
    .filter((entry) => entry.frame > recovery.frame && entry.holdingStimulusActivity > 0);
  assert.ok(imposed.size > 0, "the press imposed no activity on anything");
  assert.equal(stillHolding.length, 0, "a fish re-entered the imposed activity after recovery was called");
});

test("the semantic moments run in order, inside the observation", () => {
  const observation = observeInteraction(aquarium(), {
    history: pointerHistory(tap(33, 9.5, { at: 0.5 })),
    observeSeconds: 6,
  });
  const moments = observation.moments;
  const names = moments.map((moment) => moment.moment);

  assert.ok(names.includes("before"));
  assert.ok(names.includes("first-response"));
  assert.ok(names.includes("peak-response"));
  assert.equal(names.at(-1), "aftermath");
  for (let index = 1; index < moments.length; index += 1) {
    assert.ok(moments[index].frame >= moments[index - 1].frame, "moments are out of order");
    assert.ok(moments[index].frame <= observation.frames, "a moment is outside the observation");
  }
  // The frame before the press is the frame the aquarium had not answered yet.
  assert.equal(moments[0].deviation, 0);
});

test("every scenario resolves against a real aquarium and taps inside the world", () => {
  const state = aquarium();
  for (const scenario of INTERACTION_SCENARIOS.filter((entry) => entry.context === "stocked")) {
    const prepared = prepareScenario(scenario, () => state, { waitSeconds: 300 });
    assert.ok(prepared.history, `${scenario.id} produced no pointer history`);
    assert.ok(prepared.history.length <= POINTER_HISTORY_LIMIT);
    for (const event of prepared.history) {
      assert.ok(event.x >= 0 && event.x <= DISPLAY.cols, `${scenario.id} pressed outside the world`);
      assert.ok(event.y >= 0 && event.y <= DISPLAY.rows, `${scenario.id} pressed outside the world`);
    }
    if (scenario.waitFor) {
      assert.equal(prepared.precondition.reached, true, `${scenario.id} never saw ${scenario.waitFor}`);
      assert.ok(scenario.waitFor.includes(prepared.precondition.activity));
    }
  }
});
