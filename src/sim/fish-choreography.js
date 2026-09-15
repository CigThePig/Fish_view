import {
  DEFAULT_STEERING_PROFILE,
  sceneTuning,
  steeringProfile,
} from "./choreography-tuning.js";
import {
  CHASE_ARC_PHASES,
  CHASE_DEFAULT_BREAK_SECONDS,
  CHASE_DEFAULT_RECOGNITION_RADIUS,
  chaseArcBoundaries,
  chaseArcPhase,
  chaseArcProgress,
  chaseMacroPhase,
} from "./chase-arc.js";
import { clamp, traitsFromSeed } from "./entities.js";
import { fishSpriteWidth } from "./fish-growth.js";
import { mix32, sampleRange } from "./prng.js";

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

// Pace is a fixed locomotion temperament reconstructed from identity. It costs
// no persistence and never rerolls with learned history. The range is wide
// enough for two fish doing the same ordinary activity to read differently,
// but narrow enough that authored behavior bands still say what the fish is
// doing. High-energy chase/escape motion receives only part of this variation
// so a naturally slow fish cannot make a frozen chase sentence unreadable.
export function locomotionPaceForFish(fish) {
  const seed = Number.isFinite(fish?.seed) ? fish.seed >>> 0 : 0;
  return sampleRange(seed, 9137, 0.84, 1.16);
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
    let phaseSpeedBonus = 0;
    let accelerationResponse = 4.2;
    let turningResponse = 4.2 * agility;
    let maximumSpeed = 1.12;

    if (arcPhase === CHASE_ARC_PHASES.escape) {
      // This beat has to open the gap. A merely decorative sidestep still lets
      // the already-closing chaser eat distance, so the first dodge carries a
      // short real acceleration advantage while the chaser hesitates below.
      // Recognition at the outside of the radius stays subtle: panic strength
      // is still governed by distance, so noticing a fish four rows away is not
      // the same thing as bolting from it.
      const burst = Math.sin(progress * Math.PI);
      signedSide = dodgeSign;
      sideMagnitude = (0.26 + burst * (tuning.evasionSideRows * 0.72 + 0.2)) * agility;
      burstPulse = 0.45 + burst * 0.55;
      phaseSpeedBonus = 0.34 + burst * 0.3;
      phaseStrength = 0.06 + proximity * 0.78 + burst * 0.08;
      accelerationResponse = 5.6 + burst * 1.2;
      turningResponse = (3.8 + burst * 0.8) * agility;
      maximumSpeed = 1.22 + Math.max(0, agility - 1) * 0.08;
    } else if (arcPhase === CHASE_ARC_PHASES.pursuit) {
      // Brief pulses interrupt the closing run. They are deliberately short:
      // the chaser should regain the gap between them, creating the readable
      // close / evade / close rhythm instead of a second steady fleeing speed.
      const bounds = chaseArcBoundaries(tuning);
      const cycleSeconds = 1.34;
      const phaseOffset = ((pairSeed >>> 8) & 0xff) / 255 * Math.PI * 2;
      const cycle = (age - bounds.escapeEnd) / cycleSeconds * Math.PI * 2 + phaseOffset;
      const wave = Math.sin(cycle);
      const burst = Math.max(0, Math.sin(cycle + Math.PI * 0.16));
      signedSide = Math.sign(wave || dodgeSign);
      sideMagnitude = Math.abs(wave) * (tuning.evasionSideRows * 0.5 + 0.1) * agility;
      burstPulse = burst * 0.52;
      phaseSpeedBonus = burst * 0.3;
      phaseStrength = 0.04 + proximity * 0.78 + burst * 0.08;
      accelerationResponse = 4.25 + burst * 1.15;
      turningResponse = (3.8 + Math.abs(wave) * 0.75) * agility;
      maximumSpeed = 1.16 + Math.max(0, agility - 1) * 0.06;
    } else {
      // The final dodge trades forward speed for direction. The chaser is
      // allowed to commit and surge through the old line, then has to turn back
      // after the evader has cut aside. That is the near-miss beat that casual
      // following can never produce.
      const juke = Math.sin(progress * Math.PI);
      const interceptSign = ((pairSeed >>> 1) & 1) === 0 ? dodgeSign : -dodgeSign;
      signedSide = interceptSign;
      sideMagnitude = (0.38 + juke * (tuning.evasionSideRows * 0.95 + 0.36)) * agility;
      burstPulse = 0.12 + juke * 0.18;
      phaseSpeedBonus = -juke * 0.16;
      phaseStrength = 0.66 + proximity * 0.22 + juke * 0.12;
      awayWeight = 1 - juke * 0.82;
      accelerationResponse = 4.5;
      turningResponse = (3.45 + juke * 0.55) * agility;
      maximumSpeed = 0.98 + Math.max(0, agility - 1) * 0.04;
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
      speed: Math.max(
        0.16,
        tuning.evasionSpeed
          + traits.activity * 0.18
          + proximity * tuning.evasionProximityGain
          + burstPulse * tuning.evasionBurstGain
          + phaseSpeedBonus,
      ),
      weight: arcPhase === CHASE_ARC_PHASES.escape
        ? 0.08 + strength * 0.9
        : arcPhase === CHASE_ARC_PHASES.intercept
          ? 0.52 + strength * 0.36
          : 0.12 + strength * 0.78,
      strength,
      sourceSeed: chaser.seed,
      accelerationResponse,
      turningResponse,
      maximumSpeed,
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
  const locomotionPace = locomotionPaceForFish(fish);
  const paceInfluence = target?.playfulChase || evasion ? 0.45 : 1;
  const effectivePace = 1 + (locomotionPace - 1) * paceInfluence;
  const requestedSpeed = Math.max(0, Number.isFinite(target?.speed) ? target.speed : 0.3)
    * motionScale
    * effectivePace;
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
  const chaseTuning = target?.playfulChase ? target?.chaseTuning ?? null : null;
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

  // The target gets the first escape beat. The chaser then rebuilds speed in
  // pursuit, commits hard to one interception line, and only after the juke is
  // allowed to swing back. This response timing is what turns the same target
  // relationship into a chase arc rather than perfectly mirrored steering.
  if (target?.playfulChase) {
    const age = Math.max(0, Number.isFinite(fish.activity?.ageRealSeconds)
      ? fish.activity.ageRealSeconds
      : 0);
    const traits = traitsFromSeed(fish.seed, fish.history);
    const agility = chaseBodyAgility(fish);

    if (chasePhaseName === CHASE_ARC_PHASES.escape) {
      const progress = chaseArcProgress(age, CHASE_ARC_PHASES.escape, chaseTuning);
      accelerationResponse *= 0.36 + progress * (0.28 + traits.activity * 0.08);
      turningResponse *= (0.58 + progress * 0.28) * agility;
      maximumSpeed *= 0.7 + progress * 0.08;
    } else if (chasePhaseName === CHASE_ARC_PHASES.pursuit) {
      accelerationResponse *= 1.02 + traits.activity * 0.16;
      turningResponse *= agility;
    } else if (chasePhaseName === CHASE_ARC_PHASES.intercept) {
      const progress = chaseArcProgress(age, CHASE_ARC_PHASES.intercept, chaseTuning);
      const correctionRelease = smoothstep(0.5, 0.86, progress);
      const surge = 1.46 + traits.activity * 0.12;
      desiredVx *= surge;
      desiredVy *= surge;
      accelerationResponse *= 1.36 + traits.activity * 0.18;
      turningResponse *= (0.16 + correctionRelease * 1.34) * agility;
      maximumSpeed = Math.max(
        maximumSpeed,
        (1.58 + Math.max(0, agility - 1) * 0.18) * motionScale,
      );
    } else if (chasePhaseName === "break") {
      const bounds = chaseArcBoundaries(chaseTuning);
      const agePastAuthoredBreak = Math.max(0, age - bounds.breakSeconds);
      const recovering = age >= bounds.recoverStart;
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
    const escapeSpeed = Math.max(0, evasion.speed ?? 0) * motionScale * effectivePace;
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
  // A staged plant visit is a short authored sentence: arrive, inspect/settle,
  // then leave. Near the substrate, a graceful 180-degree steering arc can lose
  // its vertical component to body/terrain clearance every frame, so an entry
  // or exit target directly behind the fish can otherwise turn into a tank-wide
  // loop. Commit the simulation heading for the bounded transition beats while
  // the existing acceleration and visual turn pose still soften what is drawn.
  // The local inspect/quiet beats keep ordinary steering, as does plant weave.
  const deliberatePlantVisitTurn = target?.plantTarget === true
    && Number.isInteger(target?.plantVisitStage)
    && ["approach", "enter", "retreat", "emerge"].includes(target?.choreographyPhase);
  const turnTarget = turnableDirection(currentDirection, desiredDirection, fish.seed);
  const steeredDirection = deliberatePlantVisitTurn
    ? desiredDirection
    : safeNormalize(
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
    locomotionPace,
    evading: Boolean(evasion),
  };
}
