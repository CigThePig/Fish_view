import assert from "node:assert/strict";
import test from "node:test";

import {
  CHASE_ARC_PHASES,
  chaseArcBoundaries,
  chaseArcPhase,
} from "../src/sim/chase-arc.js";
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

test("chase arc exposes the complete ordered motion sentence", () => {
  const tuning = { breakSeconds: 6.2, recognitionRadiusRows: 4.9 };
  const bounds = chaseArcBoundaries(tuning);
  const closeDistance = 2.4;
  const samples = [
    [bounds.engageEnd * 0.5, CHASE_ARC_PHASES.engage],
    [(bounds.engageEnd + bounds.escapeEnd) * 0.5, CHASE_ARC_PHASES.escape],
    [(bounds.escapeEnd + bounds.interceptStart) * 0.5, CHASE_ARC_PHASES.pursuit],
    [(bounds.interceptStart + bounds.breakSeconds) * 0.5, CHASE_ARC_PHASES.intercept],
    [(bounds.breakSeconds + bounds.recoverStart) * 0.5, CHASE_ARC_PHASES.break],
    [bounds.recoverStart + 0.2, CHASE_ARC_PHASES.recover],
  ];
  assert.deepEqual(
    samples.map(([seconds]) => chaseArcPhase(seconds, closeDistance, tuning)),
    samples.map(([, phase]) => phase),
  );
});

test("chase engagement waits for recognition range during its opening window", () => {
  const tuning = { breakSeconds: 6.2, recognitionRadiusRows: 4.9 };
  const bounds = chaseArcBoundaries(tuning);
  const duringEscapeWindow = (bounds.engageEnd + bounds.escapeEnd) * 0.5;
  assert.equal(
    chaseArcPhase(duringEscapeWindow, 6.2, tuning),
    CHASE_ARC_PHASES.engage,
  );
  assert.equal(
    chaseArcPhase(duringEscapeWindow, 3.2, tuning),
    CHASE_ARC_PHASES.escape,
  );
});

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
    assert.equal(typeof sample.phase, "string");
    assert.equal(typeof sample.macroPhase, "string");
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

test("chase observation exposes intercept, break, and recovery beats", () => {
  const observation = observeChaseShowcase({ seed: hashSeed("phase7-observer-arc") });
  const phases = observation.summary.phases.map(({ phase }) => phase);
  assert.ok(phases.includes(CHASE_ARC_PHASES.engage));
  assert.ok(phases.includes(CHASE_ARC_PHASES.escape));
  assert.ok(phases.includes(CHASE_ARC_PHASES.pursuit));
  assert.ok(phases.includes(CHASE_ARC_PHASES.intercept));
  assert.ok(phases.includes(CHASE_ARC_PHASES.break));
  assert.ok(phases.includes(CHASE_ARC_PHASES.recover));
  assert.equal(observation.summary.interceptSeen, true);
  assert.equal(observation.summary.breakSeen, true);
  assert.equal(observation.summary.recoverSeen, true);
});

test("chase summary describes the observation instead of imposing one exact tuning", () => {
  const observation = observeChaseShowcase({ seed: hashSeed("phase7-observer-summary") });
  const { summary } = observation;
  assert.ok(summary.minimumGap >= 0);
  assert.ok(summary.maximumGap >= summary.minimumGap);
  assert.equal(summary.gapRange, summary.maximumGap - summary.minimumGap);
  assert.ok(summary.gapOscillations >= 0);
  assert.ok(summary.pursuitGapOscillations >= 0);
  assert.ok(summary.peakChaserSpeed >= 0);
  assert.ok(summary.peakEvaderSpeed >= 0);
  assert.ok(summary.peakChaserTurnRateDegreesPerSecond >= 0);
  assert.ok(summary.peakEvaderTurnRateDegreesPerSecond >= 0);
  assert.ok(summary.strongestEvasion >= 0);
  assert.ok(summary.overshootFrames >= 0);
  assert.ok(Array.isArray(summary.phases));
  assert.ok(summary.phases.length >= 1);

  // Deliberately no exact target such as "turn rate must equal X". The observer
  // protects the presence and order of the dramatic beats while leaving the
  // visual tuning free to improve. Phase 7.3 evidence, not one magic threshold,
  // decides whether the resulting chase reads clearly on the panel.
});
