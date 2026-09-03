import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_PLANT_JOINTS,
  PLANT_SPECIES,
  PLANT_SPECIES_BY_ID,
  RARE_PLANT_IDS,
} from "../src/art/plants.js";
import { isSupportedGlyph } from "../src/art/bitmap-font.js";
import { calculateDamage } from "../src/render/damage.js";
import { scenePalette } from "../src/render/palette.js";
import {
  MAX_RENDERED_PLANT_GLYPHS,
  MAX_SAMPLES_PER_SEGMENT,
} from "../src/render/plants.js";
import { LAYERS, render, renderPlantLabScene } from "../src/render/render.js";
import { glyphsForObject } from "../src/render/scene.js";
import { SUBSTRATE_ROWS } from "../src/sim/config.js";
import {
  createPlantFrameContext,
  createPlantSpecimen,
  plantGrowthState,
  plantCountFor,
  posePlant,
} from "../src/sim/plants.js";
import {
  PERSISTENCE_VERSION,
  createAquariumState,
  restorePersistentState,
  serializePersistentState,
} from "../src/sim/state.js";
import { tick } from "../src/sim/tick.js";

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function matureState(orientation, seed = 5, wallClockHours = 12) {
  const state = createAquariumState({ orientation, seed, wallClockHours });
  return {
    ...state,
    plants: state.plants.map((plant) => ({ ...plant, ageDays: 200 })),
  };
}

function plantObjects(scene) {
  return scene.objects.filter((object) => object.id.startsWith("plant:"));
}

function poseState(rows, seed = 71) {
  return {
    seed,
    rows,
    elapsedRealSeconds: 18.4,
    individuals: [],
    reaction: null,
  };
}

test("the shared library contains 28 bounded non-coral skeletal species", () => {
  assert.ok(PLANT_SPECIES.length >= 20 && PLANT_SPECIES.length <= 30);
  assert.equal(PLANT_SPECIES.length, 28);
  assert.ok(MAX_PLANT_JOINTS <= 12);
  // A bone is inked along its whole length, so the per-specimen ceiling is the
  // joint budget times the sampling ceiling rather than one mark per joint.
  assert.ok(MAX_SAMPLES_PER_SEGMENT <= 8);
  assert.ok(MAX_RENDERED_PLANT_GLYPHS <= 96);
  const ids = new Set();
  for (const species of PLANT_SPECIES) {
    assert.equal(ids.has(species.id), false, "duplicate species " + species.id);
    ids.add(species.id);
    assert.equal(/coral/i.test(species.id + species.name), false);
    assert.ok(["background", "midground", "foreground"].includes(species.layer));
    assert.ok(species.joints.length - 1 <= MAX_PLANT_JOINTS);
    assert.ok(Number.isFinite(species.nominalHeight) && species.nominalHeight > 0);
    assert.ok(species.heightRange[0] > 0 && species.heightRange[1] > species.heightRange[0]);
    assert.equal(species.joints[0].parent, -1);
    for (let index = 1; index < species.joints.length; index += 1) {
      const joint = species.joints[index];
      assert.ok(Number.isInteger(joint.parent) && joint.parent >= 0 && joint.parent < index);
      assert.ok(joint.stage >= species.joints[joint.parent].stage);
      assert.ok(Number.isFinite(joint.length) && joint.length > 0);
      assert.ok(Number.isFinite(joint.restAngle));
      for (const glyph of Array.isArray(joint.glyph) ? joint.glyph : joint.glyph ? [joint.glyph] : []) {
        assert.ok(isSupportedGlyph(glyph), species.id + " uses unsupported " + glyph);
      }
    }
    for (const glyph of [
      ...species.stemGlyphs.left,
      ...species.stemGlyphs.upright,
      ...species.stemGlyphs.right,
      ...species.tipGlyphs,
    ]) {
      assert.ok(isSupportedGlyph(glyph), species.id + " uses unsupported " + glyph);
    }
  }
});

test("planting layout and individual variation are deterministic and orientation-aware", () => {
  for (const orientation of ["landscape", "portrait"]) {
    const first = createAquariumState({ orientation, seed: 991 });
    const second = createAquariumState({ orientation, seed: 991 });
    const different = createAquariumState({ orientation, seed: 992 });
    assert.deepEqual(first.plants, second.plants);
    assert.notDeepEqual(first.plants, different.plants);
    assert.equal(first.plants.length, plantCountFor(orientation));
    assert.equal(first.plants.length, orientation === "landscape" ? 22 : 16);
    assert.ok(first.plants.some((plant) => !Number.isInteger(plant.x)), "roots snapped to a cell grid");
    assert.deepEqual(new Set(first.plants.map((plant) => plant.layer)), new Set(["background", "midground", "foreground"]));
    const sorted = first.plants.map((plant) => plant.x).sort((left, right) => left - right);
    const largestGap = Math.max(...sorted.slice(1).map((x, index) => x - sorted[index]));
    assert.ok(largestGap > first.cols * 0.055, orientation + " layout has no open-water gap");
  }
});

