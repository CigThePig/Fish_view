import { readFile, writeFile } from "node:fs/promises";

const path = "src/sim/fish-activities.js";
let text = await readFile(path, "utf8");
const swaps = [
  [
    'point(primary, entrySide, verticalSign * 0.66, clearance, { stage: 0, name: "entry-primary" })',
    'point(primary, entrySide, verticalSign > 0 ? -0.35 : -1.35, clearance, { stage: 0, name: "entry-primary" })',
  ],
  [
    'point(primary, travelSide, verticalSign * -0.58, clearance, { stage: 1, name: "cross-primary" })',
    'point(primary, travelSide, verticalSign > 0 ? -1.45 : -0.25, clearance, { stage: 1, name: "cross-primary" })',
  ],
  [
    'point(secondary, -travelSide, verticalSign * -0.14, clearance, { stage: 2, name: "thread-gap" })',
    'point(secondary, -travelSide, verticalSign > 0 ? -0.62 : -1.08, clearance, { stage: 2, name: "thread-gap" })',
  ],
  [
    'point(secondary, travelSide, verticalSign * 0.74, clearance, { stage: 3, name: "cross-secondary" })',
    'point(secondary, travelSide, verticalSign > 0 ? -1.58 : -0.32, clearance, { stage: 3, name: "cross-secondary" })',
  ],
  [
    '        verticalSign * 0.08,\n        clearance + WEAVE_EMERGE_EXTRA_COLUMNS,\n        { stage: 4, name: "emerge" },',
    '        -0.82,\n        clearance + WEAVE_EMERGE_EXTRA_COLUMNS,\n        { stage: 4, name: "emerge" },',
  ],
  [
    'point(primary, travelSide, verticalSign * 0.72, clearance, { stage: 3, name: "cross-again" })',
    'point(primary, travelSide, verticalSign > 0 ? -1.58 : -0.32, clearance, { stage: 3, name: "cross-again" })',
  ],
  [
    'point(primary, entrySide, verticalSign * -0.12, clearance, { stage: 2, name: "cross-back" })',
    'point(primary, entrySide, verticalSign > 0 ? -0.62 : -1.08, clearance, { stage: 2, name: "cross-back" })',
  ],
];

for (const [before, after] of swaps) {
  if (!text.includes(before)) throw new Error(`missing route fragment: ${before.slice(0, 72)}`);
  text = text.replace(before, after);
}
await writeFile(path, text);
console.log("Phase 7.4 route geometry correction applied.");
