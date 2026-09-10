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
 * Phase 3 adds the first gesture that is not instantaneous. A press that stays
 * where it was put becomes a **held stimulus**: the same event, refreshed in
 * place, carrying a hold clock instead of decaying. It is deliberately not a
 * queue of presses - a finger resting on the glass for a minute is one thing
 * that is there, and the aquarium's state must not grow because it stayed. The
 * water is a separate matter: it rings when the finger arrives and again, more
 * gently, when it leaves, and it is still between those two.
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

// A press that has not moved further than HOLD_MOVEMENT_CELLS by the time it is
// HOLD_THRESHOLD_SECONDS old is a hold rather than a tap. The threshold is
// under half a second because a viewer who means to rest a finger there should
// not have to wait to be believed, and it is above a quarter of a second
// because a slow tap is still a tap. The movement allowance is a fingertip's
// worth of wander on a seven-inch panel: a press that travels further than that
// is a gesture with a direction in it, which is Phase 4's, so it ends the hold.
export const HOLD_THRESHOLD_SECONDS = 0.45;
export const HOLD_MOVEMENT_CELLS = 1.6;

// The hold clock stops here. Nothing in the aquarium is still changing at a
// minute and a half - every fish has long since reached the phase it stops at -
// so this is not a limit on how long a viewer may lean on the glass, it is the
// promise that the number describing it cannot grow without bound. See
// `holdFalloff`: interest is flat well before this.
export const MAX_HOLD_SECONDS = 90;

// A held stimulus is kept alive by the gesture refreshing it. If the refresh
// stops arriving - a lost pointerup, a cancelled contact, a tab that went away
// mid-press - the event lets go by itself after this long rather than resting
// on the glass forever. It is the only thing standing between a dropped browser
// event and a permanent disturbance, so it is short.
export const HOLD_STALE_SECONDS = 0.5;

// A finger that stays is a continuing presence, not a repeated shock. The
// arrival is the loud part; over HOLD_SETTLE_SECONDS the stimulus settles to
// HOLD_PRESENCE_FLOOR of it and stays there for as long as the finger does.
// What changes after that is not the disturbance, it is each fish's patience
// with it - see `holdFalloff` and src/sim/attention.js.
export const HOLD_SETTLE_SECONDS = 1.6;
export const HOLD_PRESENCE_FLOOR = 0.9;

// Release matters. The stimulus does not vanish with the finger: it becomes an
// ordinary decaying one that lives this long, so a fish still on its way
// arrives at a place something was a moment ago and noses around it.
export const RELEASE_SECONDS = 2;

// The water moving as the contact leaves. Weaker and shorter than the arrival,
// because a finger lifting is a smaller event than a finger landing, and
// because two identical rings would read as a second tap.
export const RELEASE_IMPULSE_STRENGTH = 0.42;
export const RELEASE_IMPULSE_SECONDS = 1.5;

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

/**
 * Intensity, decayed over the event's life. Zero once it is spent.
 *
 * A held stimulus does not decay: the finger is genuinely still there, so the
 * aquarium goes on perceiving it at full presence less the settling above.
 * What ends a hold is not the disturbance fading, it is each fish running out
 * of patience with it, which is a per-fish question and lives with attention.
 */
export function stimulusSalience(stimulus) {
  if (!stimulus || stimulus.durationSeconds <= 0) return 0;
  if (stimulus.held) return stimulus.intensity * holdPresence(stimulus.holdSeconds);
  return stimulus.intensity * clamp(1 - stimulus.ageSeconds / stimulus.durationSeconds, 0, 1);
}

/** The settling curve: full at the moment of arrival, a plateau thereafter. */
export function holdPresence(holdSeconds) {
  const settled = clamp((holdSeconds ?? 0) / HOLD_SETTLE_SECONDS, 0, 1);
  return HOLD_PRESENCE_FLOOR + (1 - HOLD_PRESENCE_FLOOR) * (1 - settled);
}

/**
 * How much of something survives a finger that will not go away.
 *
 * One shape, used by everything that has to get bored: full while the holder is
 * still interested, easing to `floor` over the same span again, and flat after
 * that. Flat is the important half - it is why a sixty-second hold costs the
 * aquarium exactly what a fifteen-second one does.
 */
