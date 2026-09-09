/*
 * Stimuli and impulses: what the aquarium perceives, and what it is physically
 * disturbed by.
 *
 * Before Stage 2 there was one `state.reaction` - a point, an age and a
 * duration - and every consumer read it directly: the school steered at it, all
 * fifteen fish were forced into `touch-react` by it, plants bent away from it,
 * the substrate released bubbles under it, and the renderer drew a ripple on
 * it. One tap, one object, one meaning. Nothing else could ever be a source of
 * interest, and nothing could be perceived without also being shoved.
 *
 * This is the replacement, and the distinction it draws is the point of it:
 *
 * **A stimulus is something an inhabitant can notice.** It has a position, an
 * intensity, a radius it carries over and a life. A fish can attend to one,
 * ignore one, or watch it from a distance, and none of that requires the water
 * to move.
 *
 * **An impulse is the water actually being disturbed.** Plants bend in it,
 * bubbles are shaken loose by it and the surface rings from it, and none of
 * that requires anything to have a behaviour, an opinion or a nervous system.
 *
 * A tap creates one of each, which is why the two look redundant today. They
 * stop looking redundant in Phase 2, where a fish decides what a stimulus is
 * worth, and in Phase 5, where a fish's own body makes an impulse that no one
 * is watching.
 *
 * Everything here is transient. Events are never serialised - a stimulus that
 * survived a reload would replay a gesture from last week - they are capped,
 * they expire the moment they are older than their duration, and near-repeats
 * coalesce rather than accumulate. The caps are the contract: this device runs
 * for months, and an interaction list that grows is a leak with a nice name.
 */

import { TOUCH_FLOOR_ROWS } from "./config.js";
import { mix32 } from "./prng.js";

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

// Hard caps. Six is more concurrent sources than a pair of hands can produce on
// a seven-inch panel, and every later phase - held presence, drag, causal
// chains - spends events out of this budget rather than raising it.
export const MAX_STIMULI = 6;
export const MAX_IMPULSES = 6;

// The tap, unchanged: the 3.2 seconds the old global reaction lived for.
export const TOUCH_SECONDS = 3.2;

// How far a touch impulse moves water. The plant bend used to hard-code this
// same 7.5 cells; it belongs to the event, not to the plants.
export const TOUCH_IMPULSE_RADIUS_CELLS = 7.5;

// How far a tap carries as something to notice: about half the tank. Phase 1
// set this to the whole aquarium, which is why one tap reached all fifteen
// fish; Phase 2 gives it a distance, so a press in one corner is a local event
// and the fish at the far end are simply somewhere else. A fish beyond it gets
// no response role at all - except for the guarantee in src/sim/attention.js,
// which hands the nearest fish the event when nobody else caught it.
export const TOUCH_STIMULUS_RADIUS_CELLS = 30;

// A second press this close to a live one of the same kind is the same gesture
// continuing, not a new event: it refreshes the one that is there instead of
// spending another slot. It is also what keeps a child drumming on the glass
// from filling the cap in half a second.
export const COALESCE_RADIUS_CELLS = 1.2;

// Event identity has to be stable while an event lives and unique between
// events, and it must not grow without bound over months of touching. A
// wrapping counter gives both: ids repeat only after 65 536 interactions, by
// which time every event that carried an earlier one has been gone for hours.
const SEQUENCE_MODULO = 0x10000;

export function createInteractionState() {
  return { stimuli: Object.freeze([]), impulses: Object.freeze([]), interactionSequence: 0 };
}

/** Intensity, decayed over the event's life. Zero once it is spent. */
export function stimulusSalience(stimulus) {
  if (!stimulus || stimulus.durationSeconds <= 0) return 0;
  return stimulus.intensity * clamp(1 - stimulus.ageSeconds / stimulus.durationSeconds, 0, 1);
}

/**
 * How hard the water is moving right now. The envelope rises and falls rather
 * than decaying from full, because a disturbance in water arrives, peaks and
 * settles - it is the shape the plant bend has always used.
 */
export function impulseStrength(impulse) {
  if (!impulse || impulse.durationSeconds <= 0) return 0;
  const progress = clamp(impulse.ageSeconds / impulse.durationSeconds, 0, 1);
  return impulse.strength * Math.sin(progress * Math.PI) * (1 - progress * 0.45);
}

/** Whether this fish is close enough to notice the stimulus at all. */
export function perceivesStimulus(fish, stimulus) {
  if (!stimulus) return false;
  return Math.hypot(stimulus.x - fish.x, stimulus.y - fish.y) <= stimulus.radius;
}

/**
 * The stimulus the aquarium is currently answering.
 *
 * With one tap there is one; with several, the most salient wins, and a tie -
 * two fingers landing in the same frame - goes to the later press by its
 * sequence number. Deterministic, from state, with no clock and no random
 * number, which is the rule the whole event model is held to.
 */
export function dominantStimulus(state) {
  let best = null;
  let bestSalience = 0;
  for (const stimulus of state.stimuli ?? []) {
    const salience = stimulusSalience(stimulus);
    const wins = salience > bestSalience
      || (best && salience === bestSalience && (stimulus.sequence ?? 0) > (best.sequence ?? 0));
    if (wins) {
      best = stimulus;
      bestSalience = salience;
    }
  }
  return best;
}

