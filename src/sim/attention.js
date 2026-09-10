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
 *
 * Phase 3 adds the arc a *held* press has that a tap cannot. A tap is answered
 * once; a finger that stays is answered continuously, and the answer has stages
 * in it - notice, orient, approach, inspect, linger, settle, and a departure
 * once the finger goes. None of that is a new state machine: the stages are
 * read from the record and the fish, the roles are the same six, and the thing
 * that ends a hold is not the disturbance fading but each fish's own patience
 * with it running out. That is why a cautious fish is not a slow bold one. It
 * arrives later, stops further out, and gives up sooner, because patience,
 * standoff and latency all come off different traits.
 *
 * The hold is re-read on a slow beat rather than every frame (see `applyHold`
 * in src/sim/state.js), which is what lets a fish arrive late, follow a
 * companion to the glass, or quietly hand over to a fish that has not yet had
 * its turn. Everything a hold can do it does inside the same caps a tap has.
 */

import { clamp, traitsFromSeed } from "./entities.js";
import { speciesCanBottomFeed } from "./fish-growth.js";
import { contextAffinityKey } from "./interaction-context.js";
import {
  MAX_HOLD_SECONDS,
  holdFalloff,
  perceivesStimulus,
  stimulusSalience,
} from "./interaction-events.js";
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
// A commitment of one means the fish is not available to be interrupted at all.
// Today that is a fish swimming into the aquarium for the first time: an
// arrival happens once in a fish's life, and no press may overwrite it - not
// even the press that is guaranteed an answer, which finds another fish
// instead. Such a fish can still notice a disturbance; it simply never leaves
// its entry for one.
const UNAVAILABLE_COMMITMENT = 1;
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

/* ------------------------------------------------------------------ *
 * A held press
 * ------------------------------------------------------------------ */

/**
 * The stages of an answer to a finger that stays.
 *
 * These are read from the response and the fish, never stored and never
 * advanced by a timer, so a phase cannot get stuck and there is no machine to
 * keep in step with the roles. A fish may stop at any of them - most stop at
 * `orient` - and only the ones that went get the later ones.
 */
export const HOLD_PHASES = Object.freeze({
  // It has registered, and has not done anything about it yet.
  notice: "notice",
  // It has turned toward the presence but is not leaving its line.
  orient: "orient",
  // On its way, still further out than it means to stop.
  approach: "approach",
  // Arrived: nosing at the glass where the finger is.
  inspect: "inspect",
  // Still there, and has been for a while. The stayers.
  linger: "linger",
  // The finger has not gone, but this fish is done with it.
  settle: "settle",
  // The finger has gone and the fish is still finishing its answer.
  depart: "depart",
});

export const HOLD_PHASE_LIST = Object.freeze(Object.values(HOLD_PHASES));

// How long a fish stays interested in a finger that is not going anywhere,
// before habituation starts taking its interest away. Curiosity is most of it,
// glass affinity nearly as much, and boldness a little: a bold incurious fish
// comes straight over and gets bored, a timid curious one arrives late and
// stays. Two and a half seconds to about fourteen.
const HOLD_PATIENCE_SECONDS = 2.4;
const HOLD_PATIENCE_CURIOSITY = 4.5;
const HOLD_PATIENCE_GLASS = 5.2;
const HOLD_PATIENCE_BOLDNESS = 2.4;

// A finger that stays is worth more than a tap that is already fading, and it
// is worth it immediately: the first thing a hold has to do is be more
// interesting than the press it grew out of, or holding still would be a way of
// asking the aquarium for less.
const HOLD_PRESENCE_INTEREST = 1.2;

// Habituation never reaches zero for a fish that likes the glass. This is what
// keeps one or two of them hanging at a held finger long after the rest have
// gone back to their evening, and it is the difference between a hold that
// decays into a tap and a hold that is a presence.
const HOLD_INTEREST_FLOOR = 0.15;
const HOLD_INTEREST_FLOOR_GLASS = 0.45;

// A fish already answering this presence is a little more likely to go on
// answering it than a fish of equal interest that is not. Without it the
// re-read below swaps investigators back and forth between two near-identical
// fish, which reads as indecision rather than as attention.
const HOLD_ENGAGEMENT_BONUS = 0.08;

