import { bubbleWaterTop, createBubbleWorldRecords } from "../sim/bubbles.js";
import { clamp } from "../sim/entities.js";
import {
  ACTIVITIES,
  plantTargetPosition,
  resolveActivityTarget,
} from "../sim/fish-activities.js";
import { plantHeight } from "../sim/plants.js";
import { createAquariumState } from "../sim/state.js";
import { tick } from "../sim/tick.js";
import { substrateSafeY, surfaceSafeY } from "../sim/fish-motion.js";
import { hashSeed } from "../sim/prng.js";

// Every entry point into the lab starts from this one scene. Fish traits,
// plants, bubble opportunities, routes, and timings are all seed-derived, so a
// capture or a readability run made against a different default would grade a
// tank nobody is looking at.
export const SHOWCASE_SEED_LABEL = "visible-intention-lab";
export const SHOWCASE_DEFAULT_SEED = hashSeed(SHOWCASE_SEED_LABEL);

const SUBJECT_INDEX = 3;
const SUBSTRATE_APPROACH_ROWS = 2.6;
const COMPANION_INDEX = 4;
const FORAGE_PREVIEW_SPANS = Object.freeze([0.5, 20]);

export const SHOWCASE_SCENARIOS = Object.freeze([
  Object.freeze({ id: "cruise", label: "Cruise", subjects: [SUBJECT_INDEX], loopSeconds: 8 }),
  Object.freeze({ id: "open-water-wander", label: "Open-water wander", subjects: [SUBJECT_INDEX], loopSeconds: 8 }),
  Object.freeze({ id: "bubble-investigate", label: "Bubble investigation", subjects: [SUBJECT_INDEX], loopSeconds: 8.3 }),
  Object.freeze({ id: "plant-investigate", label: "Plant investigation", subjects: [SUBJECT_INDEX], loopSeconds: 8.2 }),
  Object.freeze({ id: "plant-weave", label: "Plant weave", subjects: [SUBJECT_INDEX], loopSeconds: 9.5 }),
  Object.freeze({ id: "school-follow", label: "School follow", subjects: [SUBJECT_INDEX], loopSeconds: 10 }),
  Object.freeze({ id: "individual-follow", label: "Individual follow", subjects: [SUBJECT_INDEX, COMPANION_INDEX], loopSeconds: 10 }),
  Object.freeze({ id: "companion-cruise", label: "Companion cruise", subjects: [SUBJECT_INDEX, COMPANION_INDEX], loopSeconds: 10 }),
  // Long enough to show the whole arc: the closing run, the break when the
  // chaser arrives, and the two fish drifting apart again.
  Object.freeze({ id: "playful-chase", label: "Playful chase", subjects: [SUBJECT_INDEX, COMPANION_INDEX], loopSeconds: 9.5 }),
  // Long enough to show the whole arc now that the graze line is measured to
  // the mouth and sits the better part of two rows lower: the descent, the
  // arrival, and enough of the creep along the sand for several strikes. At
  // fifteen seconds the loop was almost entirely descent.
  Object.freeze({ id: "substrate-search", label: "Substrate search", subjects: [SUBJECT_INDEX], loopSeconds: 20 }),
  Object.freeze({ id: "surface-investigate", label: "Surface investigation", subjects: [SUBJECT_INDEX], loopSeconds: 13 }),
  Object.freeze({ id: "open-water-rest", label: "Open-water rest", subjects: [SUBJECT_INDEX], loopSeconds: 9 }),
  Object.freeze({ id: "plant-shelter", label: "Plant shelter", subjects: [SUBJECT_INDEX], loopSeconds: 10 }),
  Object.freeze({ id: "touch-react", label: "Touch reaction", subjects: [SUBJECT_INDEX], loopSeconds: 3 }),
  Object.freeze({ id: "arrival-enter", label: "Arrival entry", subjects: [SUBJECT_INDEX], loopSeconds: 8 }),
]);

const SCENARIO_BY_ID = new Map(SHOWCASE_SCENARIOS.map((scenario) => [scenario.id, scenario]));

export function showcaseScenario(id) {
  return SCENARIO_BY_ID.get(id) ?? SHOWCASE_SCENARIOS[0];
}

function behaviorState(current, previous = current, source = null) {
  return {
    current,
    previous,
    blend: 1,
    ageSeconds: source?.ageSeconds ?? 0,
    ageRealSeconds: source?.ageRealSeconds ?? 0,
  };
}

