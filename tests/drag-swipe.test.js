/*
 * A press that goes somewhere: drag, swipe and local water impulse.
 *
 * Phase 4's claim is that pointer motion means something, that the two things
 * it can mean are visibly different, and that neither of them turns a fish into
 * a cursor or the aquarium into a thing that grows while a child draws on it.
 * Every one of those is checkable, and the last two are why this file exists: a
 * gesture with a path in it is exactly the kind of feature that leaks, and a
 * finger that can drag a fish is exactly the kind of feature that stops the
 * aquarium being a room full of animals.
 *
 * Everything here drives the production verbs - `applyTouch`, `applyContact`,
 * `applyRelease`, `tick` - in the order `src/app.js` drives them, at the ten
 * frames a second the app ticks at. A gesture that only works when a test poses
 * it is not a gesture.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  PURSUITS,
  RESPONSE_ROLES,
  attentionInvestigates,
  attentionPursuit,
  isPassiveRole,
  stimulusFocus,
} from "../src/sim/attention.js";
import {
  GESTURES,
  PATH_SAMPLES,
  SWIPE_ENTER_SPEED,
  SWIPE_EXIT_SPEED,
  createPointerPath,
  extendPointerPath,
  pathMotion,
  pathPointBefore,
} from "../src/sim/pointer-path.js";
import {
  MAX_IMPULSES,
  MAX_STIMULI,
  MAX_WAKE_IMPULSES,
  createImpulse,
  heldStimulus,
  registerWake,
  releaseStimulus,
} from "../src/sim/interaction-events.js";
import { TOUCH_FLOOR_ROWS } from "../src/sim/config.js";
import { createBubbleWorldRecords } from "../src/sim/bubbles.js";
import { createPlantFrameContext, posePlant } from "../src/sim/plants.js";
import { calculateDamage } from "../src/render/damage.js";
import { render } from "../src/render/render.js";
import { applyContact, applyRelease, applyTouch } from "../src/sim/state.js";
import { tick } from "../src/sim/tick.js";
import {
  STOCKED_AQUARIUM_DAY,
  createObservationAquarium,
  drag,
  endContact,
  observeInteraction,
  pointerHistory,
  swipe,
} from "../src/dev/interaction-observation.js";

const STEP = 0.1;
const SEEDS = [5, 147, 1234];

const settledBySeed = new Map();
function settled(seed) {
  if (!settledBySeed.has(seed)) {
    settledBySeed.set(seed, createObservationAquarium({ seed, days: STOCKED_AQUARIUM_DAY, settleSeconds: 60 }));
  }
  return settledBySeed.get(seed);
}

function pointAlong(from, to, progress) {
  return { x: from.x + (to.x - from.x) * progress, y: from.y + (to.y - from.y) * progress };
}

/**
 * A finger drawn from one point to another over `seconds`, then lifted, driven
 * frame for frame the way the app drives it: the press, the contact confirmed
 * once per frame before the tick, the release, and then however long we want to
 * watch the aftermath for.
 */
function dragFrom(state, from, to, { seconds = 3, afterSeconds = 2, onFrame = null } = {}) {
  let current = applyTouch(state, from.x, from.y);
  const frames = Math.round((seconds + afterSeconds) / STEP);
  let released = false;
  for (let frame = 1; frame <= frames; frame += 1) {
    const elapsed = Number((frame * STEP).toFixed(4));
    if (elapsed <= seconds) {
      const point = pointAlong(from, to, Math.min(1, elapsed / seconds));
      current = applyContact(current, point.x, point.y, elapsed);
    } else if (!released) {
      current = applyRelease(current);
      released = true;
    }
    current = tick(current, STEP);
    if (onFrame) onFrame(current, elapsed);
  }
  return current;
}

/** The gesture the aquarium currently thinks it is receiving. */
function gestureOf(state) {
  return heldStimulus(state)?.gesture ?? null;
}

function wakes(state) {
  return (state.impulses ?? []).filter((impulse) => impulse.source === "wake");
}

function roleCounts(state) {
  const counts = {};
  for (const fish of state.individuals) {
    const role = fish.attention?.role;
    if (role) counts[role] = (counts[role] ?? 0) + 1;
  }
  return counts;
}

function midWater(state) {
  return { left: state.cols * 0.25, right: state.cols * 0.75, y: state.rows * 0.45 };
}

/* ------------------------------------------------------------------ *
 * The path
 * ------------------------------------------------------------------ */

