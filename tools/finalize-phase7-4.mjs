import { readFile, writeFile, rm } from "node:fs/promises";

function replaceOnce(text, before, after, label) {
  const first = text.indexOf(before);
  if (first < 0) throw new Error(`${label}: source text not found`);
  if (text.indexOf(before, first + before.length) >= 0) {
    throw new Error(`${label}: source text was not unique`);
  }
  return text.slice(0, first) + after + text.slice(first + before.length);
}

async function patch(path, transform) {
  const before = await readFile(path, "utf8");
  const after = transform(before);
  if (after === before) throw new Error(`${path}: no change`);
  await writeFile(path, after);
}

await patch("src/sim/fish-activities.js", (source) => {
  let text = source;
  text = replaceOnce(
    text,
    'import * as core from "./fish-activities-core.js";\n',
    'import * as core from "./fish-activities-core.js";\nimport { shapeTargetForAttention } from "./attention.js";\n',
    "import attention target shaping",
  );
  text = replaceOnce(
    text,
    "const WEAVE_ROUTE_MAX_SECONDS = 70;",
    "const WEAVE_ROUTE_MAX_SECONDS = 40;",
    "tighten bounded weave safety ceiling",
  );
  text = replaceOnce(
    text,
    "  [core.ACTIVITIES.plantWeave]: [8, 55, WEAVE_ROUTE_MAX_SECONDS],",
    "  [core.ACTIVITIES.plantWeave]: [8, 32, WEAVE_ROUTE_MAX_SECONDS],",
    "align weave dwell interval with route ceiling",
  );
  text = replaceOnce(
    text,
    `  let target = weaveTarget(fish, index, state, activity, context);\n  if (!target) return coreResult;\n\n  const distance = Math.hypot(target.x - fish.x, target.y - fish.y);`,
    `  let target = weaveTarget(fish, index, state, activity, context);\n  if (!target) return coreResult;\n\n  // The mature activity core owns attention semantics. Replacing its weave\n  // target must preserve the same wary / passive / held-presence shaping that\n  // every other activity receives, otherwise a weaving fish can appear to\n  // ignore a disturbance or even keep closing on one.\n  const shapedTarget = shapeTargetForAttention(target, fish, coreResult.attention);\n\n  const distance = Math.hypot(target.x - fish.x, target.y - fish.y);`,
    "preserve attention shaping on spatial weave",
  );
  text = replaceOnce(
    text,
    `      target: resolveActivityTarget(fish, index, state, next, context),\n    };`,
    `      target: shapeTargetForAttention(\n        resolveActivityTarget(fish, index, state, next, context),\n        fish,\n        coreResult.attention,\n      ),\n    };`,
    "shape weave exit target",
  );
  text = replaceOnce(
    text,
    `    target,\n  };\n}\n\nexport function tickFishActivity`,
    `    target: shapedTarget,\n  };\n}\n\nexport function tickFishActivity`,
    "return shaped weave target",
  );
  return text;
});

await patch("tests/choreography-tuning.test.js", (source) => replaceOnce(
  source,
  '    ["stageSecondsMin", "stageSecondsMax"],',
  '    ["legTimeoutSecondsMin", "legTimeoutSecondsMax"],',
  "test active weave timeout interval",
));

await patch("tests/behavior-readability.test.js", (source) => replaceOnce(
  source,
  `  const first = resolveActivityTarget(weaving, index, base, { ...weaving.activity, ageRealSeconds: 0 });\n  const second = resolveActivityTarget(weaving, index, base, { ...weaving.activity, ageRealSeconds: 3.2 });`,
  `  // Phase 7.4 made route progression spatial. Compare two authored route\n  // legs directly rather than advancing the old timer in a synthetic target.\n  const firstActivity = { ...weaving.activity, weaveStage: 0, weaveStageStartedAt: 0 };\n  const secondActivity = { ...weaving.activity, weaveStage: 1, weaveStageStartedAt: 0 };\n  const first = resolveActivityTarget(weaving, index, base, firstActivity);\n  const second = resolveActivityTarget(weaving, index, base, secondActivity);`,
  "update readability assertion for spatial weave",
));

// One-shot scaffolding must not survive the successful commit.
await rm("tools/finalize-phase7-4.mjs", { force: true });
await rm(".github/workflows/phase7-4-finalize.yml", { force: true });

console.log("Phase 7.4 final integration patch applied.");
