import assert from "node:assert/strict";
import test from "node:test";
import { render } from "../src/render/render.js";
import { advanceAquariumHistory, contentSchedule } from "../src/sim/aquarium-history.js";
import { createActivityState } from "../src/sim/fish-activities.js";
import { substrateGrazeY, substrateSafeY, surfaceSafeY, turnPose } from "../src/sim/fish-motion.js";
import { createAquariumState, applyTouch } from "../src/sim/state.js";
import { stockedAquarium } from "./support/aquarium.js";
import { tick } from "../src/sim/tick.js";

test("initial poses respect the same surface envelope as swimming", () => {
  for (const orientation of ["landscape", "portrait"]) for (const seed of [5, 29, 83, 147, 192]) {
    const state = stockedAquarium({ orientation, seed });
    for (const fish of state.individuals) {
      assert.ok(fish.y >= surfaceSafeY(fish, state), `${orientation}/${seed} starts in the air`);
      assert.ok(fish.y <= substrateSafeY(fish, state));
    }
  }
});

test("leaving a meal and interrupting a deep strike return smoothly to open water", () => {
  for (const orientation of ["landscape", "portrait"]) for (const touch of [false, true]) {
    let state = stockedAquarium({ orientation, seed: 83 });
    const index = 3;
    const fish = {
      ...state.individuals[index], ageDays: 500, x: state.cols / 2, vx: 0.04, vy: 0,
      forageDip: 0.36,
      behavior: { current: "forage", previous: "forage", blend: 1, ageSeconds: 100, ageRealSeconds: 100 },
      activity: createActivityState("substrate-search"),
      drives: { hunger: 0.15, energy: 0.75, social: 0.85 },
      visual: { facing: 1, targetFacing: 1, turnProgress: 1, pitch: 26, targetPitch: 26 },
    };
    fish.y = substrateGrazeY(fish, state, fish.x, index) + fish.forageDip;
    state = { ...state, individuals: state.individuals.map((other, i) => i === index ? fish : other) };
    if (touch) state = applyTouch(state, fish.x + 1, 5);
    let exited = false;
    for (let frame = 0; frame < 150; frame++) {
      const prior = state.individuals[index];
      state = tick(state, 0.1);
      const next = state.individuals[index];
      assert.ok(Math.abs(next.y - prior.y) < 0.23, `${orientation}/${touch} jumped ${next.y - prior.y} rows`);
      if (next.activity.current !== "substrate-search") exited = true;
    }
    assert.ok(exited);
    const next = state.individuals[index];
    assert.ok(next.y <= substrateSafeY(next, state) + 0.02, "never returned to swimming clearance");
  }
});

test("reversing a half-finished turn preserves the visible side and compression", () => {
  for (const progress of [0.2, 0.4, 0.6, 0.8]) for (const facing of [-1, 1]) {
    const base = stockedAquarium({ seed: 71 });
    const fish = {
      ...base.individuals[3], x: base.cols / 2, y: base.rows / 2,
      vx: facing * 0.7, vy: 0,
      visual: { facing, targetFacing: -facing, turnProgress: progress, pitch: 0, targetPitch: 0 },
    };
    const state = { ...base, individuals: base.individuals.map((other, i) => i === 3 ? fish : other) };
    const before = turnPose(fish);
    const after = turnPose(tick(state, 0.001).individuals[3]);
    assert.equal(after.facing, before.facing, `flipped early at ${progress}`);
    assert.ok(Math.abs(after.widthScale - before.widthScale) < 0.01);
  }
});

test("arrivals and reordered records do not change another fish's apparent size or colour", () => {
  for (const seed of [5, 29, 83, 147]) {
    // A new aquarium, so the arrival below is still ahead of it: a stocked tank
    // is past every milestone and nothing would join it.
    const base = createAquariumState({ seed });
    const arrival = contentSchedule(seed).find((event) => event.type === "fish-arrival");
    const after = advanceAquariumHistory(base, arrival.day + 0.00001);
    // The same instant with and without the newcomer, rather than two instants
    // either side of the arrival: the fortnightly calendar puts arrival days on
    // whole weeks, which is also where growth stages turn over, so stepping
    // across the boundary would measure a fish getting bigger and blame it on
    // the fish that joined.
    const before = { ...after, individuals: after.individuals.slice(0, -1) };
    assert.equal(after.individuals.length, before.individuals.length + 1);
    const scenes = [render(before), render(after)];
    for (const object of scenes[0].objects.filter((object) => object.id.startsWith("individual:"))) {
      assert.equal(scenes[1].objects.find((candidate) => candidate.id === object.id).signature, object.signature,
        `arrival resized/recoloured ${object.id}`);
    }
    const reversed = render({ ...before, individuals: [...before.individuals].reverse() });
    for (const fish of before.individuals) {
      const a = scenes[0].objects.find((object) => object.id.startsWith("individual:") && object.id.endsWith(`:${fish.seed}`));
      const b = reversed.objects.find((object) => object.id.startsWith("individual:") && object.id.endsWith(`:${fish.seed}`));
      assert.equal(a.signature, b.signature);
    }
  }
});
