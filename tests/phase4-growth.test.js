import assert from "node:assert/strict";
import test from "node:test";

import { mirrorSprite, normalizeRows } from "../src/art/mirror.js";
import {
  growthStagesBySpecies,
  growthStagesFor,
  individualSprites,
  spriteDimensions,
} from "../src/art/sprites.js";
import {
  advanceAquariumHistory,
  contentSchedule,
  inferredFishAgeDays,
  INITIAL_INDIVIDUAL_COUNT,
} from "../src/sim/aquarium-history.js";
import {
  MINIMUM_STAGE_DAYS,
  fishGrowth,
  fishGrowthProfile,
  initialFishAgeDays,
  speciesForSeed,
  spriteForFish,
} from "../src/sim/fish-growth.js";
import { fishVerticalClearanceRows } from "../src/sim/fish-motion.js";
import {
  advanceOffline,
  createAquariumState,
  restorePersistentState,
  serializePersistentState,
} from "../src/sim/state.js";
import { tick } from "../src/sim/tick.js";
import { render } from "../src/render/render.js";

const SEED = 0xa51c0a7e;
const SEEDS = [SEED, 1, 5, 17, 42, 77, 313, 4242, 100003];

function fresh(seed = SEED, orientation = "landscape") {
  return createAquariumState({ orientation, seed });
}

function atDay(day, { seed = SEED, orientation = "landscape" } = {}) {
  return advanceAquariumHistory(fresh(seed, orientation), day);
}

function individualObject(scene, index, fish) {
  const object = scene.objects.find((candidate) => candidate.id === `individual:${index}:${fish.seed}`);
  assert.ok(object, `missing scene object for individual ${index}`);
  return object;
}

// --- artwork ----------------------------------------------------------------

test("every species grows through ordered stages that end in its adult sprite", () => {
  assert.equal(Object.keys(growthStagesBySpecies).length, individualSprites.length);
  for (const adult of individualSprites) {
    const stages = growthStagesFor(adult.id);
    assert.ok(stages.length >= 3, `${adult.id} has only ${stages.length} growth stages`);
    // Identity, not equality: the adult frame has to be the very object the
    // renderer's per-id sprite, body-box, and pitch-pose lookups were
    // calibrated against.
    assert.equal(stages.at(-1), adult);

    let previousArea = 0;
    for (const stage of stages) {
      const { width, height } = spriteDimensions(stage);
      assert.ok(width <= 8, `${stage.id} is ${width} cells wide`);
      assert.equal(stage.mask.length, height);
      assert.ok(stage.mask.every((row) => [...row].length <= width));
      // A fish never shrinks as it develops.
      assert.ok(width * height >= previousArea, `${stage.id} is smaller than the stage before it`);
      previousArea = width * height;
    }
  }
});

test("growth stages mirror as cleanly as the adults do", () => {
  for (const adult of individualSprites) {
    for (const stage of growthStagesFor(adult.id)) {
      const width = spriteDimensions(stage).width;
      const twice = mirrorSprite(mirrorSprite(stage));
      assert.deepEqual(twice.shape, normalizeRows(stage.shape, width));
      assert.deepEqual(twice.mask, normalizeRows(stage.mask, width));
    }
  }
});

test("stage ids are unique and the smallest stages opt out of the opaque body", () => {
  const ids = new Set();
  for (const adult of individualSprites) {
    for (const stage of growthStagesFor(adult.id)) {
      assert.ok(!ids.has(stage.id), `duplicate stage id ${stage.id}`);
      ids.add(stage.id);
      if (spriteDimensions(stage).height < 2) {
        assert.equal(stage.body, false, `${stage.id} would be backed by a body slab`);
      }
    }
  }
});

// --- pace -------------------------------------------------------------------

test("no growth stage passes in less than a week, and most take longer", () => {
  let longest = 0;
  let stages = 0;
  for (let index = 0; index < 600; index += 1) {
    const profile = fishGrowthProfile(Math.imul(index + 1, 0x9e3779b1) >>> 0);
    for (let stage = 1; stage < profile.thresholds.length; stage += 1) {
      const days = profile.thresholds[stage] - profile.thresholds[stage - 1];
      assert.ok(days >= MINIMUM_STAGE_DAYS - 1e-9, `a stage passed in ${days} days`);
      longest = Math.max(longest, days);
      stages += 1;
    }
  }
  assert.ok(stages > 2000);
  // A week is the floor; the seeded pace has to reach well past it or every
  // fish would grow at the same speed.
  assert.ok(longest > 20, `the slowest stage anywhere was only ${longest} days`);
});

