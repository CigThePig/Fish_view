import { readFile, writeFile, rm } from "node:fs/promises";

function replaceOnce(text, before, after, label) {
  const first = text.indexOf(before);
  if (first < 0) throw new Error(`${label}: source text not found`);
  if (text.indexOf(before, first + before.length) >= 0) throw new Error(`${label}: source text was not unique`);
  return text.slice(0, first) + after + text.slice(first + before.length);
}

function replaceRegex(text, pattern, replacement, label) {
  const matches = text.match(pattern);
  if (!matches) throw new Error(`${label}: source pattern not found`);
  return text.replace(pattern, replacement);
}

let activities = await readFile("src/sim/fish-activities.js", "utf8");

activities = replaceOnce(
  activities,
  `const WEAVE_EMERGE_EXTRA_COLUMNS = 1.65;\n`,
  `const WEAVE_EMERGE_EXTRA_COLUMNS = 1.65;\n\n// Investigation and shelter share a tiny three-beat visit cursor. The cursor is\n// bounded activity-local state, not a path: 0 is arrival, 1 is the local beat,\n// and 2 is the deliberate departure. Plant weave owns its separate five-leg\n// spatial route and is intentionally untouched by this Phase 7.5 vocabulary.\nconst PLANT_VISIT_LAST_STAGE = 2;\nconst PLANT_VISIT_ARRIVAL_RADIUS = 0.7;\n`,
  "add plant visit constants",
);

activities = replaceOnce(
  activities,
  `  [ACTIVITIES.plantInvestigate]: [6, 14, 23],`,
  `  // Long enough for approach -> stable inspection -> physically reached retreat.\n  [ACTIVITIES.plantInvestigate]: [6, 24, 32],`,
  "give investigation room for its full arc",
);

activities = replaceOnce(
  activities,
  `    weaveStage: 0,\n    weaveStageStartedAt: 0,\n    // The two strikes`,
  `    weaveStage: 0,\n    weaveStageStartedAt: 0,\n    // Three bounded beats used only by plant investigation and shelter.\n    plantVisitStage: 0,\n    plantVisitStageStartedAt: 0,\n    // The two strikes`,
  "add plant visit state defaults",
);

activities = replaceOnce(
  activities,
  `    weaveStageStartedAt: Number.isFinite(source?.weaveStageStartedAt)\n      ? Math.max(0, source.weaveStageStartedAt)\n      : 0,\n    contactSeed:`,
  `    weaveStageStartedAt: Number.isFinite(source?.weaveStageStartedAt)\n      ? Math.max(0, source.weaveStageStartedAt)\n      : 0,\n    plantVisitStage: Number.isInteger(source?.plantVisitStage)\n      ? clamp(source.plantVisitStage, 0, PLANT_VISIT_LAST_STAGE)\n      : 0,\n    plantVisitStageStartedAt: Number.isFinite(source?.plantVisitStageStartedAt)\n      ? Math.max(0, source.plantVisitStageStartedAt)\n      : 0,\n    contactSeed:`,
  "normalize plant visit state",
);

activities = replaceOnce(
  activities,
  `    const plant = selectPlantTarget(fish, state, traits, affinities, { shelter: true });`,
  `    // A completed shelter visit must visibly leave cover before another\n    // shelter can win. One open-water rest route prevents an immediate U-turn.\n    if (fish.activity?.current === ACTIVITIES.plantShelter) return choices;\n    const plant = selectPlantTarget(fish, state, traits, affinities, { shelter: true });`,
  "force a readable post-shelter departure",
);

activities = replaceOnce(
  activities,
  `    weaveStage: 0,\n    weaveStageStartedAt: 0,\n  };\n}\n\nfunction findPlant`,
  `    weaveStage: 0,\n    weaveStageStartedAt: 0,\n    plantVisitStage: 0,\n    plantVisitStageStartedAt: 0,\n  };\n}\n\nfunction findPlant`,
  "reset plant visit state on activity selection",
);

