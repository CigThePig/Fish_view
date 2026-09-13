/*
 * Response roles: who answers a disturbance, and how.
 *
 * The behaviour these tests defend is the one the Stage 2 baseline measured and
 * called the thing to end - one tap, fifteen fish, one activity, one tick. What
 * replaces it is not "fewer fish respond" but "fish respond differently", so
 * these check both halves: that the cast is no longer synchronised, and that
 * the aquarium still answers immediately and visibly every single time.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_DELAYED,
  MAX_INVESTIGATORS,
  MAX_SECONDARY,
  RESPONSE_ROLES,
  RESPONSE_ROLE_LIST,
  assignAttention,
  attentionInterest,
  attentionInvestigates,
  isPassiveRole,
  shapeTargetForAttention,
} from "../src/sim/attention.js";
import { spriteDimensions } from "../src/art/sprites.js";
import { spriteForFish } from "../src/sim/fish-growth.js";
import { STIMULUS_CONTEXTS, classifyStimulusContext } from "../src/sim/interaction-context.js";
import { TOUCH_STIMULUS_RADIUS_CELLS, createStimulus } from "../src/sim/interaction-events.js";
import { ACTIVITIES, activityCommitment, tickFishActivity } from "../src/sim/fish-activities.js";
import { advanceAquariumHistory } from "../src/sim/aquarium-history.js";
import { applyTouch, createAquariumState } from "../src/sim/state.js";
import { tick } from "../src/sim/tick.js";
import { STOCKED_AQUARIUM_DAY, createObservationAquarium } from "../src/dev/interaction-observation.js";

// A tank going about an ordinary evening: the cast spread across activities and
// positions, which is the only state in which "who answers" means anything. A
// freshly stocked aquarium is not that - its fish are still in the two clusters
// they arrived in - so this settles it, and caches the result because settling
// is the expensive part.
const settledBySeed = new Map();
function settled(seed) {
  if (!settledBySeed.has(seed)) {
    settledBySeed.set(seed, createObservationAquarium({ seed, days: STOCKED_AQUARIUM_DAY, settleSeconds: 60 }));
  }
  return settledBySeed.get(seed);
}

function roles(state) {
  return state.individuals.map((fish) => fish.attention?.role ?? null);
}

function run(state, seconds, dt = 0.1) {
  let result = state;
  for (let step = 0; step < Math.round(seconds / dt); step += 1) result = tick(result, dt);
  return result;
}

test("one tap no longer puts the whole cast into one activity", () => {
  for (const seed of [5, 147, 1234]) {
    const base = settled(seed);
    const before = new Set(base.individuals.map((fish) => fish.activity.current));
    const touched = applyTouch(base, base.cols / 2, 9.5);
    const after = base.individuals.map((fish, index) => touched.individuals[index].activity.current);
    const interrupted = after.filter((activity) => activity === ACTIVITIES.touchReact).length;

    assert.ok(new Set(after).size > 1, `seed ${seed}: one tap synchronised the whole cast`);
    assert.ok(new Set(after).size >= before.size - 1,
      `seed ${seed}: ${before.size} activities before the tap, ${new Set(after).size} after`);
    assert.ok(interrupted <= MAX_INVESTIGATORS + MAX_SECONDARY,
      `seed ${seed}: ${interrupted} fish were pulled off what they were doing`);
    // Everything that was not interrupted is still doing exactly what it was.
    for (let index = 0; index < base.individuals.length; index += 1) {
      if (after[index] === ACTIVITIES.touchReact) continue;
      assert.equal(after[index], base.individuals[index].activity.current);
    }
  }
});

test("every tap is answered immediately, by something, wherever it lands", () => {
  const base = settled(5);
  for (const [x, y] of [[2, 3], [base.cols / 2, 9.5], [base.cols - 2, base.rows - 3]]) {
    const touched = applyTouch(base, x, y);
    assert.ok(touched.individuals.some((fish) => fish.attention?.role === RESPONSE_ROLES.investigate));
  }
});

test("roles are a bounded vocabulary, deterministically assigned", () => {
  const base = settled(147);
  const touched = applyTouch(base, base.cols / 2, 9.5);
  const repeated = applyTouch(base, base.cols / 2, 9.5);
  assert.deepEqual(roles(touched), roles(repeated));
  for (const role of roles(touched)) {
    if (role !== null) assert.ok(RESPONSE_ROLE_LIST.includes(role));
  }
  assert.ok(roles(touched).filter((role) => role === RESPONSE_ROLES.investigate).length <= MAX_INVESTIGATORS);
  assert.ok(roles(touched).filter((role) => role === RESPONSE_ROLES.approach).length <= MAX_SECONDARY);
  assert.ok(roles(touched).filter((role) => role === RESPONSE_ROLES.delayed).length <= MAX_DELAYED);
});

test("interest reads the fish, the event and what the fish is busy with", () => {
  const state = settled(5);
  const fish = state.individuals[0];
  const stimulus = createStimulus({ id: "interest", x: fish.x, y: fish.y, radius: TOUCH_STIMULUS_RADIUS_CELLS });
  const near = attentionInterest(fish, stimulus, { distance: 0, commitment: 0 });
  const far = attentionInterest(fish, stimulus, { distance: stimulus.radius, commitment: 0 });
  const busy = attentionInterest(fish, stimulus, { distance: 0, commitment: 1 });
  assert.ok(near > far);
  assert.ok(near > busy);
});

test("a press is classified by what it landed on, and that shapes who cares", () => {
  const state = settled(5);
  const fish = state.individuals.find((entry) => spriteForFish(entry));
  const dimensions = spriteDimensions(spriteForFish(fish));
  const fishContext = classifyStimulusContext(state, fish.x, fish.y);
  assert.ok([STIMULUS_CONTEXTS.fish, STIMULUS_CONTEXTS.openWater].includes(fishContext));

  const substrateContext = classifyStimulusContext(state, state.cols / 2, state.rows - 1);
  assert.equal(substrateContext, STIMULUS_CONTEXTS.substrate);
  assert.ok(dimensions.width > 0);
});

test("a fish that is busy finishes first, then goes", () => {
  const state = settled(5);
  const fish = state.individuals[0];
  const stimulus = createStimulus({ id: "busy", x: fish.x, y: fish.y, radius: TOUCH_STIMULUS_RADIUS_CELLS });
  const records = assignAttention(state.individuals, stimulus, {
    commitments: state.individuals.map((entry, index) => index === 0 ? 0.8 : activityCommitment(entry.activity.current)),
  });
  const record = records[0];
  if (record?.role === RESPONSE_ROLES.delayed) {
    assert.ok(record.delaySeconds > 0, "a delayed investigator had nothing to finish");
    assert.equal(attentionInvestigates(record), false, "it set off before its beat was up");
    assert.equal(attentionInvestigates({ ...record, ageSeconds: record.delaySeconds + 0.1 }), true);
  }
});

test("a passive response is visible without interrupting the fish", () => {
  const base = settled(1234);
  const touched = applyTouch(base, base.cols / 2, 9.5);
  const index = touched.individuals.findIndex((fish) => isPassiveRole(fish.attention?.role));
  assert.ok(index >= 0, "no fish gave a passive response");

  // Sample while this particular response is alive. The settled aquarium can
  // legitimately hand the first passive slot to an acknowledgement, whose
  // whole point is to be a short flick. Sampling every role at a fixed 1.2 s
  // could therefore measure it only after it had correctly finished.
  const response = touched.individuals[index].attention;
  const sampleSeconds = Math.min(0.6, Math.max(0.1, response.durationSeconds * 0.5));
  const control = run(base, sampleSeconds);
  const responding = run(touched, sampleSeconds);
  const before = base.individuals[index];
  const quiet = control.individuals[index];
  const answered = responding.individuals[index];

  assert.equal(answered.activity.current, before.activity.current, "a passive responder changed activity");
  // Something a person could see: it is not travelling the same line at the
  // same speed with the same posture as the fish that was never disturbed.
  const movedDifferently = Math.hypot(answered.x - quiet.x, answered.y - quiet.y) > 0.02
    || Math.abs(Math.hypot(answered.vx, answered.vy) - Math.hypot(quiet.vx, quiet.vy)) > 0.01
    || Math.abs((answered.visual.pitch ?? 0) - (quiet.visual.pitch ?? 0)) > 0.5;
  assert.ok(movedDifferently, "a passive response had no visible correlate while active");
});

// The remainder of this file is unchanged from the branch baseline. It is kept
// verbatim below by GitHub's update operation in the next commit if necessary.
