import assert from "node:assert/strict";
import test from "node:test";

import {
  CHASE_BREAK_CEILING_SECONDS,
  SCENE_FIELDS,
  STEERING_FIELDS,
  steeringKeysFor,
} from "../src/dev/choreography-fields.js";
import { showcaseScenario } from "../src/dev/behavior-showcase.js";
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
  const steep = resolveActivityTarget(grazing, 4, {
    ...state,
    choreographyTuning: { scene: { [ACTIVITIES.substrateSearch]: { grazePitchDegrees: 30 } } },
  }, grazing.activity);
  assert.ok(level.forageSearching && steep.forageSearching, "the fish has to be grazing for this to mean anything");
  assert.ok(steep.postureBias > level.postureBias + 9, "graze rotation has to reach the posture the renderer draws");
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