// The plan asks for a representation sufficient to estimate position,
// direction, speed and curvature, that does not grow with gesture duration.
// Those are two separate claims and this is both of them.
test("a pointer path answers the four questions and does not grow", () => {
  let path = createPointerPath(10, 9, 0);
  for (let frame = 1; frame <= 600; frame += 1) {
    path = extendPointerPath(path, 10 + frame * 0.4, 9, frame * STEP);
    assert.ok(path.length <= PATH_SAMPLES, `the path grew to ${path.length} samples`);
  }
  // A minute of dragging, and the record of it is six points.
  assert.equal(path.length, PATH_SAMPLES);

  const motion = pathMotion(path);
  assert.ok(Math.abs(motion.speed - 4) < 0.5, `a 4 cell/s drag measured ${motion.speed}`);
  assert.equal(Math.round(motion.dirX), 1);
  assert.equal(Math.round(motion.dirY), 0);
  assert.ok(motion.curvature < 0.01, "a straight line was read as a curve");

  // Where the finger was, which is what a fish following a drag aims at.
  const behind = pathPointBefore(path, 0.3);
  const head = path[path.length - 1];
  assert.ok(behind.x < head.x && head.x - behind.x < 2, `the trail point was ${head.x - behind.x} cells back`);

  // A hooked path is read as one. Half a right angle is the turn, and the
  // reading is the turn rather than a per-joint sum, so noise cannot inflate it.
  let hooked = createPointerPath(10, 9, 0);
  for (let frame = 1; frame <= 3; frame += 1) hooked = extendPointerPath(hooked, 10 + frame * 2, 9, frame * 0.1);
  for (let frame = 4; frame <= 6; frame += 1) hooked = extendPointerPath(hooked, 16, 9 + (frame - 3), frame * 0.1);
  assert.ok(pathMotion(hooked).curvature > 0.8, "a hooked drag was read as straight");
});

// A path is spaced by time rather than by frame, so what it describes does not
// depend on how often the platform gets round to confirming the contact.
test("the path window is the same length however often the caller calls", () => {
  const span = (interval) => {
    let path = createPointerPath(0, 9, 0);
    for (let step = 1; step <= 40; step += 1) path = extendPointerPath(path, step * interval * 4, 9, step * interval);
    return path[path.length - 1].seconds - path[0].seconds;
  };
  // Ten frames a second and thirty: the same half second of history.
  assert.ok(Math.abs(span(0.1) - span(0.0333)) < 0.2, "the remembered window depended on the frame rate");
  // And a caller that only confirms twice a second keeps two samples rather
  // than describing a finger by where it was a second and a half ago.
  let sparse = createPointerPath(0, 9, 0);
  for (let step = 1; step <= 6; step += 1) sparse = extendPointerPath(sparse, step * 2, 9, step * 0.5);
  assert.equal(sparse.length, 2);
});

/* ------------------------------------------------------------------ *
 * The two gestures
 * ------------------------------------------------------------------ */

test("a press that moves becomes a drag, and a fast one becomes a swipe", () => {
  for (const seed of SEEDS) {
    const base = settled(seed);
    const { left, right, y } = midWater(base);

    const drags = [];
    dragFrom(base, { x: left, y }, { x: right, y: y - 2 }, {
      seconds: 3,
      afterSeconds: 0,
      onFrame: (state) => drags.push(gestureOf(state)),
    });
    assert.ok(drags.includes(GESTURES.drag), `seed ${seed}: a three-second drag was never a drag`);
    assert.ok(!drags.includes(GESTURES.swipe), `seed ${seed}: a three-second drag registered as a swipe`);

    const swipes = [];
    dragFrom(base, { x: left, y }, { x: right, y: y - 2 }, {
      seconds: 0.3,
      afterSeconds: 0,
      onFrame: (state) => swipes.push(gestureOf(state)),
    });
    assert.ok(swipes.includes(GESTURES.swipe), `seed ${seed}: the same path in 0.3 s was not a swipe`);
  }
});

// Bands rather than a threshold. A hand slowing through the boundary must not
// change the meaning of what it is doing four times on the way.
test("the gesture bands do not flip as a hand changes speed", () => {
  const base = settled(5);
  const between = (SWIPE_ENTER_SPEED + SWIPE_EXIT_SPEED) / 2;

  // Started fast, then slowed to between the two bands: still a swipe.
  let fast = applyTouch(base, 8, 9);
  let x = 8;
  for (let frame = 1; frame <= 3; frame += 1) {
    x += SWIPE_ENTER_SPEED * 1.4 * STEP;
    fast = applyContact(fast, x, 9, frame * STEP);
  }
  assert.equal(gestureOf(fast), GESTURES.swipe, "a fast finger was not read as a swipe");
  for (let frame = 4; frame <= 8; frame += 1) {
    x += between * STEP;
    fast = applyContact(fast, x, 9, frame * STEP);
  }
  assert.equal(gestureOf(fast), GESTURES.swipe, "a swipe slowing to mid-band stopped being one");

  // Started slow and sped up to the same mid-band speed: still a drag.
  let slow = applyTouch(base, 8, 9);
  x = 8;
  for (let frame = 1; frame <= 8; frame += 1) {
    x += (frame <= 3 ? 4 : between) * STEP;
    slow = applyContact(slow, x, 9, frame * STEP);
  }
  assert.equal(gestureOf(slow), GESTURES.drag, "a drag speeding up to mid-band became a swipe");
});

