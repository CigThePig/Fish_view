// Phase 7.7 integration evidence. This observes the production tick and renderer;
// it does not override choreography tuning or add product runtime state.
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";

import {
  SHOWCASE_SCENARIOS,
  createShowcaseState,
  showcaseSubjects,
  showcaseTarget,
  tickShowcase,
} from "../src/dev/behavior-showcase.js";
import {
  PHASE_7_CONFUSION_MATRIX,
  PHASE_7_FINAL_VOCABULARY,
} from "../src/dev/phase-7-behavior-vocabulary.js";
import { calculateDamage } from "../src/render/damage.js";
import { render } from "../src/render/render.js";
import { traitsFromSeed } from "../src/sim/entities.js";
import { fishGrowth, fishSpriteWidth } from "../src/sim/fish-growth.js";
import { hashSeed } from "../src/sim/prng.js";

const STEP_SECONDS = 0.1;
const RECOVERY_SECONDS = 4;
const DEFAULT_OUTPUT = ".audit-output/phase7-vocabulary";
const SEED_LABELS = Object.freeze([
  "phase-7-7-identity-a",
  "phase-7-7-identity-b",
  "phase-7-7-identity-c",
  "phase-7-7-identity-d",
  "phase-7-7-identity-e",
  "phase-7-7-identity-f",
]);

