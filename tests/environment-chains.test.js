/*
 * Phase 5: interaction that reaches past the fish, and the chains that come
 * back out of it.
 *
 * The claim under test is not "the water looks disturbed". It is that a press
 * changes the aquarium - the sand, the surface, the air trapped under the
 * gravel, the shrimp that was sitting in it, the dust that was drifting past -
 * that every one of those changes settles on its own, and that a few of them
 * become something an inhabitant can decide to go and look at. The last part is
 * the one worth guarding: a consequence that no fish can ever reach is the dead
 * end section 11.2 of the plan names by hand, and a consequence that every fish
 * always answers is the global summons Phase 2 spent itself removing.
 *
 * Everything here drives the production verbs - `applyTouch`, `applyContact`,
 * `applyRelease`, `tick` - at the ten frames a second the app ticks at, and
 * reads the production selectors. A chain that only happens when a test poses
 * it is not a chain.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { createBubbleWorldRecords, isInvestigableBubble } from "../src/sim/bubbles.js";
import { substrateSurfaceY, waterSurfaceY } from "../src/sim/environment.js";
import { ACTIVITIES, activityUtilities, tickFishActivity } from "../src/sim/fish-activities.js";
import {
  MAX_ENVIRONMENT_STIMULI,
  MAX_STIMULI,
  SUBSTRATE_RELEASE_SECONDS,
  chainEnvironmentStimuli,
  createImpulse,
  dominantStimulus,
  environmentStimuli,
  heldStimulus,
  impulsePressureAt,
  isEnvironmentStimulus,
  perceivesStimulus,
} from "../src/sim/interaction-events.js";
import { livingWorldRecords } from "../src/sim/living-world.js";
import {
  advanceOffline,
  applyContact,
  applyRelease,
  applyTouch,
  restorePersistentState,
  serializePersistentState,
} from "../src/sim/state.js";
import { tick } from "../src/sim/tick.js";
import { render } from "../src/render/render.js";
import {
  STOCKED_AQUARIUM_DAY,
  createObservationAquarium,
} from "../src/dev/interaction-observation.js";

const STEP = 0.1;
const settledBySeed = new Map();

function settled(seed) {
  if (!settledBySeed.has(seed)) {
    settledBySeed.set(seed, createObservationAquarium({ seed, days: STOCKED_AQUARIUM_DAY, settleSeconds: 60 }));
  }
  return settledBySeed.get(seed);
}

/** The lowest point a viewer can actually reach, which is the sand. */
function sandY(state, x) {
  return Math.min(state.rows - 5, substrateSurfaceY(state, x) - 0.5);
}

function tapAndSettle(state, x, y, seconds) {
  let next = tick(applyRelease(applyTouch(state, x, y)), STEP);
  for (let frame = 1; frame < Math.round(seconds / STEP); frame += 1) next = tick(next, STEP);
  return next;
}

/* ------------------------------------------------------------------ *
 * What a press leaves behind
 * ------------------------------------------------------------------ */

test("a press on the sand leaves a cloud of it, and a press in open water does not", () => {
  const base = settled(5);
  const x = base.cols * 0.38;
  const pressed = tick(applyTouch(base, x, sandY(base, x)), STEP);
  const released = environmentStimuli(pressed, "substrate-release");
  assert.equal(released.length, 1);
  const [cloud] = released;
  // On the floor, not at the height the water happened to be disturbed at: a
  // drag along the bottom lifts the ground it passed over.
  assert.ok(Math.abs(cloud.y - substrateSurfaceY(base, x)) < 0.01);
  assert.ok(cloud.seed !== 0, "the burst has no deterministic variation to draw from");
  assert.equal(cloud.context, "substrate");
  assert.ok(isEnvironmentStimulus(cloud));

  const midWater = tick(applyTouch(base, x, base.rows * 0.4), STEP);
  assert.equal(environmentStimuli(midWater, "substrate-release").length, 0);
  assert.equal(createBubbleWorldRecords(midWater).filter((record) => record.kind === "touch").length, 0);
});