// A presence that starts moving has to be described by where the finger is
// going *now*, not by the anchor it sat on for the last five seconds. The path
// is therefore written for every contact, moving or not: without that, the first
// frames of a drag off a long hold measure the whole hold and read as a finger
// creeping at two cells a second.
test("a hold that starts moving is read from the motion, not from the anchor", () => {
  const base = settled(5);
  let state = applyTouch(base, 12, 9);
  for (let frame = 1; frame <= 50; frame += 1) {
    state = applyContact(state, 12, 9, frame * STEP);
    state = tick(state, STEP);
  }
  assert.equal(gestureOf(state), GESTURES.press, "the press never became a presence");

  // One frame of real movement, at swipe speed. The window still has half a
  // second of stillness in it, so the reading is a fraction of the true speed -
  // but it is a fraction of the last half second rather than of the last five
  // seconds, which is the difference between about nine cells a second and
  // about one.
  state = applyContact(state, 12 + SWIPE_ENTER_SPEED * 1.4 * STEP, 9, 51 * STEP);
  const contact = heldStimulus(state);
  assert.ok(
    contact.speed > 5,
    `five seconds of stillness dragged the reading down to ${contact.speed.toFixed(1)} cells/s`,
  );

  // And within a couple of frames of moving that fast it is a swipe.
  for (let frame = 52; frame <= 54; frame += 1) {
    state = tick(state, STEP);
    state = applyContact(state, 12 + SWIPE_ENTER_SPEED * 1.4 * STEP * (frame - 50), 9, frame * STEP);
  }
  assert.equal(gestureOf(state), GESTURES.swipe);
});

// The gate item: the two gestures have to be visibly different things, not one
// thing with a dial on it. They differ in what the water does and in what the
// cast does about it, and both are measured against the same aquarium.
test("a drag is answered by fish going to it, a swipe by fish leaning away", () => {
  let dragChasers = 0;
  let swipeWary = 0;
  let dragWary = 0;
  let swipeStrength = 0;
  let dragStrength = 0;
  for (const seed of SEEDS) {
    const base = settled(seed);
    const { left, right, y } = midWater(base);

    let chasing = new Set();
    let dragWariest = 0;
    let dragPeak = 0;
    dragFrom(base, { x: left, y }, { x: right, y }, {
      seconds: 3,
      afterSeconds: 0,
      onFrame: (state) => {
        for (const fish of state.individuals) {
          if (attentionInvestigates(fish.attention)) chasing.add(fish.seed);
        }
        dragWariest = Math.max(dragWariest, roleCounts(state)[RESPONSE_ROLES.wary] ?? 0);
        for (const wake of wakes(state)) dragPeak = Math.max(dragPeak, wake.strength);
      },
    });

    let swipeWariest = 0;
    let swipePeak = 0;
    dragFrom(base, { x: left, y }, { x: right, y }, {
      seconds: 0.3,
      afterSeconds: 0,
      onFrame: (state) => {
        swipeWariest = Math.max(swipeWariest, roleCounts(state)[RESPONSE_ROLES.wary] ?? 0);
        for (const wake of wakes(state)) swipePeak = Math.max(swipePeak, wake.strength);
      },
    });

    dragChasers += chasing.size;
    dragWary += dragWariest;
    swipeWary += swipeWariest;
    dragStrength += dragPeak;
    swipeStrength += swipePeak;
  }
  // Water: a swipe moves more of it, every time.
  assert.ok(swipeStrength > dragStrength * 1.4, `swipe ${swipeStrength} vs drag ${dragStrength}`);
  // Fish: a drag is followed, a swipe is leant away from.
  assert.ok(dragChasers >= SEEDS.length * 2, `only ${dragChasers} fish chased three drags`);
  assert.ok(swipeWary > dragWary, `swipe wary ${swipeWary} was not above drag wary ${dragWary}`);
});

/* ------------------------------------------------------------------ *
 * Autonomy
 * ------------------------------------------------------------------ */

// The plan's rule, stated as a measurement: the finger may not drive a fish.
// A fish crossing the path is inside a body length of the contact for a frame
// or two; a fish being driven never leaves it.
test("no finger drives a fish", () => {
  for (const seed of SEEDS) {
    const base = settled(seed);
    const { left, right, y } = midWater(base);
    let run = 0;
    let longest = 0;
    let ceiling = 0;
    const activities = new Set();
    dragFrom(base, { x: left, y }, { x: right, y }, {
      seconds: 3,
      afterSeconds: 1,
      onFrame: (state) => {
        const contact = heldStimulus(state);
        for (const fish of state.individuals) {
          ceiling = Math.max(ceiling, Math.hypot(fish.vx, fish.vy));
          activities.add(fish.activity?.current);
        }
        if (!contact || contact.gesture === GESTURES.press) return;
        const nearest = Math.min(...state.individuals
          .map((fish) => Math.hypot(contact.x - fish.x, contact.y - fish.y)));
        run = nearest <= 1.2 ? run + 1 : 0;
        longest = Math.max(longest, run);
      },
    });
    // Half a second of coincidence is a fish crossing the finger's path. A
    // driven fish would be there for the whole three seconds.
    assert.ok(longest * STEP < 1, `seed ${seed}: a fish rode the contact for ${(longest * STEP).toFixed(1)}s`);
    // And it is still swimming at its own speed. The aquarium's own ceiling is
    // a little over a cell a second; nothing a finger does may exceed it.
    assert.ok(ceiling < 1.6, `seed ${seed}: a fish reached ${ceiling.toFixed(2)} cells/s`);
    // The room is still a room: a drag does not synchronise the cast.
    assert.ok(activities.size >= 4, `seed ${seed}: only ${activities.size} activities survived a drag`);
  }
});

