/*
 * A press that stays: hold interaction and persistent presence.
 *
 * The claim Phase 3 makes is that a finger resting on the glass is a different
 * thing from a finger tapping it, that a fish can visibly stay with it, that
 * letting go has consequences, and that none of it costs the aquarium anything
 * for having gone on longer. Each of those is checkable, and the last one is
 * the reason this file exists at all: a persistent gesture is exactly the kind
 * of feature that leaks, and this device runs for months without a reboot.
 *
 * Everything here drives the production verbs - `applyTouch`, `applyHold`,
 * `applyRelease`, `tick` - in the order `src/app.js` drives them, because a
 * hold that only works when a test poses it is not a hold.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  HOLD_PHASES,
  HOLD_PHASE_LIST,
  attentionInvestigates,
  attentionPatience,
  holdPhase,
  isPassiveRole,
} from "../src/sim/attention.js";
import {
  HOLD_MOVEMENT_CELLS,
  HOLD_STALE_SECONDS,
  HOLD_THRESHOLD_SECONDS,
  MAX_HOLD_SECONDS,
  MAX_IMPULSES,
  MAX_STIMULI,
  heldStimulus,
} from "../src/sim/interaction-events.js";
import { affinitiesFromSeed } from "../src/sim/fish-personality.js";
import { traitsFromSeed } from "../src/sim/entities.js";
import { ACTIVITIES } from "../src/sim/fish-activities.js";
import { applyHold, applyRelease, applyTouch, serializePersistentState } from "../src/sim/state.js";
import { tick } from "../src/sim/tick.js";
import { STOCKED_AQUARIUM_DAY, createObservationAquarium } from "../src/dev/interaction-observation.js";

const STEP = 0.1;

const settledBySeed = new Map();
function settled(seed) {
  if (!settledBySeed.has(seed)) {
    settledBySeed.set(seed, createObservationAquarium({ seed, days: STOCKED_AQUARIUM_DAY, settleSeconds: 60 }));
  }
  return settledBySeed.get(seed);
}

/**
 * A press held at one point for a while, then let go, driven exactly as the app
 * drives it: the press, then the hold told to the aquarium once per frame
 * before the tick, then the release, then however long we want to watch the
 * aftermath for. `onFrame` sees every frame, which is where the assertions that
 * are about the middle of a gesture rather than its end live.
 */
function holdFor(state, x, y, holdSeconds, { afterSeconds = 0, onFrame = null } = {}) {
  let current = applyTouch(state, x, y);
  let seconds = 0;
  const frames = Math.round((holdSeconds + afterSeconds) / STEP);
  for (let frame = 0; frame < frames; frame += 1) {
    seconds = Number(((frame + 1) * STEP).toFixed(4));
    if (seconds <= holdSeconds) current = applyHold(current, x, y, seconds);
    else if (heldStimulus(current)) current = applyRelease(current);
    current = tick(current, STEP);
    if (onFrame) onFrame(current, seconds);
  }
  return current;
}

function engaged(state) {
  return state.individuals.filter((fish) => attentionInvestigates(fish.attention)).length;
}

function phases(state) {
  const seen = new Set();
  for (const fish of state.individuals) {
    const phase = holdPhase(fish.attention, fish);
    if (phase) seen.add(phase);
  }
  return seen;
}

// A press only becomes a presence if it stays. Everything else in this file
// depends on that transition happening at all, so it is the first thing.
test("a press that stays put becomes a presence, and one that does not stays a tap", () => {
  const base = settled(5);

  // Below the threshold it is still the tap it always was.
  let tapped = applyTouch(base, 30, 9);
  tapped = applyHold(tapped, 30, 9, HOLD_THRESHOLD_SECONDS - 0.05);
  assert.equal(heldStimulus(tapped), null);

  // Past it, without a mode, a menu or a second gesture.
  let holding = applyTouch(base, 30, 9);
  holding = applyHold(holding, 30, 9, HOLD_THRESHOLD_SECONDS + 0.05);
  const held = heldStimulus(holding);
  assert.ok(held, "the press did not become a presence");
  assert.equal(held.held, true);
  // The same event, refreshed - not a second one. Responders were handed this
  // identity when the press landed and must not be pointed at a new one.
  assert.equal(held.id, "touch:1");
  assert.equal(holding.stimuli.length, 1);

  // A finger that travelled further than a hold may is a gesture with a
  // direction in it. That belongs to Phase 4; today the honest thing is to stop
  // claiming the finger is resting there.
  const wandered = applyHold(holding, 30 + HOLD_MOVEMENT_CELLS + 0.5, 9, 1.2);
  assert.equal(heldStimulus(wandered), null);
  assert.equal(wandered.stimuli[0].released, true);
});