test("fish of the same species grow at different rates", () => {
  const paces = new Set();
  for (let index = 0; index < 400; index += 1) {
    const seed = Math.imul(index + 1, 0x85ebca6b) >>> 0;
    if (speciesForSeed(seed).id !== "round-fin") continue;
    paces.add(fishGrowthProfile(seed).fullGrowthDays.toFixed(3));
  }
  assert.ok(paces.size > 20, `only ${paces.size} distinct round-fin growth spans`);
});

test("reaching a species maximum is months of aquarium life, not days", () => {
  for (const adult of individualSprites) {
    const stageCount = growthStagesFor(adult.id).length;
    for (let index = 0; index < 200; index += 1) {
      const seed = Math.imul(index + 7, 0xc2b2ae35) >>> 0;
      if (speciesForSeed(seed).id !== adult.id) continue;
      const profile = fishGrowthProfile(seed);
      assert.ok(
        profile.thresholds.at(-1) >= (stageCount - 1) * MINIMUM_STAGE_DAYS,
        `${adult.id} reaches its maximum in ${profile.thresholds.at(-1)} days`,
      );
    }
  }
});

// --- variation --------------------------------------------------------------

test("not every fry becomes an adult, and a fish that stops never grows again", () => {
  let atMaximum = 0;
  let stoppedEarly = 0;
  const total = 900;
  for (let index = 0; index < total; index += 1) {
    const seed = Math.imul(index + 1, 0x27d4eb2f) >>> 0;
    const profile = fishGrowthProfile(seed);
    const last = profile.stages.length - 1;
    if (profile.terminalStage === last) atMaximum += 1;
    else stoppedEarly += 1;
    // Ten years of aquarium later, a stopped fish is still exactly where it
    // stopped. Growth is a terminal state, never a slow crawl to maximum.
    const old = fishGrowth({ seed, ageDays: 3650 });
    assert.equal(old.stageIndex, profile.terminalStage);
    assert.ok(old.grown);
    assert.equal(old.nextStageDay, null);
    // A fish stopped short is still a developed fish, never a permanent speck.
    assert.ok(!String(old.label).startsWith("fry"));
  }
  assert.ok(stoppedEarly / total > 0.3, `only ${stoppedEarly}/${total} fish stop short of maximum`);
  assert.ok(atMaximum / total > 0.4, `only ${atMaximum}/${total} fish ever reach maximum`);
});

test("a fish only ever moves forward through its own stages", () => {
  for (const seed of SEEDS) {
    let previous = 0;
    for (let day = 0; day <= 400; day += 0.5) {
      const growth = fishGrowth({ seed, ageDays: day });
      assert.ok(growth.stageIndex >= previous, "a fish shrank");
      assert.ok(growth.stageIndex - previous <= 1, "a fish skipped a stage");
      previous = growth.stageIndex;
    }
  }
});

test("an aquarium is handed over established but still has something to do", () => {
  let fish = 0;
  let grown = 0;
  let developing = 0;
  for (let seed = 1; seed <= 120; seed += 1) {
    for (const individual of fresh(seed).individuals) {
      const growth = fishGrowth(individual);
      fish += 1;
      if (growth.grown) grown += 1;
      else developing += 1;
    }
  }
  // Day one is an aquarium, not a hatchery.
  assert.ok(grown / fish > 0.7, `only ${grown}/${fish} fish start grown`);
  // ...but a tank where nothing is left to change would have no long horizon.
  assert.ok(developing / fish > 0.08, `only ${developing}/${fish} fish start developing`);
});

// --- advancement ------------------------------------------------------------

test("fish age on the aquarium clock, in step with the plants", () => {
  const start = fresh();
  const later = advanceAquariumHistory(start, 90);
  assert.equal(later.totalDays, 90);
  start.individuals.forEach((fish, index) => {
    assert.ok(Math.abs(later.individuals[index].ageDays - (fish.ageDays + 90)) < 1e-9);
  });
});

test("growth reaches the same place whatever the step size", () => {
  for (const seed of SEEDS) {
    const single = advanceAquariumHistory(fresh(seed), 300);
    let stepped = fresh(seed);
    for (let step = 0; step < 300; step += 1) stepped = advanceAquariumHistory(stepped, 1);
    let weekly = fresh(seed);
    for (let step = 0; step < 60; step += 1) weekly = advanceAquariumHistory(weekly, 5);

    for (const other of [stepped, weekly]) {
      assert.equal(other.individuals.length, single.individuals.length);
      single.individuals.forEach((fish, index) => {
        assert.equal(other.individuals[index].seed, fish.seed);
        assert.ok(Math.abs(other.individuals[index].ageDays - fish.ageDays) < 1e-6);
        assert.equal(
          spriteForFish(other.individuals[index]).id,
          spriteForFish(fish).id,
          `${fish.seed.toString(16)} grew differently at a different step size`,
        );
      });
    }
  }
});

