import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_DELAYED,
  MAX_INVESTIGATORS,
  MAX_SECONDARY,
} from "../src/sim/attention.js";
import { DRIVE_MAXIMUM, WATERLINE_ROWS } from "../src/sim/config.js";
import { ACTIVITIES } from "../src/sim/fish-activities.js";
import {
  prepareVoluntaryGlassVisits,
  tickVoluntaryGlassVisit,
} from "../src/sim/glass-visits.js";
import { speciesCanBottomFeed } from "../src/sim/fish-growth.js";
import { substrateSafeY } from "../src/sim/fish-motion.js";
import {
  applyTouch,
  createAquariumState,
  restorePersistentState,
  serializePersistentState,
} from "../src/sim/state.js";
import {
  creditViewerEngagement,
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

test("relationship shaping cannot exceed the Phase 2 responder budgets", () => {
  const state = stockedAquarium({ seed: 0x6f001009, wallClockHours: 12 });
  assert.ok(state.individuals.length >= 8, "review fixture needs a mature cast");
  const fish = state.individuals.slice(0, 8).map((one) => ({
    ...withGlassFamiliarity(one, 1),
    activity: { ...one.activity, current: ACTIVITIES.cruise },
    attention: null,
    viewerRelationship: undefined,
  }));
  const assignments = [
    attention("investigate", 2),
    attention("investigate", 3),
    attention("approach", 4),
    attention("approach", 5),
    attention("delayed", 6),
    attention("watch", 7),
    attention("wary", 8),
    attention("acknowledge", 9),
  ];
  const shaped = shapeAttentionForSaturation(fish, assignments, { guarantee: true });
  const count = (role) => shaped.filter((record) => record?.role === role).length;

  assert.ok(count("investigate") <= MAX_INVESTIGATORS,
    `familiarity expanded primary investigators to ${count("investigate")}`);
  assert.ok(count("approach") <= MAX_SECONDARY,
    `familiarity expanded secondary approaches to ${count("approach")}`);
  assert.ok(count("delayed") <= MAX_DELAYED,
    `familiarity expanded delayed responders to ${count("delayed")}`);
  assert.ok(shaped.filter((record) => ["investigate", "approach", "delayed"].includes(record?.role)).length
    <= MAX_INVESTIGATORS + MAX_SECONDARY + MAX_DELAYED,
  "relationship shaping expanded the total interrupted cast");
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

test("a distant second press preserves an old responder when another fish can answer", () => {
  const state = stockedAquarium({ seed: 0x6f001006, wallClockHours: 12 });
  const first = applyTouch(state, state.cols / 2, 9.5);
  const index = first.individuals.findIndex((fish) => fish.attention?.role === "investigate");
  assert.ok(index >= 0);
  const responding = first.individuals[index];
  const before = {
    stimulusId: responding.attention.stimulusId,
    targetId: responding.activity.targetId,
    targetX: responding.activity.targetX,
    targetY: responding.activity.targetY,
  };
  const farX = responding.x < state.cols / 2 ? state.cols - 1 : 0;
  const farY = responding.y < state.rows / 2 ? state.rows - 4 : 2;
  const spareIndex = first.individuals.findIndex((fish, otherIndex) => otherIndex !== index);
  assert.ok(spareIndex >= 0, "review fixture needs a second fish");
  const prepared = {
    ...first,
    individuals: first.individuals.map((fish, otherIndex) => otherIndex === spareIndex
      ? {
          ...fish,
          x: farX,
          y: farY,
          attention: null,
          activity: { ...fish.activity, current: ACTIVITIES.cruise },
        }
      : fish),
  };
  const second = applyTouch(prepared, farX, farY);
  const after = second.individuals[index];
  const newStimulus = second.stimuli.find((stimulus) =>
    stimulus.source === "touch" && stimulus.id !== before.stimulusId);

  assert.ok(newStimulus, "far press did not create a distinct stimulus");
  assert.ok(Math.hypot(newStimulus.x - responding.x, newStimulus.y - responding.y) > newStimulus.radius,
    "review fixture did not put the second press outside the old responder's perception");
  assert.equal(after.attention?.stimulusId, before.stimulusId);
  assert.equal(after.activity.targetId, before.targetId);
  assert.equal(after.activity.targetX, before.targetX);
  assert.equal(after.activity.targetY, before.targetY);
  assert.ok(second.individuals.some((fish, otherIndex) =>
    otherIndex !== index && fish.attention?.stimulusId === newStimulus.id && fish.attention.role === "investigate"),
  "protecting the old responder swallowed the fresh tap instead of handing it to another fish");
});

test("a lone fish answers a distant second press without losing its original recovery thread", () => {
  const state = createAquariumState({ seed: 0x6f00100a, wallClockHours: 12 });
  const founder = state.individuals[0];
  const originalActivity = founder.activity.current;
  const first = applyTouch(state, founder.x, founder.y);
  const firstFish = first.individuals[0];
  const firstStimulusId = firstFish.attention?.stimulusId;
  assert.equal(firstFish.attention?.resume?.current, originalActivity);

  const farX = firstFish.x < state.cols / 2 ? state.cols - 1 : 0;
  const farY = firstFish.y < state.rows / 2 ? state.rows - 4 : 2;
  const second = applyTouch(first, farX, farY);
  const after = second.individuals[0];
  const newStimulus = second.stimuli.find((stimulus) =>
    stimulus.source === "touch" && stimulus.id !== firstStimulusId);

  assert.ok(newStimulus, "far press did not create a distinct stimulus");
  assert.equal(after.attention?.stimulusId, newStimulus.id,
    "the one-fish aquarium failed to answer the new press");
  assert.equal(after.attention?.role, "investigate");
  assert.equal(after.activity.targetId, newStimulus.id);
  assert.equal(after.attention?.resume?.current, originalActivity,
    "accepting the fresh tap replaced the activity the fish promised to resume");
});

test("moving engagement credit waits for a delayed responder to actually start following", () => {
  const original = createAquariumState({ seed: 0x6f00100b, wallClockHours: 12 });
  const fish = withGlassFamiliarity(original.individuals[0], 0.2);
  const stimulus = {
    id: "touch:delayed-review",
    source: "touch",
    sequence: 41,
    held: true,
    gesture: "drag",
    speed: 2,
    radius: 30,
  };
  const waiting = {
    ...fish,
    attention: {
      ...attention("delayed", 5),
      stimulusId: stimulus.id,
      ageSeconds: 0.5,
      delaySeconds: 1.2,
      nearSeconds: 0,
    },
    viewerRelationship: {
      saturation: 0,
      saturationAt: 0,
      engagementSequence: stimulus.sequence,
      creditedNearSeconds: 0,
      engagementAt: 0,
    },
  };
  const before = glassFamiliarityFor(waiting);
  const early = creditViewerEngagement([waiting], stimulus, 1)[0];
  assert.equal(glassFamiliarityFor(early), before,
    "a delayed fish learned from following before it had started moving");

  const active = {
    ...early,
    attention: { ...early.attention, ageSeconds: 1.3 },
  };
  const later = creditViewerEngagement([active], stimulus, 2)[0];
  assert.ok(glassFamiliarityFor(later) > before,
    "the same delayed fish earned no moving credit after its delay elapsed");
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
});

test("a same-frame biological priority removes an invitation that never became visible", () => {
  const state = createAquariumState({ seed: 0x6f001007, wallClockHours: 12 });
  const base = state.individuals[0];
  const visiting = {
    ...withGlassFamiliarity(base, 0.9),
    behavior: { ...base.behavior, current: "rest" },
    activity: { ...base.activity, current: ACTIVITIES.openWaterRest },
    attention: null,
    viewerRelationship: {
      glassVisit: {
        epoch: 2,
        startedAt: 10,
        ageSeconds: 0,
        durationSeconds: 30,
        anchorX: base.x,
        anchorY: base.y,
        recentRegion: false,
      },
    },
  };

  const frame = tickVoluntaryGlassVisit(
    visiting,
    0,
    state,
    { x: base.x + 1, y: base.y, speed: 0.2, postureBias: 0, choreography: {} },
    0.1,
  );

  assert.equal(frame.target.glassVisit, undefined);
  assert.equal(frame.fish.viewerRelationship?.glassVisit, undefined,
    "an invisible biologically-cancelled invitation survived as an active marker");
});

test("a hungry open-water species is not permanently locked out of voluntary visits", () => {
  const original = createAquariumState({ seed: 0x6f001005, wallClockHours: 12 });
  let openWaterSeed = 1;
  while (speciesCanBottomFeed(openWaterSeed)) openWaterSeed += 1;

  const template = original.individuals[0];
  const fish = {
    ...withGlassFamiliarity({ ...template, seed: openWaterSeed }, 0.9),
    drives: { ...template.drives, hunger: DRIVE_MAXIMUM, energy: 0.8 },
    behavior: { ...template.behavior, current: "cruise", previous: "cruise", blend: 1 },
    activity: { ...template.activity, current: ACTIVITIES.cruise, previous: ACTIVITIES.cruise },
    attention: null,
    viewerRelationship: undefined,
  };
  assert.equal(speciesCanBottomFeed(fish.seed), false);

  let invitation = null;
  for (let seconds = 0; seconds <= 3600 && !invitation; seconds += 4) {
    const prepared = prepareVoluntaryGlassVisits({
      ...original,
      elapsedRealSeconds: seconds,
      individuals: [fish],
      stimuli: [],
      impulses: [],
    });
    invitation = prepared.individuals[0].viewerRelationship?.glassVisit ?? null;
  }

  assert.ok(invitation, "max hunger became a permanent invitation veto for an open-water species");
});

test("calm social locomotion can yield to a familiar viewer relationship", () => {
  const original = createAquariumState({ seed: 0x6f001008, wallClockHours: 12 });
  const template = original.individuals[0];
  const fish = {
    ...withGlassFamiliarity(template, 0.9),
    drives: { ...template.drives, energy: 0.8 },
    behavior: { ...template.behavior, current: "social", previous: "social", blend: 1 },
    activity: {
      ...template.activity,
      current: ACTIVITIES.schoolFollow,
      previous: ACTIVITIES.schoolFollow,
      ageRealSeconds: 12,
      targetType: "school",
    },
    attention: null,
    viewerRelationship: undefined,
  };

  let invitation = null;
  for (let seconds = 0; seconds <= 3600 && !invitation; seconds += 4) {
    const prepared = prepareVoluntaryGlassVisits({
      ...original,
      elapsedRealSeconds: seconds,
      individuals: [fish],
      stimuli: [],
      impulses: [],
    });
    invitation = prepared.individuals[0].viewerRelationship?.glassVisit ?? null;
  }

  assert.ok(invitation, "calm social behavior permanently suppressed the learned viewer relationship");
});

test("restoring a familiar aquarium cannot reopen a pre-session invitation window", () => {
  const original = createAquariumState({ seed: 8, wallClockHours: 12 });
  const familiar = {
    ...withGlassFamiliarity(original.individuals[0], 1),
    drives: { ...original.individuals[0].drives, energy: 0.8 },
    behavior: { ...original.individuals[0].behavior, current: "cruise", previous: "cruise", blend: 1 },
    activity: { ...original.individuals[0].activity, current: ACTIVITIES.cruise },
  };
  const savedState = { ...original, individuals: [familiar] };
  const restored = restorePersistentState(
    createAquariumState({ seed: 8, wallClockHours: 12 }),
    serializePersistentState(savedState),
  );
  const immediate = prepareVoluntaryGlassVisits(restored);

  assert.equal(immediate.individuals[0].viewerRelationship?.glassVisit, undefined,
    "reload immediately reopened a seed-offset invitation window");

  let invitation = null;
  for (let seconds = 1; seconds <= 1200 && !invitation; seconds += 1) {
    const prepared = prepareVoluntaryGlassVisits({
      ...restored,
      elapsedRealSeconds: seconds,
      stimuli: [],
      impulses: [],
    });
    invitation = prepared.individuals[0].viewerRelationship?.glassVisit ?? null;
  }
  assert.ok(invitation, "closing the reload epoch accidentally disabled future invitations");
});
