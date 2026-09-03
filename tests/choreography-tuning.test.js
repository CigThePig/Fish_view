import assert from "node:assert/strict";
import test from "node:test";
import { isDeepStrictEqual } from "node:util";

import {
  CHASE_BREAK_CEILING_SECONDS,
  SCENE_FIELDS,
  STEERING_FIELDS,
  constrainedSceneEdit,
  constrainedSteeringEdit,
  steeringFieldsFor,
  steeringKeysFor,
} from "../src/dev/choreography-fields.js";
import {
  SHOWCASE_SCENARIOS,
  createShowcaseState,
  showcaseScenario,
  showcaseTarget,
  tickShowcase,
} from "../src/dev/behavior-showcase.js";
import { DWELL_SECONDS } from "../src/sim/fish-activities.js";
import {
  DEFAULT_STEERING_PROFILE,
  SCENE_TUNING,
  STEERING_PROFILES,
  resolvedSteeringProfile,
  sceneTuning,
  steeringDeviations,
  steeringParentKey,
  steeringProfile,
} from "../src/sim/choreography-tuning.js";
import { ACTIVITIES, resolveActivityTarget } from "../src/sim/fish-activities.js";
import {
  CHASE_BREAK_SECONDS,
  CHASE_RECOGNITION_RADIUS,
  choreographyFor,
} from "../src/sim/fish-choreography.js";
import {
  FORAGE_GRAZE_BURIAL_ROWS,
  FORAGE_GRAZE_CONTACT_ROWS,
  FORAGE_PECK_ROWS,
  FORAGE_PITCH_BIAS_DEGREES,
  FORAGE_ROUTE_LEAD_COLUMNS,
  FORAGE_SEARCH_DISTANCE_ROWS,
  SURFACE_PITCH_BIAS_DEGREES,
  substrateGrazeY,
} from "../src/sim/fish-motion.js";
import { createAquariumState } from "../src/sim/state.js";

const activities = new Set(Object.values(ACTIVITIES));

test("every tunable profile belongs to a real activity", () => {
  for (const key of Object.keys(STEERING_PROFILES)) {
    const activity = steeringParentKey(key) ?? key;
    assert.ok(activities.has(activity), key + " names no activity");
  }
  for (const key of Object.keys(SCENE_TUNING)) {
    assert.ok(activities.has(key), key + " names no activity");
  }
});

// The extraction moved literals out of three modules. These are the ones other
// code still names, so they are also the ones that could silently drift.
test("scene tuning starts at the constants the simulation used to inline", () => {
  const forage = SCENE_TUNING[ACTIVITIES.substrateSearch];
  assert.equal(forage.grazePitchDegrees, FORAGE_PITCH_BIAS_DEGREES);
  assert.equal(forage.grazeContactRows, FORAGE_GRAZE_CONTACT_ROWS);
  assert.equal(forage.grazeBurialRows, FORAGE_GRAZE_BURIAL_ROWS);
  assert.equal(forage.peckRows, FORAGE_PECK_ROWS);
  assert.equal(forage.routeLeadColumns, FORAGE_ROUTE_LEAD_COLUMNS);
  assert.equal(forage.searchDistanceRows, FORAGE_SEARCH_DISTANCE_ROWS);
  assert.equal(SCENE_TUNING[ACTIVITIES.surfaceInvestigate].pitchBiasDegrees, SURFACE_PITCH_BIAS_DEGREES);
  const chase = SCENE_TUNING[ACTIVITIES.playfulChase];
  assert.equal(chase.recognitionRadiusRows, CHASE_RECOGNITION_RADIUS);
  assert.equal(chase.breakSeconds, CHASE_BREAK_SECONDS);
});

test("a phase profile layers over its activity rather than over the bare default", () => {
  const chase = choreographyFor(null, ACTIVITIES.playfulChase);
  const breaking = choreographyFor(null, ACTIVITIES.playfulChase, "playful-chase:break");
  assert.equal(chase.positionGain, 1.1);
  // The break profile never mentions positionGain, so it keeps the chase's.
  assert.equal(breaking.positionGain, chase.positionGain);
  assert.equal(breaking.maximumSpeed, STEERING_PROFILES["playful-chase:break"].maximumSpeed);
  assert.notEqual(breaking.maximumSpeed, chase.maximumSpeed);
});

