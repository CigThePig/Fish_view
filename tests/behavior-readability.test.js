import assert from "node:assert/strict";
import test from "node:test";

import { createBubbleWorldRecords } from "../src/sim/bubbles.js";
import {
  ACTIVITIES,
  createActivityState,
  resolveActivityTarget,
} from "../src/sim/fish-activities.js";
import { choreographyFor } from "../src/sim/fish-choreography.js";
import { fishShoals } from "../src/sim/fish-roster.js";
import { tick } from "../src/sim/tick.js";
import { stockedAquarium } from "./support/aquarium.js";

function withActivity(fish, behavior, activity, target = {}) {
  return {
    ...fish,
    behavior: {
      current: behavior,
      previous: behavior,
      blend: 1,
      ageSeconds: 20,
      ageRealSeconds: 20,
    },
    activity: {
      ...createActivityState(activity),
      ...target,
    },
  };
}

function findDurableBubble(initial) {
  let state = initial;
  for (let frame = 0; frame < 600; frame += 1) {
    const bubbles = createBubbleWorldRecords(state);
    const bubble = bubbles.find((candidate) => candidate.phase === "rise"
      && ["stream", "isolated", "touch"].includes(candidate.kind)
      && candidate.progress < 0.58);
    if (bubble) return { state, bubble };
    state = tick(state, 0.1);
  }
  return null;
}

test("behavior vocabulary has visibly distinct steering signatures", () => {
  const state = stockedAquarium({ seed: 0x7ead, wallClockHours: 12 });
  const cruise = choreographyFor(state, ACTIVITIES.cruise);
  const wander = choreographyFor(state, ACTIVITIES.wander);
  const weave = choreographyFor(state, ACTIVITIES.plantWeave);
  const bubble = choreographyFor(state, ACTIVITIES.bubbleInvestigate);
  const school = choreographyFor(state, ACTIVITIES.schoolFollow);
  const follow = choreographyFor(state, ACTIVITIES.individualFollow);
  const companion = choreographyFor(state, ACTIVITIES.companionCruise);
  const chase = choreographyFor(state, ACTIVITIES.playfulChase);
  const rest = choreographyFor(state, ACTIVITIES.openWaterRest);

  assert.ok(wander.maximumSpeed > cruise.maximumSpeed);
  assert.ok(weave.turningResponse > wander.turningResponse * 1.4);
  assert.ok(bubble.accelerationResponse > cruise.accelerationResponse * 1.7);
  assert.ok(school.velocityMatch > cruise.velocityMatch + 0.35);
  assert.ok(follow.maximumSpeed < school.maximumSpeed);
  assert.ok(chase.maximumSpeed > follow.maximumSpeed * 1.45);
  assert.ok(companion.velocityMatch > follow.velocityMatch);
  assert.ok(companion.pitchScale < chase.pitchScale);
  assert.ok(rest.maximumSpeed < cruise.maximumSpeed * 0.35);
  assert.ok(rest.turningResponse < cruise.turningResponse * 0.5);
});

test("school, deliberate follow, companion formation, and chase expose different social geometry", () => {
  const base = stockedAquarium({ seed: 7331, wallClockHours: 12 });
  // Deliberately an ordinary territorial fish rather than a shoaling one: a
  // shoaling species holds a sociability floor that lifts its following speed,
  // which is the point of that species and not what this test is measuring.
  const sourceIndex = base.individuals.findIndex((fish, index) => index >= 3 && !fishShoals(fish.seed));
  const companionIndex = base.individuals.findIndex((fish, index) => index !== sourceIndex && index >= 3);
  assert.ok(sourceIndex >= 0 && companionIndex >= 0);
  const source = base.individuals[sourceIndex];
  const companion = { ...base.individuals[companionIndex], x: 35, y: 9, vx: 0.48, vy: 0.06 };
  const state = {
    ...base,
    individuals: base.individuals.map((fish, index) => index === companionIndex ? companion : fish),
  };
  const targetFor = (activity, ageRealSeconds = 1.2) => {
    const fish = withActivity(source, "social", activity, {
      targetType: activity === ACTIVITIES.schoolFollow ? "school" : "fish",
      targetId: activity === ACTIVITIES.schoolFollow ? null : companion.seed,
      ageRealSeconds,
    });
    return resolveActivityTarget(fish, sourceIndex, state, fish.activity);
  };
  const school = targetFor(ACTIVITIES.schoolFollow);
  const follow = targetFor(ACTIVITIES.individualFollow);
  const beside = targetFor(ACTIVITIES.companionCruise);
  // The opening escape deliberately maps the chaser to a quiet break/glide so
  // the evader gets the first beat. Compare social geometry during the actual
  // pursuit instead of treating that authored hesitation as a speed regression.
  const chase = targetFor(ACTIVITIES.playfulChase, 4);
  const directionLength = Math.hypot(companion.vx, companion.vy);
  const direction = { x: companion.vx / directionLength, y: companion.vy / directionLength };
  const followOffset = { x: follow.x - companion.x, y: follow.y - companion.y };
  const besideOffset = { x: beside.x - companion.x, y: beside.y - companion.y };
  const followRear = followOffset.x * direction.x + followOffset.y * direction.y;
  const besideRear = besideOffset.x * direction.x + besideOffset.y * direction.y;
  const besideSide = Math.abs(-besideOffset.x * direction.y + besideOffset.y * direction.x);

  assert.ok(Number.isInteger(school.schoolMemberIndex));
  assert.ok(school.velocityX !== 0 || school.velocityY !== 0);
  assert.ok(followRear < -2, "individual follow lost its clear trailing offset");
  assert.ok(Math.abs(besideRear) < Math.abs(followRear) * 0.45);
  assert.ok(besideSide > 3, "companion cruise bodies overlap instead of occupying visible side-by-side slots");
  assert.ok(beside.choreography.velocityMatch > follow.choreography.velocityMatch);
  assert.ok(chase.speed > follow.speed * 1.35);
  assert.ok(chase.choreography.turningResponse > school.choreography.turningResponse * 2);
});

