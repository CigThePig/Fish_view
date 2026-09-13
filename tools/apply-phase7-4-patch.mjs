import { readFile, writeFile } from "node:fs/promises";

function replaceOnce(text, pattern, replacement, label) {
  const matches = [...text.matchAll(new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`))];
  if (matches.length !== 1) {
    throw new Error(`${label}: expected exactly one match, found ${matches.length}`);
  }
  return text.replace(pattern, replacement);
}

async function patchFile(path, transform) {
  const before = await readFile(path, "utf8");
  const after = transform(before);
  if (after === before) throw new Error(`${path}: patch made no change`);
  await writeFile(path, after);
}

await patchFile("src/sim/fish-activities.js", (source) => {
  let text = source;

  text = replaceOnce(
    text,
    /const TAU = Math\.PI \* 2;\n/,
    `const TAU = Math.PI * 2;\n\n// Plant weave is a short deterministic route, not a timer animation. The\n// activity stores only a bounded cursor into this five-leg route plus the age\n// at which the current leg began. Every waypoint is reconstructed from fish +\n// plant identity, so no path history or per-frame route data can accumulate.\nexport const WEAVE_ROUTE_STAGE_COUNT = 5;\nconst WEAVE_ROUTE_LAST_STAGE = WEAVE_ROUTE_STAGE_COUNT - 1;\nconst WEAVE_ARRIVAL_RADIUS = 0.62;\nconst WEAVE_MIN_CLEARANCE_COLUMNS = 1.6;\nconst WEAVE_MAX_CLEARANCE_COLUMNS = 2.55;\nconst WEAVE_EMERGE_EXTRA_COLUMNS = 1.65;\n`,
    "insert weave route constants",
  );

  text = replaceOnce(
    text,
    /\[ACTIVITIES\.plantWeave\]: \[8, 15, 24\],/,
    `[ACTIVITIES.plantWeave]: [8, 55, 70],`,
    "extend plant weave safety dwell",
  );

  text = replaceOnce(
    text,
    /    targetX: null,\n    targetY: null,\n    \/\/ The two strikes/,
    `    targetX: null,\n    targetY: null,\n    // Spatial route progress for plant weave. These two scalars are ignored by\n    // every other activity and reset whenever a fresh activity is selected.\n    weaveStage: 0,\n    weaveStageStartedAt: 0,\n    // The two strikes`,
    "add weave state defaults",
  );

  text = replaceOnce(
    text,
    /    targetX: Number\.isFinite\(source\?\.targetX\) \? source\.targetX : null,\n    targetY: Number\.isFinite\(source\?\.targetY\) \? source\.targetY : null,\n    contactSeed:/,
    `    targetX: Number.isFinite(source?.targetX) ? source.targetX : null,\n    targetY: Number.isFinite(source?.targetY) ? source.targetY : null,\n    weaveStage: Number.isInteger(source?.weaveStage)\n      ? clamp(source.weaveStage, 0, WEAVE_ROUTE_LAST_STAGE)\n      : 0,\n    weaveStageStartedAt: Number.isFinite(source?.weaveStageStartedAt)\n      ? Math.max(0, source.weaveStageStartedAt)\n      : 0,\n    contactSeed:`,
    "normalize weave state",
  );

  text = replaceOnce(
    text,
    /    targetX: selected\.targetX,\n    targetY: selected\.targetY,\n  };\n}\n\nfunction findPlant/,
    `    targetX: selected.targetX,\n    targetY: selected.targetY,\n    weaveStage: 0,\n    weaveStageStartedAt: 0,\n  };\n}\n\nfunction findPlant`,
    "initialize weave state on selection",
  );

  text = replaceOnce(
    text,
    /function secondWeavePlant\(fish, first, state\) \{[\s\S]*?\n}\n\nfunction sizeInterest/,
    `function weaveClearanceColumns(fish) {\n  return clamp(\n    spriteHalfWidth(fish) * 0.48 + 0.65,\n    WEAVE_MIN_CLEARANCE_COLUMNS,\n    WEAVE_MAX_CLEARANCE_COLUMNS,\n  );\n}\n\nfunction secondWeavePlant(fish, first, state) {\n  // A second stem only helps the read if there is room for the fish centre to\n  // clear one plant before it threads toward the next. Picking the nearest\n  // specimen regardless of body size made two mathematically different sides\n  // collapse into the same on-screen body footprint.\n  const clearance = weaveClearanceColumns(fish);\n  const minimumDistance = clearance * 2 + 0.8;\n  const maximumDistance = Math.max(8, state.cols * 0.2);\n  const idealDistance = Math.min(maximumDistance, minimumDistance + 2.7);\n  const candidates = (state.plants ?? [])\n    .filter((plant) => plant.seed !== first.seed && suitablePlant(plant))\n    .map((plant) => ({\n      plant,\n      distance: Math.abs(plant.x - first.x),\n      preference: favoritePlantScore(fish.seed, plant),\n    }))\n    .filter((candidate) => (\n      candidate.distance >= minimumDistance\n      && candidate.distance <= maximumDistance\n    ))\n    .sort((left, right) => (\n      (Math.abs(left.distance - idealDistance) - left.preference * 1.6)\n        - (Math.abs(right.distance - idealDistance) - right.preference * 1.6)\n      || left.plant.seed - right.plant.seed\n    ));\n  return candidates[0]?.plant ?? null;\n}\n\nfunction sizeInterest`,
    "replace secondary plant selection",
  );

  text = replaceOnce(
    text,
    /function weavePoint\(fish, primary, state, activity\) \{[\s\S]*?\n}\n\n\/\*\n \* A point a fish may be sent to/,
    `function weavePlantPoint(fish, plant, state, side, lift, distance) {\n  const base = plantTargetPosition(fish, plant, state);\n  return {\n    ...boundedPlantPoint(fish, state, plant.x + side * distance, base.y + lift),\n    plant,\n    side,\n  };\n}\n\nfunction weaveRoute(fish, primary, state) {\n  const tuning = sceneTuning(state, ACTIVITIES.plantWeave);\n  const secondary = secondWeavePlant(fish, primary, state);\n  const pairSeed = mix32((fish.seed >>> 0) ^ Math.imul(primary.seed >>> 0, 0x85ebca6b));\n  const clearance = weaveClearanceColumns(fish);\n  const verticalSign = sample01(pairSeed, 8161) < 0.5 ? -1 : 1;\n  const seededTravel = sample01(pairSeed, 8162) < 0.5 ? -1 : 1;\n  const travelSide = secondary\n    ? (Math.sign(secondary.x - primary.x) || seededTravel)\n    : seededTravel;\n  const entrySide = -travelSide;\n  const asymmetry = (stage) => sampleSigned(pairSeed, 8170 + stage) * tuning.asymmetryRows;\n  const point = (plant, side, lift, distance = clearance, leg) => ({\n    ...weavePlantPoint(\n      fish,\n      plant,\n      state,\n      side,\n      lift + asymmetry(leg.stage),\n      distance,\n    ),\n    leg: leg.name,\n  });\n\n  if (secondary) {\n    return [\n      point(primary, entrySide, verticalSign * 0.66, clearance, { stage: 0, name: \"entry-primary\" }),\n      point(primary, travelSide, verticalSign * -0.58, clearance, { stage: 1, name: \"cross-primary\" }),\n      point(secondary, -travelSide, verticalSign * -0.14, clearance, { stage: 2, name: \"thread-gap\" }),\n      point(secondary, travelSide, verticalSign * 0.74, clearance, { stage: 3, name: \"cross-secondary\" }),\n      point(\n        secondary,\n        travelSide,\n        verticalSign * 0.08,\n        clearance + WEAVE_EMERGE_EXTRA_COLUMNS,\n        { stage: 4, name: \"emerge\" },\n      ),\n    ];\n  }\n\n  // A stale save can outlive the secondary plant it originally chose. Keep a\n  // coherent one-plant fallback instead of invalidating the activity mid-swim:\n  // two alternating crossings followed by a clear exit on the travel side.\n  return [\n    point(primary, entrySide, verticalSign * 0.66, clearance, { stage: 0, name: \"entry-primary\" }),\n    point(primary, travelSide, verticalSign * -0.58, clearance, { stage: 1, name: \"cross-primary\" }),\n    point(primary, entrySide, verticalSign * -0.12, clearance, { stage: 2, name: \"cross-back\" }),\n    point(primary, travelSide, verticalSign * 0.72, clearance, { stage: 3, name: \"cross-again\" }),\n    point(\n      primary,\n      travelSide,\n      verticalSign * 0.08,\n      clearance + WEAVE_EMERGE_EXTRA_COLUMNS,\n      { stage: 4, name: \"emerge\" },\n    ),\n  ];\n}\n\nfunction weavePoint(fish, primary, state, activity) {\n  const tuning = sceneTuning(state, ACTIVITIES.plantWeave);\n  const route = weaveRoute(fish, primary, state);\n  const stage = clamp(\n    Number.isInteger(activity.weaveStage) ? activity.weaveStage : 0,\n    0,\n    WEAVE_ROUTE_LAST_STAGE,\n  );\n  const waypoint = route[stage];\n  const pairSeed = mix32((fish.seed >>> 0) ^ Math.imul(primary.seed >>> 0, 0x85ebca6b));\n  const timeoutSeconds = sampleRange(\n    pairSeed,\n    8190 + stage,\n    tuning.legTimeoutSecondsMin,\n    tuning.legTimeoutSecondsMax,\n  );\n  return {\n    ...waypoint,\n    stage,\n    timeoutSeconds,\n    arrivalRadius: WEAVE_ARRIVAL_RADIUS,\n    final: stage === WEAVE_ROUTE_LAST_STAGE,\n  };\n}\n\nfunction advanceWeaveProgress(fish, state, activity) {\n  if (activity.current !== ACTIVITIES.plantWeave) return activity;\n  const primary = findPlant(state, activity.targetId);\n  if (!primary || !suitablePlant(primary)) return activity;\n  const point = weavePoint(fish, primary, state, activity);\n  const distance = Math.hypot(point.x - fish.x, point.y - fish.y);\n  const stageAge = Math.max(0, activity.ageRealSeconds - activity.weaveStageStartedAt);\n  const arrived = distance <= point.arrivalRadius;\n  // Timeout is only a bounded escape hatch for intermediate legs. Entry and\n  // emergence must be physically reached; otherwise the route could still\n  // begin or end because a clock advanced, which is the Phase 7.4 defect.\n  const safetyAdvance = point.stage > 0\n    && point.stage < WEAVE_ROUTE_LAST_STAGE\n    && stageAge >= point.timeoutSeconds;\n  if ((arrived || safetyAdvance) && point.stage < WEAVE_ROUTE_LAST_STAGE) {\n    return {\n      ...activity,\n      weaveStage: point.stage + 1,\n      weaveStageStartedAt: activity.ageRealSeconds,\n    };\n  }\n  return activity;\n}\n\n/*\n * A point a fish may be sent to`,
    "replace timer weave route",
  );

  text = replaceOnce(
    text,
    /        weaveStage: point\.stage,\n        choreographyPhase: `weave-\$\{point\.stage \+ 1}`/,
    `        weaveStage: point.stage,\n        weaveLeg: point.leg,\n        weavePlantSeed: point.plant.seed,\n        weavePlantX: point.plant.x,\n        weaveSide: point.side,\n        weaveArrivalRadius: point.arrivalRadius,\n        weaveLegTimeoutSeconds: point.timeoutSeconds,\n        weaveFinal: point.final,\n        choreographyPhase: \`weave-\${point.stage + 1}\``,
    "expose weave route semantics",
  );

  text = replaceOnce(
    text,
    /  if \(activity\.current === ACTIVITIES\.plantWeave\) return activity\.ageRealSeconds > 9 && distance < 0\.75;/,
    `  if (activity.current === ACTIVITIES.plantWeave) {\n    return activity.weaveStage >= WEAVE_ROUTE_LAST_STAGE\n      && distance <= WEAVE_ARRIVAL_RADIUS;\n  }`,
    "make weave completion spatial",
  );

  text = replaceOnce(
    text,
    /      const resumed = resumable \? \{ \.\.\.resume, ageRealSeconds: 0 \} : null;/,
    `      const resumed = resumable\n        ? { ...resume, ageRealSeconds: 0, weaveStageStartedAt: 0 }\n        : null;`,
    "reset weave leg timer on resume",
  );

  text = replaceOnce(
    text,
    /  else activity = \{ \.\.\.activity, ageRealSeconds: activity\.ageRealSeconds \+ realDelta \};\n\n  let target = resolve\(activity, attention\);/,
    `  else activity = { ...activity, ageRealSeconds: activity.ageRealSeconds + realDelta };\n\n  // Route progression is evaluated from the fish's current physical position\n  // before the next target is resolved. Elapsed time can rescue a stuck middle\n  // leg, but it cannot normally move the route cursor.\n  activity = advanceWeaveProgress(fish, state, activity);\n\n  let target = resolve(activity, attention);`,
    "advance weave progress before target resolve",
  );

  return text;
});