activities = replaceRegex(
  activities,
  /function inspectionPoint\(fish, plant, state, activity\) \{[\s\S]*?\n\}\n\nfunction weavePlantPoint/,
  `function plantVisitStage(activity) {\n  return clamp(\n    Number.isInteger(activity.plantVisitStage) ? activity.plantVisitStage : 0,\n    0,\n    PLANT_VISIT_LAST_STAGE,\n  );\n}\n\nfunction plantVisitStageAge(activity) {\n  return Math.max(0, activity.ageRealSeconds - (activity.plantVisitStageStartedAt ?? 0));\n}\n\nfunction plantPairSeed(fish, plant) {\n  return mix32((fish.seed >>> 0) ^ Math.imul(plant.seed >>> 0, 0xc2b2ae35));\n}\n\nfunction departureColumns(fish, authoredColumns) {\n  // Departure has to move the body, not merely the centre point. Adult sprites\n  // can be several columns wide, so a minimum authored distance grows modestly\n  // with body width while remaining tightly bounded.\n  return Math.max(authoredColumns, clamp(spriteHalfWidth(fish) * 0.7, authoredColumns, authoredColumns + 1.6));\n}\n\nfunction inspectionPoint(fish, plant, state, activity) {\n  const tuning = sceneTuning(state, ACTIVITIES.plantInvestigate);\n  const base = plantTargetPosition(fish, plant, state);\n  const stage = plantVisitStage(activity);\n  const stageAge = plantVisitStageAge(activity);\n  const pairSeed = plantPairSeed(fish, plant);\n  const holdSeconds = sampleRange(\n    pairSeed,\n    8157,\n    tuning.inspectSecondsMin,\n    tuning.inspectSecondsMax,\n  );\n\n  if (stage === 0) {\n    return {\n      ...base,\n      stage,\n      phase: \"approach\",\n      arrivalRadius: PLANT_VISIT_ARRIVAL_RADIUS,\n      holdSeconds,\n      final: false,\n    };\n  }\n\n  if (stage === 1) {\n    // One feature, actually inspected. The old target hopped vertically every\n    // few seconds; this keeps one seeded station and lets only the head/body\n    // make a small living sweep around it.\n    const height = Math.min(0.8, Math.max(0.34, plantHeight(plant) * 0.11));\n    const verticalStation = sampleSigned(pairSeed, 8140) * height;\n    const headSweep = Math.sin(stageAge * 1.7 + sampleRange(pairSeed, 8155, 0, TAU))\n      * tuning.headSweepColumns;\n    const hover = Math.sin(stageAge * 1.05 + sampleRange(pairSeed, 8156, 0, TAU))\n      * tuning.hoverRows;\n    return {\n      ...boundedPlantPoint(fish, state, base.x + headSweep, base.y + verticalStation + hover),\n      stage,\n      phase: \"inspect\",\n      arrivalRadius: PLANT_VISIT_ARRIVAL_RADIUS,\n      holdSeconds,\n      final: false,\n    };\n  }\n\n  const side = Math.sign(base.x - plant.x) || (sample01(pairSeed, 8158) < 0.5 ? -1 : 1);\n  const retreat = departureColumns(fish, tuning.retreatColumns);\n  const vertical = sampleSigned(pairSeed, 8159) * tuning.retreatRows;\n  return {\n    ...boundedPlantPoint(fish, state, base.x + side * retreat, base.y + vertical),\n    stage,\n    phase: \"retreat\",\n    arrivalRadius: PLANT_VISIT_ARRIVAL_RADIUS,\n    holdSeconds,\n    final: true,\n  };\n}\n\nfunction shelterPoint(fish, plant, state, activity) {\n  const tuning = sceneTuning(state, ACTIVITIES.plantShelter);\n  const base = plantTargetPosition(fish, plant, state, { shelter: true });\n  const stage = plantVisitStage(activity);\n  const stageAge = plantVisitStageAge(activity);\n  const pairSeed = plantPairSeed(fish, plant);\n  const holdSeconds = sampleRange(\n    pairSeed,\n    8181,\n    tuning.quietSecondsMin,\n    tuning.quietSecondsMax,\n  );\n\n  if (stage === 0) {\n    return {\n      ...base,\n      stage,\n      phase: \"enter\",\n      arrivalRadius: PLANT_VISIT_ARRIVAL_RADIUS,\n      holdSeconds,\n      final: false,\n    };\n  }\n\n  if (stage === 1) {\n    const driftPhase = stageAge * 0.52 + sampleRange(pairSeed, 8180, 0, TAU);\n    return {\n      ...boundedPlantPoint(\n        fish,\n        state,\n        base.x + Math.sin(driftPhase) * tuning.quietDriftColumns,\n        base.y + Math.sin(driftPhase * 0.71) * tuning.quietDriftRows,\n      ),\n      stage,\n      phase: \"quiet\",\n      arrivalRadius: PLANT_VISIT_ARRIVAL_RADIUS,\n      holdSeconds,\n      final: false,\n    };\n  }\n\n  const side = Math.sign(base.x - plant.x) || (sample01(pairSeed, 8182) < 0.5 ? -1 : 1);\n  const emerge = departureColumns(fish, tuning.emergeColumns);\n  return {\n    ...boundedPlantPoint(fish, state, base.x + side * emerge, base.y - tuning.emergeRiseRows),\n    stage,\n    phase: \"emerge\",\n    arrivalRadius: PLANT_VISIT_ARRIVAL_RADIUS,\n    holdSeconds,\n    final: true,\n  };\n}\n\nfunction weavePlantPoint`,
  "replace plant inspection with three-beat plant vocabulary",
);