/**
 * A thing that can be noticed. Labs, fixtures and tests build one directly;
 * gestures build them through `registerTouch` so identity and caps are handled
 * in one place.
 */
export function createStimulus({
  id,
  source = "touch",
  x,
  y,
  intensity = 1,
  radius = TOUCH_STIMULUS_RADIUS_CELLS,
  ageSeconds = 0,
  durationSeconds = TOUCH_SECONDS,
  // What the press landed on - see src/sim/interaction-context.js. It shapes
  // who finds the event interesting, and it is deliberately not the same
  // question as what the water physically touched.
  context = "open-water",
  // Which press this was, for ordering events that are otherwise equal.
  sequence = 0,
}) {
  return Object.freeze({ id, source, x, y, intensity, radius, ageSeconds, durationSeconds, context, sequence });
}

/** Water actually being disturbed. */
export function createImpulse({
  id,
  source = "touch",
  x,
  y,
  strength = 1,
  radius = TOUCH_IMPULSE_RADIUS_CELLS,
  ageSeconds = 0,
  durationSeconds = TOUCH_SECONDS,
  contact = "water",
  seed = 0,
  sequence = 0,
}) {
  return Object.freeze({ id, source, x, y, strength, radius, ageSeconds, durationSeconds, contact, seed, sequence });
}

function touchStimulus(state, x, y, sequence, context) {
  return createStimulus({
    id: `touch:${sequence}`,
    sequence,
    x,
    y,
    context,
    radius: TOUCH_STIMULUS_RADIUS_CELLS,
  });
}

function touchImpulse(state, x, y, sequence) {
  return createImpulse({
    id: `touch:${sequence}`,
    sequence,
    x,
    y,
    // What the disturbance reached. A press on the sand lifts a bubble burst
    // out of it; Phase 5 gives "surface" the same kind of meaning.
    contact: y >= state.rows - TOUCH_FLOOR_ROWS - 0.01 ? "substrate" : "water",
    // Effects that need their own deterministic variation - the bubble burst is
    // the only one today - derive it from here. It comes from the aquarium seed
    // and the position rather than from the sequence number, so touching the
    // same place twice raises the same bubbles.
    seed: mix32(state.seed ^ Math.imul(Math.round(x * 64) + 1, 0x9e3779b1)),
  });
}

function coalesceInto(list, event) {
  return list.findIndex((existing) => existing.source === event.source
    && Math.hypot(existing.x - event.x, existing.y - event.y) <= COALESCE_RADIUS_CELLS);
}

/**
 * Add an event, coalescing a near-repeat and evicting the faintest event if the
 * cap is full. A refreshed event keeps its identity - the ripple it is drawing
 * carries on rather than restarting as a new scene object - and takes the new
 * position, age and amplitude.
 */
function admit(list, event, maximum, amplitude) {
  const existing = coalesceInto(list, event);
  if (existing >= 0) {
    const merged = Object.freeze({ ...event, id: list[existing].id });
    return Object.freeze(list.map((entry, index) => (index === existing ? merged : entry)));
  }
  if (list.length < maximum) return Object.freeze([...list, event]);
  let faintest = 0;
  for (let index = 1; index < list.length; index += 1) {
    if (amplitude(list[index]) < amplitude(list[faintest])) faintest = index;
  }
  return Object.freeze(list.map((entry, index) => (index === faintest ? event : entry)));
}

/**
 * The events a tap makes: one thing to notice and one disturbance in the water.
 *
 * Returns the new event lists and the two events themselves, because the caller
 * applies the immediate response - a press has to be answered in the frame it
 * arrives, never on the next tick.
 */
export function registerTouch(state, x, y, context = "open-water") {
  const sequence = ((state.interactionSequence ?? 0) + 1) % SEQUENCE_MODULO;
  const stimulus = touchStimulus(state, x, y, sequence, context);
  const impulse = touchImpulse(state, x, y, sequence);
  return {
    stimulus,
    impulse,
    interactionSequence: sequence,
    stimuli: admit(state.stimuli ?? [], stimulus, MAX_STIMULI, stimulusSalience),
    impulses: admit(state.impulses ?? [], impulse, MAX_IMPULSES, impulseStrength),
  };
}

/**
 * Advance every live event by one frame and drop the spent ones immediately.
 * This is the only thing that removes an event, and it runs every tick, so the
 * lists cannot outlive the gesture that filled them.
 */
export function ageInteractionEvents(state, realDelta) {
  return {
    stimuli: ageEvents(state.stimuli, realDelta),
    impulses: ageEvents(state.impulses, realDelta),
  };
}

function ageEvents(events, realDelta) {
  if (!events?.length) return events ?? Object.freeze([]);
  const aged = [];
  for (const event of events) {
    const ageSeconds = event.ageSeconds + realDelta;
    if (ageSeconds >= event.durationSeconds) continue;
    aged.push(Object.freeze({ ...event, ageSeconds }));
  }
  return Object.freeze(aged);
}
