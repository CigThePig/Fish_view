import assert from "node:assert/strict";
import test from "node:test";

import { CHASE_ARC_PHASES } from "../src/sim/chase-arc.js";
import { ACTIVITIES, createActivityState } from "../src/sim/fish-activities.js";
import {
  chaseEvasionForFish,
  chaseSemanticPhase,
  locomotionPaceForFish,
  steerActivityVelocity,
} from "../src/sim/fish-choreography.js";
import { sceneTuning } from "../src/sim/choreography-tuning.js";
import { DISPLAY } from "../src/sim/config.js";
import { tick } from "../src/sim/tick.js";
import { stockedAquarium } from "./support/aquarium.js";

const STEP_SECONDS = 0.1;
const PANEL_X_PIXELS_PER_COLUMN = DISPLAY.pixelWidth / DISPLAY.cols;
const PANEL_Y_PIXELS_PER_ROW = DISPLAY.pixelHeight / DISPLAY.rows;
const PHONE_WIDTH_PIXELS = 390;
const PHONE_SCALE = PHONE_WIDTH_PIXELS / DISPLAY.pixelWidth;

const ORDINARY_ACTIVE_ACTIVITIES = new Set([
  ACTIVITIES.cruise,
  ACTIVITIES.wander,
  ACTIVITIES.schoolFollow,
  ACTIVITIES.individualFollow,
  ACTIVITIES.companionCruise,
  ACTIVITIES.plantInvestigate,
  ACTIVITIES.plantWeave,
  ACTIVITIES.bubbleInvestigate,
  ACTIVITIES.surfaceInvestigate,
  ACTIVITIES.substrateSearch,
]);

function percentile(values, fraction) {
  assert.ok(values.length > 0);
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * fraction)));
  return sorted[index];
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function logicalSpeedOf(fish) {
  return Math.hypot(fish.vx ?? 0, fish.vy ?? 0);
}

function visiblePanelSpeedOf(fish) {
  return Math.hypot(
    (fish.vx ?? 0) * PANEL_X_PIXELS_PER_COLUMN,
    (fish.vy ?? 0) * PANEL_Y_PIXELS_PER_ROW,
  );
}

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

function normalizedIdentityPaces(byActivityIdentity) {
  const normalizedByIdentity = new Map();

  for (const identitySamples of byActivityIdentity.values()) {
    const eligible = [...identitySamples.entries()].filter(([, samples]) => samples.length >= 6);
    if (eligible.length < 3) continue;
    const activityMean = mean(eligible.flatMap(([, samples]) => samples));
    if (!(activityMean > 0)) continue;

    for (const [seed, samples] of eligible) {
      if (!normalizedByIdentity.has(seed)) normalizedByIdentity.set(seed, []);
      normalizedByIdentity.get(seed).push(mean(samples) / activityMean);
    }
  }

  return [...normalizedByIdentity.values()]
    .filter((samples) => samples.length > 0)
    .map(mean);
}