activities = replaceOnce(
  activities,
  `function clampToWater(state, point) {`,
  `function advancePlantVisitProgress(fish, state, activity) {\n  if (![ACTIVITIES.plantInvestigate, ACTIVITIES.plantShelter].includes(activity.current)) return activity;\n  const primary = findPlant(state, activity.targetId);\n  const shelter = activity.current === ACTIVITIES.plantShelter;\n  if (!primary || !suitablePlant(primary, { shelter })) return activity;\n  const point = shelter\n    ? shelterPoint(fish, primary, state, activity)\n    : inspectionPoint(fish, primary, state, activity);\n  const stageAge = plantVisitStageAge(activity);\n  const arrived = Math.hypot(point.x - fish.x, point.y - fish.y) <= point.arrivalRadius;\n  const completedBeat = point.stage === 0\n    ? arrived\n    : point.stage === 1 && stageAge >= point.holdSeconds;\n  if (!completedBeat || point.stage >= PLANT_VISIT_LAST_STAGE) return activity;\n  return {\n    ...activity,\n    plantVisitStage: point.stage + 1,\n    plantVisitStageStartedAt: activity.ageRealSeconds,\n  };\n}\n\nfunction clampToWater(state, point) {`,
  "add plant visit progression",
);

activities = replaceRegex(
  activities,
  /    if \(activity\.current === ACTIVITIES\.plantInvestigate\) \{[\s\S]*?\n    \}\n\n    if \(activity\.current === ACTIVITIES\.plantWeave\)/,
  `    if (activity.current === ACTIVITIES.plantInvestigate) {\n      const tuning = sceneTuning(state, ACTIVITIES.plantInvestigate);\n      const point = inspectionPoint(fish, primary, state, activity);\n      const inspecting = point.phase === \"inspect\";\n      const retreating = point.phase === \"retreat\";\n      return choreographed(state, activity.current, {\n        x: point.x,\n        y: point.y,\n        speed: inspecting\n          ? (tuning.inspectSpeed + traits.curiosity * tuning.inspectCuriosity\n            + affinities.plant * tuning.inspectAffinity) * cautious\n          : retreating\n            ? (tuning.retreatSpeed + traits.activity * tuning.retreatActivity) * cautious\n            : (tuning.approachSpeed + traits.curiosity * tuning.approachCuriosity) * cautious,\n        postureBias: inspecting ? tuning.inspectPitchDegrees : 0,\n        plantTarget: true,\n        plantVisitStage: point.stage,\n        plantVisitArrivalRadius: point.arrivalRadius,\n        plantVisitHoldSeconds: point.holdSeconds,\n        plantVisitFinal: point.final,\n        choreographyPhase: point.phase,\n      }, inspecting\n        ? \"plant-investigate:inspect\"\n        : retreating ? \"plant-investigate:retreat\" : null);\n    }\n\n    if (activity.current === ACTIVITIES.plantWeave)`,
  "make investigation approach inspect retreat",
);

activities = replaceRegex(
  activities,
  /    const point = plantTargetPosition\(fish, primary, state, \{ shelter: true \}\\);[\s\S]*?\n    \}, settled \? null : \"plant-shelter:settle\"\);/,
  `    const tuning = sceneTuning(state, ACTIVITIES.plantShelter);\n    const point = shelterPoint(fish, primary, state, activity);\n    const quiet = point.phase === \"quiet\";\n    const emerging = point.phase === \"emerge\";\n    return choreographed(state, activity.current, {\n      x: point.x,\n      y: point.y,\n      speed: quiet\n        ? tuning.quietSpeed + traits.activity * tuning.quietActivity\n        : emerging\n          ? (tuning.emergeSpeed + traits.activity * tuning.emergeActivity) * cautious\n          : (tuning.enterSpeed + traits.activity * tuning.enterActivity) * cautious,\n      postureBias: quiet ? tuning.quietPitchDegrees : 0,\n      plantTarget: true,\n      plantVisitStage: point.stage,\n      plantVisitArrivalRadius: point.arrivalRadius,\n      plantVisitHoldSeconds: point.holdSeconds,\n      plantVisitFinal: point.final,\n      choreographyPhase: point.phase,\n    }, quiet ? null : emerging ? \"plant-shelter:emerge\" : \"plant-shelter:settle\");`,
  "make shelter enter quiet emerge",
);

activities = replaceRegex(
  activities,
  /function naturalCompletion\(fish, activity, target, dwell\) \{[\s\S]*?\n\}/,
  `function naturalCompletion(fish, activity, target, dwell) {\n  if (!target) return false;\n  const distance = Math.hypot(target.x - fish.x, target.y - fish.y);\n  if ([ACTIVITIES.plantInvestigate, ACTIVITIES.plantShelter].includes(activity.current)) {\n    return activity.plantVisitStage >= PLANT_VISIT_LAST_STAGE\n      && distance <= (target.plantVisitArrivalRadius ?? PLANT_VISIT_ARRIVAL_RADIUS);\n  }\n  if (activity.ageRealSeconds < dwell.minimum) return false;\n  if (activity.current === ACTIVITIES.wander || activity.current === ACTIVITIES.openWaterRest) return distance < 0.7;\n  if (activity.current === ACTIVITIES.plantWeave) {\n    return activity.weaveStage >= WEAVE_ROUTE_LAST_STAGE\n      && distance <= WEAVE_ARRIVAL_RADIUS;\n  }\n  if (activity.current === ACTIVITIES.surfaceInvestigate) return distance < 0.72;\n  if (activity.current === ACTIVITIES.arrivalEnter) return distance < 0.9;\n  return false;\n}`,
  "complete plant visits only after physical departure",
);

