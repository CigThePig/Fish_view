import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createCanvas } from "@napi-rs/canvas";

import { CanvasSceneRenderer } from "../src/render/canvas-renderer.js";
import { render } from "../src/render/render.js";
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
  return {
    scale,
    output: path.resolve(optionValue(args, "--output", ".behavior-captures/relationship")),
    seed: Number(optionValue(args, "--seed", 0x6e5a11)) >>> 0,
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
    individuals: state.individuals.map((fish) => withGlassFamiliarity(
      fish,
      fish.seed === selectedSeed ? familiarity : 0,
    )),
  };
}

function selectedFish(state, seed) {
  return state.individuals.find((fish) => fish.seed === seed);
}

// Find a real press which the selected fish answers passively while unfamiliar.
// That gives the relationship layer room to become visible: the same starting
// aquarium can progress from watch/wary into approach or close investigation
// without hand-authoring an attention record for the screenshot.
function captureAnchor(base, selectedSeed) {
  const selected = selectedFish(base, selectedSeed);
  const candidates = base.individuals
    .filter((fish) => fish.seed !== selectedSeed)
    .sort((a, b) => Math.hypot(b.x - selected.x, b.y - selected.y)
      - Math.hypot(a.x - selected.x, a.y - selected.y)
      || a.seed - b.seed);

  for (const candidate of candidates) {
    const touched = applyTouch(poseFamiliarity(base, selectedSeed, 0), candidate.x, candidate.y);
    const response = selectedFish(touched, selectedSeed)?.attention;
    if (response && PASSIVE_ROLES.has(response.role)) {
      return { x: candidate.x, y: candidate.y, baselineRole: response.role, anchorSeed: candidate.seed };
    }
  }
  const fallback = candidates[0] ?? selected;
  return { x: fallback.x, y: fallback.y, baselineRole: null, anchorSeed: fallback.seed };
}

function runScenario(base, selectedSeed, familiarity, anchor) {
  let state = poseFamiliarity(base, selectedSeed, familiarity);
  state = applyTouch(state, anchor.x, anchor.y);
  const initial = selectedFish(state, selectedSeed);
  const initialRole = initial?.attention?.role ?? null;

  for (let step = 1; step <= 24; step += 1) {
    state = applyContact(state, anchor.x, anchor.y, step * 0.1);
    state = tickFrame(state, 0.1);
  }

  const fish = selectedFish(state, selectedSeed);
  return {
    state,
    initialRole,
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
  version: 1,
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
      + `  baseline=${anchor.baselineRole ?? "fallback"}`,
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
    drawLabel(
      sheetContext,
      `${label} f=${familiarity.toFixed(1)}  ${scenario.initialRole ?? "none"}→${scenario.finalRole ?? "none"}`
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
      initialRole: scenario.initialRole,
      finalRole: scenario.finalRole,
      distanceFromViewerRegion: scenario.distance === null ? null : round(scenario.distance),
    });
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
