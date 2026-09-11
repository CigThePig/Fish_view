import { clamp } from './entities.js';
import { groundY, woodDepth } from './habitat-depth.js';
import { impulseFlowAt, impulsePressureAt } from './interaction-events.js';
import { sample01, sampleRange } from './prng.js';

const TAU = Math.PI * 2;
const smooth = (x) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };

/*
 * What the small residents do about water that is moving.
 *
 * All of it is read off the live impulses and nothing is stored: a shrimp's
 * bolt and a snail's retraction are shapes over the disturbance's own envelope,
 * which rises and falls, so the animal leaves and comes back without anybody
 * remembering that it went. That is the whole reason these are cheap enough to
 * give to ambient residents at all - the plan's "do not promote ambient
 * residents into full persistent drive-based agents" is not a warning here, it
 * is the implementation.
 */

// Below this the water is merely moving; above it, it is happening to you.
const RESIDENT_ALARM_PRESSURE = 0.22;
// A shrimp's bolt: how far it gets, sideways and up, at full alarm. It is a
// hop of the same order as the one it already makes on its own cycle, so a
// startled shrimp reads as a shrimp rather than as a new animal.
const SHRIMP_ESCAPE_CELLS = 2.6;
const SHRIMP_ESCAPE_ROWS = 1.15;
// A snail cannot bolt. It stops, pulls its foot in, and sits lower - which is
// most of a centimetre on this panel and is exactly as much as a snail should
// ever do about anything.
const SNAIL_RETRACT_ROWS = 0.22;
// How far drifting matter is carried by moving water. Tufts and dust have even
// less say in the matter than bubbles do, which is what makes them the cheapest
// way to see a current that is otherwise invisible.
const DRIFT_FLOW_CELLS = 2.2;

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
    return { x, y: groundY(state, x, woodDepth(index)) - 0.08
      - Math.sin(u * Math.PI) * (left ? 2.1 : 1.35)
        * (0.92 + sample01(state.seed, 12020 + index) * 0.16)
        - Math.sin(u * Math.PI * 2) * 0.14, u };
  });
}

/** How alarming the water is here, 0..1, above the threshold worth answering. */
function alarmAt(state, x, y) {
  const pressure = impulsePressureAt(state, x, y, { flat: true });
  if (pressure <= RESIDENT_ALARM_PRESSURE) return 0;
  return clamp((pressure - RESIDENT_ALARM_PRESSURE) / (1 - RESIDENT_ALARM_PRESSURE), 0, 1);
}

/**
 * Which way is away. Directed water carries; a shock from a point is fled from,
 * and `fallback` is which way to go when the disturbance is exactly on top.
 */
function escapeDirection(state, x, y, fallback) {
  let best = null;
  for (const impulse of state.impulses ?? []) {
    const distance = Math.hypot(x - impulse.x, y - impulse.y);
    if (distance >= impulse.radius) continue;
    if (!best || distance < best.distance) best = { impulse, distance };
  }
  if (!best) return 0;
  if (best.impulse.dirX) return Math.sign(best.impulse.dirX);
  const dx = x - best.impulse.x;
  return dx === 0 ? fallback : Math.sign(dx);
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
    const depth = sampleRange(seed, 19, 0.12, 0.85);
    const restY = groundY(state, x, depth) - 0.16;
    // Retraction: the foot comes in, the shell sits down, and the slow rock it
    // travels with stops for as long as the water is moving over it.
    const alarm = alarmAt(state, x, restY);
    records.push({ id: `snail:${i}`, kind: 'snail', seed, x, depth,
      y: restY + alarm * SNAIL_RETRACT_ROWS, facing: Math.cos(phase) < 0 ? -1 : 1,
      pulse: Math.sin(time * 0.7 + i) * (1 - alarm), alarm, visibility: 1 });
  }
  for (let i = 0; i < (days >= 100 ? 3 : days >= 7 ? 2 : 1); i++) {
    const seed = state.seed ^ (0x195dac + i * 3571);
    const phase = time * sampleRange(seed, 3, 0.018, 0.025) + sampleRange(seed, 4, 0, TAU);
    const cycle = (time / 19 + sample01(seed, 5)) % 1;
    const hop = cycle < 0.28 ? Math.sin(cycle / 0.28 * Math.PI) : 0;
    const restX = state.cols * (0.5 + Math.sin(phase) * 0.37);
    const depth = sampleRange(seed, 19, 0.08, 0.88);
    const restY = groundY(state, restX, depth) - 0.4 - hop * 1.35;
    // The escape hop. Away from the disturbance, over its envelope, and back
    // when the water settles - a shrimp that has been startled is not a shrimp
    // that has moved house.
    const alarm = alarmAt(state, restX, restY);
    const away = restX >= (state.cols / 2) ? 1 : -1;
    const escapeX = alarm * SHRIMP_ESCAPE_CELLS * escapeDirection(state, restX, restY, away);
    const x = clamp(restX + escapeX, 0.6, state.cols - 0.6);
    records.push({ id: `shrimp:${i}`, kind: 'shrimp', seed, x, depth,
      y: restY - alarm * SHRIMP_ESCAPE_ROWS,
      facing: escapeX ? (escapeX < 0 ? -1 : 1) : Math.cos(phase) < 0 ? -1 : 1,
      pulse: Math.max(hop, alarm), alarm, visibility: 1 });
  }
  // Tufts travel through the tank, fade at the ends, and reappear at the water
  // surface on a new cycle. Their cycle ID prevents following a recycled tuft.
  for (let i = 0; i < 2; i++) {
    const seed = state.seed ^ (0x713ad5 + i * 1237);
    const duration = sampleRange(seed, 7, 84, 112);
    const clock = time + sampleRange(seed, 8, 0, duration);
    const cycle = Math.floor(clock / duration);
    const u = (clock % duration) / duration;
    const driftX = state.cols * (0.25 + i * 0.43) + Math.sin(time * 0.075 + i * 3) * 3.1;
    const driftY = 2 + u * (state.rows - 5);
    // Lightweight matter is the cheapest thing in the aquarium to see an
    // invisible current through: a tuft carried sideways by a drag says what
    // the water did far more plainly than the water itself can.
    const flow = impulseFlowAt(state, driftX, driftY);
    records.push({ id: `tuft:${i}:${cycle}`, kind: 'tuft', seed,
      x: clamp(driftX + flow.x * DRIFT_FLOW_CELLS, 0.4, state.cols - 0.4),
      depth: sampleRange(seed, 19, 0.15, 0.85),
      y: clamp(driftY + flow.y * DRIFT_FLOW_CELLS, 1, state.rows - 1), facing: 1,
      pulse: Math.sin(time * 0.9 + i),
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
