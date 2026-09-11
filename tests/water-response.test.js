import assert from "node:assert/strict";
import test from "node:test";
import { stockedAquarium } from "./support/aquarium.js";
import { posePlant } from "../src/sim/plants.js";
import { createImpulse, MAX_IMPULSES } from "../src/sim/interaction-events.js";
import { render } from "../src/render/render.js";
import { mixColor, scenePalette } from "../src/render/palette.js";
import {
  MAX_WATER_SPANS_PER_IMPULSE,
  waterBandIndexAtY,
  waterImpulseGeometry,
} from "../src/render/water-impulses.js";

test("local water bends a grown canopy visibly, recoils, and leaves its root fixed", () => {
  const base = stockedAquarium({ seed: 5 });
  const plant = base.plants.find((entry) => entry.speciesId === "long-kelp");
  assert.ok(plant);
  const rest = posePlant(plant, base);
  const tip = rest.joints.reduce((highest, joint) => joint.y < highest.y ? joint : highest);
  const moved = (ageSeconds, y = tip.y + 1, dirX = 1) => posePlant(plant, {
    ...base, impulses: [createImpulse({ id: "water", x: plant.x - 0.8, y, ageSeconds, dirX })],
  });
  const forward = moved(0.7), rebound = moved(2.5), ended = moved(3.2);
  assert.ok((forward.points[tip.index].x - tip.x) * 800 / 66 > 6, "bend must read in panel pixels");
  assert.ok(rebound.points[tip.index].x < tip.x, "stem must recoil after the pressure passes");
  assert.ok(moved(0.7, tip.y + 1, -1).points[tip.index].x < tip.x, "leftward water bends left");
  assert.deepEqual(forward.root, rest.root);
  for (const joint of forward.joints) {
    const parent = forward.points[joint.parent], original = rest.points[joint.index];
    const restParent = rest.points[joint.parent];
    assert.ok(Math.abs(Math.hypot(joint.x - parent.x, joint.y - parent.y)
      - Math.hypot(original.x - restParent.x, original.y - restParent.y)) < 1e-9,
    "disturbance bends the connected skeleton without stretching it");
  }
  assert.ok(Math.abs(ended.points[tip.index].x - tip.x) < 1e-9);
  assert.deepEqual(moved(0.7, 2).points, rest.points, "high water is out of this canopy's reach");
});

test("young plants are not given their future canopy's interaction reach", () => {
  const base = stockedAquarium({ seed: 5 });
  const mature = base.plants.find((entry) => entry.speciesId === "long-kelp");
  const young = { ...mature, ageDays: 0 };
  const tipY = Math.min(...posePlant(mature, base).joints.map((joint) => joint.y));
  const impulse = createImpulse({ id: "canopy", x: mature.x - 0.3, y: tipY, radius: 2, ageSeconds: 0.7 });
  const disturbed = { ...base, impulses: [impulse] };
  assert.notEqual(posePlant(mature, disturbed).disturbance, posePlant(mature, base).disturbance);
  assert.deepEqual(posePlant(young, disturbed).points, posePlant(young, base).points);
});

test("water crests are bounded raster marks, fade out, and yield to inhabitants", () => {
  const base = stockedAquarium({ seed: 5 });
  const sceneAt = (ageSeconds) => render({ ...base, impulses: Array.from({ length: MAX_IMPULSES }, (_, i) =>
    createImpulse({ id: `test:${i}`, x: 20 + i * 3, y: 8, ageSeconds })) });
  const scene = sceneAt(0.4);
  const water = scene.objects.filter((object) => object.id.startsWith("reaction:ripple:"));
  assert.equal(water.length, MAX_IMPULSES);
  for (const object of water) {
    assert.equal(object.glyphCount, 0);
    assert.ok(object.fill.length > 0 && object.fill.length <= MAX_WATER_SPANS_PER_IMPULSE);
    assert.ok(object.bounds.width < 80 && object.bounds.height < 80);
    assert.ok(object.layer < Math.min(...scene.objects.filter((entry) => entry.id.startsWith("individual:"))
      .map((entry) => entry.layer)));
  }
  assert.equal(sceneAt(3.2).objects.filter((object) => object.id.startsWith("reaction:ripple:")).length, 0);
});

test("deep water crests fade toward the same band as the surrounding background", () => {
  const base = stockedAquarium({ seed: 5 });
  const impulse = createImpulse({ id: "deep-band", x: 30, y: 15.5, ageSeconds: 0.4 });
  const palette = scenePalette(base);
  const shape = waterImpulseGeometry(impulse);

  assert.equal(waterBandIndexAtY(base, shape.y, palette.waterBands.length), 5,
    "the lower water column belongs to the deepest background band");

  const scene = render({ ...base, impulses: [impulse] });
  const crest = scene.objects.find((object) => object.id === "reaction:ripple:deep-band");
  assert.ok(crest?.fill.length > 0);
  const expected = mixColor(palette.waterBands[5], palette.ambient, shape.visibility);
  assert.ok(crest.fill.every((span) => span.color === expected),
    "crest visibility must blend out from the background band under the impulse");
});