test("a hold is behaviourally distinct from the tap that began it", () => {
  for (const seed of [5, 147, 1234]) {
    const base = settled(seed);

    // The same press, with and without a finger left on it. The tap's answer is
    // spent within its own life; the hold's is still going.
    const tapped = holdFor(base, 33, 9.5, 0, { afterSeconds: 8 });
    const holding = holdFor(base, 33, 9.5, 8);

    assert.equal(
      tapped.individuals.every((fish) => fish.attention === null),
      true,
      `seed ${seed}: a tap was still being answered eight seconds later`,
    );
    assert.ok(
      engaged(holding) > 0,
      `seed ${seed}: nothing was still answering the finger after eight seconds`,
    );
    assert.ok(
      holding.individuals.some((fish) => fish.activity?.current === ACTIVITIES.touchReact),
      `seed ${seed}: no fish was still at the presence`,
    );
  }
});

// The plan's arc, in the plan's words: notice, orient, approach, inspect,
// linger, lose interest, depart. Not every fish reaches every stage - that is
// the point of having stages - but a long hold has to produce all of them.
test("a long hold puts the aquarium through the whole arc", () => {
  for (const seed of [5, 147, 1234]) {
    const reached = new Set();
    const held = holdFor(settled(seed), 33, 9.5, 24, {
      afterSeconds: 6,
      onFrame: (state) => {
        for (const phase of phases(state)) reached.add(phase);
      },
    });
    for (const phase of HOLD_PHASE_LIST) {
      assert.ok(reached.has(phase), `seed ${seed}: no fish ever reached ${phase}`);
    }
    // And the vocabulary is closed: nothing is reported that is not in it.
    for (const phase of reached) assert.ok(HOLD_PHASE_LIST.includes(phase), `unknown phase ${phase}`);
    // A tap has no arc at all, which is what makes these stages a hold's.
    assert.equal(held.individuals.every((fish) => holdPhase(fish.attention, fish) === null), true);
  }
});

test("a fish visibly stays with a stationary finger, and gets there", () => {
  for (const seed of [5, 147, 1234]) {
    let arrived = null;
    let arrivedSeconds = 0;
    holdFor(settled(seed), 33, 9.5, 24, {
      onFrame: (state, seconds) => {
        for (const fish of state.individuals) {
          const phase = holdPhase(fish.attention, fish);
          if (phase !== HOLD_PHASES.inspect && phase !== HOLD_PHASES.linger) continue;
          if (arrived === null) {
            arrived = fish.seed;
            arrivedSeconds = seconds;
          }
        }
      },
    });
    assert.ok(arrived !== null, `seed ${seed}: no fish ever reached the presence`);
    assert.ok(arrivedSeconds < 24, `seed ${seed}: nothing arrived inside the hold`);
  }
});

// Different levels of commitment is a gate item, and it is not the same claim
// as "different roles": two fish can both investigate and one of them can go
// home after four seconds.
test("fish commit to a hold by different amounts, and personality says which", () => {
  const engagement = new Map();
  const held = holdFor(settled(5), 33, 9.5, 24, {
    onFrame: (state) => {
      for (const fish of state.individuals) {
        if (!fish.attention?.held || !attentionInvestigates(fish.attention)) continue;
        engagement.set(fish.seed, (engagement.get(fish.seed) ?? 0) + STEP);
      }
    },
  });

  const committed = [...engagement.values()].filter((seconds) => seconds > 1);
  assert.ok(committed.length >= 2, "fewer than two fish committed anything to the hold");
  assert.ok(
    Math.max(...committed) - Math.min(...committed) > 2,
    "every fish that answered the hold gave it the same amount of time",
  );

  // The ones that stay are the ones the aquarium already said would: patience
  // is derived from traits the fish has had since it was created, so a hold
  // cannot flatten a cautious fish into a bold one.
  const stayers = [...engagement.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 2)
    .map(([seed]) => seed);
  const patienceOf = (seed) => attentionPatience(traitsFromSeed(seed), affinitiesFromSeed(seed));
  const median = [...held.individuals]
    .map((fish) => patienceOf(fish.seed))
    .sort((left, right) => left - right)[Math.floor(held.individuals.length / 2)];
  for (const seed of stayers) {
    assert.ok(patienceOf(seed) > median, `a fish with below-median patience outstayed the rest`);
  }
});

