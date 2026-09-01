import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(process.argv[2] ?? ".");
const stamp = Date.now();
const url = (relative) => pathToFileURL(path.join(root, relative)).href + `?readability=${stamp}`;
const {
  SHOWCASE_SCENARIOS,
  createShowcaseState,
  showcaseSubjects,
  showcaseTarget,
  tickShowcase,
} = await import(url("src/dev/behavior-showcase.js"));
const { createBubbleWorldRecords } = await import(url("src/sim/bubbles.js"));
const { chaseEvasionForFish } = await import(url("src/sim/fish-choreography.js"));
const { forageActivity } = await import(url("src/sim/fish-motion.js"));
const { createAquariumState } = await import(url("src/sim/state.js"));
const { tick } = await import(url("src/sim/tick.js"));
const { render } = await import(url("src/render/render.js"));
const { calculateDamage } = await import(url("src/render/damage.js"));

const STEP_SECONDS = 0.1;

function angleDifference(left, right) {
  let difference = right - left;
  while (difference > Math.PI) difference -= Math.PI * 2;
  while (difference < -Math.PI) difference += Math.PI * 2;
  return difference;
}

function finiteMean(total, count) {
  return count ? total / count : null;
}

function measure(orientation, scenario) {
  let state = createShowcaseState({ orientation, scenario: scenario.id });
  let previousScene = render(state);
  let lead = showcaseSubjects(state, scenario.id)[0];
  const startY = lead.fish.y;
  let previousY = lead.fish.y;
  let previousAngle = Math.atan2(lead.fish.vy, lead.fish.vx);
  let previousPeck = false;
  let speedTotal = 0;
  let peakSpeed = 0;
  let pitchTotal = 0;
  let peakPitch = 0;
  let verticalTravel = 0;
  let turnRadians = 0;
  let pairSpacingTotal = 0;
  let pairSpacingSamples = 0;
  let minimumBubbleDistance = Number.POSITIVE_INFINITY;
  let peckStarts = 0;
  let evasionFrames = 0;
  let damageTotal = 0;
  let maximumDamage = 0;
  let fullFrames = 0;
  let elapsedMilliseconds = 0;
  const phases = new Set();
  const frameCount = Math.round(scenario.loopSeconds / STEP_SECONDS);

  for (let frame = 0; frame < frameCount; frame += 1) {
    const started = performance.now();
    state = tickShowcase(state, STEP_SECONDS, scenario.id);
    const nextScene = render(state);
    elapsedMilliseconds += performance.now() - started;
    const damage = calculateDamage(previousScene, nextScene);
    const damageFraction = damage.area / damage.total;
    damageTotal += damageFraction;
    maximumDamage = Math.max(maximumDamage, damageFraction);
    if (damage.full) fullFrames += 1;
    previousScene = nextScene;

    const subjects = showcaseSubjects(state, scenario.id);
    lead = subjects[0];
    const fish = lead.fish;
    const speed = Math.hypot(fish.vx, fish.vy);
    const pitch = Math.abs(fish.visual?.pitch ?? 0);
    const angle = speed > 0.01 ? Math.atan2(fish.vy, fish.vx) : previousAngle;
    speedTotal += speed;
    peakSpeed = Math.max(peakSpeed, speed);
    pitchTotal += pitch;
    peakPitch = Math.max(peakPitch, pitch);
    verticalTravel += Math.abs(fish.y - previousY);
    turnRadians += Math.abs(angleDifference(previousAngle, angle));
    previousY = fish.y;
    previousAngle = angle;

    const target = showcaseTarget(state, scenario.id);
    if (target?.choreographyPhase) phases.add(target.choreographyPhase);

    if (subjects.length > 1) {
      pairSpacingTotal += Math.hypot(
        subjects[0].fish.x - subjects[1].fish.x,
        subjects[0].fish.y - subjects[1].fish.y,
      );
      pairSpacingSamples += 1;
    }

    if (scenario.id === "bubble-investigate") {
      const bubble = createBubbleWorldRecords(state)
        .find((record) => record.id === fish.activity?.targetId);
      if (bubble) {
        minimumBubbleDistance = Math.min(
          minimumBubbleDistance,
          Math.hypot(fish.x - bubble.worldX, fish.y - bubble.worldY),
        );
      }
    }

    if (scenario.id === "substrate-search") {
      const forage = forageActivity(fish, lead.index, state);
      const peck = Boolean(forage.peck);
      if (peck && !previousPeck) peckStarts += 1;
      previousPeck = peck;
    }

    if (scenario.id === "playful-chase" && subjects[1]) {
      if (chaseEvasionForFish(subjects[1].fish, state)) evasionFrames += 1;
    }
  }

  return {
    orientation,
    activity: scenario.id,
    phases: [...phases].join(","),
    averageSpeed: finiteMean(speedTotal, frameCount),
    peakSpeed,
    averageAbsPitch: finiteMean(pitchTotal, frameCount),
    peakAbsPitch: peakPitch,
    verticalTravel,
    netVerticalDisplacement: lead.fish.y - startY,
    turnRateDegreesPerSecond: turnRadians * 180 / Math.PI / (frameCount * STEP_SECONDS),
    averagePairSpacing: finiteMean(pairSpacingTotal, pairSpacingSamples),
    minimumBubbleDistance: Number.isFinite(minimumBubbleDistance) ? minimumBubbleDistance : null,
    peckStarts,
    evasionFrames,
    averageDamagePercent: finiteMean(damageTotal, frameCount) * 100,
    maximumDamagePercent: maximumDamage * 100,
    fullFrames,
    averageTickRenderMs: finiteMean(elapsedMilliseconds, frameCount),
  };
}