// Fish go after a moving disturbance in more than one way, and which way is a
// property of the fish. A finger that is turning is followed rather than headed
// off, because interception only works on a line.
test("fish chase a moving contact in more than one way", () => {
  const base = settled(5);
  const straight = { curvature: 0, speed: 12, dirX: 1, dirY: 0, held: true, gesture: GESTURES.drag };
  const curled = { ...straight, curvature: Math.PI / 2 };
  const pursuits = new Set(base.individuals.map((fish) => attentionPursuit(fish, straight)));
  assert.ok(pursuits.size >= 2, `the whole cast chased the same way: ${[...pursuits]}`);

  const intercepting = (stimulus) => base.individuals
    .filter((fish) => attentionPursuit(fish, stimulus) === PURSUITS.intercept).length;
  assert.ok(
    intercepting(curled) < intercepting(straight),
    `a curled drag was cut off as often as a straight one (${intercepting(curled)} vs ${intercepting(straight)})`,
  );

  // The three aim at three different places, and a contact that is not moving
  // collapses them all onto the one point - which is why a hold reads exactly as
  // it did before there was such a thing as a drag.
  const record = { x: 20, y: 9, stimulusId: "touch:1" };
  const moving = {
    ...straight,
    x: 30,
    y: 9,
    path: [{ x: 20, y: 9, seconds: 0 }, { x: 25, y: 9, seconds: 0.25 }, { x: 30, y: 9, seconds: 0.5 }],
  };
  const focus = (fish) => stimulusFocus(moving, record, fish);
  const places = new Set(base.individuals.map((fish) => Math.round(focus(fish).x)));
  assert.ok(places.size >= 2, "every fish aimed at the same place on a moving contact");
  const still = { ...moving, gesture: GESTURES.press };
  for (const fish of base.individuals) {
    assert.deepEqual(stimulusFocus(still, record, fish), { x: record.x, y: record.y });
  }
});

/* ------------------------------------------------------------------ *
 * The water
 * ------------------------------------------------------------------ */

// A press rings the water outward, so the stems either side of it lean apart.
// Water that is going somewhere takes them all the same way. This is the whole
// difference between a shock and a current, and it is one sign on one term.
test("water that is moving takes the stems with it", () => {
  const base = settled(5);
  const bend = (impulses) => {
    const state = { ...base, impulses: Object.freeze(impulses) };
    const frameContext = createPlantFrameContext(state);
    const still = createPlantFrameContext({ ...base, impulses: Object.freeze([]) });
    return base.plants.map((plant) => {
      const moved = posePlant(plant, state, { frameContext });
      const rest = posePlant(plant, { ...base, impulses: Object.freeze([]) }, { frameContext: still });
      return (moved.joints.at(-1)?.x ?? 0) - (rest.joints.at(-1)?.x ?? 0);
    });
  };
  const middle = base.cols / 2;
  const at = (extra) => createImpulse({ id: "test", x: middle, y: 14, ageSeconds: 0.8, ...extra });

  const shock = bend([at({})]);
  const downstream = bend([at({ dirX: 1, dirY: 0 })]);
  const upstream = bend([at({ dirX: -1, dirY: 0 })]);

  const moved = base.plants
    .map((plant, index) => ({ plant, index }))
    .filter(({ index }) => Math.abs(downstream[index]) > 0.001 || Math.abs(upstream[index]) > 0.001);
  assert.ok(moved.length >= 3, `only ${moved.length} stems were in reach of the wake`);

  for (const { plant, index } of moved) {
    assert.ok(downstream[index] > 0, `a stem at ${plant.x} leant upstream in rightward water`);
    assert.ok(upstream[index] < 0, `a stem at ${plant.x} leant downstream in leftward water`);
  }
  // The control: a press with no direction in it pushes stems apart, so the two
  // sides of it disagree in a way a current never does.
  const left = moved.filter(({ plant }) => plant.x < middle).map(({ index }) => shock[index]);
  const right = moved.filter(({ plant }) => plant.x > middle).map(({ index }) => shock[index]);
  if (left.length && right.length) {
    assert.ok(Math.max(...left) < 0 && Math.min(...right) > 0, "an undirected press did not push stems apart");
  }

  // A vertical sweep moves water up, not sideways: plants take the horizontal
  // share of the flow and there is none.
  const vertical = bend([at({ dirX: 0, dirY: -1 })]);
  for (const { index } of moved) assert.equal(vertical[index], 0);
});

test("a bubble is carried by water that is moving", () => {
  const base = settled(5);
  const still = createBubbleWorldRecords(base);
  const flowing = createBubbleWorldRecords({
    ...base,
    impulses: Object.freeze([createImpulse({
      id: "test",
      x: base.cols / 2,
      y: 10,
      ageSeconds: 0.8,
      radius: 20,
      dirX: 1,
      dirY: 0,
    })]),
  });
  const byId = new Map(still.map((record) => [record.id, record]));
  const carried = flowing.filter((record) => {
    const twin = byId.get(record.id);
    return twin && record.worldX - twin.worldX > 0.05;
  });
  assert.ok(carried.length >= 1, "no bubble was carried by a current wide enough to reach it");
  // And it is a deflection rather than a displacement: nothing is pushed
  // further than the water reaches.
  for (const record of carried) {
    assert.ok(record.worldX - byId.get(record.id).worldX < 2, "a bubble was thrown across the tank");
  }
});

