import assert from "node:assert/strict";
import test from "node:test";

import { ACTIVITIES, createActivityState } from "../src/sim/fish-activities.js";
import { chaseEvasionForFish } from "../src/sim/fish-choreography.js";
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

test("playful-chase evader sustains a visibly fast escape instead of one brief spike", () => {
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
  let currentRun = [];
  for (let frame = 0; frame < 36; frame += 1) {
    state = tick(state, STEP_SECONDS);
    const evader = state.individuals[1];
    if (chaseEvasionForFish(evader, state)) {
      currentRun.push({
        panelSpeed: visiblePanelSpeedOf(evader),
        logicalSpeed: logicalSpeedOf(evader),
        chaserPanelSpeed: visiblePanelSpeedOf(state.individuals[0]),
      });
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

  const panelSpeeds = longest.map((sample) => sample.panelSpeed);
  const logicalSpeeds = longest.map((sample) => sample.logicalSpeed);
  const averagePanel = mean(panelSpeeds);
  const medianPanel = percentile(panelSpeeds, 0.5);
  const peakPanel = Math.max(...panelSpeeds);
  const averageLogical = mean(logicalSpeeds);
  const averageChaserPanel = mean(longest.map((sample) => sample.chaserPanelSpeed));

  console.log(
    `[speed-readability] playful-chase evader continuous=${longest.length} frames/`
    + `${(longest.length * STEP_SECONDS).toFixed(1)}s avg=${averagePanel.toFixed(2)} px/s panel `
    + `(${(averagePanel * PHONE_SCALE).toFixed(2)} px/s @390px), median=${medianPanel.toFixed(2)} `
    + `peak=${peakPanel.toFixed(2)} px/s, logical-magnitude avg=${averageLogical.toFixed(3)}, `
    + `chaser avg during same interval=${averageChaserPanel.toFixed(2)} px/s`,
  );

  assert.ok(averagePanel >= 8, `chased fish averaged only ${averagePanel.toFixed(2)} visible px/s during evasion`);
  assert.ok(medianPanel >= 7.5, `chased fish median escape speed was only ${medianPanel.toFixed(2)} visible px/s`);
  assert.ok(peakPanel >= 11, `chased fish never reached a clearly fast escape; peak was ${peakPanel.toFixed(2)} visible px/s`);
});
