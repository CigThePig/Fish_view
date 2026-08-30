import assert from "node:assert/strict";
import test from "node:test";

import { diffCells } from "../src/render/cell-grid.js";
import { render } from "../src/render/render.js";
import { createAquariumState } from "../src/sim/state.js";
import { tick } from "../src/sim/tick.js";

test("renderer emits the exact locked orientation grids", () => {
  const portrait = render(createAquariumState({ orientation: "portrait", seed: 1 }));
  const landscape = render(createAquariumState({ orientation: "landscape", seed: 1 }));
  assert.deepEqual([portrait.cols, portrait.rows], [40, 33]);
  assert.deepEqual([landscape.cols, landscape.rows], [66, 20]);
  assert.equal(portrait.cells.length, 1320);
  assert.equal(landscape.cells.length, 1320);
});

test("night water is a filled warm wash and fish become dark ink", () => {
  const state = createAquariumState({ orientation: "landscape", seed: 2, wallClockHours: 2 });
  const grid = render(state);
  const water = grid.cells.slice(grid.cols * 2, grid.cols * (grid.rows - 4));
  assert.ok(water.every((cell) => typeof cell.bg === "string" && cell.bg !== "transparent"));
  assert.ok(water.some((cell) => cell.bg === "#35534a"));
  assert.ok(water.some((cell) => cell.bg === "#493e2d"));
});

test("ordinary animation dirties only a minority of cells", () => {
  const state = createAquariumState({ orientation: "landscape", seed: 5, wallClockHours: 12 });
  const before = render(state);
  const after = render(tick(state, 0.1));
  const dirty = diffCells(before, after);
  assert.ok(dirty.length < before.cells.length * 0.2, `${dirty.length} cells were dirty`);
});