// What a fish already at the glass needs to stay there, as a fraction of what
// a fish somewhere else needs to come over. Deciding to cross the tank and
// deciding to keep hanging where you already are is not the same decision, and
// holding both to one bar gets one of them wrong: at the recruitment bar every
// responder leaves the moment habituation touches it, and a hold has nobody
// left at it inside half a minute. This is the difference between them, and it
// is what makes "willingness to remain nearby" a personality trait rather than
// a timer - a fish that likes the glass stays above the lower bar for as long
// as the finger is there, and one that does not falls under it and goes.
const HOLD_INCUMBENT_FRACTION = 0.5;

// A response to a held press lives longer than one to a tap, because it is
// renewed for as long as the finger is there and because this is also the
// window it fades over once the finger goes. Seeded per fish, so responders
// peel off the glass one at a time rather than together.
const HOLD_RESPONSE_SECONDS_MINIMUM = 1.6;
const HOLD_RESPONSE_SECONDS_MAXIMUM = 3;

// A delayed responder to a held press takes longer to come than one answering a
// tap: there is no hurry, the thing is still there.
const HOLD_DELAY_SCALE = 1.9;

// Inside this of where it believes the presence is, plus its own standoff, a
// fish counts as having arrived.
const INSPECT_RADIUS_CELLS = 2.4;

// Arrived, and still arrived this much later: the difference between a fish
// that came to look and one that has decided to stay.
const LINGER_SECONDS = 2.2;

// Before this much of its response has passed, a fish that has not left its
// line has noticed rather than oriented.
const NOTICE_SECONDS = 0.4;

// Below this much habituation left, a passive answer is no longer visible and
// the fish has settled.
const HABITUATION_SPENT = 0.02;

// How long a fish is credited with having hovered at a presence. It is bounded
// for the same reason the hold clock is: nothing reads it past `LINGER_SECONDS`
// and a number that only grows is a leak.
const MAX_NEAR_SECONDS = 30;

// How far a departing responder drifts back off the glass as its answer drains.
// A response that simply stopped would leave the fish parked at the point; this
// is what makes the release read as peeling away rather than as switching off.
const DEPARTURE_STANDOFF_CELLS = 3.4;

/** How long this fish stays interested in a finger that does not move. */
export function attentionPatience(traits, affinities) {
  return HOLD_PATIENCE_SECONDS
    + traits.curiosity * HOLD_PATIENCE_CURIOSITY
    + affinities.glass * HOLD_PATIENCE_GLASS
    + traits.boldness * HOLD_PATIENCE_BOLDNESS;
}

/**
 * What is left of this fish's interest once it has habituated to a hold.
 *
 * Patience is spent on the fish's own answer where it has one, and on the hold
 * itself where it does not. That distinction is the whole difference between a
 * fish losing interest and a fish never having any: a fish crossing the tank
 * has not been staring at a finger for ten seconds, it has been swimming, and
 * running its patience down on the hold clock would have it give up halfway
 * every time. A fish that has been ignoring the presence, meanwhile, has been
 * ignoring it for exactly as long as it has been there, and should not suddenly
 * find it fascinating.
 */
function holdInterestScale(stimulus, traits, affinities, engagedSeconds = null) {
  if (!stimulus?.held) return 1;
  const spent = engagedSeconds ?? stimulus.holdSeconds;
  return HOLD_PRESENCE_INTEREST * holdFalloff(
    spent,
    attentionPatience(traits, affinities),
    HOLD_INTEREST_FLOOR + affinities.glass * HOLD_INTEREST_FLOOR_GLASS,
  );
}

/**
 * How long this fish has been answering this presence, or null if it is not.
 *
 * A passive answer does not count as being engaged: a fish that turned its head
 * once has not committed anything to the finger, and it habituates on the same
 * clock as a fish that ignored it entirely.
 */
