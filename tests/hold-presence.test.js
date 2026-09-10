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
 * Everything here drives the production verbs - `applyTouch`, `applyContact`,
 * `applyRelease`, `tick` - in the order `src/app.js` drives them, because a
 * hold that only works when a test poses it is not a hold.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  HOLD_PHASES,
  HOLD_PHASE_LIST,
  MAX_DELAYED,
  MAX_INVESTIGATORS,
  MAX_SECONDARY,
  RESPONSE_ROLES,
  attentionInvestigates,
  attentionPatience,
  assignAttention,
  createAttention,
  holdPhase,
  isPassiveRole,
  mergeHoldAttention,
} from "../src/sim/attention.js";
import { GESTURES } from "../src/sim/pointer-path.js";
import {
  HOLD_MOVEMENT_CELLS,
  HOLD_STALE_SECONDS,
  HOLD_THRESHOLD_SECONDS,
  MAX_HOLD_SECONDS,
  MAX_IMPULSES,
  MAX_STIMULI,
  RELEASE_IMPULSE_SECONDS,
  RELEASE_IMPULSE_STRENGTH,
  TOUCH_STIMULUS_RADIUS_CELLS,
  createImpulse,
  createStimulus,
  heldStimulus,
  holdAttenuation,
  latestTouchStimulus,
  stimulusSalience,
} from "../src/sim/interaction-events.js";
import { createBubbleWorldRecords } from "../src/sim/bubbles.js";
import { TOUCH_FLOOR_ROWS, WATERLINE_ROWS } from "../src/sim/config.js";
import { affinitiesFromSeed } from "../src/sim/fish-personality.js";
import { traitsFromSeed } from "../src/sim/entities.js";
import { ACTIVITIES, activityCommitment } from "../src/sim/fish-activities.js";
import {
  applyContact,
  applyRelease,
  applyTouch,
  createAquariumState,
  serializePersistentState,
} from "../src/sim/state.js";
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
    if (seconds <= holdSeconds) current = applyContact(current, x, y, seconds);
    else if (heldStimulus(current)) current = applyRelease(current);
    current = tick(current, STEP);
    if (onFrame) onFrame(current, seconds);
  }
  return current;
}

function engaged(state) {
  return state.individuals.filter((fish) => attentionInvestigates(fish.attention)).length;
}

