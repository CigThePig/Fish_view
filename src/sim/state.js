import { PLANT_SPECIES_BY_ID } from "../art/plants.js";
import {
  advanceAquariumHistory,
  createContentState,
  inferredFishAgeDays,
  sanitizeContent,
} from "./aquarium-history.js";
import {
  DEFAULT_SEED,
  DRIVE_MAXIMUM,
  DRIVE_MINIMUM,
  INITIAL_INDIVIDUAL_COUNT,
  MAX_INDIVIDUALS,
  TOUCH_FLOOR_ROWS,
  WATERLINE_ROWS,
  DISPLAY,
  sanitizeSettings,
} from "./config.js";
import { clamp, createIndividual, createIndividualFromSeed, createSchoolFish } from "./entities.js";
import { assignAttention, attentionInvestigates, mergeHoldAttention } from "./attention.js";
import { classifyStimulusContext } from "./interaction-context.js";
import {
  HOLD_MOVEMENT_CELLS,
  HOLD_THRESHOLD_SECONDS,
  MAX_HOLD_SECONDS,
  WAKE_MINIMUM_SPEED,
  createInteractionState,
  heldStimulus,
  latestTouchStimulus,
  refreshContact,
  registerTouch,
  rememberPointerPath,
  registerWake,
  releaseStimulus,
  wakeIsDue,
} from "./interaction-events.js";
import {
  GESTURES,
  SWIPE_ENTER_SPEED,
  classifyGesture,
  extendPointerPath,
  pathMotion,
} from "./pointer-path.js";
import {
  ACTIVITIES,
  BEHAVIORS,
  activityCommitment,
  createActivityState,
  defaultActivityForBehavior,
} from "./fish-activities.js";
import { MAX_FISH_PITCH_DEGREES, substrateSafeY, surfaceSafeY } from "./fish-motion.js";
import { fishSpriteWidth } from "./fish-growth.js";
import { schoolCountFor } from "./fish-roster.js";
import { affinitiesFromSeed, sanitizeSocialMemory } from "./fish-personality.js";
import {
  createPlantFromSeed,
  createPlant,
  plantCapFor,
  plantCountFor,
  plantVariationFromSeed,
} from "./plants.js";
import { hashSeed, mix32 } from "./prng.js";

export const PERSISTENCE_VERSION = 2;

export function createAquariumState({
  seed = DEFAULT_SEED,
  wallClockHours = 12,
  settings = {},
} = {}) {
  const dimensions = DISPLAY;
  const numericSeed = typeof seed === "number" ? seed >>> 0 : hashSeed(seed);
  const mergedSettings = sanitizeSettings(settings);
  // A quarter of the school it will grow into. `schoolCount` is the size the
  // aquarium fills up to over its first months, not the size it opens at, so a
  // new tank is deliberately sparse and visibly gains company week by week.
  const school = Array.from({ length: schoolCountFor(mergedSettings.schoolCount, 0) }, (_, index) =>
    createSchoolFish(numericSeed, index, dimensions.cols, dimensions.rows),
  );
  const individuals = Array.from({ length: INITIAL_INDIVIDUAL_COUNT }, (_, index) =>
    createIndividual(numericSeed, index, dimensions.cols, dimensions.rows),
  ).map((fish, index) => {
    const world = { ...dimensions, seed: numericSeed, elapsedRealSeconds: 0 };
    const halfWidth = fishSpriteWidth(fish) / 2;
    const x = clamp(fish.x, halfWidth, dimensions.cols - halfWidth);
    const top = surfaceSafeY(fish, world, x);
    const floor = substrateSafeY(fish, world, x);
    const bottom = index < 3 ? WATERLINE_ROWS + (floor - WATERLINE_ROWS) * 0.68 : floor;
    return { ...fish, x, y: clamp(fish.y, top, Math.max(top, bottom)) };
  });
  const plants = Array.from({ length: plantCountFor() }, (_, index) =>
    createPlant(numericSeed, index, dimensions.cols, dimensions.rows),
  );

  return {
    version: 2,
    seed: numericSeed,
    rngState: mix32(numericSeed ^ 0x27d4eb2f),
    cols: dimensions.cols,
    rows: dimensions.rows,
    elapsedRealSeconds: 0,
    elapsedSimSeconds: 0,
    totalDays: 0,
    timeOfDayHours: ((finite(wallClockHours, 12) % 24) + 24) % 24,
    settings: mergedSettings,
    school,
    individuals,
    plants,
    // Bounded long-horizon bookkeeping. This is a processing cursor, not a
    // hidden user-facing statistic, and it cannot grow with aquarium age.
    content: createContentState(),
    // Transient interaction events. Never serialised, capped, and cleared by a
    // reload or an offline gap - see src/sim/interaction-events.js.
    ...createInteractionState(),
  };
}

function normalizeVector(x, y) {
  const length = Math.hypot(x, y) || 1;
  return { x: x / length, y: y / length };
}

