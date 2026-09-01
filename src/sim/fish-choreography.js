import { clamp, traitsFromSeed } from "./entities.js";
import { mix32 } from "./prng.js";

// Activity selection says what a fish intends to do. These tiny profiles say
// how that intention should feel in motion. They are deliberately data rather
// than another state machine: distance, activity age, and target state still
// derive every short-lived phase.
const DEFAULT_CHOREOGRAPHY = Object.freeze({
  accelerationResponse: 1.45,
  turningResponse: 1.5,
  verticalSpeedScale: 0.72,
  minimumSpeed: 0.055,
  maximumSpeed: 0.82,
  approachRadius: 0,
  arrivalSpeedScale: 1,
  positionGain: 1,
  velocityMatch: 0,
  pitchScale: 1,
  pitchResponse: 3.6,
  turnDuration: 0.68,
});

const PROFILE_OVERRIDES = Object.freeze({
  cruise: Object.freeze({
    accelerationResponse: 1.2,
    turningResponse: 1.12,
    verticalSpeedScale: 0.58,
    maximumSpeed: 0.7,
    pitchScale: 0.45,
    pitchResponse: 3,
    turnDuration: 0.78,
  }),
  "open-water-wander": Object.freeze({
    accelerationResponse: 1.35,
    turningResponse: 1.45,
    verticalSpeedScale: 0.78,
    maximumSpeed: 0.74,
    approachRadius: 1.2,
    arrivalSpeedScale: 0.45,
    pitchScale: 0.68,
  }),
  "plant-investigate": Object.freeze({
    accelerationResponse: 1.25,
    turningResponse: 1.9,
    verticalSpeedScale: 0.96,
    minimumSpeed: 0.028,
    maximumSpeed: 0.52,
    approachRadius: 1.8,
    arrivalSpeedScale: 0.24,
    positionGain: 0.78,
    pitchScale: 0.72,
    turnDuration: 0.52,
  }),
  "plant-weave": Object.freeze({
    accelerationResponse: 2.05,
    turningResponse: 2.35,
    verticalSpeedScale: 1.12,
    minimumSpeed: 0.07,
    maximumSpeed: 0.76,
    approachRadius: 0.9,
    arrivalSpeedScale: 0.72,
    pitchResponse: 4.4,
    turnDuration: 0.48,
  }),
  "bubble-investigate": Object.freeze({
    accelerationResponse: 2.75,
    turningResponse: 3.15,
    verticalSpeedScale: 1.38,
    minimumSpeed: 0.075,
    maximumSpeed: 1,
    approachRadius: 2.1,
    arrivalSpeedScale: 0.32,
    positionGain: 0.92,
    pitchResponse: 5.2,
    turnDuration: 0.4,
  }),
  "surface-investigate": Object.freeze({
    accelerationResponse: 2.1,
    turningResponse: 2.2,
    verticalSpeedScale: 1.42,
    minimumSpeed: 0.035,
    maximumSpeed: 0.78,
    approachRadius: 1.4,
    arrivalSpeedScale: 0.22,
    pitchResponse: 4.8,
    turnDuration: 0.5,
  }),
  "school-follow": Object.freeze({
    accelerationResponse: 1.25,
    turningResponse: 1.5,
    verticalSpeedScale: 0.72,
    minimumSpeed: 0.04,
    maximumSpeed: 0.68,
    approachRadius: 2.6,
    arrivalSpeedScale: 0.12,
    positionGain: 0.58,
    velocityMatch: 0.72,
    pitchScale: 0.55,
    turnDuration: 0.7,
  }),
  "individual-follow": Object.freeze({
    accelerationResponse: 1.4,
    turningResponse: 1.72,
    verticalSpeedScale: 0.7,
    minimumSpeed: 0.035,
    maximumSpeed: 0.68,
    approachRadius: 2.4,
    arrivalSpeedScale: 0.1,
    positionGain: 0.66,
    velocityMatch: 0.82,
    pitchScale: 0.42,
    turnDuration: 0.62,
  }),
  "companion-cruise": Object.freeze({
    accelerationResponse: 0.92,
    turningResponse: 1.1,
    verticalSpeedScale: 0.56,
    minimumSpeed: 0.025,
    maximumSpeed: 0.56,
    approachRadius: 1.1,
    arrivalSpeedScale: 0.32,
    positionGain: 0.62,
    velocityMatch: 0.94,
    pitchScale: 0.35,
    pitchResponse: 2.7,
    turnDuration: 0.88,
  }),
  "playful-chase": Object.freeze({
    accelerationResponse: 3.25,
    turningResponse: 3.65,
    verticalSpeedScale: 1.18,
    minimumSpeed: 0.16,
    maximumSpeed: 1.04,
    approachRadius: 0.8,
    arrivalSpeedScale: 0.9,
    positionGain: 1.1,
    pitchResponse: 5.4,
    turnDuration: 0.34,
  }),
  "substrate-search": Object.freeze({
    accelerationResponse: 2.05,
    turningResponse: 1.8,
    verticalSpeedScale: 1.4,
    minimumSpeed: 0.035,
    maximumSpeed: 0.76,
    approachRadius: 1,
    arrivalSpeedScale: 0.5,
    pitchResponse: 4.7,
    turnDuration: 0.56,
  }),
  "open-water-rest": Object.freeze({
    accelerationResponse: 0.46,
    turningResponse: 0.52,
    verticalSpeedScale: 0.26,
    minimumSpeed: 0.012,
    maximumSpeed: 0.22,
    approachRadius: 2.8,
    arrivalSpeedScale: 0.08,
    positionGain: 0.38,
    pitchScale: 0.2,
    pitchResponse: 1.8,
    turnDuration: 1.2,
  }),
  "plant-shelter": Object.freeze({
    accelerationResponse: 0.5,
    turningResponse: 0.62,
    verticalSpeedScale: 0.32,
    minimumSpeed: 0.01,
    maximumSpeed: 0.24,
    approachRadius: 2.3,
    arrivalSpeedScale: 0.08,
    positionGain: 0.4,
    pitchScale: 0.25,
    pitchResponse: 1.9,
    turnDuration: 1.08,
  }),
  "touch-react": Object.freeze({
    accelerationResponse: 2.25,
    turningResponse: 2.5,
    verticalSpeedScale: 0.9,
    minimumSpeed: 0.08,
    maximumSpeed: 0.92,
    approachRadius: 1.2,
    arrivalSpeedScale: 0.35,
    pitchResponse: 4.4,
    turnDuration: 0.45,
  }),
  "arrival-enter": Object.freeze({
    accelerationResponse: 1.65,
    turningResponse: 1.5,
    verticalSpeedScale: 0.75,
    minimumSpeed: 0.08,
    maximumSpeed: 0.72,
    approachRadius: 1.3,
    arrivalSpeedScale: 0.4,
  }),
});

