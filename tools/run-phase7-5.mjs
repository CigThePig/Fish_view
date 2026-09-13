import { readFile, writeFile, rm } from "node:fs/promises";
import { pathToFileURL } from "node:url";

function replaceOnce(text, before, after, label) {
  const first = text.indexOf(before);
  if (first < 0) throw new Error(`${label}: source text not found`);
  if (text.indexOf(before, first + before.length) >= 0) throw new Error(`${label}: source text was not unique`);
  return text.slice(0, first) + after + text.slice(first + before.length);
}

const sourcePath = "tools/apply-phase7-5.mjs";
let source = await readFile(sourcePath, "utf8");

// Correct patch-builder quoting/regexes before executing the one-shot script.
source = source.replace(
  String.raw`\{ shelter: true \}\\);[\s\S]*?\n    \}, settled`,
  String.raw`\{ shelter: true \}\);[\s\S]*?\n    \}, settled`,
);
source = source.replace(
  String.raw`/function naturalCompletion\(fish, activity, target, dwell\) \{[\s\S]*?\n\}/,`,
  String.raw`/function naturalCompletion\(fish, activity, target, dwell\) \{[\s\S]*?\n\}\n\n(?=\/\*\*)/,`,
);

// The generated regression test intentionally contains template literals of
// its own. Escape those for the patch-builder's outer template without touching
// the builder's normal `${...}` diagnostics elsewhere.
const vocabularyStart = source.indexOf('const vocabularyTest = `');
const vocabularyEndMarker = '`;\nawait writeFile("tests/phase7-plant-vocabulary.test.js", vocabularyTest);';
const vocabularyEnd = source.indexOf(vocabularyEndMarker, vocabularyStart);
if (vocabularyStart < 0 || vocabularyEnd < 0) throw new Error("vocabulary test template not found");
let vocabulary = source.slice(vocabularyStart, vocabularyEnd);
vocabulary = vocabulary
  .replaceAll('\\\\`', '\\`')
  .replaceAll('${label}', '\\${label}')
  .replaceAll('${activity}', '\\${activity}');
source = source.slice(0, vocabularyStart) + vocabulary + source.slice(vocabularyEnd);

const temporary = "/tmp/apply-phase7-5-fixed.mjs";
await writeFile(temporary, source);
await import(`${pathToFileURL(temporary).href}?run=${Date.now()}`);

let activities = await readFile("src/sim/fish-activities.js", "utf8");

// A three-beat visit is one readable sentence. A broad utility swing after the
// global 12-second behavior floor must not cut it between "inspect" and
// "retreat", or between "quiet" and "emerge". Target validity and the bounded
// safety ceiling below still cancel a damaged/unreachable visit.
activities = replaceOnce(
  activities,
  `  const compatible = activityMatchesBehavior(activity.current, fish.behavior?.current);\n  if (!compatible) activity = selectActivity(fish, index, state, { ...context, traits, affinities });\n  else if (activity !== previous) activity = { ...activity };\n  else activity = { ...activity, ageRealSeconds: activity.ageRealSeconds + realDelta };`,
  `  const compatible = activityMatchesBehavior(activity.current, fish.behavior?.current);\n  const committedPlantVisit = [ACTIVITIES.plantInvestigate, ACTIVITIES.plantShelter]\n    .includes(activity.current);\n  if (!compatible && !committedPlantVisit) {\n    activity = selectActivity(fish, index, state, { ...context, traits, affinities });\n  } else if (activity !== previous) activity = { ...activity };\n  else activity = { ...activity, ageRealSeconds: activity.ageRealSeconds + realDelta };`,
  "let authored plant visits finish through broad-behavior utility swings",
);

// The generic dwell ceiling is still useful as a hard escape, but it cannot own
// the ordinary ending now that final departure is physical. These caps are far
// above observed production visits while remaining fixed and tiny in state/cost.
activities = replaceOnce(
  activities,
  `  let target = resolve(activity, attention);\n  const dwell = activityDwell(fish, activity.current);\n  if (!target || activity.ageRealSeconds >= dwell.maximum || naturalCompletion(fish, activity, target, dwell)) {`,
  `  let target = resolve(activity, attention);\n  const dwell = activityDwell(fish, activity.current);\n  const plantVisitSafetyMaximum = activity.current === ACTIVITIES.plantInvestigate\n    ? Math.max(dwell.maximum, 42)\n    : activity.current === ACTIVITIES.plantShelter\n      ? Math.max(dwell.maximum, 52)\n      : dwell.maximum;\n  if (!target\n    || activity.ageRealSeconds >= plantVisitSafetyMaximum\n    || naturalCompletion(fish, activity, target, dwell)) {`,
  "give plant visit departures a bounded physical-completion window",
);
await writeFile("src/sim/fish-activities.js", activities);