activities = replaceOnce(
  activities,
  `        ? { ...resume, ageRealSeconds: 0, weaveStageStartedAt: 0 }`,
  `        ? { ...resume, ageRealSeconds: 0, weaveStageStartedAt: 0, plantVisitStageStartedAt: 0 }`,
  "reset resumed plant beat clock",
);

activities = replaceOnce(
  activities,
  `  activity = advanceWeaveProgress(fish, state, activity);\n\n  let target = resolve(activity, attention);`,
  `  activity = advanceWeaveProgress(fish, state, activity);\n  activity = advancePlantVisitProgress(fish, state, activity);\n\n  let target = resolve(activity, attention);`,
  "advance plant visit beat from production position",
);

await writeFile("src/sim/fish-activities.js", activities);

let tuning = await readFile("src/sim/choreography-tuning.js", "utf8");
tuning = replaceOnce(
  tuning,
  `  // Close enough to read the plant: the fish trades reach for control.\n  "plant-investigate:inspect": Object.freeze({\n    approachRadius: 0.72,\n    arrivalSpeedScale: 0.42,\n    accelerationResponse: 1.55,\n    turningResponse: 2.25,\n  }),`,
  `  // Close enough to read the plant: the fish trades reach for control.\n  "plant-investigate:inspect": Object.freeze({\n    approachRadius: 0.72,\n    arrivalSpeedScale: 0.34,\n    accelerationResponse: 1.35,\n    turningResponse: 1.9,\n    maximumSpeed: 0.34,\n  }),\n  // Looking is over. A deliberate outward swim is the punctuation that makes\n  // inspection different from simply loitering beside vegetation.\n  "plant-investigate:retreat": Object.freeze({\n    accelerationResponse: 1.8,\n    turningResponse: 1.9,\n    verticalSpeedScale: 0.92,\n    minimumSpeed: 0.055,\n    maximumSpeed: 0.68,\n    approachRadius: 0.9,\n    arrivalSpeedScale: 0.58,\n    turnDuration: 0.52,\n  }),`,
  "add investigation retreat steering",
);

tuning = replaceOnce(
  tuning,
  `  "plant-shelter:settle": Object.freeze({\n    accelerationResponse: 1,\n    turningResponse: 1.05,\n    maximumSpeed: 0.38,\n    verticalSpeedScale: 0.64,\n  }),`,
  `  "plant-shelter:settle": Object.freeze({\n    accelerationResponse: 1,\n    turningResponse: 1.05,\n    maximumSpeed: 0.42,\n    verticalSpeedScale: 0.64,\n  }),\n  // Leaving cover is a visible swim, not the resting controller drifting until\n  // another utility happens to win.\n  "plant-shelter:emerge": Object.freeze({\n    accelerationResponse: 1.35,\n    turningResponse: 1.25,\n    verticalSpeedScale: 0.72,\n    minimumSpeed: 0.045,\n    maximumSpeed: 0.58,\n    approachRadius: 0.9,\n    arrivalSpeedScale: 0.55,\n    pitchScale: 0.42,\n    turnDuration: 0.78,\n  }),`,
  "add shelter emerge steering",
);

tuning = replaceOnce(
  tuning,
  `  "plant-investigate": Object.freeze({\n    approachSpeed: 0.26,\n    approachCuriosity: 0.18,\n    inspectSpeed: 0.12,\n    inspectCuriosity: 0.08,\n    inspectAffinity: 0.035,\n    headSweepColumns: 0.34,\n    hoverRows: 0.2,\n    stationSeconds: 2.35,\n  }),`,
  `  "plant-investigate": Object.freeze({\n    approachSpeed: 0.34,\n    approachCuriosity: 0.16,\n    inspectSpeed: 0.095,\n    inspectCuriosity: 0.05,\n    inspectAffinity: 0.025,\n    inspectPitchDegrees: 3.5,\n    headSweepColumns: 0.24,\n    hoverRows: 0.12,\n    inspectSecondsMin: 2.6,\n    inspectSecondsMax: 3.8,\n    retreatSpeed: 0.42,\n    retreatActivity: 0.12,\n    retreatColumns: 3.1,\n    retreatRows: 0.48,\n  }),`,
  "author investigation sentence",
);

