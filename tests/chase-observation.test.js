import assert from "node:assert/strict";
import test from "node:test";

import {
  CHASE_OBSERVATION_SCENARIO,
  CHASE_OBSERVATION_STEP_SECONDS,
  observeChaseShowcase,
} from "../src/dev/chase-observation.js";
import { hashSeed } from "../src/sim/prng.js";

function compact(observation) {
  return {
    seed: observation.seed,
    profile: observation.profile,
    summary: observation.summary,
    timeline: observation.timeline,
  };
}

test("chase observation is deterministic for the same seed", () => {
  const seed = hashSeed("phase7-observer-determinism");
  const first = observeChaseShowcase({ seed });
  const second = observeChaseShowcase({ seed });
  assert.deepEqual(compact(first), compact(second));
});

test("chase observation records finite pair geometry, speeds, turns, and evasion", () => {
  const observation = observeChaseShowcase({ seed: hashSeed("phase7-observer-fields") });
  assert.equal(observation.scenario, CHASE_OBSERVATION_SCENARIO);
  assert.equal(observation.stepSeconds, CHASE_OBSERVATION_STEP_SECONDS);
  assert.ok(observation.timeline.length > 40);
  assert.ok(observation.profile.chaser.spriteId);
  assert.ok(observation.profile.evader.spriteId);

  let previousSeconds = -1;
  for (const sample of observation.timeline) {
    assert.ok(sample.seconds > previousSeconds);
    previousSeconds = sample.seconds;
    for (const value of [
      sample.gap,
      sample.gapRate,
      sample.verticalSeparation,
      sample.targetAlignment,
      sample.headingSeparationDegrees,
      sample.evasionStrength,
      sample.chaser.speed,
      sample.evader.speed,
      sample.chaser.turnRateDegreesPerSecond,
      sample.evader.turnRateDegreesPerSecond,
    ]) assert.ok(Number.isFinite(value));
  }
});

test("chase summary describes the observation instead of imposing today's target values", () => {
  const observation = observeChaseShowcase({ seed: hashSeed("phase7-observer-summary") });
  const { summary } = observation;
  assert.ok(summary.minimumGap >= 0);
  assert.ok(summary.maximumGap >= summary.minimumGap);
  assert.equal(summary.gapRange, summary.maximumGap - summary.minimumGap);
  assert.ok(summary.gapOscillations >= 0);
  assert.ok(summary.peakChaserSpeed >= 0);
  assert.ok(summary.peakEvaderSpeed >= 0);
  assert.ok(summary.peakChaserTurnRateDegreesPerSecond >= 0);
  assert.ok(summary.peakEvaderTurnRateDegreesPerSecond >= 0);
  assert.ok(summary.strongestEvasion >= 0);
  assert.ok(Array.isArray(summary.phases));
  assert.ok(summary.phases.length >= 1);

  // Deliberately no assertion such as "gap range must be X" or "turn rate must
  // exceed Y". Phase 7.2 exists because the current chase is not the quality
  // bar. This instrument must expose changes, not protect the choreography it
  // was built to replace.
});