// Something has to happen when the finger goes. A response that simply stopped
// would park a fish against the glass and then switch it off.
test("release has a readable aftermath rather than a cancellation", () => {
  for (const seed of [5, 147, 1234]) {
    let state = settled(seed);
    state = holdFor(state, 33, 9.5, 12);
    const atRelease = state.individuals.map((fish) => ({
      seed: fish.seed,
      engaged: attentionInvestigates(fish.attention),
      activity: fish.activity?.current ?? null,
      resume: fish.attention?.resume?.current ?? null,
    }));
    const wereEngaged = atRelease.filter((fish) => fish.engaged);
    assert.ok(wereEngaged.length > 0, `seed ${seed}: nothing to release`);

    state = applyRelease(state);
    assert.equal(heldStimulus(state), null);
    // The presence does not vanish. A fish still crossing the tank arrives at
    // the place something was, rather than at nothing at all.
    const remembered = state.stimuli.find((stimulus) => stimulus.released);
    assert.ok(remembered, `seed ${seed}: the presence vanished with the finger`);

    // The fish find out on their own next frame, and take their own time.
    const releaseFrames = new Map();
    const departed = new Set();
    for (let frame = 1; frame <= 80; frame += 1) {
      state = tick(state, STEP);
      for (const fish of state.individuals) {
        if (holdPhase(fish.attention, fish) === HOLD_PHASES.depart) departed.add(fish.seed);
        if (!fish.attention && !releaseFrames.has(fish.seed) && departed.has(fish.seed)) {
          releaseFrames.set(fish.seed, frame);
        }
      }
    }
    for (const fish of wereEngaged) {
      assert.ok(departed.has(fish.seed), `seed ${seed}: a responder did not depart`);
    }
    assert.ok(
      new Set(releaseFrames.values()).size > 1,
      `seed ${seed}: every responder let go on the same frame`,
    );

    // And the departure is a peeling away, not a switch: each responder ends up
    // further from where the finger was than it was when the finger left.
    assert.equal(engaged(state), 0);
    for (const fish of state.individuals) {
      assert.equal(fish.attention, null);
      assert.notEqual(fish.activity?.current, ACTIVITIES.touchReact);
    }
  }
});

// A found defect, kept fixed. A passive answer is renewed for as long as the
// finger is there; when it goes, that answer must resume draining from wherever
// its habituation had got to, not restart at full. Restarting it handed every
// fish that had long since straightened up a fresh full-strength turn toward a
// disturbance that had just stopped existing - the whole cast twitching in one
// frame, which is precisely the synchronised response Stage 2 exists to end.
test("letting go does not twitch the fish that had stopped watching", () => {
  const heading = (fish) => Math.atan2(fish.vy, fish.vx);
  const turn = (from, to) => {
    let difference = to - from;
    while (difference > Math.PI) difference -= Math.PI * 2;
    while (difference < -Math.PI) difference += Math.PI * 2;
    return Math.abs(difference) * 180 / Math.PI;
  };

  for (const seed of [5, 147, 1234]) {
    const base = settled(seed);
    let held = applyTouch(base, 33, 9.5);
    for (let frame = 1; frame <= 200; frame += 1) {
      held = applyHold(held, 33, 9.5, frame * STEP);
      held = tick(held, STEP);
    }
    // Twenty seconds in, the fish that only ever watched have settled: their
    // patience is spent and their answer is no longer visible at all. A fish
    // that still has some of its patience left is a different case - it has a
    // real, small response still running, and it is allowed to finish it.
    const settledWatchers = held.individuals
      .filter((fish) => holdPhase(fish.attention, fish) === HOLD_PHASES.settle)
      .map((fish) => fish.seed);
    assert.ok(settledWatchers.length > 0, `seed ${seed}: nothing had settled`);
    const stayers = held.individuals
      .filter((fish) => attentionInvestigates(fish.attention))
      .map((fish) => fish.seed);
    assert.ok(stayers.length > 0, `seed ${seed}: nothing was still at the glass`);

    // The control is the same aquarium in the same frame with the finger left
    // where it was: a fish that turns identically either way was turning
    // anyway, and only the difference between the two belongs to the release.
    const released = tick(applyRelease(held), STEP);
    const stillHeld = tick(applyHold(held, 33, 9.5, 20.1), STEP);
    const headingBySeed = (state) => new Map(state.individuals.map((fish) => [fish.seed, heading(fish)]));
    const withRelease = headingBySeed(released);
    const without = headingBySeed(stillHeld);
    for (const seedOf of settledWatchers) {
      assert.ok(
        turn(without.get(seedOf), withRelease.get(seedOf)) < 1,
        `seed ${seed}: the release turned a fish that had stopped watching`,
      );
    }
    // And the fish that had not stopped are visibly affected by it, so this is
    // a test about who reacts rather than about nothing reacting.
    assert.ok(
      stayers.some((seedOf) => turn(without.get(seedOf), withRelease.get(seedOf)) > 1),
      `seed ${seed}: nothing at the glass noticed the finger leaving`,
    );
  }
});

