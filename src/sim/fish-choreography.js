import {
  DEFAULT_STEERING_PROFILE,
  sceneTuning,
  steeringProfile,
} from "./choreography-tuning.js";
import {
  CHASE_ARC_PHASES,
  CHASE_DEFAULT_BREAK_SECONDS,
  CHASE_DEFAULT_RECOGNITION_RADIUS,
  CHASE_RECOVERY_DELAY_SECONDS,
  chaseArcBoundaries,
  chaseArcPhase,
  chaseArcProgress,
  chaseMacroPhase,
} from "./chase-arc.js";
import { clamp, traitsFromSeed } from "./entities.js";
import { fishSpriteWidth } from "./fish-growth.js";
import { mix32 } from "./prng.js";

// Activity selection says what a fish intends to do. How that intention should
// feel in motion is data, not another state machine: the steering profiles and
// the per-activity distances, speeds and rotations both live in
// choreography-tuning.js, where the behaviour choreography lab can reach them.
const DEFAULT_CHOREOGRAPHY = DEFAULT_STEERING_PROFILE;

// How opposed a requested heading may be before the turn is committed to a
// side: just under a straight reversal, so the fish still swings through a wide
// arc rather than pivoting, but never stalls on the axis.
const REVERSAL_LIMIT_RADIANS = Math.PI - 0.09;
const REVERSAL_DOT = Math.cos(REVERSAL_LIMIT_RADIANS);

// The authored values, kept as named exports because the activity dwell times
// are checked against them. The live numbers come from the "playful-chase"
// scene tuning, which starts at exactly these.
export const CHASE_RECOGNITION_RADIUS = CHASE_DEFAULT_RECOGNITION_RADIUS;
export const CHASE_BREAK_SECONDS = CHASE_DEFAULT_BREAK_SECONDS;
// How close the chaser has to get before the chased fish actually breaks lives
// in the same table, as panicNearRows/panicFarRows. Recognition reaches across
// the whole radius above - the fish knows it is being followed long before it
// reacts - but bolting at that range meant fleeing from five rows away, which
// no chaser can close, and the pair simply ran the tank at a fixed distance.
// Reacting late is what lets the gap shut.

function safeNormalize(x, y, fallbackX = 1, fallbackY = 0) {
  const length = Math.hypot(x, y);
  if (length < 0.00001) return { x: fallbackX, y: fallbackY };
  return { x: x / length, y: y / length };
}

function smoothstep(edge0, edge1, value) {
  const amount = clamp((value - edge0) / Math.max(0.00001, edge1 - edge0), 0, 1);
  return amount * amount * (3 - 2 * amount);
}

function rotateVector(x, y, radians) {
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return {
    x: x * cosine - y * sine,
    y: x * sine + y * cosine,
  };
}

// Current sprite width is enough to give growth a visible say in a chase
// without inventing a second body-size model. Small fish can answer a juke more
// sharply; large fish keep broader, slower corrections. The interval is narrow
// on purpose: size shapes the same chase signature instead of changing whether
// it is readable at all.
function chaseBodyAgility(fish) {
  const width = Math.max(1, fishSpriteWidth(fish));
  return clamp(1.17 - Math.max(0, width - 5) * 0.035, 0.8, 1.17);
}