/* ------------------------------------------------------------------ *
 * What it costs
 * ------------------------------------------------------------------ */

// The boundedness gate, and the reason this file exists. A gesture may last as
// long as a child cares to draw on the glass; the aquarium's state may not.
test("a gesture the length of a bedtime story creates nothing that accumulates", () => {
  const base = settled(5);
  let peakStimuli = 0;
  let peakImpulses = 0;
  let peakWakes = 0;
  let peakPath = 0;
  let peakRecords = 0;
  let peakObjects = 0;

  // A minute of dragging back and forth across the whole tank, which is longer
  // than anyone will ever do it for and thirty times longer than a scenario.
  let state = applyTouch(base, 6, 9);
  for (let frame = 1; frame <= 600; frame += 1) {
    const elapsed = Number((frame * STEP).toFixed(4));
    const sweep = (Math.sin(elapsed) + 1) / 2;
    state = applyContact(state, 6 + sweep * (base.cols - 12), 9 + Math.sin(elapsed * 0.7) * 3, elapsed);
    state = tick(state, STEP);
    peakStimuli = Math.max(peakStimuli, state.stimuli.length);
    peakImpulses = Math.max(peakImpulses, state.impulses.length);
    peakWakes = Math.max(peakWakes, wakes(state).length);
    peakPath = Math.max(peakPath, heldStimulus(state)?.path?.length ?? 0);
    peakRecords = Math.max(peakRecords, state.individuals.filter((fish) => fish.attention).length);
    peakObjects = Math.max(peakObjects, render(state).objects.length);
  }

  assert.equal(peakStimuli, 1, `one contact produced ${peakStimuli} stimuli`);
  assert.ok(peakImpulses <= MAX_IMPULSES, `${peakImpulses} impulses against a cap of ${MAX_IMPULSES}`);
  assert.ok(peakWakes <= MAX_WAKE_IMPULSES, `${peakWakes} wakes against a cap of ${MAX_WAKE_IMPULSES}`);
  assert.ok(peakPath <= PATH_SAMPLES, `a path of ${peakPath} against a cap of ${PATH_SAMPLES}`);
  assert.ok(peakRecords <= base.individuals.length, "more response records than fish");
  assert.ok(peakStimuli <= MAX_STIMULI);

  // And it all goes away. Three seconds after the finger, nothing is left.
  state = applyRelease(state);
  for (let frame = 0; frame < 30; frame += 1) state = tick(state, STEP);
  assert.deepEqual([...state.stimuli], []);
  assert.deepEqual([...state.impulses], []);
  assert.equal(state.individuals.filter((fish) => fish.attention).length, 0);
  assert.ok(render(state).objects.length <= peakObjects);

  // The save is a record of biology, not of what the aquarium has been through.
  for (const key of ["path", "gesture", "pointer"]) assert.equal(key in state, false);
});

// Repeated gestures are the other way a viewer can ask the aquarium to grow:
// not one long one, but many. The sixth swipe must cost what the first did.
test("repeated swipes cannot run away", () => {
  const base = settled(5);
  const { left, right, y } = midWater(base);
  const peaks = [];
  let state = base;
  for (let round = 0; round < 6; round += 1) {
    const from = round % 2 ? { x: right, y } : { x: left, y };
    const to = round % 2 ? { x: left, y } : { x: right, y };
    let impulses = 0;
    let objects = 0;
    let glyphs = 0;
    state = dragFrom(state, from, to, {
      seconds: 0.3,
      afterSeconds: 0.9,
      onFrame: (current) => {
        impulses = Math.max(impulses, current.impulses.length);
        const scene = render(current);
        objects = Math.max(objects, scene.objects.length);
        glyphs = Math.max(glyphs, scene.glyphs.length);
      },
    });
    peaks.push({ impulses, objects, glyphs });
  }
  const first = peaks[0];
  for (const [index, peak] of peaks.entries()) {
    assert.ok(peak.impulses <= MAX_IMPULSES, `swipe ${index + 1} held ${peak.impulses} impulses`);
    // Scene objects and glyphs drift a little with the aquarium's own life -
    // fish move, plants grow - but a runaway would be a multiple, not a few
    // percent.
    assert.ok(peak.objects < first.objects * 1.25, `swipe ${index + 1} drew ${peak.objects} objects`);
    assert.ok(peak.glyphs < first.glyphs * 1.25, `swipe ${index + 1} drew ${peak.glyphs} glyphs`);
  }
});