test("a press near the waterline breaks the surface, locally", () => {
  const base = settled(5);
  const x = base.cols * 0.55;
  const pressed = tick(applyTouch(base, x, 2), STEP);
  const broken = environmentStimuli(pressed, "surface-break");
  assert.equal(broken.length, 1);
  assert.ok(Math.abs(broken[0].y - waterSurfaceY(base, x)) < 0.2);

  const scene = render(pressed);
  const marks = scene.objects.filter((object) => object.id.startsWith("surface-break:"));
  assert.equal(marks.length, 1);
  // The whole point of 11.4: a localized scene change, not a global surface
  // state that repaints the waterline from end to end.
  assert.ok(marks[0].bounds.width < scene.width * 0.35,
    `a surface break repainted ${marks[0].bounds.width} of ${scene.width} pixels`);
  assert.ok(marks[0].bounds.height < 80);
  assert.deepEqual(
    JSON.parse(JSON.stringify(render(base).background)),
    JSON.parse(JSON.stringify(scene.background)),
    "breaking the surface changed the background signature",
  );

  const deep = tick(applyTouch(base, x, base.rows * 0.5), STEP);
  assert.equal(environmentStimuli(deep, "surface-break").length, 0);
});

test("the environment settles on its own, and takes nothing with it", () => {
  const base = settled(5);
  const x = base.cols * 0.38;
  let state = tapAndSettle(base, x, sandY(base, x), SUBSTRATE_RELEASE_SECONDS + 3);
  assert.equal(environmentStimuli(state).length, 0, "a consequence outlived its own duration");
  assert.equal(state.impulses.length, 0);
  assert.equal(createBubbleWorldRecords(state).filter((record) => record.kind === "touch").length, 0);
  // And the aquarium is no different for having been touched: the residents are
  // exactly where the same aquarium's own clock would have put them.
  const untouched = { ...base, elapsedRealSeconds: state.elapsedRealSeconds };
  assert.deepEqual(livingWorldRecords(state), livingWorldRecords(untouched));
});

/* ------------------------------------------------------------------ *
 * What a chain may not do
 * ------------------------------------------------------------------ */

test("a chain is exactly one generation deep", () => {
  const base = settled(5);
  const x = base.cols * 0.38;
  const pressed = tick(applyTouch(base, x, sandY(base, x)), STEP);
  const consequences = environmentStimuli(pressed);
  assert.ok(consequences.length >= 1);
  // The only thing that creates an environmental stimulus is an impulse, and
  // nothing an environmental stimulus does creates an impulse. Running the
  // chain against the consequences alone therefore has to be a no-op, which is
  // the structural reason a storm is impossible rather than merely unlikely.
  assert.deepEqual(
    [...chainEnvironmentStimuli(pressed, { stimuli: consequences, impulses: [] })],
    [...consequences],
  );
  // Idempotent against its own source too: the same impulses do not raise the
  // same cloud twice, however many frames they live for.
  assert.deepEqual(
    [...chainEnvironmentStimuli(pressed, { stimuli: pressed.stimuli, impulses: pressed.impulses })],
    [...pressed.stimuli],
  );
});

test("the aquarium's own events never cost the viewer a press", () => {
  const base = settled(5);
  // A minute of dragging along the sand and back, which is the gesture most
  // able to raise consequences: every wake it leaves is on the substrate.
  let state = applyTouch(base, 8, sandY(base, 8));
  let peakStimuli = 0;
  let peakEnvironment = 0;
  let contactLost = 0;
  for (let frame = 1; frame <= 600; frame += 1) {
    const elapsed = Number((frame * STEP).toFixed(4));
    const sweep = (Math.sin(elapsed) + 1) / 2;
    const x = 8 + sweep * (base.cols - 16);
    state = applyContact(state, x, sandY(base, x), elapsed);
    state = tick(state, STEP);
    peakStimuli = Math.max(peakStimuli, state.stimuli.length);
    peakEnvironment = Math.max(peakEnvironment, environmentStimuli(state).length);
    if (!heldStimulus(state)) contactLost += 1;
  }
  assert.ok(peakStimuli <= MAX_STIMULI, `${peakStimuli} live stimuli against a cap of ${MAX_STIMULI}`);
  assert.ok(peakEnvironment <= MAX_ENVIRONMENT_STIMULI,
    `${peakEnvironment} consequences against a cap of ${MAX_ENVIRONMENT_STIMULI}`);
  assert.equal(contactLost, 0, "a consequence evicted the finger that caused it");
  assert.ok(peakEnvironment >= 1, "a minute of dragging the sand raised nothing at all");

  // And it all goes away.
  state = applyRelease(state);
  for (let frame = 0; frame < Math.round((SUBSTRATE_RELEASE_SECONDS + 3) / STEP); frame += 1) {
    state = tick(state, STEP);
  }
  assert.deepEqual([...state.stimuli], []);
  assert.deepEqual([...state.impulses], []);
});

