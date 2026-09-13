import { readFile, writeFile, rm } from "node:fs/promises";

const path = "src/sim/fish-choreography.js";
let text = await readFile(path, "utf8");
const before = `  const turnTarget = turnableDirection(currentDirection, desiredDirection, fish.seed);`;
const after = `  // Ordinary locomotion deliberately refuses an almost exact reversal so a fish\n  // sweeps through a graceful arc instead of pivoting. Plant investigation's\n  // final retreat is authored punctuation, though: a wide tank-sized loop reads\n  // as wandering and can hit the bounded visit timeout. Let this one local\n  // departure turn toward its already-authored target directly. No state is\n  // added, and every other activity keeps the shared graceful reversal rule.\n  const deliberatePlantRetreat = target?.plantTarget\n    && target?.plantVisitFinal\n    && target?.choreographyPhase === "retreat";\n  const turnTarget = deliberatePlantRetreat\n    ? desiredDirection\n    : turnableDirection(currentDirection, desiredDirection, fish.seed);`;
if (text.indexOf(before) < 0) throw new Error("Phase 7.5 turn source not found");
if (text.indexOf(before, text.indexOf(before) + before.length) >= 0) throw new Error("Phase 7.5 turn source not unique");
text = text.replace(before, after);
await writeFile(path, text);
await rm("tools/phase7-5-turn-fix.mjs", { force: true });
