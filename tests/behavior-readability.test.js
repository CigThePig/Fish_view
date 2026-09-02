import assert from "node:assert/strict";
import test from "node:test";

import { glyphBounds, glyphsForObject } from "../src/render/scene.js";
import { bodyMotionForFish, render } from "../src/render/render.js";
import { createBubbleWorldRecords } from "../src/sim/bubbles.js";
import {
  CHASE_BREAK_SECONDS,
  chaseEvasionForFish,
  choreographyFor,
  steerActivityVelocity,
} from "../src/sim/fish-choreography.js";
import {
  ACTIVITIES,
  createActivityState,
  plantTargetPosition,
  resolveActivityTarget,
} from "../src/sim/fish-activities.js";
import {
  FORAGE_PITCH_BIAS_DEGREES,
  forageActivity,
  substrateGrazeY,
  substrateSafeY,
  surfaceSafeY,
} from "../src/sim/fish-motion.js";
import { substrateSurfaceY } from "../src/sim/environment.js";
import { createAquariumState, withSettings } from "../src/sim/state.js";
import { tick } from "../src/sim/tick.js";

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

function findDurableBubble(state) {
  let result = state;
  for (let step = 0; step < 1800; step += 1) {
    const bubble = createBubbleWorldRecords(result).find((record) => (
      record.phase === "rise"
      && record.progress < 0.42
      && ["stream", "isolated"].includes(record.kind)
    ));
    if (bubble) return { state: result, bubble };
    result = { ...result, elapsedRealSeconds: result.elapsedRealSeconds + 0.1 };
  }
  return null;
}

test("activity choreography profiles preserve a calm baseline and distinct energetic signatures", () => {
  // No state means no lab overrides: these are the authored production profiles.
  const cruise = choreographyFor(null, ACTIVITIES.cruise);
  const bubble = choreographyFor(null, ACTIVITIES.bubbleInvestigate);
  const follow = choreographyFor(null, ACTIVITIES.individualFollow);
  const companion = choreographyFor(null, ACTIVITIES.companionCruise);
  const chase = choreographyFor(null, ACTIVITIES.playfulChase);
  const rest = choreographyFor(null, ACTIVITIES.openWaterRest);

  assert.ok(bubble.accelerationResponse > cruise.accelerationResponse * 2);
  assert.ok(bubble.verticalSpeedScale > cruise.verticalSpeedScale * 2);
  assert.ok(chase.turningResponse > follow.turningResponse * 2);
  assert.ok(chase.maximumSpeed > follow.maximumSpeed * 1.45);
  assert.ok(companion.velocityMatch > follow.velocityMatch);
  assert.ok(companion.pitchScale < chase.pitchScale);
  assert.ok(rest.maximumSpeed < cruise.maximumSpeed * 0.35);
  assert.ok(rest.turningResponse < cruise.turningResponse * 0.5);
});