test("a month offline and a month accelerated grow the same fish", () => {
  for (const seed of [SEED, 5, 77]) {
    const offline = advanceOffline(fresh(seed), 45 * 86400);
    const accelerated = advanceAquariumHistory(fresh(seed), 45);
    accelerated.individuals.forEach((fish, index) => {
      assert.ok(Math.abs(offline.individuals[index].ageDays - fish.ageDays) < 1e-6);
      assert.equal(spriteForFish(offline.individuals[index]).id, spriteForFish(fish).id);
    });
  }
});

test("an arrival hatches as a fry and grows up inside the aquarium", () => {
  for (const seed of [SEED, 5, 77, 4242]) {
    const arrival = contentSchedule(seed).find((milestone) => milestone.type === "fish-arrival");
    const justArrived = atDay(arrival.day + 0.01, { seed });
    const newcomer = justArrived.individuals.at(-1);
    assert.equal(newcomer.seed, arrival.fishSeed);
    assert.ok(newcomer.ageDays < 0.05, `an arrival appeared ${newcomer.ageDays} days old`);
    assert.equal(fishGrowth(newcomer).stageIndex, 0);

    // The seeded pace is what decides when, so the assertion is that a year is
    // unambiguously enough for any of them.
    const grown = atDay(arrival.day + 365, { seed }).individuals
      .find((fish) => fish.seed === arrival.fishSeed);
    const growth = fishGrowth(grown);
    assert.ok(growth.grown, "an arrival was still growing a year later");
    assert.equal(growth.stageIndex, fishGrowthProfile(arrival.fishSeed).terminalStage);
  }
});

// --- the rest of the simulation --------------------------------------------

test("a fry is measured, bounded, and swum as the small fish it is", () => {
  const seed = individualSprites.length * 4 + 3;
  const fry = { seed, ageDays: 0 };
  const adult = { seed, ageDays: 4000 };
  assert.ok(fishVerticalClearanceRows(fry) < fishVerticalClearanceRows(adult));

  let state = fresh();
  state = {
    ...state,
    individuals: state.individuals.map((fish) => ({ ...fish, ageDays: 0 })),
  };
  for (let frame = 0; frame < 60; frame += 1) state = tick(state, 0.1);
  for (const fish of state.individuals) {
    assert.ok(Number.isFinite(fish.x) && Number.isFinite(fish.y));
    assert.ok(fish.x >= 0 && fish.x <= state.cols);
    assert.ok(fish.y > 0 && fish.y < state.rows);
  }
});

test("the renderer draws the stage a fish has reached, and never backs a fry", () => {
  const base = fresh();
  const young = {
    ...base,
    individuals: base.individuals.map((fish) => ({ ...fish, ageDays: 0 })),
  };
  const old = {
    ...base,
    individuals: base.individuals.map((fish) => ({ ...fish, ageDays: 4000 })),
  };

  const youngScene = render(young);
  young.individuals.forEach((fish, index) => {
    const object = individualObject(youngScene, index, fish);
    assert.ok(object.glyphCount > 0, "a fry drew nothing at all");
    assert.equal(object.fill.length, 0, "a fry was backed by an opaque body");
    assert.equal(
      object.glyphCount,
      spriteForFish(fish).shape.join("").replace(/ /g, "").length,
      "a fry was not drawn from its own stage artwork",
    );
  });

  const oldScene = render(old);
  old.individuals.forEach((fish, index) => {
    const object = individualObject(oldScene, index, fish);
    assert.ok(object.fill.length > 0, "a grown fish lost its opaque body");
    // Growth may not raise the body's cost ceiling: a grown fish is drawn one
    // span per scanline like every other, and a bigger fish is a taller one.
    assert.ok(object.fill.length <= 128);
    assert.ok(object.glyphCount > individualObject(youngScene, index, fish).glyphCount);
  });
});

test("growing changes only the fish that grew", () => {
  const before = fresh(SEED);
  const seed = before.individuals[0].seed;
  const profile = fishGrowthProfile(seed);
  const justBefore = {
    ...before,
    individuals: before.individuals.map((fish, index) => (
      index === 0 ? { ...fish, ageDays: profile.thresholds[1] - 0.01 } : fish
    )),
  };
  const justAfter = {
    ...justBefore,
    individuals: justBefore.individuals.map((fish, index) => (
      index === 0 ? { ...fish, ageDays: profile.thresholds[1] + 0.01 } : fish
    )),
  };
  assert.notEqual(spriteForFish(justBefore.individuals[0]).id, spriteForFish(justAfter.individuals[0]).id);

  const first = render(justBefore);
  const second = render(justAfter);
  assert.notEqual(
    individualObject(first, 0, justBefore.individuals[0]).signature,
    individualObject(second, 0, justAfter.individuals[0]).signature,
  );
  for (let index = 1; index < justBefore.individuals.length; index += 1) {
    assert.equal(
      individualObject(first, index, justBefore.individuals[index]).signature,
      individualObject(second, index, justAfter.individuals[index]).signature,
      "an unrelated fish repainted because another one grew",
    );
  }
});

