// Replay deterministic pointer histories against the aquarium and report what
// they did to it.
//
// This is the Phase 0 instrument. It drives the production interaction path -
// `aquariumPoint`, `applyTouch`, `tick`, `render` - through the observation
// harness in src/dev/interaction-observation.js, and every scenario is run
// twice: once with the gesture and once with the aquarium left alone, so the
// numbers below are what the interaction did rather than what the evening was
// going to do anyway.
//
// The full record, including per-fish measurements, the frame timeline and the
// encoded pointer history for every scenario, is written to
// .audit-output/interaction-observation.json. The console shows the shape of
// it.
//
//   npm run observe:interaction
//   npm run observe:interaction -- --seeds=5 --scenario=chase-tap --detail=chase-tap
//   npm run observe:interaction -- --history="1:d:33:9.5 1.1:u:33:9.5" --scenario=none
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { auditOptions, importFrom, writeAudit } from "./audit-options.mjs";

const options = auditOptions({
  root: ".",
  seeds: "5,147,1234",
  scenario: "all",
  seconds: 12,
  wait: 600,
  detail: "open-water-tap",
  history: "",
  context: "stocked",
  output: ".audit-output",
  // Where to write the keepable version of this run: the same readings without
  // the per-frame timelines, and with the per-fish table only for the first
  // seed. That is the file a phase report links to.
  evidence: "",
});

const harness = await importFrom(options.root, "src/dev/interaction-observation.js");
const {
  INTERACTION_SCENARIOS,
  aquariumCache,
  createObservationAquarium,
  decodePointerHistory,
  observationContext,
  observeInteraction,
  runScenario,
} = harness;

const requested = options.scenario === "all"
  ? INTERACTION_SCENARIOS
  : options.scenario === "none"
    ? []
    : options.scenario.split(",").map((id) => {
      const scenario = INTERACTION_SCENARIOS.find((entry) => entry.id === id.trim());
      if (!scenario) throw new Error(`unknown scenario: ${id}`);
      return scenario;
    });

const report = {
  options: { ...options, seeds: options.seeds },
  scenarios: [],
  replays: [],
};

function pad(value, width, right = false) {
  const text = String(value);
  return right ? text.padStart(width) : text.padEnd(width);
}

console.log([
  pad("scenario", 22),
  pad("seed", 6, true),
  pad("ctx", 8),
  pad("in", 6, true),
  pad("strong", 7, true),
  pad("weak", 5, true),
  pad("none", 5, true),
  pad("activities", 12),
  pad("lat", 5, true),
  pad("school", 13),
  pad("env p/b/r", 10),
  pad("damage", 13, true),
  pad("rect", 6, true),
  pad("full", 5, true),
].join(" "));

for (const seed of options.seeds) {
  const baseFor = aquariumCache(seed);
  for (const scenario of requested) {
    const result = runScenario(scenario, baseFor, {
      observeSeconds: options.seconds,
      waitSeconds: Number(options.wait),
    });
    if (!result.observation) {
      console.log(`${pad(scenario.id, 22)} ${pad(seed, 6, true)} precondition not reached within ${options.wait}s`);
      report.scenarios.push({ seed, ...result });
      continue;
    }
    const { aquarium, render: renderCost, pointer, fish, moments } = result.observation;
    const latencies = fish.map((one) => one.responseLatencySeconds).filter((value) => value !== null);
    console.log([
      pad(scenario.id, 22),
      pad(seed, 6, true),
      pad(scenario.context, 8),
      pad(`${pointer.delivered}/${pointer.total}`, 6, true),
      pad(aquarium.respondingStrongly, 7, true),
      pad(aquarium.respondingWeakly, 5, true),
      pad(aquarium.unaffected, 5, true),
      pad(`${aquarium.activitiesBefore}>${aquarium.activitiesAfterInput}>${aquarium.activitiesAtEnd}`, 12),
      pad(latencies.length ? Math.min(...latencies).toFixed(1) : "—", 5, true),
      pad(`${aquarium.schoolCentroidDisplacement.toFixed(2)}/${aquarium.schoolSpreadChange.toFixed(2)}`, 13),
      pad(`${aquarium.plantsDisturbed}/${aquarium.bubblesCreated}/${aquarium.residentsAffected}`, 10),
      pad(`${renderCost.averageDamagePercent.toFixed(1)}/${renderCost.worstDamagePercent.toFixed(1)}%`, 13, true),
      pad(renderCost.averageRectangles.toFixed(1), 6, true),
      pad(renderCost.fullRedraws, 5, true),
    ].join(" "));
    report.scenarios.push({
      seed,
      id: result.id,
      label: result.label,
      describe: result.describe,
      context: result.context,
      precondition: result.precondition,
      anchor: result.anchor,
      moments,
      observation: result.observation,
    });
  }
}

