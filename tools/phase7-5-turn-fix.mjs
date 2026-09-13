import { readFile, writeFile, rm } from "node:fs/promises";

const path = "src/sim/fish-choreography.js";
let text = await readFile(path, "utf8");
const before = `  const turnTarget = turnableDirection(currentDirection, desiredDirection, fish.seed);`;
const after = `  // Ordinary locomotion deliberately refuses an almost exact reversal so a fish\n  // sweeps through a graceful arc instead of pivoting. The final plant\n  // investigation retreat is authored punctuation, though: a tank-sized loop\n  // reads as wandering and can hit the bounded visit timeout. The activity\n  // cursor lives on the fish and therefore survives target shaping, so use that\n  // narrow production state to let only this final beat turn directly.\n  const deliberatePlantRetreat = fish.activity?.current === "plant-investigate"\n    && (fish.activity?.plantVisitStage ?? 0) >= 2;\n  const turnTarget = deliberatePlantRetreat\n    ? desiredDirection\n    : turnableDirection(currentDirection, desiredDirection, fish.seed);`;
if (text.indexOf(before) < 0) throw new Error("Phase 7.5 turn source not found");
if (text.indexOf(before, text.indexOf(before) + before.length) >= 0) throw new Error("Phase 7.5 turn source not unique");
text = text.replace(before, after);
await writeFile(path, text);
await rm("tools/phase7-5-turn-fix.mjs", { force: true });