/*
 * A press is three points, not one, and every clamp between them loses
 * something a different caller needs.
 *
 * `pointerX/Y` is where the pointer actually is, unclamped and possibly outside
 * the aquarium entirely - a captured pointer goes on reporting after the finger
 * leaves the canvas. Only the hold's movement allowance reads it, and it has to:
 * measured on anything clamped, a finger dragged off the edge of the glass sits
 * still at the boundary and a ten-cell drag reads as a stationary hold.
 *
 * `pressX/Y` is that point brought inside the aquarium. It decides what the
 * press *landed on*, which is a question about the world and so cannot be asked
 * about a point outside it.
 *
 * `safeX/Y` is where a fish can actually be sent, clamped out of the gravel and
 * up off the waterline. Classifying this one made a press on the surface read as
 * open water whenever the wave sat a hundredth of a row too low.
 */
function pressPoint(state, x, y) {
  const pressX = clamp(x, 0, state.cols - 1);
  const pressY = clamp(y, 0, state.rows - 1);
  return {
    pointerX: x,
    pointerY: y,
    pressX,
    pressY,
    safeX: pressX,
    safeY: clamp(pressY, WATERLINE_ROWS, state.rows - TOUCH_FLOOR_ROWS),
  };
}

export function applyTouch(state, x, y) {
  const { pointerX, pointerY, pressX, pressY, safeX, safeY } = pressPoint(state, x, y);

  // A press is three things: water that moves, something the inhabitants can
  // notice, and - now - a role for each of them. All of it happens in the frame
  // the press arrives, because a viewer must never wait a tick to be
  // acknowledged, and because a response chosen a frame later would be a
  // response to an aquarium that had already moved.
  const context = classifyStimulusContext(state, pressX, pressY);
  const events = registerTouch(state, safeX, safeY, context, { pointerX, pointerY });
  const stimulus = events.stimulus;
  const attention = assignAttention({ ...state, stimuli: events.stimuli }, stimulus, {
    commitmentFor: (fish) => activityCommitment(fish.activity?.current),
  });

  // The school drifts toward a disturbance it is near and ignores one across
  // the tank. It used to swing at every tap wherever it fell, which is most of
  // what made a tap look like a summons.
  const school = state.school.map((fish) => {
    const distance = Math.hypot(stimulus.x - fish.x, stimulus.y - fish.y);
    const reach = clamp(1 - distance / stimulus.radius, 0, 1);
    if (reach <= 0) return fish;
    const direction = normalizeVector(stimulus.x - fish.x, stimulus.y - fish.y);
    const speed = state.settings.schoolSpeed * (1 + 0.18 * reach);
    return {
      ...fish,
      vx: fish.vx + (direction.x * speed - fish.vx) * reach,
      vy: fish.vy + (direction.y * speed - fish.vy) * reach,
    };
  });

  let nearestIndex = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;
  const individuals = state.individuals.map((fish, index) => {
    const distance = Math.hypot(stimulus.x - fish.x, stimulus.y - fish.y);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
    // A fish that is already answering an earlier press keeps that answer,
    // whatever this press does to it. A response has its own seeded life and
    // ends when it is spent: a press somewhere else must not cut short a lean
    // or a glance, and it must not overwrite the activity a responder put down
    // with the `touch-react` it is currently in - recovery would have nothing
    // to resume, and a second tap would quietly cost the fish its thread.
    const answering = fish.activity?.current === ACTIVITIES.touchReact;
    const carried = fish.attention?.resume ?? null;
    const assigned = attention[index];
    const role = assigned
      ? (carried ? { ...assigned, resume: carried } : assigned)
      : fish.attention ?? null;
    const base = {
      ...fish,
      drives: { ...fish.drives },
      history: {
        ...fish.history,
        socialMemory: sanitizeSocialMemory(fish.history?.socialMemory, fish.seed),
      },
      behavior: { ...fish.behavior },
      visual: { ...fish.visual },
      attention: role,
    };
    // Only the fish that are going anywhere are turned toward the disturbance.
    // Everything else keeps the activity and the heading it had; its response
    // is shaped into that motion by src/sim/attention.js on the next frame,
    // which is what a fish noticing something actually looks like.
    if (!attentionInvestigates(role)) return base;
    const direction = normalizeVector(stimulus.x - fish.x, stimulus.y - fish.y);
    const glassAffinity = affinitiesFromSeed(fish.seed).glass;
    // What it was doing when it turned, carried by the response so it has
    // somewhere to go back to when the response is over - the thread it was
    // already holding if this is not the first press it has answered.
    const resume = carried
      ?? (answering ? null : fish.activity)
      ?? createActivityState(defaultActivityForBehavior(fish.behavior.current));
    return {
      ...base,
      attention: { ...role, resume },
      vx: direction.x * (0.58 + glassAffinity * 0.22),
      vy: direction.y * (0.38 + glassAffinity * 0.14),
      activity: {
        ...createActivityState(ACTIVITIES.touchReact, fish.activity?.current ?? fish.behavior.current),
        targetType: "touch",
        targetId: stimulus.id,
        targetX: stimulus.x,
        targetY: stimulus.y,
      },
    };
  });

  // The fish nearest the glass when it was tapped is the one that remembers it.
  // Phase 6 turns this drift into a relationship; today it is the same two
  // hundredths of boldness it has always been.
  const chosen = individuals[nearestIndex];
  individuals[nearestIndex] = {
    ...chosen,
    history: {
      ...chosen.history,
      touches: chosen.history.touches + 1,
      boldnessDrift: clamp(chosen.history.boldnessDrift + 0.0025, 0, 0.18),
      sociabilityDrift: clamp(chosen.history.sociabilityDrift + 0.001, 0, 0.12),
    },
  };

  return {
    ...state,
    school,
    individuals,
    stimuli: events.stimuli,
    impulses: events.impulses,
    interactionSequence: events.interactionSequence,
  };
}

