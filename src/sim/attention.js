/*
 * Who answers a disturbance, and how.
 *
 * Before this, a tap did one thing: every persistent fish in the aquarium
 * dropped what it was doing and swam at the point. Fifteen animals, one
 * activity, one tick - the measurement the Stage 2 baseline was built around,
 * and the thing this file ends.
 *
 * A stimulus now hands each fish a **response role**. The roles are a small
 * fixed vocabulary, they are assigned deterministically from what the aquarium
 * already knows about the fish - where it is, what it is busy with, what it
 * likes, who it trusts, how tired it is - and most of them do not interrupt the
 * fish at all. One fish goes to look. One or two come partway. One finishes its
 * mouthful and then goes. The rest turn, slow, tip a nose, or edge away and
 * carry on, which is what a room full of animals actually looks like when
 * something taps the glass.
 *
 * Three rules hold this together:
 *
 * **Something always answers.** The most interested fish that can perceive the
 * stimulus always becomes the primary investigator, whatever its threshold
 * score - and if none can perceive it, the nearest fish does. A viewer never
 * taps and gets nothing.
 *
 * **Most fish are not interrupted.** Investigating is capped, not scored into
 * existence: at most two primary, two secondary and one delayed. Everyone else
 * keeps the activity they had, and their response is shaped into the motion
 * they were already making.
 *
 * **Every role has a visible correlate.** A role that only changed a number
 * would be a lie in a product with no UI, so each one is a change to speed,
 * heading or posture that a person watching can see: going, hanging back,
 * finishing first, turning to look, edging away, or a flick of acknowledgement.
 *
 * The record each fish carries is fixed-size and transient - never serialised,
 * cleared by an offline gap, replaced by the next press - and there is exactly
 * one per fish, so fifteen of them is the aquarium's hard maximum.
 */

import { clamp, traitsFromSeed } from "./entities.js";
import { speciesCanBottomFeed } from "./fish-growth.js";
import { contextAffinityKey } from "./interaction-context.js";
import { perceivesStimulus, stimulusSalience } from "./interaction-events.js";
import { affinitiesFromSeed } from "./fish-personality.js";
import { sampleRange } from "./prng.js";

export const RESPONSE_ROLES = Object.freeze({
  // Goes to look, closely. The response a viewer is meant to notice first.
  investigate: "investigate",
  // Comes partway and holds a wider standoff. Interested, not committed.
  approach: "approach",
  // Finishes what it was doing, then goes. Reads as a beat of hesitation.
  delayed: "delayed",
  // Keeps its activity, turns toward the disturbance and slows to look.
  watch: "watch",
  // Keeps its activity and puts a little more water between itself and the
  // disturbance. The shy response, and never a punished one - it is a lean
  // away, not a flight.
  wary: "wary",
  // Keeps its activity with one brief flick of acknowledgement.
  acknowledge: "acknowledge",
});

// How many fish an event may take away from what they were doing. These are the
// caps that make a tap an event in a room rather than a summons: five is the
// ceiling and three is typical, out of a cast of fifteen.
export const MAX_INVESTIGATORS = 2;
export const MAX_SECONDARY = 2;
export const MAX_DELAYED = 1;

// Interest needed to be considered beyond the guaranteed first responder.
const INVESTIGATE_THRESHOLD = 0.6;
const APPROACH_THRESHOLD = 0.5;
// Above this, a fish that is interested is too absorbed to come straight away:
// it finishes its mouthful first. Hesitating costs less interest than coming
// over does, so the bar for it is lower.
const COMMITMENT_HESITATES = 0.55;
const DELAYED_THRESHOLD = 0.44;
// A fish this close to the disturbance responds to it visibly even if it is not
// interested; further away, a low-interest fish simply carries on.
const WATCH_RADIUS_CELLS = 16;
// Shy fish inside the watch radius lean away instead of looking.
const WARY_TEMPERAMENT = 0.42;

// How long a response lasts, as a fraction of the stimulus's own life. Seeded
// per fish and per event so responders do not all let go on the same frame -
// the aftermath is staggered by temperament, not by a global timer.
const RESPONSE_SECONDS_MINIMUM = 0.55;
const RESPONSE_SECONDS_MAXIMUM = 1.45;
// A delayed investigator's beat before it turns.
const DELAY_SECONDS_MINIMUM = 0.6;
const DELAY_SECONDS_MAXIMUM = 1.6;
// An acknowledgement is a flick, not a pause: it is over in well under a
// second and the fish never leaves its line.
const ACKNOWLEDGE_SECONDS = 0.8;

