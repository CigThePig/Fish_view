import { mix32, sample01, sampleRange } from "./prng.js";
import { traitsFromSeed } from "./entities.js";

export const AFFINITY_KEYS = Object.freeze([
  "bubble",
  "plant",
  "school",
  "glass",
  "wander",
  "surface",
  "shelter",
  "substrate",
]);

// The first three fish retain Phase 1's permanent mid-water capability limits.
// Their strongest accents therefore come from interests every member of the
// cast can express. Surface and substrate still vary meaningfully, but are kept
// below the three signature bands so an inaccessible activity never defines a
// protected fish's personality.
const UNIVERSAL_SIGNATURE_KEYS = Object.freeze([
  "bubble",
  "plant",
  "school",
  "glass",
  "wander",
  "shelter",
]);

export const MAX_SOCIAL_MEMORY = 2;

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function affinitySalt(key) {
  return 7000 + AFFINITY_KEYS.indexOf(key) * 17;
}

export function affinitiesFromSeed(seed) {
  const numericSeed = seed >>> 0;
  const affinities = Object.fromEntries(AFFINITY_KEYS.map((key) => [
    key,
    key === "surface" || key === "substrate"
      ? sampleRange(numericSeed, affinitySalt(key), 0.18, 0.68)
      : sampleRange(numericSeed, affinitySalt(key), 0.28, 0.62),
  ]));

  const ranking = [...UNIVERSAL_SIGNATURE_KEYS].sort((left, right) => {
    const difference = sample01(numericSeed, affinitySalt(right) + 1)
      - sample01(numericSeed, affinitySalt(left) + 1);
    return difference || left.localeCompare(right);
  });
  const signatureCount = sample01(numericSeed, 7199) < 0.52 ? 2 : 3;
  const signatureRanges = [[0.88, 0.96], [0.8, 0.9], [0.74, 0.84]];
  for (let index = 0; index < signatureCount; index += 1) {
    const key = ranking[index];
    const [minimum, maximum] = signatureRanges[index];
    affinities[key] = sampleRange(numericSeed, affinitySalt(key) + 2, minimum, maximum);
  }

  // Suppressing two weak interests is as important as accenting the strong
  // ones: it prevents six statistically beige fish whose only difference is a
  // few hundredths in utility.
  const weak = ranking.slice(-2);
  affinities[weak[0]] = sampleRange(numericSeed, affinitySalt(weak[0]) + 3, 0.12, 0.24);
  affinities[weak[1]] = sampleRange(numericSeed, affinitySalt(weak[1]) + 3, 0.18, 0.3);

  return Object.freeze(affinities);
}

export function topAffinities(seed, count = 3) {
  const affinities = affinitiesFromSeed(seed);
  return AFFINITY_KEYS
    .map((key) => ({ key, value: affinities[key] }))
    .sort((left, right) => right.value - left.value || left.key.localeCompare(right.key))
    .slice(0, clamp(Math.round(count), 0, AFFINITY_KEYS.length));
}

export function pairCompatibility(leftSeed, rightSeed) {
  const left = leftSeed >>> 0;
  const right = rightSeed >>> 0;
  if (left === right) return 0;
  const lower = Math.min(left, right);
  const upper = Math.max(left, right);
  const seed = mix32(lower ^ Math.imul(upper, 0x9e3779b1));
  return sampleRange(seed, 7300, 0.24, 0.92);
}

function validSeed(value) {
  return Number.isSafeInteger(value) && value >= 0 && value <= 0xffffffff;
}

export function sanitizeSocialMemory(memory, selfSeed, availableSeeds = null) {
  if (!Array.isArray(memory)) return [];
  const allowed = availableSeeds instanceof Set ? availableSeeds : null;
  const bySeed = new Map();
  for (const entry of memory) {
    if (!entry || !validSeed(entry.seed) || entry.seed === (selfSeed >>> 0)) continue;
    const seed = entry.seed >>> 0;
    if (allowed && !allowed.has(seed)) continue;
    if (!Number.isFinite(entry.familiarity)) continue;
    const familiarity = clamp(entry.familiarity, 0, 1);
    bySeed.set(seed, Math.max(bySeed.get(seed) ?? 0, familiarity));
  }
  return [...bySeed.entries()]
    .map(([seed, familiarity]) => ({ seed, familiarity }))
    .sort((left, right) => right.familiarity - left.familiarity || left.seed - right.seed)
    .slice(0, MAX_SOCIAL_MEMORY);
}

