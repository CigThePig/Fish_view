import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { createBubbleRenderRecords } from "../src/render/bubbles.js";
import { scenePalette } from "../src/render/palette.js";
import { createBubbleWorldRecords } from "../src/sim/bubbles.js";
import { orientationConfig } from "../src/sim/config.js";
import {
  ACTIVITIES,
  activityUtilities,
  createActivityState,
} from "../src/sim/fish-activities.js";
import { createAquariumState } from "../src/sim/state.js";

function metricsFor(state) {
  const target = orientationConfig(state.orientation);
  return {
    cellWidth: target.pixelWidth / state.cols,
    cellHeight: target.pixelHeight / state.rows,
  };
}

test("simulation and renderer share one exact bubble world position", () => {
  for (const orientation of ["landscape", "portrait"]) {
    const base = createAquariumState({ orientation, seed: 551, wallClockHours: 12 });
    for (const seconds of [0, 8.2, 31.7, 86.4, 143.1]) {
      const state = { ...base, elapsedRealSeconds: seconds };
      const world = createBubbleWorldRecords(state);
      const rendered = createBubbleRenderRecords(state, scenePalette(state), metricsFor(state));
      assert.equal(rendered.length, world.length);
      const renderedById = new Map(rendered.map((record) => [record.id, record]));
      for (const bubble of world) {
        const visible = renderedById.get(bubble.id);
        assert.ok(visible, `renderer omitted ${bubble.id}`);
        assert.equal(visible.worldX, bubble.worldX);
        assert.equal(visible.worldY, bubble.worldY);
        assert.equal(visible.phase, bubble.phase);
        assert.equal(visible.progress, bubble.progress);
        assert.equal(visible.sizeClass, bubble.sizeClass);
        assert.equal("glyphs" in bubble, false);
        assert.ok(visible.glyphs.length > 0);
      }
    }
  }
});

test("bubble IDs are stable, bounded, and unique world identities", () => {
  const base = createAquariumState({ orientation: "landscape", seed: 889, wallClockHours: 12 });
  for (let seconds = 0; seconds < 180; seconds += 2.5) {
    const records = createBubbleWorldRecords({ ...base, elapsedRealSeconds: seconds });
    const ids = records.map((record) => record.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(records.length <= 42);
    assert.ok(ids.every((id) => id.startsWith("bubble:")));
    assert.ok(records.every((record) => Number.isFinite(record.worldX) && Number.isFinite(record.worldY)));
  }
});

test("popping and fish-exhalation bubbles are not environmental investigation targets", () => {
  const state = createAquariumState({ orientation: "landscape", seed: 991 });
  const fish = {
    ...state.individuals[4],
    behavior: { current: "explore", previous: "cruise", blend: 1, ageSeconds: 10 },
    activity: createActivityState(ACTIVITIES.wander),
  };
  const records = [
    {
      id: "bubble:pop:test",
      seed: 1,
      kind: "stream",
      phase: "pop",
      sizeClass: "jumbo",
      worldX: fish.x + 1,
      worldY: fish.y,
    },
    {
      id: "bubble:fish:test",
      seed: 2,
      kind: "fish",
      phase: "rise",
      sizeClass: "jumbo",
      worldX: fish.x + 1,
      worldY: fish.y,
    },
  ];
  const utilities = activityUtilities(fish, 4, state, { bubbles: records });
  assert.equal(ACTIVITIES.bubbleInvestigate in utilities, false);
});

test("the pure shared bubble module has no renderer dependency", () => {
  const source = fs.readFileSync(new URL("../src/sim/bubbles.js", import.meta.url), "utf8");
  assert.equal(source.includes("../render/"), false);
  assert.equal(source.includes("canvas"), false);
  assert.equal(source.includes("DOM"), false);
});