// How far a secondary investigator holds back from where a primary would stop.
export const SECONDARY_STANDOFF_CELLS = 2.7;

// The strongest a passive response bends a fish's heading, in radians. Big
// enough to read as turning to look, small enough that the fish is plainly
// still doing what it was doing.
const WATCH_TURN_RADIANS = 0.85;
const ACKNOWLEDGE_TURN_RADIANS = 0.4;
const WARY_TURN_RADIANS = 0.5;

function attentionSalt(stimulus) {
  // Same fish, same press, same role - and a different press produces a
  // different draw, so tapping the same spot twice does not summon the same
  // cast twice.
  return 9100 + ((stimulus.sequence ?? 0) % 97) * 13;
}

function companionSeed(fish) {
  let best = null;
  for (const entry of fish.history?.socialMemory ?? []) {
    if (!best || (entry.familiarity ?? 0) > (best.familiarity ?? 0)) best = entry;
  }
  return best?.seed ?? null;
}

/**
 * How much this fish cares about this stimulus, in roughly 0..1.
 *
 * Every term is one of the factors the plan names, and each is something the
 * aquarium already knows: nothing here is a new persistent number about the
 * fish. `companion` is whether a fish it trusts is already going to look.
 */
export function attentionInterest(fish, stimulus, {
  distance,
  traits = traitsFromSeed(fish.seed, fish.history),
  affinities = affinitiesFromSeed(fish.seed),
  commitment = 0.3,
  companion = false,
} = {}) {
  const proximity = clamp(1 - distance / Math.max(1, stimulus.radius), 0, 1);
  const contextTaste = affinities[contextAffinityKey(stimulus.context)] ?? affinities.glass;
  const energy = clamp(fish.drives?.energy ?? 0.5, 0, 1);
  const jitter = sampleRange(fish.seed, attentionSalt(stimulus), -0.05, 0.05);
  // Species and body: a fish built to work the sand has a reason to nose into a
  // disturbance in it that a mid-water fish simply does not have.
  const bodySuits = stimulus.context === "substrate" && speciesCanBottomFeed(fish.seed) ? 0.06 : 0;
  const interest = 0.30 * proximity
    + 0.16 * affinities.glass
    + 0.14 * contextTaste
    + 0.10 * traits.boldness
    + 0.12 * traits.curiosity
    + 0.08 * energy
    + (companion ? 0.08 : 0)
    + bodySuits
    // Being busy makes a fish a little less curious, but mostly it decides
    // *when* it goes rather than whether it cares: an absorbed fish that is
    // interested becomes a delayed investigator, which is why the penalty here
    // is small and the hesitation is a role.
    - 0.10 * clamp(commitment, 0, 1)
    + jitter;
  return clamp(interest, 0, 1) * stimulusSalience(stimulus);
}

function passiveRole(fish, distance, traits, affinities) {
  if (distance > WATCH_RADIUS_CELLS) return RESPONSE_ROLES.acknowledge;
  const temperament = (traits.boldness + affinities.glass) / 2;
  return temperament < WARY_TEMPERAMENT ? RESPONSE_ROLES.wary : RESPONSE_ROLES.watch;
}

/**
 * A response record for one fish. `assignAttention` builds these for a real
 * press; labs and tests that pose a responder directly build one here rather
 * than hand-writing the shape.
 */
export function createAttention(fish, stimulus, role, distance = Math.hypot(stimulus.x - fish.x, stimulus.y - fish.y)) {
  const seconds = stimulus.durationSeconds * sampleRange(
    fish.seed,
    attentionSalt(stimulus) + 1,
    RESPONSE_SECONDS_MINIMUM,
    RESPONSE_SECONDS_MAXIMUM,
  );
  return {
    stimulusId: stimulus.id,
    role,
    // Where the fish believes the disturbance was. Kept on the record rather
    // than read from the stimulus every frame, so a responder can still be
    // finishing its answer after the event itself is over - an aftermath, not
    // an instant cancellation.
    x: stimulus.x,
    y: stimulus.y,
    distance,
    ageSeconds: 0,
    durationSeconds: role === RESPONSE_ROLES.acknowledge
      ? Math.min(ACKNOWLEDGE_SECONDS, seconds)
      : seconds,
    delaySeconds: role === RESPONSE_ROLES.delayed
      ? sampleRange(fish.seed, attentionSalt(stimulus) + 2, DELAY_SECONDS_MINIMUM, DELAY_SECONDS_MAXIMUM)
      : 0,
  };
}