// This is the rule the lab prints its source with. If it did not reproduce the
// authored tables exactly, a copied profile would quietly gain or lose fields.
test("the profile the lab prints back is the profile that is authored", () => {
  for (const [key, authored] of Object.entries(STEERING_PROFILES)) {
    assert.deepEqual(steeringDeviations(null, key), { ...authored }, key);
  }
});

test("overrides ride on state and never touch the module tables", () => {
  const tuned = { choreographyTuning: { steering: { cruise: { maximumSpeed: 0.11 } } } };
  assert.equal(choreographyFor(tuned, ACTIVITIES.cruise).maximumSpeed, 0.11);
  assert.equal(choreographyFor(null, ACTIVITIES.cruise).maximumSpeed, STEERING_PROFILES.cruise.maximumSpeed);
  assert.equal(STEERING_PROFILES.cruise.maximumSpeed, 0.7);
  // An untuned field still resolves through the authored profile.
  assert.equal(
    resolvedSteeringProfile(tuned, ACTIVITIES.cruise).turningResponse,
    STEERING_PROFILES.cruise.turningResponse,
  );
  // And a state with no tuning is handed the authored object itself.
  assert.equal(steeringProfile(null, ACTIVITIES.cruise), STEERING_PROFILES.cruise);
  assert.equal(sceneTuning(null, ACTIVITIES.cruise), SCENE_TUNING.cruise);
});

test("speed-bound edits cannot export an interval the controller will collapse", () => {
  const profile = { minimumSpeed: 0.1, maximumSpeed: 0.4 };
  assert.deepEqual(constrainedSteeringEdit(profile, "minimumSpeed", 0.5), {
    minimumSpeed: 0.5,
    maximumSpeed: 0.5,
  });
  assert.deepEqual(constrainedSteeringEdit(profile, "maximumSpeed", 0.05), {
    minimumSpeed: 0.05,
    maximumSpeed: 0.05,
  });
  assert.deepEqual(constrainedSteeringEdit(profile, "maximumSpeed", 0.3), { maximumSpeed: 0.3 });
});

test("scene interval edits keep every lower endpoint at or below its upper endpoint", () => {
  const cases = [
    ["stageSecondsMin", "stageSecondsMax"],
    ["trailingMinRows", "trailingMaxRows"],
    ["besideMinRows", "besideMaxRows"],
    ["panicNearRows", "panicFarRows"],
  ];
  for (const [minimum, maximum] of cases) {
    const profile = { [minimum]: 2, [maximum]: 4 };
    assert.deepEqual(constrainedSceneEdit(profile, minimum, 6), { [minimum]: 6, [maximum]: 6 });
    assert.deepEqual(constrainedSceneEdit(profile, maximum, 1), { [minimum]: 1, [maximum]: 1 });
    assert.deepEqual(constrainedSceneEdit(profile, maximum, 3), { [maximum]: 3 });
  }
});

test("velocity matching is shown only for profiles whose targets carry velocity", () => {
  const hasVelocityMatch = (key) => steeringFieldsFor(key).some((field) => field.key === "velocityMatch");
  assert.equal(hasVelocityMatch(ACTIVITIES.cruise), false);
  assert.equal(hasVelocityMatch(ACTIVITIES.wander), false);
  assert.equal(hasVelocityMatch(ACTIVITIES.bubbleInvestigate), false);
  assert.equal(hasVelocityMatch(ACTIVITIES.schoolFollow), true);
  assert.equal(hasVelocityMatch(ACTIVITIES.individualFollow), true);
  assert.equal(hasVelocityMatch(ACTIVITIES.companionCruise), true);
  assert.equal(hasVelocityMatch("companion-cruise:mutual"), true);
});

