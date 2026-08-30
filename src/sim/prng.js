export function hashSeed(value) {
  const text = String(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0 || 0x6d2b79f5;
}

export function mix32(value) {
  let result = value >>> 0;
  result ^= result >>> 16;
  result = Math.imul(result, 0x7feb352d);
  result ^= result >>> 15;
  result = Math.imul(result, 0x846ca68b);
  result ^= result >>> 16;
  return result >>> 0;
}

export function sample01(seed, salt = 0) {
  return mix32((seed >>> 0) ^ Math.imul((salt + 1) >>> 0, 0x9e3779b1)) / 0x100000000;
}

export function sampleRange(seed, salt, minimum, maximum) {
  return minimum + sample01(seed, salt) * (maximum - minimum);
}

export function sampleSigned(seed, salt) {
  return sample01(seed, salt) * 2 - 1;
}

export function nextRandom(rngState) {
  const next = (rngState + 0x6d2b79f5) >>> 0;
  let value = next;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return {
    value: ((value ^ (value >>> 14)) >>> 0) / 0x100000000,
    rngState: next,
  };
}

