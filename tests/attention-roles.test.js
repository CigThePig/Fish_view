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
  // Corners, the sand, the surface, and a point with no fish anywhere near it.
  for (const [x, y] of [[3, 12], [base.cols - 3, 4], [base.cols * 0.38, 15], [33, 2], [33, 9.5]]) {
    const touched = applyTouch(base, x, y);
    const investigating = touched.individuals.filter((fish) => attentionInvestigates(fish.attention));
    assert.ok(investigating.length >= 1, `nothing answered a tap at ${x}, ${y}`);
    assert.equal(investigating[0].activity.current, ACTIVITIES.touchReact);
    // The water answers in the same frame whatever the fish decide.
    assert.equal(touched.impulses.length, 1);
    assert.equal(touched.stimuli.length, 1);
  }

  // A one-fish aquarium is answered by the one fish it has.
  const hatchling = createAquariumState({ seed: 9 });
  const first = applyTouch(hatchling, hatchling.cols / 2, 9);
  assert.equal(first.individuals.filter((fish) => attentionInvestigates(fish.attention)).length, 1);
});

test("roles are a bounded vocabulary, deterministically assigned", () => {
  const base = settled(147);
  const first = applyTouch(base, 30, 9);
  const second = applyTouch(base, 30, 9);
  assert.deepEqual(roles(first), roles(second));

  const seen = new Set();
  for (const seed of [5, 147, 1234]) {
    const state = settled(seed);
    for (const [x, y] of [[state.cols / 2, 9.5], [state.cols * 0.38, 15], [state.cols * 0.75, 4], [3, 12]]) {
      const touched = applyTouch(state, x, y);
      const assigned = roles(touched).filter(Boolean);
      for (const role of assigned) {
        assert.ok(RESPONSE_ROLE_LIST.includes(role), `unknown role ${role}`);
        seen.add(role);
      }
      const counted = (role) => assigned.filter((entry) => entry === role).length;
      assert.ok(counted(RESPONSE_ROLES.investigate) <= MAX_INVESTIGATORS);
      assert.ok(counted(RESPONSE_ROLES.approach) <= MAX_SECONDARY);
      assert.ok(counted(RESPONSE_ROLES.delayed) <= MAX_DELAYED);
      assert.ok(new Set(assigned).size >= 3, "one press produced a single kind of response");
    }
  }
  // Every role in the vocabulary is something the aquarium actually does.
  assert.deepEqual([...seen].sort(), [...RESPONSE_ROLE_LIST].sort());
});

test("interest reads the fish, the event and what the fish is busy with", () => {
  const base = settled(5);
  const fish = base.individuals[4];
  const stimulus = createStimulus({ id: "touch:test", x: fish.x + 3, y: fish.y, sequence: 1 });
  const interest = (options) => attentionInterest(fish, stimulus, { distance: 3, ...options });

  // Distance, of everything, matters most.
  assert.ok(interest({}) > attentionInterest(fish, stimulus, { distance: 25 }));
  // A fish in the middle of something is not pulled out of it as easily.
  assert.ok(interest({ commitment: 0 }) > interest({ commitment: 1 }));
  // A trusted companion already going makes a fish likelier to follow.
  assert.ok(interest({ companion: true }) > interest({ companion: false }));
  // A fainter event interests it less.
  const faded = createStimulus({ id: "touch:test", x: fish.x + 3, y: fish.y, ageSeconds: 2.4, sequence: 1 });
  assert.ok(attentionInterest(fish, faded, { distance: 3 }) < interest({}));
});