export function familiarityFor(fish, companionSeed) {
  const entry = fish.history?.socialMemory?.find((memory) => memory.seed === (companionSeed >>> 0));
  return clamp(Number.isFinite(entry?.familiarity) ? entry.familiarity : 0, 0, 1);
}

function targetsFish(fish, otherSeed) {
  return fish.activity?.targetType === "fish" && fish.activity.targetId === (otherSeed >>> 0);
}

function addFamiliarity(fish, otherSeed, increment, availableSeeds) {
  const memory = sanitizeSocialMemory(fish.history?.socialMemory, fish.seed, availableSeeds);
  const existing = memory.find((entry) => entry.seed === otherSeed);
  if (existing) {
    existing.familiarity = clamp(existing.familiarity + increment, 0, 1);
  } else if (memory.length < MAX_SOCIAL_MEMORY) {
    memory.push({ seed: otherSeed, familiarity: clamp(increment, 0, 1) });
  } else {
    const weakest = memory.at(-1);
    // Very weak incidental acquaintances can still be displaced early. Once
    // familiarity becomes meaningful, the bounded memory remains stable.
    if (weakest.familiarity < 0.06
      && pairCompatibility(fish.seed, otherSeed) > pairCompatibility(fish.seed, weakest.seed) + 0.08) {
      memory[memory.length - 1] = { seed: otherSeed, familiarity: clamp(increment, 0, 1) };
    }
  }
  memory.sort((left, right) => right.familiarity - left.familiarity || left.seed - right.seed);
  return {
    ...fish,
    history: {
      ...fish.history,
      socialMemory: memory.slice(0, MAX_SOCIAL_MEMORY),
    },
  };
}

// Relationship learning is a bounded post-pass over at most eight fish. It is
// deliberately real-time: accelerated biology cannot manufacture hours of
// friendship from a pair that was only visibly close for one rendered frame.
export function updateSocialMemories(individuals, realDelta) {
  const delta = clamp(Number.isFinite(realDelta) ? realDelta : 0, 0, 0.25);
  const availableSeeds = new Set(individuals.map((fish) => fish.seed >>> 0));
  let result = individuals.map((fish) => ({
    ...fish,
    history: {
      ...fish.history,
      socialMemory: sanitizeSocialMemory(fish.history?.socialMemory, fish.seed, availableSeeds),
    },
  }));
  if (delta <= 0) return result;

  for (let leftIndex = 0; leftIndex < result.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < result.length; rightIndex += 1) {
      const left = result[leftIndex];
      const right = result[rightIndex];
      const distance = Math.hypot(left.x - right.x, left.y - right.y);
      if (!Number.isFinite(distance) || distance >= 3.8) continue;
      const closeness = 1 - distance / 3.8;
      const deliberate = targetsFish(left, right.seed) || targetsFish(right, left.seed);
      const restingTogether = left.behavior?.current === "rest" && right.behavior?.current === "rest";
      const visibleBonus = deliberate ? 1 : restingTogether ? 0.45 : 0;
      const baseIncrement = delta * (0.00075 + visibleBonus * 0.00115) * closeness;
      const leftIncrement = baseIncrement * (0.62 + traitsFromSeed(left.seed, left.history).sociability * 0.38);
      const rightIncrement = baseIncrement * (0.62 + traitsFromSeed(right.seed, right.history).sociability * 0.38);
      result[leftIndex] = addFamiliarity(result[leftIndex], right.seed >>> 0, leftIncrement, availableSeeds);
      result[rightIndex] = addFamiliarity(result[rightIndex], left.seed >>> 0, rightIncrement, availableSeeds);
    }
  }
  return result;
}