export function attentionEngagement(fish, stimulus) {
  // Only a held press has anything to be engaged *with*. Repeated taps at one
  // point coalesce into a single event, so without this a fish already
  // answering that event would collect the engagement bonus from a tap - which
  // would quietly change how the aquarium answers drumming fingers, a Phase 2
  // behaviour this phase has no business touching.
  if (!stimulus?.held) return null;
  const record = fish.attention;
  if (!record || record.stimulusId !== stimulus.id) return null;
  if (isPassiveRole(record.role)) return null;
  return record.ageSeconds;
}

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
  // How long this fish has already been answering this presence, or null if it
  // is not. Only a held press can produce it, and only on a re-read - the first
  // press finds nobody engaged.
  engagedSeconds = null,
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
    + (engagedSeconds === null ? 0 : HOLD_ENGAGEMENT_BONUS)
    + bodySuits
    // Being busy makes a fish a little less curious, but mostly it decides
    // *when* it goes rather than whether it cares: an absorbed fish that is
    // interested becomes a delayed investigator, which is why the penalty here
    // is small and the hesitation is a role.
    - 0.10 * clamp(commitment, 0, 1)
    + jitter;
  // Habituation is the last word, and it is the only term that is about how
  // long the disturbance has been going on rather than about what it is. A tap
  // is over before it matters; a held finger is eventually just furniture, and
  // it becomes furniture at a different moment for every fish.
  return clamp(interest, 0, 1)
    * stimulusSalience(stimulus)
    * holdInterestScale(stimulus, traits, affinities, engagedSeconds);
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
  const held = Boolean(stimulus.held);
  const seconds = held
    ? sampleRange(
      fish.seed,
      attentionSalt(stimulus) + 1,
      HOLD_RESPONSE_SECONDS_MINIMUM,
      HOLD_RESPONSE_SECONDS_MAXIMUM,
    )
    : stimulus.durationSeconds * sampleRange(
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
    // an instant cancellation. For a hold this is also where the fish goes
    // looking once the finger has gone: the last place it was, not nowhere.
    x: stimulus.x,
    y: stimulus.y,
    distance,
    ageSeconds: 0,
    durationSeconds: role === RESPONSE_ROLES.acknowledge && !held
      ? Math.min(ACKNOWLEDGE_SECONDS, seconds)
      : seconds,
    delaySeconds: role === RESPONSE_ROLES.delayed
      ? sampleRange(fish.seed, attentionSalt(stimulus) + 2, DELAY_SECONDS_MINIMUM, DELAY_SECONDS_MAXIMUM)
        * (held ? HOLD_DELAY_SCALE : 1)
      : 0,
    // The hold, as this fish sees it. `held` is a finger that is still there;
    // `released` is one that has gone while this answer was still running;
    // `settled` is this fish having finished with a finger that has not.
    // `nearSeconds` is how long it has hovered at the presence, and it is the
    // only number here that accumulates - bounded at MAX_NEAR_SECONDS.
    held,
    released: false,
    settled: false,
    holdSeconds: held ? stimulus.holdSeconds : 0,
    nearSeconds: 0,
  };
}

/**
 * Carry an answer already under way across a re-read of a held press.
 *
 * A hold is re-assessed every so often (see `applyHold`), and most of the time
 * the assessment comes back saying what it said before. Rebuilding the record
 * then would restart the response, reset the beat a delayed responder is
 * counting down, and forget how long the fish has been hovering - the fish
 * would read as being startled afresh several times a second. So an unchanged
 * role keeps its record and only learns where the finger is now; a changed one
 * is rebuilt, keeping the thread the fish put down and the time it has spent
 * at the glass.
 */
export function mergeHoldAttention(previous, assigned, stimulus) {
  if (!assigned) return previous ?? null;
  const sameEvent = previous && previous.stimulusId === assigned.stimulusId;
  const carried = {
    resume: previous?.resume,
    nearSeconds: sameEvent ? previous.nearSeconds ?? 0 : 0,
  };
  if (sameEvent && previous.role === assigned.role) {
    return {
      ...previous,
      ...carried,
      x: stimulus.x,
      y: stimulus.y,
      held: true,
      released: false,
      holdSeconds: stimulus.holdSeconds,
    };
  }
  // A fish that stays engaged across a change of role keeps the patience it has
  // already spent. The record's age *is* that patience - it is what
  // `attentionEngagement` hands the interest score - so starting it over would
  // hand a fish that has been at the glass for ten seconds its full appetite
  // back, and a fish sitting near two thresholds would flip between coming and
  // hanging back every 0.6 s, moving its standoff instead of habituating.
  //
  // A fish that was *not* engaged has spent none of its patience on going, so
  // one that has just decided to go starts its clock now.
  const stayedEngaged = Boolean(sameEvent
    && !isPassiveRole(previous.role)
    && !isPassiveRole(assigned.role));
  return {
    ...assigned,
    ...carried,
    ageSeconds: stayedEngaged ? previous.ageSeconds : assigned.ageSeconds,
    // A fish that had gone to look and is now merely watching has not been
    // interrupted - it has had enough. That reads differently from a fish that
    // never went, so it is worth being able to tell them apart.
    settled: Boolean(sameEvent && attentionInvestigates(previous) && isPassiveRole(assigned.role)),
  };
}

