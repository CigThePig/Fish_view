/*
 * The shape of a gesture, in six points.
 *
 * Until now a contact was a place: `applyTouch` recorded where a finger landed
 * and `applyContact` said it was still there. Where it had *been* was nowhere -
 * movement moved the contact and nothing else, and a finger drawn across the
 * glass was a hold that had disqualified itself.
 *
 * This is the memory that gives motion meaning, and the whole of it is the
 * cap. A gesture may last ninety seconds; the record of it is six samples,
 * spaced by time rather than by frame, with the newest one kept live. Six is
 * enough to estimate the four things the plan asks for - where the finger is,
 * which way it is going, how fast, and how sharply it is turning - and it does
 * not grow by one sample if the viewer drags for an hour. That is the point:
 * this device runs for months, and a path history that grows with the gesture
 * is the classic way to leak on one.
 *
 * Two conventions worth knowing before reading anything below.
 *
 * **Speed is visual, direction is not.** A cell is 12 px wide and 24 px tall,
 * so a finger crossing ten rows has travelled twice as far on the glass as one
 * crossing ten columns, and a classifier that could not tell them apart would
 * call a slow vertical drag a swipe. Distances and speeds here are therefore in
 * *column-widths*, with rows counted double (`ROW_ASPECT`). Directions are
 * plain unit vectors in cell space, because every consumer of one adds it to a
 * world coordinate.
 *
 * **Nothing here reads a clock.** The caller owns the seconds, exactly as it
 * owns the hold clock, so replaying the same numbers replays the same gesture.
 */

import { CELL_HEIGHT, CELL_WIDTH } from "./config.js";

// How much of a column a row is worth when measuring how far a finger moved.
export const ROW_ASPECT = CELL_HEIGHT / CELL_WIDTH;

// The cap. Six samples is two thirds of a second of history at the ten frames a
// second the aquarium ticks at - long enough that a fish can chase where the
// finger *was*, short enough that a curve is still one curve.
export const PATH_SAMPLES = 6;

// The spacing between samples. Slightly under a tick, so a caller running at
// ten frames a second records every frame and a caller running at thirty
// records every third one: the window covers the same half second either way,
// rather than however many frames the platform happens to produce.
export const PATH_SAMPLE_SECONDS = 0.09;

// How far back the path remembers, in seconds. The cap on the number of samples
// bounds the memory; this bounds the *meaning* of it. Without it the window is
// however long the caller's frames happen to be, so a lab or a device that
// confirms a contact four times a second would describe a finger by where it was
// a second and a half ago and call a stopped drag fast. Two samples are always
// kept however old they are, because a path of one point has no motion in it at
// all and a slow caller would never see a drag.
export const PATH_MEMORY_SECONDS = PATH_SAMPLES * PATH_SAMPLE_SECONDS;

// The speed bands, in column-widths a second, with the gap between them
// deliberately wide. A drag across half the tank in three seconds is 11; the
// same path in three tenths of a second is 110. Human movement in between does
// not flip between the two meanings, because leaving `swipe` needs a slower
// finger than entering it did - the hysteresis the plan asks for instead of an
// exact threshold.
export const SWIPE_ENTER_SPEED = 34;
export const SWIPE_EXIT_SPEED = 20;

export const GESTURES = Object.freeze({
  // A finger that has not left the allowance around where it landed: a tap, or
  // a hold. Phase 3 owns everything about this one.
  press: "press",
  // A moving point of interest.
  drag: "drag",
  // Water being pushed.
  swipe: "swipe",
});

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

/** How far apart two points are on the glass, in column-widths. */
export function visualDistance(dx, dy) {
  return Math.hypot(dx, dy * ROW_ASPECT);
}

function sample(x, y, seconds) {
  return Object.freeze({ x: round(x), y: round(y), seconds: round(seconds) });
}

/** The path a press starts with: one point, where the finger landed. */
export function createPointerPath(x, y, seconds = 0) {
  return Object.freeze([sample(x, y, seconds)]);
}

/**
 * The path with the finger's current position in it.
 *
 * The newest sample is always live - it is replaced in place until it is old
 * enough to keep - so direction and speed are read from where the finger is
 * this frame rather than from where it was when the last sample was cut. Once a
 * sample is kept, the oldest is dropped if that would take the path past the
 * cap. The array is frozen and replaced rather than mutated, like every other
 * piece of simulation state.
 */
export function extendPointerPath(path, x, y, seconds) {
  const previous = path?.length ? path : null;
  if (!previous) return createPointerPath(x, y, seconds);
  const head = previous[previous.length - 1];
  const next = sample(x, y, seconds);
  // Time can only go forwards. A caller that hands back an earlier second - a
  // replay rewinding, a clock corrected under us - would otherwise leave a path
  // whose span is negative and whose speed is meaningless.
  if (next.seconds < head.seconds) return createPointerPath(x, y, seconds);

  // The newest sample is provisional: it is replaced in place until it is far
  // enough from the one *before* it to be worth keeping, and only then does it
  // become part of the history and a new provisional one take over. Measuring
  // that gap against the provisional sample instead is the way to write a path
  // that never grows at all - a caller confirming a contact faster than the
  // spacing would push the head's own timestamp forwards every frame and the
  // gap would never open, which is a path of one point and a finger with no
  // speed however hard it is moving.
  const reference = previous.length > 1 ? previous[previous.length - 2] : null;
  if (reference && next.seconds - reference.seconds < PATH_SAMPLE_SECONDS) {
    return Object.freeze([...previous.slice(0, -1), next]);
  }
  const capped = previous.length >= PATH_SAMPLES ? previous.slice(previous.length - PATH_SAMPLES + 1) : previous;
  let first = 0;
  while (first < capped.length - 1 && next.seconds - capped[first].seconds > PATH_MEMORY_SECONDS) first += 1;
  return Object.freeze([...capped.slice(first), next]);
}