function activityState(current, target = {}, source = null) {
  return {
    current,
    previous: source?.current ?? current,
    ageRealSeconds: source?.current === current ? source.ageRealSeconds : 0,
    targetType: target.targetType ?? null,
    targetId: target.targetId ?? null,
    targetX: target.targetX ?? null,
    targetY: target.targetY ?? null,
  };
}

function safePosition(fish, state, x, y) {
  const safeX = clamp(x, 4.5, state.cols - 4.5);
  const top = surfaceSafeY(fish, state, safeX);
  const bottom = substrateSafeY(fish, state, safeX);
  return {
    x: safeX,
    y: clamp(y, Math.min(top, bottom), Math.max(top, bottom)),
  };
}

// Poses are authored for the grown fish the lab shows, so clearance-relative
// placement has to measure the same body posedFish() will place.
function adult(fish) {
  return { ...fish, ageDays: Math.max(500, fish.ageDays ?? 0) };
}

function posedFish(fish, state, {
  x = fish.x,
  y = fish.y,
  vx = fish.vx,
  vy = fish.vy,
  behavior = "cruise",
  activity = ACTIVITIES.cruise,
  target = {},
  preserveAge = false,
} = {}) {
  const grown = adult(fish);
  const point = safePosition(grown, state, x, y);
  return {
    ...grown,
    ...point,
    vx,
    vy,
    drives: {
      hunger: behavior === "forage" ? 0.82 : 0.44,
      energy: behavior === "rest" ? 0.28 : 0.78,
      social: behavior === "social" ? 0.8 : 0.44,
    },
    behavior: behaviorState(
      behavior,
      fish.behavior?.current ?? behavior,
      preserveAge && fish.behavior?.current === behavior ? fish.behavior : null,
    ),
    activity: activityState(activity, target, preserveAge ? fish.activity : null),
    visual: {
      ...fish.visual,
      facing: vx < 0 ? -1 : 1,
      targetFacing: vx < 0 ? -1 : 1,
      turnProgress: 1,
    },
  };
}

function foragePreviewFish(fish, state, preserveAge) {
  let best = null;
  for (let x = 4.5; x <= state.cols - 4.5; x += 0.5) {
    const candidate = posedFish(fish, state, {
      x,
      y: substrateSafeY(adult(fish), state, x) - SUBSTRATE_APPROACH_ROWS,
      vx: 0.16,
      vy: 0.08,
      behavior: "forage",
      activity: ACTIVITIES.substrateSearch,
      preserveAge,
    });
    const candidateState = {
      ...state,
      individuals: state.individuals.map((other, index) => index === SUBJECT_INDEX ? candidate : other),
    };
    const targets = FORAGE_PREVIEW_SPANS.map((searchSpanColumns) => resolveActivityTarget(
      candidate,
      SUBJECT_INDEX,
      {
        ...candidateState,
        choreographyTuning: { scene: { [ACTIVITIES.substrateSearch]: { searchSpanColumns } } },
      },
      candidate.activity,
    ));
    if (targets.some((target) => !target)) continue;
    const separation = Math.abs(targets[0].x - targets[1].x);
    if (!best || separation > best.separation) best = { fish: candidate, separation };
  }
  return best?.fish ?? posedFish(fish, state, {
    x: state.cols * 0.48,
    y: substrateSafeY(adult(fish), state, state.cols * 0.48) - SUBSTRATE_APPROACH_ROWS,
    vx: 0.16,
    vy: 0.08,
    behavior: "forage",
    activity: ACTIVITIES.substrateSearch,
    preserveAge,
  });
}

function bubbleOpportunity(initial, subject) {
  const adult = { ...subject, ageDays: Math.max(500, subject.ageDays ?? 0) };
  const desiredPopSeconds = 7.6;
  let selected = null;
  for (let offset = 0; offset <= 90; offset += 0.5) {
    const candidateState = { ...initial, elapsedRealSeconds: initial.elapsedRealSeconds + offset };
    const candidates = createBubbleWorldRecords(candidateState)
      .filter((bubble) => bubble.phase === "rise"
        && ["stream", "isolated", "touch"].includes(bubble.kind)
        && bubble.worldY <= substrateSafeY(adult, candidateState, bubble.worldX) - 3.25
        && bubble.worldY >= surfaceSafeY(adult, candidateState, bubble.worldX) + 1.4);
    for (const bubble of candidates) {
      const popSeconds = Math.max(0, (bubble.worldY - bubbleWaterTop()) / bubble.speed);
      const score = Math.abs(popSeconds - desiredPopSeconds);
      if (!selected || score < selected.score
        || (score === selected.score && bubble.id.localeCompare(selected.bubble.id) < 0)) {
        selected = { state: candidateState, bubble, score };
      }
    }
  }
  return selected
    ? { state: selected.state, bubble: selected.bubble }
    : { state: initial, bubble: null };
}

