import { clamp } from './entities.js';
import { substrateSurfaceY } from './environment.js';
import { sample01, sampleRange } from './prng.js';

const TAU = Math.PI * 2;
const smooth = (x) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };

// Biology uses aquarium age; visible movement uses real time. No replay loop,
// event log, growing particle array, or new save fields are needed at any age.
export function habitatState(state) {
  const days = Math.max(0, state.totalDays ?? 0);
  const season = (days + sampleRange(state.seed, 12000, 0, 365)) / 365.25;
  return {
    moss: smooth(days / 210),
    meadow: smooth((days - 14) / 540),
    patina: smooth(days / 1460),
    bloom: Math.pow(Math.max(0, Math.sin(season * TAU)), 6),
    season: ((season % 1) + 1) % 1,
  };
}

export function driftwoodPath(state, index = 0) {
  const left = index === 0;
  const root = state.cols * (left ? 0.19 : 0.81);
  const width = state.cols * (left ? 0.22 : -0.15);
  return Array.from({ length: 19 }, (_, i) => {
    const u = i / 18;
    const x = root + width * u;
    return { x, y: substrateSurfaceY(state, x) - 0.08
      - Math.sin(u * Math.PI) * (left ? 2.1 : 1.35)
        * (0.92 + sample01(state.seed, 12020 + index) * 0.16)
        - Math.sin(u * Math.PI * 2) * 0.14, u };
  });
}

export function livingWorldRecords(state) {
  const time = state.elapsedRealSeconds ?? 0;
  const days = state.totalDays ?? 0;
  const records = [];
  // The first snail already lives here. A second settles in later; identities
  // and routes remain stable across saves and cannot multiply over the years.
  for (let i = 0; i < (days >= 45 ? 2 : 1); i++) {
    const seed = state.seed ^ (0x43a912 + i * 7919);
    const phase = time * sampleRange(seed, 1, 0.002, 0.0036) + sampleRange(seed, 2, 0, TAU);
    const x = state.cols * (0.5 + Math.sin(phase) * 0.4);
    records.push({ id: `snail:${i}`, kind: 'snail', seed, x,
      y: substrateSurfaceY(state, x) - 0.16, facing: Math.cos(phase) < 0 ? -1 : 1,
      pulse: Math.sin(time * 0.7 + i), visibility: 1 });
  }
  for (let i = 0; i < (days >= 100 ? 3 : days >= 7 ? 2 : 1); i++) {
    const seed = state.seed ^ (0x195dac + i * 3571);
    const phase = time * sampleRange(seed, 3, 0.018, 0.025) + sampleRange(seed, 4, 0, TAU);
    const cycle = (time / 19 + sample01(seed, 5)) % 1;
    const hop = cycle < 0.28 ? Math.sin(cycle / 0.28 * Math.PI) : 0;
    const x = state.cols * (0.5 + Math.sin(phase) * 0.37);
    records.push({ id: `shrimp:${i}`, kind: 'shrimp', seed, x,
      y: substrateSurfaceY(state, x) - 0.4 - hop * 1.35,
      facing: Math.cos(phase) < 0 ? -1 : 1, pulse: hop, visibility: 1 });
  }
  // Tufts travel through the tank, fade at the ends, and reappear at the water
  // surface on a new cycle. Their cycle ID prevents following a recycled tuft.
  for (let i = 0; i < 2; i++) {
    const seed = state.seed ^ (0x713ad5 + i * 1237);
    const duration = sampleRange(seed, 7, 84, 112);
    const clock = time + sampleRange(seed, 8, 0, duration);
    const cycle = Math.floor(clock / duration);
    const u = (clock % duration) / duration;
    const x = state.cols * (0.25 + i * 0.43) + Math.sin(time * 0.075 + i * 3) * 3.1;
    records.push({ id: `tuft:${i}:${cycle}`, kind: 'tuft', seed, x,
      y: 2 + u * (state.rows - 5), facing: 1, pulse: Math.sin(time * 0.9 + i),
      visibility: smooth(u / 0.08) * smooth((1 - u) / 0.12) });
  }
  return records;
}

// A soft guide for boids, never a position assignment. Routes change over a
// few minutes: a traveling ribbon, two shoals, then a loose milling oval.
export function schoolJourney(state, index) {
  const t = state.elapsedRealSeconds ?? 0;
  const phase = t * 0.027 + sampleRange(state.seed, 12100, 0, TAU);
  const split = smooth((Math.sin(t * 0.018 + 1.3) - 0.1) / 0.65);
  const group = index % 2 ? -1 : 1;
  const lane = ((index % 5) - 2) * 0.34;
  const angle = phase + group * split * 1.45;
  const height = state.rows - 6;
  return {
    x: state.cols * (0.5 + Math.sin(angle) * 0.30),
    y: 3 + height * (0.46 + Math.sin(angle * 2) * 0.20) + lane,
    vx: Math.cos(angle) * 0.9,
    vy: Math.cos(angle * 2) * 0.26,
    split,
    group,
  };
}
