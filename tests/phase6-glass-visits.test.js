import assert from "node:assert/strict";
import test from "node:test";

import {
  prepareVoluntaryGlassVisits,
  tickVoluntaryGlassVisit,
  trackViewerRegions,
  voluntaryGlassVisitor,
} from "../src/sim/glass-visits.js";
import { substrateSafeY, surfaceSafeY } from "../src/sim/fish-motion.js";
import {
  applyTouch,
  createAquariumState,
  serializePersistentState,
} from "../src/sim/state.js";
import { stockedAquarium } from "./support/aquarium.js";

const SEED = 0x6d51a55;

function readyFish(fish, familiarity = 1) {
  return {
    ...fish,
    history: { ...fish.history, glassFamiliarity: familiarity },
    drives: { ...fish.drives, hunger: 0.2, energy: 0.8 },
    behavior: {
      ...fish.behavior,
      current: "cruise",
      previous: fish.behavior?.current ?? "cruise",
      blend: 1,
      ageSeconds: 60,
      ageRealSeconds: 60,
    },
    activity: {
      ...fish.activity,
      current: "cruise",
      previous: fish.activity?.current ?? "cruise",
      ageRealSeconds: 8,
      targetType: null,
      targetId: null,
      targetX: null,
      targetY: null,
    },
    attention: null,
  };
}

function readyState(familiarity = 1) {
  const state = createAquariumState({ seed: SEED, wallClockHours: 12 });
  return {
    ...state,
    stimuli: [],
    impulses: [],
    individuals: state.individuals.map((fish) => readyFish(fish, familiarity)),
  };
}

function findStartedVisit(state, {
  start = 0,
  end = 6000,
  refreshRecentAt = false,
} = {}) {
  for (let seconds = start; seconds <= end; seconds += 4) {
    const individuals = refreshRecentAt
      ? state.individuals.map((fish) => ({
        ...fish,
        viewerRelationship: fish.viewerRelationship
          ? { ...fish.viewerRelationship, lastViewerAt: seconds - 1 }
          : fish.viewerRelationship,
      }))
      : state.individuals;
    const candidate = prepareVoluntaryGlassVisits({
      ...state,
      individuals,
      elapsedRealSeconds: seconds,
      stimuli: [],
    });
    if (candidate.individuals.some((fish) => fish.viewerRelationship?.glassVisit)) return candidate;
  }
  return null;
}

function baseTarget(fish) {
  return {
    x: fish.x + 1,
    y: fish.y,
    speed: 0.3,
    postureBias: 0,
    choreography: {},
  };
}

test("unfamiliar fish never initiate a glass visit", () => {
  const state = readyState(0);
  for (let seconds = 0; seconds <= 1600; seconds += 8) {
    const candidate = { ...state, elapsedRealSeconds: seconds };
    assert.equal(voluntaryGlassVisitor(candidate), null);
    assert.equal(
      prepareVoluntaryGlassVisits(candidate).individuals.some((fish) => fish.viewerRelationship?.glassVisit),
      false,
    );
  }
});

test("high familiarity eventually opens one deterministic voluntary invitation", () => {
  const state = readyState(1);
  const first = findStartedVisit(state);
  const second = findStartedVisit(state);

  assert.ok(first, "no high-familiarity invitation appeared across the deterministic opportunity horizon");
  assert.ok(second);
  const active = first.individuals.filter((fish) => fish.viewerRelationship?.glassVisit);
  const repeated = second.individuals.filter((fish) => fish.viewerRelationship?.glassVisit);
  assert.equal(active.length, 1);
  assert.equal(repeated.length, 1);
  assert.equal(active[0].seed, repeated[0].seed);
  assert.deepEqual(active[0].viewerRelationship.glassVisit, repeated[0].viewerRelationship.glassVisit);
});

test("high-commitment activities and biological priorities outrank an invitation", () => {
  const state = readyState(1);
  const blocked = {
    ...state,
    individuals: state.individuals.map((fish) => ({
      ...fish,
      activity: { ...fish.activity, current: "plant-weave" },
    })),
  };

  assert.equal(findStartedVisit(blocked, { end: 2400 }), null);
});

test("defensive arbitration keeps at most one active visitor", () => {
  const state = stockedAquarium({ seed: 0x6dca57, wallClockHours: 12 });
  const individuals = state.individuals.map((fish, index) => {
    const ready = readyFish(fish, 1);
    if (index > 1) return ready;
    return {
      ...ready,
      viewerRelationship: {
        glassVisit: {
          epoch: 2,
          startedAt: index,
          ageSeconds: 2,
          durationSeconds: 30,
          anchorX: ready.x,
          anchorY: ready.y,
          recentRegion: false,
        },
      },
    };
  });

  const prepared = prepareVoluntaryGlassVisits({ ...state, individuals, elapsedRealSeconds: 20, stimuli: [] });
  const active = prepared.individuals.filter((fish) => fish.viewerRelationship?.glassVisit);
  assert.equal(active.length, 1);
  assert.equal(active[0].seed, individuals[0].seed);
});

