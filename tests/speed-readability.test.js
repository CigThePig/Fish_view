import assert from "node:assert/strict";
import test from "node:test";

import { bodyMotionForFish } from "../src/render/render.js";
import { ACTIVITIES, createActivityState } from "../src/sim/fish-activities.js";
import { chaseEvasionForFish } from "../src/sim/fish-choreography.js";
import { DISPLAY } from "../src/sim/config.js";
import { tick } from "../src/sim/tick.js";
import { stockedAquarium } from "./support/aquarium.js";

const STEP_SECONDS = 0.1;
const PANEL_PIXELS_PER_ROW = DISPLAY.pixelWidth / DISPLAY.cols;
const PHONE_WIDTH_PIXELS = 390;
const PHONE_PIXELS_PER_ROW = PHONE_WIDTH_PIXELS / DISPLAY.cols;

const ORDINARY_ACTIVE_ACTIVITIES = new Set([
  ACTIVITIES.cruise,
  ACTIVITIES.openWaterWander,
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

function speedOf(fish) {
  return Math.hypot(fish.vx ?? 0, fish.vy ?? 0);
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

test("natural production swimming keeps a visibly meaningful speed spread", () => {
  let state = stockedAquarium({ seed: 0xa51c0a7e, wallClockHours: 12 });
  const frameSpreads = [];
  const frameRatios = [];
  const byActivity = new Map();
  const byIdentity = new Map();

  // Three real minutes is long enough to include ordinary social, exploratory,
  // plant and feeding motion without turning this into a long-horizon test.
  for (let frame = 0; frame < 1800; frame += 1) {
    state = tick(state, STEP_SECONDS);
    if (frame % 10 !== 0) continue;

    const ordinary = state.individuals.filter((fish) => ORDINARY_ACTIVE_ACTIVITIES.has(fish.activity?.current));
    const speeds = ordinary.map(speedOf).filter((speed) => Number.isFinite(speed) && speed > 0.01);
    if (speeds.length >= 5) {
      const low = percentile(speeds, 0.2);
      const high = percentile(speeds, 0.8);
      frameSpreads.push(high - low);
      frameRatios.push(high / Math.max(0.01, low));
    }

    for (const fish of ordinary) {
      const speed = speedOf(fish);
      if (!Number.isFinite(speed)) continue;
      const activity = fish.activity.current;
      if (!byActivity.has(activity)) byActivity.set(activity, []);
      byActivity.get(activity).push(speed);
      if (!byIdentity.has(fish.seed)) byIdentity.set(fish.seed, []);
      byIdentity.get(fish.seed).push(speed);
    }
  }

  assert.ok(frameSpreads.length >= 60, "the natural watch did not produce enough simultaneous active-fish samples");

  const medianSpread = percentile(frameSpreads, 0.5);
  const medianRatio = percentile(frameRatios, 0.5);
  const panelSpread = medianSpread * PANEL_PIXELS_PER_ROW;
  const phoneSpread = medianSpread * PHONE_PIXELS_PER_ROW;
  const identityMeans = [...byIdentity.values()].filter((samples) => samples.length >= 20).map(mean);
  const identityLow = percentile(identityMeans, 0.2);
  const identityHigh = percentile(identityMeans, 0.8);
  const identityRatio = identityHigh / Math.max(0.01, identityLow);
  const activitySummary = [...byActivity.entries()]
    .map(([activity, samples]) => `${activity}:${mean(samples).toFixed(2)}`)
    .sort()
    .join(" ");

  console.log(
    `[speed-readability] natural median p20-p80=${medianSpread.toFixed(3)} rows/s `
    + `(${panelSpread.toFixed(2)} px/s panel, ${phoneSpread.toFixed(2)} px/s @390px), `
    + `median ratio=${medianRatio.toFixed(2)}x, identity p20-p80=${identityRatio.toFixed(2)}x; ${activitySummary}`,
  );

  // A difference below about a fifth of a world row per second is only a couple
  // of pixels per second on the full 800px panel and roughly one pixel per
  // second on a portrait phone. That is numerical variation, not readable pace.
  assert.ok(
    medianSpread >= 0.22,
    `ordinary fish speeds are visually compressed: median p20-p80 spread was ${medianSpread.toFixed(3)} rows/s`,
  );
  assert.ok(
    medianRatio >= 1.45,
    `ordinary fish speeds are too similar: median p80/p20 ratio was ${medianRatio.toFixed(2)}x`,
  );
  assert.ok(
    identityRatio >= 1.2,
    `persistent fish pace is nearly indistinguishable: identity p80/p20 mean-speed ratio was ${identityRatio.toFixed(2)}x`,
  );
});

test("body animation cadence follows realised locomotion speed inside one activity", () => {
  const source = stockedAquarium({ seed: 0x5eed, wallClockHours: 12 }).individuals[4];
  const base = {
    ...source,
    activity: { ...createActivityState(ACTIVITIES.cruise), current: ACTIVITIES.cruise },
  };
  const slow = bodyMotionForFish({ ...base, vx: 0.18, vy: 0 });
  const medium = bodyMotionForFish({ ...base, vx: 0.42, vy: 0 });
  const fast = bodyMotionForFish({ ...base, vx: 0.72, vy: 0 });

  console.log(
    `[speed-readability] cruise body rates slow=${slow.rate.toFixed(3)} `
    + `medium=${medium.rate.toFixed(3)} fast=${fast.rate.toFixed(3)}`,
  );

  assert.ok(medium.rate > slow.rate * 1.08, "a medium-speed cruise fish animates like a slow one");
  assert.ok(fast.rate > medium.rate * 1.08, "a fast cruise fish animates like a medium-speed one");
  assert.ok(fast.rate >= slow.rate * 1.25, "body cadence does not make the locomotion-speed difference readable");
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

  const evaderSpeeds = [];
  const chaserSpeeds = [];
  for (let frame = 0; frame < 36; frame += 1) {
    state = tick(state, STEP_SECONDS);
    const evader = state.individuals[1];
    if (chaseEvasionForFish(evader, state)) {
      evaderSpeeds.push(speedOf(evader));
      chaserSpeeds.push(speedOf(state.individuals[0]));
    }
  }

  assert.ok(evaderSpeeds.length >= 8, "playful chase did not sustain enough evasion frames to measure");
  const average = mean(evaderSpeeds);
  const median = percentile(evaderSpeeds, 0.5);
  const peak = Math.max(...evaderSpeeds);
  const averageChaser = mean(chaserSpeeds);

  console.log(
    `[speed-readability] playful-chase evader samples=${evaderSpeeds.length} `
    + `avg=${average.toFixed(3)} median=${median.toFixed(3)} peak=${peak.toFixed(3)} rows/s `
    + `(${(average * PANEL_PIXELS_PER_ROW).toFixed(2)} avg px/s panel), `
    + `chaser avg during evasion=${averageChaser.toFixed(3)}`,
  );

  assert.ok(average >= 0.72, `chased fish averaged only ${average.toFixed(3)} rows/s during evasion`);
  assert.ok(median >= 0.7, `chased fish median escape speed was only ${median.toFixed(3)} rows/s`);
  assert.ok(peak >= 0.95, `chased fish never reached a clearly fast escape; peak was ${peak.toFixed(3)} rows/s`);
});
