/*
 * Growth cost measurement.
 *
 * Usage: node tools/measure-phase4.mjs [tree]
 *
 * The interesting question about fish growth is not what a fresh aquarium
 * costs - a young cast is *smaller* than the fish that used to be there - but
 * what a fully grown one costs, because that is the scene this change has to
 * be no worse than. A tree without growth measures the same scenarios with the
 * fish it has, so `main` and this branch are directly comparable.
 *
 * Scenarios, both orientations, 200 frames at 10 fps after a 40-frame settle:
 *
 *   day-0    the aquarium as it is handed over
 *   day-120  after the second arrival, most of the cast finished
 *   day-420  everything that will ever grow has grown, eight fish, mature plants
 */

import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(process.argv[2] ?? ".");
const stamp = Date.now();
const url = (relative) => pathToFileURL(path.join(root, relative)).href + `?measure=${stamp}`;
const { calculateDamage } = await import(url("src/render/damage.js"));
const { render } = await import(url("src/render/render.js"));
const { advanceOffline, createAquariumState } = await import(url("src/sim/state.js"));
const { tick } = await import(url("src/sim/tick.js"));

const SEEDS = [5, 83, 147];
const DAYS = [0, 120, 420];

function fishObjects(scene) {
  return scene.objects.filter((object) => object.id.startsWith("individual:"));
}

function fishGlyphCount(scene) {
  return fishObjects(scene).reduce((total, object) => total + object.glyphCount, 0);
}

function fishFillMaximum(scene) {
  return Math.max(0, ...fishObjects(scene).map((object) => object.fill.length));
}

function prepare(orientation, seed, days) {
  let state = createAquariumState({ orientation, seed, wallClockHours: 12 });
  if (days > 0) state = advanceOffline(state, days * 86400);
  for (let frame = 0; frame < 40; frame += 1) state = tick(state, 0.1);
  return state;
}

function runSequence(orientation, days) {
  let damaged = 0;
  let maximumDamage = 0;
  let dirtyRectangles = 0;
  let fullFrames = 0;
  let elapsedMilliseconds = 0;
  let glyphs = 0;
  let maximumFills = 0;
  let fish = 0;
  let frames = 0;

  for (const seed of SEEDS) {
    let state = prepare(orientation, seed, days);
    let previous = render(state);
    fish = Math.max(fish, state.individuals.length);
    maximumFills = Math.max(maximumFills, fishFillMaximum(previous));
    for (let frame = 0; frame < 200; frame += 1) {
      const started = performance.now();
      state = tick(state, 0.1);
      const next = render(state);
      const damage = calculateDamage(previous, next);
      elapsedMilliseconds += performance.now() - started;
      const fraction = damage.area / damage.total;
      damaged += fraction;
      maximumDamage = Math.max(maximumDamage, fraction);
      dirtyRectangles += damage.rects.length;
      if (damage.full) fullFrames += 1;
      maximumFills = Math.max(maximumFills, fishFillMaximum(next));
      glyphs += fishGlyphCount(next);
      frames += 1;
      previous = next;
    }
  }

  return {
    orientation,
    days,
    fish,
    averageDamagePercent: (damaged / frames) * 100,
    maximumDamagePercent: maximumDamage * 100,
    fullFrames,
    averageDirtyRectangles: dirtyRectangles / frames,
    maximumFishFillRects: maximumFills,
    averageFishGlyphs: glyphs / frames,
    averageTickRenderMs: elapsedMilliseconds / frames,
  };
}

for (const orientation of ["landscape", "portrait"]) {
  for (const days of DAYS) {
    const row = runSequence(orientation, days);
    console.log([
      row.orientation.padEnd(9),
      `day=${String(row.days).padStart(3)}`,
      `fish=${row.fish}`,
      `avg=${row.averageDamagePercent.toFixed(2)}%`,
      `max=${row.maximumDamagePercent.toFixed(2)}%`,
      `full=${row.fullFrames}`,
      `rects=${row.averageDirtyRectangles.toFixed(1)}`,
      `fishFillMax=${row.maximumFishFillRects}`,
      `fishGlyphs=${row.averageFishGlyphs.toFixed(1)}`,
      `tick+render=${row.averageTickRenderMs.toFixed(2)}ms`,
    ].join("  "));
  }
}