test("bubble pursuit predicts a real rising bubble and produces a readable ascent", () => {
  const found = findDurableBubble(stockedAquarium({
    seed: 321,
    wallClockHours: 12,
  }));
  assert.ok(found);
  const { bubble } = found;
  const index = 4;
  const source = found.state.individuals[index];
  const fish = {
    ...withActivity(source, "explore", ACTIVITIES.bubbleInvestigate, {
      targetType: "bubble",
      targetId: bubble.id,
    }),
    x: bubble.worldX + 4,
    y: Math.min(found.state.rows - 4, bubble.worldY + 3.2),
    vx: -0.18,
    vy: 0,
  };
  let state = {
    ...found.state,
    individuals: found.state.individuals.map((candidate, candidateIndex) => (
      candidateIndex === index ? fish : candidate
    )),
  };

  let fastest = 0;
  let strongestAscent = 0;
  let strongestPitch = 0;
  for (let frame = 0; frame < 20; frame += 1) {
    state = tick(state, 0.1);
    const sample = state.individuals[index];
    fastest = Math.max(fastest, Math.hypot(sample.vx, sample.vy));
    strongestAscent = Math.min(strongestAscent, sample.vy);
    strongestPitch = Math.min(strongestPitch, sample.visual.pitch);
  }
  const pursuing = state.individuals[index];
  assert.equal(pursuing.activity.current, ACTIVITIES.bubbleInvestigate);
  assert.equal(pursuing.activity.targetId, bubble.id);
  assert.ok(fastest > 0.58);
  assert.ok(strongestAscent < -0.45);
  assert.ok(strongestPitch < -18);
});