function showcasePlant(state) {
  return [...state.plants]
    .filter((plant) => plantHeight(plant) >= 2.4)
    .sort((left, right) => (
      Math.abs(left.x - state.cols / 2) - Math.abs(right.x - state.cols / 2)
      || plantHeight(right) - plantHeight(left)
      || left.seed - right.seed
    ))[0] ?? state.plants[0];
}

function showcaseShelterPlant(state, fish) {
  return [...state.plants]
    .sort((left, right) => plantHeight(right) - plantHeight(left) || left.seed - right.seed)
    .find((plant) => resolveActivityTarget(
      adult(fish),
      SUBJECT_INDEX,
      state,
      activityState(ACTIVITIES.plantShelter, { targetType: "plant", targetId: plant.seed }),
    )) ?? showcasePlant(state);
}

function quietBackgroundFish(fish, index, state) {
  const lane = state.rows * (0.35 + (index % 3) * 0.13);
  const point = safePosition(fish, state, fish.x, lane);
  return posedFish(fish, state, {
    ...point,
    vx: index % 2 ? -0.035 : 0.035,
    vy: 0,
    behavior: "rest",
    activity: ACTIVITIES.openWaterRest,
    target: { targetType: "waypoint", targetX: point.x, targetY: point.y },
  });
}

function socialPair(individuals, state, activity, { chase = false } = {}) {
  const chaser = individuals[SUBJECT_INDEX];
  const companion = individuals[COMPANION_INDEX];
  const centerY = state.rows * 0.5;
  const direction = 1;
  const companionX = state.cols * 0.56;
  const gap = chase ? 5.2 : activity === ACTIVITIES.individualFollow ? 5.5 : 1.1;
  const verticalGap = activity === ACTIVITIES.companionCruise ? 1.85 : 0;
  individuals[COMPANION_INDEX] = posedFish(companion, state, {
    x: companionX,
    y: centerY + verticalGap,
    vx: direction * (chase ? 0.34 : 0.38),
    vy: 0,
    behavior: activity === ACTIVITIES.companionCruise ? "social" : "cruise",
    activity: activity === ACTIVITIES.companionCruise ? activity : ACTIVITIES.cruise,
    target: activity === ACTIVITIES.companionCruise
      ? { targetType: "fish", targetId: chaser.seed }
      : {},
  });
  individuals[SUBJECT_INDEX] = posedFish(chaser, state, {
    x: companionX - gap,
    y: centerY - verticalGap,
    vx: direction * (chase ? 0.46 : 0.3),
    vy: 0,
    behavior: "social",
    activity,
    target: { targetType: "fish", targetId: companion.seed },
  });
}

