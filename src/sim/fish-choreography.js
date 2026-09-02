import {
  DEFAULT_STEERING_PROFILE,
  sceneTuning,
  steeringProfile,
} from "./choreography-tuning.js";
import { clamp, traitsFromSeed } from "./entities.js";
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
export const CHASE_RECOGNITION_RADIUS = 4.9;
export const CHASE_BREAK_SECONDS = 6.2;
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

export function chasePhase(ageRealSeconds, distance, tuning = null) {
  const breakSeconds = Number.isFinite(tuning?.breakSeconds) ? tuning.breakSeconds : CHASE_BREAK_SECONDS;
  const radius = Number.isFinite(tuning?.recognitionRadiusRows)
    ? tuning.recognitionRadiusRows
    : CHASE_RECOGNITION_RADIUS;
  const age = Math.max(0, Number.isFinite(ageRealSeconds) ? ageRealSeconds : 0);
  if (age >= breakSeconds) return "break";
  if (age < 0.65 || distance > radius) return "approach";
  return "pursuit";
}

// The chased fish keeps its own biological behavior and activity. This derived
// steering influence lasts only while a nearby companion is visibly chasing
// it, so saves never need an evade flag and a broken target cannot strand it.
export function chaseEvasionForFish(fish, state) {
  const tuning = sceneTuning(state, "playful-chase");
  const recognitionRadius = tuning.recognitionRadiusRows;
  const breakSeconds = tuning.breakSeconds;
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

    const proximity = 1 - smoothstep(tuning.panicNearRows, tuning.panicFarRows, distance);
    const recognition = smoothstep(0.3, 0.82, age);
    const breakFade = 1 - smoothstep(breakSeconds - 0.35, breakSeconds + 0.9, age);
    const strength = proximity * recognition * breakFade;
    if (strength <= 0.001 || (best && best.strength >= strength)) continue;

    const pairSeed = mix32(Math.min(fish.seed, chaser.seed)
      ^ Math.imul(Math.max(fish.seed, chaser.seed), 0x27d4eb2f));
    const dodgeSign = (pairSeed & 1) === 0 ? -1 : 1;
    const away = safeNormalize(dx, dy, fish.vx < 0 ? -1 : 1, 0);
    const dodgePulse = Math.sin(clamp((age - 0.32) / 2.15, 0, 1) * Math.PI);
    const direction = safeNormalize(
      away.x,
      away.y * 0.72 + dodgeSign * dodgePulse * (0.42 + strength * 0.18),
      away.x,
      dodgeSign * 0.4,
    );
    const traits = traitsFromSeed(fish.seed, fish.history);
    // Evasion is a burst, not a cruise. Fleeing at a steady speed just holds
    // the gap the chaser arrived with, and a chase whose distance never changes
    // reads as two fish swimming in formation. The break comes when the chaser
    // is closest, which is what opens the gap again after every pass.
    best = {
      x: direction.x,
      y: direction.y,
      speed: tuning.evasionSpeed + traits.activity * 0.18 + proximity * tuning.evasionProximityGain,
      weight: 0.42 + strength * 0.5,
      strength,
      sourceSeed: chaser.seed,
      accelerationResponse: 2.8 + strength * 0.7,
      turningResponse: 3 + strength * 0.8,
      maximumSpeed: 0.94,
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

  let accelerationResponse = Math.max(0.01, profile.accelerationResponse ?? 1.45);
  let turningResponse = Math.max(0.01, profile.turningResponse ?? 1.5);
  let maximumSpeed = Math.max(0.02, profile.maximumSpeed ?? 0.82) * motionScale;
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