test("playful chase gives the evader the first beat, then accelerates beyond following", () => {
  const base = stockedAquarium({ seed: 2020, wallClockHours: 12 });
  const chaserSource = base.individuals[0];
  const chasedSource = base.individuals[1];
  const chaser = {
    ...withActivity(chaserSource, "social", ACTIVITIES.playfulChase, {
      ageRealSeconds: 1,
      targetType: "fish",
      targetId: chasedSource.seed,
    }),
    x: 20,
    y: 8,
    vx: 0.2,
    vy: 0,
  };
  // Close enough to bolt. Recognition is not the same as panic: once the pair
  // is genuinely close the evader gets the first acceleration beat and the
  // chaser briefly glides instead of matching it instantly. Pursuit then comes
  // back faster and sharper than ordinary following.
  const chased = { ...chasedSource, x: 21.6, y: 8, vx: 0.2, vy: 0 };
  const state = {
    ...base,
    individuals: base.individuals.map((fish, index) => index === 0 ? chaser : index === 1 ? chased : fish),
  };
  const escapeTarget = resolveActivityTarget(chaser, 0, state, chaser.activity);
  const following = {
    ...chaser,
    activity: {
      ...createActivityState(ACTIVITIES.individualFollow),
      ageRealSeconds: 1,
      targetType: "fish",
      targetId: chased.seed,
    },
  };
  const followTarget = resolveActivityTarget(following, 0, state, following.activity);
  assert.equal(escapeTarget.choreographyPhase, "break");
  assert.ok(escapeTarget.speed < followTarget.speed);

  const pursuitChaser = {
    ...chaser,
    activity: { ...chaser.activity, ageRealSeconds: 4 },
  };
  const pursuitState = {
    ...state,
    individuals: state.individuals.map((fish, index) => index === 0 ? pursuitChaser : fish),
  };
  const pursuitTarget = resolveActivityTarget(
    pursuitChaser,
    0,
    pursuitState,
    pursuitChaser.activity,
  );
  assert.equal(pursuitTarget.choreographyPhase, "pursuit");
  assert.ok(pursuitTarget.speed > followTarget.speed * 1.35);
  assert.ok(pursuitTarget.choreography.turningResponse > followTarget.choreography.turningResponse * 2);

  const evasion = chaseEvasionForFish(chased, state);
  assert.ok(evasion && evasion.strength > 0.8);
  const away = { x: chased.x - chaser.x, y: chased.y - chaser.y };
  assert.ok(away.x * evasion.x + away.y * evasion.y > 0);

  // Recognised but not yet panicking: at four rows the chased fish carries on
  // with what it was doing, and the chaser gets to close the distance.
  const distant = { ...chased, x: chaser.x + 4 };
  const distantState = {
    ...state,
    individuals: state.individuals.map((fish, index) => (index === 1 ? distant : fish)),
  };
  const distantEvasion = chaseEvasionForFish(distant, distantState);
  assert.ok(
    !distantEvasion || distantEvasion.strength < 0.2,
    "the chased fish bolted from further away than the chaser can close",
  );

  const initialGap = Math.hypot(chaser.x - chased.x, chaser.y - chased.y);
  let chasedState = state;
  for (let frame = 0; frame < 8; frame += 1) chasedState = tick(chasedState, 0.1);
  const escapedChaser = chasedState.individuals[0];
  const escapedFish = chasedState.individuals[1];
  const escapedGap = Math.hypot(
    escapedChaser.x - escapedFish.x,
    escapedChaser.y - escapedFish.y,
  );
  assert.ok(Math.hypot(escapedChaser.vx, escapedChaser.vy) < 0.35);
  assert.ok(Math.hypot(escapedFish.vx, escapedFish.vy) > 0.9);
  assert.ok(Math.abs(escapedFish.vy) > 0.08, "the chased fish did not make a visible vertical dodge");
  assert.ok(escapedGap > initialGap + 0.35, "the first escape beat did not visibly open the gap");

  // Once the escape beat has had room to read, the chaser must answer rather
  // than remaining in the glide envelope. This checks realised motion, not just
  // the target speed above.
  for (let frame = 0; frame < 24; frame += 1) chasedState = tick(chasedState, 0.1);
  const answeringChaser = chasedState.individuals[0];
  assert.equal(answeringChaser.activity.current, ACTIVITIES.playfulChase);
  assert.ok(Math.hypot(answeringChaser.vx, answeringChaser.vy) > 0.8);

  const breakingChaser = {
    ...chaser,
    activity: { ...chaser.activity, ageRealSeconds: 6.25 },
  };
  const breakingState = {
    ...state,
    individuals: state.individuals.map((fish, index) => index === 0 ? breakingChaser : fish),
  };
  const breakTarget = resolveActivityTarget(
    breakingChaser,
    0,
    breakingState,
    breakingChaser.activity,
  );
  assert.equal(breakTarget.choreographyPhase, "break");
  assert.ok(breakTarget.speed < followTarget.speed);
});

test("plant weave crosses real plant depth instead of orbiting a single flat anchor", () => {
  const state = stockedAquarium({ seed: 0x51de, wallClockHours: 12 });
  const index = 4;
  const source = state.individuals[index];
  const plant = state.plants.find((candidate) => candidate.size >= 0.8);
  assert.ok(plant);
  const fish = withActivity(source, "explore", ACTIVITIES.plantWeave, {
    targetType: "plant",
    targetId: plant.seed,
    ageRealSeconds: 2,
  });
  const target = resolveActivityTarget(fish, index, state, fish.activity);
  assert.ok(target);
  assert.equal(target.plantTarget, true);
  assert.ok(Number.isInteger(target.weaveStage));
  assert.ok(typeof target.weaveLeg === "string");
  assert.ok(Number.isFinite(target.weavePlantX));
  assert.ok(Math.abs(target.x - target.weavePlantX) > 1.5);
  assert.ok(target.weaveArrivalRadius > 0);
});