test("a responder resumes the activity it put down for the presence", () => {
  let resumed = 0;
  let checked = 0;
  for (const seed of [5, 147, 1234]) {
    const held = holdFor(settled(seed), 33, 9.5, 10);
    const threads = new Map(held.individuals
      .filter((fish) => fish.attention?.resume?.current)
      .map((fish) => [fish.seed, fish.attention.resume.current]));
    const after = holdFor(settled(seed), 33, 9.5, 10, { afterSeconds: 8 });
    for (const fish of after.individuals) {
      const thread = threads.get(fish.seed);
      if (!thread) continue;
      checked += 1;
      if (fish.activity?.current === thread) resumed += 1;
    }
  }
  assert.ok(checked > 0, "no fish put anything down for the presence");
  // Not every fish: an activity can complete naturally while a fish is away, and
  // a thread that is no longer available is not resumed. Most of them, though -
  // a hold that reliably cost a fish its evening would be the cancellation this
  // phase exists not to be.
  assert.ok(resumed / checked >= 0.5, `only ${resumed} of ${checked} responders picked their thread back up`);
});

// The gate item, and the reason the whole thing is built out of one refreshed
// event rather than a stream of them.
test("a minute-long hold creates nothing that accumulates", () => {
  const base = settled(5);
  let peakStimuli = 0;
  let peakImpulses = 0;
  let peakRecords = 0;
  let peakEngaged = 0;
  const held = holdFor(base, 33, 9.5, 60, {
    afterSeconds: 10,
    onFrame: (state) => {
      peakStimuli = Math.max(peakStimuli, state.stimuli.length);
      peakImpulses = Math.max(peakImpulses, state.impulses.length);
      peakRecords = Math.max(peakRecords, state.individuals.filter((fish) => fish.attention).length);
      peakEngaged = Math.max(peakEngaged, engaged(state));
      for (const fish of state.individuals) {
        if (!fish.attention) continue;
        assert.ok(fish.attention.holdSeconds <= MAX_HOLD_SECONDS);
        assert.ok(fish.attention.ageSeconds <= MAX_HOLD_SECONDS);
        assert.ok(fish.attention.nearSeconds <= MAX_HOLD_SECONDS);
      }
    },
  });

  // One stimulus for the whole minute, one impulse at each end of it, one
  // record per fish and never more fish pulled off their evening than a tap may
  // pull.
  assert.equal(peakStimuli, 1);
  assert.ok(peakImpulses <= MAX_IMPULSES);
  assert.ok(peakStimuli <= MAX_STIMULI);
  assert.ok(peakRecords <= base.individuals.length);
  assert.ok(peakEngaged <= 5, `a hold pulled ${peakEngaged} fish off their activities`);

  // Ten seconds after the finger goes there is nothing left of it anywhere.
  assert.deepEqual([...held.stimuli], []);
  assert.deepEqual([...held.impulses], []);
  assert.equal(held.individuals.every((fish) => fish.attention === null), true);

  // And nothing about it was ever written down.
  const payload = serializePersistentState(held);
  for (const key of ["stimuli", "impulses", "hold", "contact", "pointer"]) {
    assert.equal(key in payload, false, `${key} must not be persisted`);
  }
  for (const fish of payload.individuals) {
    assert.equal("attention" in fish, false);
  }
});