const rows = [];
for (const orientation of ["landscape", "portrait"]) {
  for (const scenario of SHOWCASE_SCENARIOS) rows.push(measure(orientation, scenario));
}

console.log("orientation activity              avg/peak speed  avg/max pitch  vertical  turn/s  spacing  event             damage avg/max  full  ms");
for (const row of rows) {
  const event = row.activity === "bubble-investigate"
    ? `bubble ${row.minimumBubbleDistance?.toFixed(2) ?? "—"}`
    : row.activity === "substrate-search"
      ? `pecks ${row.peckStarts}`
      : row.activity === "playful-chase"
        ? `evade ${row.evasionFrames}`
        : row.phases;
  console.log([
    row.orientation.padEnd(11),
    row.activity.padEnd(21),
    `${row.averageSpeed.toFixed(2)}/${row.peakSpeed.toFixed(2)}`.padEnd(15),
    `${row.averageAbsPitch.toFixed(1)}/${row.peakAbsPitch.toFixed(1)}`.padEnd(14),
    row.verticalTravel.toFixed(2).padStart(8),
    row.turnRateDegreesPerSecond.toFixed(1).padStart(7),
    (row.averagePairSpacing?.toFixed(2) ?? "—").padStart(8),
    event.padEnd(17),
    `${row.averageDamagePercent.toFixed(1)}/${row.maximumDamagePercent.toFixed(1)}`.padStart(14),
    String(row.fullFrames).padStart(5),
    row.averageTickRenderMs.toFixed(2).padStart(5),
  ].join(" "));
}

const failures = [];
for (const orientation of ["landscape", "portrait"]) {
  const sample = Object.fromEntries(rows
    .filter((row) => row.orientation === orientation)
    .map((row) => [row.activity, row]));
  if (!(sample["bubble-investigate"].peakSpeed > sample.cruise.peakSpeed * 1.7)) {
    failures.push(`${orientation}: bubble peak speed is not distinct from cruise`);
  }
  if (!(sample["bubble-investigate"].peakAbsPitch > sample.cruise.peakAbsPitch + 15)) {
    failures.push(`${orientation}: bubble pitch is not distinct from cruise`);
  }
  if (!(sample["playful-chase"].peakSpeed > sample["individual-follow"].peakSpeed * 1.15)) {
    failures.push(`${orientation}: chase is not distinctly faster than individual follow`);
  }
  if (sample["playful-chase"].evasionFrames < 3) {
    failures.push(`${orientation}: chased fish did not sustain an evasive response`);
  }
  if (!(sample["open-water-rest"].averageSpeed < sample.cruise.averageSpeed * 0.55)) {
    failures.push(`${orientation}: rest is not distinctly slower than cruise`);
  }
  if (sample["substrate-search"].peckStarts < 1
    || sample["substrate-search"].peakAbsPitch < 18) {
    failures.push(`${orientation}: substrate sequence did not reach a readable peck`);
  }
  if (rows.some((row) => row.orientation === orientation && row.fullFrames > 0)) {
    failures.push(`${orientation}: at least one choreography requested a full redraw`);
  }
}

function ordinaryWatch(orientation) {
  let state = createAquariumState({ orientation, seed: 0xa51c0a7e, wallClockHours: 12 });
  const previousActivities = new Map(state.individuals.map((fish) => [fish.seed, fish.activity.current]));
  const previousPecks = new Map();
  const entries = {};
  let peckStarts = 0;
  for (let frame = 0; frame < 6000; frame += 1) {
    state = tick(state, STEP_SECONDS);
    state.individuals.forEach((fish, index) => {
      const prior = previousActivities.get(fish.seed);
      if (fish.activity.current !== prior) {
        entries[fish.activity.current] = (entries[fish.activity.current] ?? 0) + 1;
        previousActivities.set(fish.seed, fish.activity.current);
      }
      const forage = forageActivity(fish, index, state);
      const peck = Boolean(forage.peck);
      if (peck && !previousPecks.get(fish.seed)) peckStarts += 1;
      previousPecks.set(fish.seed, peck);
    });
  }
  return { orientation, entries, peckStarts };
}

console.log("\nOrdinary deterministic 10-minute watch");
for (const watch of [ordinaryWatch("landscape"), ordinaryWatch("portrait")]) {
  const ordered = Object.entries(watch.entries)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([activity, count]) => `${activity}:${count}`)
    .join(" ");
  console.log(`${watch.orientation.padEnd(11)} ${ordered} pecks:${watch.peckStarts}`);
  const count = (activity) => watch.entries[activity] ?? 0;
  if (count("bubble-investigate") < 1) failures.push(`${watch.orientation}: ordinary watch had no bubble pursuit`);
  if (count("substrate-search") < 1 || watch.peckStarts < 1) failures.push(`${watch.orientation}: ordinary watch had no visible feeding`);
  if (count("playful-chase") < 1) failures.push(`${watch.orientation}: ordinary watch had no playful chase`);
  if (count("companion-cruise") + count("individual-follow") + count("school-follow") < 1) {
    failures.push(`${watch.orientation}: ordinary watch had no calm social activity`);
  }
  if (count("plant-investigate") + count("plant-weave") < 1) {
    failures.push(`${watch.orientation}: ordinary watch had no plant investigation`);
  }
  if (count("open-water-rest") + count("plant-shelter") < 1) {
    failures.push(`${watch.orientation}: ordinary watch had no rest activity`);
  }
}

if (failures.length) {
  console.error("\nReadability regression(s):");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
}
