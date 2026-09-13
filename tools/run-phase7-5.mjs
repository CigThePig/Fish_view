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

// The first candidate exposed one important ownership bug: the generic dwell
// ceiling could cancel a slow plant visit before its authored departure was
// physically reached. Keep a hard bounded escape for damaged/unreachable
// geometry, but let physical completion own the ordinary ending.
let activities = await readFile("src/sim/fish-activities.js", "utf8");
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

await rm("tools/run-phase7-5.mjs", { force: true });