/*
 * A press that stays, and a press that goes somewhere.
 *
 * The gesture keeps the clock - a simulation may not read one - and tells the
 * aquarium three things: the finger is still down, it is here, and it has been
 * for this long. Everything else is decided from state, so replaying the same
 * three numbers replays the same aquarium.
 *
 * There is one verb for a contact that is still down because there is one
 * contact. What it *means* is read from the contact itself, and there is no
 * mode to enter and nothing the viewer has to know:
 *
 * - A press is a **tap** until it has stayed put past HOLD_THRESHOLD_SECONDS.
 * - A press that stays inside HOLD_MOVEMENT_CELLS of where it landed becomes a
 *   **presence** - Phase 3, unchanged, down to the stimulus keeping the
 *   position the press landed on rather than following the finger.
 * - A press that leaves that allowance becomes a **gesture with a direction in
 *   it**, and from then on it is one: the allowance is latched, so a finger
 *   that wanders and comes back to rest is a drag that stopped rather than a
 *   presence that started late. Which gesture it is - a slow point of interest
 *   or water being shoved - is read from the speed along the bounded path, in
 *   bands with hysteresis so a hand slowing down does not change the meaning of
 *   what it is doing four times on the way (src/sim/pointer-path.js).
 *
 * Once it is anything but a tap the event is refreshed in place rather than
 * re-registered, so a minute of leaning on the glass and a drag across the tank
 * both cost exactly one stimulus, and the aquarium re-reads it on a slow beat
 * rather than every frame.
 *
 * The re-read is what gives a contact an arc. A fish that was busy finishes and
 * comes over; a fish whose companion is already at the glass follows it; a fish
 * that has had enough hands over to one that has not. None of it needs a new
 * mechanism - it is the Phase 2 assignment, run again against a disturbance
 * that has not gone away, against interest that has habituated since.
 */

// How often a contact that is still down is re-read. Six times a second would
// make the cast twitch and cost fifteen scores a frame; every 0.6 s is slower
// than a fish changes its mind and fast enough that a late arrival reads as a
// decision rather than a delay. A gesture that *changes* - a press that starts
// moving, a drag that becomes a swipe - is re-read the frame it changes, off
// the beat, because a shove that is answered a half second late is not answered.
export const HOLD_REVIEW_SECONDS = 0.6;

/**
 * The finger is still down, at this point, this many seconds after the press.
 *
 * Called every frame a contact is live. Returns the state unchanged while the
 * press is still only a tap that has not moved; from the moment it is either a
 * presence or a gesture, this is the whole of what a contact does to the
 * aquarium between the press and the release.
 */