// A componentwise blend cannot cross an exact reversal. With a turn ease below
// 0.5 the interpolated vector stays on the current side of zero and
// normalization restores the old heading every frame, so a fish swimming right
// at a same-height waypoint on its left would hold that heading until a wall
// flipped it. Capping how opposed the requested heading may be gives the blend
// a side to fall to: the side the request already leans to, or, for a heading
// exactly reversed, one picked from the fish so the tank does not pivot in
// unison. Ordinary corrections are left exactly as they were tuned.
function turnableDirection(current, desired, seed) {
  const dot = current.x * desired.x + current.y * desired.y;
  if (dot > REVERSAL_DOT) return desired;
  const cross = current.x * desired.y - current.y * desired.x;
  const side = Math.abs(cross) > 0.00001
    ? Math.sign(cross)
    : ((mix32((seed ?? 0) >>> 0) & 1) === 0 ? -1 : 1);
  const angle = Math.atan2(current.y, current.x) + side * REVERSAL_LIMIT_RADIANS;
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

// `phase` names a short-lived variant of the activity - "playful-chase:break",
// "substrate-search:graze" - whose profile is layered over the activity's own.
export function choreographyFor(state, activity, phase = null) {
  return {
    ...DEFAULT_CHOREOGRAPHY,
    ...steeringProfile(state, activity),
    ...(phase ? steeringProfile(state, phase) : null),
  };
}

// fish-activities.js still needs its broad approach / pursuit / break branches,
// but Phase 7.3 inserts escape and intercept inside the middle act. Those finer
// phase names pass straight through the existing pursuit branch and are then
// visible to steering and telemetry.
export function chasePhase(ageRealSeconds, distance, tuning = null) {
  return chaseMacroPhase(ageRealSeconds, distance, tuning);
}

// The chased fish keeps its own biological behavior and activity. This derived
// steering influence lasts only while a nearby companion is visibly chasing
// it, so saves never need an evade flag and a broken target cannot strand it.
export function chaseEvasionForFish(fish, state) {
  const tuning = sceneTuning(state, "playful-chase");
  const recognitionRadius = tuning.recognitionRadiusRows;
  let best = null;
  for (const chaser of state.individuals ?? []) {
    if (chaser.seed === fish.seed
      || chaser.activity?.current !== "playful-chase"
      || chaser.activity?.targetType !== "fish"
      || chaser.activity?.targetId !== fish.seed) continue;

    const age = Math.max(0, Number.isFinite(chaser.activity.ageRealSeconds)
      ? chaser.activity.ageRealSeconds
      : 0);
    const dx = fish.x - chaser.x;
    const dy = fish.y - chaser.y;
    const distance = Math.hypot(dx, dy);
    if (!Number.isFinite(distance) || distance > recognitionRadius + 0.18) continue;

    const arcPhase = chaseArcPhase(age, distance, tuning);
    if (arcPhase === CHASE_ARC_PHASES.engage
      || arcPhase === CHASE_ARC_PHASES.break
      || arcPhase === CHASE_ARC_PHASES.recover) continue;

    const proximity = 1 - smoothstep(tuning.panicNearRows, tuning.panicFarRows, distance);
    const progress = chaseArcProgress(age, arcPhase, tuning);
    const pairSeed = mix32(Math.min(fish.seed, chaser.seed)
      ^ Math.imul(Math.max(fish.seed, chaser.seed), 0x27d4eb2f));
    const dodgeSign = (pairSeed & 1) === 0 ? -1 : 1;
    const away = safeNormalize(dx, dy, fish.vx < 0 ? -1 : 1, 0);
    const perpendicular = { x: -away.y, y: away.x };
    const traits = traitsFromSeed(fish.seed, fish.history);
    const agility = chaseBodyAgility(fish);

    let signedSide = dodgeSign;
    let sideMagnitude = 0;
    let burstPulse = 0;
    let phaseStrength = 0;
    let awayWeight = 1;

    if (arcPhase === CHASE_ARC_PHASES.escape) {
      // The target notices the closing fish and gets the first unmistakable
      // move: a compact acceleration spike plus one diagonal cut. The chaser's
      // response is intentionally delayed below, so this opens the first gap.
      const burst = Math.sin(progress * Math.PI);
      signedSide = dodgeSign;
      sideMagnitude = (0.32 + burst * (tuning.evasionSideRows + 0.18)) * agility;
      burstPulse = 0.55 + burst * 0.9;
      phaseStrength = 0.55 + proximity * 0.45;
    } else if (arcPhase === CHASE_ARC_PHASES.pursuit) {
      // Repeated short evasions make the pair-distance line breathe instead of
      // settling into one nose-to-tail interval. The sign alternates through a
      // deterministic pair phase, so the route is not mirrored steering.
      const bounds = chaseArcBoundaries(tuning);
      const cycleSeconds = 1.42;
      const phaseOffset = ((pairSeed >>> 8) & 0xff) / 255 * Math.PI * 2;
      const cycle = (age - bounds.escapeEnd) / cycleSeconds * Math.PI * 2 + phaseOffset;
      const wave = Math.sin(cycle);
      const burst = Math.max(0, Math.sin(cycle + Math.PI * 0.2));
      signedSide = Math.sign(wave || dodgeSign);
      sideMagnitude = Math.abs(wave) * (tuning.evasionSideRows * 0.62 + 0.12) * agility;
      burstPulse = burst * 0.9;
      phaseStrength = 0.28 + proximity * 0.58 + burst * 0.14;
    } else {
      // Final juke. The evader gives up most of the straight-away component at
      // the middle of the cut while the chaser is still committed to the old
      // line. That creates a real near miss rather than a decorative wobble.
      const juke = Math.sin(progress * Math.PI);
      const interceptSign = ((pairSeed >>> 1) & 1) === 0 ? dodgeSign : -dodgeSign;
      signedSide = interceptSign;
      sideMagnitude = (0.46 + juke * (tuning.evasionSideRows * 1.25 + 0.42)) * agility;
      burstPulse = 0.7 + juke * 1.15;
      phaseStrength = 0.62 + proximity * 0.28 + juke * 0.1;
      awayWeight = 1 - juke * 0.72;
    }

    const direction = safeNormalize(
      away.x * awayWeight + perpendicular.x * signedSide * sideMagnitude,
      away.y * awayWeight + perpendicular.y * signedSide * sideMagnitude,
      away.x,
      signedSide * 0.5,
    );
    const strength = clamp(phaseStrength, 0, 1);
    if (strength <= 0.001 || (best && best.strength >= strength)) continue;

    best = {
      x: direction.x,
      y: direction.y,
      speed: tuning.evasionSpeed
        + traits.activity * 0.18
        + proximity * tuning.evasionProximityGain
        + burstPulse * tuning.evasionBurstGain,
      weight: 0.5 + strength * 0.44,
      strength,
      sourceSeed: chaser.seed,
      accelerationResponse: (3.25 + strength * 1.15) * (0.92 + agility * 0.08),
      turningResponse: (4.35 + strength * 1.55) * agility,
      maximumSpeed: 1.04 + Math.max(0, agility - 1) * 0.08,
    };
  }
  return best;
}

export function steerActivityVelocity(fish, target, {
  realDelta,
  motionScale = 1,
  behaviorBlend = 1,
  evasion = null,
} = {}) {
  const delta = clamp(Number.isFinite(realDelta) ? realDelta : 0, 0, 0.25);
  const profile = target?.choreography ?? DEFAULT_CHOREOGRAPHY;
  const fallbackX = fish.vx < 0 ? -1 : 1;
  const dx = (Number.isFinite(target?.x) ? target.x : fish.x) - fish.x;
  const dy = (Number.isFinite(target?.y) ? target.y : fish.y) - fish.y;
  const distance = Math.hypot(dx, dy);
  const direction = safeNormalize(dx, dy, fallbackX, 0);
  const requestedSpeed = Math.max(0, Number.isFinite(target?.speed) ? target.speed : 0.3) * motionScale;
  const radius = Math.max(0, Number.isFinite(profile.approachRadius) ? profile.approachRadius : 0);
  const arrival = clamp(Number.isFinite(profile.arrivalSpeedScale) ? profile.arrivalSpeedScale : 1, 0, 1);
  const approach = radius > 0 ? smoothstep(0, radius, distance) : 1;
  const gain = Math.max(0, Number.isFinite(profile.positionGain) ? profile.positionGain : 1);
  let correctionSpeed = requestedSpeed * (arrival + (1 - arrival) * approach);
  correctionSpeed = Math.min(correctionSpeed, distance * gain + requestedSpeed * arrival);

  let desiredVx = direction.x * correctionSpeed;
  let desiredVy = direction.y * correctionSpeed
    * Math.max(0, Number.isFinite(profile.verticalSpeedScale) ? profile.verticalSpeedScale : 0.72);
  const velocityMatch = clamp(Number.isFinite(profile.velocityMatch) ? profile.velocityMatch : 0, 0, 1);
  if (velocityMatch > 0 && Number.isFinite(target?.velocityX) && Number.isFinite(target?.velocityY)) {
    desiredVx += target.velocityX * velocityMatch;
    desiredVy += target.velocityY * velocityMatch;
  }

  const chasePhaseName = target?.playfulChase ? target?.choreographyPhase : null;
  const chaseActive = chasePhaseName === CHASE_ARC_PHASES.escape
    || chasePhaseName === CHASE_ARC_PHASES.pursuit
    || chasePhaseName === CHASE_ARC_PHASES.intercept;
  if (chaseActive) {
    const verticalGain = Number.isFinite(profile.pursuitVerticalGain) ? profile.pursuitVerticalGain : 1;
    const phaseGain = chasePhaseName === CHASE_ARC_PHASES.intercept ? 1.12 : 1;
    desiredVy *= Math.max(0, verticalGain * phaseGain);
  }

  let accelerationResponse = Math.max(0.01, profile.accelerationResponse ?? 1.45);
  let turningResponse = Math.max(0.01, profile.turningResponse ?? 1.5);
  let maximumSpeed = Math.max(0.02, profile.maximumSpeed ?? 0.82) * motionScale;

  // The chaser's arc is mostly a change in response timing, not another target
  // generator. The target still comes from the normal activity resolver. These
  // response envelopes are what make "target bolts, chaser answers, chaser
  // commits, chaser corrects" readable instead of simultaneous mirrored motion.
  if (target?.playfulChase) {
    const age = Math.max(0, Number.isFinite(fish.activity?.ageRealSeconds)
      ? fish.activity.ageRealSeconds
      : 0);
    const traits = traitsFromSeed(fish.seed, fish.history);
    const agility = chaseBodyAgility(fish);

    if (chasePhaseName === CHASE_ARC_PHASES.escape) {
      const progress = chaseArcProgress(age, CHASE_ARC_PHASES.escape);
      accelerationResponse *= 0.62 + progress * (0.52 + traits.activity * 0.12);
      turningResponse *= (0.68 + progress * 0.42) * agility;
      maximumSpeed *= 0.92 + progress * 0.08;
    } else if (chasePhaseName === CHASE_ARC_PHASES.pursuit) {
      accelerationResponse *= 0.96 + traits.activity * 0.16;
      turningResponse *= agility;
    } else if (chasePhaseName === CHASE_ARC_PHASES.intercept) {
      const progress = chaseArcProgress(age, CHASE_ARC_PHASES.intercept);
      // First half: commit to the interception line while the evader jukes.
      // Second half: release that commitment and correct hard after the miss.
      const correctionRelease = smoothstep(0.4, 0.82, progress);
      accelerationResponse *= 1.14 + traits.activity * 0.16;
      turningResponse *= (0.26 + correctionRelease * 1.22) * agility;
      maximumSpeed *= 1.04;
    } else if (chasePhaseName === "break") {
      const agePastAuthoredBreak = Math.max(0, age - CHASE_BREAK_SECONDS);
      const recovering = agePastAuthoredBreak >= CHASE_RECOVERY_DELAY_SECONDS;
      const breakTurn = smoothstep(0, 0.72, agePastAuthoredBreak);
      const turnSign = (mix32((fish.seed >>> 0) ^ 0x6a09e667) & 1) === 0 ? -1 : 1;
      const rotated = rotateVector(
        desiredVx,
        desiredVy,
        turnSign * breakTurn * (0.48 + traits.activity * 0.12),
      );
      desiredVx = rotated.x;
      desiredVy = rotated.y;
      accelerationResponse *= recovering ? 0.56 : 0.86;
      turningResponse *= (recovering ? 0.62 : 0.94) * agility;
      maximumSpeed *= recovering ? 0.6 : 1;
    }
  }

  if (evasion) {
    const weight = clamp(evasion.weight ?? 0, 0, 1);
    const escapeSpeed = Math.max(0, evasion.speed ?? 0) * motionScale;
    desiredVx = desiredVx * (1 - weight) + (evasion.x ?? 0) * escapeSpeed * weight;
    desiredVy = desiredVy * (1 - weight) + (evasion.y ?? 0) * escapeSpeed * weight;
    accelerationResponse = Math.max(accelerationResponse, evasion.accelerationResponse ?? 0);
    turningResponse = Math.max(turningResponse, evasion.turningResponse ?? 0);
    maximumSpeed = Math.max(maximumSpeed, (evasion.maximumSpeed ?? 0) * motionScale);
  }

  const desiredSpeed = Math.min(maximumSpeed, Math.hypot(desiredVx, desiredVy));
  const desiredDirection = safeNormalize(desiredVx, desiredVy, direction.x, direction.y);
  const currentSpeed = Math.hypot(fish.vx, fish.vy);
  const currentDirection = safeNormalize(fish.vx, fish.vy, desiredDirection.x, desiredDirection.y);
  const turnEase = 1 - Math.exp(-delta * turningResponse);
  const turnTarget = turnableDirection(currentDirection, desiredDirection, fish.seed);
  const steeredDirection = safeNormalize(
    currentDirection.x + (turnTarget.x - currentDirection.x) * turnEase,
    currentDirection.y + (turnTarget.y - currentDirection.y) * turnEase,
    turnTarget.x,
    turnTarget.y,
  );
  const blendResponse = accelerationResponse * (0.72 + clamp(behaviorBlend, 0, 1) * 0.28);
  const accelerationEase = 1 - Math.exp(-delta * blendResponse);
  let speed = currentSpeed + (desiredSpeed - currentSpeed) * accelerationEase;
  const minimumSpeed = Math.min(
    maximumSpeed,
    Math.max(0, Number.isFinite(profile.minimumSpeed) ? profile.minimumSpeed : 0.055),
  );
  speed = clamp(speed, minimumSpeed, maximumSpeed);

  return {
    vx: steeredDirection.x * speed,
    vy: steeredDirection.y * speed,
    desiredVx,
    desiredVy,
    desiredSpeed,
    distance,
    choreography: profile,
    evading: Boolean(evasion),
  };
}