test("natural production swimming keeps a visibly meaningful speed spread", () => {
  let state = stockedAquarium({ seed: 0xa51c0a7e, wallClockHours: 12 });
  const frameSpreads = [];
  const frameRatios = [];
  const byActivity = new Map();
  const byActivityIdentity = new Map();

  // Three real minutes is long enough to include ordinary social, exploratory,
  // plant and feeding motion without turning this into a long-horizon test.
  for (let frame = 0; frame < 1800; frame += 1) {
    state = tick(state, STEP_SECONDS);
    if (frame % 10 !== 0) continue;

    const ordinary = state.individuals.filter((fish) => ORDINARY_ACTIVE_ACTIVITIES.has(fish.activity?.current));
    const speeds = ordinary.map(visiblePanelSpeedOf).filter((speed) => Number.isFinite(speed) && speed > 0.1);
    if (speeds.length >= 5) {
      const low = percentile(speeds, 0.2);
      const high = percentile(speeds, 0.8);
      frameSpreads.push(high - low);
      frameRatios.push(high / Math.max(0.1, low));
    }

    for (const fish of ordinary) {
      const speed = visiblePanelSpeedOf(fish);
      if (!Number.isFinite(speed)) continue;
      const activity = fish.activity.current;
      if (!byActivity.has(activity)) byActivity.set(activity, []);
      byActivity.get(activity).push(speed);
      if (!byActivityIdentity.has(activity)) byActivityIdentity.set(activity, new Map());
      const identities = byActivityIdentity.get(activity);
      if (!identities.has(fish.seed)) identities.set(fish.seed, []);
      identities.get(fish.seed).push(speed);
    }
  }

  assert.ok(frameSpreads.length >= 60, "the natural watch did not produce enough simultaneous active-fish samples");

  const medianSpread = percentile(frameSpreads, 0.5);
  const medianRatio = percentile(frameRatios, 0.5);
  const identityPaces = normalizedIdentityPaces(byActivityIdentity);
  assert.ok(identityPaces.length >= 5, "too few identities shared activities to compare persistent pace fairly");
  const identityLow = percentile(identityPaces, 0.2);
  const identityHigh = percentile(identityPaces, 0.8);
  const identityRatio = identityHigh / Math.max(0.01, identityLow);
  const activitySummary = [...byActivity.entries()]
    .map(([activity, samples]) => `${activity}:${mean(samples).toFixed(1)}px/s`)
    .sort()
    .join(" ");

  console.log(
    `[speed-readability] natural median visible p20-p80=${medianSpread.toFixed(2)} px/s panel `
    + `(${(medianSpread * PHONE_SCALE).toFixed(2)} px/s @390px), `
    + `median ratio=${medianRatio.toFixed(2)}x, within-activity identity p20-p80=${identityRatio.toFixed(2)}x; `
    + activitySummary,
  );

  assert.ok(
    medianSpread >= 3,
    `ordinary visible speeds are compressed: median p20-p80 spread was ${medianSpread.toFixed(2)} px/s`,
  );
  assert.ok(
    medianRatio >= 1.45,
    `ordinary visible speeds are too similar: median p80/p20 ratio was ${medianRatio.toFixed(2)}x`,
  );
  assert.ok(
    identityRatio >= 1.12,
    `persistent fish pace is nearly indistinguishable within the same activities: p80/p20 was ${identityRatio.toFixed(2)}x`,
  );
});

test("locomotion temperament changes steering for identical activity geometry", () => {
  const source = stockedAquarium({ seed: 0x5eed, wallClockHours: 12 }).individuals[4];
  const candidates = Array.from({ length: 256 }, (_, index) => ({ ...source, seed: index + 1 }))
    .sort((left, right) => locomotionPaceForFish(left) - locomotionPaceForFish(right));
  const slow = { ...candidates[0], x: 10, y: 8, vx: 0, vy: 0 };
  const fast = { ...candidates.at(-1), x: 10, y: 8, vx: 0, vy: 0 };
  const target = { x: 50, y: 8, speed: 0.4 };
  const steer = (fish) => steerActivityVelocity(fish, target, {
    realDelta: 0.25,
    motionScale: 1,
    behaviorBlend: 1,
  });
  const slowSteering = steer(slow);
  const fastSteering = steer(fast);
  const slowSpeed = Math.hypot(slowSteering.vx, slowSteering.vy);
  const fastSpeed = Math.hypot(fastSteering.vx, fastSteering.vy);

  assert.ok(
    fastSteering.locomotionPace >= slowSteering.locomotionPace * 1.25,
    `selected pace seeds were too similar: ${slowSteering.locomotionPace.toFixed(3)} vs ${fastSteering.locomotionPace.toFixed(3)}`,
  );
  assert.ok(
    fastSpeed >= slowSpeed * 1.2,
    `identical steering geometry flattened pace temperament: ${slowSpeed.toFixed(3)} vs ${fastSpeed.toFixed(3)}`,
  );
});

