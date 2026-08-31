import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(process.argv[2] ?? ".");
const url = (relative) => pathToFileURL(path.join(root, relative)).href + `?measure=${Date.now()}`;
const { calculateDamage } = await import(url("src/render/damage.js"));
const { render } = await import(url("src/render/render.js"));
const { createAquariumState } = await import(url("src/sim/state.js"));
const { tick } = await import(url("src/sim/tick.js"));
const hasPhase1 = fs.existsSync(path.join(root, "src/sim/fish-motion.js"));
const fishMotion = hasPhase1 ? await import(url("src/sim/fish-motion.js")) : null;

function fishFillMaximum(scene) {
  return Math.max(0, ...scene.objects
    .filter((object) => object.id.startsWith("individual:"))
    .map((object) => object.fill.length));
}

function summarize(values) {
  return {
    averagePercent: values.reduce((sum, value) => sum + value, 0) / values.length * 100,
    maximumPercent: Math.max(...values) * 100,
  };
}

function forceForage(state) {
  if (!fishMotion) return state;
  const index = 3;
  const source = state.individuals[index];
  const fish = {
    ...source,
    behavior: { current: "forage", previous: source.behavior.current, blend: 0, ageSeconds: 0, ageRealSeconds: 0 },
    visual: { ...source.visual, pitch: 0, targetPitch: 0 },
  };
  fish.y = fishMotion.substrateSafeY(fish, state, fish.x);
  return {
    ...state,
    individuals: state.individuals.map((value, fishIndex) => fishIndex === index ? fish : value),
  };
}

function runSequence(orientation, scenario) {
  let state = createAquariumState({ orientation, seed: 5, wallClockHours: 12 });
  for (let frame = 0; frame < 100; frame += 1) state = tick(state, 0.1);
  if (scenario === "forage") state = forceForage(state);
  let previous = render(state);
  let maxFills = fishFillMaximum(previous);
  let fullFrames = 0;
  const fractions = [];
  for (let frame = 0; frame < 200; frame += 1) {
    state = tick(state, 0.1);
    const next = render(state);
    const damage = calculateDamage(previous, next);
    fractions.push(damage.area / damage.total);
    if (damage.full) fullFrames += 1;
    maxFills = Math.max(maxFills, fishFillMaximum(next));
    previous = next;
  }
  return {
    orientation,
    scenario,
    ...summarize(fractions),
    fullFrames,
    maximumFishFillRects: maxFills,
  };
}

const rows = [];
for (const orientation of ["landscape", "portrait"]) {
  rows.push(runSequence(orientation, "ordinary"));
  if (hasPhase1) rows.push(runSequence(orientation, "forage"));
}
for (const row of rows) {
  console.log([
    row.orientation.padEnd(9),
    row.scenario.padEnd(8),
    `avg=${row.averagePercent.toFixed(2)}%`,
    `max=${row.maximumPercent.toFixed(2)}%`,
    `full=${row.fullFrames}`,
    `fishFillMax=${row.maximumFishFillRects}`,
  ].join("  "));
}