export const CHASE_RECOGNITION_RADIUS = 4.9;
export const CHASE_BREAK_SECONDS = 4.8;

function safeNormalize(x, y, fallbackX = 1, fallbackY = 0) {
  const length = Math.hypot(x, y);
  if (length < 0.00001) return { x: fallbackX, y: fallbackY };
  return { x: x / length, y: y / length };
}

function smoothstep(edge0, edge1, value) {
  const amount = clamp((value - edge0) / Math.max(0.00001, edge1 - edge0), 0, 1);
  return amount * amount * (3 - 2 * amount);
}

export function choreographyFor(activity, overrides = {}) {
  return {
    ...DEFAULT_CHOREOGRAPHY,
    ...(PROFILE_OVERRIDES[activity] ?? {}),
    ...overrides,
  };
}

export function chasePhase(ageRealSeconds, distance) {
  const age = Math.max(0, Number.isFinite(ageRealSeconds) ? ageRealSeconds : 0);
  if (age >= CHASE_BREAK_SECONDS) return "break";
  if (age < 0.65 || distance > CHASE_RECOGNITION_RADIUS) return "approach";
  return "pursuit";
}

// The chased fish keeps its own biological behavior and activity. This derived
// steering influence lasts only while a nearby companion is visibly chasing
// it, so saves never need an evade flag and a broken target cannot strand it.
export function chaseEvasionForFish(fish, state) {
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
    if (!Number.isFinite(distance) || distance > CHASE_RECOGNITION_RADIUS + 0.18) continue;

    const proximity = 1 - smoothstep(CHASE_RECOGNITION_RADIUS - 0.55, CHASE_RECOGNITION_RADIUS + 0.18, distance);
    const recognition = smoothstep(0.3, 0.82, age);
    const breakFade = 1 - smoothstep(CHASE_BREAK_SECONDS - 0.35, CHASE_BREAK_SECONDS + 0.9, age);
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
    best = {
      x: direction.x,
      y: direction.y,
      speed: 0.58 + traits.activity * 0.2 + strength * 0.1,
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
  const steeredDirection = safeNormalize(
    currentDirection.x + (desiredDirection.x - currentDirection.x) * turnEase,
    currentDirection.y + (desiredDirection.y - currentDirection.y) * turnEase,
    desiredDirection.x,
    desiredDirection.y,
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
