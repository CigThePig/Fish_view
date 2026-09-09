/*
 * The product invariants Stage 2 is not allowed to spend.
 *
 * These are not behaviour tests. Each one guards a property the plan states as
 * non-negotiable and that is cheap to check mechanically, so that a change
 * which quietly gives one up fails here rather than months later on a device
 * in a child's room. Everything harder to check than this - whether a chase
 * reads as a chase, whether a familiar fish looks familiar - stays a matter of
 * looking at the aquarium, which is why the phase reports carry captures.
 */

import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { DISPLAY } from "../src/sim/config.js";
import { advanceAquariumHistory } from "../src/sim/aquarium-history.js";
import { applyTouch, createAquariumState, serializePersistentState } from "../src/sim/state.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function sourceFiles(directory) {
  const entries = await readdir(path.join(root, directory), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(relative));
    else if (entry.name.endsWith(".js")) files.push(relative);
  }
  return files;
}

// The simulation and the scene composer are the two halves that have to be
// reproducible: same state plus same input history gives the same result, on a
// desktop today and on firmware later. Wall-clock time and unseeded randomness
// are how that gets lost, so they live in src/platform and the labs instead.
test("the simulation and renderer take no unseeded randomness or wall-clock time", async () => {
  const forbidden = [/Math\.random\s*\(/, /Date\.now\s*\(/, /performance\.now\s*\(/];
  const offenders = [];
  for (const directory of ["src/sim", "src/render"]) {
    for (const file of await sourceFiles(directory)) {
      const source = await readFile(path.join(root, file), "utf8");
      // Comments are allowed to name them; the rule is about calls, and the
      // codebase explains this rule in prose where it matters.
      const code = source.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
      for (const pattern of forbidden) {
        if (pattern.test(code)) offenders.push(`${file}: ${pattern.source}`);
      }
    }
  }
  assert.deepEqual(offenders, []);
});

// One aquarium. Portrait simulation, comparison mode and orientation-specific
// world generation were removed on purpose; the world is this size and a
// smaller screen scales it.
test("the canonical aquarium is one 800 × 480 landscape world", () => {
  assert.deepEqual({ ...DISPLAY }, { cols: 66, rows: 20, pixelWidth: 800, pixelHeight: 480 });
});

// The device runs for months. The save is a record of biology and history, not
// of what the aquarium has been through, so playing with it must not make the
// save grow. Phase 6 adds a compact per-fish relationship measure and has the
// headroom between the current 17.9 KB and this ceiling to do it in.
test("a decade of aquarium and repeated interaction does not grow the save", () => {
  let state = advanceAquariumHistory(createAquariumState({ seed: 1234 }), 3650);
  for (let index = 0; index < 200; index += 1) {
    state = applyTouch(state, (index * 7) % state.cols, 4 + index % 10);
  }
  const payload = serializePersistentState(state);
  const bytes = JSON.stringify(payload).length;
  assert.ok(bytes < 24_000, `serialized save grew to ${bytes} bytes`);

  // Transient interaction state is reconstructed, never restored: a reaction,
  // stimulus or impulse that survived a reload would replay an old gesture.
  for (const key of ["reaction", "stimuli", "impulses", "interactionSequence", "pointer", "gestures"]) {
    assert.equal(key in payload, false, `${key} must not be persisted`);
  }
});

// Diagnostics belong in tools/ and the labs. Nothing in the shipped simulation
// or renderer logs per frame.
test("the application source carries no logging", async () => {
  const offenders = [];
  for (const file of await sourceFiles("src")) {
    const source = await readFile(path.join(root, file), "utf8");
    const code = source.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    if (/console\s*\./.test(code)) offenders.push(file);
  }
  assert.deepEqual(offenders, []);
});
