// Reproducible malformed JSON saves. Rendering is part of the oracle: a value
// that restores without throwing can still poison geometry on its first frame.
import { auditOptions, writeAudit } from "./audit-options.mjs";
import { createAquariumState, restorePersistentState, serializePersistentState } from "../src/sim/state.js";
import { MAX_INDIVIDUALS } from "../src/sim/config.js";
import { ROSTER_COMPLETE_DAY, advanceAquariumHistory } from "../src/sim/aquarium-history.js";
import { tick } from "../src/sim/tick.js";
import { render } from "../src/render/render.js";

const options = auditOptions({ cases: 1000, output: ".audit-output" });
let randomState = 0x51a7c0de;
function random(length) {
  randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
  return Math.floor(randomState / 0x100000000 * length);
}
const values = [null, false, "bad", [], {}, -1e300, 1e308, -1, 0, 0.5];
const fishFields = ["seed", "ageDays", "x", "y", "vx", "vy", "phase", "drives", "history", "behavior", "visual", "shape"];
const plantFields = ["seed", "speciesId", "ageDays", "x", "matureHeight", "phase", "secondaryPhase", "frequency", "sway", "lean"];
const report = { options, generatorSeed: randomState, failures: 0, examples: [] };
for (let sample = 0; sample < options.cases; sample++) {
  const seed = random(0x100000000);
  const orientation = sample % 2 ? "portrait" : "landscape";
  // A stocked aquarium, so the fuzzing has a full roster to damage: a new tank
  // holds one fish and a save written from it corrupts in far fewer ways.
  const base = advanceAquariumHistory(
    createAquariumState({ seed, orientation }),
    ROSTER_COMPLETE_DAY + 200,
  );
  const saved = serializePersistentState(base);
  for (let mutation = 0; mutation < 1 + sample % 5; mutation++) {
    const index = random(saved.individuals.length);
    const value = structuredClone(values[random(values.length)]);
    switch (random(8)) {
      case 0: saved.individuals[index] = value; break;
      case 1:
        if (saved.individuals[index] && typeof saved.individuals[index] === "object") {
          saved.individuals[index][fishFields[random(fishFields.length)]] = value;
        }
        break;
      case 2: saved.settings[Object.keys(saved.settings)[random(Object.keys(saved.settings).length)]] = value; break;
      case 3: saved.plants[random(saved.plants.length)][plantFields[random(plantFields.length)]] = value; break;
      case 4: saved.plants[random(saved.plants.length)].speciesId = ["constructor", "__proto__", "toString"][random(3)]; break;
      case 5: saved.individuals[index] = saved.individuals[(index + 1) % saved.individuals.length]; break;
      case 6: saved[["totalDays", "elapsedSimSeconds", "timeOfDayHours", "content"][random(4)]] = value; break;
      case 7: saved.persistenceVersion = sample % 3 ? 2 : 1; break;
    }
  }
  // Only JSON-representable corruption can actually arrive from localStorage.
  const json = JSON.stringify(saved);
  try {
    let state = restorePersistentState(base, JSON.parse(json));
    const identities = new Set(state.individuals.map((fish) => fish.seed));
    if (identities.size !== state.individuals.length
      || identities.size < 1
      || identities.size > MAX_INDIVIDUALS) throw new Error("invalid restored identities");
    if (new Set(state.plants.map((plant) => plant.seed)).size !== state.plants.length) throw new Error("duplicate restored plants");
    for (let frame = 0; frame < 3; frame++) {
      state = tick(state, 0.1);
      const scene = render(state);
      for (const object of scene.objects) {
        if (!Object.values(object.bounds).every(Number.isFinite)) throw new Error(`invalid bounds: ${object.id}`);
      }
      for (const glyph of scene.glyphs) {
        if (![glyph.x, glyph.y, glyph.scaleX, glyph.scaleY].every(Number.isFinite)) throw new Error("invalid glyph geometry");
      }
    }
  } catch (error) {
    report.failures++;
    if (report.examples.length < 12) report.examples.push({ sample, seed, orientation, error: String(error), saved: JSON.parse(json) });
  }
}
await writeAudit(options.output, "persistence", report);
console.log(`${options.cases} malformed saves, ${report.failures} failures`);
if (report.failures) process.exitCode = 1;
