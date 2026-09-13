import { spriteDimensions } from "../art/sprites.js";
import { traitsFromSeed } from "../sim/entities.js";
import { chaseEvasionForFish } from "../sim/fish-choreography.js";
import { spriteForFish } from "../sim/fish-growth.js";
import {
  createShowcaseState,
  showcaseSubjects,
  showcaseTarget,
  tickShowcase,
} from "./behavior-showcase.js";

export const CHASE_OBSERVATION_STEP_SECONDS = 0.1;
export const CHASE_OBSERVATION_SCENARIO = "playful-chase";

function angleDifference(left, right) {
  let difference = right - left;
  while (difference > Math.PI) difference -= Math.PI * 2;
  while (difference < -Math.PI) difference += Math.PI * 2;
  return difference;
}

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function headingFor(fish, fallback = 0) {
  const speed = Math.hypot(fish?.vx ?? 0, fish?.vy ?? 0);
  return speed > 0.01 ? Math.atan2(fish.vy, fish.vx) : fallback;
}

function pairProfile(fish) {
  const sprite = spriteForFish(fish);
  const dimensions = spriteDimensions(sprite);
  return {
    seed: fish.seed >>> 0,
    spriteId: sprite.id,
    width: dimensions.width,
    height: dimensions.height,
    traits: { ...traitsFromSeed(fish.seed, fish.history) },
  };
}

function phaseTransitions(timeline) {
  const transitions = [];
  let previous = null;
  for (const sample of timeline) {
    if (sample.phase === previous) continue;
    transitions.push({ seconds: sample.seconds, phase: sample.phase });
    previous = sample.phase;
  }
  return transitions;
}

function gapOscillations(timeline) {
  let priorSign = 0;
  let changes = 0;
  for (const sample of timeline) {
    if (Math.abs(sample.gapRate) < 0.03) continue;
    const sign = Math.sign(sample.gapRate);
    if (priorSign && sign !== priorSign) changes += 1;
    priorSign = sign;
  }
  return changes;
}

function firstSample(timeline, predicate) {
  return timeline.find(predicate) ?? null;
}

function summarize(timeline) {
  const gaps = timeline.map((sample) => sample.gap);
  const chaserSpeeds = timeline.map((sample) => sample.chaser.speed);
  const evaderSpeeds = timeline.map((sample) => sample.evader.speed);
  const breakSample = firstSample(timeline, (sample) => sample.phase === "break");
  const breakTail = breakSample
    ? timeline.filter((sample) => sample.seconds >= breakSample.seconds)
    : [];
  const minGap = Math.min(...gaps);
  const maxGap = Math.max(...gaps);
  const pursuitSamples = timeline.filter((sample) => sample.phase === "pursuit");
  const overshootFrames = pursuitSamples.filter((sample) => sample.targetAlignment < -0.08).length;
  return {
    durationSeconds: timeline.at(-1)?.seconds ?? 0,
    minimumGap: minGap,
    maximumGap: maxGap,
    gapRange: maxGap - minGap,
    gapOscillations: gapOscillations(timeline),
    peakChaserSpeed: Math.max(...chaserSpeeds),
    peakEvaderSpeed: Math.max(...evaderSpeeds),
    peakChaserTurnRateDegreesPerSecond: Math.max(...timeline.map((sample) => sample.chaser.turnRateDegreesPerSecond)),
    peakEvaderTurnRateDegreesPerSecond: Math.max(...timeline.map((sample) => sample.evader.turnRateDegreesPerSecond)),
    peakHeadingSeparationDegrees: Math.max(...timeline.map((sample) => sample.headingSeparationDegrees)),
    peakVerticalSeparation: Math.max(...timeline.map((sample) => Math.abs(sample.verticalSeparation))),
    strongestEvasion: Math.max(...timeline.map((sample) => sample.evasionStrength)),
    overshootFrames,
    breakSeen: Boolean(breakSample),
    breakSecond: breakSample?.seconds ?? null,
    breakGapGrowth: breakSample && breakTail.length
      ? breakTail.at(-1).gap - breakSample.gap
      : null,
    breakHeadingSeparationPeakDegrees: breakTail.length
      ? Math.max(...breakTail.map((sample) => sample.headingSeparationDegrees))
      : null,
    phases: phaseTransitions(timeline),
  };
}

