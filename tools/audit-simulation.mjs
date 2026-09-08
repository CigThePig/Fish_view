// Production ticks, without a renderer or a developer activity override. All
// failures retain their seed, frame and fish before/after for deterministic replay.
import { auditOptions, importFrom, writeAudit } from "./audit-options.mjs";

const options = auditOptions({ root: ".", seeds: "5,29,83,147,192,818,1234,1369948382",
  seconds: 600, dt: 0.1, timeScale: 1, days: 0, tuning: "defaults", output: ".audit-output" });
if (!["defaults", "extremes"].includes(options.tuning)) throw new Error("--tuning must be defaults or extremes");
const { createAquariumState, applyTouch } = await importFrom(options.root, "src/sim/state.js");
const { advanceAquariumHistory } = await importFrom(options.root, "src/sim/aquarium-history.js");
const { tick } = await importFrom(options.root, "src/sim/tick.js");
const { MAX_FISH_PITCH_DEGREES } = await importFrom(options.root, "src/sim/fish-motion.js");
const { SETTING_LIMITS } = await importFrom(options.root, "src/sim/config.js");
const report = { options, ticks: 0, fishSamples: 0, failures: 0, examples: [], runs: [] };

for (const orientation of ["landscape", "portrait"]) for (const seed of options.seeds) {
  const settings = { timeScale: options.timeScale };
  if (options.tuning === "extremes") {
    for (const [index, [key, limits]] of Object.entries(SETTING_LIMITS).entries()) {
      if (key !== "timeScale") settings[key] = limits[(seed >>> index) & 1];
    }
  }
  let state = advanceAquariumHistory(createAquariumState({ orientation, seed, settings }), options.days);
  const run = { orientation, seed, entries: {}, contacts: 0, exits: 0,
    maxVerticalStep: 0, maxSwimmingStep: 0, maxUnexplainedStep: 0, maxExitStep: 0 };
  for (let frame = 0; frame < Math.ceil(options.seconds / options.dt); frame++) {
    // Reactions interrupt whatever activity is in progress; this is deliberately
    // sparse so ordinary activity selection still receives long uninterrupted runs.
    if (frame && frame % Math.max(1, Math.round(137 / options.dt)) === 0) {
      state = applyTouch(state, state.cols * 0.7, state.rows * 0.65);
    }
    const previous = state;
    state = tick(state, options.dt);
    report.ticks++;
    const fishSeeds = new Set(state.individuals.map((fish) => fish.seed));
    const plantSeeds = new Set(state.plants.map((plant) => plant.seed));
    const fail = (message, index = null) => {
      report.failures++;
      if (report.examples.length < 20) report.examples.push({ orientation, seed, frame, index, message,
        before: index === null ? null : previous.individuals[index],
        after: index === null ? null : state.individuals[index] });
    };
    if (fishSeeds.size !== state.individuals.length || fishSeeds.size > 8) fail("invalid cast identity/count");
    if (plantSeeds.size !== state.plants.length || plantSeeds.size > (orientation === "portrait" ? 22 : 30)) fail("invalid plant identity/count");
    for (const fish of state.school) {
      if (![fish.x, fish.y, fish.vx, fish.vy].every(Number.isFinite)) fail("non-finite school motion");
    }
    for (const [index, fish] of state.individuals.entries()) {
      report.fishSamples++;
      const before = previous.individuals.find((other) => other.seed === fish.seed);
      const finite = [fish.x, fish.y, fish.vx, fish.vy, fish.ageDays, fish.visual.pitch,
        fish.visual.targetPitch, fish.visual.turnProgress, ...Object.values(fish.drives)];
      if (!finite.every(Number.isFinite)) fail("non-finite fish state", index);
      if (fish.x < 0 || fish.x > state.cols || fish.y < 0 || fish.y > state.rows) fail("fish centre left the tank", index);
      if (Math.hypot(fish.vx, fish.vy) > 2.5) fail("unbounded swimming speed", index);
      if (Math.abs(fish.visual.pitch) > MAX_FISH_PITCH_DEGREES + 1e-8
        || fish.visual.turnProgress < 0 || fish.visual.turnProgress > 1) fail("invalid pose", index);
      const activity = fish.activity;
      if (activity.targetType === "fish"
        && (activity.targetId === fish.seed || !fishSeeds.has(activity.targetId))) fail("invalid fish target", index);
      if (activity.targetType === "plant" && !plantSeeds.has(activity.targetId)) fail("invalid plant target", index);
      if (!before) continue;
      if (before.activity.current !== activity.current) {
        run.entries[activity.current] = (run.entries[activity.current] ?? 0) + 1;
      }
      if (Number.isSafeInteger(activity.contactSeed) && activity.contactSeed !== before.activity.contactSeed) run.contacts++;
      const step = Math.abs(fish.y - before.y);
      // A peck is an authored pose offset. Removing it measures locomotion
      // independently, instead of misclassifying every intentional bite as a snap.
      const swimmingStep = fish.y - (fish.forageDip ?? 0) - before.y + (before.forageDip ?? 0);
      const residual = Math.abs(swimmingStep - fish.vy * options.dt);
      run.maxVerticalStep = Math.max(run.maxVerticalStep, step);
      run.maxSwimmingStep = Math.max(run.maxSwimmingStep, Math.abs(swimmingStep));
      // Baselines predating the explicit offset can still measure exits, but
      // cannot distinguish active pecks from locomotion numerically.
      if ("forageDip" in fish || activity.current !== "substrate-search") {
        run.maxUnexplainedStep = Math.max(run.maxUnexplainedStep, residual);
        if (residual > 0.25) fail("vertical displacement unexplained by velocity/strike", index);
      }
      if (before.activity.current === "substrate-search" && activity.current !== "substrate-search") {
        run.exits++;
        run.maxExitStep = Math.max(run.maxExitStep, step);
      }
    }
  }
  report.runs.push(run);
  console.log(JSON.stringify(run));
}
await writeAudit(options.output, "simulation", report);
console.log(`${report.ticks} ticks, ${report.fishSamples} fish samples, ${report.failures} failures`);
if (report.failures) process.exitCode = 1;