test("bottom feeding answers its rotation and distance tuning", () => {
  const base = createAquariumState({ orientation: "landscape", seed: 7331, wallClockHours: 12 });
  const fish = base.individuals[4];
  const deeper = {
    ...base,
    choreographyTuning: { scene: { [ACTIVITIES.substrateSearch]: { grazeContactRows: 0.9 } } },
  };
  assert.ok(
    substrateGrazeY(fish, deeper, fish.x, 4) > substrateGrazeY(fish, base, fish.x, 4),
    "a larger contact allowance has to put the graze line lower in the tank",
  );

  const grazing = {
    ...fish,
    y: substrateGrazeY(fish, base, fish.x, 4),
    behavior: { current: "forage", previous: "forage", blend: 1, ageSeconds: 9, ageRealSeconds: 9 },
    activity: {
      current: ACTIVITIES.substrateSearch,
      previous: ACTIVITIES.substrateSearch,
      ageRealSeconds: 6,
      targetType: null,
      targetId: null,
      targetX: null,
      targetY: null,
    },
  };
  const state = { ...base, individuals: base.individuals.map((f, i) => (i === 4 ? grazing : f)) };
  const level = resolveActivityTarget(grazing, 4, state, grazing.activity);
  // Authored against a shallower lean rather than a steeper one: the feeding
  // posture is already four degrees short of the rotation ceiling, so there is
  // no room above it to move a fish through and still be reading the tuning
  // rather than the clamp.
  const shallow = resolveActivityTarget(grazing, 4, {
    ...state,
    choreographyTuning: { scene: { [ACTIVITIES.substrateSearch]: { grazePitchDegrees: 12 } } },
  }, grazing.activity);
  assert.ok(level.forageSearching && shallow.forageSearching, "the fish has to be grazing for this to mean anything");
  assert.ok(level.postureBias > shallow.postureBias + 9, "graze rotation has to reach the posture the renderer draws");
});

test("chase tuning moves both fish, not only the chaser", () => {
  const faster = {
    choreographyTuning: { scene: { [ACTIVITIES.playfulChase]: { pursuitSpeed: 1.3, evasionSpeed: 1.1 } } },
  };
  const tuned = sceneTuning(faster, ACTIVITIES.playfulChase);
  assert.equal(tuned.pursuitSpeed, 1.3);
  assert.equal(tuned.evasionSpeed, 1.1);
  // Untouched entries still come from the authored table.
  assert.equal(tuned.breakSeconds, SCENE_TUNING[ACTIVITIES.playfulChase].breakSeconds);
});

test("bubble inspection answers its own standoff tuning", () => {
  let state = createShowcaseState({ orientation: "landscape", scenario: ACTIVITIES.bubbleInvestigate });
  let target = showcaseTarget(state, ACTIVITIES.bubbleInvestigate);
  for (let frame = 0; frame < 100 && target?.choreographyPhase !== "inspect"; frame += 1) {
    state = tickShowcase(state, 0.1, ACTIVITIES.bubbleInvestigate);
    target = showcaseTarget(state, ACTIVITIES.bubbleInvestigate);
  }
  assert.equal(target?.choreographyPhase, "inspect", "showcase never reached close inspection");

  const shifted = {
    ...state,
    choreographyTuning: {
      scene: { [ACTIVITIES.bubbleInvestigate]: { inspectStandoffRows: 1.48 } },
    },
  };
  const shiftedTarget = showcaseTarget(shifted, ACTIVITIES.bubbleInvestigate);
  assert.ok(shiftedTarget.y > target.y + 0.75, "inspection standoff did not move the close-range target");
});

test("every phase profile shown by the editor occurs in its showcase", () => {
  for (const scenario of SHOWCASE_SCENARIOS) {
    const phaseKeys = steeringKeysFor(scenario.id).filter((key) => key.includes(":"));
    if (!phaseKeys.length) continue;
    const seen = new Set();
    let state = createShowcaseState({ orientation: "landscape", scenario: scenario.id });
    const frames = Math.ceil(scenario.loopSeconds / 0.1);
    for (let frame = 0; frame <= frames; frame += 1) {
      const target = showcaseTarget(state, scenario.id);
      for (const key of phaseKeys) {
        if (target?.choreography
          && isDeepStrictEqual(target.choreography, resolvedSteeringProfile(state, key))) seen.add(key);
      }
      if (frame < frames) state = tickShowcase(state, 0.1, scenario.id);
    }
    assert.deepEqual(seen, new Set(phaseKeys), scenario.id + " does not exercise every phase profile");
  }
});