// The row a press at this row is actually acted on, which is where the aquarium
// can send a fish rather than where the viewer touched.
function clampedRow(state, y) {
  return Math.min(Math.max(y, WATERLINE_ROWS), state.rows - TOUCH_FLOOR_ROWS);
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
  tapped = applyContact(tapped, 30, 9, HOLD_THRESHOLD_SECONDS - 0.05);
  assert.equal(heldStimulus(tapped), null);

  // Past it, without a mode, a menu or a second gesture.
  let holding = applyTouch(base, 30, 9);
  holding = applyContact(holding, 30, 9, HOLD_THRESHOLD_SECONDS + 0.05);
  const held = heldStimulus(holding);
  assert.ok(held, "the press did not become a presence");
  assert.equal(held.held, true);
  // The same event, refreshed - not a second one. Responders were handed this
  // identity when the press landed and must not be pointed at a new one.
  assert.equal(held.id, "touch:1");
  assert.equal(holding.stimuli.length, 1);

  // A finger that travelled further than a hold may is a gesture with a
  // direction in it. Phase 4 gives it one: the presence stops being a presence
  // and becomes a drag, following the finger instead of the anchor - and it is
  // still the same event, so nothing that was answering it is startled twice.
  const wandered = applyContact(holding, 30 + HOLD_MOVEMENT_CELLS + 0.5, 9, 1.2);
  const moving = heldStimulus(wandered);
  assert.ok(moving, "the contact was thrown away instead of becoming a gesture");
  assert.equal(moving.gesture, GESTURES.drag);
  assert.equal(moving.wandered, true);
  assert.equal(moving.id, "touch:1", "the gesture was re-registered rather than refreshed");
  assert.equal(wandered.stimuli.length, 1);
  assert.ok(moving.x > 30, "the drag did not follow the finger");
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
      held = applyContact(held, 33, 9.5, frame * STEP);
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
    const stillHeld = tick(applyContact(held, 33, 9.5, 20.1), STEP);
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
    // a test about who reacts rather than about nothing reacting. A fish
    // hovering at the glass answers the release by drifting off it rather than
    // by swinging its head, so this reads position and speed as well.
    const place = (state) => new Map(state.individuals.map((fish) => [fish.seed, fish]));
    const releasedFish = place(released);
    const heldFish = place(stillHeld);
    const moved = (seedOf) => {
      const a = heldFish.get(seedOf);
      const b = releasedFish.get(seedOf);
      return Math.hypot(a.x - b.x, a.y - b.y)
        + Math.abs(Math.hypot(a.vx, a.vy) - Math.hypot(b.vx, b.vy))
        + turn(without.get(seedOf), withRelease.get(seedOf)) / 90;
    };
    assert.ok(
      stayers.some((seedOf) => moved(seedOf) > 0.01),
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
  state = applyContact(state, 33, 9.5, 0.6);
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

/* ------------------------------------------------------------------ *
 * Defects found in review
 * ------------------------------------------------------------------ */

// A fish that stays engaged across a change of role keeps the patience it has
// already spent. The record's age is that patience, so rebuilding the record
// handed a ten-second veteran its full appetite back - and a fish sitting near
// a threshold flipped investigate/approach on consecutive 0.6 s reviews,
// jerking 2.7 cells in and out of the glass instead of habituating.
test("an engaged fish keeps the patience it has spent, and its answer", () => {
  const stimulus = createStimulus({ id: "touch:1", x: 30, y: 9, held: true, holdSeconds: 8 });
  const fish = { seed: 12345, x: 31, y: 9, attention: null };
  const going = { ...createAttention(fish, stimulus, RESPONSE_ROLES.investigate), ageSeconds: 8, resume: { current: "cruise" } };

  // Same event, different active role: the clock carries.
  const hangingBack = createAttention(fish, stimulus, RESPONSE_ROLES.approach);
  const merged = mergeHoldAttention(going, hangingBack, stimulus);
  assert.equal(merged.role, RESPONSE_ROLES.approach);
  assert.equal(merged.ageSeconds, 8);
  assert.equal(merged.resume.current, "cruise");

  // A fish that was not engaged has spent nothing on going, so deciding to go
  // starts its clock now.
  const watching = { ...createAttention(fish, stimulus, RESPONSE_ROLES.watch), ageSeconds: 8 };
  const decides = mergeHoldAttention(watching, createAttention(fish, stimulus, RESPONSE_ROLES.investigate), stimulus);
  assert.equal(decides.ageSeconds, 0);

  // And across the whole gesture, on the production path, an engaged fish does
  // not change its mind about how close it means to get.
  for (const seed of [5, 147, 1234]) {
    const last = new Map();
    const flips = new Map();
    holdFor(settled(seed), 33, 9.5, 40, {
      onFrame: (state) => {
        for (const one of state.individuals) {
          const role = one.attention?.role;
          if (!role) continue;
          const previous = last.get(one.seed);
          if (previous && previous !== role && !isPassiveRole(previous) && !isPassiveRole(role)) {
            flips.set(one.seed, (flips.get(one.seed) ?? 0) + 1);
          }
          last.set(one.seed, role);
        }
      },
    });
    const worst = Math.max(0, ...flips.values());
    assert.ok(worst <= 1, `seed ${seed}: a fish changed its standoff ${worst} times during one hold`);
  }
});

// A fish that likes the glass stays with a finger that will not go away. It
// used to, for the wrong reason - a role change reset its patience - so this
// pins the behaviour to the thing that is meant to produce it.
test("some fish are still at the glass a minute in, and most are not", () => {
  for (const seed of [5, 147, 1234]) {
    const samples = [];
    const held = holdFor(settled(seed), 33, 9.5, 60, {
      onFrame: (state, seconds) => {
        if ([30, 45, 59].some((mark) => Math.abs(seconds - mark) < 0.001)) samples.push(engaged(state));
      },
    });
    assert.equal(samples.length, 3);
    // Never nobody, and never more than the caps allow a single event to pull
    // off its activities - which is the ceiling that makes this a few fish at
    // the glass rather than a crowd, whatever a hold goes on to do.
    const ceiling = MAX_INVESTIGATORS + MAX_SECONDARY + MAX_DELAYED;
    for (const count of samples) {
      assert.ok(count >= 1, `seed ${seed}: nothing was left at a finger that never moved`);
      assert.ok(count <= ceiling, `seed ${seed}: ${count} fish were still committed at a minute`);
    }
    // The ones that stay are the ones that like the glass. Not every one of
    // them individually - a fish that happened to be right beside the finger
    // stays on proximity alone, which is as it should be - but as a group they
    // are drawn from the top of the cast on the trait that is supposed to
    // decide it, and by a wide margin.
    const stayed = held.individuals.filter((fish) => attentionInvestigates(fish.attention));
    const mean = (values) => values.reduce((total, value) => total + value, 0) / values.length;
    const glassOf = (one) => affinitiesFromSeed(one.seed).glass;
    assert.ok(
      mean(stayed.map(glassOf)) > mean(held.individuals.map(glassOf)) + 0.1,
      `seed ${seed}: the fish that stayed were no fonder of the glass than the cast`,
    );
  }
});

// Sequence numbers wrap on purpose - they must not grow over months of
// touching - so anything that compares them has to. On the wrap the newest
// press carries the smallest number, and picking the largest handed the gesture
// an unrelated event to measure its movement allowance against.
test("a hold finds its own press across the sequence wraparound", () => {
  const base = settled(5);
  // The counter is one press away from wrapping, and an earlier press is still
  // live at the far end of the tank.
  const wrapping = { ...base, interactionSequence: 65_535, stimuli: Object.freeze([]) };
  const pressed = applyTouch(wrapping, 10, 9);
  assert.equal(pressed.interactionSequence, 0);
  const withElder = {
    ...pressed,
    stimuli: Object.freeze([
      createStimulus({ id: "touch:65535", sequence: 65_535, x: 55, y: 9 }),
      ...pressed.stimuli,
    ]),
  };

  assert.equal(latestTouchStimulus(withElder).sequence, 0);
  const holding = applyContact(withElder, 10, 9, HOLD_THRESHOLD_SECONDS + 0.1);
  assert.equal(heldStimulus(holding).x, 10, "the hold formed on the wrong press");
  assert.equal(heldStimulus(holding).sequence, 0);
});

// The movement allowance is about the viewer's finger, and the point the
// aquarium acts on is clamped into the band a fish can be sent to. Measured on
// the clamped point, a finger drawn three rows through the gravel does not move
// at all, and a drag along the sand is promoted to a stationary hold.
test("a finger drawn through the clamped bands is not a stationary hold", () => {
  const base = settled(5);
  // Down in the gravel, and up above the waterline: the two bands where the
  // point a fish can be sent to stops following the finger.
  for (const [from, to] of [[19, 16], [0.05, 1.95]]) {
    let holding = applyContact(applyTouch(base, 30, from), 30, from, HOLD_THRESHOLD_SECONDS + 0.1);
    const anchor = heldStimulus(holding);
    assert.ok(anchor, `a press at row ${from} did not become a presence`);
    // The presence remembers where the pointer actually was, not only where the
    // aquarium can act - which is the whole point of the two coordinates.
    assert.equal(anchor.pointerY, from);
    // Both ends of this drag are acted on at the same row, so measuring the
    // movement there would see a finger that never moved.
    assert.equal(
      clampedRow(base, from),
      clampedRow(base, to),
      `rows ${from} and ${to} were expected to clamp together`,
    );
    assert.ok(Math.abs(to - from) > HOLD_MOVEMENT_CELLS);
    holding = applyContact(holding, 30, to, HOLD_THRESHOLD_SECONDS + 0.6);
    assert.equal(
      heldStimulus(holding).gesture,
      GESTURES.drag,
      `a ${Math.abs(to - from)}-row drag stayed a stationary hold`,
    );
  }

  // A fingertip's worth of wander inside the same band is still a hold.
  let steady = applyContact(applyTouch(base, 30, 19), 30, 19, HOLD_THRESHOLD_SECONDS + 0.1);
  steady = applyContact(steady, 30, 18.4, HOLD_THRESHOLD_SECONDS + 0.6);
  assert.ok(heldStimulus(steady), "a small wander ended the hold");
});

// The ring a release makes is meant to be the gentler of the two. The substrate
// bubble source read every substrate impulse as the same event, so letting go
// on the sand raised a second full burst - which reads as another press.
test("letting go of the sand lifts less than pressing it did", () => {
  const base = settled(5);
  const y = base.rows - 5;
  const raised = (impulse) => {
    const ids = new Set();
    for (let age = 0; age < impulse.durationSeconds; age += 0.05) {
      const state = { ...base, impulses: Object.freeze([createImpulse({ ...impulse, ageSeconds: age })]) };
      for (const record of createBubbleWorldRecords(state)) {
        if (record.kind === "touch") ids.add(record.id);
      }
    }
    return ids.size;
  };
  const press = { id: "touch:1", x: 20, y, contact: "substrate", seed: 12_345, durationSeconds: 3.2 };
  const release = { ...press, id: "release:1", strength: RELEASE_IMPULSE_STRENGTH, durationSeconds: RELEASE_IMPULSE_SECONDS };
  const pressBubbles = raised(press);
  assert.ok(pressBubbles >= 3, "a press on the sand stopped raising a burst");
  assert.ok(
    raised(release) < pressBubbles,
    "the release raised as much silt as the press did",
  );
  // A press is a full-strength impulse and must raise exactly what it always
  // did, so nothing about the tap changed here.
  assert.equal(raised({ ...press, strength: 1 }), pressBubbles);
});

// A captured pointer goes on reporting after the finger leaves the canvas, so
// the movement allowance has to be measured on coordinates that are not clamped
// to the aquarium's own bounds either. Clamped, a finger dragged off the side of
// the glass parks at the boundary and a ten-cell drag reads as standing still.
test("a finger dragged off the edge of the glass is not a stationary hold", () => {
  const base = settled(5);
  const edge = base.cols - 1.2;
  const holding = applyContact(applyTouch(base, edge, 9.5), edge, 9.5, HOLD_THRESHOLD_SECONDS + 0.1);
  assert.ok(heldStimulus(holding), "a press near the edge did not become a presence");
  assert.equal(heldStimulus(holding).pointerX, edge);

  // Ten cells beyond the right-hand wall: outside the aquarium, but a real
  // pointer position the browser really does deliver.
  const offGlass = applyContact(holding, base.cols + 9, 9.5, HOLD_THRESHOLD_SECONDS + 0.6);
  assert.equal(heldStimulus(offGlass).gesture, GESTURES.drag, "a drag off the edge stayed a stationary hold");

  // The same journey inside the tank has always ended it; this is the control.
  const inside = applyContact(holding, edge - 5, 9.5, HOLD_THRESHOLD_SECONDS + 0.6);
  assert.equal(heldStimulus(inside).gesture, GESTURES.drag);
});

// Release clears `held` but keeps the hold clock. Anything reading `held` alone
// treats the aftermath of a long hold as a brand new tap - and for the school
// that was a ninefold jump in attraction at the moment of release: thirty fish
// that had ignored the finger for a minute surging at the spot it left.
test("letting go does not summon the school it had stopped interesting", () => {
  const base = settled(5);
  let held = applyTouch(base, 33, 9.5);
  for (let frame = 1; frame <= 200; frame += 1) {
    held = applyContact(held, 33, 9.5, frame * STEP);
    held = tick(held, STEP);
  }

  const pull = (state) => {
    const stimulus = state.stimuli.find((one) => one.held || one.released);
    return stimulus ? stimulusSalience(stimulus) * holdAttenuation(stimulus, 1.8, 0.12) : 0;
  };
  const whileHeld = pull(held);
  const afterRelease = pull(applyRelease(held));
  assert.ok(whileHeld < 0.25, `the school was still fully drawn to a 20 s hold (${whileHeld})`);
  assert.ok(
    afterRelease <= whileHeld * 1.05,
    `letting go raised the school's attraction from ${whileHeld} to ${afterRelease}`,
  );

  // And in the water: the school moves the same whether the finger left or not.
  const closing = (state) => {
    let total = 0;
    for (const fish of state.school) {
      const dx = 33 - fish.x;
      const dy = 9.5 - fish.y;
      const distance = Math.hypot(dx, dy);
      if (distance > 30 || distance < 0.001) continue;
      total += (dx * fish.vx + dy * fish.vy) / distance;
    }
    return total;
  };
  const released = tick(applyRelease(held), STEP);
  const stillHeld = tick(applyContact(held, 33, 9.5, 20.1), STEP);
  assert.ok(
    Math.abs(closing(released) - closing(stillHeld)) < 0.5,
    "the school surged when the finger left",
  );
});

// The guarantee that answers a press can hand the event to a fish beyond the
// perception radius - in a founder-only aquarium, the only fish there is. A
// re-read carries no guarantee, so that answer used to expire mid-crossing and
// leave the presence unanswered for as long as the viewer held it.
test("a fish crossing the tank to a presence is not dropped on the way", () => {
  let solo = createAquariumState({ seed: 5 });
  for (let frame = 0; frame < 300; frame += 1) solo = tick(solo, STEP);
  assert.equal(solo.individuals.length, 1, "expected the founder-only aquarium");

  const fish = solo.individuals[0];
  const x = fish.x > solo.cols / 2 ? 2 : solo.cols - 2;
  assert.ok(
    Math.hypot(x - fish.x, 9.5 - fish.y) > TOUCH_STIMULUS_RADIUS_CELLS,
    "the press was meant to be out of perception range",
  );

  let state = applyTouch(solo, x, 9.5);
  assert.equal(engaged(state), 1, "the press was not answered at all");
  for (let frame = 1; frame <= 120; frame += 1) {
    state = applyContact(state, x, 9.5, frame * STEP);
    state = tick(state, STEP);
  }
  assert.ok(heldStimulus(state), "the presence went away on its own");
  assert.equal(engaged(state), 1, "the only fish in the aquarium gave up on the finger");
});

// The movement allowance is about the whole press, not about where the finger
// happens to be when someone checks. Asked only at the threshold, a finger that
// darts three cells away a fifth of a second in and is back on its anchor by
// 0.4 s was promoted to a presence anyway.
test("a press that wandered before the threshold cannot become a presence", () => {
  const base = settled(5);

  let darted = applyTouch(base, 30, 9.5);
  darted = applyContact(darted, 33, 9.5, 0.2);
  darted = applyContact(darted, 30, 9.5, 0.4);
  darted = applyContact(darted, 30, 9.5, HOLD_THRESHOLD_SECONDS + 0.1);
  assert.equal(darted.stimuli[0].wandered, true, "an excursion before the threshold was forgotten");
  assert.notEqual(
    heldStimulus(darted).gesture,
    GESTURES.press,
    "a press that had already moved was promoted to a presence",
  );

  // Latched, so a finger that comes back and rests is a gesture that stopped
  // rather than a presence that started late.
  const rested = applyContact(darted, 30, 9.5, 2.5);
  assert.equal(heldStimulus(rested).gesture, GESTURES.drag);
  assert.equal(heldStimulus(rested).speed, 0, "a finger that has stopped is still described as moving");

  // The control: the same press, never moved.
  let still = applyTouch(base, 30, 9.5);
  still = applyContact(still, 30, 9.5, 0.2);
  still = applyContact(still, 30, 9.5, HOLD_THRESHOLD_SECONDS + 0.1);
  assert.ok(heldStimulus(still), "a press that never moved failed to become a presence");
});

// Following a companion to the glass is one of the things a hold is supposed to
// make possible. The set of fish "already going" was seeded from the guaranteed
// first responder, which a re-read does not have - so it was empty at every
// review and the bonus could never reach anybody.
test("a fish can follow a companion that is already at the presence", () => {
  const stimulus = createStimulus({
    id: "touch:1",
    sequence: 1,
    x: 33,
    y: 9.5,
    held: true,
    holdSeconds: 1,
  });
  const options = {
    commitmentFor: (fish) => activityCommitment(fish.activity?.current),
    guarantee: false,
  };
  const companionOf = (fish) => {
    let best = null;
    for (const entry of fish.history?.socialMemory ?? []) {
      if (!best || (entry.familiarity ?? 0) > (best.familiarity ?? 0)) best = entry;
    }
    return best?.seed ?? null;
  };

  for (const seed of [5, 147, 1234]) {
    const base = settled(seed);
    const alone = assignAttention(base, stimulus, options);

    // Put one fish at the glass and re-read. A fish that trusts it should be
    // able to answer more readily than it did with nobody there.
    let followed = false;
    for (const incumbent of base.individuals) {
      const withIncumbent = assignAttention({
        ...base,
        individuals: base.individuals.map((fish) => (fish.seed === incumbent.seed
          ? { ...fish, attention: { ...createAttention(fish, stimulus, RESPONSE_ROLES.investigate), ageSeconds: 0.5 } }
          : fish)),
      }, stimulus, options);
      base.individuals.forEach((fish, index) => {
        if (companionOf(fish) !== incumbent.seed) return;
        if ((alone[index]?.role ?? null) !== (withIncumbent[index]?.role ?? null)) followed = true;
      });
    }
    assert.ok(followed, `seed ${seed}: no fish answered differently for a companion already at the glass`);
  }
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
