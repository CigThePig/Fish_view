import { readFile, writeFile, rm } from "node:fs/promises";

const path = "src/sim/fish-activities.js";
let text = await readFile(path, "utf8");
const before = `  const retreat = departureColumns(fish, tuning.retreatColumns);\n  const vertical = sampleSigned(pairSeed, 8159) * tuning.retreatRows;\n  return {\n    ...boundedPlantPoint(fish, state, base.x + side * retreat, base.y + vertical),`;
const after = `  const retreat = departureColumns(fish, tuning.retreatColumns);\n  // A departure directly behind the fish asks the shared graceful-turn controller\n  // for an almost exact reversal. That is correct for cruising, but here it can\n  // turn a three-beat inspection into a giant loop around the plant. Give every\n  // retreat a small deterministic vertical lane so the fish visibly peels away\n  // on the same side instead of crossing the stems or circling the tank.\n  const verticalSample = sampleSigned(pairSeed, 8159);\n  const verticalSign = verticalSample < 0 ? -1 : 1;\n  const vertical = verticalSign * (0.72 + Math.abs(verticalSample) * tuning.retreatRows);\n  return {\n    ...boundedPlantPoint(fish, state, base.x + side * retreat, base.y + vertical),`;
if (text.indexOf(before) < 0) throw new Error("Phase 7.5 retreat geometry source not found");
if (text.indexOf(before, text.indexOf(before) + before.length) >= 0) throw new Error("Phase 7.5 retreat geometry source not unique");
text = text.replace(before, after);
await writeFile(path, text);
await rm("tools/phase7-5-geometry-fix.mjs", { force: true });