export function applyContact(state, x, y, seconds) {
  const elapsed = clamp(Number.isFinite(seconds) ? seconds : 0, 0, MAX_HOLD_SECONDS);
  const existing = heldStimulus(state) ?? latestTouchStimulus(state);
  if (!existing || existing.released) return state;

  // How far the finger has travelled from where it landed, measured on the
  // unclamped pointer at both ends. Three things are wrong with any other
  // reading. From where the finger was a *frame* ago, every finger is always
  // nearly still. On the point the aquarium *acts* on, a finger drawn three
  // rows through the gravel does not move at all. And on the point clamped to
  // the aquarium's own bounds, a captured pointer dragged off the edge of the
  // glass parks at the boundary - so a ten-cell drag off the side of the tank
  // reads as a stationary hold.
  //
  // This is asked before the press is old enough to be a hold, not after,
  // because the allowance is about the whole press. A finger that darts three
  // cells away a fifth of a second in and is back on its anchor by the time
  // anyone looks has moved, and asking only at the threshold would promote it
  // to a presence anyway. So the answer is latched on the event.
  const { pointerX, pointerY, safeX, safeY } = pressPoint(state, x, y);
  const anchorX = existing.pointerX ?? existing.x;
  const anchorY = existing.pointerY ?? existing.y;
  const moving = existing.wandered
    || Math.hypot(pointerX - anchorX, pointerY - anchorY) > HOLD_MOVEMENT_CELLS;

  // The path is kept for every contact, moving or not, because a press that
  // starts moving needs the history behind it the frame it does - not a
  // ten-second-old anchor and nothing in between. It is built on the point a
  // fish can actually be sent to: a fish chases where the finger has been, and
  // where the finger has been has to be inside the water.
  const path = extendPointerPath(existing.path, safeX, safeY, elapsed);
  const motion = pathMotion(path);

  if (!moving) {
    if (!existing.held && elapsed < HOLD_THRESHOLD_SECONDS) {
      return { ...state, stimuli: rememberPointerPath(state.stimuli, existing, path) };
    }
    return reviewContact(state, existing, elapsed, {
      // A presence keeps the position it landed on. The path goes on being
      // written all the same, because the frame the finger leaves the allowance
      // is the frame that history has to be there - not a ten-second-old anchor
      // and nothing in between.
      stimuli: refreshContact(state.stimuli, { ...existing, path }, elapsed, null),
      becoming: !existing.held,
      impulses: state.impulses,
    });
  }

  const gesture = classifyGesture(existing.gesture, motion.speed);
  const anchored = existing.wandered ? existing : { ...existing, wandered: true };
  const stimuli = refreshContact(state.stimuli, anchored, elapsed, {
    x: safeX,
    y: safeY,
    gesture,
    path,
    speed: motion.speed,
    dirX: motion.dirX,
    dirY: motion.dirY,
    curvature: motion.curvature,
  });

  return reviewContact(
    // Everyone already answering this contact learns where it is now, every
    // frame, not on the re-read beat. The beat is slow on purpose - it decides
    // *who* answers - but where a fish believes the disturbance is has to keep
    // up with a disturbance it can see moving. Left to the beat, a swipe that
    // is over in a third of a second leaves every responder remembering the
    // first third of it, and the moment the finger lifts they turn back to
    // that instead of to where it went. It is also what a watching fish tips
    // its nose at, so at the beat's pace a passive answer to a drag jerks
    // rather than follows.
    { ...state, individuals: followContact(state.individuals, stimuli, existing.id) },
    existing,
    elapsed,
    {
      stimuli,
      // A gesture that has just changed what it is gets an answer this frame
      // rather than on the next beat. A swipe is over in a third of a second,
      // and an aquarium that noticed one half a second later did not notice it.
      becoming: !existing.held || gesture !== existing.gesture,
      impulses: wakeFor(state, { x: safeX, y: safeY, gesture, motion }),
    },
  );
}

/**
 * Move every answer to this contact to where the contact now is.
 *
 * Only the remembered point moves. Which fish are answering, how long they have
 * been at it, and how much patience they have spent are all the re-read's
 * business and are left alone - this is the difference between a fish keeping
 * track of a moving finger and a fish being startled by it afresh every frame.
 */
function followContact(individuals, stimuli, id) {
  const stimulus = stimuli.find((entry) => entry.id === id);
  if (!stimulus) return individuals;
  return individuals.map((fish) => {
    const record = fish.attention;
    if (!record || record.stimulusId !== id) return fish;
    if (record.x === stimulus.x && record.y === stimulus.y) return fish;
    return { ...fish, attention: { ...record, x: stimulus.x, y: stimulus.y } };
  });
}

/**
 * Water pushed along behind a moving finger, if the water is due any.
 *
 * A drag leans the stems it passes; a swipe carries bubbles and the school with
 * it. Both are the same event with a different strength, taken from how fast
 * the finger is going, and both are rationed by `wakeIsDue` so that the number
 * of them in the water does not depend on how long the viewer drags.
 */
function wakeFor(state, { x, y, gesture, motion }) {
  if (gesture === GESTURES.press) return state.impulses;
  if (motion.speed < WAKE_MINIMUM_SPEED) return state.impulses;
  if (!wakeIsDue(state, x, y, motion.speed)) return state.impulses;
  return registerWake(state, {
    x,
    y,
    dirX: motion.dirX,
    dirY: motion.dirY,
    strength: clamp(motion.speed / SWIPE_ENTER_SPEED, 0, 1),
    contact: y >= state.rows - TOUCH_FLOOR_ROWS - 0.01 ? "substrate" : "water",
    // From the aquarium and the place, not from the gesture, so a finger drawn
    // twice along the same shelf of sand lifts the same grit both times.
    seed: mix32(state.seed ^ Math.imul(Math.round(x * 64) + 1, 0x9e3779b1)),
  });
}

/**
 * Re-read a contact that is still down, on the beat.
 *
 * The same Phase 2 assignment, against a disturbance that has not gone away and
 * interest that has habituated since. Only the records change: a fish that has
 * just been given an investigating role turns on the next tick, through the
 * same path a delayed investigator converts through - there is no press
 * arriving this frame that has to be answered before the aquarium moves again.
 */