test("rare species remain discoverable without dominating seeded aquariums", () => {
  let rare = 0;
  let total = 0;
  let tanksWithRarePlants = 0;
  for (let seed = 0; seed < 240; seed += 1) {
    const state = createAquariumState({ orientation: "landscape", seed });
    const count = state.plants.filter((plant) => RARE_PLANT_IDS.includes(plant.speciesId)).length;
    rare += count;
    total += state.plants.length;
    if (count > 0) tanksWithRarePlants += 1;
  }
  assert.ok(rare > 0);
  assert.ok(rare / total > 0.01 && rare / total < 0.06);
  assert.ok(tanksWithRarePlants > 40 && tanksWithRarePlants < 180);
});

test("growth reveals structural joints while every root remains fixed", () => {
  for (const orientation of ["landscape", "portrait"]) {
    const rows = orientation === "landscape" ? 20 : 33;
    const state = poseState(rows);
    const context = createPlantFrameContext(state, { currentMultiplier: 0, still: true, interactions: false });
    for (const [index, species] of PLANT_SPECIES.entries()) {
      const plant = createPlantSpecimen({
        speciesId: species.id,
        seed: index + 11,
        x: 8.25,
        ageDays: 0,
        rows,
        size: "typical",
      });
      const seedling = posePlant(plant, state, { frameContext: context, ageDays: 0 });
      const matureAge = (species.maximumStage + 1) * species.growthStepDays + 2;
      const mature = posePlant(plant, state, { frameContext: context, ageDays: matureAge });
      assert.equal(seedling.root.x, 8.25);
      assert.equal(mature.root.x, 8.25);
      assert.equal(seedling.root.y, rows - SUBSTRATE_ROWS + 0.18);
      assert.equal(mature.root.y, seedling.root.y);
      assert.ok(mature.activeJointCount > seedling.activeJointCount, species.id + " did not add structure");
      assert.equal(mature.activeJointCount, species.joints.length - 1);
      assert.equal(plantGrowthState({ ...plant, ageDays: matureAge }, species).mature, true);
    }
  }
});

test("strong current, touch, and fish poses remain finite and bounded", () => {
  for (const orientation of ["landscape", "portrait"]) {
    const rows = orientation === "landscape" ? 20 : 33;
    for (const [index, species] of PLANT_SPECIES.entries()) {
      const plant = createPlantSpecimen({
        speciesId: species.id,
        seed: index + 500,
        x: 9,
        ageDays: 200,
        rows,
        size: "maximum",
      });
      const state = {
        ...poseState(rows, 123),
        reaction: { x: 6.5, y: rows - 7, ageSeconds: 1.1, durationSeconds: 3.2 },
        individuals: [{ x: 8, y: rows - 8, vx: 0.64, vy: 0.06 }],
      };
      const pose = posePlant(plant, state, {
        frameContext: createPlantFrameContext(state, { currentMultiplier: 1.85 }),
      });
      assert.equal(pose.activeJointCount, species.joints.length - 1);
      for (const point of [pose.root, ...pose.joints]) {
        assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.angle));
        assert.ok(point.y > 1.5, species.id + " crossed the waterline");
        assert.ok(point.y <= rows - SUBSTRATE_ROWS + 0.181, species.id + " grew below its root");
      }
    }
  }
});

test("touch and fish disturbance are one bounded influence per plant", () => {
  const rows = 20;
  const mid = createPlantSpecimen({ speciesId: "soft-ribbon", seed: 44, x: 10, ageDays: 200, rows });
  const background = createPlantSpecimen({ speciesId: "long-kelp", seed: 45, x: 10, ageDays: 200, rows });
  const quiet = { ...poseState(rows), elapsedRealSeconds: 4 };
  const touched = {
    ...quiet,
    reaction: { x: 7, y: 12, ageSeconds: 1, durationSeconds: 3.2 },
    individuals: [{ x: 9.4, y: 12, vx: 0.7, vy: 0 }],
  };
  const quietPose = posePlant(mid, quiet, { frameContext: createPlantFrameContext(quiet, { interactions: false }) });
  const activePose = posePlant(mid, touched, { frameContext: createPlantFrameContext(touched) });
  assert.equal(quietPose.disturbance, 0);
  assert.ok(activePose.disturbance > 0 && activePose.disturbance <= 0.42);
  assert.notEqual(activePose.joints.at(-1).x, quietPose.joints.at(-1).x);

  const fishOnly = { ...quiet, individuals: touched.individuals };
  const backgroundPose = posePlant(background, fishOnly, { frameContext: createPlantFrameContext(fishOnly) });
  assert.equal(backgroundPose.disturbance, 0, "distant-layer kelp should skip fish disturbance work");
});

