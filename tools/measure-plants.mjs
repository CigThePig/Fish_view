import { calculateDamage } from "../src/render/damage.js";
import { render } from "../src/render/render.js";
import { createAquariumState } from "../src/sim/state.js";
import { tick } from "../src/sim/tick.js";

const SEEDS = [5, 29, 83, 147, 818];
const FRAMES = 200;
const DT = 0.1;

function matureState(orientation, seed) {
  const state = createAquariumState({ orientation, seed, wallClockHours: 12 });
  return {
    ...state,
    plants: state.plants.map((plant) => ({ ...plant, ageDays: 200 })),
  };
}

function summarize(values) {
  return {
    minimum: Math.min(...values),
    maximum: Math.max(...values),
    average: values.reduce((sum, value) => sum + value, 0) / values.length,
  };
}

function measureOrientation(orientation) {
  const glyphTotals = [];
  const maximumPlantGlyphs = [];
  const damageFractions = [];
  const dirtyRectangles = [];
  let fullRedraws = 0;

  for (const seed of SEEDS) {
    let state = matureState(orientation, seed);
    let scene = render(state);
    glyphTotals.push(scene.metadata.plants.glyphs);
    maximumPlantGlyphs.push(scene.metadata.plants.maximumGlyphs);

    for (let frame = 0; frame < FRAMES; frame += 1) {
      state = tick(state, DT);
      const next = render(state);
      const damage = calculateDamage(scene, next);
      if (damage.full) fullRedraws += 1;
      damageFractions.push(damage.area / damage.total);
      dirtyRectangles.push(damage.rects.length);
      scene = next;
    }
  }

  return {
    orientation,
    seeds: SEEDS,
    framesPerSeed: FRAMES,
    plantGlyphs: summarize(glyphTotals),
    maximumPlantGlyphs: Math.max(...maximumPlantGlyphs),
    wholeSceneDamagePercent: {
      average: summarize(damageFractions).average * 100,
      worstFrame: summarize(damageFractions).maximum * 100,
    },
    dirtyRectangles: summarize(dirtyRectangles),
    fullRedraws,
  };
}

console.log(JSON.stringify({
  sample: "mature aquarium at 10 fps",
  measurements: [measureOrientation("landscape"), measureOrientation("portrait")],
}, null, 2));
