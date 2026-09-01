import { MIN_BEHAVIOR_REAL_SECONDS, SUBSTRATE_ROWS, WATERLINE_ROWS } from "./config.js";
import { initialFishAgeDays, speciesForSeed } from "./fish-growth.js";
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

// The fish's species, which is also the artwork it is drawn from once it has
// finished growing. Anything measuring or drawing a *live* fish wants
// spriteForFish() instead: until then the fish is at one of its earlier growth
// stages and is smaller than this.
export function spriteForSeed(seed) {
  return speciesForSeed(seed);
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

// Individual identity is a pure function of the aquarium seed and a creation
// ordinal. Exposing it separately is what lets Phase 3 name a fish that has not
// arrived yet without rerolling, or even constructing, the initial cast.
// mix32 is a bijection over uint32 and `index + 17` scaled by an odd multiplier
// is injective, so two different ordinals can never collide.
export function individualSeedFor(baseSeed, index) {
  return mix32((baseSeed >>> 0) ^ Math.imul((index + 17) >>> 0, 0x85ebca6b));
}

export function createIndividual(baseSeed, index, cols, rows) {
  return createIndividualFromSeed(individualSeedFor(baseSeed, index), index, cols, rows);
}

// `options` only overrides the entry pose of a fish that swims in from an
// aquarium edge. Everything that makes the fish itself - traits, affinities,
// sprite, preferred depth, empty learned history - still comes from the seed,
// so an arrival is an ordinary persistent individual from its first frame.
export function createIndividualFromSeed(rawSeed, index, cols, rows, options = {}) {
  const seed = rawSeed >>> 0;
  // Vertical placement is measured against the fish this individual will grow
  // into, so a fry does not drift out of the band its adult form belongs to as
  // it develops.
  const sprite = spriteForSeed(seed);
  const height = sprite.shape.length;
  const waterBottom = rows - SUBSTRATE_ROWS;
  const middleTop = WATERLINE_ROWS + 2;
  const middleBottom = Math.max(middleTop + 1, waterBottom - height - 1);
  const y = index < 3
    ? sampleRange(seed, 6, middleTop, middleTop + (middleBottom - middleTop) * 0.62)
    : sampleRange(seed, 6, WATERLINE_ROWS + 0.5, middleBottom);
  const seededDirection = sample01(seed, 7) > 0.5 ? 1 : -1;
  const vx = Number.isFinite(options.vx) ? options.vx : seededDirection * sampleRange(seed, 9, 0.18, 0.48);
  const direction = vx < 0 ? -1 : 1;

  return {
    seed,
    // Aquarium days lived, not days since the app was installed. Growth reads
    // it, the shared history resolver advances it, and persistence keeps it.
    ageDays: Number.isFinite(options.ageDays) ? Math.max(0, options.ageDays) : initialFishAgeDays(seed),
    x: Number.isFinite(options.x) ? options.x : sampleRange(seed, 8, 4, Math.max(5, cols - 5)),
    y: Number.isFinite(options.y) ? options.y : y,
    vx,
    vy: Number.isFinite(options.vy) ? options.vy : sampleSigned(seed, 10) * 0.08,
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
    behavior: options.behavior ?? {
      current: "cruise",
      previous: "cruise",
      blend: 1,
      ageSeconds: sampleRange(seed, 14, 0, 40),
      ageRealSeconds: sampleRange(seed, 16, 0, MIN_BEHAVIOR_REAL_SECONDS),
    },
    activity: options.activity ?? {
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