await patchFile("src/sim/choreography-tuning.js", (source) => {
  let text = source;
  text = replaceOnce(
    text,
    /  "plant-weave": Object\.freeze\(\{\n    accelerationResponse: 2\.05,\n    turningResponse: 2\.35,\n    verticalSpeedScale: 1\.12,\n    minimumSpeed: 0\.07,\n    maximumSpeed: 0\.76,\n    approachRadius: 0\.9,\n    arrivalSpeedScale: 0\.72,\n    pitchResponse: 4\.4,\n    turnDuration: 0\.48,\n  \}\),/,
    `  "plant-weave": Object.freeze({\n    accelerationResponse: 2.18,\n    turningResponse: 2.5,\n    verticalSpeedScale: 1.16,\n    minimumSpeed: 0.07,\n    maximumSpeed: 0.9,\n    approachRadius: 0.82,\n    arrivalSpeedScale: 0.7,\n    pitchResponse: 4.6,\n    turnDuration: 0.46,\n  }),`,
    "tune plant weave steering",
  );
  text = replaceOnce(
    text,
    /  "plant-weave": Object\.freeze\(\{\n    speedBase: 0\.4,\n    speedActivity: 0\.15,\n    speedAffinity: 0\.04,\n    stageSecondsMin: 2\.55,\n    stageSecondsMax: 3\.05,\n    asymmetryRows: 0\.18,\n  \}\),/,
    `  "plant-weave": Object.freeze({\n    speedBase: 0.68,\n    speedActivity: 0.18,\n    speedAffinity: 0.06,\n    // These are safety escapes only. Normal leg changes are position-driven.\n    legTimeoutSecondsMin: 11,\n    legTimeoutSecondsMax: 14,\n    asymmetryRows: 0.22,\n  }),`,
    "tune plant weave scene",
  );
  return text;
});