test("reduced-detail quality keeps the same skeleton while omitting leaf attachments", () => {
  const rows = 20;
  const plant = createPlantSpecimen({ speciesId: "feather-weed", seed: 93, x: 8, ageDays: 200, rows });
  const state = poseState(rows);
  const frameContext = createPlantFrameContext(state, { currentMultiplier: 0, still: true, interactions: false });
  const full = posePlant(plant, state, { frameContext, quality: 1 });
  const reduced = posePlant(plant, state, { frameContext, quality: 0 });
  assert.deepEqual(reduced.root, full.root);
  assert.equal(reduced.maximumJointCount, full.maximumJointCount);
  assert.ok(reduced.activeJointCount < full.activeJointCount);
  assert.ok(reduced.joints.some((point) => point.role === "stem"));
});

test("mature aquarium plants stay within joint, attachment, and scene budgets", () => {
  // Continuous stems cost roughly twice the glyphs of the old dashed sampling,
  // and buy back repainted pixels: whole-scene damage fell in both orientations
  // because the ink now clusters into tighter, more stable object bounds.
  for (const [orientation, maximumTotal] of [["landscape", 520], ["portrait", 560]]) {
    for (const seed of [5, 83, 147]) {
      const scene = render(matureState(orientation, seed));
      const objects = plantObjects(scene);
      const diagnostics = scene.metadata.plants;
      assert.equal(objects.length, orientation === "landscape" ? 22 : 16);
      assert.equal(diagnostics.instances, objects.length);
      assert.ok(diagnostics.glyphs <= maximumTotal, orientation + " has too many plant glyphs");
      assert.ok(diagnostics.maximumActiveJoints <= MAX_PLANT_JOINTS);
      assert.ok(diagnostics.maximumGlyphs <= MAX_RENDERED_PLANT_GLYPHS);
      assert.ok(diagnostics.glyphs >= diagnostics.activeJoints);
      assert.equal(diagnostics.glyphs, diagnostics.jointAttachments + diagnostics.fillerAttachments);
      // Every posed bone ends on its own joint, so joint ink and active joints
      // match exactly and everything above that count is bone fill.
      assert.equal(diagnostics.jointAttachments, diagnostics.activeJoints);
      assert.ok(diagnostics.maximumAttachmentsPerSegment <= MAX_SAMPLES_PER_SEGMENT);
      for (const object of objects) {
        assert.ok(object.glyphCount > 0 && object.glyphCount <= MAX_RENDERED_PLANT_GLYPHS);
        assert.ok(Number.isFinite(object.bounds.x) && Number.isFinite(object.bounds.y));
        assert.ok(object.bounds.width > 0 && object.bounds.height > 0);
        for (const glyph of glyphsForObject(scene, object)) {
          assert.ok(isSupportedGlyph(glyph.char));
          assert.ok(Number.isFinite(glyph.x) && Number.isFinite(glyph.y));
          assert.match(glyph.fg, HEX_COLOR);
        }
      }
    }
  }
});

test("plant depth ordering keeps background and midground behind opaque fish", () => {
  const scene = render(matureState("landscape", 5));
  const background = scene.objects.find((object) => object.layer === LAYERS.backgroundPlants);
  const midground = scene.objects.find((object) => object.layer === LAYERS.midgroundPlants);
  const fish = scene.objects.find((object) => object.id.startsWith("individual:"));
  const foreground = scene.objects.find((object) => object.layer === LAYERS.foregroundPlants);
  assert.ok(background && midground && fish && foreground);
  assert.ok(background.layer < midground.layer && midground.layer < fish.layer && fish.layer < foreground.layer);
  assert.ok(fish.fill.length > 0);
  const sorted = scene.objects.map((object) => object.layer);
  assert.deepEqual(sorted, [...sorted].sort((left, right) => left - right));
});