// Phase 7.5 makes plant entry physical. The old readability test simulated
// inspection by aging a fish in place, which now correctly remains in approach.
// Ask for the authored inspect stage directly while keeping the test's original
// comparison against the frozen weave geometry.
let readability = await readFile("tests/behavior-readability.test.js", "utf8");
readability = replaceOnce(
  readability,
  `  const anchor = plantTargetPosition(source, plant, base);\n  const near = { ...source, x: anchor.x, y: anchor.y, activity: { ...source.activity, ageRealSeconds: 3.1 } };`,
  `  const anchor = plantTargetPosition(source, plant, base);\n  const near = {\n    ...source,\n    x: anchor.x,\n    y: anchor.y,\n    activity: {\n      ...source.activity,\n      ageRealSeconds: 3.1,\n      plantVisitStage: 1,\n      plantVisitStageStartedAt: 0,\n    },\n  };`,
  "update plant readability fixture for physical entry",
);
readability = readability.replace(
  'test("plant inspection hovers around one specimen while weaving alternates route sides", () => {',
  'test("plant inspection stays local while weaving alternates route sides", () => {',
);
await writeFile("tests/behavior-readability.test.js", readability);

// This Phase 2 regression owned the old timer-completion rule. Preserve its real
// product claim, "a completed plant visit does not immediately pick vegetation
// again", but stage the new physically completed retreat instead of aging a fish
// beside the plant for forty seconds.
let phase2 = await readFile("tests/phase2-activities.test.js", "utf8");
phase2 = replaceOnce(
  phase2,
  `  plantTargetPosition,\n  tickFishActivity,`,
  `  plantTargetPosition,\n  resolveActivityTarget,\n  tickFishActivity,`,
  "import production target resolver",
);
phase2 = replaceOnce(
  phase2,
  `test("completed plant visits return to open water before choosing vegetation again", () => {\n  const base = stockedAquarium({ seed: 614 });\n  const plant = base.plants.find((candidate) => candidate.matureHeight > 2);\n  assert.ok(plant);\n  // Investigation still uses age-bounded completion. Plant weave now has\n  // its own spatial completion regression in phase7-plant-weave.test.js.\n  for (const activity of [ACTIVITIES.plantInvestigate]) {\n    const fish = {\n      ...withBehavior(base.individuals[4], "explore"),\n      activity: {\n        ...createActivityState(activity),\n        ageRealSeconds: 40,\n        targetType: "plant",\n        targetId: plant.seed,\n      },\n    };\n    const state = { ...base, individuals: base.individuals.map((value, index) => index === 4 ? fish : value) };\n    const result = tickFishActivity(fish, 4, state, 0.1, { bubbles: [] });\n    assert.equal(result.activity.current, ACTIVITIES.wander);\n    assert.equal(result.activity.targetType, "waypoint");\n  }\n});`,
  `test("completed plant visits return to open water before choosing vegetation again", () => {\n  const base = stockedAquarium({ seed: 614 });\n  const plant = base.plants.find((candidate) => candidate.matureHeight > 2);\n  assert.ok(plant);\n  const staged = {\n    ...withBehavior(base.individuals[4], "explore"),\n    activity: {\n      ...createActivityState(ACTIVITIES.plantInvestigate),\n      ageRealSeconds: 9,\n      targetType: "plant",\n      targetId: plant.seed,\n      plantVisitStage: 2,\n      plantVisitStageStartedAt: 6,\n    },\n  };\n  const stagedState = {\n    ...base,\n    individuals: base.individuals.map((value, index) => index === 4 ? staged : value),\n  };\n  const retreat = resolveActivityTarget(staged, 4, stagedState, staged.activity, { bubbles: [] });\n  assert.equal(retreat.choreographyPhase, "retreat");\n  const fish = { ...staged, x: retreat.x, y: retreat.y };\n  const state = { ...stagedState, individuals: stagedState.individuals.map((value, index) => index === 4 ? fish : value) };\n  const result = tickFishActivity(fish, 4, state, 0.1, { bubbles: [] });\n  assert.equal(result.activity.current, ACTIVITIES.wander);\n  assert.equal(result.activity.targetType, "waypoint");\n});`,
  "update completed plant visit regression for physical retreat",
);
await writeFile("tests/phase2-activities.test.js", phase2);

// The final broad behavior at the instant shelter emergence completes is allowed
// to have changed while the authored visit was finishing. What matters here is
// that the fish cannot snap straight back into cover after visibly emerging.
let vocabularyTestFile = await readFile("tests/phase7-plant-vocabulary.test.js", "utf8");
vocabularyTestFile = replaceOnce(
  vocabularyTestFile,
  `    assert.equal(result.exit.activity, ACTIVITIES.openWaterRest, label + ": shelter immediately re-entered cover instead of peeling away");`,
  `    assert.notEqual(result.exit.activity, ACTIVITIES.plantShelter, label + ": shelter immediately re-entered cover instead of peeling away");`,
  "allow post-emergence broad behavior while blocking shelter U-turn",
);
await writeFile("tests/phase7-plant-vocabulary.test.js", vocabularyTestFile);

await rm("tools/run-phase7-5.mjs", { force: true });