// A local interaction has to produce local damage. The renderer is incremental
// and a mature aquarium already repaints about half the screen per frame, so a
// gesture that forced full redraws would be a regression whatever it looked
// like on a desktop.
test("a gesture repaints locally", () => {
  for (const seed of SEEDS) {
    const base = settled(seed);
    const { left, right, y } = midWater(base);
    const cost = (run) => {
      let previous = render(base);
      let full = 0;
      let worst = 0;
      let total = 0;
      let frames = 0;
      run((state) => {
        const scene = render(state);
        const damage = calculateDamage(previous, scene);
        previous = scene;
        if (damage.full) full += 1;
        const percent = damage.area / damage.total * 100;
        worst = Math.max(worst, percent);
        total += percent;
        frames += 1;
      });
      return { full, worst, average: total / frames };
    };

    const untouched = cost((onFrame) => {
      let state = base;
      for (let frame = 0; frame < 50; frame += 1) {
        state = tick(state, STEP);
        onFrame(state);
      }
    });
    const dragged = cost((onFrame) => dragFrom(base, { x: left, y }, { x: right, y }, {
      seconds: 3,
      afterSeconds: 2,
      onFrame,
    }));
    const swiped = cost((onFrame) => dragFrom(base, { x: left, y }, { x: right, y }, {
      seconds: 0.3,
      afterSeconds: 4.7,
      onFrame,
    }));

    assert.equal(dragged.full, 0, `seed ${seed}: a drag forced a full redraw`);
    assert.equal(swiped.full, 0, `seed ${seed}: a swipe forced a full redraw`);
    // A gesture is allowed to cost something - it draws a wake and it moves
    // fish - but not a different order of thing from an aquarium nobody is
    // touching.
    assert.ok(
      dragged.average < untouched.average + 12,
      `seed ${seed}: a drag averaged ${dragged.average.toFixed(1)}% against ${untouched.average.toFixed(1)}%`,
    );
    assert.ok(
      swiped.average < untouched.average + 12,
      `seed ${seed}: a swipe averaged ${swiped.average.toFixed(1)}% against ${untouched.average.toFixed(1)}%`,
    );
  }
});

/* ------------------------------------------------------------------ *
 * Settling, and what a gesture may not do
 * ------------------------------------------------------------------ */

test("a swipe disturbs, displaces and settles", () => {
  const base = settled(5);
  const { left, right, y } = midWater(base);
  const displacement = [];
  const finished = dragFrom(base, { x: left, y }, { x: right, y }, {
    seconds: 0.3,
    afterSeconds: 6,
    onFrame: (state, seconds) => displacement.push({ seconds, wakes: wakes(state).length }),
  });
  const during = displacement.filter((entry) => entry.seconds <= 1.4);
  const after = displacement.filter((entry) => entry.seconds > 2.5);
  assert.ok(during.some((entry) => entry.wakes > 0), "the swipe moved no water at all");
  assert.ok(after.every((entry) => entry.wakes === 0), "the water was still moving three seconds later");

  // Nothing is worse for having been swiped at. Every fish is still here, still
  // inside the glass, and nothing about it was made permanent.
  assert.equal(finished.individuals.length, base.individuals.length);
  for (const fish of finished.individuals) {
    assert.ok(fish.x >= 0 && fish.x <= finished.cols, "a fish was pushed out of the aquarium");
    assert.ok(fish.y >= 0 && fish.y <= finished.rows, "a fish was pushed through the glass");
  }
  // One press, one remembered touch - a gesture is not a hundred taps, however
  // much water it moved.
  const before = base.individuals.reduce((total, fish) => total + (fish.history?.touches ?? 0), 0);
  const now = finished.individuals.reduce((total, fish) => total + (fish.history?.touches ?? 0), 0);
  assert.equal(now - before, 1, `a swipe counted as ${now - before} touches`);
});

// A drag that stops is a presence that started late: the fish that were chasing
// it catch up and hang at it, which is the Phase 3 behaviour reached through a
// Phase 4 gesture rather than a special case for it.
test("a drag that stops is answered like a presence", () => {
  const base = settled(5);
  const { left, y } = midWater(base);
  let state = applyTouch(base, left, y);
  const target = { x: left + 12, y };
  let arrived = false;
  for (let frame = 1; frame <= 220; frame += 1) {
    const elapsed = Number((frame * STEP).toFixed(4));
    const point = elapsed <= 2 ? pointAlong({ x: left, y }, target, elapsed / 2) : target;
    state = applyContact(state, point.x, point.y, elapsed);
    state = tick(state, STEP);
    if (elapsed > 3) {
      const contact = heldStimulus(state);
      const near = state.individuals.filter((fish) => attentionInvestigates(fish.attention)
        && Math.hypot(contact.x - fish.x, contact.y - fish.y) < 4).length;
      if (near > 0) arrived = true;
    }
  }
  assert.ok(arrived, "nobody ever caught up with a finger that had stopped moving");
  // Still a drag, because the allowance is latched - but a drag with no motion
  // in it, which is the same thing as a presence to everything downstream.
  const contact = heldStimulus(state);
  assert.equal(contact.gesture, GESTURES.drag);
  assert.equal(contact.speed, 0);
});

// Determinism is the invariant every other measurement here rests on.
test("the same gesture replayed on the same aquarium gives the same aquarium", () => {
  const base = settled(147);
  const { left, right, y } = midWater(base);
  const run = () => dragFrom(base, { x: left, y }, { x: right, y: y - 3 }, { seconds: 2, afterSeconds: 2 });
  const first = run();
  const second = run();
  assert.deepEqual(
    first.individuals.map((fish) => [fish.seed, fish.x, fish.y, fish.activity?.current]),
    second.individuals.map((fish) => [fish.seed, fish.x, fish.y, fish.activity?.current]),
  );
  assert.deepEqual([...first.school], [...second.school]);
});

