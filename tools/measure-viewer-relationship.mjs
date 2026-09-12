import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  advanceOffline,
  applyContact,
  applyRelease,
  applyTouch,
  createAquariumState,
  serializePersistentState,
} from "../src/sim/state.js";
import { tick } from "../src/sim/tick.js";
import { attentionStandoff } from "../src/sim/attention.js";
import {
  glassFamiliarityFor,
  relationshipResponseProfile,
  shapeAttentionForSaturation,
  withGlassFamiliarity,
} from "../src/sim/viewer-relationship.js";
import { prepareVoluntaryGlassVisits } from "../src/sim/glass-visits.js";

const OUTPUT = ".audit-output";
const EVIDENCE_LEVELS = Object.freeze([
  ["unfamiliar", 0],
  ["early", 0.2],
  ["medium", 0.5],
  ["high", 0.9],
]);
const PRODUCTION_DAYS = 180;
const PRODUCTION_MILESTONES = new Set([1, 7, 30, 60, 90, 120, 180]);
const RAPID_INTERACTIONS = 40;

function round(value, places = 4) {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

function responseRecord(role) {
  return {
    stimulusId: "phase6-evidence",
    role,
    x: 24,
    y: 10,
    distance: 8,
    ageSeconds: 0,
    durationSeconds: 1.4,
    delaySeconds: role === "delayed" ? 1.4 : 0,
    held: false,
    released: false,
    settled: false,
    holdSeconds: 0,
    nearSeconds: 0,
  };
}

function shapeRecord(fish, role) {
  const shaped = shapeAttentionForSaturation([fish], [responseRecord(role)], { guarantee: false })[0];
  return {
    role: shaped?.role ?? null,
    delaySeconds: round(shaped?.delaySeconds ?? 0),
    durationSeconds: round(shaped?.durationSeconds ?? 0),
    standoff: round(attentionStandoff(shaped)),
  };
}

function personalityRow(fish) {
  const profile = relationshipResponseProfile(fish);
  return {
    seed: fish.seed,
    boldness: round(profile.boldness),
    curiosity: round(profile.curiosity),
    glassAffinity: round(profile.glassAffinity),
    confidence: round(profile.confidence),
    attentiveness: round(profile.attentiveness),
  };
}

function chooseArchetypes(state) {
  const rows = state.individuals.map((fish) => ({ fish, profile: relationshipResponseProfile(fish) }));
  const bold = [...rows].sort((a, b) => b.profile.confidence - a.profile.confidence || a.fish.seed - b.fish.seed)[0];
  const cautious = [...rows].sort((a, b) => a.profile.confidence - b.profile.confidence || a.fish.seed - b.fish.seed)[0];
  const attentive = [...rows]
    .filter((row) => row.fish.seed !== bold.fish.seed && row.fish.seed !== cautious.fish.seed)
    .sort((a, b) => b.profile.attentiveness - a.profile.attentiveness || a.fish.seed - b.fish.seed)[0];
  return [
    ["bold", bold.fish],
    ["cautious", cautious.fish],
    ["attentive", attentive?.fish ?? bold.fish],
  ];
}

function archetypeEvidence(state) {
  return chooseArchetypes(state).map(([name, baseFish]) => ({
    name,
    personality: personalityRow(baseFish),
    levels: EVIDENCE_LEVELS.map(([label, familiarity]) => {
      const fish = withGlassFamiliarity(baseFish, familiarity);
      const profile = relationshipResponseProfile(fish);
      return {
        label,
        familiarity,
        trust: round(profile.trust),
        watch: shapeRecord(fish, "watch"),
        approach: shapeRecord(fish, "approach"),
        delayed: shapeRecord(fish, "delayed"),
      };
    }),
  }));
}

function meaningfulSession(state, seed) {
  const fish = state.individuals.find((one) => one.seed === seed);
  if (!fish) return state;
  const x = fish.x;
  const y = fish.y;
  let next = applyTouch(state, x, y);
  for (let step = 1; step <= 30; step += 1) {
    // Match src/app.js exactly: the live contact is refreshed before each
    // simulation tick, so the fish move against the pointer state for this
    // frame rather than the pointer state from the previous frame.
    next = applyContact(next, x, y, step * 0.1);
    next = tick(next, 0.1);
  }
  next = applyRelease(next);
  // Let the release aftermath move naturally before the next session/day.
  for (let step = 0; step < 8; step += 1) next = tick(next, 0.1);
  return next;
}

function productionGrowthEvidence() {
  let state = createAquariumState({ seed: 0x6e5e2026, wallClockHours: 12 });
  const seed = state.individuals[0].seed;
  const milestones = [{ day: 0, familiarity: 0 }];
  const saveBytes = [];

  for (let day = 1; day <= PRODUCTION_DAYS; day += 1) {
    state = meaningfulSession(state, seed);
    if (PRODUCTION_MILESTONES.has(day)) {
      const fish = state.individuals.find((one) => one.seed === seed);
      milestones.push({ day, familiarity: round(glassFamiliarityFor(fish), 6) });
      saveBytes.push({ day, bytes: JSON.stringify(serializePersistentState(state)).length });
    }
    // This is a real cross-session path. Offline catch-up deliberately clears
    // transient saturation and never manufactures relationship credit.
    state = advanceOffline(state, 86400);
  }

  return { seed, milestones, saveBytes, finalState: state };
}

function rapidSpamEvidence() {
  let state = createAquariumState({ seed: 0x6e5e2026, wallClockHours: 12 });
  const seed = state.individuals[0].seed;
  const fish = () => state.individuals.find((one) => one.seed === seed);
  const point = { x: fish().x, y: fish().y };
  const milestones = [];
  for (let index = 1; index <= RAPID_INTERACTIONS; index += 1) {
    state = applyTouch(state, point.x, point.y);
    state = applyRelease(state);
    if ([1, 5, 10, 20, 40].includes(index)) {
      milestones.push({ interactions: index, familiarity: round(glassFamiliarityFor(fish()), 6) });
    }
  }
  return { seed, milestones };
}

function visitEvidence(archetypes, mature) {
  const results = [];
  for (const archetype of archetypes) {
    const selected = mature.individuals.find((fish) => fish.seed === archetype.personality.seed);
    const individuals = mature.individuals.map((fish) => ({
      ...withGlassFamiliarity(fish, fish.seed === selected.seed ? 0.9 : 0),
      drives: { ...fish.drives, hunger: 0.2, energy: 0.8 },
      behavior: { ...fish.behavior, current: "cruise", previous: "cruise", blend: 1, ageSeconds: 60, ageRealSeconds: 60 },
      activity: { ...fish.activity, current: "cruise", previous: "cruise", ageRealSeconds: 8, targetType: null, targetId: null, targetX: null, targetY: null },
      attention: null,
      viewerRelationship: undefined,
    }));
    let found = null;
    for (let seconds = 0; seconds <= 3600 && !found; seconds += 4) {
      const posed = { ...mature, individuals, elapsedRealSeconds: seconds, stimuli: [], impulses: [] };
      const prepared = prepareVoluntaryGlassVisits(posed);
      const visitor = prepared.individuals.find((fish) => fish.viewerRelationship?.glassVisit);
      if (visitor) found = { seconds, seed: visitor.seed, durationSeconds: round(visitor.viewerRelationship.glassVisit.durationSeconds) };
    }
    results.push({ archetype: archetype.name, selectedSeed: selected.seed, firstInvitation: found });
  }
  return results;
}

function validate(report) {
  const production = report.productionGrowth.milestones;
  for (let index = 1; index < production.length; index += 1) {
    assert.ok(production[index].familiarity >= production[index - 1].familiarity,
      "production familiarity went backwards");
  }
  assert.ok(production.at(-1).familiarity > 0.05,
    `production path did not create a meaningful relationship: ${production.at(-1).familiarity}`);

  const rapid40 = report.rapidSpam.milestones.find((row) => row.interactions === 40)?.familiarity ?? Infinity;
  const spaced30 = production.find((row) => row.day === 30)?.familiarity ?? 0;
  assert.ok(spaced30 > rapid40,
    `spaced meaningful sessions (${spaced30}) did not outgrow rapid repetition (${rapid40})`);

  const bold = report.archetypes.find((row) => row.name === "bold");
  const cautious = report.archetypes.find((row) => row.name === "cautious");
  const attentive = report.archetypes.find((row) => row.name === "attentive");
  const boldHigh = bold.levels.find((row) => row.label === "high");
  const cautiousHigh = cautious.levels.find((row) => row.label === "high");
  const attentiveHigh = attentive.levels.find((row) => row.label === "high");
  assert.equal(boldHigh.approach.role, "investigate", "bold familiar fish did not close in");
  assert.equal(cautiousHigh.watch.role, "approach", "cautious familiar fish did not learn a reliable approach");
  assert.notEqual(cautiousHigh.approach.role, "investigate",
    "cautious familiar fish was flattened into the bold close-investigator style");
  assert.equal(attentiveHigh.watch.role, "approach",
    "attentive familiar fish lost its reliable familiar approach");

  for (const archetype of report.archetypes) {
    const unfamiliar = archetype.levels.find((row) => row.label === "unfamiliar");
    assert.equal(unfamiliar.watch.role, "watch");
    assert.equal(unfamiliar.approach.role, "approach");
    assert.equal(unfamiliar.delayed.role, "delayed");
  }

  const missingVisits = report.visits.filter((row) => !row.firstInvitation).map((row) => row.archetype);
  assert.deepEqual(missingVisits, [],
    `high-familiarity archetypes missing voluntary invitations: ${missingVisits.join(", ")}`);
  const saved = serializePersistentState(report.productionGrowth.finalState);
  assert.ok(saved.individuals.every((fish) => !("viewerRelationship" in fish)), "transient relationship data reached persistence");
}

const mature = advanceOffline(createAquariumState({ seed: 0x6e5a11, wallClockHours: 12 }), 180 * 86400);
const archetypes = archetypeEvidence(mature);
const productionGrowth = productionGrowthEvidence();
const rapidSpam = rapidSpamEvidence();
const visits = visitEvidence(archetypes, mature);
const report = { archetypes, productionGrowth, rapidSpam, visits };
validate(report);

await mkdir(path.resolve(OUTPUT), { recursive: true });
const keepable = {
  archetypes,
  productionGrowth: {
    seed: productionGrowth.seed,
    milestones: productionGrowth.milestones,
    saveBytes: productionGrowth.saveBytes,
  },
  rapidSpam,
  visits,
};
await writeFile(path.resolve(OUTPUT, "viewer-relationship.json"), `${JSON.stringify(keepable, null, 2)}\n`, "utf8");

console.log("Phase 6 relationship archetypes");
for (const archetype of archetypes) {
  const p = archetype.personality;
  console.log(`${archetype.name.padEnd(9)} seed=${p.seed.toString(16)} bold=${p.boldness} conf=${p.confidence} attentive=${p.attentiveness}`);
  for (const level of archetype.levels) {
    console.log(`  ${level.label.padEnd(10)} f=${level.familiarity.toFixed(2)} trust=${level.trust.toFixed(3)}`
      + ` watch→${level.watch.role} approach→${level.approach.role}`
      + ` delayed=${level.delayed.delaySeconds.toFixed(2)}s aftermath=${level.approach.durationSeconds.toFixed(2)}s`);
  }
}
console.log("\nProduction relationship growth, one meaningful session per day");
for (const row of productionGrowth.milestones) console.log(`  day ${String(row.day).padStart(3)}  familiarity ${row.familiarity.toFixed(6)}`);
console.log("\nRapid repetition comparison");
for (const row of rapidSpam.milestones) console.log(`  ${String(row.interactions).padStart(2)} interactions  familiarity ${row.familiarity.toFixed(6)}`);
console.log("\nVoluntary invitation scan");
for (const row of visits) console.log(`  ${row.archetype.padEnd(9)} ${row.firstInvitation ? `first at ${row.firstInvitation.seconds}s by ${row.firstInvitation.seed.toString(16)}` : "none in 3600s"}`);
console.log(`\nWrote ${path.join(OUTPUT, "viewer-relationship.json")}`);