/**
 * Give every fish a role for this stimulus.
 *
 * Returns one record per individual, aligned with `state.individuals`, with
 * `null` for fish that never noticed the event at all. `commitmentFor` says how
 * absorbed a fish is in what it is doing - it lives with the activities, which
 * is why it arrives as a function rather than a table read from here.
 */
export function assignAttention(state, stimulus, { commitmentFor = () => 0.3 } = {}) {
  const fish = state.individuals ?? [];
  const candidates = fish.map((one, index) => {
    const distance = Math.hypot(stimulus.x - one.x, stimulus.y - one.y);
    const traits = traitsFromSeed(one.seed, one.history);
    const affinities = affinitiesFromSeed(one.seed);
    return {
      index,
      fish: one,
      distance,
      traits,
      affinities,
      commitment: clamp(commitmentFor(one), 0, 1),
      perceives: perceivesStimulus(one, stimulus),
      interest: 0,
      role: null,
    };
  });

  const rank = (list) => [...list].sort((left, right) =>
    right.interest - left.interest || left.fish.seed - right.fish.seed);

  const perceiving = candidates.filter((candidate) => candidate.perceives);
  for (const candidate of perceiving) {
    candidate.interest = attentionInterest(candidate.fish, stimulus, candidate);
  }

  // The first responder is guaranteed: the most interested fish that noticed,
  // or - if the disturbance was too far from everyone - the nearest one, who
  // catches it anyway. A press is never ignored by the whole aquarium.
  const ordered = rank(perceiving);
  const first = ordered[0]
    ?? [...candidates].sort((left, right) => left.distance - right.distance
      || left.fish.seed - right.fish.seed)[0];
  if (!first) return candidates.map(() => null);
  first.role = RESPONSE_ROLES.investigate;

  // A fish whose most trusted companion is already going is more likely to go
  // too. This is the second pass, so the bonus can depend on the first.
  const investigators = new Set([first.fish.seed]);
  for (const candidate of ordered) {
    if (candidate.role) continue;
    if (companionSeed(candidate.fish) !== null && investigators.has(companionSeed(candidate.fish))) {
      candidate.interest = attentionInterest(candidate.fish, stimulus, { ...candidate, companion: true });
    }
  }

  let primary = 1;
  let secondary = 0;
  let delayed = 0;
  for (const candidate of rank(ordered)) {
    if (candidate.role) continue;
    const { interest, commitment } = candidate;
    // An absorbed fish never sets off mid-mouthful. It either finishes and then
    // goes, or it watches from where it is - it does not become a second
    // investigator, whatever its interest.
    if (commitment >= COMMITMENT_HESITATES) {
      if (interest >= DELAYED_THRESHOLD && delayed < MAX_DELAYED) {
        candidate.role = RESPONSE_ROLES.delayed;
        delayed += 1;
        continue;
      }
    } else if (interest >= INVESTIGATE_THRESHOLD && primary < MAX_INVESTIGATORS) {
      candidate.role = RESPONSE_ROLES.investigate;
      primary += 1;
      investigators.add(candidate.fish.seed);
      continue;
    } else if (interest >= APPROACH_THRESHOLD && secondary < MAX_SECONDARY) {
      candidate.role = RESPONSE_ROLES.approach;
      secondary += 1;
      continue;
    }
    candidate.role = passiveRole(candidate.fish, candidate.distance, candidate.traits, candidate.affinities);
  }

  return candidates.map((candidate) => (candidate.role
    ? createAttention(candidate.fish, stimulus, candidate.role, candidate.distance)
    : null));
}

/** One frame older, or gone. */
export function ageAttention(attention, realDelta) {
  if (!attention) return null;
  const ageSeconds = attention.ageSeconds + realDelta;
  if (ageSeconds >= attention.durationSeconds) return null;
  return { ...attention, ageSeconds };
}