function reviewContact(state, existing, elapsed, { stimuli, impulses, becoming }) {
  const stimulus = stimuli.find((entry) => entry.id === existing.id);
  // The beat, counted off the contact clock itself rather than off a stored
  // deadline, so the re-reads of a replayed gesture land on the same seconds as
  // the re-reads of the gesture that was replayed.
  const beat = Math.floor(elapsed / HOLD_REVIEW_SECONDS);
  const due = becoming || beat !== Math.floor(existing.holdSeconds / HOLD_REVIEW_SECONDS);
  if (!due) return { ...state, stimuli, impulses };

  const attention = assignAttention({ ...state, stimuli }, stimulus, {
    commitmentFor: (fish) => activityCommitment(fish.activity?.current),
    // Nothing is compelled to answer a finger it has already got used to. The
    // press that started this contact was answered; whether the aquarium is
    // still answering a minute later is the aquarium's business.
    guarantee: false,
  });
  const individuals = state.individuals.map((fish, index) => {
    const merged = mergeHoldAttention(fish.attention ?? null, attention[index], stimulus);
    return merged === (fish.attention ?? null) ? fish : { ...fish, attention: merged };
  });

  return { ...state, stimuli, impulses, individuals };
}

/**
 * The finger has gone.
 *
 * The stimulus stops being held and starts fading, and the water rings once
 * more where the contact was. Nothing is done to the fish here: each one finds
 * out on its next tick that what it was answering is no longer there, and each
 * one takes its own seeded while to let go of it. That is the aftermath - a
 * responder finishing its approach to a place something just was, hanging at it
 * a moment, and drifting back off the glass.
 */
export function applyRelease(state) {
  const held = heldStimulus(state);
  if (!held) return state;
  const released = releaseStimulus(state, held);
  return { ...state, stimuli: released.stimuli, impulses: released.impulses };
}

export function withSettings(state, patch) {
  return {
    ...state,
    settings: sanitizeSettings(patch, state.settings),
  };
}

export function serializePersistentState(state) {
  return {
    persistenceVersion: PERSISTENCE_VERSION,
    seed: state.seed,
    rngState: state.rngState,
    elapsedSimSeconds: state.elapsedSimSeconds,
    totalDays: state.totalDays,
    timeOfDayHours: state.timeOfDayHours,
    settings: { ...state.settings },
    individuals: state.individuals.map((fish) => ({
      seed: fish.seed,
      // The one biological value growth needs. Which stage that age has reached,
      // how fast this fish grows, and how far it will ever grow are all derived
      // from the seed, so none of them is written to disk.
      ageDays: fish.ageDays,
      x: fish.x,
      y: fish.y,
      vx: fish.vx,
      vy: fish.vy,
      drives: { ...fish.drives },
      history: {
        touches: fish.history.touches,
        boldnessDrift: fish.history.boldnessDrift,
        sociabilityDrift: fish.history.sociabilityDrift,
        socialMemory: sanitizeSocialMemory(fish.history.socialMemory, fish.seed)
          .map((entry) => ({ ...entry })),
      },
      behavior: { ...fish.behavior },
      visual: { ...fish.visual },
    })),
    // Animated joints are reconstructed from this compact biological record.
    // Keeping the fields explicit prevents transient render data from leaking
    // into long-lived saves as the plant renderer evolves.
    plants: state.plants.map((plant) => ({
      seed: plant.seed,
      speciesId: plant.speciesId,
      x: plant.x,
      ageDays: plant.ageDays,
      matureHeight: plant.matureHeight,
      layer: plant.layer,
      phase: plant.phase,
      frequency: plant.frequency,
      sway: plant.sway,
      lean: plant.lean,
      stiffness: plant.stiffness,
      secondaryPhase: plant.secondaryPhase,
      paletteSlot: plant.paletteSlot,
    })),
    content: { ...state.content },
  };
}