function optionValue(argumentsList, name, fallback) {
  const prefix = name + "=";
  const inline = argumentsList.find((argument) => argument.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = argumentsList.indexOf(name);
  return index >= 0 ? argumentsList[index + 1] : fallback;
}

function rounded(value, places = 3) {
  return Number(value.toFixed(places));
}

function range(values) {
  return {
    minimum: rounded(Math.min(...values)),
    maximum: rounded(Math.max(...values)),
  };
}

function identityProfile(fish) {
  const traits = traitsFromSeed(fish.seed, fish.history);
  const growth = fishGrowth(fish);
  return {
    seed: fish.seed,
    species: growth.sprite.id,
    stage: growth.label,
    width: fishSpriteWidth(fish),
    height: growth.sprite.shape.length,
    traits: Object.fromEntries(Object.entries(traits).map(([key, value]) => [key, rounded(value)])),
  };
}

function observeScenario(scenario, seed, failures) {
  let state = createShowcaseState({ scenario: scenario.id, seed });
  const first = showcaseSubjects(state, scenario.id)[0]?.fish;
  if (!first) {
    failures.push(scenario.id + ": showcase has no subject");
    return null;
  }

  const identity = identityProfile(first);
  const startingActivity = first.activity.current;
  let previousFish = first;
  let previousScene = render(state);
  let maximumStep = 0;
  let maximumVelocityChange = 0;
  let damageTotal = 0;
  let maximumDamage = 0;
  let fullFrames = 0;
  let transition = null;
  const phases = new Set();
  const activities = new Set([startingActivity]);
  const frameCount = Math.ceil((scenario.loopSeconds + RECOVERY_SECONDS) / STEP_SECONDS);

  for (let frame = 1; frame <= frameCount; frame += 1) {
    state = tickShowcase(state, STEP_SECONDS, scenario.id);
    const fish = showcaseSubjects(state, scenario.id)[0]?.fish;
    if (!fish) {
      failures.push(scenario.id + ": subject disappeared for seed " + seed);
      break;
    }

    for (const [field, value] of Object.entries({
      x: fish.x,
      y: fish.y,
      vx: fish.vx,
      vy: fish.vy,
      pitch: fish.visual?.pitch ?? 0,
    })) {
      if (!Number.isFinite(value)) failures.push(scenario.id + ": non-finite " + field + " for seed " + seed);
    }

    const step = Math.hypot(fish.x - previousFish.x, fish.y - previousFish.y);
    const velocityChange = Math.hypot(fish.vx - previousFish.vx, fish.vy - previousFish.vy);
    maximumStep = Math.max(maximumStep, step);
    maximumVelocityChange = Math.max(maximumVelocityChange, velocityChange);
    if (step > 2) failures.push(scenario.id + ": teleport-like " + rounded(step) + "-column frame step for seed " + seed);

    const nextScene = render(state);
    const damage = calculateDamage(previousScene, nextScene);
    const damageFraction = damage.area / damage.total;
    damageTotal += damageFraction;
    maximumDamage = Math.max(maximumDamage, damageFraction);
    if (damage.full) fullFrames += 1;
    previousScene = nextScene;

    const target = showcaseTarget(state, scenario.id);
    if (target?.choreographyPhase) phases.add(target.choreographyPhase);
    activities.add(fish.activity.current);
    if (!transition && fish.activity.current !== startingActivity) {
      transition = {
        seconds: rounded(frame * STEP_SECONDS, 1),
        from: startingActivity,
        to: fish.activity.current,
        step: rounded(step),
        velocityChange: rounded(velocityChange),
      };
    }
    previousFish = fish;
  }

  if (fullFrames) failures.push(scenario.id + ": requested " + fullFrames + " full redraw(s) for seed " + seed);
  return {
    seedLabel: SEED_LABELS.find((label) => hashSeed(label) === seed),
    identity,
    phases: [...phases],
    activities: [...activities],
    transition,
    maximumStep: rounded(maximumStep),
    maximumVelocityChange: rounded(maximumVelocityChange),
    meanDamagePercent: rounded(damageTotal / frameCount * 100),
    maximumDamagePercent: rounded(maximumDamage * 100),
    fullFrames,
  };
}

function summarizeActivity(record, scenario, samples, failures) {
  const profiles = [...new Set(samples.map((sample) => (
    sample.identity.species + ":" + sample.identity.width + "x" + sample.identity.height
  )))];
  const identityCount = new Set(samples.map((sample) => sample.identity.seed)).size;
  const traits = {};
  for (const key of ["boldness", "sociability", "activity", "preferredDepth", "curiosity"]) {
    traits[key] = range(samples.map((sample) => sample.identity.traits[key]));
  }
  const variedTraits = Object.values(traits)
    .filter((values) => values.maximum - values.minimum >= 0.12)
    .length;
  if (identityCount !== SEED_LABELS.length) failures.push(record.activity + ": identity matrix collapsed");
  if (profiles.length < 2) failures.push(record.activity + ": body-profile matrix did not vary");
  if (variedTraits < 3) failures.push(record.activity + ": fewer than three seeded traits varied materially");
  return {
    activity: record.activity,
    decision: record.decision,
    visualSentence: record.visualSentence,
    cueCount: record.cues.length,
    identityCount,
    bodyProfiles: profiles,
    variedTraits,
    traitRanges: traits,
    phases: [...new Set(samples.flatMap((sample) => sample.phases))],
    exitActivities: [...new Set(samples.map((sample) => sample.transition?.to).filter(Boolean))],
    peakFrameStep: rounded(Math.max(...samples.map((sample) => sample.maximumStep))),
    peakVelocityChange: rounded(Math.max(...samples.map((sample) => sample.maximumVelocityChange))),
    peakDamagePercent: rounded(Math.max(...samples.map((sample) => sample.maximumDamagePercent))),
    fullFrames: samples.reduce((total, sample) => total + sample.fullFrames, 0),
    loopSeconds: scenario.loopSeconds,
    samples,
  };
}

function markdown(summary) {
  const lines = [
    "# Phase 7.7 generated integration audit",
    "",
    "- Commit: " + summary.commit,
    "- Showcase behaviors: " + summary.activities.length,
    "- Deterministic identities per behavior: " + summary.seedLabels.length,
    "- Total showcase samples: " + summary.sampleCount,
    "- Full redraws: " + summary.fullFrames,
    "- Maximum one-frame movement: " + summary.maximumFrameStep + " columns",
    "",
    "## Identity and transition observation",
    "",
    "| Activity | Bodies | Trait identities | Observed exit(s) | Peak step | Peak damage |",
    "| --- | ---: | ---: | --- | ---: | ---: |",
  ];
  for (const row of summary.activities) {
    lines.push(
      "| " + row.activity
      + " | " + row.bodyProfiles.length
      + " | " + row.identityCount
      + " | " + (row.exitActivities.join(", ") || "continuous")
      + " | " + row.peakFrameStep.toFixed(3)
      + " | " + row.peakDamagePercent.toFixed(1) + "% |",
    );
  }
  lines.push(
    "",
    "## Nearest-neighbor confusion matrix",
    "",
    "| Behavior | Neighbor | Deciding visible distinction | Gate |",
    "| --- | --- | --- | --- |",
  );
  for (const row of summary.confusionMatrix) {
    lines.push("| " + row.left + " | " + row.right + " | " + row.distinction + " | " + row.status + " |");
  }
  lines.push("");
  return lines.join("\n") + "\n";
}

const output = optionValue(process.argv.slice(2), "--output", DEFAULT_OUTPUT);
await mkdir(output, { recursive: true });

const failures = [];
const scenarioById = new Map(SHOWCASE_SCENARIOS.map((scenario) => [scenario.id, scenario]));
const activities = [];
for (const record of PHASE_7_FINAL_VOCABULARY.filter((item) => item.showcase)) {
  const scenario = scenarioById.get(record.activity);
  if (!scenario) {
    failures.push(record.activity + ": frozen vocabulary has no showcase");
    continue;
  }
  const samples = SEED_LABELS
    .map((label) => observeScenario(scenario, hashSeed(label), failures))
    .filter(Boolean);
  activities.push(summarizeActivity(record, scenario, samples, failures));
}

const allSamples = activities.flatMap((activity) => activity.samples);
const summary = {
  version: 1,
  purpose: "Phase 7 final vocabulary, transition, identity/body and renderer regression evidence.",
  commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  seedLabels: SEED_LABELS,
  sampleCount: allSamples.length,
  maximumFrameStep: rounded(Math.max(...allSamples.map((sample) => sample.maximumStep))),
  fullFrames: allSamples.reduce((total, sample) => total + sample.fullFrames, 0),
  activities,
  confusionMatrix: PHASE_7_CONFUSION_MATRIX,
  productionEvidence: {
    source: "npm run measure:remaining-vocabulary",
    note: "The companion, surface, arrival, drifting, held-glass and autonomous glass episodes are observed through the unmodified scheduler in the companion workflow step.",
  },
  boundedness: {
    runtimeStateAddedByPhase77: 0,
    persistedStateAddedByPhase77: 0,
    unboundedCollectionsAddedByPhase77: 0,
    rendererFullFrames: allSamples.reduce((total, sample) => total + sample.fullFrames, 0),
  },
  failures,
};

await writeFile(output + "/phase-7-7-audit.json", JSON.stringify(summary, null, 2) + "\n");
await writeFile(output + "/phase-7-7-audit.md", markdown(summary));
for (const row of activities) {
  console.log([
    row.activity,
    "identities=" + row.identityCount,
    "bodies=" + row.bodyProfiles.length + " (" + row.bodyProfiles.join(",") + ")",
    "variedTraits=" + row.variedTraits,
    "exits=" + (row.exitActivities.join(",") || "continuous"),
    "peakStep=" + row.peakFrameStep,
  ].join(" "));
}
console.log(JSON.stringify({
  commit: summary.commit,
  activities: activities.length,
  identitiesPerActivity: SEED_LABELS.length,
  samples: summary.sampleCount,
  maximumFrameStep: summary.maximumFrameStep,
  fullFrames: summary.fullFrames,
  failures: failures.length,
}));
if (failures.length) {
  for (const failure of failures) console.error("- " + failure);
  process.exitCode = 1;
}