test("school, deliberate follow, companion formation, and chase expose different social geometry", () => {
  const base = createAquariumState({ orientation: "landscape", seed: 7331, wallClockHours: 12 });
  const source = base.individuals[3];
  const companion = { ...base.individuals[4], x: 35, y: 9, vx: 0.48, vy: 0.06 };
  const state = {
    ...base,
    individuals: base.individuals.map((fish, index) => index === 4 ? companion : fish),
  };
  const targetFor = (activity) => {
    const fish = withActivity(source, "social", activity, {
      targetType: activity === ACTIVITIES.schoolFollow ? "school" : "fish",
      targetId: activity === ACTIVITIES.schoolFollow ? null : companion.seed,
      ageRealSeconds: 1.2,
    });
    return resolveActivityTarget(fish, 3, state, fish.activity);
  };
  const school = targetFor(ACTIVITIES.schoolFollow);
  const follow = targetFor(ACTIVITIES.individualFollow);
  const beside = targetFor(ACTIVITIES.companionCruise);
  const chase = targetFor(ACTIVITIES.playfulChase);
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
  const found = findDurableBubble(createAquariumState({
    orientation: "landscape",
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
    x: Math.max(4, Math.min(found.state.cols - 4, bubble.worldX - 4.5)),
    y: Math.min(found.state.rows - 5, bubble.worldY + 3.2),
    vx: 0.12,
    vy: 0,
  };
  let state = {
    ...found.state,
    individuals: found.state.individuals.map((value, i) => i === index ? fish : value),
  };
  const target = resolveActivityTarget(fish, index, state, fish.activity, {
    bubbles: createBubbleWorldRecords(state),
  });
  assert.equal(target.bubbleTarget, true);
  assert.equal(target.predictedBubble, true);
  assert.ok(["acquire", "pursue"].includes(target.choreographyPhase));
  assert.ok(target.y > bubble.worldY, "pursuit should stage below/behind the bubble rather than overlap it");

  const cruiseTarget = {
    x: fish.x + 4,
    y: fish.y - 3.2,
    speed: 0.42,
    choreography: choreographyFor(null, ACTIVITIES.cruise),
  };
  const pursuit = steerActivityVelocity(fish, target, {
    realDelta: 0.1,
    motionScale: 1,
    behaviorBlend: 1,
  });
  const cruise = steerActivityVelocity(fish, cruiseTarget, {
    realDelta: 0.1,
    motionScale: 1,
    behaviorBlend: 1,
  });
  assert.ok(Math.abs(pursuit.desiredVy) > Math.abs(cruise.desiredVy) * 1.2);

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

test("playful chase is faster than following and gives the chased fish a bounded evasive response", () => {
  const base = createAquariumState({ orientation: "landscape", seed: 2020, wallClockHours: 12 });
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
  // Close enough to bolt. A chased fish that flees the moment it is noticed -
  // five rows out, further than any chaser can close - keeps a fixed gap, and a
  // constant gap is a formation rather than a chase. The break comes late and
  // hard instead, which is what makes the distance visibly open and shut.
  const chased = { ...chasedSource, x: 21.6, y: 8, vx: 0.2, vy: 0 };
  const state = {
    ...base,
    individuals: base.individuals.map((fish, index) => index === 0 ? chaser : index === 1 ? chased : fish),
  };
  const chaseTarget = resolveActivityTarget(chaser, 0, state, chaser.activity);
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
  assert.ok(chaseTarget.speed > followTarget.speed * 1.35);
  assert.ok(chaseTarget.choreography.turningResponse > followTarget.choreography.turningResponse * 2);

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

  let chasedState = state;
  for (let frame = 0; frame < 8; frame += 1) chasedState = tick(chasedState, 0.1);
  const movedChaser = chasedState.individuals[0];
  const movedChased = chasedState.individuals[1];
  assert.ok(Math.hypot(movedChaser.vx, movedChaser.vy) > 0.7);
  assert.ok(Math.hypot(movedChased.vx, movedChased.vy) > 0.62);
  assert.ok(Math.abs(movedChased.vy) > 0.08, "the chased fish did not make a visible vertical dodge");

  const breakingChaser = {
    ...chaser,
    activity: { ...chaser.activity, ageRealSeconds: CHASE_BREAK_SECONDS + 1.4 },
  };
  const breakingState = {
    ...state,
    individuals: state.individuals.map((fish, index) => index === 0 ? breakingChaser : fish),
  };
  const breakTarget = resolveActivityTarget(breakingChaser, 0, breakingState, breakingChaser.activity);
  assert.equal(breakTarget.choreographyPhase, "break");
  assert.ok(breakTarget.speed < followTarget.speed);
  assert.equal(chaseEvasionForFish(chased, breakingState), null);
});

test("substrate feeding uses deterministic clustered pecks at a physically readable scale", () => {
  const base = createAquariumState({ orientation: "landscape", seed: 444, wallClockHours: 12 });
  const index = 3;
  const source = withActivity(base.individuals[index], "forage", ACTIVITIES.substrateSearch);
  const fish = { ...source, x: 25 };
  fish.y = substrateGrazeY(fish, base, fish.x);

  const eventStarts = [];
  let previousPeck = false;
  let peak = null;
  for (let age = 0; age < 12; age += 0.01) {
    const candidate = { ...fish, activity: { ...fish.activity, ageRealSeconds: age } };
    const activity = forageActivity(candidate, index, base);
    const active = activity.peckPhase !== null;
    if (active && !previousPeck) eventStarts.push(age);
    previousPeck = active;
    if (!peak || activity.peckDisplacement > peak.activity.peckDisplacement) {
      peak = { fish: candidate, activity };
    }
  }
  assert.ok(eventStarts.length >= 5);
  const gaps = eventStarts.slice(1).map((age, i) => age - eventStarts[i]);
  assert.ok(Math.min(...gaps) < 1.3, "the peck cluster contains no close pair");
  assert.ok(Math.max(...gaps) > Math.min(...gaps) * 1.7, "the peck cadence is still metronomic");
  // The strike is a real displacement now rather than an offset added to a
  // target, so it is authored large enough to see - a third of a row is eight
  // pixels of lunge, and the screen-space tool checks what that costs on the
  // panel - and small enough that a nose-down fish reaches into the substrate
  // crest instead of through it.
  assert.ok(peak.activity.peckDisplacement >= 0.28);
  assert.ok(peak.activity.peckDisplacement <= 0.45);
  assert.deepEqual(
    forageActivity(peak.fish, index, base),
    forageActivity(peak.fish, index, base),
  );

  const target = resolveActivityTarget(peak.fish, index, base, peak.fish.activity);
  assert.equal(target.choreographyPhase, "peck");
  assert.ok(target.postureBias >= FORAGE_PITCH_BIAS_DEGREES + 5.5);
  // The target is the graze line itself: below the swimming envelope, and with
  // no dip folded into it. Steering answers a position request over seconds,
  // so a quarter-second strike routed through the target arrives as drift; the
  // tick applies the plunge to the fish instead, which the next test measures.
  assert.ok(target.forageGrazing);
  assert.equal(target.y, substrateGrazeY(peak.fish, base, target.x));
  assert.ok(target.y - substrateSafeY(peak.fish, base, target.x) > 0.2);
  assert.ok(target.peckDisplacement >= 0.28);
});

test("the strike moves the fish, not just its target", () => {
  const base = withSettings(createAquariumState({ orientation: "landscape", seed: 444, wallClockHours: 12 }), {
    timeScale: 1,
  });
  const index = 3;
  const source = withActivity(base.individuals[index], "forage", ACTIVITIES.substrateSearch);
  const grazing = { ...source, x: 25 };
  grazing.y = substrateGrazeY(grazing, base, grazing.x);
  const state = {
    ...base,
    individuals: base.individuals.map((fish, i) => (i === index ? grazing : fish)),
  };

  // One second of ordinary ticks straddles a whole peck cluster: the fish has
  // to visibly rise and fall inside it rather than creep towards a target.
  let current = state;
  const rows = [];
  for (let step = 0; step < 60; step += 1) {
    current = tick(current, 0.1);
    const fish = current.individuals[index];
    rows.push({ y: fish.y, peck: forageActivity(fish, index, current).peck });
  }
  const active = rows.filter((row) => row.peck > 0.8);
  const idle = rows.filter((row) => row.peck === 0);
  assert.ok(active.length > 0, "no peck reached its peak in six seconds of feeding");
  const struck = Math.min(...active.map((row) => row.y));
  const resting = Math.max(...idle.map((row) => row.y));
  assert.ok(
    Math.max(...active.map((row) => row.y)) - resting >= 0.22,
    "the strike does not carry the fish below its grazing line",
  );
  assert.ok(struck >= resting - 0.05, "the fish drifted off the substrate between pecks");
});

test("the peck meets the substrate crest without burying the fish", () => {
  for (const orientation of ["landscape", "portrait"]) {
    const base = createAquariumState({ orientation, seed: 444, wallClockHours: 12 });
    const index = 3;
    const source = withActivity(base.individuals[index], "forage", ACTIVITIES.substrateSearch);
    const x = orientation === "landscape" ? 25 : 20;
    let best = null;
    for (let age = 0; age < 12; age += 0.02) {
      const fish = { ...source, x, activity: { ...source.activity, ageRealSeconds: age } };
      fish.y = substrateGrazeY(fish, base, x);
      const activity = forageActivity(fish, index, base);
      if (!best || activity.peckDisplacement > best.activity.peckDisplacement) best = { fish, activity };
    }
    const fish = {
      ...best.fish,
      y: substrateGrazeY(best.fish, base, x) + best.activity.peckDisplacement,
      visual: { ...best.fish.visual, pitch: 26, targetPitch: 26 },
    };
    const state = {
      ...base,
      individuals: base.individuals.map((value, i) => i === index ? fish : value),
    };
    const scene = render(state);
    const object = scene.objects.find((candidate) => candidate.id.startsWith(`individual:${index}:`));
    assert.ok(object);
    const glyphBottom = Math.max(...glyphsForObject(scene, object).map((glyph) => {
      const bounds = glyphBounds(glyph);
      return bounds.y + bounds.height;
    }));
    const fillBottom = Math.max(...object.fill.map((span) => span.y + span.height));
    const visibleBottom = Math.max(glyphBottom, fillBottom);
    const rowPixels = scene.height / state.rows;
    const terrainPixels = substrateSurfaceY(state, x) * rowPixels;
    // A feeding fish is meant to reach into the crest - that contact is the
    // whole cue - but no further than the shallow relief it is nosing through.
    const entered = (visibleBottom - terrainPixels) / rowPixels;
    assert.ok(
      entered <= 0.6,
      `${orientation} peck buried the fish ${entered.toFixed(2)} rows into the substrate`,
    );
    // This poses one fish at one angle; the seed sweep in review-regressions
    // grades real ticks across four tanks and both orientations and is the
    // tighter guard. What this one still catches is a clearance that has
    // drifted far enough to leave a feeding fish in open water.
    assert.ok(
      entered >= -0.45,
      `${orientation} peck stayed ${(-entered).toFixed(2)} rows clear of the substrate it feeds from`,
    );
  }
});

test("plant inspection hovers around one specimen while weaving alternates route sides", () => {
  const base = createAquariumState({ orientation: "landscape", seed: 614, wallClockHours: 12 });
  const index = 4;
  const plant = base.plants.find((candidate) => candidate.matureHeight > 2);
  assert.ok(plant);
  const source = withActivity(base.individuals[index], "explore", ACTIVITIES.plantInvestigate, {
    targetType: "plant",
    targetId: plant.seed,
  });
  const anchor = plantTargetPosition(source, plant, base);
  const near = { ...source, x: anchor.x, y: anchor.y, activity: { ...source.activity, ageRealSeconds: 3.1 } };
  const inspect = resolveActivityTarget(near, index, base, near.activity);
  const later = resolveActivityTarget(
    { ...near, activity: { ...near.activity, ageRealSeconds: 5.6 } },
    index,
    base,
    { ...near.activity, ageRealSeconds: 5.6 },
  );
  const far = { ...source, x: Math.max(4, anchor.x - 5), y: anchor.y - 2 };
  const approach = resolveActivityTarget(far, index, base, far.activity);
  assert.equal(inspect.choreographyPhase, "inspect");
  assert.equal(approach.choreographyPhase, "approach");
  assert.ok(inspect.speed < approach.speed);
  assert.ok(Math.hypot(inspect.x - later.x, inspect.y - later.y) > 0.2);
  assert.ok(Math.abs(inspect.x - plant.x) < 1.8 && Math.abs(later.x - plant.x) < 1.8);

  const weaving = {
    ...source,
    activity: {
      ...createActivityState(ACTIVITIES.plantWeave),
      targetType: "plant",
      targetId: plant.seed,
    },
  };
  const first = resolveActivityTarget(weaving, index, base, { ...weaving.activity, ageRealSeconds: 0 });
  const second = resolveActivityTarget(weaving, index, base, { ...weaving.activity, ageRealSeconds: 3.2 });
  assert.ok((first.x - plant.x) * (second.x - plant.x) < 0, "weave route never crossed the plant");
  assert.ok(Math.abs(first.y - second.y) > 0.45);
});

test("surface investigation ascends, probes the safe meniscus, and remains below it", () => {
  const base = createAquariumState({ orientation: "portrait", seed: 447, wallClockHours: 12 });
  const index = 4;
  const source = withActivity(base.individuals[index], "explore", ACTIVITIES.surfaceInvestigate, {
    targetType: "surface",
    targetX: base.cols * 0.55,
  });
  const far = { ...source, y: base.rows * 0.58 };
  const ascent = resolveActivityTarget(far, index, base, far.activity);
  assert.equal(ascent.choreographyPhase, "ascend");
  assert.ok(ascent.postureBias <= -10);

  const safe = surfaceSafeY(source, base, source.activity.targetX);
  let probe = null;
  for (let age = 0; age < 4; age += 0.02) {
    const fish = {
      ...source,
      x: source.activity.targetX,
      y: safe,
      activity: { ...source.activity, ageRealSeconds: age },
    };
    const target = resolveActivityTarget(fish, index, base, fish.activity);
    if (!probe || target.surfaceProbe > probe.target.surfaceProbe) probe = { fish, target };
  }
  assert.ok(probe.target.surfaceProbe > 0.98);
  assert.equal(probe.target.choreographyPhase, "probe");
  assert.ok(probe.target.y < surfaceSafeY(probe.fish, base, probe.target.x));
  assert.ok(probe.target.postureBias < -20);

  const state = {
    ...base,
    individuals: base.individuals.map((fish, i) => i === index ? probe.fish : fish),
  };
  const nextState = tick(state, 0.1);
  const next = nextState.individuals[index];
  assert.ok(next.y >= surfaceSafeY(next, nextState, next.x) - 1e-10);
});

test("resting locomotion and body rhythm are measurably quieter than cruise", () => {
  const base = createAquariumState({ orientation: "landscape", seed: 91, wallClockHours: 12 });
  const source = base.individuals[2];
  const resting = withActivity(source, "rest", ACTIVITIES.openWaterRest, {
    targetType: "waypoint",
    targetX: source.x,
    targetY: source.y,
    ageRealSeconds: 3,
  });
  const restTarget = resolveActivityTarget(resting, 2, base, resting.activity);
  const cruising = withActivity(source, "cruise", ACTIVITIES.cruise);
  const cruiseTarget = resolveActivityTarget(cruising, 2, base, cruising.activity);
  assert.equal(restTarget.choreographyPhase, "drift");
  assert.ok(restTarget.speed < cruiseTarget.speed * 0.3);
  assert.ok(restTarget.choreography.turningResponse < cruiseTarget.choreography.turningResponse * 0.5);

  const restBody = bodyMotionForFish(resting);
  const cruiseBody = bodyMotionForFish(cruising);
  const chaseBody = bodyMotionForFish({
    ...source,
    vx: 0.8,
    activity: createActivityState(ACTIVITIES.playfulChase),
  });
  assert.ok(restBody.rate < cruiseBody.rate * 0.5);
  assert.ok(restBody.deformation < cruiseBody.deformation * 0.5);
  assert.ok(chaseBody.rate > cruiseBody.rate * 1.5);
  assert.ok(chaseBody.deformation > cruiseBody.deformation * 1.3);
});
