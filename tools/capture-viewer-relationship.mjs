import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createCanvas } from "@napi-rs/canvas";

import { CanvasSceneRenderer } from "../src/render/canvas-renderer.js";
import { render } from "../src/render/render.js";
import { attentionStandoff } from "../src/sim/attention.js";
import {
  advanceOffline,
  applyContact,
  applyTouch,
  createAquariumState,
} from "../src/sim/state.js";
import {
  relationshipResponseProfile,
  withGlassFamiliarity,
} from "../src/sim/viewer-relationship.js";

const LEVELS = Object.freeze([
  ["unfamiliar", 0],
  ["early", 0.2],
  ["medium", 0.5],
  ["high", 0.9],
]);
const NATIVE = Object.freeze({ width: 800, height: 480 });
const PASSIVE_ROLES = new Set(["watch", "wary", "acknowledge"]);
const ACTIVE_ROLES = new Set(["approach", "investigate"]);
const ROLE_ACTIVITY = Object.freeze({
  acknowledge: 0,
  wary: 0.5,
  watch: 1,
  delayed: 1.5,
  approach: 2,
  investigate: 3,
});

function optionValue(args, name, fallback) {
  const prefix = `${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
}

function parseOptions(args) {
  const scale = Number(optionValue(args, "--scale", 0.4));
  if (!Number.isFinite(scale) || scale < 0.2 || scale > 1) {
    throw new Error("--scale must be between 0.2 and 1");
  }
  const seed = Number(optionValue(args, "--seed", 0x6e5a11));
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new Error("--seed must be a uint32 seed");
  }
  return {
    scale,
    output: path.resolve(optionValue(args, "--output", ".behavior-captures/relationship")),
    seed,
  };
}

function round(value, places = 3) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function chooseArchetypes(state) {
  const rows = state.individuals.map((fish) => ({ fish, profile: relationshipResponseProfile(fish) }));
  const bold = [...rows].sort((a, b) => b.profile.confidence - a.profile.confidence || a.fish.seed - b.fish.seed)[0];
  const cautious = [...rows].sort((a, b) => a.profile.confidence - b.profile.confidence || a.fish.seed - b.fish.seed)[0];
  const attentive = [...rows]
    .filter((row) => row.fish.seed !== bold.fish.seed && row.fish.seed !== cautious.fish.seed)
    .sort((a, b) => b.profile.attentiveness - a.profile.attentiveness || a.fish.seed - b.fish.seed)[0];
  return [
    ["bold", bold.fish.seed],
    ["cautious", cautious.fish.seed],
    ["attentive", (attentive ?? bold).fish.seed],
  ];
}

function poseFamiliarity(state, selectedSeed, familiarity) {
  return {
    ...state,
    individuals: state.individuals.map((fish) => {
      const familiar = withGlassFamiliarity(
        fish,
        fish.seed === selectedSeed ? familiarity : 0,
      );
      if (fish.seed !== selectedSeed) return familiar;
      // The sheet compares relationship levels, not the random activity the
      // archetype happened to occupy at the 180-day snapshot. Keep the selected
      // fish free to answer in every column so familiarity is the only changing
      // behavioral input. Personality, position, drives and the rest of the
      // mature aquarium remain unchanged.
      return {
        ...familiar,
        behavior: { ...familiar.behavior, current: "cruise", previous: "cruise", blend: 1 },
        activity: { ...familiar.activity, current: "cruise", previous: "cruise" },
        attention: null,
        viewerRelationship: undefined,
      };
    }),
  };
}

function selectedFish(state, seed) {
  return state.individuals.find((fish) => fish.seed === seed);
}

function responseSummary(response) {
  if (!response) return null;
  return {
    role: response.role,
    durationSeconds: round(response.durationSeconds ?? 0),
    delaySeconds: round(response.delaySeconds ?? 0),
    standoff: round(attentionStandoff(response)),
  };
}

function relationshipDifference(unfamiliar, familiar) {
  if (!unfamiliar || !familiar) return -Infinity;
  const roleGain = (ROLE_ACTIVITY[familiar.role] ?? 0) - (ROLE_ACTIVITY[unfamiliar.role] ?? 0);
  const durationGain = Math.max(0, familiar.durationSeconds - unfamiliar.durationSeconds);
  const delayGain = Math.max(0, unfamiliar.delaySeconds - familiar.delaySeconds);
  const standoffGain = Math.max(0, unfamiliar.standoff - familiar.standoff);
  return roleGain * 10 + durationGain * 2 + delayGain + standoffGain;
}

// Find one real press that tells the selected fish's own relationship story.
// A cautious fish commonly gives us the obvious passive→active arc. A bold fish
// is *supposed* to investigate readily even while unfamiliar, so demanding a
// passive baseline from every personality falsifies the design we are trying to
// verify. When no passive→active anchor exists, choose the deterministic real
// press with the strongest high-familiarity consequence instead: longer
// engagement, shorter hesitation, closer standoff, or a stronger response role.
function captureAnchor(base, selectedSeed) {
  const selected = selectedFish(base, selectedSeed);
  const candidates = base.individuals
    .filter((fish) => fish.seed !== selectedSeed)
    .sort((a, b) => Math.hypot(b.x - selected.x, b.y - selected.y)
      - Math.hypot(a.x - selected.x, a.y - selected.y)
      || a.seed - b.seed);
  let best = null;

  for (const candidate of candidates) {
    const coldState = applyTouch(poseFamiliarity(base, selectedSeed, 0), candidate.x, candidate.y);
    const warmState = applyTouch(poseFamiliarity(base, selectedSeed, 0.9), candidate.x, candidate.y);
    const cold = responseSummary(selectedFish(coldState, selectedSeed)?.attention);
    const warm = responseSummary(selectedFish(warmState, selectedSeed)?.attention);
    if (!cold || !warm) continue;

    const anchor = {
      x: candidate.x,
      y: candidate.y,
      anchorSeed: candidate.seed,
      baseline: cold,
      high: warm,
    };
    // Prefer the clearest role progression when the personality naturally has
    // one; it makes the rendered contact sheet easiest to read at a glance.
    if (PASSIVE_ROLES.has(cold.role) && ACTIVE_ROLES.has(warm.role)) return anchor;

    const difference = relationshipDifference(cold, warm);
    if (!best || difference > best.difference
      || (difference === best.difference && candidate.seed < best.anchor.anchorSeed)) {
      best = { anchor, difference };
    }
  }

  if (!best || !(best.difference > 0)) {
    throw new Error(`no familiarity-sensitive production capture anchor for fish ${selectedSeed.toString(16)}`);
  }
  return best.anchor;
}

function runScenario(base, selectedSeed, familiarity, anchor) {
  let state = poseFamiliarity(base, selectedSeed, familiarity);
  state = applyTouch(state, anchor.x, anchor.y);
  const initial = selectedFish(state, selectedSeed);
  const initialResponse = responseSummary(initial?.attention);

  for (let step = 1; step <= 24; step += 1) {
    state = applyContact(state, anchor.x, anchor.y, step * 0.1);
    state = tickFrame(state, 0.1);
  }

  const fish = selectedFish(state, selectedSeed);
  return {
    state,
    initialResponse,
    finalRole: fish?.attention?.role ?? null,
    distance: fish ? Math.hypot(fish.x - anchor.x, fish.y - anchor.y) : null,
    profile: fish ? relationshipResponseProfile(fish) : null,
  };
}

// Kept as a tiny wrapper so the capture loop reads as interaction choreography
// rather than as a low-level simulation call.
import { tick as tickFrame } from "../src/sim/tick.js";

function drawLabel(context, text, x, y, width, height, strong = false) {
  context.fillStyle = strong ? "#13212b" : "#0a1117";
  context.fillRect(x, y, width, height);
  context.fillStyle = strong ? "#d8f5ef" : "#a9c8c4";
  context.font = strong ? "600 15px sans-serif" : "12px sans-serif";
  context.textBaseline = "middle";
  context.fillText(text, x + 8, y + height / 2, width - 16);
}

const options = parseOptions(process.argv.slice(2));
await mkdir(options.output, { recursive: true });

const base = advanceOffline(
  createAquariumState({ seed: options.seed, wallClockHours: 12 }),
  180 * 86400,
);
const archetypes = chooseArchetypes(base);
const frame = {
  width: Math.round(NATIVE.width * options.scale),
  height: Math.round(NATIVE.height * options.scale),
};
const rowHeader = 28;
const frameLabel = 28;
const rowHeight = rowHeader + frameLabel + frame.height;
const sheet = createCanvas(frame.width * LEVELS.length, rowHeight * archetypes.length);
const sheetContext = sheet.getContext("2d");
sheetContext.imageSmoothingEnabled = false;
sheetContext.fillStyle = "#060b10";
sheetContext.fillRect(0, 0, sheet.width, sheet.height);

const manifest = {
  version: 2,
  seed: options.seed,
  matureDays: 180,
  scale: options.scale,
  archetypes: [],
};

for (const [rowIndex, [name, selectedSeed]] of archetypes.entries()) {
  const baseline = selectedFish(base, selectedSeed);
  const profile = relationshipResponseProfile(baseline);
  const anchor = captureAnchor(base, selectedSeed);
  const rowY = rowIndex * rowHeight;
  drawLabel(
    sheetContext,
    `${name}  seed=${selectedSeed.toString(16)}  bold=${profile.boldness.toFixed(2)}`
      + `  confidence=${profile.confidence.toFixed(2)}  attentive=${profile.attentiveness.toFixed(2)}`
      + `  baseline=${anchor.baseline.role}`,
    0,
    rowY,
    sheet.width,
    rowHeader,
    true,
  );

  const rowManifest = {
    name,
    seed: selectedSeed,
    personality: {
      boldness: round(profile.boldness),
      confidence: round(profile.confidence),
      attentiveness: round(profile.attentiveness),
      glassAffinity: round(profile.glassAffinity),
    },
    anchor,
    levels: [],
  };

  for (const [column, [label, familiarity]] of LEVELS.entries()) {
    const scenario = runScenario(base, selectedSeed, familiarity, anchor);
    const x = column * frame.width;
    const response = scenario.initialResponse;
    drawLabel(
      sheetContext,
      `${label} f=${familiarity.toFixed(1)}  ${response?.role ?? "none"}→${scenario.finalRole ?? "none"}`
        + `  d=${scenario.distance === null ? "n/a" : scenario.distance.toFixed(1)}`,
      x,
      rowY + rowHeader,
      frame.width,
      frameLabel,
    );

    const source = createCanvas(NATIVE.width, NATIVE.height);
    const renderer = new CanvasSceneRenderer(source);
    renderer.draw(render(scenario.state));
    sheetContext.drawImage(
      source,
      0,
      0,
      NATIVE.width,
      NATIVE.height,
      x,
      rowY + rowHeader + frameLabel,
      frame.width,
      frame.height,
    );

    rowManifest.levels.push({
      label,
      familiarity,
      trust: round(scenario.profile?.trust ?? 0),
      initialRole: response?.role ?? null,
      initialDurationSeconds: response?.durationSeconds ?? null,
      initialDelaySeconds: response?.delaySeconds ?? null,
      initialStandoff: response?.standoff ?? null,
      finalRole: scenario.finalRole,
      distanceFromViewerRegion: scenario.distance === null ? null : round(scenario.distance),
    });
  }

  const unfamiliar = rowManifest.levels.find((level) => level.label === "unfamiliar");
  const high = rowManifest.levels.find((level) => level.label === "high");
  const visibleDifference = unfamiliar && high && (
    unfamiliar.initialRole !== high.initialRole
    || (high.initialDurationSeconds ?? 0) > (unfamiliar.initialDurationSeconds ?? 0) + 0.01
    || (high.initialDelaySeconds ?? 0) < (unfamiliar.initialDelaySeconds ?? 0) - 0.01
    || (high.initialStandoff ?? 0) < (unfamiliar.initialStandoff ?? 0) - 0.01
    || (Number.isFinite(unfamiliar.distanceFromViewerRegion)
      && Number.isFinite(high.distanceFromViewerRegion)
      && high.distanceFromViewerRegion < unfamiliar.distanceFromViewerRegion - 0.05)
  );
  if (!visibleDifference) {
    throw new Error(
      `${name} relationship capture has no observable unfamiliar/high difference at its production anchor`,
    );
  }
  manifest.archetypes.push(rowManifest);
}

const sheetPath = path.join(options.output, "phase6-relationship-contact-sheet.png");
const manifestPath = path.join(options.output, "phase6-relationship-capture-manifest.json");
await writeFile(sheetPath, sheet.toBuffer("image/png"));
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

console.log(`Wrote Phase 6 relationship captures to ${options.output}`);
console.log(`- ${path.basename(sheetPath)} (${archetypes.length} personalities × ${LEVELS.length} familiarity levels)`);
console.log(`- ${path.basename(manifestPath)}`);