test("the aquarium is not summoned by its own doing", () => {
  const base = settled(5);
  const x = base.cols * 0.38;
  const pressed = tick(applyTouch(base, x, sandY(base, x)), STEP);
  assert.ok(environmentStimuli(pressed).length >= 1);
  // The school drifts at what the aquarium is attending to. A cloud of silt is
  // something a fish may choose to go and look at; it is not a summons, and the
  // school must never read one as the press it never was.
  const spent = { ...pressed, stimuli: Object.freeze(environmentStimuli(pressed)) };
  assert.equal(dominantStimulus(spent), null);
});

test("nothing a chain creates is ever written to disk or survives being switched off", () => {
  const base = settled(5);
  const x = base.cols * 0.38;
  const pressed = tick(applyTouch(base, x, sandY(base, x)), STEP);
  assert.ok(environmentStimuli(pressed).length >= 1);

  const saved = JSON.stringify(serializePersistentState(pressed));
  assert.ok(!saved.includes("substrate-release"));
  assert.ok(!saved.includes("surface-break"));
  assert.deepEqual([...restorePersistentState(base, JSON.parse(saved)).stimuli], []);
  assert.deepEqual([...advanceOffline(pressed, 3600).stimuli], []);
});

/* ------------------------------------------------------------------ *
 * The chains themselves
 * ------------------------------------------------------------------ */

// The dead end, measured on the production path: before this the burst existed
// only while the impulse did, so the fish that could have investigated it were
// all still recovering from answering the press that made it.
test("the burst a press knocks out of the gravel is genuinely investigable", () => {
  const base = settled(5);
  const x = base.cols * 0.38;
  let state = applyTouch(base, x, sandY(base, x));
  const investigators = new Set();
  let liveBurstFrames = 0;
  for (let frame = 0; frame < 250; frame += 1) {
    state = tick(state, STEP);
    if (createBubbleWorldRecords(state).some((record) => record.kind === "touch"
      && isInvestigableBubble(record))) liveBurstFrames += 1;
    for (const fish of state.individuals) {
      if (fish.activity?.current === ACTIVITIES.bubbleInvestigate
        && String(fish.activity.targetId).includes("substrate-release")) investigators.add(fish.seed);
    }
  }
  assert.ok(liveBurstFrames > 100,
    `the burst was investigable for ${liveBurstFrames} frames of the 250 watched`);
  assert.ok(investigators.size >= 1, "no fish ever reached the burst the press released");
  // And it is not a summons. The plan's "do not force a fish to investigate
  // every touch bubble" is the other half of the same requirement.
  assert.ok(investigators.size <= 3,
    `${investigators.size} of ${base.individuals.length} fish were sent to one burst`);
});

test("a grazing fish leans its patch onto a fresh cloud of silt", () => {
  const base = settled(5);
  const grazing = base.individuals.map((fish, index) => ({ fish, index }))
    .filter(({ fish }) => fish.behavior?.current === "forage"
      || fish.activity?.current === ACTIVITIES.substrateSearch);
  // The chain is about a fish that is already working the bottom, so the test
  // poses one rather than waiting for hunger: the pull it measures is read on
  // the production target resolver either way.
  const { fish, index } = grazing[0] ?? { fish: base.individuals[0], index: 0 };
  const worker = {
    ...fish,
    behavior: { ...fish.behavior, current: "forage" },
    activity: { ...fish.activity, current: ACTIVITIES.substrateSearch, ageRealSeconds: 4 },
  };
  const posed = { ...base, individuals: base.individuals.map((one, at) => (at === index ? worker : one)) };
  const cloudX = Math.min(posed.cols - 6, Math.max(6, worker.x + 6));
  const disturbed = tick(applyTouch(posed, cloudX, sandY(posed, cloudX)), STEP);
  const quiet = tick(posed, STEP);

  // The graze line the production resolver actually steers at, with and
  // without the cloud, from the same pose and the same frame.
  const routeX = (state) => tickFishActivity(state.individuals[index], index, state, STEP, {
    bubbles: createBubbleWorldRecords(state),
    school: state.school,
  }).target.x;
  const drawn = Math.abs(routeX(disturbed) - cloudX);
  const ignored = Math.abs(routeX(quiet) - cloudX);
  assert.ok(drawn < ignored - 0.2,
    `the cloud did not draw the grazer: ${drawn.toFixed(2)} with against ${ignored.toFixed(2)} without`);

  // A lean, not a summons: the route still sweeps, so the fish does not park
  // on the cloud and it drifts back off as the cloud settles.
  let settling = disturbed;
  for (let frame = 0; frame < Math.round((SUBSTRATE_RELEASE_SECONDS + 1) / STEP); frame += 1) {
    settling = tick(settling, STEP);
  }
  assert.equal(environmentStimuli(settling, "substrate-release").length, 0);
});