/**
 * Where the finger is going, how fast, and how sharply it is turning.
 *
 * Speed is measured along the path rather than across it, so a finger scrubbing
 * back and forth is fast even though it is going nowhere - which is what it
 * feels like to the water. Direction is the net displacement over the window,
 * so the same scrubbing has no strong direction, which is also true.
 */
export function pathMotion(path) {
  const still = { speed: 0, dirX: 0, dirY: 0, curvature: 0, spanSeconds: 0, travelled: 0 };
  if (!path || path.length < 2) return still;
  const head = path[path.length - 1];
  const tail = path[0];
  const spanSeconds = head.seconds - tail.seconds;
  if (spanSeconds <= 0) return still;

  let travelled = 0;
  for (let index = 1; index < path.length; index += 1) {
    travelled += visualDistance(path[index].x - path[index - 1].x, path[index].y - path[index - 1].y);
  }

  const dx = head.x - tail.x;
  const dy = head.y - tail.y;
  const length = Math.hypot(dx, dy);
  // A path with length but no net displacement has a direction of nothing,
  // which is the honest answer for a finger that came back to where it started.
  const dirX = length > 0.0001 ? dx / length : 0;
  const dirY = length > 0.0001 ? dy / length : 0;

  return {
    speed: travelled / spanSeconds,
    dirX,
    dirY,
    curvature: pathCurvature(path),
    spanSeconds,
    travelled,
  };
}

/**
 * How far the finger turned across the window, in radians.
 *
 * The angle between where the first half of the path was heading and where the
 * second half was: zero for a straight line, about a right angle for a hooked
 * drag, and near π for a finger that doubled back. Measured on halves rather
 * than on every joint because six samples of a human finger have noise in them
 * and the reading is used to decide a fish's temperament, not to draw anything.
 */
export function pathCurvature(path) {
  if (!path || path.length < 3) return 0;
  const middle = Math.floor((path.length - 1) / 2);
  const first = { x: path[middle].x - path[0].x, y: (path[middle].y - path[0].y) * ROW_ASPECT };
  const second = {
    x: path[path.length - 1].x - path[middle].x,
    y: (path[path.length - 1].y - path[middle].y) * ROW_ASPECT,
  };
  const firstLength = Math.hypot(first.x, first.y);
  const secondLength = Math.hypot(second.x, second.y);
  if (firstLength < 0.001 || secondLength < 0.001) return 0;
  const cosine = clamp(
    (first.x * second.x + first.y * second.y) / (firstLength * secondLength),
    -1,
    1,
  );
  return Math.acos(cosine);
}

/**
 * Where the finger was this many seconds ago, interpolated between samples.
 *
 * This is what a fish chasing a drag actually aims at: not the fingertip, which
 * would be a cursor with a fish attached, but the water it went through. Beyond
 * the window the oldest sample is the answer, because that is as far back as
 * this aquarium remembers and pretending otherwise would invent a trail.
 */
export function pathPointBefore(path, secondsBack) {
  if (!path?.length) return null;
  const head = path[path.length - 1];
  const wanted = head.seconds - Math.max(0, secondsBack);
  if (wanted >= head.seconds || path.length < 2) return { x: head.x, y: head.y };
  for (let index = path.length - 1; index > 0; index -= 1) {
    const later = path[index];
    const earlier = path[index - 1];
    if (wanted >= earlier.seconds) {
      const span = later.seconds - earlier.seconds;
      const progress = span > 0 ? (wanted - earlier.seconds) / span : 0;
      return {
        x: earlier.x + (later.x - earlier.x) * progress,
        y: earlier.y + (later.y - earlier.y) * progress,
      };
    }
  }
  return { x: path[0].x, y: path[0].y };
}

/**
 * Which of the two moving gestures this is.
 *
 * Bands rather than a threshold, and the band you are in decides which one you
 * have to cross: a finger already swiping stays a swipe until it drops under
 * `SWIPE_EXIT_SPEED`, so a hand slowing through the boundary does not change
 * the meaning of the gesture four times on the way. `previous` is what this
 * contact was last frame; a press that has only just started moving has none.
 */
export function classifyGesture(previous, speed) {
  const wasSwipe = previous === GESTURES.swipe;
  if (wasSwipe) return speed >= SWIPE_EXIT_SPEED ? GESTURES.swipe : GESTURES.drag;
  return speed >= SWIPE_ENTER_SPEED ? GESTURES.swipe : GESTURES.drag;
}