test("quantized background poses can skip frames without synchronizing the garden", () => {
  const base = matureState("landscape", 29);
  const first = render({ ...base, elapsedRealSeconds: 1.01 });
  const second = render({ ...base, elapsedRealSeconds: 1.11 });
  const beforeBackground = plantObjects(first).filter((object) => object.layer === LAYERS.backgroundPlants);
  const afterBackground = new Map(plantObjects(second)
    .filter((object) => object.layer === LAYERS.backgroundPlants)
    .map((object) => [object.id, object]));
  assert.ok(beforeBackground.length > 0);
  assert.ok(beforeBackground.every((object) => afterBackground.get(object.id).signature === object.signature));

  const moving = plantObjects(first).filter((object) => object.layer !== LAYERS.backgroundPlants);
  const moved = new Map(plantObjects(second).map((object) => [object.id, object]));
  assert.ok(moving.some((object) => moved.get(object.id).signature !== object.signature));

  const tips = base.plants.slice(0, 8).map((plant) => {
    const state = { ...base, elapsedRealSeconds: 4.3, individuals: [], reaction: null };
    const pose = posePlant(plant, state, { frameContext: createPlantFrameContext(state) });
    return pose.joints.at(-1).x - plant.x;
  });
  assert.ok(new Set(tips.map((value) => value.toFixed(4))).size >= 5, "plant tips moved in lockstep");
});

test("mature vegetation preserves bounded dirty rectangles without full repaints", () => {
  for (const orientation of ["landscape", "portrait"]) {
    for (const seed of [5, 83, 147]) {
      let state = matureState(orientation, seed);
      for (let frame = 0; frame < 20; frame += 1) state = tick(state, 0.1);
      const before = render(state);
      const after = render(tick(state, 0.1));
      const damage = calculateDamage(before, after);
      assert.equal(damage.full, false);
      assert.ok(damage.rects.length > 0);
      assert.ok(damage.area < damage.total * 0.72, `${orientation}/${seed} damaged ${(damage.area / damage.total * 100).toFixed(1)}%`);
    }
  }
});

test("plant palettes stay quantized, restrained, and valid at day and night", () => {
  for (const hour of [2, 7, 12, 19.2]) {
    const palette = scenePalette({ timeOfDayHours: hour });
    for (const layer of ["background", "midground", "foreground"]) {
      assert.equal(palette.plants[layer].length, 3);
      assert.ok(palette.plants[layer].every((color) => HEX_COLOR.test(color)));
    }
    assert.match(palette.plants.growthTip, HEX_COLOR);
    assert.match(palette.plants.glowTip, HEX_COLOR);
  }
  const nightScene = render(matureState("landscape", 83, 2));
  const nightPlantColors = plantObjects(nightScene)
    .flatMap((object) => glyphsForObject(nightScene, object).map((glyph) => glyph.fg));
  assert.ok(new Set(nightPlantColors).size <= 11, "night plants introduced too many palette colours");
});

test("persistence v2 stores biology, not animated joints, and migrates v1 saves", () => {
  const base = createAquariumState({ orientation: "landscape", seed: 818 });
  const evolved = {
    ...base,
    plants: base.plants.map((plant, index) => ({ ...plant, ageDays: plant.ageDays + index + 3.5 })),
  };
  const saved = serializePersistentState(evolved);
  assert.equal(saved.persistenceVersion, PERSISTENCE_VERSION);
  assert.equal(JSON.stringify(saved).includes("joints"), false);
  assert.equal(JSON.stringify(saved).includes("points"), false);
  assert.deepEqual(restorePersistentState(base, saved).plants, evolved.plants);

  const legacy = {
    ...saved,
    persistenceVersion: 1,
    plants: saved.plants.slice(0, 12).map((plant) => ({
      seed: plant.seed,
      x: Math.round(plant.x),
      ageDays: plant.ageDays,
      maxHeight: Math.round(plant.matureHeight),
    })),
  };
  const migrated = restorePersistentState(base, legacy);
  assert.equal(migrated.plants.length, base.plants.length);
  assert.equal(migrated.plants[0].ageDays, legacy.plants[0].ageDays);
  assert.equal(migrated.plants[0].x, legacy.plants[0].x);
  assert.ok(PLANT_SPECIES_BY_ID[migrated.plants[0].speciesId]);
  assert.ok(migrated.plants.every((plant) => Number.isFinite(plant.phase) && Number.isFinite(plant.matureHeight)));
});

test("the dedicated plant lab renders every species and debug skeleton deterministically", () => {
  for (const species of PLANT_SPECIES) {
    const options = {
      orientation: species.layer === "background" ? "portrait" : "landscape",
      paletteMode: species.rare ? "night" : "day",
      elapsedRealSeconds: 6.3,
      seed: 901,
      size: "maximum",
      currentMultiplier: 1.85,
      disturbance: "touch",
    };
    const first = renderPlantLabScene(species.id, options);
    const second = renderPlantLabScene(species.id, options);
    assert.deepEqual(first, second);
    assert.equal(first.metadata.plantLab, true);
    assert.equal(first.objects.filter((object) => object.id.startsWith("plant-lab:")).length, 2);
    assert.ok(first.metadata.skeletonLines.length > 0);
    for (const line of first.metadata.skeletonLines) {
      assert.ok([line.x1, line.y1, line.x2, line.y2].every(Number.isFinite));
    }
  }
});
