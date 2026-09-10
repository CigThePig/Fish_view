import { scatteredDepth, spreadDepth } from "./depth.js";
import { SURFACE_Y_ROWS, substrateSurfaceY } from "./environment.js";
import { fishMouthPosition } from "./fish-motion.js";
import { environmentalCurrent, initialPlantSeeds } from "./plants.js";
import { mix32, sample01, sampleRange, sampleSigned } from "./prng.js";

const TAU = Math.PI * 2;
export const BUBBLE_POP_DURATION_SECONDS = 0.72;
export const BUBBLE_SURFACE_CLEARANCE = 0.28;

// Distance remains a world-space input because it slightly lifts the speed of
// near bubbles. Visual scale and colour are still renderer concerns.
const NEAR_BUBBLE_SPEED = 0.3;

export const BUBBLE_SIZE_CLASSES = Object.freeze({
  micro: Object.freeze({ speed: [0.24, 0.35], scale: [0.5, 0.66], wobble: [0.11, 0.2] }),
  normal: Object.freeze({ speed: [0.3, 0.47], scale: [0.53, 0.78], wobble: [0.15, 0.25] }),
  large: Object.freeze({ speed: [0.42, 0.59], scale: [0.6, 0.88], wobble: [0.2, 0.32] }),
  jumbo: Object.freeze({ speed: [0.5, 0.68], scale: [0.66, 0.96], wobble: [0.25, 0.38] }),
});

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function positiveModulo(value, modulus) {
  return ((value % modulus) + modulus) % modulus;
}

function sizeClassForSeed(seed, salt) {
  const roll = sample01(seed, salt);
  if (roll < 0.48) return "micro";
  if (roll < 0.84) return "normal";
  if (roll < 0.97) return "large";
  return "jumbo";
}

export function bubbleEmitterCount() {
  return 5;
}

function isolatedBubbleCount() {
  return 4;
}

export function bubbleWaterTop() {
  return SURFACE_Y_ROWS + BUBBLE_SURFACE_CLEARANCE;
}

function waterBottom(state, worldX) {
  return substrateSurfaceY(state, worldX) - 0.18;
}

function emitterX(state, emitterSeed, index) {
  if (index % 2 === 0 && state.plants?.length) {
    const originalSeeds = initialPlantSeeds(state.seed);
    const plantIndex = Math.floor(sample01(emitterSeed, 7) * originalSeeds.length);
    const host = state.plants.find((plant) => plant.seed === originalSeeds[plantIndex]);
    if (host) return clamp(host.x + sampleSigned(emitterSeed, 8) * 0.62, 1, state.cols - 1);
  }
  return sampleRange(emitterSeed, 9, 1.5, state.cols - 1.5);
}

export function createBubbleEmitters(state) {
  const count = bubbleEmitterCount();
  return Array.from({ length: count }, (_, index) => {
    const seed = mix32(state.seed ^ Math.imul(index + 1, 0x6c8e9cf5));
    const x = emitterX(state, seed, index);
    const burstCount = 2 + Math.floor(sample01(seed, 10) * 4);
    const period = sampleRange(seed, 11, 102, 158);
    return Object.freeze({
      id: index,
      seed,
      x,
      y: waterBottom(state, x),
      burstCount,
      burstSpacing: sampleRange(seed, 12, 0.48, 0.92),
      period,
      phase: sampleRange(seed, 13, 0, period),
    });
  });
}

function fishDisturbance(state, worldX, worldY, skipFishIndex = -1) {
  let pushX = 0;
  let lift = 0;
  for (let index = 0; index < (state.individuals?.length ?? 0); index += 1) {
    if (index === skipFishIndex) continue;
    const fish = state.individuals[index];
    const dx = worldX - fish.x;
    const dy = worldY - fish.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= 0.0001 || distance >= 2.35) continue;
    const falloff = 1 - distance / 2.35;
    pushX += (dx / distance) * falloff * (0.22 + Math.abs(fish.vx ?? 0) * 0.2);
    lift += falloff * (0.1 + Math.abs(fish.vx ?? 0) * 0.08);
  }
  return { pushX, lift: Math.min(0.36, lift) };
}