tuning = replaceOnce(
  tuning,
  `  "open-water-rest": Object.freeze({\n    settleRadiusRows: 1.15,\n    settleSpeed: 0.17,\n    driftSpeed: 0.035,\n    driftAmplitudeRows: 0.12,\n    driftVerticalRows: 0.055,\n  }),`,
  `  "open-water-rest": Object.freeze({\n    settleRadiusRows: 1.15,\n    settleSpeed: 0.17,\n    driftSpeed: 0.035,\n    driftAmplitudeRows: 0.12,\n    driftVerticalRows: 0.055,\n  }),\n  "plant-shelter": Object.freeze({\n    enterSpeed: 0.26,\n    enterActivity: 0.1,\n    quietSpeed: 0.018,\n    quietActivity: 0.018,\n    quietPitchDegrees: 0,\n    quietSecondsMin: 4.2,\n    quietSecondsMax: 6.2,\n    quietDriftColumns: 0.08,\n    quietDriftRows: 0.05,\n    emergeSpeed: 0.38,\n    emergeActivity: 0.12,\n    emergeColumns: 3.2,\n    emergeRiseRows: 0.5,\n  }),`,
  "add shelter scene vocabulary",
);
await writeFile("src/sim/choreography-tuning.js", tuning);

let fields = await readFile("src/dev/choreography-fields.js", "utf8");
fields = replaceOnce(
  fields,
  `  Object.freeze(["legTimeoutSecondsMin", "legTimeoutSecondsMax"]),`,
  `  Object.freeze(["legTimeoutSecondsMin", "legTimeoutSecondsMax"]),\n  Object.freeze(["inspectSecondsMin", "inspectSecondsMax"]),\n  Object.freeze(["quietSecondsMin", "quietSecondsMax"]),`,
  "add plant vocabulary intervals",
);
fields = replaceRegex(
  fields,
  /  "plant-investigate": Object\.freeze\(\[[\s\S]*?\n  \]\),\n  "plant-weave":/,
  `  "plant-investigate": Object.freeze([\n    field("approachSpeed", "Approach speed", "rows/s crossing to the plant", 0.02, 1.2, 0.005),\n    field("approachCuriosity", "Approach · curiosity", "rows/s added by a curious fish", 0, 1, 0.005),\n    field("inspectSpeed", "Inspect speed", "rows/s while reading one local feature", 0.01, 0.8, 0.005),\n    field("inspectCuriosity", "Inspect · curiosity", "rows/s added by a curious fish", 0, 0.5, 0.005),\n    field("inspectAffinity", "Inspect · plant affinity", "rows/s added by a plant lover", 0, 0.5, 0.005),\n    field("inspectPitchDegrees", "Inspect pitch", "degrees of planted-looking body bias", -12, 12, 0.25),\n    field("headSweepColumns", "Head sweep", "columns the nose sweeps across the feature", 0, 1.2, 0.01),\n    field("hoverRows", "Hover", "rows the body rises and falls while inspecting", 0, 0.8, 0.01),\n    field("inspectSecondsMin", "Inspect time · min", "seconds held on the local inspection beat", 1, 8, 0.05),\n    field("inspectSecondsMax", "Inspect time · max", "seconds held on the local inspection beat", 1, 8, 0.05),\n    field("retreatSpeed", "Retreat speed", "rows/s leaving the plant after inspection", 0.02, 1.2, 0.005),\n    field("retreatActivity", "Retreat · activity", "rows/s added by an energetic fish", 0, 0.6, 0.005),\n    field("retreatColumns", "Retreat distance", "minimum columns moved clear of the plant", 1, 6, 0.05),\n    field("retreatRows", "Retreat vertical variation", "rows of seeded vertical offset on departure", 0, 2, 0.01),\n  ]),\n  "plant-weave":`,
  "update investigation lab fields",
);
fields = replaceOnce(
  fields,
  `  "open-water-rest": Object.freeze([\n    field("settleRadiusRows", "Settle radius", "rows within which it counts as parked", 0.1, 4, 0.01),\n    field("settleSpeed", "Settle speed", "rows/s on the way to the resting spot", 0.01, 0.8, 0.005),\n    field("driftSpeed", "Drift speed", "rows/s once parked", 0.005, 0.4, 0.005),\n    field("driftAmplitudeRows", "Drift · horizontal", "columns of idle sway", 0, 1, 0.005),\n    field("driftVerticalRows", "Drift · vertical", "rows of idle rise and fall", 0, 1, 0.005),\n  ]),`,
  `  "open-water-rest": Object.freeze([\n    field("settleRadiusRows", "Settle radius", "rows within which it counts as parked", 0.1, 4, 0.01),\n    field("settleSpeed", "Settle speed", "rows/s on the way to the resting spot", 0.01, 0.8, 0.005),\n    field("driftSpeed", "Drift speed", "rows/s once parked", 0.005, 0.4, 0.005),\n    field("driftAmplitudeRows", "Drift · horizontal", "columns of idle sway", 0, 1, 0.005),\n    field("driftVerticalRows", "Drift · vertical", "rows of idle rise and fall", 0, 1, 0.005),\n  ]),\n  "plant-shelter": Object.freeze([\n    field("enterSpeed", "Entry speed", "rows/s entering plant cover", 0.02, 0.8, 0.005),\n    field("enterActivity", "Entry · activity", "rows/s added by an energetic fish", 0, 0.5, 0.005),\n    field("quietSpeed", "Quiet speed", "rows/s while settled in cover", 0.005, 0.2, 0.002),\n    field("quietActivity", "Quiet · activity", "small activity contribution while sheltered", 0, 0.1, 0.002),\n    field("quietPitchDegrees", "Quiet pitch", "degrees of body bias while sheltered", -10, 10, 0.25),\n    field("quietSecondsMin", "Quiet time · min", "seconds visibly settled in cover", 2, 12, 0.05),\n    field("quietSecondsMax", "Quiet time · max", "seconds visibly settled in cover", 2, 12, 0.05),\n    field("quietDriftColumns", "Quiet drift · horizontal", "columns of tiny sheltered drift", 0, 0.5, 0.005),\n    field("quietDriftRows", "Quiet drift · vertical", "rows of tiny sheltered drift", 0, 0.5, 0.005),\n    field("emergeSpeed", "Emergence speed", "rows/s leaving cover", 0.02, 1, 0.005),\n    field("emergeActivity", "Emergence · activity", "rows/s added by an energetic fish", 0, 0.5, 0.005),\n    field("emergeColumns", "Emergence distance", "minimum columns moved clear of cover", 1, 6, 0.05),\n    field("emergeRiseRows", "Emergence rise", "rows lifted while leaving cover", 0, 2, 0.01),\n  ]),`,
  "add shelter lab fields",
);
await writeFile("src/dev/choreography-fields.js", fields);

