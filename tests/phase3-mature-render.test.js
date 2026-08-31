// Phase 3: the worst case the renderer now has to survive is not a fresh
// aquarium but a mature one - eight individuals, the plant cap, grown
// vegetation, and a rare plant in its glowing window.
import assert from "node:assert/strict";
import test from "node:test";

import { PLANT_SPECIES_BY_ID, RARE_PLANT_IDS } from "../src/art/plants.js";
import { isSupportedGlyph } from "../src/render/bitmap-font.js";
import { calculateDamage } from "../src/render/damage.js";
import { MAX_RENDERED_PLANT_GLYPHS, MAX_SAMPLES_PER_SEGMENT } from "../src/render/plants.js";
import { LAYERS, render } from "../src/render/render.js";
import { glyphsForObject } from "../src/render/scene.js";
import { MAX_INDIVIDUALS, advanceAquariumHistory } from "../src/sim/aquarium-history.js";
import { createPlantFromSeed, plantCapFor, plantLifecycle, plantSpecies } from "../src/sim/plants.js";
import { createAquariumState } from "../src/sim/state.js";
import { tick } from "../src/sim/tick.js";

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
// Measured budgets for a maximum-population mature garden, sitting above the
// observed worst case so ordinary seeded variation has room.
const MATURE_PLANT_GLYPH_BUDGET = { landscape: 780, portrait: 860 };

// A deterministic worst-case aquarium: the hard plant cap, every specimen
// mature, both fish arrivals resolved, and enough age for a rare lifecycle.
function maturePhase3State(orientation, seed = 5, wallClockHours = 12) {
  const base = createAquariumState({ orientation, seed, wallClockHours });
  const grown = advanceAquariumHistory(base, 900);
  const cap = plantCapFor(orientation);
  const plants = [...grown.plants];
  // Top the roster up to the cap with local shoots of existing colonies so the
  // measurement is against the budget rather than against whatever this seed
  // happened to grow.
  let filler = 0;
  while (plants.length < cap) {
    const parent = plants[filler % grown.plants.length];
    plants.push(createPlantFromSeed({
      seed: (0x7c3f0000 + filler * 2654435761) >>> 0,
      speciesId: parent.speciesId,
      x: Math.max(0.6, Math.min(base.cols - 0.6, parent.x + (filler % 2 ? 0.9 : -0.9))),
      ageDays: 400,
      rows: base.rows,
    }));
    filler += 1;
  }
  return {
    ...grown,
    plants: plants.map((plant) => ({ ...plant, ageDays: 400 })),
  };
}

function plantObjects(scene) {
  return scene.objects.filter((object) => object.id.startsWith("plant:"));
}

test("the mature Phase 3 worst case is the population the caps describe", () => {
  for (const orientation of ["landscape", "portrait"]) {
    const state = maturePhase3State(orientation);
    assert.equal(state.plants.length, plantCapFor(orientation));
    assert.equal(state.individuals.length, MAX_INDIVIDUALS);
    assert.equal(state.school.length, 32);
    assert.deepEqual(
      new Set(state.plants.map((plant) => plant.layer)),
      new Set(["background", "midground", "foreground"]),
    );
    assert.ok(state.plants.some((plant) => RARE_PLANT_IDS.includes(plant.speciesId)));
  }
});

test("a mature maximum-population aquarium renders finite, unique, supported objects", () => {
  for (const orientation of ["landscape", "portrait"]) {
    for (const seed of [5, 83, 147]) {
      let state = maturePhase3State(orientation, seed);
      for (let frame = 0; frame < 12; frame += 1) state = tick(state, 0.1);
      const scene = render(state);
      const diagnostics = scene.metadata.plants;

      assert.equal(new Set(scene.objects.map((object) => object.id)).size, scene.objects.length);
      assert.equal(plantObjects(scene).length, plantCapFor(orientation));
      assert.equal(diagnostics.instances, plantCapFor(orientation));
      assert.ok(diagnostics.glyphs <= MATURE_PLANT_GLYPH_BUDGET[orientation],
        `${orientation}/${seed} emitted ${diagnostics.glyphs} plant glyphs`);
      assert.ok(diagnostics.maximumGlyphs <= MAX_RENDERED_PLANT_GLYPHS);
      assert.ok(diagnostics.maximumAttachmentsPerSegment <= MAX_SAMPLES_PER_SEGMENT);
      // Every posed bone still ends on its own joint: the continuity contract.
      assert.equal(diagnostics.jointAttachments, diagnostics.activeJoints);
      assert.equal(diagnostics.glyphs, diagnostics.jointAttachments + diagnostics.fillerAttachments);

      for (const object of scene.objects) {
        assert.ok(Number.isFinite(object.bounds.x) && Number.isFinite(object.bounds.y));
        assert.ok(Number.isFinite(object.bounds.width) && Number.isFinite(object.bounds.height));
        for (const glyph of glyphsForObject(scene, object)) {
          assert.ok(isSupportedGlyph(glyph.char), `unsupported glyph ${glyph.char}`);
          assert.ok(Number.isFinite(glyph.x) && Number.isFinite(glyph.y));
          assert.match(glyph.fg, HEX_COLOR);
        }
      }

      // Two extra individuals must not cost per-fish body geometry.
      const fish = scene.objects.filter((object) => object.id.startsWith("individual:"));
      assert.equal(fish.length, MAX_INDIVIDUALS);
      assert.ok(fish.every((object) => object.fill.length <= 9),
        "an individual exceeded the nine-rectangle body fill budget");
      // Depth ordering survives the larger cast and garden.
      const layers = scene.objects.map((object) => object.layer);
      assert.deepEqual(layers, [...layers].sort((left, right) => left - right));
      assert.ok(scene.objects.some((object) => object.layer === LAYERS.foregroundPlants));
    }
  }
});

