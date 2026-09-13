import { readFile, writeFile, rm } from "node:fs/promises";

const path = "src/sim/fish-choreography.js";
let text = await readFile(path, "utf8");
const before = `  const turnEase = 1 - Math.exp(-delta * turningResponse);\n  const turnTarget = turnableDirection(currentDirection, desiredDirection, fish.seed);\n  const steeredDirection = safeNormalize(\n    currentDirection.x + (turnTarget.x - currentDirection.x) * turnEase,\n    currentDirection.y + (turnTarget.y - currentDirection.y) * turnEase,\n    turnTarget.x,\n    turnTarget.y,\n  );`;
const after = `  const turnEase = 1 - Math.exp(-delta * turningResponse);\n  // The final investigation beat is a deliberate back-away from the specimen,\n  // not ordinary roaming. Near the substrate, a graceful 180-degree steering\n  // arc can lose its vertical component to body/terrain clearance every frame;\n  // the fish then keeps travelling the wrong way until a wall finally turns it.\n  // The target already marks this one bounded beat explicitly, so let its motion\n  // heading commit to the authored retreat immediately while the existing\n  // acceleration and visual turn pose still soften the departure. No other\n  // activity, including plant weave and shelter, changes steering semantics.\n  const deliberatePlantRetreat = target?.plantTarget === true\n    && target?.plantVisitFinal === true\n    && target?.choreographyPhase === "retreat";\n  const turnTarget = turnableDirection(currentDirection, desiredDirection, fish.seed);\n  const steeredDirection = deliberatePlantRetreat\n    ? desiredDirection\n    : safeNormalize(\n      currentDirection.x + (turnTarget.x - currentDirection.x) * turnEase,\n      currentDirection.y + (turnTarget.y - currentDirection.y) * turnEase,\n      turnTarget.x,\n      turnTarget.y,\n    );`;
if (text.indexOf(before) < 0) throw new Error("Phase 7.5 turn block not found");
if (text.indexOf(before, text.indexOf(before) + before.length) >= 0) throw new Error("Phase 7.5 turn block not unique");
text = text.replace(before, after);
await writeFile(path, text);
await rm("tools/phase7-5-turn-fix.mjs", { force: true });