let showcase = await readFile("src/dev/behavior-showcase.js", "utf8");
showcase = replaceOnce(showcase,
  `  Object.freeze({ id: "plant-investigate", label: "Plant investigation", subjects: [SUBJECT_INDEX], loopSeconds: 8.2 }),`,
  `  Object.freeze({ id: "plant-investigate", label: "Plant investigation", subjects: [SUBJECT_INDEX], loopSeconds: 24 }),`,
  "lengthen plant investigation showcase");
showcase = replaceOnce(showcase,
  `  Object.freeze({ id: "plant-shelter", label: "Plant shelter", subjects: [SUBJECT_INDEX], loopSeconds: 10 }),`,
  `  Object.freeze({ id: "plant-shelter", label: "Plant shelter", subjects: [SUBJECT_INDEX], loopSeconds: 26 }),`,
  "lengthen plant shelter showcase");
showcase = replaceOnce(showcase,
  `    targetY: target.targetY ?? null,\n  };`,
  `    targetY: target.targetY ?? null,\n    weaveStage: source?.weaveStage ?? 0,\n    weaveStageStartedAt: source?.weaveStageStartedAt ?? 0,\n    plantVisitStage: source?.plantVisitStage ?? 0,\n    plantVisitStageStartedAt: source?.plantVisitStageStartedAt ?? 0,\n  };`,
  "carry bounded route/visit cursors in showcase");
await writeFile("src/dev/behavior-showcase.js", showcase);

let capture = await readFile("tools/capture-behavior-showcase.mjs", "utf8");
capture = replaceOnce(
  capture,
  `  } else if (scenario.id === "plant-investigate") {\n    const inspect = phaseTime("inspect", scenario.loopSeconds * 0.45);\n    times = [0, inspect, Math.min(scenario.loopSeconds, inspect + 2.4), scenario.loopSeconds * 0.94];\n  } else if (scenario.id === "plant-weave") {`,
  `  } else if (scenario.id === "plant-investigate") {\n    const inspect = phaseTime("inspect", scenario.loopSeconds * 0.4);\n    const lateInspect = firstTimeAfter(\n      timeline,\n      inspect + 1.4,\n      (metadata) => metadata.phase === "inspect",\n      inspect,\n    );\n    times = [phaseTime("approach", 0), inspect, lateInspect, phaseTime("retreat", scenario.loopSeconds * 0.72)];\n  } else if (scenario.id === "plant-weave") {`,
  "capture investigation sentence",
);
capture = replaceOnce(
  capture,
  `  } else {\n    times = [];\n  }`,
  `  } else if (scenario.id === "plant-shelter") {\n    const quiet = phaseTime("quiet", scenario.loopSeconds * 0.42);\n    const lateQuiet = firstTimeAfter(\n      timeline,\n      quiet + 2,\n      (metadata) => metadata.phase === "quiet",\n      quiet,\n    );\n    times = [phaseTime("enter", 0), quiet, lateQuiet, phaseTime("emerge", scenario.loopSeconds * 0.72)];\n  } else {\n    times = [];\n  }`,
  "capture shelter sentence",
);
await writeFile("tools/capture-behavior-showcase.mjs", capture);

