import assert from "node:assert/strict";
import test from "node:test";
import { paintedSurfaceGap, renderedFeedingContact } from "../src/dev/rendered-contact.js";
import { createAquariumState } from "../src/sim/state.js";
import { stockedAquarium } from "./support/aquarium.js";
import { render } from "../src/render/render.js";

test("contact measures the crest under every painted span, including partial overlaps", () => {
  const scene = { height: 100, logicalHeight: 10, background: { substrateSegments: [
    { x: 0, y: 90, width: 10, height: 10 },
    { x: 10, y: 80, width: 10, height: 20 },
  ] } };
  assert.equal(paintedSurfaceGap(scene, [{ x: 8, y: 70, width: 4, height: 15 }]), -0.5);
  assert.equal(paintedSurfaceGap(scene, [{ x: 6, y: 70, width: 4, height: 15 }]), 0.5);
});

test("opaque body burial cannot disappear behind a glyph-only measurement", () => {
  const state = stockedAquarium({ seed: 5 });
  const fish = state.individuals[3];
  const scene = render(state);
  const object = scene.objects.find((object) => object.id === `individual:3:${fish.seed}`);
  const first = renderedFeedingContact(scene, fish, 3);
  const segment = scene.background.substrateSegments.find((segment) => segment.x > scene.width / 2);
  const depth = (object.layer - 20) / 36;
  const ground = segment.y + (scene.height - 0.48 * (scene.height / scene.logicalHeight) - segment.y) * depth;
  object.fill.push({ x: segment.x, y: ground, width: 1, height: 12, color: "#ffffff" });
  const next = renderedFeedingContact(scene, fish, 3);
  assert.equal(next.mouth, first.mouth);
  assert.equal(next.glyphBurial, first.glyphBurial);
  assert.ok(Math.abs(next.bodyBurial - 12 / (scene.height / scene.logicalHeight)) < 1e-10);
  assert.equal(next.buried, next.bodyBurial);
});