test("a real viewer response records a bounded recent region for later revisits", () => {
  const state = readyState(1);
  const fish = state.individuals[0];
  const touched = applyTouch(state, fish.x + 2, fish.y + 1);
  const stimulus = touched.stimuli.find((entry) => entry.source === "touch");
  assert.ok(stimulus);

  const tracked = trackViewerRegions(touched);
  const responder = tracked.individuals.find((one) => one.attention?.stimulusId === stimulus.id);
  assert.ok(responder);
  assert.equal(responder.viewerRelationship.lastViewerX, stimulus.x);
  assert.equal(responder.viewerRelationship.lastViewerY, stimulus.y);
  assert.equal(responder.viewerRelationship.lastViewerAt, tracked.elapsedRealSeconds);
});

test("voluntary visits prefer a recent viewer region when one is available", () => {
  const state = readyState(1);
  const fish = state.individuals[0];
  const targetX = fish.x + 3;
  const targetY = fish.y + 1;
  const remembered = {
    ...state,
    individuals: [{
      ...fish,
      viewerRelationship: {
        lastViewerX: targetX,
        lastViewerY: targetY,
        lastViewerAt: 0,
      },
    }],
  };
  const started = findStartedVisit(remembered, { refreshRecentAt: true });
  assert.ok(started, "no invitation appeared to exercise recent-region targeting");
  const visit = started.individuals[0].viewerRelationship.glassVisit;
  assert.equal(visit.recentRegion, true);
  assert.ok(Math.abs(visit.anchorX - targetX) < 1e-9);
  assert.ok(Math.abs(visit.anchorY - targetY) < 1e-9);
});

test("the visit has approach, linger/patrol steering and respects protected depth", () => {
  const state = readyState(1);
  const fish = state.individuals[0];
  const visitFish = {
    ...fish,
    viewerRelationship: {
      glassVisit: {
        epoch: 1,
        startedAt: 0,
        ageSeconds: 0,
        durationSeconds: 40,
        anchorX: fish.x + 4,
        anchorY: state.rows,
        recentRegion: false,
      },
    },
  };
  const frame = tickVoluntaryGlassVisit(visitFish, 0, state, baseTarget(fish), 0.1);
  assert.equal(frame.target.glassVisit, true);
  assert.equal(frame.target.glassVisitPhase, "approach");

  const top = surfaceSafeY(fish, state, frame.target.x);
  const floor = substrateSafeY(fish, state, frame.target.x);
  const protectedFloor = top + (floor - top) * 0.68;
  assert.ok(frame.target.y <= protectedFloor + 1e-9);

  const atAnchor = {
    ...frame.fish,
    x: frame.fish.viewerRelationship.glassVisit.anchorX,
    y: Math.min(frame.fish.viewerRelationship.glassVisit.anchorY, protectedFloor),
    viewerRelationship: {
      ...frame.fish.viewerRelationship,
      glassVisit: {
        ...frame.fish.viewerRelationship.glassVisit,
        ageSeconds: 8,
      },
    },
  };
  const linger = tickVoluntaryGlassVisit(atAnchor, 0, state, baseTarget(atAnchor), 0.1);
  assert.equal(linger.target.glassVisit, true);
  assert.ok(["linger", "patrol"].includes(linger.target.glassVisitPhase));
});

test("touching an inviting fish hands control to the existing touch system without deleting the visit", () => {
  const started = findStartedVisit(readyState(1));
  assert.ok(started);
  const visitor = started.individuals.find((fish) => fish.viewerRelationship?.glassVisit);
  const beforeAge = visitor.viewerRelationship.glassVisit.ageSeconds;
  const touched = applyTouch(started, visitor.x, visitor.y);
  const responder = touched.individuals.find((fish) => fish.seed === visitor.seed);

  assert.ok(responder.viewerRelationship?.glassVisit, "touch deleted the fish-initiated visit context");
  assert.ok(responder.attention, "touch did not enter the ordinary attention system");
  assert.equal(responder.activity.current, "touch-react");

  const frame = tickVoluntaryGlassVisit(responder, 0, touched, baseTarget(responder), 0.2);
  assert.equal(frame.target.glassVisit, undefined, "voluntary steering overrode a direct viewer response");
  assert.equal(frame.fish.viewerRelationship.glassVisit.ageSeconds, beforeAge,
    "visit clock advanced while viewer attention owned the fish");
});

test("glass visit context is transient and never enlarges the save", () => {
  const started = findStartedVisit(readyState(1));
  assert.ok(started);
  const saved = serializePersistentState(started);
  assert.ok(saved.individuals.every((fish) => !("viewerRelationship" in fish)));
  assert.ok(saved.individuals.every((fish) => !("activity" in fish)));
});
