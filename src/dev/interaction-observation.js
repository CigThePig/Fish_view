/*
 * The interaction observation harness.
 *
 * Stage 2 rebuilds how the aquarium notices the person outside the glass, and
 * every claim it makes - this fish responded, that one only glanced, the tank
 * no longer moves as one animal, the renderer did not get worse for it - has to
 * be checkable by replaying the same pointer history against the same aquarium
 * and reading the numbers. That is what this is. It changes no production
 * behaviour: it drives `src/platform`, `src/sim` and `src/render` exactly as
 * the app does, and measures what comes out.
 *
 * Three ideas carry the whole file.
 *
 * **A pointer history is data.** A gesture is a short, bounded, sorted list of
 * `{ seconds, type, x, y }` events in world coordinates, capped at
 * POINTER_HISTORY_LIMIT, encodable to one line of text and replayable from it
 * months later. Nothing here samples a clock or a random number.
 *
 * **Every observation is a controlled experiment.** The same settled aquarium
 * is advanced twice from the same state: once with the pointer history and once
 * untouched. A fish drifts, a plant sways and a snail crawls in both runs, so
 * only the difference between them belongs to the interaction. Without the
 * control run, ordinary life reads as a response.
 *
 * **The interaction path has one seam.** `applyPointerEvent` is the only place
 * that turns a pointer event into aquarium state. It does what `src/app.js`
 * does - a primary press outside the developer hotspot calls `applyTouch`, and
 * movement, hold duration and release mean nothing - so the harness measures
 * the real product rather than an idealised one. Phase 1 rebuilt what
 * `applyTouch` does underneath, onto stimuli and impulses, and every scenario,
 * measurement and capture here went on reading the same numbers. That is the
 * point of having built it first.
 */

import { aquariumPoint } from "../platform/aquarium-input.js";
import { calculateDamage } from "../render/damage.js";
import { render } from "../render/render.js";
import { advanceAquariumHistory } from "../sim/aquarium-history.js";
import { createBubbleWorldRecords } from "../sim/bubbles.js";
import { DISPLAY, SUBSTRATE_ROWS, WATERLINE_ROWS } from "../sim/config.js";
import { clamp, traitsFromSeed } from "../sim/entities.js";
import { substrateSurfaceY } from "../sim/environment.js";
import { ACTIVITIES } from "../sim/fish-activities.js";
import { affinitiesFromSeed } from "../sim/fish-personality.js";
import { ROSTER_COMPLETE_DAY } from "../sim/fish-roster.js";
import { livingWorldRecords } from "../sim/living-world.js";
import { createPlantFrameContext, plantSpecies, posePlant } from "../sim/plants.js";
import { applyTouch, createAquariumState } from "../sim/state.js";
import { tick } from "../sim/tick.js";

// The production frame interval. Observations are measured in frames the device
// will actually draw, not in an integration step chosen for smoothness.
export const OBSERVATION_STEP_SECONDS = 0.1;

// A gesture is a short human act, not a recording session. Sixty-four events is
// a five-second drag sampled every tenth of a second with room to spare, and
// the cap is what keeps a "history" from quietly becoming an unbounded log.
export const POINTER_HISTORY_LIMIT = 64;

// How close a fish has to be to count as attending the stimulus. Roughly two
// body lengths of a grown fish: near enough that a watching adult would say it
// went to look.
export const NEAR_STIMULUS_RADIUS_CELLS = 4;

// Below these the two runs have not diverged: a fish that differs from its
// control twin by a hundredth of a cell, a hundredth of a cell per second, or
// half a degree of pitch is floating-point noise, not a response.
//
// Three channels rather than one because Phase 2's quietest responses are
// deliberately cheap: a fish that turns its nose toward a disturbance without
// leaving its line has answered it, and a measure that only watched position
// would file it as unaffected - undercounting exactly the responses the phase
// exists to add.
const DEVIATION_EPSILON_CELLS = 0.01;
const SPEED_EPSILON_CELLS_PER_SECOND = 0.01;
const PITCH_EPSILON_DEGREES = 0.5;

// A fish that ends up more than a body length from where it would have been is
// doing something visibly different. Anything smaller that still exceeds the
// epsilon is a glance, a slowed fin, a changed heading.
const STRONG_RESPONSE_CELLS = 1;

// Heading change fast enough to read as a turn rather than a curve.
const TURN_RATE_DEGREES_PER_SECOND = 60;

// Plants, bubbles and small residents are compared on a coarser cadence than
// the fish. Their responses last seconds, not frames, and posing thirty plants
// twice per frame would double the cost of an observation for a number that
// does not move that fast.
const ENVIRONMENT_SAMPLE_FRAMES = 5;

// Past the last arrival by more than the longest growth any fish can have, so
// "stocked" means a tank whose newest member has finished developing. The same
// definition tools/stocked-aquarium.mjs uses.
export const STOCKED_AQUARIUM_DAY = ROSTER_COMPLETE_DAY + 200;

const DEGREES = 180 / Math.PI;

/* ------------------------------------------------------------------ *
 * Pointer histories
 * ------------------------------------------------------------------ */

function pointerEvent(type, x, y, seconds) {
  return Object.freeze({ seconds: round(seconds, 3), type, x: round(x, 3), y: round(y, 3) });
}