export function holdFalloff(holdSeconds, patienceSeconds, floor = 0) {
  const patience = Math.max(0.1, patienceSeconds);
  const past = clamp(((holdSeconds ?? 0) - patience) / patience, 0, 1);
  return floor + (1 - floor) * (1 - past * past * (3 - 2 * past));
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
  // The hold, in three numbers and two flags. `held` is a finger currently on
  // the glass; `holdSeconds` is how long it has been there, bounded by
  // MAX_HOLD_SECONDS; `staleSeconds` is how long since the gesture last said so,
  // which is what lets a dropped release expire; `released` marks the aftermath
  // of a hold, so a fish can tell "it is still there" from "it was just there".
  held = false,
  holdSeconds = 0,
  staleSeconds = 0,
  released = false,
}) {
  return Object.freeze({
    id,
    source,
    x,
    y,
    intensity,
    radius,
    ageSeconds,
    durationSeconds,
    context,
    sequence,
    held,
    holdSeconds: clamp(holdSeconds, 0, MAX_HOLD_SECONDS),
    staleSeconds,
    released,
  });
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
    // A finger already on the glass is not something a new press refreshes.
    // Merging into it would overwrite the hold with a tap and quietly end a
    // gesture that is still happening.
    && !existing.held
    && Math.hypot(existing.x - event.x, existing.y - event.y) <= COALESCE_RADIUS_CELLS);
}

/**
 * Add an event, coalescing a near-repeat and evicting the faintest event if the
 * cap is full. A refreshed event keeps its identity - the ripple it is drawing
 * carries on rather than restarting as a new scene object - and takes the new
 * position, age and amplitude.
 *
 * Returns the stored list *and the event as stored*, which are not always the
 * event that was passed in: a coalesced press keeps the identity of the one it
 * refreshed. Callers hand that identity to the fish responding to it, so
 * returning the freshly minted event instead would point every responder at an
 * id that is not in the aquarium.
 */
function admit(list, event, maximum, amplitude) {
  const existing = coalesceInto(list, event);
  if (existing >= 0) {
    const merged = Object.freeze({ ...event, id: list[existing].id });
    return { list: Object.freeze(list.map((entry, index) => (index === existing ? merged : entry))), event: merged };
  }
  if (list.length < maximum) return { list: Object.freeze([...list, event]), event };
  let faintest = 0;
  for (let index = 1; index < list.length; index += 1) {
    if (amplitude(list[index]) < amplitude(list[faintest])) faintest = index;
  }
  return { list: Object.freeze(list.map((entry, index) => (index === faintest ? event : entry))), event };
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
  const stimuli = admit(state.stimuli ?? [], touchStimulus(state, x, y, sequence, context), MAX_STIMULI, stimulusSalience);
  const impulses = admit(state.impulses ?? [], touchImpulse(state, x, y, sequence), MAX_IMPULSES, impulseStrength);
  return {
    // The events as the aquarium now holds them, identities included.
    stimulus: stimuli.event,
    impulse: impulses.event,
    interactionSequence: sequence,
    stimuli: stimuli.list,
    impulses: impulses.list,
  };
}

/**
 * The stimulus a finger is currently resting on, if there is one.
 *
 * There is at most one, because the aquarium answers the primary pointer only:
 * a second finger is not a second hold, it is nothing. A later phase that wants
 * two hands changes what puts one here, not the shape of it.
 */
export function heldStimulus(state) {
  return (state.stimuli ?? []).find((stimulus) => stimulus.held) ?? null;
}

/** The most recent live touch stimulus, which is the one a gesture is about. */
export function latestTouchStimulus(state) {
  let best = null;
  for (const stimulus of state.stimuli ?? []) {
    if (stimulus.source !== "touch") continue;
    if (!best || (stimulus.sequence ?? 0) > (best.sequence ?? 0)) best = stimulus;
  }
  return best;
}

