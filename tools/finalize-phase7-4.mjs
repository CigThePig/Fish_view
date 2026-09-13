import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { readFile, writeFile, rm } from "node:fs/promises";

const BASE = "f5637abedf958457f5867b463e0f52c300d08bbb";

function replaceOnce(text, before, after, label) {
  const first = text.indexOf(before);
  if (first < 0) throw new Error(`${label}: source text not found`);
  if (text.indexOf(before, first + before.length) >= 0) {
    throw new Error(`${label}: source text was not unique`);
  }
  return text.slice(0, first) + after + text.slice(first + before.length);
}

async function restore(path) {
  const content = execFileSync("git", ["show", `${BASE}:${path}`], { encoding: "utf8" });
  await writeFile(path, content);
}

let strongWeaveTest = await readFile("tests/phase7-plant-weave.test.js", "utf8");
strongWeaveTest = strongWeaveTest.replace(
  'import * as core from "../src/sim/fish-activities-core.js";\n',
  "",
);
strongWeaveTest = replaceOnce(
  strongWeaveTest,
  `test("plant investigation and shelter targets remain delegated to the frozen implementation", () => {\n  for (const activity of [ACTIVITIES.plantInvestigate, ACTIVITIES.plantShelter]) {\n    const state = createShowcaseState({ scenario: activity });\n    const { index, fish } = subject(state, activity);\n    assert.deepEqual(\n      resolveActivityTarget(fish, index, state, fish.activity),\n      core.resolveActivityTarget(fish, index, state, fish.activity),\n      \`${'${activity}'} changed while Phase 7.4 was scoped to weave\`,\n    );\n  }\n});`,
  `test("plant investigation and shelter stay outside weave route semantics", () => {\n  for (const activity of [ACTIVITIES.plantInvestigate, ACTIVITIES.plantShelter]) {\n    const state = createShowcaseState({ scenario: activity });\n    const { index, fish } = subject(state, activity);\n    const target = resolveActivityTarget(fish, index, state, fish.activity);\n    assert.ok(target, \`${'${activity}'} lost its plant target\`);\n    assert.equal(target.weaveStage, undefined, \`${'${activity}'} gained weave route state\`);\n    assert.equal(target.weaveLeg, undefined, \`${'${activity}'} gained weave route geometry\`);\n  }\n});`,
  "adapt frozen plant comparison to monolithic implementation",
);

for (const path of [
  "src/sim/fish-activities.js",
  "src/sim/choreography-tuning.js",
  "src/dev/choreography-fields.js",
  "src/dev/behavior-showcase.js",
  "tools/capture-behavior-showcase.mjs",
]) {
  await restore(path);
}

const patchSource = execFileSync(
  "git",
  ["show", `${BASE}:tools/apply-phase7-4-patch.mjs`],
  { encoding: "utf8" },
);
const tempPatch = "/tmp/apply-phase7-4-patch.mjs";
await writeFile(tempPatch, patchSource);
await import(`${pathToFileURL(tempPatch).href}?run=${Date.now()}`);

await writeFile("tests/phase7-plant-weave.test.js", strongWeaveTest);

let tuningTest = await readFile("tests/choreography-tuning.test.js", "utf8");
tuningTest = replaceOnce(
  tuningTest,
  '    ["stageSecondsMin", "stageSecondsMax"],',
  '    ["legTimeoutSecondsMin", "legTimeoutSecondsMax"],',
  "test active weave timeout interval",
);
await writeFile("tests/choreography-tuning.test.js", tuningTest);

let readabilityTest = await readFile("tests/behavior-readability.test.js", "utf8");
readabilityTest = replaceOnce(
  readabilityTest,
  `  const first = resolveActivityTarget(weaving, index, base, { ...weaving.activity, ageRealSeconds: 0 });\n  const second = resolveActivityTarget(weaving, index, base, { ...weaving.activity, ageRealSeconds: 3.2 });`,
  `  // Phase 7.4 made route progression spatial. Compare two authored route\n  // legs directly rather than advancing the retired timer in a synthetic target.\n  const firstActivity = { ...weaving.activity, weaveStage: 0, weaveStageStartedAt: 0 };\n  const secondActivity = { ...weaving.activity, weaveStage: 1, weaveStageStartedAt: 0 };\n  const first = resolveActivityTarget(weaving, index, base, firstActivity);\n  const second = resolveActivityTarget(weaving, index, base, secondActivity);`,
  "update readability assertion for spatial weave",
);
await writeFile("tests/behavior-readability.test.js", readabilityTest);

let phase2Test = await readFile("tests/phase2-activities.test.js", "utf8");
phase2Test = replaceOnce(
  phase2Test,
  `  for (const activity of [ACTIVITIES.plantInvestigate, ACTIVITIES.plantWeave]) {`,
  `  // Investigation still uses age-bounded completion. Plant weave now has\n  // its own spatial completion regression in phase7-plant-weave.test.js.\n  for (const activity of [ACTIVITIES.plantInvestigate]) {`,
  "keep timer completion assertion on timer-owned plant visits",
);
await writeFile("tests/phase2-activities.test.js", phase2Test);

for (const path of [
  "src/sim/fish-activities-core.js",
  "src/sim/choreography-tuning-core.js",
  "src/dev/behavior-showcase-core.js",
  "tools/apply-phase7-4-patch.mjs",
  "tools/finalize-phase7-4.mjs",
  ".github/workflows/phase7-4-finalize.yml",
]) {
  await rm(path, { force: true });
}

console.log("Phase 7.4 monolithic integration patch applied.");
