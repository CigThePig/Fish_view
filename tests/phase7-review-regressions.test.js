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
  activityUtilities,
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
  const companionIndex = base.individuals.findIndex(({ seed }) => seed === initial.fish.activity.targetId);
  assert.ok(companionIndex >= 0, "showcase chase is missing its target fish");

  const fish = {
    ...initial.fish,
    vx: 0.5,
    vy: 0,
    activity: {
      ...initial.fish.activity,
      ageRealSeconds: 3.4,
    },
  };
  const companion = {
    ...base.individuals[companionIndex],
    x: fish.x + 2,
    y: fish.y,
  };
  const state = {
    ...base,
    individuals: base.individuals.map((entry, index) => (
      index === initial.index ? fish : index === companionIndex ? companion : entry
    )),
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


test("plant weave remains committed through its authored emergence", () => {
  const base = createShowcaseState({ scenario: ACTIVITIES.plantWeave });
  const subject = showcaseSubjects(base, ACTIVITIES.plantWeave)[0];
  const fish = {
    ...subject.fish,
    behavior: { ...subject.fish.behavior, current: "social" },
    activity: {
      ...subject.fish.activity,
      current: ACTIVITIES.plantWeave,
      ageRealSeconds: 12,
      weaveStage: 2,
      weaveStageStartedAt: 10,
    },
  };
  const state = {
    ...base,
    individuals: base.individuals.map((entry, index) => index === subject.index ? fish : entry),
  };
  const frame = tickFishActivity(fish, subject.index, state, 0.1);
  assert.equal(frame.activity.current, ACTIVITIES.plantWeave);
});

test("edge secondary plants cannot collapse weave crossing and emergence", () => {
  const base = createShowcaseState({ scenario: ACTIVITIES.plantWeave });
  const subject = showcaseSubjects(base, ACTIVITIES.plantWeave)[0];
  const originalPrimary = base.plants.find(({ seed }) => seed === subject.fish.activity.targetId);
  assert.ok(originalPrimary, "showcase weave is missing its primary plant");
  const primary = { ...originalPrimary, x: base.cols - 10 };
  const edgeSecondary = { ...originalPrimary, seed: originalPrimary.seed + 1000003, x: base.cols - 0.5 };
  const fish = {
    ...subject.fish,
    x: base.cols - 14,
    activity: { ...subject.fish.activity, current: ACTIVITIES.plantWeave, targetId: primary.seed, ageRealSeconds: 10 },
  };
  const state = {
    ...base,
    plants: [primary, edgeSecondary],
    individuals: base.individuals.map((entry, index) => index === subject.index ? fish : entry),
  };
  const cross = resolveActivityTarget(fish, subject.index, state, { ...fish.activity, weaveStage: 3, weaveStageStartedAt: 8 });
  const emerge = resolveActivityTarget(fish, subject.index, state, { ...fish.activity, weaveStage: 4, weaveStageStartedAt: 8 });
  assert.ok(cross && emerge);
  assert.equal(cross.weavePlantSeed, primary.seed, "edge secondary should be rejected");
  assert.equal(emerge.weavePlantSeed, primary.seed, "fallback route should stay coherent");
  assert.ok(Math.abs(emerge.x - cross.x) > 1, "crossing and emergence collapsed to the same body-clamped waypoint");
});

test("mutual companion cruise separates when either partner reaches the pair ending", () => {
  const base = createShowcaseState({ scenario: ACTIVITIES.companionCruise });
  const subject = showcaseSubjects(base, ACTIVITIES.companionCruise)[0];
  const companionIndex = base.individuals.findIndex(({ seed }) => seed === subject.fish.activity.targetId);
  assert.ok(companionIndex >= 0, "showcase companion cruise is missing its partner");
  const companionSource = base.individuals[companionIndex];
  const fish = {
    ...subject.fish,
    activity: { ...subject.fish.activity, current: ACTIVITIES.companionCruise, targetId: companionSource.seed, ageRealSeconds: 0.5 },
  };
  const companion = {
    ...companionSource,
    activity: { ...companionSource.activity, current: ACTIVITIES.companionCruise, targetId: fish.seed, ageRealSeconds: 100 },
  };
  const state = {
    ...base,
    individuals: base.individuals.map((entry, index) => index === subject.index ? fish : index === companionIndex ? companion : entry),
  };
  const target = resolveActivityTarget(fish, subject.index, state, fish.activity);
  assert.ok(target);
  assert.equal(target.choreographyPhase, "separate");
});

test("staged plant entry commits its heading through a constrained reversal", () => {
  const base = createShowcaseState({ scenario: ACTIVITIES.plantInvestigate });
  const subject = showcaseSubjects(base, ACTIVITIES.plantInvestigate)[0];
  const fish = { ...subject.fish, x: 24, y: 20, vx: 0.6, vy: 0 };
  const target = {
    x: 18,
    y: 20,
    speed: 0.55,
    postureBias: 0,
    plantTarget: true,
    plantVisitStage: 0,
    plantVisitFinal: false,
    choreographyPhase: "enter",
  };
  const steered = steerActivityVelocity(fish, target, { realDelta: 0.1 });
  assert.ok(steered.vx < 0, "plant entry kept swimming away during the reversal");
});


test("permanent mid-water fish cannot start or continue plant weave", () => {
  const base = createShowcaseState({ scenario: ACTIVITIES.plantWeave });
  const weaveSubject = showcaseSubjects(base, ACTIVITIES.plantWeave)[0];
  const source = base.individuals[0];
  const fish = {
    ...source,
    behavior: { ...source.behavior, current: "explore" },
    activity: {
      ...source.activity,
      current: ACTIVITIES.wander,
      previous: ACTIVITIES.cruise,
      ageRealSeconds: 2,
    },
  };
  const state = {
    ...base,
    individuals: base.individuals.map((entry, index) => index === 0 ? fish : entry),
  };
  const utilities = activityUtilities(fish, 0, state);
  assert.equal(utilities[ACTIVITIES.plantWeave], undefined);

  const stale = {
    ...fish,
    activity: {
      ...fish.activity,
      current: ACTIVITIES.plantWeave,
      targetType: "plant",
      targetId: weaveSubject.fish.activity.targetId,
      ageRealSeconds: 12,
      weaveStage: 0,
      weaveStageStartedAt: 0,
    },
  };
  assert.equal(resolveActivityTarget(stale, 0, state, stale.activity), null);
});

test("plant weave timeout cannot skip an unreached intermediate crossing", () => {
  const base = createShowcaseState({ scenario: ACTIVITIES.plantWeave });
  const subject = showcaseSubjects(base, ACTIVITIES.plantWeave)[0];
  const probeActivity = {
    ...subject.fish.activity,
    current: ACTIVITIES.plantWeave,
    ageRealSeconds: 10,
    weaveStage: 1,
    weaveStageStartedAt: 0,
  };
  const probe = resolveActivityTarget(subject.fish, subject.index, base, probeActivity);
  assert.ok(probe);
  const halfWidth = fishSpriteWidth(subject.fish) / 2;
  const farX = probe.x < base.cols / 2 ? base.cols - halfWidth : halfWidth;
  const fish = {
    ...subject.fish,
    x: farX,
    y: probe.y,
    behavior: { ...subject.fish.behavior, current: "explore" },
    activity: {
      ...probeActivity,
      ageRealSeconds: probe.weaveLegTimeoutSeconds + 1,
      weaveStageStartedAt: 0,
    },
  };
  const state = {
    ...base,
    individuals: base.individuals.map((entry, index) => index === subject.index ? fish : entry),
  };
  const frame = tickFishActivity(fish, subject.index, state, 0.1);
  assert.equal(frame.activity.current, ACTIVITIES.plantWeave);
  assert.equal(frame.activity.weaveStage, 1, "timer skipped a physical crossing");
});

test("valid plant weave survives the ordinary dwell ceiling until emergence", () => {
  const base = createShowcaseState({ scenario: ACTIVITIES.plantWeave });
  const subject = showcaseSubjects(base, ACTIVITIES.plantWeave)[0];
  const activity = {
    ...subject.fish.activity,
    current: ACTIVITIES.plantWeave,
    ageRealSeconds: 80,
    weaveStage: 3,
    weaveStageStartedAt: 79,
  };
  const target = resolveActivityTarget(subject.fish, subject.index, base, activity);
  assert.ok(target);
  const halfWidth = fishSpriteWidth(subject.fish) / 2;
  const fish = {
    ...subject.fish,
    x: target.x < base.cols / 2 ? base.cols - halfWidth : halfWidth,
    y: target.y,
    behavior: { ...subject.fish.behavior, current: "explore" },
    activity,
  };
  const state = {
    ...base,
    individuals: base.individuals.map((entry, index) => index === subject.index ? fish : entry),
  };
  const frame = tickFishActivity(fish, subject.index, state, 0.1);
  assert.equal(frame.activity.current, ACTIVITIES.plantWeave);
});

test("individual follow has a visible peel-away before its dwell boundary", () => {
  const base = createShowcaseState({ scenario: ACTIVITIES.individualFollow });
  const subject = showcaseSubjects(base, ACTIVITIES.individualFollow)[0];
  const fish = {
    ...subject.fish,
    behavior: { ...subject.fish.behavior, current: "social" },
    activity: {
      ...subject.fish.activity,
      current: ACTIVITIES.individualFollow,
      ageRealSeconds: 23,
    },
  };
  const state = {
    ...base,
    individuals: base.individuals.map((entry, index) => index === subject.index ? fish : entry),
  };
  const target = resolveActivityTarget(fish, subject.index, state, fish.activity);
  assert.ok(target);
  assert.equal(target.choreographyPhase, "peel-away");
  const companion = state.individuals.find((entry) => entry.seed === fish.activity.targetId);
  assert.ok(companion);
  const currentGap = Math.hypot(fish.x - companion.x, fish.y - companion.y);
  const targetGap = Math.hypot(target.x - companion.x, target.y - companion.y);
  assert.ok(targetGap > currentGap, "peel-away target did not open space from the leader");
});