/** Whether this fish is on its way to the disturbance right now. */
export function attentionInvestigates(attention) {
  if (!attention) return false;
  if (attention.role === RESPONSE_ROLES.investigate || attention.role === RESPONSE_ROLES.approach) return true;
  return attention.role === RESPONSE_ROLES.delayed && attention.ageSeconds >= attention.delaySeconds;
}

/** How far short of the disturbance this responder stops. */
export function attentionStandoff(attention) {
  if (!attention || attention.role === RESPONSE_ROLES.investigate) return 0;
  // A delayed investigator arrives late and hangs back like a secondary one.
  return SECONDARY_STANDOFF_CELLS;
}

function angleDifference(from, to) {
  let difference = to - from;
  while (difference > Math.PI) difference -= Math.PI * 2;
  while (difference < -Math.PI) difference += Math.PI * 2;
  return difference;
}

/**
 * The passive response, as a change to the motion the fish was already making.
 *
 * A fish that is not going to the disturbance still has to show that it noticed
 * one, and the only vocabulary this product has is movement: it bends its line
 * toward the sound and slows to look, or leans away from it, or gives one flick
 * and carries on. The bend is applied to the target's *bearing*, so it reads
 * the same whether the fish was crossing the tank or hovering by a plant.
 *
 * A feeding fish is shaped differently on purpose: bending a target that is
 * measured against the sand would break the strike geometry, so a fish with its
 * mouth down pauses and lifts its nose instead.
 */
export function shapeTargetForAttention(target, fish, attention) {
  if (!target || !attention || attentionInvestigates(attention)) return target;
  const progress = clamp(attention.ageSeconds / attention.durationSeconds, 0, 1);
  const role = attention.role;
  const envelope = role === RESPONSE_ROLES.acknowledge
    ? Math.sin(progress * Math.PI)
    : 1 - progress;
  if (envelope <= 0.001) return target;

  const away = role === RESPONSE_ROLES.wary;
  const turn = (role === RESPONSE_ROLES.watch ? WATCH_TURN_RADIANS
    : role === RESPONSE_ROLES.wary ? WARY_TURN_RADIANS
      : role === RESPONSE_ROLES.delayed ? WATCH_TURN_RADIANS * 0.6
        : ACKNOWLEDGE_TURN_RADIANS) * envelope;
  const speedScale = 1 - envelope * (role === RESPONSE_ROLES.watch ? 0.5
    : role === RESPONSE_ROLES.wary ? 0.3
      : role === RESPONSE_ROLES.delayed ? 0.4
        : 0.28);

  const dy = attention.y - fish.y;
  const posture = clamp(dy * (away ? -2.4 : 2.4), -6, 6) * envelope;
  const shaped = {
    ...target,
    speed: Math.max(0, (target.speed ?? 0.3) * speedScale),
    postureBias: (target.postureBias ?? 0) + posture,
  };
  // Feeding keeps its geometry; the pause and the lifted nose are the whole
  // response for a fish with its mouth in the sand.
  if (target.forageSearching || target.forageGrazing) return shaped;

  const offsetX = (target.x ?? fish.x) - fish.x;
  const offsetY = (target.y ?? fish.y) - fish.y;
  const reach = Math.hypot(offsetX, offsetY);
  if (reach < 0.001) return shaped;
  const bearing = Math.atan2(offsetY, offsetX);
  const stimulusBearing = Math.atan2(attention.y - fish.y, attention.x - fish.x);
  const wanted = away ? stimulusBearing + Math.PI : stimulusBearing;
  const rotation = clamp(angleDifference(bearing, wanted), -turn, turn);
  return {
    ...shaped,
    x: fish.x + Math.cos(bearing + rotation) * reach,
    y: fish.y + Math.sin(bearing + rotation) * reach,
  };
}

/** Debug and measurement helper: the role vocabulary as a stable list. */
export const RESPONSE_ROLE_LIST = Object.freeze(Object.values(RESPONSE_ROLES));

export function isPassiveRole(role) {
  return role === RESPONSE_ROLES.watch
    || role === RESPONSE_ROLES.wary
    || role === RESPONSE_ROLES.acknowledge;
}