function movingBubbleWorldRecord(state, {
  id,
  seed,
  sourceX,
  sourceY,
  ageSeconds,
  sizeClass = sizeClassForSeed(seed, 20),
  speedMultiplier = 1,
  laneOffset = 0,
  kind = "stream",
  skipFishIndex = -1,
  distance = scatteredDepth(seed, 90, state.elapsedRealSeconds),
}) {
  if (ageSeconds < 0) return null;
  const top = bubbleWaterTop();
  const travel = Math.max(0.25, sourceY - top);
  const config = BUBBLE_SIZE_CLASSES[sizeClass];
  const speed = sampleRange(seed, 21, config.speed[0], config.speed[1])
    * speedMultiplier
    * (1 + distance * NEAR_BUBBLE_SPEED);
  const ascentSeconds = travel / speed;
  if (ageSeconds > ascentSeconds + BUBBLE_POP_DURATION_SECONDS) return null;

  const current = environmentalCurrent(state.seed, state.elapsedRealSeconds);
  if (ageSeconds >= ascentSeconds) {
    const progress = clamp((ageSeconds - ascentSeconds) / BUBBLE_POP_DURATION_SECONDS, 0, 1);
    return {
      id,
      seed,
      kind,
      phase: "pop",
      sizeClass,
      speed,
      progress,
      distance,
      worldX: sourceX + laneOffset + current.primary * 0.28
        + Math.sin(ageSeconds * 1.7 + sampleRange(seed, 22, 0, TAU)) * 0.08,
      worldY: top + Math.sin(progress * Math.PI) * -0.04,
    };
  }

  const progress = clamp(ageSeconds / ascentSeconds, 0, 1);
  const wobble = sampleRange(seed, 23, config.wobble[0], config.wobble[1]);
  const slowFrequency = sampleRange(seed, 24, 0.58, 1.05);
  const fastFrequency = sampleRange(seed, 25, 1.45, 2.35);
  const phaseA = sampleRange(seed, 26, 0, TAU);
  const phaseB = sampleRange(seed, 27, 0, TAU);
  let worldX = sourceX + laneOffset
    + current.primary * (0.07 + progress * 0.3)
    + current.secondary * 0.05
    + Math.sin(ageSeconds * slowFrequency + phaseA) * wobble
    + Math.sin(ageSeconds * fastFrequency + phaseB) * wobble * 0.38;
  let worldY = sourceY - travel * progress;
  const disturbance = fishDisturbance(state, worldX, worldY, skipFishIndex);
  worldX = clamp(worldX + disturbance.pushX, 0.35, state.cols - 0.35);
  worldY -= disturbance.lift;
  return {
    id,
    seed,
    kind,
    phase: "rise",
    sizeClass,
    speed,
    progress,
    distance,
    worldX,
    worldY,
  };
}

function streamBubbleRecords(state) {
  const records = [];
  for (const emitter of createBubbleEmitters(state)) {
    const clock = positiveModulo(state.elapsedRealSeconds + emitter.phase, emitter.period);
    const distance = scatteredDepth(emitter.seed, 90, state.elapsedRealSeconds);
    for (let slot = 0; slot < emitter.burstCount; slot += 1) {
      const bubbleSeed = mix32(emitter.seed ^ Math.imul(slot + 1, 0x85ebca6b));
      const launch = slot * emitter.burstSpacing + sampleRange(bubbleSeed, 30, 0, 0.2);
      const record = movingBubbleWorldRecord(state, {
        id: `bubble:stream:${emitter.id}:${slot}`,
        seed: bubbleSeed,
        sourceX: emitter.x,
        sourceY: emitter.y,
        ageSeconds: clock - launch,
        laneOffset: sampleSigned(bubbleSeed, 31) * 0.28,
        kind: "stream",
        distance,
      });
      if (record) records.push(record);
    }
  }
  return records;
}

function isolatedBubbleRecords(state) {
  const records = [];
  const top = bubbleWaterTop();
  for (let index = 0; index < isolatedBubbleCount(); index += 1) {
    const seed = mix32(state.seed ^ Math.imul(index + 1, 0x27d4eb2f));
    const sourceX = sampleRange(seed, 40, 1, state.cols - 1);
    const bottom = waterBottom(state, sourceX);
    const sourceY = top + (bottom - top) * sampleRange(seed, 41, 0.62, 0.96);
    const period = sampleRange(seed, 42, 62, 112);
    const ageSeconds = positiveModulo(
      state.elapsedRealSeconds + sampleRange(seed, 43, 0, period),
      period,
    );
    const record = movingBubbleWorldRecord(state, {
      id: `bubble:isolated:${index}`,
      seed,
      sourceX,
      sourceY,
      ageSeconds,
      speedMultiplier: 1.08,
      kind: "isolated",
    });
    if (record) records.push(record);
  }
  return records;
}