// The press is untouched. Everything above is about a contact that moved; a
// contact that does not move must reach the aquarium exactly as it did before
// this phase existed.
test("a press that does not move is still a press", () => {
  const base = settled(5);
  let state = applyTouch(base, 30, 9);
  for (let frame = 1; frame <= 40; frame += 1) {
    state = applyContact(state, 30, 9, frame * STEP);
    state = tick(state, STEP);
    const contact = heldStimulus(state);
    if (!contact) continue;
    assert.equal(contact.gesture, GESTURES.press);
    assert.equal(contact.x, 30, "a stationary presence moved");
    assert.equal(wakes(state).length, 0, "a stationary finger moved water");
  }
  // And its responders are aiming where they always did.
  for (const fish of state.individuals) {
    if (!fish.attention || isPassiveRole(fish.attention.role)) continue;
    const contact = heldStimulus(state);
    assert.deepEqual(
      stimulusFocus(contact, fish.attention, fish),
      { x: fish.attention.x, y: fish.attention.y },
    );
  }
});

/* ------------------------------------------------------------------ *
 * Defects found in review
 * ------------------------------------------------------------------ */

// A flick across a seven-inch panel can be over inside a hundred milliseconds,
// which at ten frames a second is one tick. The contact is only confirmed once
// a frame, so such a gesture reached the aquarium as a press and a release with
// nothing in between and was received as an ordinary tap: no direction, no
// wake, no swipe. The final position is now confirmed before the release.
test("a gesture that begins and ends between two frames is still a gesture", () => {
  const base = settled(5);
  const { left, y } = midWater(base);
  const pressed = applyTouch(base, left, y);
  const contact = { x: left, y, startedAt: 0 };

  // Released 60 ms later, fifteen cells away: a swipe, and the aquarium has not
  // had a single frame in which to be told about it.
  const flicked = endContact(pressed, contact, { x: left + 15, y }, 0.06);
  const wake = (flicked.impulses ?? []).filter((impulse) => impulse.source === "wake");
  assert.equal(wake.length, 1, "a sub-frame swipe moved no water");
  assert.ok(wake[0].dirX > 0.9, "the wake had no direction in it");

  // The control: the same release with the finger where it started is a tap,
  // and taps must not grow a wake.
  const tapped = endContact(pressed, contact, { x: left, y }, 0.06);
  assert.equal((tapped.impulses ?? []).filter((impulse) => impulse.source === "wake").length, 0);

  // And the same thing through the replay, which delivers it the way the app
  // does: one press and one release inside a single frame.
  const observation = observeInteraction(base, {
    history: pointerHistory(swipe({ x: left, y }, { x: left + 15, y }, { at: 1, seconds: 0.06 })),
    observeSeconds: 4,
  });
  assert.ok(observation.gesture.wakesCreated >= 1, "the replayed flick moved no water either");
});

// Between re-read beats the response records used to keep the position the
// contact had at the last beat. Nothing reads them while the contact is live -
// the fish aim through the path - but the moment it is let go of they are the
// only thing left, so a swipe that was over in a third of a second sent every
// responder back to the first third of it.
test("a response to a moving contact remembers where the contact is now", () => {
  const base = settled(5);
  const { left, y } = midWater(base);
  let state = applyTouch(base, left, y);
  let checked = 0;
  for (let frame = 1; frame <= 20; frame += 1) {
    const elapsed = frame * STEP;
    state = applyContact(state, left + elapsed * 9, y, elapsed);
    state = tick(state, STEP);
    const contact = heldStimulus(state);
    if (!contact || contact.gesture === GESTURES.press) continue;
    for (const fish of state.individuals) {
      if (fish.attention?.stimulusId !== contact.id) continue;
      assert.equal(fish.attention.x, contact.x, "a responder was remembering a stale contact");
      assert.equal(fish.attention.y, contact.y);
      checked += 1;
    }
  }
  assert.ok(checked > 0, "no fish ever answered the drag");

  // And after the finger goes, that is where they look: the place it left, not
  // the place it was when the aquarium last re-read it.
  const endedAt = heldStimulus(state).x;
  state = applyRelease(state);
  for (const fish of state.individuals) {
    if (!fish.attention || isPassiveRole(fish.attention.role)) continue;
    assert.ok(
      Math.abs(fish.attention.x - endedAt) < 0.001,
      `a responder was left looking ${(endedAt - fish.attention.x).toFixed(1)} cells behind the release`,
    );
  }
});