// The other half of boundedness: a hold that costs the same at sixty seconds as
// at fifteen, because everyone who was going to lose interest already has.
test("a hold settles, and stays settled", () => {
  const samples = new Map();
  holdFor(settled(5), 33, 9.5, 60, {
    onFrame: (state, seconds) => {
      const at = Math.round(seconds * 10) / 10;
      if ([15, 30, 45, 59].some((mark) => Math.abs(at - mark) < 0.001)) {
        samples.set(at, engaged(state));
      }
    },
  });
  const counts = [...samples.values()];
  assert.equal(counts.length, 4);
  for (const count of counts) assert.ok(count <= 3, `${count} fish still committed to a settled hold`);
  assert.equal(counts.at(-1), counts.at(-2), "the aquarium was still changing its mind at a minute");
  assert.ok(counts.at(-1) >= 1, "a hold that nobody stayed with is a tap with extra steps");
});

// A viewer's finger is not a state machine, and a browser is allowed to lose an
// event. Without this, one dropped pointerup is a permanent disturbance in a
// device that runs for months.
test("a hold nobody confirms lets go of itself", () => {
  let state = applyTouch(settled(5), 33, 9.5);
  state = applyHold(state, 33, 9.5, 0.6);
  assert.ok(heldStimulus(state));

  // The gesture stops arriving - a lost release, a cancelled contact, a tab
  // that went away mid-press. Nothing else is done about it.
  for (let frame = 0; frame < Math.round((HOLD_STALE_SECONDS + 0.2) / STEP); frame += 1) {
    state = tick(state, STEP);
  }
  assert.equal(heldStimulus(state), null);
  const remembered = state.stimuli.find((stimulus) => stimulus.released);
  assert.ok(remembered, "the abandoned hold neither held nor released");

  // And it drains away like any other release.
  for (let frame = 0; frame < 60; frame += 1) state = tick(state, STEP);
  assert.deepEqual([...state.stimuli], []);
  assert.equal(state.individuals.every((fish) => fish.attention === null), true);
});

test("holding the same place twice does not replay the same performance", () => {
  const base = settled(5);
  const first = holdFor(base, 33, 9.5, 8, { afterSeconds: 6 });
  const second = holdFor(first, 33, 9.5, 8, { afterSeconds: 6 });

  const performance = (state, x, y, seconds) => {
    const record = [];
    holdFor(state, x, y, seconds, {
      onFrame: (frameState, at) => {
        if (Math.abs(at - seconds) > 0.001) return;
        record.push(...frameState.individuals
          .map((fish) => `${fish.seed}:${fish.attention?.role ?? "-"}:${holdPhase(fish.attention, fish) ?? "-"}`));
      },
    });
    return record.join(" ");
  };

  assert.notEqual(
    performance(base, 33, 9.5, 8),
    performance(second, 33, 9.5, 8),
    "the same hold in a changed aquarium produced an identical cast",
  );

  // Deterministic all the same: the same aquarium and the same gesture give the
  // same result, which is what makes the difference above a property of the
  // state rather than of a clock.
  assert.equal(performance(base, 33, 9.5, 8), performance(base, 33, 9.5, 8));
});

test("a hold does not turn the aquarium into a crowd at the glass", () => {
  for (const seed of [5, 147, 1234]) {
    const held = holdFor(settled(seed), 33, 9.5, 20);
    const passive = held.individuals.filter((fish) => fish.attention && isPassiveRole(fish.attention.role));
    assert.ok(
      passive.length >= held.individuals.length / 2,
      `seed ${seed}: most of the cast was pulled in by one finger`,
    );
    // Every fish not answering the presence is still doing something of its
    // own, and the aquarium is still doing several things at once.
    const activities = new Set(held.individuals.map((fish) => fish.activity?.current));
    assert.ok(activities.size >= 4, `seed ${seed}: the aquarium was down to ${activities.size} activities`);
  }
});