test("playful-chase evader can burst toward four rows per second while the chaser surge stays bounded", () => {
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
  const chased = { ...chasedSource, x: 21.6, y: 8, vx: 0.2, vy: 0 };
  let state = {
    ...base,
    individuals: base.individuals.map((fish, index) => index === 0 ? chaser : index === 1 ? chased : fish),
  };

  const evasionRuns = [];
  const openingEscape = [];
  const interceptChaserSpeeds = [];
  let currentRun = [];
  // Start at activity age 1s and observe long enough to cross the 4.6-6.2s
  // intercept window, the authored break and the beginning of recovery.
  for (let frame = 0; frame < 90; frame += 1) {
    state = tick(state, STEP_SECONDS);
    const liveChaser = state.individuals[0];
    const evader = state.individuals[1];
    const gap = Math.hypot(evader.x - liveChaser.x, evader.y - liveChaser.y);
    const tuning = sceneTuning(state, ACTIVITIES.playfulChase);
    const semanticPhase = liveChaser.activity?.current === ACTIVITIES.playfulChase
      ? chaseSemanticPhase(liveChaser.activity.ageRealSeconds, gap, tuning)
      : null;
    if (semanticPhase === CHASE_ARC_PHASES.intercept) {
      interceptChaserSpeeds.push(logicalSpeedOf(liveChaser));
    }

    const evasion = chaseEvasionForFish(evader, state);
    if (evasion) {
      const sample = {
        panelSpeed: visiblePanelSpeedOf(evader),
        logicalSpeed: logicalSpeedOf(evader),
        evasionCeiling: evasion.maximumSpeed,
      };
      currentRun.push(sample);
      // Grade the four-row ceiling on the authored opening beat itself. The
      // longest generic evasion run is often a later pursuit run capped at 3.0,
      // so sorting runs by duration and calling the winner "opening escape"
      // silently measured the wrong part of the chase after phase rewind was fixed.
      if (semanticPhase === CHASE_ARC_PHASES.escape) openingEscape.push(sample);
    } else if (currentRun.length) {
      evasionRuns.push(currentRun);
      currentRun = [];
    }
  }
  if (currentRun.length) evasionRuns.push(currentRun);

  const longest = evasionRuns.sort((left, right) => right.length - left.length)[0] ?? [];
  assert.ok(
    longest.length >= 12,
    `playful chase only sustained ${longest.length} consecutive evasion frames (${(longest.length * STEP_SECONDS).toFixed(1)}s)`,
  );
  assert.ok(
    openingEscape.length >= 2,
    `playful chase exposed only ${openingEscape.length} opening-escape frames to the burst check`,
  );
  assert.ok(
    interceptChaserSpeeds.length >= 6,
    `playful chase exposed only ${interceptChaserSpeeds.length} intercept frames to the chaser ceiling check`,
  );

  const panelSpeeds = longest.map((sample) => sample.panelSpeed);
  const logicalSpeeds = longest.map((sample) => sample.logicalSpeed);
  const averagePanel = mean(panelSpeeds);
  const medianPanel = percentile(panelSpeeds, 0.5);
  const peakPanel = Math.max(...panelSpeeds);
  const averageLogical = mean(logicalSpeeds);
  const openingLogicalSpeeds = openingEscape.map((sample) => sample.logicalSpeed);
  const openingPeakLogical = Math.max(...openingLogicalSpeeds);
  const burstFrames = openingLogicalSpeeds.filter((speed) => speed >= 2.5).length;
  const openingPeakCeiling = Math.max(...openingEscape.map((sample) => sample.evasionCeiling));
  const averageInterceptChaser = mean(interceptChaserSpeeds);
  const peakInterceptChaser = Math.max(...interceptChaserSpeeds);

  console.log(
    `[speed-readability] playful-chase evader continuous=${longest.length} frames/`
    + `${(longest.length * STEP_SECONDS).toFixed(1)}s avg=${averagePanel.toFixed(2)} px/s panel `
    + `(${(averagePanel * PHONE_SCALE).toFixed(2)} px/s @390px), median=${medianPanel.toFixed(2)} `
    + `peak=${peakPanel.toFixed(2)} px/s, logical avg=${averageLogical.toFixed(3)}; `
    + `opening escape=${openingEscape.length} frames peak=${openingPeakLogical.toFixed(3)} rows/s, `
    + `>=2.5 rows/s frames=${burstFrames}, ceiling=${openingPeakCeiling.toFixed(2)}; `
    + `intercept chaser avg/peak=${averageInterceptChaser.toFixed(3)}/${peakInterceptChaser.toFixed(3)} rows/s`,
  );

  assert.ok(averagePanel >= 8, `chased fish averaged only ${averagePanel.toFixed(2)} visible px/s during evasion`);
  assert.ok(medianPanel >= 7.5, `chased fish median escape speed was only ${medianPanel.toFixed(2)} visible px/s`);
  assert.equal(openingPeakCeiling, 4, "the opening escape no longer exposes the authored 4 rows/s burst ceiling");
  assert.ok(
    openingPeakLogical >= 2.5,
    `chased fish never made a materially faster opening burst; logical peak was ${openingPeakLogical.toFixed(3)} rows/s`,
  );
  assert.ok(burstFrames >= 2, `the >2.5 rows/s opening escape lasted only ${burstFrames} frames`);
  assert.ok(openingPeakLogical <= 4.01, `chased fish exceeded its 4 rows/s escape ceiling at ${openingPeakLogical.toFixed(3)}`);
  assert.ok(
    peakInterceptChaser >= 2.4,
    `chaser never exercised the authored intercept surge; peak was ${peakInterceptChaser.toFixed(3)} rows/s`,
  );
  assert.ok(
    peakInterceptChaser <= 3.01,
    `chaser exceeded its 3 rows/s intercept ceiling at ${peakInterceptChaser.toFixed(3)}`,
  );
});