let tuningTest = await readFile("tests/choreography-tuning.test.js", "utf8");
tuningTest = replaceOnce(
  tuningTest,
  `    ["legTimeoutSecondsMin", "legTimeoutSecondsMax"],`,
  `    ["legTimeoutSecondsMin", "legTimeoutSecondsMax"],\n    ["inspectSecondsMin", "inspectSecondsMax"],\n    ["quietSecondsMin", "quietSecondsMax"],`,
  "cover new scene intervals",
);
await writeFile("tests/choreography-tuning.test.js", tuningTest);

const vocabularyTest = `import assert from "node:assert/strict";\nimport test from "node:test";\n\nimport { ACTIVITIES, resolveActivityTarget } from "../src/sim/fish-activities.js";\nimport { createShowcaseState, showcaseSubjects, showcaseTarget, tickShowcase } from "../src/dev/behavior-showcase.js";\nimport { hashSeed } from "../src/sim/prng.js";\n\nconst LABELS = ["phase7-plant-a", "phase7-plant-b", "phase7-plant-c", "phase7-plant-d", "phase7-plant-e", "phase7-plant-f"];\n\nfunction subject(state, activity) {\n  return showcaseSubjects(state, activity)[0];\n}\n\nfunction runVisit(label, activity) {\n  let state = createShowcaseState({ scenario: activity, seed: hashSeed(label) });\n  const seen = new Map();\n  const transitions = [];\n  let exit = null;\n  for (let step = 0; step < 460; step += 1) {\n    const { index, fish } = subject(state, activity);\n    if (fish.activity.current !== activity) {\n      exit = { seconds: step * 0.1, activity: fish.activity.current };\n      break;\n    }\n    const target = showcaseTarget(state, activity);\n    assert.ok(target, \\`${label}: ${activity} lost its target\\`);\n    const plant = state.plants.find((entry) => entry.seed === fish.activity.targetId);\n    assert.ok(plant, \\`${label}: ${activity} lost its plant\\`);\n    const stage = target.plantVisitStage;\n    if (!seen.has(stage)) seen.set(stage, {\n      stage, phase: target.choreographyPhase, x: target.x, y: target.y,\n      plantX: plant.x, speed: target.speed, seconds: step * 0.1,\n      hold: target.plantVisitHoldSeconds, radius: target.plantVisitArrivalRadius,\n    });\n    const distance = Math.hypot(target.x - fish.x, target.y - fish.y);\n    const stageAge = fish.activity.ageRealSeconds - (fish.activity.plantVisitStageStartedAt ?? 0);\n    const next = tickShowcase(state, 0.1, activity);\n    const nextFish = next.individuals[index];\n    if (nextFish.activity.current === activity) {\n      const nextTarget = showcaseTarget(next, activity);\n      if (nextTarget.plantVisitStage > stage) transitions.push({\n        from: stage, to: nextTarget.plantVisitStage, distance, radius: target.plantVisitArrivalRadius,\n        stageAge, hold: target.plantVisitHoldSeconds,\n      });\n    } else {\n      exit = {\n        seconds: (step + 1) * 0.1, activity: nextFish.activity.current,\n        fromStage: stage, distance, radius: target.plantVisitArrivalRadius,\n      };\n      state = next;\n      break;\n    }\n    state = next;\n  }\n  return { seen, transitions, exit };\n}\n\ntest("plant visit phases do not advance from activity age alone", () => {\n  for (const activity of [ACTIVITIES.plantInvestigate, ACTIVITIES.plantShelter]) {\n    const state = createShowcaseState({ scenario: activity });\n    const { index, fish } = subject(state, activity);\n    const agedFish = { ...fish, activity: { ...fish.activity, ageRealSeconds: 999 } };\n    const agedState = { ...state, individuals: state.individuals.map((entry, slot) => slot === index ? agedFish : entry) };\n    const target = resolveActivityTarget(agedFish, index, agedState, agedFish.activity);\n    assert.equal(target.plantVisitStage, 0, activity + " skipped its physical entry");\n  }\n});\n\ntest("plant investigation reads approach, stable inspect, deliberate retreat across six seeds", () => {\n  for (const label of LABELS) {\n    const result = runVisit(label, ACTIVITIES.plantInvestigate);\n    assert.deepEqual([...result.seen.keys()], [0, 1, 2], label + ": investigation skipped a beat");\n    assert.deepEqual([...result.seen.values()].map((beat) => beat.phase), ["approach", "inspect", "retreat"], label);\n    assert.deepEqual(result.transitions.map(({ from, to }) => [from, to]), [[0, 1], [1, 2]], label);\n    const entryTransition = result.transitions[0];\n    assert.ok(entryTransition.distance <= entryTransition.radius + 0.1, label + ": inspect started before arrival");\n    const inspectTransition = result.transitions[1];\n    assert.ok(inspectTransition.stageAge + 0.11 >= inspectTransition.hold, label + ": retreat began before inspection beat finished");\n    const approach = result.seen.get(0);\n    const inspect = result.seen.get(1);\n    const retreat = result.seen.get(2);\n    assert.ok(inspect.speed < approach.speed, label + ": inspection did not visibly slow");\n    assert.ok(inspect.speed < retreat.speed, label + ": retreat was not distinct from inspection");\n    assert.ok(Math.abs(retreat.x - retreat.plantX) > Math.abs(inspect.x - inspect.plantX) + 1.2, label + ": retreat did not clear the plant");\n    assert.equal(Math.sign(retreat.x - retreat.plantX), Math.sign(inspect.x - inspect.plantX), label + ": investigation turned into a weave crossing");\n    assert.ok(result.exit, label + ": investigation never completed");\n    assert.equal(result.exit.fromStage, 2, label + ": investigation exited before retreat");\n    assert.ok(result.exit.distance <= result.exit.radius + 0.1, label + ": investigation ended before reaching retreat");\n  }\n});\n\ntest("plant shelter reads enter, quiet, emerge across six seeds", () => {\n  for (const label of LABELS) {\n    const result = runVisit(label, ACTIVITIES.plantShelter);\n    assert.deepEqual([...result.seen.keys()], [0, 1, 2], label + ": shelter skipped a beat");\n    assert.deepEqual([...result.seen.values()].map((beat) => beat.phase), ["enter", "quiet", "emerge"], label);\n    assert.deepEqual(result.transitions.map(({ from, to }) => [from, to]), [[0, 1], [1, 2]], label);\n    const entryTransition = result.transitions[0];\n    assert.ok(entryTransition.distance <= entryTransition.radius + 0.1, label + ": quiet began before cover was reached");\n    const quietTransition = result.transitions[1];\n    assert.ok(quietTransition.stageAge + 0.11 >= quietTransition.hold, label + ": emergence began before quiet beat finished");\n    const enter = result.seen.get(0);\n    const quiet = result.seen.get(1);\n    const emerge = result.seen.get(2);\n    assert.ok(quiet.speed < enter.speed * 0.45, label + ": shelter never became quiet");\n    assert.ok(quiet.speed < emerge.speed * 0.35, label + ": emergence was not a visible energy change");\n    assert.ok(Math.abs(emerge.x - emerge.plantX) > Math.abs(quiet.x - quiet.plantX) + 1.2, label + ": emergence did not leave cover");\n    assert.equal(Math.sign(emerge.x - emerge.plantX), Math.sign(quiet.x - quiet.plantX), label + ": shelter exit crossed through the plant");\n    assert.ok(result.exit, label + ": shelter never completed");\n    assert.equal(result.exit.fromStage, 2, label + ": shelter exited before emergence");\n    assert.ok(result.exit.distance <= result.exit.radius + 0.1, label + ": shelter ended before reaching emergence");\n    assert.equal(result.exit.activity, ACTIVITIES.openWaterRest, label + ": shelter immediately re-entered cover instead of peeling away");\n  }\n});\n\ntest("plant weave remains the separate traversal vocabulary", () => {\n  const state = createShowcaseState({ scenario: ACTIVITIES.plantWeave });\n  const target = showcaseTarget(state, ACTIVITIES.plantWeave);\n  assert.ok(target.weaveLeg);\n  assert.equal(target.plantVisitStage, undefined);\n  assert.match(target.choreographyPhase, /^weave-/);\n});\n`;
await writeFile("tests/phase7-plant-vocabulary.test.js", vocabularyTest);