/**
 * Which stage of a held press's arc this fish is in, or null for a tap.
 *
 * Derived, every frame, from the record and where the fish actually is. There
 * is nothing to keep in step and nothing that can be left behind: a fish that
 * turns back toward the glass is inspecting again, and one whose finger has
 * gone is departing from the moment it goes.
 */
export function holdPhase(attention, fish) {
  if (!attention) return null;
  // A fish that only ever glanced has nothing to depart from. The departure is
  // for the ones that were still answering when the finger went.
  if (attention.released) return isPassiveRole(attention.role) ? null : HOLD_PHASES.depart;
  if (!attention.held) return null;
  if (attention.settled) return HOLD_PHASES.settle;
  if (!attentionInvestigates(attention)) {
    // A watching fish that has run its patience out has straightened up and
    // gone back to its evening. The finger is still there; this fish is done
    // with it, which is a different thing from never having noticed it.
    if (holdHabituation(attention, fish) <= HABITUATION_SPENT) return HOLD_PHASES.settle;
    return attention.ageSeconds < NOTICE_SECONDS ? HOLD_PHASES.notice : HOLD_PHASES.orient;
  }
  const distance = Math.hypot(attention.x - fish.x, attention.y - fish.y);
  if (distance > INSPECT_RADIUS_CELLS + attentionStandoff(attention)) return HOLD_PHASES.approach;
  return attention.nearSeconds >= LINGER_SECONDS ? HOLD_PHASES.linger : HOLD_PHASES.inspect;
}

/**
 * How much of a held press this fish is still giving, in 0..1.
 *
 * The same patience that decides whether it goes over decides how long it holds
 * a turned head, so a fish does not go on staring at a finger it has stopped
 * finding interesting - and a hold cannot leave the cast bent toward the glass
 * for as long as a viewer cares to lean on it.
 */
export function holdHabituation(attention, fish) {
  if (!attention?.held) return 1;
  return holdFalloff(
    attention.holdSeconds,
    attentionPatience(traitsFromSeed(fish.seed, fish.history), affinitiesFromSeed(fish.seed)),
    0,
  );
}

/**
 * Give every fish a role for this stimulus.
 *
 * Returns one record per individual, aligned with `state.individuals`, with
 * `null` for fish that never noticed the event at all. `commitmentFor` says how
 * absorbed a fish is in what it is doing - it lives with the activities, which
 * is why it arrives as a function rather than a table read from here.
 */