function finite(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function stableSeed(value, fallback) {
  return Number.isSafeInteger(value) && value >= 0 && value <= 0xffffffff
    ? value >>> 0
    : fallback >>> 0;
}

// Beyond the content horizon, additional precision carries no visible history.
// Bounding imported clocks also prevents finite JSON numbers overflowing later
// when converted into seconds, phases, or render coordinates.
const MAX_SAVED_DAYS = 10_000_000;
const savedAge = (value, fallback = 0) => clamp(finite(value, fallback), 0, MAX_SAVED_DAYS);
const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

function validBehavior(value, fallback = "cruise") {
  return BEHAVIORS.includes(value) ? value : fallback;
}

export function restorePersistentState(baseState, saved) {
  if (!saved || (saved.persistenceVersion !== 1 && saved.persistenceVersion !== PERSISTENCE_VERSION)) return baseState;
  if (saved.seed !== baseState.seed || (saved.orientation !== undefined && saved.orientation !== "landscape")) return baseState;
  if (!Array.isArray(saved.individuals) || !Array.isArray(saved.plants)) return baseState;

  // Ages are reconstructed against the save's own aquarium age, so read it
  // before the roster rather than after it.
  const totalDays = savedAge(saved.totalDays);
  const originals = new Map(baseState.individuals.map((fish) => [fish.seed, fish]));
  const sources = saved.individuals.slice(0, MAX_INDIVIDUALS);
  const reserved = new Set(sources.filter((fish) => record(fish)
    && stableSeed(fish.seed, -1) === fish.seed).map((fish) => fish.seed));
  const seen = new Set();
  const individuals = sources.flatMap((source, index) => {
    let fish = record(source) ? source : {};
    const slot = baseState.individuals[index];
    let seed = stableSeed(fish.seed, -1);
    if (seed !== fish.seed || seen.has(seed)) {
      // Repair a damaged original slot without replacing another valid saved
      // identity or resetting all of the aquarium's learned history.
      if (!slot || seen.has(slot.seed) || reserved.has(slot.seed)) return [];
      fish = {};
      seed = slot.seed;
    }
    seen.add(seed);
    const fallback = originals.get(seed)
      ?? createIndividualFromSeed(seed, index, baseState.cols, baseState.rows);
    const currentBehavior = validBehavior(fish.behavior?.current);
    const previousBehavior = validBehavior(fish.behavior?.previous, currentBehavior);
    return {
      seed,
      // A save written before growth existed carries no age. It is not lost:
      // the initial cast has been aging since the aquarium was created and an
      // arrival since its own milestone day, so the age is reconstructed rather
      // than reset - an old aquarium comes back with the grown fish it earned.
      ageDays: savedAge(fish.ageDays, inferredFishAgeDays(baseState.seed, seed, totalDays)),
      x: clamp(finite(fish.x, fallback.x), 0, baseState.cols),
      y: clamp(finite(fish.y, fallback.y), 0, baseState.rows),
      vx: clamp(finite(fish.vx, fallback.vx), -2.4, 2.4),
      vy: clamp(finite(fish.vy, fallback.vy), -2.4, 2.4),
      forageDip: 0,
      drives: {
        hunger: clamp(finite(fish.drives?.hunger, fallback.drives.hunger), DRIVE_MINIMUM, DRIVE_MAXIMUM),
        energy: clamp(finite(fish.drives?.energy, fallback.drives.energy), DRIVE_MINIMUM, DRIVE_MAXIMUM),
        social: clamp(finite(fish.drives?.social, fallback.drives.social), DRIVE_MINIMUM, DRIVE_MAXIMUM),
      },
      history: {
        touches: Math.max(0, Math.round(finite(fish.history?.touches, 0))),
        boldnessDrift: clamp(finite(fish.history?.boldnessDrift, 0), 0, 0.18),
        sociabilityDrift: clamp(finite(fish.history?.sociabilityDrift, 0), 0, 0.12),
        socialMemory: sanitizeSocialMemory(fish.history?.socialMemory, seed),
      },
      behavior: {
        current: currentBehavior,
        previous: previousBehavior,
        blend: clamp(finite(fish.behavior?.blend, 1), 0, 1),
        ageSeconds: clamp(finite(fish.behavior?.ageSeconds, 0), 0, MAX_SAVED_DAYS * 86400),
        ageRealSeconds: clamp(finite(fish.behavior?.ageRealSeconds, 0), 0, MAX_SAVED_DAYS * 86400),
      },
      // Activity targets are visual intentions, not durable biology. Rebuild a
      // safe broad-behavior default instead of resuming yesterday's bubble or
      // retaining an object reference from a malformed save.
      activity: createActivityState(defaultActivityForBehavior(currentBehavior)),
      visual: {
        facing: fish.visual?.facing === -1 ? -1 : fish.visual?.facing === 1 ? 1 : (finite(fish.vx, fallback.vx) < 0 ? -1 : 1),
        targetFacing: fish.visual?.targetFacing === -1 ? -1 : fish.visual?.targetFacing === 1
          ? 1
          : (finite(fish.vx, fallback.vx) < 0 ? -1 : 1),
        turnProgress: clamp(finite(fish.visual?.turnProgress, 1), 0, 1),
        pitch: clamp(finite(fish.visual?.pitch, 0), -MAX_FISH_PITCH_DEGREES, MAX_FISH_PITCH_DEGREES),
        targetPitch: clamp(finite(fish.visual?.targetPitch, 0), -MAX_FISH_PITCH_DEGREES, MAX_FISH_PITCH_DEGREES),
      },
    };
  });

  // A save that came back with nothing usable still has to come back with the
  // fish the aquarium was founded on. Everything the calendar has since been
  // through is restored by the zero-length advance at the end of this function,
  // so this only has to cover the founder rather than reconstruct a whole cast.
  if (!individuals.length) {
    for (const fish of baseState.individuals) {
      if (seen.has(fish.seed)) continue;
      individuals.push({ ...fish, ageDays: savedAge(inferredFishAgeDays(baseState.seed, fish.seed, totalDays)) });
      seen.add(fish.seed);
    }
  }
  const availableSeeds = new Set(individuals.map((fish) => fish.seed));
  const normalizedIndividuals = individuals.map((fish) => ({
    ...fish,
    history: {
      ...fish.history,
      socialMemory: sanitizeSocialMemory(fish.history.socialMemory, fish.seed, availableSeeds),
    },
  }));

  const plants = saved.persistenceVersion === 1
    ? restoreLegacyPlants(baseState, saved)
    : restoreDynamicPlants(baseState, saved);

  const restored = {
    ...baseState,
    rngState: finite(saved.rngState, baseState.rngState) >>> 0,
    elapsedSimSeconds: clamp(finite(saved.elapsedSimSeconds, 0), 0, MAX_SAVED_DAYS * 86400),
    totalDays,
    timeOfDayHours: ((finite(saved.timeOfDayHours, baseState.timeOfDayHours) % 24) + 24) % 24,
    settings: sanitizeSettings(saved.settings, baseState.settings),
    individuals: normalizedIndividuals,
    plants,
    content: sanitizeContent(saved.content, { totalDays, seed: baseState.seed }),
  };

  // A zero-length advance resolves nothing new, but it does materialize the
  // bounded one-time milestones an older save is already overdue for. That is
  // what keeps a long-lived aquarium restored from an older save from being
  // stuck at the fish it was written with, and it is a no-op for a save that
  // already recorded them.
  return advanceAquariumHistory(restored, 0);
}

// Version 1 stored maxHeight and no species or motion traits. Its positions and
// ages are retained while the missing compact traits come from the
// deterministic version-2 specimen occupying the same layout slot, so the
// original roster is what an old save comes back as.
function restoreLegacyPlants(baseState, saved) {
  const restored = baseState.plants.map((fallback, index) => {
    const plant = saved.plants[index];
    if (!plant || typeof plant !== "object") return fallback;
    const speciesId = typeof plant.speciesId === "string" && Object.hasOwn(PLANT_SPECIES_BY_ID, plant.speciesId)
      ? plant.speciesId
      : fallback.speciesId;
    const species = PLANT_SPECIES_BY_ID[speciesId];
    return {
      ...fallback,
      seed: finite(plant.seed, fallback.seed) >>> 0,
      speciesId,
      x: clamp(finite(plant.x, fallback.x), 0.35, baseState.cols - 0.35),
      ageDays: savedAge(plant.ageDays, fallback.ageDays),
      matureHeight: clamp(
        finite(plant.matureHeight, finite(plant.maxHeight, fallback.matureHeight)),
        1.2,
        baseState.rows - 6.5,
      ),
      layer: species.layer,
      phase: finite(plant.phase, fallback.phase),
      frequency: clamp(finite(plant.frequency, fallback.frequency), 0.15, 0.55),
      sway: clamp(finite(plant.sway, fallback.sway), 0.55, 1.45),
      lean: clamp(finite(plant.lean, fallback.lean), -0.4, 0.4),
      stiffness: clamp(finite(plant.stiffness, fallback.stiffness), 0.65, 1.35),
      secondaryPhase: finite(plant.secondaryPhase, fallback.secondaryPhase),
      paletteSlot: Math.round(clamp(finite(plant.paletteSlot, fallback.paletteSlot), 0, 2)),
    };
  });
  const reserved = new Set(restored.map((plant) => plant.seed));
  const seen = new Set();
  return restored.map((plant) => {
    // A duplicate legacy seed gives two plants one target/persistence identity.
    // Repair that slot without taking an identity reserved by a later record.
    const repaired = seen.has(plant.seed)
      ? baseState.plants.find((candidate) => !reserved.has(candidate.seed) && !seen.has(candidate.seed))
      : plant;
    seen.add(repaired.seed);
    return repaired;
  });
}

// A Phase 3 garden grows, so restoration can no longer rebuild it from the
// original habitat roster: doing that would silently delete every
// propagated shoot and every delayed rare plant on the next reload. A plant's
// identity is its stable seed, never its array position, so the saved roster is
// what comes back - validated field by field, deduplicated by seed, and capped.
// A plant whose seed matches an original specimen still falls back to that
// specimen for anything the save is missing, which is what keeps an existing
// garden byte-identical across the upgrade.
function restoreDynamicPlants(baseState, saved) {
  const originals = new Map(baseState.plants.map((plant) => [plant.seed >>> 0, plant]));
  const cap = plantCapFor();
  const seen = new Set();
  const plants = [];

  for (const plant of saved.plants) {
    if (plants.length >= cap) break;
    if (!plant || typeof plant !== "object") continue;
    if (!Number.isSafeInteger(plant.seed) || plant.seed < 0 || plant.seed > 0xffffffff) continue;
    const seed = plant.seed >>> 0;
    if (seen.has(seed)) continue;
    const fallback = originals.get(seed) ?? null;
    const speciesId = typeof plant.speciesId === "string" && Object.hasOwn(PLANT_SPECIES_BY_ID, plant.speciesId)
      ? plant.speciesId
      : fallback?.speciesId;
    if (!speciesId) continue;
    if (!Number.isFinite(plant.x) && !fallback) continue;
    if (!Number.isFinite(plant.ageDays) && !fallback) continue;
    seen.add(seed);

    // Motion traits are cheap to re-derive and impossible to guess wrong: a
    // corrupt field falls back to the plant's own seeded variation rather than
    // to another specimen's animation.
    const derived = plantVariationFromSeed(seed);
    const base = fallback ?? createPlantFromSeed({
      seed,
      speciesId,
      x: clamp(finite(plant.x, baseState.cols / 2), 0.35, baseState.cols - 0.35),
      ageDays: savedAge(plant.ageDays),
      rows: baseState.rows,
      matureHeight: plant.matureHeight,
    });
    plants.push({
      ...base,
      seed,
      speciesId,
      x: clamp(finite(plant.x, base.x), 0.35, baseState.cols - 0.35),
      ageDays: savedAge(plant.ageDays, base.ageDays),
      matureHeight: clamp(
        finite(plant.matureHeight, base.matureHeight),
        1.2,
        baseState.rows - 6.5,
      ),
      // Depth group is a species property, never a saved one.
      layer: PLANT_SPECIES_BY_ID[speciesId].layer,
      phase: finite(plant.phase, derived.phase),
      frequency: clamp(finite(plant.frequency, derived.frequency), 0.15, 0.55),
      sway: clamp(finite(plant.sway, derived.sway), 0.55, 1.45),
      lean: clamp(finite(plant.lean, derived.lean), -0.4, 0.4),
      stiffness: clamp(finite(plant.stiffness, derived.stiffness), 0.65, 1.35),
      secondaryPhase: finite(plant.secondaryPhase, derived.secondaryPhase),
      paletteSlot: Math.round(clamp(finite(plant.paletteSlot, derived.paletteSlot), 0, 2)),
    });
  }

  return plants.length ? plants : baseState.plants;
}

// Catch-up, never a neglect simulation. A month away costs an aquarium nothing:
// no fish is lost, no plant dies, no relationship is punished, and no milestone
// that fell inside the gap is missed. Locomotion is deliberately not replayed -
// a fish that arrived while the device was off simply resumes near the edge it
// entered from, so the next viewer effectively sees it joining.
export function advanceOffline(state, realSeconds) {
  const seconds = clamp(finite(realSeconds, 0), 0, 365 * 86400);
  if (seconds <= 0) return state;
  const days = seconds / 86400;
  const hour = (state.timeOfDayHours + seconds / 3600) % 24;
  const circadianEnergy = 0.48 + Math.max(0, Math.sin(((hour - 6) / 24) * Math.PI * 2)) * 0.2;
  // The same shared resolver the live tick uses, so a week spent offline and a
  // week spent accelerated reach the same aquarium.
  const advanced = advanceAquariumHistory(state, days);

  return {
    ...advanced,
    elapsedSimSeconds: state.elapsedSimSeconds + seconds,
    timeOfDayHours: hour,
    // A gesture cannot survive the device being off. The counter does, so ids
    // stay unique across a resume.
    stimuli: Object.freeze([]),
    impulses: Object.freeze([]),
    individuals: advanced.individuals.map(({ exhale, ...fish }) => ({
      ...fish,
      forageDip: 0,
      drives: {
        hunger: clamp(fish.drives.hunger + days * 0.03, DRIVE_MINIMUM, DRIVE_MAXIMUM),
        energy: clamp(fish.drives.energy * 0.7 + circadianEnergy * 0.3, DRIVE_MINIMUM, DRIVE_MAXIMUM),
        social: clamp(fish.drives.social + days * 0.015, DRIVE_MINIMUM, DRIVE_MAXIMUM),
      },
      history: {
        ...fish.history,
        socialMemory: sanitizeSocialMemory(fish.history?.socialMemory, fish.seed)
          .map((entry) => ({ ...entry })),
      },
      behavior: { ...fish.behavior },
      // A response to a press from before the device was off is not a response
      // to anything.
      attention: null,
      // Transient intentions are rebuilt rather than resumed, with one
      // exception: a fish that arrived during the gap keeps its entry swim, so
      // the next viewer sees it joining instead of finding it already parked.
      activity: fish.activity?.current === ACTIVITIES.arrivalEnter
        ? { ...fish.activity }
        : createActivityState(defaultActivityForBehavior(fish.behavior.current)),
      visual: { ...fish.visual },
    })),
  };
}