await patchFile("src/dev/choreography-fields.js", (source) => {
  let text = source;
  text = replaceOnce(
    text,
    /  Object\.freeze\(\["stageSecondsMin", "stageSecondsMax"\]\),/,
    `  Object.freeze(["legTimeoutSecondsMin", "legTimeoutSecondsMax"]),`,
    "rename weave interval pair",
  );
  text = replaceOnce(
    text,
    /    field\("stageSecondsMin", "Stage dwell · min", "seconds on each waypoint", 0\.5, 8, 0\.05\),\n    field\("stageSecondsMax", "Stage dwell · max", "seconds on each waypoint", 0\.5, 8, 0\.05\),/,
    `    field("legTimeoutSecondsMin", "Leg timeout · min", "safety seconds before a stuck middle leg may advance", 4, 20, 0.1),\n    field("legTimeoutSecondsMax", "Leg timeout · max", "safety seconds before a stuck middle leg may advance", 4, 20, 0.1),`,
    "rename weave lab fields",
  );
  return text;
});

await patchFile("src/dev/behavior-showcase.js", (source) => replaceOnce(
  source,
  /  Object\.freeze\(\{ id: "plant-weave", label: "Plant weave", subjects: \[SUBJECT_INDEX\], loopSeconds: 9\.5 \}\),/,
  `  Object.freeze({ id: "plant-weave", label: "Plant weave", subjects: [SUBJECT_INDEX], loopSeconds: 26 }),`,
  "extend plant weave showcase",
));

