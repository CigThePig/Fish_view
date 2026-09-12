import assert from "node:assert/strict";
import test from "node:test";

import { WATERLINE_ROWS } from "../src/sim/config.js";
import { ACTIVITIES } from "../src/sim/fish-activities.js";
import { tickVoluntaryGlassVisit } from "../src/sim/glass-visits.js";
import { substrateSafeY } from "../src/sim/fish-motion.js";
import { applyTouch, createAquariumState } from "../src/sim/state.js";
import {
  glassFamiliarityFor,
  shapeAttentionForSaturation,
  withGlassFamiliarity,
} from "../src/sim/viewer-relationship.js";
import { stockedAquarium } from "./support/aquarium.js";

function passive(role) {
  return ["watch", "wary", "acknowledge"].includes(role);
}

function attention(role, distance = 2) {
  return {
    stimulusId: "review",
    role,
    x: 20,
    y: 8,
    distance,
    ageSeconds: 0,
    durationSeconds: 1.4,
    delaySeconds: role === "delayed" ? 1.2 : 0,
    held: false,
    released: false,
    settled: false,
    holdSeconds: 0,
    nearSeconds: 0,
  };
}

test("familiarity cannot promote a non-interruptible arrival out of its entry", () => {
  const original = createAquariumState({ seed: 0x6f001001, wallClockHours: 12 });
  const founder = withGlassFamiliarity(original.individuals[0], 1);
  const arriving = {
    ...founder,
    behavior: { ...founder.behavior, current: "explore", previous: "explore", blend: 1 },
    activity: {
      ...founder.activity,
      current: ACTIVITIES.arrivalEnter,
      previous: ACTIVITIES.cruise,
      ageRealSeconds: 1,
    },
    attention: null,
  };
  const state = { ...original, individuals: [arriving] };
  const touched = applyTouch(state, arriving.x, arriving.y);
  const after = touched.individuals[0];

  assert.equal(after.activity.current, ACTIVITIES.arrivalEnter);
  assert.ok(passive(after.attention?.role), `arrival was escalated to ${after.attention?.role}`);
});

test("saturation rotation cannot recruit a committed fish as replacement investigator", () => {
  const state = stockedAquarium({ seed: 0x6f001002, wallClockHours: 12 });
  const fish = state.individuals.slice(0, 2).map((one, index) => ({
    ...withGlassFamiliarity(one, 1),
    activity: {
      ...one.activity,
      current: index === 0 ? ACTIVITIES.cruise : ACTIVITIES.arrivalEnter,
    },
    viewerRelationship: {
      saturation: index === 0 ? 0.95 : 0,
      saturationAt: 0,
    },
  }));
  const shaped = shapeAttentionForSaturation(
    fish,
    [attention("investigate", 2), attention("watch", 3)],
    { guarantee: true },
  );

  assert.notEqual(shaped[1]?.role, "investigate");
  assert.ok(passive(shaped[1]?.role), `committed replacement became ${shaped[1]?.role}`);
});

test("a wrapped interaction sequence is new once the old contact is temporally impossible", () => {
  const original = createAquariumState({ seed: 0x6f001003, wallClockHours: 12 });
  const founder = withGlassFamiliarity(original.individuals[0], 0.1);
  const stale = {
    ...founder,
    history: { ...founder.history, touches: 5 },
    viewerRelationship: {
      saturation: 0,
      saturationAt: 0,
      responseSequence: 0,
      engagementSequence: 0,
      creditedNearSeconds: 0,
      engagementAt: 0,
    },
  };
  const state = {
    ...original,
    elapsedRealSeconds: 1000,
    interactionSequence: 0xffff,
    individuals: [stale],
  };
  const before = glassFamiliarityFor(stale);
  const touched = applyTouch(state, stale.x, stale.y);
  const after = touched.individuals[0];

  assert.equal(touched.interactionSequence, 0);
  assert.ok(glassFamiliarityFor(after) > before, "wrapped sequence suppressed new familiarity credit");
  assert.equal(after.history.touches, 6, "wrapped sequence suppressed fresh-touch telemetry");
});

test("protected voluntary-visit targets use the same depth ceiling as locomotion", () => {
  const state = createAquariumState({ seed: 0x6f001004, wallClockHours: 12 });
  const fish = {
    ...withGlassFamiliarity(state.individuals[0], 1),
    behavior: { ...state.individuals[0].behavior, current: "cruise" },
    activity: { ...state.individuals[0].activity, current: ACTIVITIES.cruise },
    attention: null,
    viewerRelationship: {
      glassVisit: {
        epoch: 1,
        startedAt: 0,
        ageSeconds: 0,
        durationSeconds: 40,
        anchorX: state.individuals[0].x,
        anchorY: state.rows,
        recentRegion: false,
      },
    },
  };
  const frame = tickVoluntaryGlassVisit(
    fish,
    0,
    state,
    { x: fish.x, y: fish.y, speed: 0.3, postureBias: 0, choreography: {} },
    0.1,
  );
  const floor = substrateSafeY(fish, state, frame.target.x);
  const productionCeiling = WATERLINE_ROWS + Math.max(0, floor - WATERLINE_ROWS) * 0.68;

  assert.equal(frame.target.glassVisit, true);
  assert.ok(frame.target.y <= productionCeiling + 1e-9,
    `visit target ${frame.target.y} was below production ceiling ${productionCeiling}`);
}