/**
 * Observe the forced production chase without changing it.
 *
 * The output intentionally records geometry rather than grading the current
 * implementation. Phase 7.2 is expected to make these numbers move. Keeping
 * the observer non-prescriptive means it remains useful while the choreography
 * is being rebuilt instead of becoming a test that protects today's defects.
 */
export function observeChaseShowcase({
  seed,
  stepSeconds = CHASE_OBSERVATION_STEP_SECONDS,
  durationSeconds = null,
} = {}) {
  let state = createShowcaseState({ scenario: CHASE_OBSERVATION_SCENARIO, seed });
  const initialSubjects = showcaseSubjects(state, CHASE_OBSERVATION_SCENARIO);
  if (initialSubjects.length < 2) throw new Error("Playful chase showcase needs two subjects");
  const profile = {
    chaser: pairProfile(initialSubjects[0].fish),
    evader: pairProfile(initialSubjects[1].fish),
  };
  const scenarioSeconds = 9.5;
  const duration = Number.isFinite(durationSeconds) && durationSeconds > 0
    ? durationSeconds
    : scenarioSeconds;
  const step = Number.isFinite(stepSeconds) && stepSeconds > 0
    ? Math.min(stepSeconds, 0.25)
    : CHASE_OBSERVATION_STEP_SECONDS;
  const frameCount = Math.ceil(duration / step);
  const timeline = [];
  let previousGap = null;
  let previousChaserHeading = headingFor(initialSubjects[0].fish);
  let previousEvaderHeading = headingFor(initialSubjects[1].fish);

  for (let frame = 0; frame <= frameCount; frame += 1) {
    const subjects = showcaseSubjects(state, CHASE_OBSERVATION_SCENARIO);
    const chaser = subjects[0]?.fish;
    const evader = subjects[1]?.fish;
    if (!chaser || !evader) throw new Error("Chase subject disappeared during observation");
    const target = showcaseTarget(state, CHASE_OBSERVATION_SCENARIO);
    const evasion = chaseEvasionForFish(evader, state);
    const dx = evader.x - chaser.x;
    const dy = evader.y - chaser.y;
    const gap = Math.hypot(dx, dy);
    const chaserHeading = headingFor(chaser, previousChaserHeading);
    const evaderHeading = headingFor(evader, previousEvaderHeading);
    const targetDirection = gap > 0.00001 ? { x: dx / gap, y: dy / gap } : { x: 1, y: 0 };
    const chaserDirection = { x: Math.cos(chaserHeading), y: Math.sin(chaserHeading) };
    const seconds = Math.min(duration, frame * step);
    const chaserTurn = frame === 0 ? 0 : Math.abs(angleDifference(previousChaserHeading, chaserHeading)) * 180 / Math.PI / step;
    const evaderTurn = frame === 0 ? 0 : Math.abs(angleDifference(previousEvaderHeading, evaderHeading)) * 180 / Math.PI / step;

    timeline.push({
      seconds,
      phase: target?.choreographyPhase ?? chaser.activity?.current ?? null,
      gap,
      gapRate: previousGap === null ? 0 : (gap - previousGap) / step,
      verticalSeparation: dy,
      targetAlignment: chaserDirection.x * targetDirection.x + chaserDirection.y * targetDirection.y,
      headingSeparationDegrees: Math.abs(angleDifference(chaserHeading, evaderHeading)) * 180 / Math.PI,
      evasionStrength: finite(evasion?.strength),
      chaser: {
        x: chaser.x,
        y: chaser.y,
        vx: chaser.vx,
        vy: chaser.vy,
        speed: Math.hypot(chaser.vx, chaser.vy),
        headingDegrees: chaserHeading * 180 / Math.PI,
        turnRateDegreesPerSecond: chaserTurn,
      },
      evader: {
        x: evader.x,
        y: evader.y,
        vx: evader.vx,
        vy: evader.vy,
        speed: Math.hypot(evader.vx, evader.vy),
        headingDegrees: evaderHeading * 180 / Math.PI,
        turnRateDegreesPerSecond: evaderTurn,
      },
    });

    previousGap = gap;
    previousChaserHeading = chaserHeading;
    previousEvaderHeading = evaderHeading;
    if (frame === frameCount) break;
    state = tickShowcase(state, step, CHASE_OBSERVATION_SCENARIO);
  }

  return {
    scenario: CHASE_OBSERVATION_SCENARIO,
    seed: state.seed >>> 0,
    stepSeconds: step,
    profile,
    summary: summarize(timeline),
    timeline,
  };
}
