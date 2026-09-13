import { readFile, writeFile, rm } from "node:fs/promises";

const path = "src/sim/fish-choreography.js";
let text = await readFile(path, "utf8");
const before = `  const turnTarget = turnableDirection(currentDirection, desiredDirection, fish.seed);`;
const after = `  // Ordinary locomotion deliberately refuses an almost exact reversal so a fish\n  // sweeps through a graceful arc instead of pivoting. Phase 7.5's \"retreat\"\n  // phase is unique to the final beat of plant investigation and is authored\n  // punctuation: a tank-sized loop reads as wandering and can hit the bounded\n  // visit timeout. Let that one named departure turn toward its target directly.\n  // No state is added, and every other activity keeps the shared reversal rule.\n  const deliberatePlantRetreat = target?.choreographyPhase === "retreat";\n  const turnTarget = deliberatePlantRetreat\n    ? desiredDirection\n    : turnableDirection(currentDirection, desiredDirection, fish.seed);`;
if (text.indexOf(before) < 0) throw new Error("Phase 7.5 turn source not found");
if (text.indexOf(before, text.indexOf(before) + before.length) >= 0) throw new Error("Phase 7.5 turn source not unique");
text = text.replace(before, after);
await writeFile(path, text);
await rm("tools/phase7-5-turn-fix.mjs", { force: true });
