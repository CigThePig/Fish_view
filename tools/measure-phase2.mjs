import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(process.argv[2] ?? ".");
const stamp = Date.now();
const url = (relative) => pathToFileURL(path.join(root, relative)).href + `?measure=${stamp}`;
const { calculateDamage } = await import(url("src/render/damage.js"));
const { render } = await import(url("src/render/render.js"));
const { createAquariumState } = await import(url("src/sim/state.js"));
const { tick } = await import(url("src/sim/tick.js"));

const hasPhase2 = fs.existsSync(path.join(root, "src/sim/bubbles.js"));
const bubbleWorld = hasPhase2 ? await import(url("src/sim/bubbles.js")) : null;
const legacyBubbles = hasPhase2 ? null : await import(url("src/render/bubbles.js"));
const legacyPalette = hasPhase2 ? null : await import(url("src/render/palette.js"));
const { orientationConfig } = await import(url("src/sim/config.js"));

function fishFillMaximum(scene) {
  return Math.max(0, ...scene.objects
    .filter((object) => object.id.startsWith("individual:"))
    .map((object) => object.fill.length));
}

function bubbleRecords(state) {
  if (bubbleWorld) return bubbleWorld.createBubbleWorldRecords(state);
  const target = orientationConfig(state.orientation);
  const metrics = {
    cellWidth: target.pixelWidth / state.cols,
    cellHeight: target.pixelHeight / state.rows,
  };
  return legacyBubbles.createBubbleRenderRecords(state, legacyPalette.scenePalette(state), metrics);
}

function forceBubbleHeavy(state) {
  const candidates = bubbleRecords(state).filter((record) => record.phase === "rise"
    && ["stream", "isolated", "touch"].includes(record.kind));
  if (!candidates.length) return state;
  const preferred = candidates.filter((record) => record.sizeClass === "large" || record.sizeClass === "jumbo");
  const targets = preferred.length ? preferred : candidates;
  return {
    ...state,
    individuals: state.individuals.map((fish, index) => {
      const target = targets[index % targets.length];
      return {
        ...fish,
        x: Math.max(4, Math.min(state.cols - 4, target.worldX + (index % 2 ? 0.7 : -0.7))),
        y: Math.max(3, Math.min(state.rows - 5, target.worldY + (index % 3 - 1) * 0.35)),
        behavior: { current: "explore", previous: fish.behavior.current, blend: 0, ageSeconds: 0 },
        activity: {
          current: "bubble-investigate",
          previous: fish.activity?.current ?? "open-water-wander",
          ageRealSeconds: 0,
          targetType: "bubble",
          targetId: target.id,
          targetX: null,
          targetY: null,
        },
      };
    }),
  };
}

function forcePlantSocialHeavy(state) {
  const foreground = state.plants.filter((plant) => plant.layer === "foreground");
  const plants = foreground.length ? foreground : state.plants;
  const individuals = state.individuals.map((fish, index) => {
    const companionIndex = index % 2 === 0 ? Math.min(index + 1, state.individuals.length - 1) : index - 1;
    const plant = plants[index % plants.length];
    const social = index < Math.ceil(state.individuals.length / 2);
    return {
      ...fish,
      x: Math.max(4, Math.min(state.cols - 4, social
        ? state.cols * 0.42 + index * 0.7
        : plant.x + (index % 2 ? 0.8 : -0.8))),
      y: social ? state.rows * 0.48 : Math.max(4, state.rows - 6 - (index % 2) * 0.6),
      behavior: { current: social ? "social" : "rest", previous: fish.behavior.current, blend: 0, ageSeconds: 0 },
      activity: social
        ? {
          current: "companion-cruise",
          previous: fish.activity?.current ?? "school-follow",
          ageRealSeconds: 0,
          targetType: "fish",
          targetId: state.individuals[companionIndex].seed,
          targetX: null,
          targetY: null,
        }
        : {
          current: "plant-shelter",
          previous: fish.activity?.current ?? "open-water-rest",
          ageRealSeconds: 0,
          targetType: "plant",
          targetId: plant.seed,
          targetX: null,
          targetY: null,
        },
      history: {
        ...fish.history,
        socialMemory: social
          ? [{ seed: state.individuals[companionIndex].seed, familiarity: 0.72 }]
          : (fish.history.socialMemory ?? []),
      },
    };
  });
  return {
    ...state,
    plants: state.plants.map((plant) => ({ ...plant, ageDays: Math.max(200, plant.ageDays) })),
    individuals,
  };
}

function prepare(orientation, scenario) {
  let state = createAquariumState({ orientation, seed: 5, wallClockHours: 12 });
  for (let frame = 0; frame < 100; frame += 1) state = tick(state, 0.1);
  if (scenario === "bubble-heavy") {
    let best = state;
    let bestScore = -1;
    for (let offset = 0; offset <= 240; offset += 1) {
      const candidate = { ...state, elapsedRealSeconds: state.elapsedRealSeconds + offset };
      const records = bubbleRecords(candidate).filter((record) => record.phase === "rise"
        && ["stream", "isolated", "touch"].includes(record.kind));
      const score = records.length
        + records.filter((record) => record.sizeClass === "large" || record.sizeClass === "jumbo").length * 0.5;
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }
    return forceBubbleHeavy(best);
  }
  if (scenario === "plant-social") return forcePlantSocialHeavy(state);
  return state;
}

function runSequence(orientation, scenario) {
  let state = prepare(orientation, scenario);
  let previous = render(state);
  let maximumFishFills = fishFillMaximum(previous);
  let maximumBubbles = previous.objects.filter((object) => object.id.startsWith("bubble:")).length;
  let fullFrames = 0;
  let damaged = 0;
  let maximumDamage = 0;
  let dirtyRectangles = 0;
  let elapsedMilliseconds = 0;
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
    maximumFishFills = Math.max(maximumFishFills, fishFillMaximum(next));
    maximumBubbles = Math.max(
      maximumBubbles,
      next.objects.filter((object) => object.id.startsWith("bubble:")).length,
    );
    previous = next;
  }
  return {
    orientation,
    scenario,
    averageDamagePercent: damaged / 200 * 100,
    maximumDamagePercent: maximumDamage * 100,
    fullFrames,
    averageDirtyRectangles: dirtyRectangles / 200,
    maximumFishFillRects: maximumFishFills,
    maximumActiveBubbles: maximumBubbles,
    averageTickRenderMs: elapsedMilliseconds / 200,
  };
}

const rows = [];
for (const orientation of ["landscape", "portrait"]) {
  for (const scenario of ["ordinary", "bubble-heavy", "plant-social"]) {
    rows.push(runSequence(orientation, scenario));
  }
}

for (const row of rows) {
  console.log([
    row.orientation.padEnd(9),
    row.scenario.padEnd(12),
    `avg=${row.averageDamagePercent.toFixed(2)}%`,
    `max=${row.maximumDamagePercent.toFixed(2)}%`,
    `full=${row.fullFrames}`,
    `rects=${row.averageDirtyRectangles.toFixed(1)}`,
    `fishFillMax=${row.maximumFishFillRects}`,
    `bubbleMax=${row.maximumActiveBubbles}`,
    `tick+render=${row.averageTickRenderMs.toFixed(2)}ms`,
  ].join("  "));
}