// One scenario in full: the per-fish measurements the plan asks for, for the
// aquarium's whole cast, so a claim about who responded and how hard is a table
// rather than an impression.
const detail = report.scenarios.find((entry) => entry.id === options.detail && entry.observation);
if (detail) {
  console.log(`\n${detail.label} — seed ${detail.seed}, tap at ${detail.anchor.x}, ${detail.anchor.y}`
    + `${detail.precondition ? ` (during ${detail.precondition.activity}, reached after ${detail.precondition.seconds}s)` : ""}`);
  console.log([
    pad("fish", 9),
    pad("bold/curi", 10),
    pad("glass", 6, true),
    pad("start activity", 20),
    pad("after input", 14),
    pad("lat", 5, true),
    pad("start>near", 11, true),
    pad("travel", 7, true),
    pad("avg/peak", 12, true),
    pad("acc", 6, true),
    pad("pitch", 6, true),
    pad("turns", 6, true),
    pad("near", 5, true),
    pad("ending activity", 20),
    pad("outcome", 10),
  ].join(" "));
  for (const fish of detail.observation.fish) {
    console.log([
      pad(fish.id, 9),
      pad(`${fish.traits.boldness.toFixed(2)}/${fish.traits.curiosity.toFixed(2)}`, 10),
      pad(fish.glassAffinity.toFixed(2), 6, true),
      pad(fish.startActivity, 20),
      pad(fish.activityAfterInput ?? "—", 14),
      pad(fish.responseLatencySeconds ?? "—", 5, true),
      pad(`${fish.startDistance}>${fish.closestDistance}`, 11, true),
      pad(fish.distanceTravelled.toFixed(1), 7, true),
      pad(`${fish.averageSpeed.toFixed(2)}/${fish.peakSpeed.toFixed(2)}`, 12, true),
      pad(fish.peakAcceleration.toFixed(1), 6, true),
      pad(fish.peakPitch.toFixed(0), 6, true),
      pad(fish.turnCount, 6, true),
      pad(fish.secondsNearStimulus.toFixed(1), 5, true),
      pad(fish.endingActivity, 20),
      pad(fish.outcome, 10),
    ].join(" "));
  }
  console.log("moments: " + detail.moments
    .map((moment) => `${moment.moment} ${moment.seconds}s`)
    .join(" · "));
}

// Any history, replayed from its encoded form. This is the gate item made
// executable: a scenario recorded in a report months ago is one argument away
// from running again.
if (options.history) {
  const history = decodePointerHistory(options.history);
  const state = createObservationAquarium({
    seed: options.seeds[0],
    ...observationContext(options.context),
  });
  const observation = observeInteraction(state, { history, observeSeconds: options.seconds });
  report.replays.push({ seed: options.seeds[0], context: options.context, observation });
  console.log(`\nreplayed ${history.length} pointer events on the ${options.context} aquarium:`
    + ` ${observation.pointer.delivered} delivered,`
    + ` ${observation.aquarium.respondingStrongly} fish responded strongly,`
    + ` peak response at ${observation.moments.find((moment) => moment.moment === "peak-response")?.seconds ?? "—"}s`);
}

// The reading Stage 2 exists to move, kept where a later phase will look for
// it: how many different things the cast was doing before the tap, and how many
// it was doing one frame after.
const taps = report.scenarios.filter((entry) => entry.observation && entry.id === "open-water-tap");
if (taps.length) {
  console.log("\nSynchronisation after one open-water tap");
  for (const tap of taps) {
    const { aquarium } = tap.observation;
    console.log(`seed ${pad(tap.seed, 6, true)}: ${aquarium.activitiesBefore} activities before`
      + ` → ${aquarium.activitiesAfterInput} after`
      + `${aquarium.activitiesAfterInput === 1 ? "  (whole cast synchronised)" : ""}`);
  }
}

await writeAudit(options.output, "interaction-observation", report);

// The per-fish table is written as columns rather than as fifteen repeated
// objects per scenario: the same numbers, a fifth of the bytes, and a header
// that says what each one is. The evidence file is meant to be committed.
const FISH_COLUMNS = Object.freeze([
  "id", "boldness", "sociability", "activity", "preferredDepth", "curiosity",
  "glassAffinity", "touches", "startActivity", "activityAfterInput",
  "responseLatencySeconds", "startDistance", "closestDistance", "distanceTravelled",
  "averageSpeed", "peakSpeed", "peakAcceleration", "peakPitch", "turnDegrees",
  "turnCount", "secondsNearStimulus", "endingActivity", "outcome",
]);

function fishRow(fish) {
  return [
    fish.id, fish.traits.boldness, fish.traits.sociability, fish.traits.activity,
    fish.traits.preferredDepth, fish.traits.curiosity, fish.glassAffinity,
    fish.familiarity.touches, fish.startActivity, fish.activityAfterInput,
    fish.responseLatencySeconds, fish.startDistance, fish.closestDistance,
    fish.distanceTravelled, fish.averageSpeed, fish.peakSpeed, fish.peakAcceleration,
    fish.peakPitch, fish.turnDegrees, fish.turnCount, fish.secondsNearStimulus,
    fish.endingActivity, fish.outcome,
  ];
}

if (options.evidence) {
  const referenceSeed = options.seeds[0];
  const evidence = {
    generatedBy: "npm run observe:interaction",
    seeds: options.seeds,
    observeSeconds: options.seconds,
    note: "Whole-aquarium and renderer readings for every seed; the per-fish table"
      + " for the first seed, as rows under fishColumns. Frame timelines are not"
      + " kept - they are regenerated into .audit-output/interaction-observation.json.",
    fishColumns: FISH_COLUMNS,
    scenarios: report.scenarios.map((entry) => ({
      seed: entry.seed,
      id: entry.id,
      label: entry.label,
      describe: entry.describe,
      context: entry.context,
      precondition: entry.precondition,
      anchor: entry.anchor,
      pointer: entry.observation?.pointer ?? null,
      aquarium: entry.observation?.aquarium ?? null,
      render: entry.observation?.render ?? null,
      moments: entry.moments ?? null,
      fish: entry.seed === referenceSeed && entry.observation
        ? entry.observation.fish.map(fishRow)
        : undefined,
    })),
  };
  await mkdir(path.dirname(path.resolve(options.evidence)), { recursive: true });
  await writeFile(path.resolve(options.evidence), `${JSON.stringify(evidence)}\n`);
  console.log(`Evidence: ${options.evidence}`);
}