test("a patch of broken surface opens a trip that otherwise comes round once a minute and a half", () => {
  const base = settled(5);
  // Only the fish that can see it. A break is a patch of water, not an
  // announcement: it carries its own radius like every other stimulus, and a
  // fish at the bottom of the tank is simply somewhere else.
  // The explore branch deliberately lets a fish finish a vegetation visit or a
  // drifting inspection before it is offered anything else, so those are not
  // fish the break failed to reach.
  const committed = new Set([
    ACTIVITIES.driftingInspect,
    ACTIVITIES.plantWeave,
    ACTIVITIES.plantInvestigate,
  ]);
  const candidates = base.individuals.map((fish, index) => ({ fish, index }))
    .filter(({ index }) => index >= 3);
  let opened = 0;
  let closed = 0;
  let inReach = 0;
  let outOfReach = 0;
  for (const { fish, index } of candidates) {
    const explorer = { ...fish, behavior: { ...fish.behavior, current: "explore" } };
    const posed = { ...base, individuals: base.individuals.map((one, at) => (at === index ? explorer : one)) };
    const quiet = activityUtilities(explorer, index, tick(posed, STEP));
    const broken = tick(applyTouch(posed, explorer.x, 2), STEP);
    const answering = broken.individuals[index];
    if (committed.has(answering.activity?.current)) continue;
    const [patch] = environmentStimuli(broken, "surface-break");
    const perceived = patch && perceivesStimulus(answering, patch);
    const disturbed = activityUtilities(answering, index, broken);
    if (quiet[ACTIVITIES.surfaceInvestigate] === undefined) closed += 1;
    if (!perceived) {
      outOfReach += 1;
      assert.equal(disturbed[ACTIVITIES.surfaceInvestigate], quiet[ACTIVITIES.surfaceInvestigate],
        "a fish out of reach of the break was offered the trip anyway");
      continue;
    }
    inReach += 1;
    if (disturbed[ACTIVITIES.surfaceInvestigate] !== undefined) opened += 1;
  }
  assert.ok(closed >= 1, "every fish was already due a surface trip, so nothing was opened");
  assert.ok(inReach >= 1, "no fish was near enough to the break to be offered anything");
  assert.equal(opened, inReach, `${opened} of ${inReach} fish under the break could see it`);

  // And it is a patch of water, not an announcement. A fish at the far end of
  // the tank, on the bottom, is offered exactly what it was offered before.
  const [far, farIndex] = [base.individuals[base.individuals.length - 1], base.individuals.length - 1];
  const distant = {
    ...far,
    behavior: { ...far.behavior, current: "explore" },
    x: 2,
    y: base.rows - 4,
  };
  const posed = { ...base, individuals: base.individuals.map((one, at) => (at === farIndex ? distant : one)) };
  const quiet = activityUtilities(distant, farIndex, tick(posed, STEP));
  const broken = tick(applyTouch(posed, base.cols - 3, 2), STEP);
  const [patch] = environmentStimuli(broken, "surface-break");
  assert.ok(patch);
  assert.equal(perceivesStimulus(broken.individuals[farIndex], patch), false,
    "a break at the far end of the tank reached the bottom corner");
  assert.equal(
    activityUtilities(broken.individuals[farIndex], farIndex, broken)[ACTIVITIES.surfaceInvestigate],
    quiet[ACTIVITIES.surfaceInvestigate],
    "a fish out of reach of the break was offered the trip anyway",
  );
});

/* ------------------------------------------------------------------ *
 * What the water does to everything floating in it
 * ------------------------------------------------------------------ */