// --- persistence ------------------------------------------------------------

test("a fish's age survives a save and reload exactly", () => {
  const aged = advanceOffline(fresh(), 140 * 86400);
  const restored = restorePersistentState(fresh(), serializePersistentState(aged));
  assert.equal(restored.individuals.length, aged.individuals.length);
  restored.individuals.forEach((fish, index) => {
    assert.equal(fish.seed, aged.individuals[index].seed);
    assert.ok(Math.abs(fish.ageDays - aged.individuals[index].ageDays) < 1e-9);
    assert.equal(spriteForFish(fish).id, spriteForFish(aged.individuals[index]).id);
  });
});

test("a save written before growth existed comes back with the fish it earned", () => {
  for (const seed of [SEED, 5, 4242]) {
    const aged = advanceOffline(fresh(seed), 220 * 86400);
    const saved = serializePersistentState(aged);
    // Exactly what a Phase 3 save looks like: everything else, no ages.
    for (const fish of saved.individuals) delete fish.ageDays;

    const restored = restorePersistentState(fresh(seed), saved);
    restored.individuals.forEach((fish, index) => {
      assert.ok(
        Math.abs(fish.ageDays - aged.individuals[index].ageDays) < 1e-6,
        "a migrated fish did not come back the age it actually is",
      );
    });
    // Reconstruction, not a reset to zero: an old aquarium keeps its grown cast.
    assert.ok(restored.individuals.every((fish) => fish.ageDays > 0));
    assert.ok(restored.individuals.some((fish) => fishGrowth(fish).grown));
  }
});

test("the reconstructed age knows both ways a fish can be in the roster", () => {
  const schedule = contentSchedule(SEED).filter((milestone) => milestone.type === "fish-arrival");
  for (let ordinal = 0; ordinal < schedule.length; ordinal += 1) {
    assert.ok(Math.abs(
      inferredFishAgeDays(SEED, schedule[ordinal].fishSeed, 200) - (200 - schedule[ordinal].day),
    ) < 1e-9);
  }
  const original = fresh().individuals[0];
  assert.ok(Math.abs(
    inferredFishAgeDays(SEED, original.seed, 200) - (initialFishAgeDays(original.seed) + 200),
  ) < 1e-9);
  // An arrival that has not happened yet cannot be older than the aquarium.
  assert.equal(inferredFishAgeDays(SEED, schedule[1].fishSeed, 1), 0);
});

test("a corrupt age cannot produce a corrupt fish", () => {
  const aged = advanceOffline(fresh(), 60 * 86400);
  for (const broken of [Number.NaN, Number.POSITIVE_INFINITY, -500, "old", null, undefined]) {
    const saved = serializePersistentState(aged);
    saved.individuals[0].ageDays = broken;
    const restored = restorePersistentState(fresh(), saved);
    const fish = restored.individuals[0];
    assert.ok(Number.isFinite(fish.ageDays) && fish.ageDays >= 0, `age survived as ${broken}`);
    assert.ok(spriteForFish(fish).shape.length >= 1);
  }
  // The same guard covers a live state that never had an age at all.
  const missing = { seed: 12345 };
  assert.equal(fishGrowth(missing).stageIndex, 0);
  assert.ok(spriteForFish(missing).shape.length >= 1);
});

test("growth adds nothing to a save but one number per fish", () => {
  const saved = serializePersistentState(advanceOffline(fresh(), 30 * 86400));
  for (const fish of saved.individuals) {
    assert.equal(typeof fish.ageDays, "number");
    // No stage, no pace, no terminal stage, no growth log: all of it derives.
    assert.deepEqual(
      Object.keys(fish).filter((key) => /grow|stage|pace|matur/i.test(key)),
      [],
    );
  }
  assert.equal(saved.persistenceVersion, 2);
});

test("the roster ceiling and the initial cast are unchanged by growth", () => {
  const state = atDay(500);
  assert.equal(fresh().individuals.length, INITIAL_INDIVIDUAL_COUNT);
  assert.equal(state.individuals.length, 8);
  assert.equal(new Set(state.individuals.map((fish) => fish.seed)).size, 8);
});