/**
 * The finger is still down, still where it was put, and this old.
 *
 * The event is refreshed in place rather than replaced, so a hold spends one
 * slot however long it lasts and keeps the identity the responders were handed
 * when it landed. It also keeps its *position*: a presence is where the press
 * landed, and a fingertip's worth of wander does not move it. That is what
 * makes the movement allowance mean anything - measured against a point that
 * followed the finger, a drag across the whole tank would never exceed it.
 */
export function holdStimulus(stimuli, stimulus, holdSeconds) {
  const held = createStimulus({
    ...stimulus,
    ageSeconds: 0,
    durationSeconds: TOUCH_SECONDS,
    held: true,
    released: false,
    holdSeconds,
    staleSeconds: 0,
  });
  return Object.freeze((stimuli ?? []).map((entry) => (entry.id === stimulus.id ? held : entry)));
}

/**
 * The finger has gone.
 *
 * The stimulus stops being held and becomes an ordinary decaying one with a
 * fresh, short life, keeping its identity and the hold clock it accumulated: a
 * fish still crossing the tank arrives at the place a presence was, rather than
 * at nothing at all. The water rings once more, gently, so the departure is
 * visible even to a plant.
 */
export function releaseStimulus(state, stimulus) {
  const released = createStimulus({
    ...stimulus,
    ageSeconds: 0,
    durationSeconds: RELEASE_SECONDS,
    held: false,
    released: true,
    staleSeconds: 0,
  });
  const impulses = admit(
    state.impulses ?? [],
    createImpulse({
      id: `release:${stimulus.sequence ?? 0}`,
      sequence: stimulus.sequence ?? 0,
      x: stimulus.x,
      y: stimulus.y,
      strength: RELEASE_IMPULSE_STRENGTH,
      durationSeconds: RELEASE_IMPULSE_SECONDS,
      contact: stimulus.context === "substrate" ? "substrate" : "water",
      seed: mix32(stimulus.sequence ?? 0),
    }),
    MAX_IMPULSES,
    impulseStrength,
  );
  return {
    stimulus: released,
    stimuli: Object.freeze((state.stimuli ?? []).map((entry) => (entry.id === stimulus.id ? released : entry))),
    impulses: impulses.list,
  };
}

/**
 * Advance every live event by one frame and drop the spent ones immediately.
 * This is the only thing that removes an event, and it runs every tick, so the
 * lists cannot outlive the gesture that filled them.
 *
 * A held stimulus is the one event that does not age out, because the thing it
 * describes has not stopped happening. It is not therefore unbounded: it lets
 * go by itself once the gesture stops refreshing it, which is what happens when
 * a release is lost, and its hold clock is clamped either way.
 */
export function ageInteractionEvents(state, realDelta) {
  return {
    stimuli: ageStimuli(state.stimuli, realDelta),
    impulses: ageEvents(state.impulses, realDelta),
  };
}

function ageStimuli(stimuli, realDelta) {
  if (!stimuli?.length) return stimuli ?? Object.freeze([]);
  const aged = [];
  for (const stimulus of stimuli) {
    if (stimulus.held) {
      const staleSeconds = stimulus.staleSeconds + realDelta;
      // Nobody has confirmed this finger for half a second: treat it as lifted.
      // A release that reaches us later finds an already-released stimulus and
      // does nothing, which is the right answer for a duplicated event.
      if (staleSeconds >= HOLD_STALE_SECONDS) {
        aged.push(createStimulus({
          ...stimulus,
          ageSeconds: 0,
          durationSeconds: RELEASE_SECONDS,
          held: false,
          released: true,
          staleSeconds: 0,
        }));
        continue;
      }
      // The hold clock itself belongs to the gesture, which sets it every frame
      // it is still there. Advancing it here as well would count the same
      // second twice, and a stimulus nobody is confirming is about to be
      // released anyway.
      aged.push(createStimulus({ ...stimulus, staleSeconds }));
      continue;
    }
    const ageSeconds = stimulus.ageSeconds + realDelta;
    if (ageSeconds >= stimulus.durationSeconds) continue;
    aged.push(Object.freeze({ ...stimulus, ageSeconds }));
  }
  return Object.freeze(aged);
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