function configureScenario(initial, scenarioId, { preserveAge = false } = {}) {
  const scenario = showcaseScenario(scenarioId);
  let state = initial;
  let bubble = null;
  if (scenario.id === ACTIVITIES.bubbleInvestigate) {
    const opportunity = bubbleOpportunity(state, state.individuals[SUBJECT_INDEX]);
    state = opportunity.state;
    bubble = opportunity.bubble;
  }

  state = {
    ...state,
    timeOfDayHours: 12,
    plants: state.plants.map((plant) => ({ ...plant, ageDays: Math.max(360, plant.ageDays ?? 0) })),
  };
  const prior = state.individuals;
  const individuals = prior.map((fish, index) => quietBackgroundFish(fish, index, state));
  const subject = prior[SUBJECT_INDEX];
  const center = { x: state.cols * 0.43, y: state.rows * 0.5 };

  if (scenario.id === ACTIVITIES.cruise) {
    individuals[SUBJECT_INDEX] = posedFish(subject, state, {
      ...center,
      vx: 0.34,
      vy: 0,
      behavior: "cruise",
      activity: ACTIVITIES.cruise,
      preserveAge,
    });
  } else if (scenario.id === ACTIVITIES.wander) {
    const destination = { x: state.cols * 0.68, y: state.rows * 0.38 };
    individuals[SUBJECT_INDEX] = posedFish(subject, state, {
      x: state.cols * 0.3,
      y: state.rows * 0.62,
      vx: 0.24,
      vy: -0.08,
      behavior: "explore",
      activity: ACTIVITIES.wander,
      target: { targetType: "waypoint", targetX: destination.x, targetY: destination.y },
      preserveAge,
    });
  } else if (scenario.id === ACTIVITIES.bubbleInvestigate && bubble) {
    const approachSide = bubble.worldX < state.cols / 2 ? 1 : -1;
    individuals[SUBJECT_INDEX] = posedFish(subject, state, {
      // Close enough to inspect before this deliberately late-rise bubble
      // reaches the surface, while still leaving a visible pursuit.
      x: bubble.worldX + approachSide * 2,
      y: bubble.worldY + 0.65,
      vx: -approachSide * 0.26,
      vy: -0.08,
      behavior: "explore",
      activity: ACTIVITIES.bubbleInvestigate,
      target: { targetType: "bubble", targetId: bubble.id },
      preserveAge,
    });
  } else if (scenario.id === ACTIVITIES.plantInvestigate || scenario.id === ACTIVITIES.plantWeave) {
    const plant = showcasePlant(state);
    const preview = plantTargetPosition(subject, plant, state);
    const approachDistance = scenario.id === ACTIVITIES.plantWeave ? 1.25 : 3;
    individuals[SUBJECT_INDEX] = posedFish(subject, state, {
      x: preview.x + (preview.x < state.cols / 2 ? approachDistance : -approachDistance),
      y: preview.y + 0.35,
      vx: preview.x < state.cols / 2 ? -0.24 : 0.24,
      vy: 0,
      behavior: "explore",
      activity: scenario.id,
      target: { targetType: "plant", targetId: plant.seed },
      preserveAge,
    });
  } else if (scenario.id === ACTIVITIES.schoolFollow) {
    let candidate = posedFish(subject, state, {
      ...center,
      vx: 0.25,
      vy: 0,
      behavior: "social",
      activity: ACTIVITIES.schoolFollow,
      target: { targetType: "school" },
      preserveAge,
    });
    const target = resolveActivityTarget(candidate, SUBJECT_INDEX, { ...state, individuals }, candidate.activity);
    if (target) candidate = posedFish(candidate, state, {
      x: target.x - 4.2,
      y: target.y + 0.8,
      vx: target.velocityX ?? 0.25,
      vy: target.velocityY ?? 0,
      behavior: "social",
      activity: ACTIVITIES.schoolFollow,
      target: { targetType: "school" },
      preserveAge,
    });
    individuals[SUBJECT_INDEX] = candidate;
  } else if (scenario.id === ACTIVITIES.individualFollow) {
    socialPair(individuals, state, ACTIVITIES.individualFollow);
  } else if (scenario.id === ACTIVITIES.companionCruise) {
    socialPair(individuals, state, ACTIVITIES.companionCruise);
  } else if (scenario.id === ACTIVITIES.playfulChase) {
    socialPair(individuals, state, ACTIVITIES.playfulChase, { chase: true });
  } else if (scenario.id === ACTIVITIES.substrateSearch) {
    // Measured from the substrate rather than from the tank height: the loop
    // has to show the descent and still leave room for the pecks that follow
    // it, and a fraction of the rows spends most of a landscape loop falling.
    // Choose the deterministic starting lane through the production resolver.
    // At this lane the editor's narrow and wide search spans ask for visibly
    // different route points instead of both hitting the same lead clamp.
    individuals[SUBJECT_INDEX] = foragePreviewFish(subject, state, preserveAge);
  } else if (scenario.id === ACTIVITIES.surfaceInvestigate) {
    individuals[SUBJECT_INDEX] = posedFish(subject, state, {
      x: state.cols * 0.48,
      y: state.rows * (state.orientation === "portrait" ? 0.38 : 0.57),
      vx: 0.12,
      vy: -0.12,
      behavior: "explore",
      activity: ACTIVITIES.surfaceInvestigate,
      target: {
        targetType: "surface",
        targetX: state.cols * 0.5,
        targetY: surfaceSafeY(subject, state, state.cols * 0.5),
      },
      preserveAge,
    });
  } else if (scenario.id === ACTIVITIES.openWaterRest) {
    individuals[SUBJECT_INDEX] = posedFish(subject, state, {
      ...center,
      vx: 0.045,
      vy: 0,
      behavior: "rest",
      activity: ACTIVITIES.openWaterRest,
      // Begin outside the settle radius, then arrive in time to show the quiet
      // drift profile during the same loop.
      target: { targetType: "waypoint", targetX: center.x + 2.3, targetY: center.y },
      preserveAge,
    });
  } else if (scenario.id === ACTIVITIES.plantShelter) {
    // Shelter has stricter plant eligibility than inspection. Choose through
    // the production resolver so the forced scene cannot immediately discard
    // an invalid specimen and wander to a distant fallback.
    const plant = showcaseShelterPlant(state, subject);
    const preview = plantTargetPosition(subject, plant, state, { shelter: true });
    individuals[SUBJECT_INDEX] = posedFish(subject, state, {
      // Start at the resolved shelter point so the preview exercises the quiet
      // shelter profile itself, not only its short approach phase. Recomputing
      // the target from this pose selects the same side of the plant.
      x: preview.x,
      y: preview.y,
      vx: preview.x < state.cols / 2 ? -0.06 : 0.06,
      vy: 0,
      behavior: "rest",
      activity: ACTIVITIES.plantShelter,
      target: { targetType: "plant", targetId: plant.seed },
      preserveAge,
    });
  } else if (scenario.id === ACTIVITIES.touchReact) {
    const touch = { x: center.x + 2.2, y: center.y - 0.5 };
    individuals[SUBJECT_INDEX] = posedFish(subject, state, {
      x: center.x - 2.1,
      y: center.y + 0.6,
      vx: 0.42,
      vy: -0.1,
      behavior: "explore",
      activity: ACTIVITIES.touchReact,
      target: { targetType: "touch", targetX: touch.x, targetY: touch.y },
      preserveAge,
    });
    state = {
      ...state,
      reaction: { ...touch, ageSeconds: 0, durationSeconds: 3.2 },
    };
  } else if (scenario.id === ACTIVITIES.arrivalEnter) {
    const destination = { x: state.cols * 0.34, y: state.rows * 0.44 };
    individuals[SUBJECT_INDEX] = posedFish(subject, state, {
      x: 4.5,
      y: state.rows * 0.62,
      vx: 0.36,
      vy: -0.04,
      behavior: "explore",
      activity: ACTIVITIES.arrivalEnter,
      target: { targetType: "waypoint", targetX: destination.x, targetY: destination.y },
      preserveAge,
    });
  }

  return { ...state, individuals };
}