test("substrate showcase makes the full search-span range observable", () => {
  const [minimum, maximum] = ["min", "max"].map((endpoint) => (
    SCENE_FIELDS[ACTIVITIES.substrateSearch]
      .find((field) => field.key === "searchSpanColumns")[endpoint]
  ));
  const initial = createShowcaseState({ orientation: "landscape", scenario: ACTIVITIES.substrateSearch });
  const withSpan = (state, searchSpanColumns) => ({
    ...state,
    choreographyTuning: { scene: { [ACTIVITIES.substrateSearch]: { searchSpanColumns } } },
  });
  let narrow = withSpan(initial, minimum);
  let wide = withSpan(initial, maximum);
  let maximumTargetSeparation = 0;
  let maximumFishSeparation = 0;
  for (let frame = 0; frame < 150; frame += 1) {
    const narrowTarget = showcaseTarget(narrow, ACTIVITIES.substrateSearch);
    const wideTarget = showcaseTarget(wide, ACTIVITIES.substrateSearch);
    maximumTargetSeparation = Math.max(maximumTargetSeparation, Math.abs(narrowTarget.x - wideTarget.x));
    maximumFishSeparation = Math.max(
      maximumFishSeparation,
      Math.abs(narrow.individuals[3].x - wide.individuals[3].x),
    );
    narrow = tickShowcase(narrow, 0.1, ACTIVITIES.substrateSearch);
    wide = tickShowcase(wide, 0.1, ACTIVITIES.substrateSearch);
  }
  assert.ok(maximumTargetSeparation > 1, "span extremes still request the same route");
  assert.ok(maximumFishSeparation > 0.1, "span extremes still draw the same fish trajectory");
});

test("every tunable value has a lab slider whose range contains its default", () => {
  const steeringMeta = new Map(STEERING_FIELDS.map((definition) => [definition.key, definition]));
  for (const field of Object.keys(DEFAULT_STEERING_PROFILE)) {
    assert.ok(steeringMeta.has(field), field + " has no slider");
  }
  for (const [key, profile] of Object.entries(STEERING_PROFILES)) {
    for (const [field, value] of Object.entries(profile)) {
      const definition = steeringMeta.get(field);
      assert.ok(definition, key + "." + field + " has no slider");
      assert.ok(value >= definition.min && value <= definition.max, key + "." + field + " is outside its slider");
    }
  }
  for (const [activity, values] of Object.entries(SCENE_TUNING)) {
    const meta = new Map((SCENE_FIELDS[activity] ?? []).map((definition) => [definition.key, definition]));
    for (const [field, value] of Object.entries(values)) {
      const definition = meta.get(field);
      assert.ok(definition, activity + "." + field + " has no slider");
      assert.ok(value >= definition.min && value <= definition.max, activity + "." + field + " is outside its slider");
    }
    for (const definition of meta.keys()) {
      assert.ok(definition in values, activity + "." + definition + " is a slider for nothing");
    }
  }
});

// A value the lab lets you export but the aquarium can never reach is worse
// than no slider: the copied chase would simply never break.
test("the break slider cannot export a chase that outlives its own dwell", () => {
  const [, dwellLow] = DWELL_SECONDS[ACTIVITIES.playfulChase];
  const loopSeconds = showcaseScenario(ACTIVITIES.playfulChase).loopSeconds;
  const breakField = SCENE_FIELDS[ACTIVITIES.playfulChase].find((field) => field.key === "breakSeconds");
  assert.ok(breakField.max < dwellLow, `break up to ${breakField.max}s outlives a ${dwellLow}s chase`);
  assert.ok(breakField.max < loopSeconds, `break up to ${breakField.max}s outlives a ${loopSeconds}s lab loop`);
  assert.equal(breakField.max, CHASE_BREAK_CEILING_SECONDS);
  assert.ok(SCENE_TUNING[ACTIVITIES.playfulChase].breakSeconds <= breakField.max);
});

test("the lab can reach every profile an activity actually uses", () => {
  assert.deepEqual(steeringKeysFor(ACTIVITIES.substrateSearch), [
    ACTIVITIES.substrateSearch,
    "substrate-search:graze",
  ]);
  assert.deepEqual(steeringKeysFor(ACTIVITIES.playfulChase), [
    ACTIVITIES.playfulChase,
    "playful-chase:break",
  ]);
});

test("every tunable activity has a real showcase/editor entry", () => {
  const showcased = new Set(SHOWCASE_SCENARIOS.map((scenario) => scenario.id));
  const tunable = new Set([
    ...Object.keys(STEERING_PROFILES).map((key) => key.split(":")[0]),
    ...Object.keys(SCENE_TUNING),
  ]);
  assert.deepEqual(showcased, tunable);
});
