import { individualSprites } from "../art/sprites.js";
import { SUBSTRATE_ROWS, WATERLINE_ROWS } from "./config.js";
import { mix32, sample01, sampleRange, sampleSigned } from "./prng.js";

export function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function traitsFromSeed(seed, history = { boldnessDrift: 0, sociabilityDrift: 0 }) {
  return Object.freeze({
    boldness: clamp(sampleRange(seed, 1, 0.2, 0.82) + (history.boldnessDrift ?? 0), 0.12, 0.95),
    sociability: clamp(sampleRange(seed, 2, 0.18, 0.88) + (history.sociabilityDrift ?? 0), 0.12, 0.95),
    activity: sampleRange(seed, 3, 0.28, 0.9),
    preferredDepth: sampleRange(seed, 4, 0.2, 0.8),
    curiosity: sampleRange(seed, 5, 0.2, 0.94),
  });
}

export function spriteForSeed(seed) {
  return individualSprites[seed % individualSprites.length];
}

export function createSchoolFish(baseSeed, index, cols, rows) {
  const seed = mix32(baseSeed ^ Math.imul(index + 1, 0x9e3779b1));
  const waterHeight = rows - WATERLINE_ROWS - SUBSTRATE_ROWS;
  const angle = sampleRange(seed, 3, -0.28, 0.28) + (sample01(seed, 4) > 0.5 ? 0 : Math.PI);
  const speed = sampleRange(seed, 5, 0.65, 1.25);
  return {
    x: sampleRange(seed, 1, 1, cols - 1),
    y: sampleRange(seed, 2, WATERLINE_ROWS + 1, WATERLINE_ROWS + waterHeight - 1),
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
  };
}

export function createIndividual(baseSeed, index, cols, rows) {
  const seed = mix32(baseSeed ^ Math.imul(index + 17, 0x85ebca6b));
  const sprite = spriteForSeed(seed);
  const height = sprite.shape.length;
  const waterBottom = rows - SUBSTRATE_ROWS;
  const middleTop = WATERLINE_ROWS + 2;
  const middleBottom = Math.max(middleTop + 1, waterBottom - height - 1);
  const y = index < 3
    ? sampleRange(seed, 6, middleTop, middleTop + (middleBottom - middleTop) * 0.62)
    : sampleRange(seed, 6, WATERLINE_ROWS + 0.5, middleBottom);
  const direction = sample01(seed, 7) > 0.5 ? 1 : -1;

  return {
    seed,
    x: sampleRange(seed, 8, 4, Math.max(5, cols - 5)),
    y,
    vx: direction * sampleRange(seed, 9, 0.18, 0.48),
    vy: sampleSigned(seed, 10) * 0.08,
    drives: {
      hunger: sampleRange(seed, 11, 0.28, 0.68),
      energy: sampleRange(seed, 12, 0.34, 0.82),
      social: sampleRange(seed, 13, 0.2, 0.72),
    },
    history: {
      touches: 0,
      boldnessDrift: 0,
      sociabilityDrift: 0,
      socialMemory: [],
    },
    behavior: {
      current: "cruise",
      previous: "cruise",
      blend: 1,
      ageSeconds: sampleRange(seed, 14, 0, 40),
    },
    activity: {
      current: "cruise",
      previous: "cruise",
      ageRealSeconds: sampleRange(seed, 15, 0, 12),
      targetType: null,
      targetId: null,
      targetX: null,
      targetY: null,
    },
    visual: {
      facing: direction,
      targetFacing: direction,
      turnProgress: 1,
      pitch: 0,
      targetPitch: 0,
    },
  };
}
