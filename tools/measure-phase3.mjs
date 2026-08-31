/*
 * Phase 3 performance measurement.
 *
 * The important Phase 3 cost is not the timeline bookkeeping - which is a
 * handful of integer comparisons per frame - but the entities it eventually
 * adds. A fresh aquarium is therefore only half the measurement; the other half
 * is a mature one at the hard caps: eight individuals, the full plant ceiling,
 * and every specimen grown.
 *
 * Usage: node tools/measure-phase3.mjs [path-to-tree]
 */
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(process.argv[2] ?? ".");
const stamp = Date.now();
const url = (relative) => pathToFileURL(path.join(root, relative)).href + `?measure=${stamp}`;
const { calculateDamage } = await import(url("src/render/damage.js"));
const { render } = await import(url("src/render/render.js"));
const { createAquariumState } = await import(url("src/sim/state.js"));
const { tick } = await import(url("src/sim/tick.js"));

// Everything below is optional so the same script can be pointed at a
// pre-Phase-3 tree and still produce the "fresh" rows for comparison.
const history = await import(url("src/sim/aquarium-history.js")).catch(() => null);
const plants = await import(url("src/sim/plants.js"));
const plantCapFor = plants.plantCapFor ?? (() => null);
const createPlantFromSeed = plants.createPlantFromSeed ?? null;

const FRAMES = 200;
const SEEDS = [5, 83, 147];

function fishFillMaximum(scene) {
  return Math.max(0, ...scene.objects
    .filter((object) => object.id.startsWith("individual:"))
    .map((object) => object.fill.length));
}

function matureState(orientation, seed) {
  const base = createAquariumState({ orientation, seed, wallClockHours: 12 });
  if (!history || !createPlantFromSeed) {
    // Pre-Phase-3 tree: the best available "mature" case is the original
    // roster grown old.
    return { ...base, plants: base.plants.map((plant) => ({ ...plant, ageDays: 400 })) };
  }
  const grown = history.advanceAquariumHistory(base, 900);
  const cap = plantCapFor(orientation);
  const roster = [...grown.plants];
  let filler = 0;
  while (roster.length < cap) {
    const parent = grown.plants[filler % grown.plants.length];
    roster.push(createPlantFromSeed({
      seed: (0x7c3f0000 + filler * 2654435761) >>> 0,
      speciesId: parent.speciesId,
      x: Math.max(0.6, Math.min(base.cols - 0.6, parent.x + (filler % 2 ? 0.9 : -0.9))),
      ageDays: 400,
      rows: base.rows,
    }));
    filler += 1;
  }
  return { ...grown, plants: roster.map((plant) => ({ ...plant, ageDays: 400 })) };
}

function runSequence(orientation, scenario, seed) {
  let state = scenario === "mature"
    ? matureState(orientation, seed)
    : createAquariumState({ orientation, seed, wallClockHours: 12 });
  // Settle before measuring so the first frames are not the initial layout.
  for (let frame = 0; frame < 20; frame += 1) state = tick(state, 0.1);

  let previous = render(state);
  let damaged = 0;
  let maximumDamage = 0;
  let dirtyRectangles = 0;
  let fullFrames = 0;
  let maximumFill = fishFillMaximum(previous);
  let elapsedMilliseconds = 0;
  for (let frame = 0; frame < FRAMES; frame += 1) {
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
    maximumFill = Math.max(maximumFill, fishFillMaximum(next));
    previous = next;
  }
  const diagnostics = previous.metadata.plants;
  return {
    orientation,
    scenario,
    seed,
    individuals: state.individuals.length,
    plantObjects: diagnostics.instances,
    plantGlyphs: diagnostics.glyphs,
    averageDamagePercent: (damaged / FRAMES) * 100,
    maximumDamagePercent: maximumDamage * 100,
    fullFrames,
    averageDirtyRectangles: dirtyRectangles / FRAMES,
    maximumFishFillRects: maximumFill,
    averageTickRenderMs: elapsedMilliseconds / FRAMES,
  };
}

function summarize(rows) {
  const average = (pick) => rows.reduce((sum, row) => sum + pick(row), 0) / rows.length;
  return {
    orientation: rows[0].orientation,
    scenario: rows[0].scenario,
    individuals: Math.max(...rows.map((row) => row.individuals)),
    plantObjects: Math.max(...rows.map((row) => row.plantObjects)),
    plantGlyphs: Math.max(...rows.map((row) => row.plantGlyphs)),
    averageDamagePercent: average((row) => row.averageDamagePercent),
    maximumDamagePercent: Math.max(...rows.map((row) => row.maximumDamagePercent)),
    fullFrames: rows.reduce((sum, row) => sum + row.fullFrames, 0),
    averageDirtyRectangles: average((row) => row.averageDirtyRectangles),
    maximumFishFillRects: Math.max(...rows.map((row) => row.maximumFishFillRects)),
    averageTickRenderMs: average((row) => row.averageTickRenderMs),
  };
}

const summaries = [];
for (const orientation of ["landscape", "portrait"]) {
  for (const scenario of ["fresh", "mature"]) {
    summaries.push(summarize(SEEDS.map((seed) => runSequence(orientation, scenario, seed))));
  }
}

for (const row of summaries) {
  console.log([
    row.orientation.padEnd(9),
    row.scenario.padEnd(7),
    `fish=${row.individuals}`,
    `plants=${row.plantObjects}`,
    `plantGlyphs=${row.plantGlyphs}`,
    `avg=${row.averageDamagePercent.toFixed(2)}%`,
    `max=${row.maximumDamagePercent.toFixed(2)}%`,
    `full=${row.fullFrames}`,
    `rects=${row.averageDirtyRectangles.toFixed(1)}`,
    `fishFillMax=${row.maximumFishFillRects}`,
    `tick+render=${row.averageTickRenderMs.toFixed(2)}ms`,
  ].join("  "));
}
