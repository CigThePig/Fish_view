import assert from "node:assert/strict";
import test from "node:test";

import {
  SHOWCASE_SCENARIOS,
  createShowcaseState,
  showcaseSubjects,
} from "../src/dev/behavior-showcase.js";
import {
  CHASE_ARC_PHASES,
  chaseArcBoundaries,
  chaseArcPhase,
} from "../src/sim/chase-arc.js";
import { steerActivityVelocity } from "../src/sim/fish-choreography.js";
import {
  ACTIVITIES,
  resolveActivityTarget,
  tickFishActivity,
} from "../src/sim/fish-activities.js";
import { fishSpriteWidth } from "../src/sim/fish-growth.js";
import { surfaceSafeY } from "../src/sim/fish-motion.js";

test("playful chase never advances beyond engagement outside recognition range", () => {
  const tuning = { breakSeconds: 3, recognitionRadiusRows: 4.9 };
  const bounds = chaseArcBoundaries(tuning);
  assert.equal(
    chaseArcPhase(bounds.recoverStart + 5, 5.05, tuning),
    CHASE_ARC_PHASES.engage,
  );
});

test("resolved chase target carries live timing into steering", () => {
  assert.ok(SHOWCASE_SCENARIOS.some(({ id }) => id === ACTIVITIES.playfulChase));
  const base = createShowcaseState({ scenario: ACTIVITIES.playfulChase });
  const initial = showcaseSubjects(base, ACTIVITIES.playfulChase)[0];
  const fish = {
    ...initial.fish,
    vx: 0.5,
    vy: 0,
    activity: {
      ...initial.fish.activity,
      ageRealSeconds: 3.4,
    },
  };
  const state = {
    ...base,
    individuals: base.individuals.map((entry, index) => index === initial.index ? fish : entry),
    choreographyTuning: {
      ...(base.choreographyTuning ?? {}),
      scene: {
        ...(base.choreographyTuning?.scene ?? {}),
        [ACTIVITIES.playfulChase]: { breakSeconds: 3 },
      },
    },
  };

  const target = resolveActivityTarget(fish, initial.index, state, fish.activity);
  assert.ok(target);
  assert.equal(target.chaseTuning.breakSeconds, 3);
  assert.equal(target.choreographyPhase, CHASE_ARC_PHASES.break);

  const steered = steerActivityVelocity(fish, target, { realDelta: 0.1 });
  assert.ok(
    Math.abs(steered.desiredVy) > 0.01,
    "live break timing did not release the authored turn-away steering",
  );
});

test("surface arrival uses the same body-clamped x coordinate as its resolved target", () => {
  const state = createShowcaseState({ scenario: ACTIVITIES.surfaceInvestigate });
  const subject = showcaseSubjects(state, ACTIVITIES.surfaceInvestigate)[0];
  const halfWidth = fishSpriteWidth(subject.fish) / 2;
  const activity = {
    ...subject.fish.activity,
    current: ACTIVITIES.surfaceInvestigate,
    previous: ACTIVITIES.wander,
    targetType: "surface",
    targetX: 0,
    targetY: null,
    ageRealSeconds: 1,
    surfaceStage: 0,
    surfaceStageStartedAt: 0,
  };
  const fish = {
    ...subject.fish,
    x: halfWidth,
    y: surfaceSafeY(subject.fish, state, halfWidth),
    behavior: { ...subject.fish.behavior, current: "explore" },
    activity,
  };

  const frame = tickFishActivity(fish, subject.index, state, 0.1);
  assert.equal(frame.activity.surfaceStage, 1);
});