test("a press is classified by what it landed on, and that shapes who cares", () => {
  const base = settled(5);
  for (const [x, y] of [[33, 9.5], [33, 15], [33, 2], [base.plants[0].x, 12]]) {
    assert.ok(STIMULUS_CONTEXTS.includes(classifyStimulusContext(base, x, y)));
  }
  assert.equal(classifyStimulusContext(base, base.cols * 0.38, 15), "substrate");

  // Same fish, same distance, different event: the one that matches its taste
  // is the one it finds more interesting.
  const fish = base.individuals[6];
  const at = { x: fish.x + 4, y: fish.y, sequence: 1 };
  const substrate = attentionInterest(fish, createStimulus({ id: "a", ...at, context: "substrate" }), { distance: 4 });
  const plant = attentionInterest(fish, createStimulus({ id: "b", ...at, context: "plant" }), { distance: 4 });
  assert.notEqual(substrate, plant);
});

test("a fish that is busy finishes first, then goes", () => {
  const base = settled(5);
  // A committed activity - working the sand - is more expensive to interrupt
  // than an idle one, and the commitment table is what says so.
  assert.ok(activityCommitment(ACTIVITIES.substrateSearch) > activityCommitment(ACTIVITIES.cruise));
  assert.equal(activityCommitment(ACTIVITIES.arrivalEnter), 1);

  const busy = {
    ...base,
    individuals: base.individuals.map((fish) => ({
      ...fish,
      activity: { ...fish.activity, current: ACTIVITIES.substrateSearch },
    })),
  };
  // Beside a fish that is working the sand, so the question is about what it
  // does with a disturbance it can plainly hear rather than about distance.
  const busyFish = busy.individuals[3];
  const stimulus = createStimulus({ id: "touch:test", x: busyFish.x + 2.5, y: busyFish.y, sequence: 1 });
  const assigned = assignAttention(busy, stimulus, {
    commitmentFor: (fish) => activityCommitment(fish.activity?.current),
  }).filter(Boolean);

  // The guaranteed first responder still goes; nobody else abandons a mouthful.
  const investigators = assigned.filter((record) => record.role === RESPONSE_ROLES.investigate);
  assert.equal(investigators.length, 1);
  assert.ok(assigned.some((record) => record.role === RESPONSE_ROLES.delayed));
  for (const record of assigned) {
    if (record.role !== RESPONSE_ROLES.delayed) continue;
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

  const control = run(base, 1.2);
  const responding = run(touched, 1.2);
  const before = base.individuals[index];
  const quiet = control.individuals[index];
  const answered = responding.individuals[index];

  assert.equal(answered.activity.current, before.activity.current, "a passive responder changed activity");
  // Something a person could see: it is not travelling the same line at the
  // same speed with the same posture as the fish that was never disturbed.
  const movedDifferently = Math.hypot(answered.x - quiet.x, answered.y - quiet.y) > 0.02
    || Math.abs(Math.hypot(answered.vx, answered.vy) - Math.hypot(quiet.vx, quiet.vy)) > 0.01
    || Math.abs((answered.visual.pitch ?? 0) - (quiet.visual.pitch ?? 0)) > 0.5;
  assert.ok(movedDifferently, "a passive response had no visible correlate");
});

test("a responder comes back to what it was doing", () => {
  const base = settled(5);
  const touched = applyTouch(base, base.cols / 2, 9.5);
  const index = touched.individuals.findIndex((fish) => fish.attention?.role === RESPONSE_ROLES.investigate);
  const before = base.individuals[index].activity.current;
  assert.equal(touched.individuals[index].activity.current, ACTIVITIES.touchReact);
  // What it was doing is remembered by the response itself, so it has somewhere
  // to go back to when the response ends.
  assert.equal(touched.individuals[index].attention.resume.current, before);

  // Its own response window, not a global timer, and nothing cancels it early.
  let state = touched;
  let releasedAt = null;
  let atRelease = null;
  for (let step = 0; step < 120 && releasedAt === null; step += 1) {
    state = tick(state, 0.1);
    const fish = state.individuals[index];
    if (fish.activity.current !== ACTIVITIES.touchReact) {
      releasedAt = (step + 1) * 0.1;
      atRelease = fish.activity.current;
    }
    if (fish.attention) assert.equal(fish.attention.resume.current, before);
  }
  assert.ok(releasedAt !== null, "a responder never let go");
  assert.ok(releasedAt > 1, "a responder let go before it arrived");
  assert.equal(state.individuals[index].attention, null);
  // Recovery, not cancellation: it picks up the activity it put down. It may
  // then finish that activity naturally a moment later - which is the point,
  // because that is a fish getting on with its evening rather than a state
  // machine being reset.
  assert.equal(atRelease, before);
});

test("a second press does not cost a responder its way back", () => {
  const base = settled(5);
  const first = applyTouch(base, base.cols / 2, 9.5);
  const index = first.individuals.findIndex((fish) => fish.attention?.role === RESPONSE_ROLES.investigate);
  const original = base.individuals[index].activity.current;

  // A near-repeat, which coalesces into the live event, and then a press across
  // the tank. Neither may overwrite what the fish put down with the
  // `touch-react` it is now in, or drop the thread by handing it a new role.
  let state = run(first, 0.5);
  state = applyTouch(state, base.cols / 2 + 0.4, 9.6);
  assert.equal(state.individuals[index].attention.resume.current, original);
  state = applyTouch(run(state, 0.3), 3, 13);
  assert.equal(state.individuals[index].attention?.resume.current, original);

  let released = null;
  for (let step = 0; step < 150 && released === null; step += 1) {
    state = tick(state, 0.1);
    if (state.individuals[index].activity.current !== ACTIVITIES.touchReact) {
      released = state.individuals[index].activity.current;
    }
  }
  assert.equal(released, original, "a repeated tap cancelled the recovery it promised");
});

test("a press anywhere on a fish reads as a press at that fish", () => {
  const base = settled(5);
  // The widest adult in the tank: its tail is three and a half cells from its
  // centre, and pressing it is pressing the fish.
  const widest = base.individuals.reduce((best, fish) =>
    (spriteDimensions(spriteForFish(fish)).width > spriteDimensions(spriteForFish(best)).width ? fish : best));
  const halfWidth = spriteDimensions(spriteForFish(widest)).width / 2;
  assert.ok(halfWidth >= 2.5, "expected a grown fish to test against");
  for (const offset of [0, halfWidth * 0.5, halfWidth]) {
    assert.equal(classifyStimulusContext(base, widest.x + offset, widest.y), "fish",
      `a press ${offset.toFixed(1)} cells from the centre of a ${halfWidth * 2}-column fish missed it`);
  }
  // Well clear of every fish is not a press at one.
  const empty = base.individuals.every((fish) => Math.hypot(fish.x - 2, fish.y - 3) > 8);
  if (empty) assert.notEqual(classifyStimulusContext(base, 2, 3), "fish");
});

test("responders let go at different times", () => {
  const base = settled(147);
  const touched = applyTouch(base, base.cols / 2, 9.5);
  const responders = touched.individuals
    .map((fish, index) => (attentionInvestigates(fish.attention) ? index : -1))
    .filter((index) => index >= 0);
  assert.ok(responders.length >= 2, "not enough responders to compare");

  const released = new Map();
  let state = touched;
  for (let step = 0; step < 120; step += 1) {
    state = tick(state, 0.1);
    for (const index of responders) {
      if (released.has(index)) continue;
      if (state.individuals[index].activity.current !== ACTIVITIES.touchReact) {
        released.set(index, (step + 1) * 0.1);
      }
    }
  }
  assert.equal(released.size, responders.length, "a responder never finished");
  assert.ok(new Set(released.values()).size > 1, "every responder let go on the same frame");
});

test("a shy fish actually puts water between itself and the press", () => {
  const base = settled(5);
  let leaning = 0;
  let closing = 0;
  for (let x = 5; x < 62; x += 7) {
    for (const y of [5, 9.5, 14]) {
      const touched = applyTouch(base, x, y);
      touched.individuals.forEach((fish, index) => {
        const attention = fish.attention;
        if (attention?.role !== RESPONSE_ROLES.wary) return;
        const target = tickFishActivity(fish, index, touched, 0.1, {}).target;
        if (!target) return;
        // A fish with its mouth in the sand keeps its strike geometry on
        // purpose; its answer is the pause and the lifted nose.
        if (target.forageSearching || target.forageGrazing) return;
        const toTarget = { x: target.x - fish.x, y: target.y - fish.y };
        const toPress = { x: attention.x - fish.x, y: attention.y - fish.y };
        const length = Math.hypot(toTarget.x, toTarget.y) * Math.hypot(toPress.x, toPress.y);
        if (length < 1e-6) return;
        leaning += 1;
        if ((toTarget.x * toPress.x + toTarget.y * toPress.y) / length > 0.001) closing += 1;
      });
    }
  }
  assert.ok(leaning > 20, "not enough shy responders to judge");
  // Leaning away means not still swimming toward it. A fixed turn off a heading
  // that pointed at the press left a third of them closing on it, which read as
  // a slightly slower watch rather than a fish keeping its distance.
  assert.equal(closing, 0, `${closing} of ${leaning} shy responders were still closing on the press`);
});

test("a shy fish keeps that distance for the whole response, not just the start", () => {
  // The lean fades; the not-closing does not. A turn that decayed with the
  // response swung back through the press on its way out, which a test that
  // only looked at the first frame could not see.
  const fish = { x: 10, y: 10, vx: 0.4, vy: 0, seed: 12345, visual: { pitch: 0 } };
  const attention = {
    stimulusId: "touch:test",
    role: RESPONSE_ROLES.wary,
    x: 20,
    y: 10,
    distance: 10,
    delaySeconds: 0,
    durationSeconds: 3.2,
    ageSeconds: 0,
  };
  for (const bearing of [0, 0.4, 1, 1.5, 2.5, 3]) {
    const target = {
      x: fish.x + Math.cos(bearing) * 10,
      y: fish.y + Math.sin(bearing) * 10,
      speed: 0.4,
    };
    for (const progress of [0, 0.05, 0.25, 0.5, 0.75, 0.99]) {
      const shaped = shapeTargetForAttention(target, fish, {
        ...attention,
        ageSeconds: attention.durationSeconds * progress,
      });
      const toTarget = { x: shaped.x - fish.x, y: shaped.y - fish.y };
      const toPress = { x: attention.x - fish.x, y: attention.y - fish.y };
      const closing = (toTarget.x * toPress.x + toTarget.y * toPress.y)
        / (Math.hypot(toTarget.x, toTarget.y) * Math.hypot(toPress.x, toPress.y));
      assert.ok(closing <= 0.001,
        `at ${(progress * 100).toFixed(0)}% of the response, a shy fish on bearing ${bearing} was closing (${closing.toFixed(3)})`);
    }
  }
});

test("a press elsewhere does not cut short a response already under way", () => {
  const base = settled(5);
  const first = applyTouch(base, base.cols / 2, 9.5);
  const passive = first.individuals.findIndex((fish) => isPassiveRole(fish.attention?.role));
  assert.ok(passive >= 0, "no fish gave a passive response");
  const record = first.individuals[passive].attention;

  // A press well outside this fish's perception radius gives it no new role.
  // Its lean or glance has its own seeded life and must run out on its own
  // rather than being cancelled by something it never noticed.
  const responder = first.individuals[passive];
  const far = responder.x < base.cols / 2
    ? { x: base.cols - 2, y: 14 }
    : { x: 2, y: 14 };
  assert.ok(Math.hypot(far.x - responder.x, far.y - responder.y) > TOUCH_STIMULUS_RADIUS_CELLS,
    "the second press is not far enough away to be unnoticed");

  const elsewhere = applyTouch(run(first, 0.3), far.x, far.y);
  const after = elsewhere.individuals[passive].attention;
  assert.ok(after, "a distant press cancelled a response already under way");
  assert.equal(after.stimulusId, record.stimulusId);
  assert.ok(after.ageSeconds > 0, "the response was restarted rather than left alone");
});

test("a press on the surface is a surface press however the wave is sitting", () => {
  const base = settled(5);
  // The visible surface rides above the row a press can be sent to, so a press
  // at the very top of the tank is clamped inward before a fish can be aimed at
  // it. What it landed on has to be decided by where the viewer pressed: at
  // some wave phases the clamped point fell a hundredth of a row outside the
  // surface margin and the same press read as open water.
  for (let step = 0; step < 12; step += 1) {
    const moment = run(base, step * 0.35);
    for (const x of [7, 20, 33, 52]) {
      const touched = applyTouch(moment, x, 0);
      assert.equal(touched.stimuli[0].context, "surface",
        `a press at the top of the tank at x=${x} read as ${touched.stimuli[0].context}`);
      // The press still lands where a fish can be sent.
      assert.ok(touched.stimuli[0].y >= 2);
    }
  }
});

test("a fish arriving for the first time is never taken off its entry", () => {
  for (const seed of [5, 147, 1234]) {
    // Day 14 is the first arrival: a second fish swimming into the aquarium.
    const arriving = advanceAquariumHistory(createAquariumState({ seed }), 14);
    const index = arriving.individuals.findIndex((fish) => fish.activity?.current === ACTIVITIES.arrivalEnter);
    assert.ok(index >= 0, `seed ${seed}: expected an arrival in progress`);

    const newcomer = arriving.individuals[index];
    const touched = applyTouch(arriving, newcomer.x + 1.5, newcomer.y);
    const answered = touched.individuals[index];

    // It may notice the press. It may not be pulled out of an entry that
    // happens once in its life - not even by the guarantee that something
    // always answers, which finds another fish instead.
    assert.equal(answered.activity.current, ACTIVITIES.arrivalEnter);
    assert.equal(attentionInvestigates(answered.attention), false);
    if (answered.attention) assert.ok(isPassiveRole(answered.attention.role));
    assert.ok(
      touched.individuals.some((fish, other) => other !== index && attentionInvestigates(fish.attention)),
      `seed ${seed}: nothing answered the press`,
    );
  }
});

test("attention is transient: bounded, one per fish, and never carried over", () => {
  const base = settled(5);
  const touched = applyTouch(base, 30, 9);
  assert.equal(touched.individuals.length, base.individuals.length);
  for (const fish of touched.individuals) {
    if (!fish.attention) continue;
    const keys = Object.keys(fish.attention).sort();
    // Fixed shape, fixed size. The hold fields are five more scalars, not a
    // list that grows with how long a gesture went on for.
    assert.deepEqual(
      keys.filter((key) => key !== "resume"),
      [
        "ageSeconds",
        "delaySeconds",
        "distance",
        "durationSeconds",
        "held",
        "holdSeconds",
        "nearSeconds",
        "released",
        "role",
        "settled",
        "stimulusId",
        "x",
        "y",
      ],
    );
    // Only a fish that put something down carries the thing it put down.
    assert.equal("resume" in fish.attention, attentionInvestigates(fish.attention));
  }

  // A second press replaces the response of every fish that notices it, and
  // leaves the others to finish the one they are already giving.
  const again = applyTouch(run(touched, 0.5), 12, 12);
  for (const fish of again.individuals) {
    if (!fish.attention) continue;
    const noticed = Math.hypot(12 - fish.x, 12 - fish.y) <= TOUCH_STIMULUS_RADIUS_CELLS;
    assert.equal(fish.attention.stimulusId, noticed ? "touch:2" : "touch:1");
    assert.equal(fish.attention.role !== undefined, true);
  }

  // And every response ends.
  const settledAgain = run(again, 8);
  assert.equal(settledAgain.individuals.every((fish) => fish.attention === null), true);
  assert.equal(settledAgain.individuals.some((fish) => fish.activity.current === ACTIVITIES.touchReact), false);
});