export function assignAttention(state, stimulus, {
  commitmentFor = () => 0.3,
  // Whether a fish is forced to answer whatever its interest. A press must
  // always be answered, which is what this guarantees. A *re-read* of a press
  // that is still going on must not be: forcing an investigator every time the
  // aquarium looks at a finger it has already got used to would mean a hold
  // could never be ignored, and being able to ignore it is the last stage of
  // the arc and the reason a long hold costs nothing.
  guarantee = true,
} = {}) {
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
      engagedSeconds: attentionEngagement(one, stimulus),
      // The answer this fish is already giving this presence, if any. A fresh
      // press never finds one.
      previousRole: attentionEngagement(one, stimulus) === null ? null : one.attention.role,
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

  // The first responder is guaranteed: the most interested fish that noticed
  // and is free to answer, or - if the disturbance was too far from everyone -
  // the nearest free fish, who catches it anyway. A press is never ignored by
  // the whole aquarium, and it never costs a fish something it cannot repeat.
  const available = (candidate) => candidate.commitment < UNAVAILABLE_COMMITMENT;
  const ordered = rank(perceiving);
  const first = guarantee
    ? ordered.find(available)
      ?? candidates.filter(available).sort((left, right) => left.distance - right.distance
        || left.fish.seed - right.fish.seed)[0]
    : null;
  if (first) first.role = RESPONSE_ROLES.investigate;

  // A fish whose most trusted companion is already going is more likely to go
  // too. This is the second pass, so the bonus can depend on the first.
  const investigators = new Set(first ? [first.fish.seed] : []);
  for (const candidate of ordered) {
    if (candidate.role) continue;
    if (companionSeed(candidate.fish) !== null && investigators.has(companionSeed(candidate.fish))) {
      candidate.interest = attentionInterest(candidate.fish, stimulus, { ...candidate, companion: true });
    }
  }

  let primary = first ? 1 : 0;
  let secondary = 0;
  let delayed = 0;

  // A fish already answering this presence keeps the answer it is giving, as
  // long as it still wants to give it. Roles otherwise fall out of a ranking
  // against a cap, and two engaged fish either side of a threshold swap
  // `investigate` and `approach` between them on consecutive re-reads - which a
  // viewer sees as one fish jerking 2.7 cells in and out every half second
  // rather than as two fish hanging at the glass. Interest still decides
  // whether it keeps answering at all: a fish whose patience has run out fails
  // the threshold here and falls through to the ordinary assignment below, the
  // same as any other fish.
  for (const candidate of rank(ordered)) {
    if (candidate.role || !candidate.previousRole || !available(candidate)) continue;
    const { previousRole, interest } = candidate;
    const stays = (threshold) => interest >= threshold * HOLD_INCUMBENT_FRACTION;
    if (previousRole === RESPONSE_ROLES.investigate
      && stays(INVESTIGATE_THRESHOLD) && primary < MAX_INVESTIGATORS) {
      candidate.role = RESPONSE_ROLES.investigate;
      primary += 1;
      investigators.add(candidate.fish.seed);
    } else if (previousRole === RESPONSE_ROLES.approach
      && stays(APPROACH_THRESHOLD) && secondary < MAX_SECONDARY) {
      candidate.role = RESPONSE_ROLES.approach;
      secondary += 1;
    } else if (previousRole === RESPONSE_ROLES.delayed
      && stays(DELAYED_THRESHOLD) && delayed < MAX_DELAYED) {
      candidate.role = RESPONSE_ROLES.delayed;
      delayed += 1;
    }
  }

  for (const candidate of rank(ordered)) {
    if (candidate.role) continue;
    const { interest, commitment } = candidate;
    // An absorbed fish never sets off mid-mouthful. It either finishes and then
    // goes, or it watches from where it is - it does not become a second
    // investigator, whatever its interest. A fish that is not available at all
    // only ever watches.
    if (!available(candidate)) {
      candidate.role = passiveRole(candidate.fish, candidate.distance, candidate.traits, candidate.affinities);
      continue;
    }
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

/**
 * One frame older, or gone - and, for a held press, the place the fish finds
 * out that the finger has lifted.
 *
 * An answer to a presence does not expire while the presence is there: it is
 * renewed by every re-read, and between re-reads it simply keeps running. What
 * ends it is the stimulus no longer being held, which happens when the viewer
 * lifts their finger and also when the gesture stops confirming it at all (a
 * lost release, a cancelled contact). Both arrive here as the same thing, which
 * is why a dropped browser event cannot leave a fish attending forever.
 *
 * `stimulus` is the event this record points at, as the aquarium currently
 * holds it, or null once it has expired.
 */
export function ageAttention(attention, realDelta, { fish = null, stimulus = null } = {}) {
  if (!attention) return null;
  const ageSeconds = attention.ageSeconds + realDelta;
  if (attention.held) {
    if (stimulus?.held) {
      return {
        ...attention,
        // Bounded for the same reason the hold clock is: this one is read as
        // how much of its patience the fish has spent, and a number that only
        // grows is a leak however slowly it does it.
        ageSeconds: Math.min(MAX_HOLD_SECONDS, ageSeconds),
        holdSeconds: stimulus.holdSeconds,
        nearSeconds: nextNearSeconds(attention, fish, realDelta),
      };
    }
    // The finger has gone. The answer is not cancelled - it drains over the
    // window it was given, which is seeded per fish, so the responders leave
    // the glass one at a time. A delayed responder keeps whatever is left of
    // its beat rather than starting it again.
    //
    // A *passive* answer resumes draining from wherever its habituation had got
    // to, rather than from full. Starting it over would hand every fish that
    // had long since straightened up a fresh full-strength turn toward a
    // disturbance that had just stopped existing - fifteen animals twitching in
    // the same frame, which is the synchronised cast Stage 2 exists to end. A
    // fish whose patience was already spent simply lets the record go.
    const remaining = isPassiveRole(attention.role) && fish
      ? clamp(holdHabituation(attention, fish), 0, 1)
      : 1;
    return {
      ...attention,
      held: false,
      released: true,
      ageSeconds: attention.durationSeconds * (1 - remaining),
      delaySeconds: Math.max(0, attention.delaySeconds - attention.ageSeconds),
      nearSeconds: nextNearSeconds(attention, fish, realDelta),
    };
  }
  if (ageSeconds >= attention.durationSeconds) return null;
  return { ...attention, ageSeconds, nearSeconds: nextNearSeconds(attention, fish, realDelta) };
}

function nextNearSeconds(attention, fish, realDelta) {
  const near = attention.nearSeconds ?? 0;
  if (!fish) return near;
  const distance = Math.hypot(attention.x - fish.x, attention.y - fish.y);
  if (distance > INSPECT_RADIUS_CELLS + attentionStandoff(attention)) return near;
  return Math.min(MAX_NEAR_SECONDS, near + realDelta);
}

/** Whether this fish is on its way to the disturbance right now. */
export function attentionInvestigates(attention) {
  if (!attention) return false;
  if (attention.role === RESPONSE_ROLES.investigate || attention.role === RESPONSE_ROLES.approach) return true;
  return attention.role === RESPONSE_ROLES.delayed && attention.ageSeconds >= attention.delaySeconds;
}

/** How far short of the disturbance this responder stops. */
export function attentionStandoff(attention) {
  if (!attention) return 0;
  // A delayed investigator arrives late and hangs back like a secondary one.
  const base = attention.role === RESPONSE_ROLES.investigate ? 0 : SECONDARY_STANDOFF_CELLS;
  if (!attention.released) return base;
  // The finger has gone. The fish still goes to where it was - that is the
  // searching part - but the place it settles for opens out as its answer
  // drains, so it drifts back off the glass rather than switching off at it.
  const drained = clamp(attention.ageSeconds / Math.max(0.001, attention.durationSeconds), 0, 1);
  return base + DEPARTURE_STANDOFF_CELLS * drained;
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
  // A passive answer to a tap fades with the tap. A passive answer to a finger
  // that stays fades with the fish instead: it holds its turned head for as
  // long as it is interested and then quietly straightens out, which is the
  // same habituation that decides whether it goes over at all. Without this a
  // watching fish would hold an 0.85 radian bend for as long as the viewer
  // leant on the glass, and swim in a circle doing it.
  const envelope = attention.held
    ? holdHabituation(attention, fish)
    : role === RESPONSE_ROLES.acknowledge
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
  let rotation;
  if (away) {
    // Leaning away has to put water between the fish and the disturbance, and
    // it has to keep it there for as long as the fish is leaning. A fixed turn
    // off a heading that pointed at the press still points at the press, and a
    // turn that decays with the response swings back through the press on its
    // way out - both read as a slightly slower watch rather than a fish keeping
    // its distance.
    //
    // So the turn has two parts: enough to stop closing, which does not decay
    // while the response lives, and the lean on top of it, which does. The
    // whole thing is bounded at a quarter turn plus the lean, and it ends the
    // moment the response does.
    const toward = angleDifference(stimulusBearing, bearing);
    const side = toward === 0 ? (fish.seed & 1 ? 1 : -1) : Math.sign(toward);
    const stopClosing = Math.max(0, Math.PI / 2 - Math.abs(toward));
    rotation = side * (stopClosing + turn);
  } else {
    rotation = clamp(angleDifference(bearing, stimulusBearing), -turn, turn);
  }
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