// One short-lived release per fish. After release a bubble belongs to the
// water, not to the fish's current position, size or facing.
export function tickFishExhale(fish, index, state, realDelta) {
  const seed = mix32(fish.seed ^ 0xa511e9b3);
  const interval = sampleRange(seed, 50, 32, 118);
  const clock = positiveModulo(state.elapsedRealSeconds + sampleRange(seed, 51, 0, interval), interval);
  if (clock < realDelta) {
    const mouth = fishMouthPosition(fish, state, index);
    return { ...fish, exhale: {
      x: mouth.x, y: mouth.y, startedAt: state.elapsedRealSeconds,
      distance: spreadDepth(state.seed, fish.seed, index, state.individuals.length, state.elapsedRealSeconds),
    } };
  }
  if (fish.exhale && state.elapsedRealSeconds - fish.exhale.startedAt > 4.8) {
    const { exhale, ...rest } = fish;
    return rest;
  }
  return fish;
}

function fishExhaleRecords(state) {
  const records = [];
  const count = state.individuals?.length ?? 0;
  for (let index = 0; index < count; index += 1) {
    const fish = state.individuals[index];
    if (!fish.exhale) continue;
    const { x, y, distance, startedAt } = fish.exhale;
    const seed = mix32(fish.seed ^ 0xa511e9b3);
    const clock = state.elapsedRealSeconds - startedAt;
    if (clock < 0 || clock > 4.8) continue;
    const current = environmentalCurrent(state.seed, state.elapsedRealSeconds);
    const phase = sampleRange(seed, 52, 0, TAU);
    const worldX = clamp(
      x + current.primary * 0.06 * clock
        + (Math.sin(clock * 1.8 + phase) - Math.sin(phase)) * 0.12,
      0.4,
      state.cols - 0.4,
    );
    const speed = sampleRange(seed, 53, 0.3, 0.46);
    const worldY = y - clock * speed;
    if (worldY <= bubbleWaterTop()) continue;
    records.push({
      id: `bubble:fish:${fish.seed}`,
      seed,
      kind: "fish",
      phase: "rise",
      sizeClass: sample01(seed, 54) < 0.72 ? "micro" : "normal",
      speed,
      progress: clamp(clock / 4.8, 0, 1),
      distance,
      worldX,
      worldY,
    });
  }
  return records;
}

// A press on the sand knocks trapped air loose. It is an impulse effect - the
// water was disturbed there - so it asks the impulse what it touched rather
// than re-deriving it from a global reaction's coordinates.
function touchBubbleRecords(state) {
  const records = [];
  for (const impulse of state.impulses ?? []) {
    if (impulse.contact !== "substrate") continue;
    // How hard the water was hit decides how much it lifts. A tap is a full
    // strength impulse and raises the burst it always did; the gentler ring a
    // released hold makes is a smaller puff, rather than a second full burst
    // that would read as another press.
    const burst = 3 + Math.floor(sample01(impulse.seed, 60) * 4);
    const count = Math.max(1, Math.round(burst * clamp(impulse.strength ?? 1, 0, 1)));
    const sourceY = waterBottom(state, impulse.x);
    const current = environmentalCurrent(state.seed, state.elapsedRealSeconds);
    for (let index = 0; index < count; index += 1) {
      const seed = mix32(impulse.seed ^ Math.imul(index + 1, 0xc2b2ae35));
      const ageSeconds = impulse.ageSeconds - index * sampleRange(seed, 61, 0.12, 0.24);
      if (ageSeconds < 0 || ageSeconds > impulse.durationSeconds) continue;
      const speed = sampleRange(seed, 62, 0.5, 0.76);
      records.push({
        id: `bubble:touch:${impulse.seed}:${index}`,
        seed,
        kind: "touch",
        phase: "rise",
        sizeClass: sample01(seed, 65) < 0.74 ? "micro" : "normal",
        speed,
        progress: clamp(ageSeconds / impulse.durationSeconds, 0, 1),
        distance: 1,
        worldX: clamp(
          impulse.x + sampleSigned(seed, 63) * 0.65
            + current.primary * 0.12
            + Math.sin(ageSeconds * sampleRange(seed, 64, 1.2, 2.2)) * 0.18,
          0.4,
          state.cols - 0.4,
        ),
        worldY: sourceY - ageSeconds * speed,
      });
    }
  }
  return records;
}

export function createBubbleWorldRecords(state) {
  return [
    ...streamBubbleRecords(state),
    ...isolatedBubbleRecords(state),
    ...fishExhaleRecords(state),
    ...touchBubbleRecords(state),
  ];
}

export function isInvestigableBubble(record) {
  return record?.phase === "rise"
    && (record.kind === "stream" || record.kind === "isolated" || record.kind === "touch");
}