test("ordinary motion in a mature Phase 3 aquarium never requests a full redraw", () => {
  for (const orientation of ["landscape", "portrait"]) {
    for (const seed of [5, 83, 147]) {
      let state = maturePhase3State(orientation, seed);
      for (let frame = 0; frame < 20; frame += 1) state = tick(state, 0.1);
      let previous = render(state);
      let maximumFill = 0;
      let worstDamage = 0;
      for (let frame = 0; frame < 60; frame += 1) {
        state = tick(state, 0.1);
        const next = render(state);
        const damage = calculateDamage(previous, next);
        assert.equal(damage.full, false, `${orientation}/${seed} requested a full redraw`);
        assert.ok(damage.rects.length > 0);
        worstDamage = Math.max(worstDamage, damage.area / damage.total);
        maximumFill = Math.max(maximumFill, ...next.objects
          .filter((object) => object.id.startsWith("individual:"))
          .map((object) => object.fill.length));
        previous = next;
      }
      assert.equal(maximumFill, 9, "the individual body fill budget moved");
      assert.ok(worstDamage < 0.98, `${orientation}/${seed} damaged ${(worstDamage * 100).toFixed(1)}%`);
    }
  }
});

test("a rare bloom is a slow palette change, not a per-frame invalidation", () => {
  const orientation = "landscape";
  const base = createAquariumState({ orientation, seed: 5 });
  const glowSpecies = RARE_PLANT_IDS.find((id) => PLANT_SPECIES_BY_ID[id].glowTips);
  assert.ok(glowSpecies);

  // One glow-tipped rare plant, walked through its own lifecycle by age alone.
  const specimen = createPlantFromSeed({
    seed: 0x51a7b100,
    speciesId: glowSpecies,
    x: base.cols * 0.5,
    ageDays: 0,
    rows: base.rows,
  });
  const stateAt = (ageDays) => ({
    ...base,
    individuals: [],
    reaction: null,
    plants: [{ ...specimen, ageDays }],
  });

  const signatures = new Map();
  let previousSignature = null;
  let changes = 0;
  let sawGlow = false;
  let sawDormant = false;
  for (let day = 120; day <= 300; day += 0.5) {
    const scene = render(stateAt(day));
    const object = plantObjects(scene)[0];
    const colors = new Set(glyphsForObject(scene, object).map((glyph) => glyph.fg));
    const key = [...colors].sort().join("|");
    if (previousSignature !== null && key !== previousSignature) changes += 1;
    previousSignature = key;
    signatures.set(key, (signatures.get(key) ?? 0) + 1);
    const lifecycle = plantLifecycle({ ...specimen, ageDays: day });
    if (lifecycle.active) sawGlow = true;
    else sawDormant = true;
  }
  assert.ok(sawGlow && sawDormant, "the lifecycle never opened or never closed");
  // Coarse: a handful of colour transitions across half a simulated year.
  assert.ok(changes <= 12, `the bloom changed the plant's palette ${changes} times`);
  assert.ok(signatures.size <= 4, "the bloom produced a continuously changing colour");
});

test("the mature palette introduces no new colours", () => {
  for (const hour of [2, 12]) {
    const scene = render(maturePhase3State("landscape", 83, hour));
    const colors = new Set(plantObjects(scene)
      .flatMap((object) => glyphsForObject(scene, object).map((glyph) => glyph.fg)));
    assert.ok(colors.size <= 11, `the mature garden used ${colors.size} plant colours`);
  }
});

test("propagation and emergence keep every root inside the tank in both orientations", () => {
  for (const orientation of ["landscape", "portrait"]) {
    for (let seed = 0; seed < 40; seed += 1) {
      const state = advanceAquariumHistory(createAquariumState({ orientation, seed }), 730);
      for (const plant of state.plants) {
        assert.ok(plant.x > 0 && plant.x < state.cols, `${orientation}/${seed} rooted a plant at ${plant.x}`);
        assert.ok(["background", "midground", "foreground"].includes(plantSpecies(plant).layer));
        assert.equal(plant.layer, plantSpecies(plant).layer);
        assert.ok(plant.matureHeight > 0 && plant.matureHeight < state.rows);
      }
    }
  }
});