function round(value, places) {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

/** A press and release at one point: the gesture the product has today. */
export function tap(x, y, { at = 0, holdSeconds = OBSERVATION_STEP_SECONDS } = {}) {
  return [pointerEvent("down", x, y, at), pointerEvent("up", x, y, at + holdSeconds)];
}

/** A press held still. The contact is sampled so a later phase can see duration. */
export function hold(x, y, { at = 0, seconds = 1.6, sampleSeconds = 0.2 } = {}) {
  const events = [pointerEvent("down", x, y, at)];
  for (let elapsed = sampleSeconds; elapsed < seconds; elapsed += sampleSeconds) {
    events.push(pointerEvent("move", x, y, at + elapsed));
  }
  events.push(pointerEvent("up", x, y, at + seconds));
  return events;
}

/**
 * A pointer dragged along a path. `seconds` is the whole gesture, so the same
 * path over 3 s is a slow drag and over 0.3 s is a swipe - the distinction the
 * plan asks for is speed, not a different event shape.
 */
export function drag(path, { at = 0, seconds = 3, sampleSeconds = OBSERVATION_STEP_SECONDS } = {}) {
  const points = path.filter((point) => Number.isFinite(point?.x) && Number.isFinite(point?.y));
  if (points.length < 2) throw new Error("a drag needs at least two points");
  const samples = Math.max(2, Math.round(seconds / sampleSeconds));
  const events = [pointerEvent("down", points[0].x, points[0].y, at)];
  for (let step = 1; step <= samples; step += 1) {
    const progress = step / samples;
    const position = alongPath(points, progress);
    events.push(pointerEvent(step === samples ? "up" : "move", position.x, position.y, at + progress * seconds));
  }
  return events;
}

/** A fast straight drag. */
export function swipe(from, to, { at = 0, seconds = 0.3 } = {}) {
  return drag([from, to], { at, seconds });
}

/** The same point tapped several times, the way a child tests a thing. */
export function repeatedTaps(x, y, { at = 0, count = 5, intervalSeconds = 0.6 } = {}) {
  const events = [];
  for (let index = 0; index < count; index += 1) {
    events.push(...tap(x, y, { at: at + index * intervalSeconds }));
  }
  return events;
}

function alongPath(points, progress) {
  const span = (points.length - 1) * clamp(progress, 0, 1);
  const index = Math.min(points.length - 2, Math.floor(span));
  const local = span - index;
  return {
    x: points[index].x + (points[index + 1].x - points[index].x) * local,
    y: points[index].y + (points[index + 1].y - points[index].y) * local,
  };
}

/**
 * Merge gesture fragments into one history: sorted, bounded, and rejected if it
 * is longer than a gesture. Every replay goes through here, so a history that
 * came off disk is checked the same way as one built in code.
 */
export function pointerHistory(...groups) {
  const events = groups.flat().filter(Boolean);
  for (const event of events) {
    if (!["down", "move", "up"].includes(event.type)) throw new Error(`unknown pointer event: ${event.type}`);
    if (!Number.isFinite(event.seconds) || event.seconds < 0) throw new Error("pointer events need a time in seconds");
    if (!Number.isFinite(event.x) || !Number.isFinite(event.y)) throw new Error("pointer events need world coordinates");
  }
  if (events.length > POINTER_HISTORY_LIMIT) {
    throw new Error(`pointer history of ${events.length} exceeds the ${POINTER_HISTORY_LIMIT}-event cap`);
  }
  return Object.freeze(events
    .map((event) => pointerEvent(event.type, event.x, event.y, event.seconds))
    .sort((left, right) => left.seconds - right.seconds));
}

/** One line of text per history, so a scenario in a report can be replayed. */
export function encodePointerHistory(history) {
  return history.map((event) => `${event.seconds}:${event.type[0]}:${event.x}:${event.y}`).join(" ");
}

export function decodePointerHistory(encoded) {
  const types = { d: "down", m: "move", u: "up" };
  const events = String(encoded).trim().split(/\s+/).filter(Boolean).map((token) => {
    const [seconds, type, x, y] = token.split(":");
    if (!(type in types)) throw new Error(`unknown pointer event code: ${type}`);
    return pointerEvent(types[type], Number(x), Number(y), Number(seconds));
  });
  return pointerHistory(events);
}

/* ------------------------------------------------------------------ *
 * The production interaction path
 * ------------------------------------------------------------------ */

// The canvas as the device presents it. A pointer history is authored in world
// cells, but it is delivered through the same mapping the browser uses, so a
// scenario exercises `aquariumPoint` - including its developer hotspot - rather
// than a convenient shortcut past it.
function displayRect(scale = 1) {
  return { left: 0, top: 0, width: DISPLAY.pixelWidth * scale, height: DISPLAY.pixelHeight * scale };
}

/** World cell -> the pointer event a browser would deliver for it. */
export function pointerEventForWorldPoint(x, y, rect = displayRect()) {
  return {
    clientX: rect.left + x / DISPLAY.cols * rect.width,
    clientY: rect.top + y / DISPLAY.rows * rect.height,
  };
}

/**
 * The one seam a gesture reaches the aquarium through.
 *
 * What the product does today, in full: a press outside the developer hotspot
 * registers a stimulus and a water impulse (Phase 1), steers the school and
 * forces every persistent fish into `touch-react` for the stimulus's 3.2
 * seconds. Movement and release are inert - not ignored by this harness, but
 * genuinely meaningless to the aquarium - which is why a hold and a swipe still
 * measure the same as the tap that began them. Phase 2 changes what the fish do
 * with the stimulus; Phases 3 and 4 give the rest of the gesture meaning here.
 */
export function applyPointerEvent(state, event, { rect = displayRect() } = {}) {
  const point = aquariumPoint(pointerEventForWorldPoint(event.x, event.y, rect), rect);
  if (point.hotspot) return { state, delivered: false, reason: "developer-hotspot" };
  if (event.type !== "down") return { state, delivered: false, reason: "inert-today" };
  return { state: applyTouch(state, point.x, point.y), delivered: true, reason: "touch", point };
}

/* ------------------------------------------------------------------ *
 * Aquariums to observe
 * ------------------------------------------------------------------ */

/**
 * An aquarium of a given age, settled for long enough that its arrivals have
 * finished swimming in and its cast is going about an ordinary evening. Every
 * observation starts from one of these rather than from a freshly created
 * state, because a tank that has just been generated is not one anybody is
 * watching.
 */
export function createObservationAquarium({
  seed = 5,
  days = STOCKED_AQUARIUM_DAY,
  wallClockHours = 12,
  settleSeconds = 60,
} = {}) {
  let state = advanceAquariumHistory(createAquariumState({ seed, wallClockHours }), days);
  const steps = Math.round(settleSeconds / OBSERVATION_STEP_SECONDS);
  for (let step = 0; step < steps; step += 1) state = tick(state, OBSERVATION_STEP_SECONDS);
  return state;
}

/**
 * Advance until a persistent fish is doing one of `activities` of its own
 * accord, and return the aquarium at that moment together with the fish.
 *
 * This is what makes "tap during feeding" a statement about the product rather
 * than about a fixture: the fish chose to feed, through ordinary selection, and
 * the tap lands on that. Returns null if the activity never came up inside the
 * budget, which is itself worth reporting.
 */
export function waitForActivity(state, activities, { maxSeconds = 600 } = {}) {
  const wanted = new Set([activities].flat());
  const steps = Math.round(maxSeconds / OBSERVATION_STEP_SECONDS);
  let current = state;
  for (let step = 0; step < steps; step += 1) {
    current = tick(current, OBSERVATION_STEP_SECONDS);
    const index = current.individuals.findIndex((fish) => wanted.has(fish.activity?.current));
    if (index >= 0) {
      return {
        state: current,
        index,
        fish: current.individuals[index],
        seconds: round((step + 1) * OBSERVATION_STEP_SECONDS, 1),
      };
    }
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Observation
 * ------------------------------------------------------------------ */

function heading(fish, fallback) {
  return Math.hypot(fish.vx, fish.vy) > 0.01 ? Math.atan2(fish.vy, fish.vx) : fallback;
}

function angleDifference(left, right) {
  let difference = right - left;
  while (difference > Math.PI) difference -= Math.PI * 2;
  while (difference < -Math.PI) difference += Math.PI * 2;
  return difference;
}

// How fast a fish is closing on the stimulus, positive toward it. Response is
// measured through this rather than through how far the two runs have drifted
// apart: two simulations that diverge once keep diverging forever, so raw
// separation grows all evening and would always peak on the last frame. The
// difference in closing speed between a touched fish and its untouched twin is
// what the interaction is doing *now*, and it decays when the response ends.
function closingSpeed(fish, point) {
  const dx = point.x - fish.x;
  const dy = point.y - fish.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 0.0001) return 0;
  return (dx * fish.vx + dy * fish.vy) / distance;
}

function centroid(fish) {
  if (!fish.length) return { x: 0, y: 0 };
  let x = 0;
  let y = 0;
  for (const one of fish) {
    x += one.x;
    y += one.y;
  }
  return { x: x / fish.length, y: y / fish.length };
}

function spread(fish) {
  if (!fish.length) return 0;
  const middle = centroid(fish);
  let total = 0;
  for (const one of fish) total += Math.hypot(one.x - middle.x, one.y - middle.y);
  return total / fish.length;
}

function plantTips(state) {
  const frameContext = createPlantFrameContext(state);
  return state.plants.map((plant) => {
    const pose = posePlant(plant, state, { frameContext });
    const tip = pose.joints.filter((point) => point.isTip).pop() ?? pose.joints.at(-1) ?? pose.root;
    return { seed: plant.seed, x: tip.x, y: tip.y, layer: plantSpecies(plant).layer };
  });
}

function createFishRecord(fish, stimulus) {
  const traits = traitsFromSeed(fish.seed, fish.history);
  return {
    id: fish.seed.toString(16),
    seed: fish.seed,
    traits: {
      boldness: round(traits.boldness, 3),
      sociability: round(traits.sociability, 3),
      activity: round(traits.activity, 3),
      preferredDepth: round(traits.preferredDepth, 3),
      curiosity: round(traits.curiosity, 3),
    },
    // What the aquarium already remembers about this fish and the glass. Phase 6
    // grows this into a relationship; today it is a touch tally and the drift
    // the nearest fish to a tap accumulates.
    glassAffinity: round(affinitiesFromSeed(fish.seed).glass, 3),
    familiarity: {
      touches: fish.history?.touches ?? 0,
      boldnessDrift: round(fish.history?.boldnessDrift ?? 0, 4),
      sociabilityDrift: round(fish.history?.sociabilityDrift ?? 0, 4),
      companions: fish.history?.socialMemory?.length ?? 0,
    },
    startActivity: fish.activity?.current ?? null,
    // The response role the aquarium gave this fish, and the one it was still
    // playing when the observation ended. Phase 2's whole claim is that these
    // differ from fish to fish.
    role: null,
    activityAfterInput: null,
    responseLatencySeconds: null,
    startDistance: stimulus ? round(Math.hypot(stimulus.x - fish.x, stimulus.y - fish.y), 2) : null,
    closestDistance: Number.POSITIVE_INFINITY,
    distanceTravelled: 0,
    averageSpeed: 0,
    peakSpeed: 0,
    peakAcceleration: 0,
    peakPitch: 0,
    turnDegrees: 0,
    turnCount: 0,
    secondsNearStimulus: 0,
    endingActivity: null,
    peakDeviation: 0,
    peakSpeedDeviation: 0,
    peakPitchDeviation: 0,
    endingDeviation: 0,
    outcome: "unaffected",
  };
}

// Did this fish answer at all, in any channel a person could see?
function responded(record) {
  return record.peakDeviation > DEVIATION_EPSILON_CELLS
    || record.peakSpeedDeviation > SPEED_EPSILON_CELLS_PER_SECOND
    || record.peakPitchDeviation > PITCH_EPSILON_DEGREES;
}

/**
 * Replay one pointer history against one aquarium and measure what it did.
 *
 * The treatment run receives the history; the control run is the same aquarium
 * left alone. Both are advanced frame for frame, so every number below is a
 * difference between two futures of the same evening rather than a reading off
 * a moving tank.
 */
export function observeInteraction(baseState, {
  history = [],
  observeSeconds = 12,
  stepSeconds = OBSERVATION_STEP_SECONDS,
  viewportScale = 1,
  // Called after every frame of the touched run with the state and the scene
  // that were just composed. The capture tool draws from here rather than
  // reimplementing the replay loop, so a captured frame is the frame that was
  // measured.
  onFrame = null,
} = {}) {
  const events = pointerHistory(history);
  const rect = displayRect(viewportScale);
  const frames = Math.round(observeSeconds / stepSeconds);
  const stimulus = events.find((event) => event.type === "down") ?? null;

  let treatment = baseState;
  let control = baseState;
  let scene = render(baseState);

  const fishRecords = new Map(baseState.individuals.map((fish) => [fish.seed, createFishRecord(fish, stimulus)]));
  const headings = new Map(baseState.individuals.map((fish) => [fish.seed, heading(fish, 0)]));
  const velocities = new Map(baseState.individuals.map((fish) => [fish.seed, { vx: fish.vx, vy: fish.vy }]));
  const turning = new Map(baseState.individuals.map((fish) => [fish.seed, false]));

  const delivery = { total: events.length, delivered: 0, inert: 0, hotspot: 0, byType: { down: 0, move: 0, up: 0 } };
  const timeline = [];
  const startBubbles = new Set(createBubbleWorldRecords(baseState).map((record) => record.id));

  const disturbedPlants = new Set();
  const createdBubbles = new Set();
  const disturbedBubbles = new Set();
  const disturbedResidents = new Set();

  let cursor = 0;
  let stimulusFrame = null;
  let damageTotal = 0;
  let damageWorst = 0;
  let rectangleTotal = 0;
  let fullFrames = 0;
  let objectsWorst = 0;
  let glyphsWorst = 0;
  let centroidDisplacement = 0;
  let spreadChange = 0;

  for (let frame = 1; frame <= frames; frame += 1) {
    const seconds = round(frame * stepSeconds, 3);

    // Events land between frames, exactly as a pointer event lands between two
    // animation frames in the app.
    while (cursor < events.length && events[cursor].seconds < seconds) {
      const event = events[cursor];
      cursor += 1;
      delivery.byType[event.type] += 1;
      const result = applyPointerEvent(treatment, event, { rect });
      treatment = result.state;
      if (result.delivered) {
        delivery.delivered += 1;
        if (stimulusFrame === null) stimulusFrame = frame;
      } else if (result.reason === "developer-hotspot") delivery.hotspot += 1;
      else delivery.inert += 1;
    }

    treatment = tick(treatment, stepSeconds);
    control = tick(control, stepSeconds);
    const nextScene = render(treatment);
    const damage = calculateDamage(scene, nextScene);
    const damagePercent = damage.area / damage.total * 100;
    damageTotal += damagePercent;
    damageWorst = Math.max(damageWorst, damagePercent);
    rectangleTotal += damage.rects.length;
    if (damage.full) fullFrames += 1;
    objectsWorst = Math.max(objectsWorst, nextScene.objects.length);
    glyphsWorst = Math.max(glyphsWorst, nextScene.glyphs.length);
    scene = nextScene;

    const controlBySeed = new Map(control.individuals.map((fish) => [fish.seed, fish]));
    let deviation = 0;
    let response = 0;
    let activityDivergence = 0;
    let holdingStimulusActivity = 0;

    for (const fish of treatment.individuals) {
      const record = fishRecords.get(fish.seed);
      if (!record) continue;
      const twin = controlBySeed.get(fish.seed);
      const speed = Math.hypot(fish.vx, fish.vy);
      const previousVelocity = velocities.get(fish.seed);
      const previousHeading = headings.get(fish.seed);
      const nextHeading = heading(fish, previousHeading);
      const turnRate = Math.abs(angleDifference(previousHeading, nextHeading)) * DEGREES / stepSeconds;

      record.distanceTravelled += speed * stepSeconds;
      record.peakSpeed = Math.max(record.peakSpeed, speed);
      record.peakAcceleration = Math.max(
        record.peakAcceleration,
        Math.hypot(fish.vx - previousVelocity.vx, fish.vy - previousVelocity.vy) / stepSeconds,
      );
      record.peakPitch = Math.max(record.peakPitch, Math.abs(fish.visual?.pitch ?? 0));
      record.turnDegrees += Math.abs(angleDifference(previousHeading, nextHeading)) * DEGREES;
      if (turnRate >= TURN_RATE_DEGREES_PER_SECOND) {
        if (!turning.get(fish.seed)) record.turnCount += 1;
        turning.set(fish.seed, true);
      } else if (turnRate < TURN_RATE_DEGREES_PER_SECOND * 0.5) {
        turning.set(fish.seed, false);
      }
      headings.set(fish.seed, nextHeading);
      velocities.set(fish.seed, { vx: fish.vx, vy: fish.vy });
      record.endingActivity = fish.activity?.current ?? null;

      if (stimulus && stimulusFrame !== null && frame >= stimulusFrame) {
        const distance = Math.hypot(stimulus.x - fish.x, stimulus.y - fish.y);
        record.closestDistance = Math.min(record.closestDistance, distance);
        if (distance <= NEAR_STIMULUS_RADIUS_CELLS) record.secondsNearStimulus += stepSeconds;
        if (record.activityAfterInput === null && frame === stimulusFrame) {
          record.activityAfterInput = fish.activity?.current ?? null;
          record.role = fish.attention?.role ?? "none";
        }
      }

      if (!twin) continue;
      const separation = Math.hypot(fish.x - twin.x, fish.y - twin.y);
      const speedSeparation = Math.abs(speed - Math.hypot(twin.vx, twin.vy));
      const pitchSeparation = Math.abs((fish.visual?.pitch ?? 0) - (twin.visual?.pitch ?? 0));
      const changedActivity = fish.activity?.current !== twin.activity?.current;
      deviation += separation;
      if (changedActivity) activityDivergence += 1;
      if (record.activityAfterInput !== null && fish.activity?.current === record.activityAfterInput
        && changedActivity) {
        holdingStimulusActivity += 1;
      }
      if (stimulus) response += Math.abs(closingSpeed(fish, stimulus) - closingSpeed(twin, stimulus));
      record.peakDeviation = Math.max(record.peakDeviation, separation);
      record.peakSpeedDeviation = Math.max(record.peakSpeedDeviation, speedSeparation);
      record.peakPitchDeviation = Math.max(record.peakPitchDeviation, pitchSeparation);
      record.endingDeviation = separation;
      const diverged = separation > DEVIATION_EPSILON_CELLS
        || speedSeparation > SPEED_EPSILON_CELLS_PER_SECOND
        || pitchSeparation > PITCH_EPSILON_DEGREES;
      if (record.responseLatencySeconds === null && stimulusFrame !== null
        && (diverged || changedActivity)) {
        record.responseLatencySeconds = round((frame - stimulusFrame + 1) * stepSeconds, 2);
      }
    }

    const treatmentCentroid = centroid(treatment.school);
    const controlCentroid = centroid(control.school);
    centroidDisplacement = Math.max(
      centroidDisplacement,
      Math.hypot(treatmentCentroid.x - controlCentroid.x, treatmentCentroid.y - controlCentroid.y),
    );
    const spreadDelta = spread(treatment.school) - spread(control.school);
    if (Math.abs(spreadDelta) > Math.abs(spreadChange)) spreadChange = spreadDelta;

    // The environment is compared on its own slower cadence; see the constant.
    if (frame % ENVIRONMENT_SAMPLE_FRAMES === 0) {
      const treatmentPlants = plantTips(treatment);
      const controlPlants = plantTips(control);
      treatmentPlants.forEach((plant, index) => {
        const twin = controlPlants[index];
        if (!twin) return;
        if (Math.hypot(plant.x - twin.x, plant.y - twin.y) > 0.02) disturbedPlants.add(plant.seed);
      });

      const treatmentBubbles = createBubbleWorldRecords(treatment);
      const controlBubbles = new Map(createBubbleWorldRecords(control).map((record) => [record.id, record]));
      for (const record of treatmentBubbles) {
        const twin = controlBubbles.get(record.id);
        if (!twin) {
          if (!startBubbles.has(record.id)) createdBubbles.add(record.id);
          continue;
        }
        if (Math.hypot(record.worldX - twin.worldX, record.worldY - twin.worldY) > 0.02) {
          disturbedBubbles.add(record.id);
        }
      }

      const controlResidents = new Map(livingWorldRecords(control).map((record) => [record.id, record]));
      for (const record of livingWorldRecords(treatment)) {
        const twin = controlResidents.get(record.id);
        if (!twin || Math.hypot(record.x - twin.x, record.y - twin.y) > 0.02) disturbedResidents.add(record.id);
      }
    }

    if (onFrame) onFrame({ frame, seconds, state: treatment, scene: nextScene, control });

    timeline.push({
      frame,
      seconds,
      deviation: round(deviation, 4),
      response: round(response, 4),
      activityDivergence,
      holdingStimulusActivity,
      damagePercent: round(damagePercent, 2),
      rectangles: damage.rects.length,
      full: damage.full,
      objects: nextScene.objects.length,
      glyphs: nextScene.glyphs.length,
    });
  }

  const fish = [...fishRecords.values()].map((record) => ({
    ...record,
    closestDistance: Number.isFinite(record.closestDistance) ? round(record.closestDistance, 2) : null,
    distanceTravelled: round(record.distanceTravelled, 2),
    averageSpeed: round(record.distanceTravelled / (frames * stepSeconds), 3),
    peakSpeed: round(record.peakSpeed, 3),
    peakAcceleration: round(record.peakAcceleration, 3),
    peakPitch: round(record.peakPitch, 1),
    turnDegrees: round(record.turnDegrees, 1),
    secondsNearStimulus: round(record.secondsNearStimulus, 1),
    peakDeviation: round(record.peakDeviation, 3),
    peakSpeedDeviation: round(record.peakSpeedDeviation, 3),
    peakPitchDeviation: round(record.peakPitchDeviation, 2),
    endingDeviation: round(record.endingDeviation, 3),
    outcome: classifyOutcome(record),
  }));

  return {
    pointer: {
      events: events.length,
      encoded: encodePointerHistory(events),
      ...delivery,
      stimulusSeconds: stimulusFrame === null ? null : round(stimulusFrame * stepSeconds, 2),
    },
    observeSeconds,
    frames,
    fish,
    aquarium: {
      individuals: baseState.individuals.length,
      school: baseState.school.length,
      plants: baseState.plants.length,
      totalDays: round(baseState.totalDays, 1),
      timeOfDayHours: round(baseState.timeOfDayHours, 2),
      // Strongly: went somewhere it would not otherwise have been. Weakly: any
      // visible difference at all - a slower line, a turned nose - without
      // leaving its course.
      respondingStrongly: fish.filter((one) => one.peakDeviation > STRONG_RESPONSE_CELLS).length,
      respondingWeakly: fish.filter((one) => one.peakDeviation <= STRONG_RESPONSE_CELLS && responded(one)).length,
      unaffected: fish.filter((one) => !responded(one)).length,
      // Counted from what was observed rather than from the role vocabulary, so
      // this harness can also be pointed at an older worktree that has no roles
      // in it - which is how one phase's numbers are compared with another's.
      roles: Object.fromEntries([...new Set(fish.map((one) => one.role).filter(Boolean))]
        .map((role) => [role, fish.filter((one) => one.role === role).length])),
      distinctRoles: new Set(fish.map((one) => one.role).filter(Boolean)).size,
      interrupted: fish.filter((one) => one.activityAfterInput === "touch-react").length,
      activitiesBefore: new Set(fish.map((one) => one.startActivity)).size,
      activitiesAfterInput: new Set(fish.map((one) => one.activityAfterInput ?? one.startActivity)).size,
      activitiesAtEnd: new Set(fish.map((one) => one.endingActivity)).size,
      schoolCentroidDisplacement: round(centroidDisplacement, 3),
      schoolSpreadChange: round(spreadChange, 3),
      plantsDisturbed: disturbedPlants.size,
      bubblesCreated: createdBubbles.size,
      bubblesDisturbed: disturbedBubbles.size,
      residentsAffected: disturbedResidents.size,
    },
    render: {
      averageDamagePercent: round(damageTotal / frames, 2),
      worstDamagePercent: round(damageWorst, 2),
      averageRectangles: round(rectangleTotal / frames, 2),
      fullRedraws: fullFrames,
      objects: objectsWorst,
      glyphs: glyphsWorst,
    },
    moments: semanticMoments(timeline, stimulusFrame),
    timeline,
  };
}

/**
 * How the fish left the interaction, in the terms the plan asks for: did the
 * behaviour it was doing resume, did it change into something else, or was it
 * replaced for the whole observation by whatever the input imposed?
 */
function classifyOutcome(record) {
  if (!responded(record)) return "unaffected";
  if (record.endingActivity === record.activityAfterInput
    && record.activityAfterInput !== record.startActivity) return "replaced";
  if (record.endingActivity === record.startActivity) return "resumed";
  return "changed";
}

/**
 * The six moments worth looking at, found in the observation rather than at
 * fixed percentages of it: the frame before the input, the first frame that
 * differs from the untouched aquarium, the response taking hold, its peak, the
 * point where most of it has drained away, and what is left at the end.
 */
export function semanticMoments(timeline, stimulusFrame) {
  if (!timeline.length) return [];
  const peak = timeline.reduce((best, entry) => (entry.response > best.response ? entry : best), timeline[0]);
  const responded = (entry) => entry.deviation > DEVIATION_EPSILON_CELLS || entry.activityDivergence > 0;
  const first = timeline.find(responded) ?? null;
  const early = first
    ? timeline.find((entry) => entry.frame >= first.frame && entry.response >= peak.response * 0.25) ?? first
    : null;
  // Recovery is the aquarium letting go: the response has largely drained and
  // no fish is still held in the activity the input imposed on it. The second
  // rule alone is the fallback, because a tank that is still coasting on a
  // stimulus it has formally released has recovered in the sense a viewer
  // means.
  const released = (entry) => entry.frame > peak.frame && entry.holdingStimulusActivity === 0;
  const recovery = timeline.find((entry) => released(entry) && entry.response <= peak.response * 0.5)
    ?? timeline.find(released)
    ?? null;
  const before = timeline.find((entry) => entry.frame === Math.max(1, (stimulusFrame ?? 1) - 1)) ?? timeline[0];

  const moments = [
    { moment: "before", entry: before },
    { moment: "first-response", entry: first },
    { moment: "early-response", entry: early },
    { moment: "peak-response", entry: peak.response > 0 ? peak : null },
    { moment: "recovery", entry: recovery },
    { moment: "aftermath", entry: timeline.at(-1) },
  ];
  return moments
    .filter((entry) => entry.entry)
    .map(({ moment, entry }) => ({
      moment,
      frame: entry.frame,
      seconds: entry.seconds,
      response: entry.response,
      deviation: entry.deviation,
      activityDivergence: entry.activityDivergence,
      holdingStimulusActivity: entry.holdingStimulusActivity,
      damagePercent: entry.damagePercent,
    }));
}

/* ------------------------------------------------------------------ *
 * Scenarios
 * ------------------------------------------------------------------ */

function midWaterY(state) {
  return WATERLINE_ROWS + (state.rows - SUBSTRATE_ROWS - WATERLINE_ROWS) * 0.5;
}

// applyTouch clamps a press to [2, rows - 5], so the lowest point a viewer can
// actually reach is one row above the sand. A "substrate tap" means that row,
// not an unreachable coordinate inside the gravel.
function substrateTapY(state, x) {
  return Math.min(state.rows - 5, substrateSurfaceY(state, x) - 0.5);
}

function tallestPlant(state) {
  return state.plants.reduce((best, plant) => (plant.matureHeight > (best?.matureHeight ?? 0) ? plant : best), null);
}

/**
 * The scenarios the plan requires, plus the gesture and context coverage the
 * harness has to prove it can drive. Each one resolves its own anchor from the
 * settled aquarium, so a scenario names an intent - "tap where that fish is
 * feeding" - rather than a coordinate that only means something for one seed.
 */
export const INTERACTION_SCENARIOS = Object.freeze([
  Object.freeze({
    id: "open-water-tap",
    label: "Open-water tap",
    context: "stocked",
    describe: "One tap at mid-depth, the plainest thing a viewer can do.",
    anchor: (state) => ({ x: state.cols / 2, y: midWaterY(state) }),
    gesture: (point) => tap(point.x, point.y, { at: 1 }),
  }),
  Object.freeze({
    id: "substrate-tap",
    label: "Substrate tap",
    context: "stocked",
    describe: "A tap on the sand, where the touch bubble burst is released.",
    anchor: (state) => ({ x: state.cols * 0.38, y: substrateTapY(state, state.cols * 0.38) }),
    gesture: (point) => tap(point.x, point.y, { at: 1 }),
  }),
  Object.freeze({
    id: "plant-tap",
    label: "Tap beside a plant",
    context: "stocked",
    describe: "A tap in the canopy of the tallest specimen, which already bends to touch.",
    anchor: (state) => {
      const plant = tallestPlant(state);
      return { x: plant.x, y: Math.max(3, substrateTapY(state, plant.x) - plant.matureHeight * 0.5) };
    },
    gesture: (point) => tap(point.x, point.y, { at: 1 }),
  }),
  Object.freeze({
    id: "repeated-taps",
    label: "Repeated taps",
    context: "stocked",
    observeSeconds: 14,
    describe: "Five taps at the same point, 0.6 s apart - the way a child tests a thing.",
    anchor: (state) => ({ x: state.cols * 0.62, y: midWaterY(state) }),
    gesture: (point) => repeatedTaps(point.x, point.y, { at: 1, count: 5, intervalSeconds: 0.6 }),
  }),
  Object.freeze({
    id: "mature-aquarium-tap",
    label: "Mature aquarium tap",
    context: "mature",
    describe: "The same tap in a ten-year tank: full roster, full plants, most to repaint.",
    anchor: (state) => ({ x: state.cols / 2, y: midWaterY(state) }),
    gesture: (point) => tap(point.x, point.y, { at: 1 }),
  }),
  Object.freeze({
    id: "new-aquarium-tap",
    label: "New aquarium tap",
    context: "new",
    describe: "The founder fish and a quarter school - the aquarium every viewer meets first.",
    anchor: (state) => ({ x: state.cols / 2, y: midWaterY(state) }),
    gesture: (point) => tap(point.x, point.y, { at: 1 }),
  }),
  Object.freeze({
    id: "night-tap",
    label: "Night tap",
    context: "night",
    describe: "The same tap at 02:00, when motion is slowed and the palette is inverted.",
    anchor: (state) => ({ x: state.cols / 2, y: midWaterY(state) }),
    gesture: (point) => tap(point.x, point.y, { at: 1 }),
  }),
  Object.freeze({
    id: "feeding-tap",
    label: "Tap during feeding",
    context: "stocked",
    waitFor: [ACTIVITIES.substrateSearch],
    describe: "A tap beside a fish that chose to work the sand.",
    gesture: (point) => tap(point.x, point.y, { at: 1 }),
  }),
  Object.freeze({
    id: "chase-tap",
    label: "Tap during a chase",
    context: "stocked",
    waitFor: [ACTIVITIES.playfulChase],
    describe: "A tap beside two fish already in a chase.",
    gesture: (point) => tap(point.x, point.y, { at: 1 }),
  }),
  Object.freeze({
    id: "rest-tap",
    label: "Tap during rest",
    context: "stocked",
    waitFor: [ACTIVITIES.openWaterRest, ACTIVITIES.plantShelter],
    describe: "A tap beside a resting fish - the interaction most able to feel like a shove.",
    gesture: (point) => tap(point.x, point.y, { at: 1 }),
  }),
  Object.freeze({
    id: "bubble-tap",
    label: "Tap during bubble investigation",
    context: "stocked",
    waitFor: [ACTIVITIES.bubbleInvestigate],
    describe: "A tap beside a fish following a bubble it found by itself.",
    gesture: (point) => tap(point.x, point.y, { at: 1 }),
  }),
  // Phase 1 gave the aquarium room for more than one live disturbance. Two
  // fingers, half a tank apart, is the smallest scenario that shows it: under
  // the single global reaction the second press erased the first.
  Object.freeze({
    id: "two-point-tap",
    label: "Two-point tap",
    context: "stocked",
    describe: "Two presses at once, half the tank between them.",
    anchor: (state) => ({ x: state.cols * 0.28, y: midWaterY(state) }),
    gesture: (point, state) => pointerHistory(
      tap(point.x, point.y, { at: 1 }),
      tap(state.cols * 0.72, point.y + 1.5, { at: 1 }),
    ),
  }),
  Object.freeze({
    id: "open-water-hold",
    label: "Hold",
    context: "stocked",
    describe: "A press held for 1.6 s. Everything after the press is inert today.",
    anchor: (state) => ({ x: state.cols * 0.44, y: midWaterY(state) }),
    gesture: (point) => hold(point.x, point.y, { at: 1, seconds: 1.6 }),
  }),
  Object.freeze({
    id: "slow-drag",
    label: "Slow drag",
    context: "stocked",
    describe: "A finger drawn across mid-water over 3 s.",
    anchor: (state) => ({ x: state.cols * 0.25, y: midWaterY(state) }),
    gesture: (point, state) => drag(
      [{ x: point.x, y: point.y }, { x: state.cols * 0.75, y: point.y - 2 }],
      { at: 1, seconds: 3 },
    ),
  }),
  Object.freeze({
    id: "fast-swipe",
    label: "Fast swipe",
    context: "stocked",
    describe: "The same path in 0.3 s.",
    anchor: (state) => ({ x: state.cols * 0.25, y: midWaterY(state) }),
    gesture: (point, state) => swipe(
      { x: point.x, y: point.y },
      { x: state.cols * 0.75, y: point.y - 2 },
      { at: 1, seconds: 0.3 },
    ),
  }),
]);

const CONTEXTS = Object.freeze({
  new: { days: 0, settleSeconds: 30, wallClockHours: 12 },
  stocked: { days: STOCKED_AQUARIUM_DAY, settleSeconds: 60, wallClockHours: 12 },
  mature: { days: 3650, settleSeconds: 60, wallClockHours: 12 },
  night: { days: STOCKED_AQUARIUM_DAY, settleSeconds: 60, wallClockHours: 2 },
});

export function observationContext(name) {
  const context = CONTEXTS[name];
  if (!context) throw new Error(`unknown observation context: ${name}`);
  return context;
}

/**
 * Resolve a scenario into the aquarium it observes and the history it replays.
 *
 * `baseFor(context)` hands back a settled aquarium; the caller owns the cache,
 * because advancing a decade of history is the expensive part of a sweep and
 * several scenarios share the same tank.
 */
export function prepareScenario(scenario, baseFor, { waitSeconds = 600 } = {}) {
  let state = baseFor(scenario.context);
  let precondition = null;

  if (scenario.waitFor) {
    const found = waitForActivity(state, scenario.waitFor, { maxSeconds: waitSeconds });
    if (!found) return { scenario, state, history: null, precondition: { activity: scenario.waitFor, reached: false } };
    state = found.state;
    precondition = {
      activity: found.fish.activity.current,
      reached: true,
      seconds: found.seconds,
      fish: found.fish.seed.toString(16),
    };
  }

  // A scenario that waited for a behaviour taps beside the fish doing it; one
  // that did not resolves its own point from the settled tank.
  const anchor = scenario.anchor
    ? scenario.anchor(state)
    : nearFish(state, state.individuals.find((fish) => scenario.waitFor.includes(fish.activity?.current)));

  return {
    scenario,
    state,
    precondition,
    anchor: { x: round(anchor.x, 2), y: round(anchor.y, 2) },
    history: pointerHistory(scenario.gesture(anchor, state)),
  };
}

// Beside the fish rather than on top of it: a viewer points at what they are
// looking at, and a point exactly on a fish would measure the clamp rather than
// the response.
function nearFish(state, fish) {
  return {
    x: clamp(fish.x + 1.5, 1, state.cols - 1),
    y: clamp(fish.y - 1, 2, state.rows - 5),
  };
}

/** One scenario, prepared and observed. */
export function runScenario(scenario, baseFor, options = {}) {
  const prepared = prepareScenario(scenario, baseFor, options);
  if (!prepared.history) {
    return { id: scenario.id, label: scenario.label, describe: scenario.describe, ...prepared, observation: null };
  }
  const observation = observeInteraction(prepared.state, {
    history: prepared.history,
    observeSeconds: scenario.observeSeconds ?? options.observeSeconds ?? 12,
  });
  return {
    id: scenario.id,
    label: scenario.label,
    describe: scenario.describe,
    context: scenario.context,
    precondition: prepared.precondition,
    anchor: prepared.anchor,
    observation,
  };
}

/** A cache of settled aquariums, so a sweep advances each history once. */
export function aquariumCache(seed) {
  const cache = new Map();
  return (name) => {
    if (!cache.has(name)) cache.set(name, createObservationAquarium({ seed, ...observationContext(name) }));
    return cache.get(name);
  };
}