await patchFile("tools/capture-behavior-showcase.mjs", (source) => replaceOnce(
  source,
  /  } else if \(scenario\.id === "plant-weave"\) \{\n    times = \[1, 2, 3, 4\]\.map\(\(stage\) => phaseTime\(`weave-\$\{stage\}`, null\)\);\n/,
  `  } else if (scenario.id === "plant-weave") {\n    // Entry, the first crossing, the second crossing, and emergence are the\n    // four stills that prove this is traversal rather than target hopping.\n    times = [1, 2, 4, 5].map((stage) => phaseTime(\`weave-\${stage}\`, null));\n`,
  "capture semantic plant weave stages",
));

const plantWeaveTest = `import assert from "node:assert/strict";\nimport test from "node:test";\n\nimport {\n  ACTIVITIES,\n  WEAVE_ROUTE_STAGE_COUNT,\n  resolveActivityTarget,\n} from "../src/sim/fish-activities.js";\nimport {\n  createShowcaseState,\n  showcaseSubjects,\n  showcaseTarget,\n  tickShowcase,\n} from "../src/dev/behavior-showcase.js";\n\nfunction subject(state) {\n  return showcaseSubjects(state, ACTIVITIES.plantWeave)[0];\n}\n\ntest("plant weave route selection is spatial rather than an activity-age clock", () => {\n  const state = createShowcaseState({ scenario: ACTIVITIES.plantWeave });\n  const { index, fish } = subject(state);\n  const first = showcaseTarget(state, ACTIVITIES.plantWeave);\n  assert.equal(first.weaveStage, 0);\n\n  const agedFish = {\n    ...fish,\n    activity: { ...fish.activity, ageRealSeconds: 999 },\n  };\n  const agedState = {\n    ...state,\n    individuals: state.individuals.map((entry, slot) => slot === index ? agedFish : entry),\n  };\n  const aged = resolveActivityTarget(agedFish, index, agedState, agedFish.activity);\n  assert.equal(aged.weaveStage, 0, "elapsed time advanced the weave route without traversal");\n  assert.equal(aged.weaveLeg, first.weaveLeg);\n  assert.equal(aged.x, first.x);\n  assert.equal(aged.y, first.y);\n});\n\ntest("production steering physically completes the authored plant weave before emerging", () => {\n  let state = createShowcaseState({ scenario: ACTIVITIES.plantWeave });\n  const seen = new Map();\n  const transitions = [];\n  let exited = false;\n\n  for (let step = 0; step < 700; step += 1) {\n    const { index, fish } = subject(state);\n    if (fish.activity.current !== ACTIVITIES.plantWeave) {\n      exited = true;\n      break;\n    }\n    const target = showcaseTarget(state, ACTIVITIES.plantWeave);\n    assert.ok(target);\n    if (!seen.has(target.weaveStage)) seen.set(target.weaveStage, {\n      stage: target.weaveStage,\n      leg: target.weaveLeg,\n      x: target.x,\n      y: target.y,\n      plantSeed: target.weavePlantSeed,\n      plantX: target.weavePlantX,\n      side: target.weaveSide,\n    });\n\n    const distanceToCurrent = Math.hypot(target.x - fish.x, target.y - fish.y);\n    const next = tickShowcase(state, 0.1, ACTIVITIES.plantWeave);\n    const nextFish = next.individuals[index];\n    const nextTarget = nextFish.activity.current === ACTIVITIES.plantWeave\n      ? showcaseTarget(next, ACTIVITIES.plantWeave)\n      : null;\n\n    if (nextTarget && nextTarget.weaveStage > target.weaveStage) {\n      transitions.push({\n        from: target.weaveStage,\n        to: nextTarget.weaveStage,\n        distance: distanceToCurrent,\n        radius: target.weaveArrivalRadius,\n      });\n      assert.ok(\n        distanceToCurrent <= target.weaveArrivalRadius + 0.08,\n        \`weave advanced stage \${target.weaveStage} before the fish reached it (\${distanceToCurrent.toFixed(2)} rows)\`,\n      );\n    }\n\n    if (!nextTarget && nextFish.activity.current !== ACTIVITIES.plantWeave) {\n      assert.equal(target.weaveStage, WEAVE_ROUTE_STAGE_COUNT - 1);\n      assert.ok(\n        distanceToCurrent <= target.weaveArrivalRadius + 0.08,\n        \`plant weave ended before emergence (\${distanceToCurrent.toFixed(2)} rows away)\`,\n      );\n      state = next;\n      exited = true;\n      break;\n    }\n    state = next;\n  }\n\n  assert.equal(exited, true, "plant weave did not finish within the bounded observation window");\n  assert.deepEqual([...seen.keys()], [0, 1, 2, 3, 4]);\n  assert.deepEqual(transitions.map(({ from, to }) => [from, to]), [[0, 1], [1, 2], [2, 3], [3, 4]]);\n\n  const entry = seen.get(0);\n  const firstCross = seen.get(1);\n  const gap = seen.get(2);\n  const secondCross = seen.get(3);\n  const emerge = seen.get(4);\n  assert.equal(entry.plantSeed, firstCross.plantSeed);\n  assert.equal(gap.plantSeed, secondCross.plantSeed);\n  assert.equal(entry.side, -firstCross.side, "the first plant was never crossed");\n  assert.equal(gap.side, -secondCross.side, "the second plant was never crossed");\n  assert.equal(emerge.plantSeed, secondCross.plantSeed);\n  assert.equal(emerge.side, secondCross.side);\n  assert.ok(\n    Math.abs(emerge.x - emerge.plantX) > Math.abs(secondCross.x - secondCross.plantX) + 1,\n    "the final leg did not visibly emerge beyond the second plant",\n  );\n});\n\ntest("the same fish and plant state reconstructs the same weave route", () => {\n  const state = createShowcaseState({ scenario: ACTIVITIES.plantWeave });\n  const { index, fish } = subject(state);\n  const route = [];\n  for (let weaveStage = 0; weaveStage < WEAVE_ROUTE_STAGE_COUNT; weaveStage += 1) {\n    const stagedFish = {\n      ...fish,\n      activity: { ...fish.activity, weaveStage },\n    };\n    const stagedState = {\n      ...state,\n      individuals: state.individuals.map((entry, slot) => slot === index ? stagedFish : entry),\n    };\n    const target = resolveActivityTarget(stagedFish, index, stagedState, stagedFish.activity);\n    route.push([target.weaveLeg, target.weavePlantSeed, target.weaveSide, target.x, target.y]);\n  }\n\n  const repeated = [];\n  for (let weaveStage = 0; weaveStage < WEAVE_ROUTE_STAGE_COUNT; weaveStage += 1) {\n    const stagedFish = {\n      ...fish,\n      activity: { ...fish.activity, weaveStage },\n    };\n    const stagedState = {\n      ...state,\n      individuals: state.individuals.map((entry, slot) => slot === index ? stagedFish : entry),\n    };\n    const target = resolveActivityTarget(stagedFish, index, stagedState, stagedFish.activity);\n    repeated.push([target.weaveLeg, target.weavePlantSeed, target.weaveSide, target.x, target.y]);\n  }\n  assert.deepEqual(repeated, route);\n});\n`;
await writeFile("tests/phase7-plant-weave.test.js", plantWeaveTest);

console.log("Phase 7.4 production patch applied.");