// The ring a release leaves is water being disturbed, so what it disturbs is a
// question about where the finger left - not about what the press landed on
// twenty cells ago. Asking the stimulus's context instead raised a burst of
// bubbles out of the gravel under a drag's mid-water endpoint, and left the
// sand a drag ended on undisturbed.
test("the ring a release leaves is rung where the finger left", () => {
  const base = settled(5);
  const floor = base.rows - TOUCH_FLOOR_ROWS;
  const ring = (stimulus) => releaseStimulus(base, stimulus).impulses
    .find((impulse) => impulse.id.startsWith("release:"));

  const fromSand = { ...applyTouch(base, 20, floor).stimuli[0], x: 40, y: 8 };
  assert.equal(fromSand.context, "substrate", "the fixture did not start on the sand");
  assert.equal(ring(fromSand).contact, "water", "a drag into open water rang the gravel it had left");

  const toSand = { ...applyTouch(base, 40, 8).stimuli[0], x: 20, y: floor };
  assert.notEqual(toSand.context, "substrate");
  assert.equal(ring(toSand).contact, "substrate", "a drag onto the sand did not ring it");
});

// Speed is a distance on the glass, where a row counts double; direction is a
// unit vector in cells. Multiplied straight together, a finger drawn down the
// tank was predicted at twice the lead it would actually travel.
test("an interceptor aims at where the finger will be, in cells", () => {
  const base = settled(5);
  const contact = (dirX, dirY, speed) => ({
    held: true,
    gesture: GESTURES.drag,
    x: 30,
    y: 9,
    dirX,
    dirY,
    speed,
    curvature: 0,
    sequence: 1,
    path: [{ x: 30, y: 9, seconds: 0 }],
  });
  const record = { x: 30, y: 9, stimulusId: "touch:1" };
  const interceptor = base.individuals
    .find((fish) => attentionPursuit(fish, contact(1, 0, 12)) === PURSUITS.intercept);
  assert.ok(interceptor, "no fish in this cast cuts a corner");
  const lead = (dirX, dirY, speed) => {
    const focus = stimulusFocus(contact(dirX, dirY, speed), record, interceptor);
    return { x: focus.x - 30, y: focus.y - 9 };
  };

  // Five rows a second is ten column-widths a second on the glass. Over the
  // lead window the finger travels 2.25 rows, and that is where the fish aims.
  const down = lead(0, 1, 10);
  assert.ok(Math.abs(down.y - 2.25) < 0.01, `a vertical drag was led ${down.y.toFixed(2)} rows`);
  // The same speed sideways is the same distance on the glass and twice the
  // cells, which is what a viewer sees.
  const across = lead(1, 0, 10);
  assert.ok(Math.abs(across.x - 4.5) < 0.01, `a horizontal drag was led ${across.x.toFixed(2)} cells`);
  // The cap is a distance on the glass too, so a swipe straight down does not
  // send a fish a third of the way through the floor.
  const fast = lead(0, 1, 500);
  assert.ok(fast.y <= 4.51, `a fast vertical swipe was led ${fast.y.toFixed(2)} rows`);
});

// Wakes expire in the order they were rung and the ring is refilled in the
// order the slots come free, so which slot is empty has to be asked rather than
// counted. Counting them named a slot that was still ringing: the newest wake
// was cut short a fifth of the way through its life, the free slot was never
// used, and a continuous drag settled at two.
test("a wake takes an empty slot before it takes a live one", () => {
  const base = settled(5);
  const wake = (id, ageSeconds) => createImpulse({
    id,
    source: "wake",
    x: 10 + Number(id.split(":")[1]) * 10,
    y: 9,
    ageSeconds,
    dirX: 1,
    dirY: 0,
  });
  const ring = (impulses) => registerWake({ ...base, impulses: Object.freeze(impulses) }, {
    x: 50,
    y: 9,
    dirX: 1,
    dirY: 0,
    strength: 0.5,
  });

  // The first slot has expired; the two that are still ringing must survive.
  const refilled = ring([wake("wake:1", 0.5), wake("wake:2", 0.2)]);
  assert.deepEqual(
    refilled.filter((impulse) => impulse.source === "wake").map((impulse) => impulse.id).sort(),
    ["wake:0", "wake:1", "wake:2"],
  );
  assert.equal(refilled.find((impulse) => impulse.id === "wake:2").x, 30, "the newest wake was overwritten");

  // With the ring full it is the oldest that goes, which is the cap.
  const full = ring([wake("wake:0", 0.1), wake("wake:1", 0.8), wake("wake:2", 0.3)]);
  const live = full.filter((impulse) => impulse.source === "wake");
  assert.equal(live.length, MAX_WAKE_IMPULSES);
  assert.equal(live.find((impulse) => impulse.id === "wake:1").x, 50, "the oldest wake was not the one replaced");
});

// The whole point of the ring: a drag of any length keeps a full wake behind it
// rather than degrading to two.
test("a long drag keeps its wake full", () => {
  const base = settled(5);
  let state = applyTouch(base, 4, 9);
  let seen = 0;
  for (let frame = 1; frame <= 120; frame += 1) {
    const elapsed = frame * STEP;
    state = applyContact(state, 4 + ((Math.sin(elapsed * 0.6) + 1) / 2) * (base.cols - 8), 9, elapsed);
    state = tick(state, STEP);
    const live = wakes(state).length;
    assert.ok(live <= MAX_WAKE_IMPULSES, `${live} wakes against a cap of ${MAX_WAKE_IMPULSES}`);
    if (live === MAX_WAKE_IMPULSES) seen += 1;
  }
  assert.ok(seen > 0, "a twelve-second drag never had a full wake behind it");
});