export function createShowcaseState({
  orientation = "landscape",
  scenario = "cruise",
  seed = SHOWCASE_DEFAULT_SEED,
} = {}) {
  const initial = createAquariumState({ orientation, seed, wallClockHours: 12 });
  return configureScenario(initial, scenario);
}

// The sequence starts from a forced production activity, then the ordinary tick
// owns every micro-phase and pose. The lab does not animate a second system.
export function tickShowcase(state, realDelta, scenarioId) {
  const scenario = showcaseScenario(scenarioId);
  const subjectIndices = scenario.subjects;
  let next = state;
  if (subjectIndices.some((index) => !next.individuals[index])) {
    next = createShowcaseState({ orientation: state.orientation, scenario: scenario.id, seed: state.seed });
  }
  return tick(next, realDelta);
}

export function showcaseSubjects(state, scenarioId) {
  return showcaseScenario(scenarioId).subjects
    .map((index) => ({ index, fish: state.individuals[index] }))
    .filter(({ fish }) => fish);
}

export function showcaseTarget(state, scenarioId) {
  const [{ index, fish } = {}] = showcaseSubjects(state, scenarioId);
  if (!fish) return null;
  return resolveActivityTarget(fish, index, state, fish.activity, {
    bubbles: createBubbleWorldRecords(state),
    school: state.school,
  });
}

export function resetShowcase(state, scenarioId) {
  return createShowcaseState({
    orientation: state.orientation,
    scenario: scenarioId,
    seed: state.seed,
  });
}