// This workflow is only evidence plumbing for the implementation commit. The
// closure commit removes it after its exact-head artifact has been reviewed.
await writeFile(".github/workflows/phase7-5-visual.yml", `name: Phase 7.5 plant vocabulary visual\n\non:\n  push:\n    branches:\n      - phase-7-1-readability-baseline\n\npermissions:\n  contents: read\n\njobs:\n  capture:\n    if: github.event.head_commit.message == 'Phase 7.5 implement plant vocabulary'\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v6\n      - uses: actions/setup-node@v4\n        with:\n          node-version: 22\n          cache: npm\n      - run: npm ci\n      - name: Capture plant vocabulary comparison\n        run: npm run capture:behaviors -- --scenario=plant-investigate,plant-weave,plant-shelter --scale=0.5 --gif --output=.audit-output/phase7-5-plant-visual\n      - uses: actions/upload-artifact@v4\n        with:\n          name: phase7-5-plant-visual-\${{ github.run_id }}\n          path: .audit-output/phase7-5-plant-visual\n          if-no-files-found: error\n`);

// The patch builder and write-capable finalizer are one-shot scaffolding.
await rm("tools/apply-phase7-5.mjs", { force: true });
await rm(".github/workflows/phase7-5-finalize.yml", { force: true });

console.log("Phase 7.5 plant vocabulary candidate prepared.");