test("bubbles are carried, lifted and broken up by moving water, and recover from it", () => {
  const base = settled(5);
  const rest = createBubbleWorldRecords(base);
  const target = rest.find((record) => record.phase === "rise" && record.worldY > 6);
  assert.ok(target, "the aquarium had no rising bubble to push");

  const wake = createImpulse({
    id: "wake:0",
    source: "wake",
    x: target.worldX - 1.2,
    y: target.worldY,
    strength: 0.9,
    ageSeconds: 0.45,
    durationSeconds: 0.95,
    dirX: 1,
    dirY: -0.35,
  });
  const pushed = { ...base, impulses: Object.freeze([wake]) };
  const moved = createBubbleWorldRecords(pushed).find((record) => record.id === target.id);
  assert.ok(moved);
  assert.ok(moved.worldX - target.worldX > 0.2, "moving water did not carry the bubble along");
  assert.ok(moved.worldY < target.worldY, "upward water did not hurry the bubble's rise");
  assert.ok(impulsePressureAt(pushed, target.worldX, target.worldY) > 0);
  assert.ok((moved.disturbance ?? 0) > 0, "a shove left the bubble perfectly intact");

  // A shove is not a displacement. When the water settles the column is the
  // column it was, which is what keeps this bounded and reconstructable.
  const settledAgain = createBubbleWorldRecords({ ...base, impulses: Object.freeze([]) })
    .find((record) => record.id === target.id);
  assert.deepEqual(settledAgain, target);
});

test("a shrimp bolts from a strong disturbance, a snail only pulls in, and both come back", () => {
  const base = settled(5);
  const rest = livingWorldRecords(base);
  const shrimp = rest.find((record) => record.kind === "shrimp");
  const snail = rest.find((record) => record.kind === "snail");
  assert.ok(shrimp && snail);

  const startle = (record) => createImpulse({
    id: "touch:1",
    x: record.x - 0.6,
    y: record.y,
    strength: 1,
    ageSeconds: 1.6,
    durationSeconds: 3.2,
    contact: "substrate",
  });
  const bolted = livingWorldRecords({ ...base, impulses: Object.freeze([startle(shrimp)]) })
    .find((record) => record.id === shrimp.id);
  assert.ok(bolted.x - shrimp.x > 0.8, "the shrimp sat through a press beside it");
  assert.ok(bolted.y < shrimp.y, "the escape had no hop in it");
  assert.ok(bolted.alarm > 0);

  const retracted = livingWorldRecords({ ...base, impulses: Object.freeze([startle(snail)]) })
    .find((record) => record.id === snail.id);
  assert.equal(retracted.x, snail.x, "a snail does not bolt");
  assert.ok(retracted.y > snail.y, "the snail did not sit down into its shell");
  assert.ok(Math.abs(retracted.pulse) < Math.abs(snail.pulse) + 1e-9);

  // Nothing is remembered: the disturbance ends and the animal is where the
  // aquarium's own clock says it should be.
  const after = livingWorldRecords({ ...base, impulses: Object.freeze([]) });
  assert.deepEqual(after, rest);
});

test("drifting matter is what makes an invisible current visible", () => {
  const base = settled(5);
  const tuft = livingWorldRecords(base).find((record) => record.kind === "tuft");
  assert.ok(tuft);
  const wake = createImpulse({
    id: "wake:0",
    source: "wake",
    x: tuft.x - 1,
    y: tuft.y,
    strength: 0.9,
    ageSeconds: 0.45,
    durationSeconds: 0.95,
    dirX: 1,
  });
  const carried = livingWorldRecords({ ...base, impulses: Object.freeze([wake]) })
    .find((record) => record.id === tuft.id);
  assert.ok(carried.x - tuft.x > 0.3, "a tuft sat still in water that was moving");

  const scene = render({ ...base, impulses: Object.freeze([wake]) });
  const still = render(base);
  const dustMoved = scene.objects.filter((object) => object.id.startsWith("dust:"))
    .filter((object, index) => {
      const before = still.objects.filter((entry) => entry.id.startsWith("dust:"))[index];
      return before && before.signature !== object.signature;
    });
  assert.ok(dustMoved.length >= 1, "no speck of dust noticed the current");
});

/* ------------------------------------------------------------------ *
 * What it costs
 * ------------------------------------------------------------------ */

test("the consequences of a press are local and do not force a redraw", () => {
  const base = settled(5);
  const x = base.cols * 0.38;
  const pressed = tick(applyTouch(base, x, sandY(base, x)), STEP);
  const scene = render(pressed);

  const silt = scene.objects.filter((object) => object.id.startsWith("substrate-release:"));
  assert.equal(silt.length, 1);
  assert.ok(silt[0].bounds.width < scene.width * 0.2,
    `a cloud of silt repainted ${silt[0].bounds.width} of ${scene.width} pixels`);
  assert.ok(silt[0].glyphCount <= 9);

  // The background - the bands, the floor, the edge falloff - is what a full
  // redraw would be. None of the chain touches it.
  assert.deepEqual(
    JSON.parse(JSON.stringify(render(base).background)),
    JSON.parse(JSON.stringify(scene.background)),
  );
});
