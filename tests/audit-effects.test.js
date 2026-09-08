import assert from "node:assert/strict";
import test from "node:test";
import { growthStagesFor, individualSprites, spriteMouthOffset } from "../src/art/sprites.js";
import { glyphsForObject } from "../src/render/scene.js";
import { render } from "../src/render/render.js";
import { advanceAquariumHistory } from "../src/sim/aquarium-history.js";
import { createBubbleEmitters, createBubbleWorldRecords } from "../src/sim/bubbles.js";
import { createShowcaseState, tickShowcase } from "../src/dev/behavior-showcase.js";
import { fishMouthPosition, forageActivity, substrateGrazeY } from "../src/sim/fish-motion.js";
import { createAquariumState, serializePersistentState } from "../src/sim/state.js";
import { stockedAquarium } from "./support/aquarium.js";
import { tick } from "../src/sim/tick.js";

test("plant propagation and storage order cannot move an existing bubble emitter", () => {
  for (const orientation of ["landscape", "portrait"]) for (const seed of [5, 29, 83, 147]) {
    // Deliberately a new aquarium: this is about the garden filling in, and a
    // stocked one has already reached the plant cap with nothing left to grow.
    const initial = createAquariumState({ seed, orientation });
    const grown = advanceAquariumHistory(initial, 420);
    assert.ok(grown.plants.length > initial.plants.length);
    const before = createBubbleEmitters(initial);
    assert.deepEqual(createBubbleEmitters(grown), before);
    assert.deepEqual(createBubbleEmitters({ ...grown, plants: [...grown.plants].reverse() }), before);
  }
});

test("shared mouth origins match drawn mouth anchors through growth, pitch and turning", () => {
  for (const orientation of ["landscape", "portrait"]) {
    const base = stockedAquarium({ orientation, seed: 5 });
    for (const species of individualSprites) for (const sprite of growthStagesFor(species.id)) {
      for (const facing of [-1, 1]) for (const progress of [0.3, 0.7, 1]) {
        const fish = {
          ...base.individuals[3], ...sprite, x: base.cols / 2, y: base.rows / 2,
          visual: { facing, targetFacing: -facing, turnProgress: progress, pitch: facing * 26, targetPitch: facing * 26 },
        };
        const state = { ...base, individuals: base.individuals.map((other, i) => i === 3 ? fish : other) };
        const scene = render(state, { deformationStrength: 0 });
        const object = scene.objects.find((object) => object.id.startsWith("individual:3:"));
        const glyph = glyphsForObject(scene, object)[spriteMouthOffset(sprite).glyph];
        const x = (glyph.x + 6 * glyph.scaleX) / (scene.width / state.cols);
        const y = (glyph.y + 12 * glyph.scaleY) / (scene.height / state.rows);
        const mouth = fishMouthPosition(fish, state, 3);
        assert.ok(Math.abs(mouth.x - x) < 0.01, `${sprite.id} mouth x`);
        // Body bob remains visible even with swimming deformation disabled.
        assert.ok(Math.abs(mouth.y - y) < 0.09, `${sprite.id} mouth y`);
      }
    }
  }
});

test("an exhaled bubble leaves the posed mouth and then moves independently", () => {
  let state = stockedAquarium({ seed: 13 });
  let release = null;
  for (let frame = 0; frame < 1200 && !release; frame++) {
    state = tick(state, 0.1);
    release = createBubbleWorldRecords(state).find((bubble) => bubble.kind === "fish");
  }
  assert.ok(release);
  const index = state.individuals.findIndex((fish) => release.id === `bubble:fish:${fish.seed}`);
  const mouth = fishMouthPosition(state.individuals[index], state, index);
  assert.ok(Math.hypot(release.worldX - mouth.x, release.worldY - mouth.y) < 1e-8);
  const moved = { ...state, individuals: state.individuals.map((fish, i) => i === index
    ? { ...fish, x: fish.x + 4, y: fish.y - 1, visual: { ...fish.visual, targetFacing: -fish.visual.targetFacing } }
    : fish) };
  assert.deepEqual(createBubbleWorldRecords(moved).find((bubble) => bubble.id === release.id), release);
  const later = createBubbleWorldRecords({ ...moved, elapsedRealSeconds: moved.elapsedRealSeconds + 0.2 })
    .find((bubble) => bubble.id === release.id);
  assert.ok(later.worldY < release.worldY);
  assert.ok(Math.abs(later.worldX - release.worldX) < 0.1);
  assert.equal(createBubbleWorldRecords({ ...moved, elapsedRealSeconds: moved.elapsedRealSeconds + 5 })
    .some((bubble) => bubble.id === release.id), false);
  assert.ok(serializePersistentState(state).individuals.every((fish) => !("exhale" in fish)));
});

test("released silt stays at its strike when the feeding fish turns and moves", () => {
  let state = createShowcaseState({ scenario: "substrate-search" });
  let found = false;
  for (let frame = 0; frame < 300; frame++) {
    state = tickShowcase(state, 0.1, "substrate-search");
    const forage = forageActivity(state.individuals[3], 3, state);
    if (forage.debrisPhase !== null && forage.debrisPhase > 0.5 && forage.peck === 0) { found = true; break; }
  }
  assert.ok(found);
  const before = render(state);
  const fish = state.individuals[3];
  const moved = { ...fish, x: fish.x + 2, visual: { ...fish.visual, facing: -1, targetFacing: -1, turnProgress: 1 } };
  moved.y = substrateGrazeY(moved, state, moved.x, 3);
  const after = render({ ...state, individuals: state.individuals.map((other, i) => i === 3 ? moved : other) });
  const clouds = [before, after].map((scene) => {
    const object = scene.objects.find((object) => object.id.startsWith("forage-debris:3:"));
    assert.ok(object);
    return glyphsForObject(scene, object);
  });
  assert.deepEqual(clouds[1], clouds[0]);
});

test("a scheduled peck cannot draw a contact mark without a recorded strike", () => {
  let state = createShowcaseState({ scenario: "substrate-search" });
  for (let frame = 0; frame < 300; frame++) {
    state = tickShowcase(state, 0.1, "substrate-search");
    if (forageActivity(state.individuals[3], 3, state).peck > 0.5) break;
  }
  const fish = state.individuals[3];
  assert.ok(forageActivity(fish, 3, state).peck > 0.5);
  const unlatched = { ...fish, activity: { ...fish.activity, contactSeed: null, priorContactSeed: null } };
  const scene = render({ ...state, individuals: state.individuals.map((other, i) => i === 3 ? unlatched : other) });
  assert.equal(scene.objects.some((object) => object.id.startsWith("forage-debris:3:")), false);
});
