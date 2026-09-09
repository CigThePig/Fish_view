// Semantic captures of an interaction: what the aquarium looked like before the
// input, when it first answered, while the answer took hold, at its peak, when
// it let go, and what was left afterwards.
//
// The moments are found in the observation rather than taken at fixed
// percentages of it - see semanticMoments() in the harness - so a scenario
// whose response arrives late, or never, is captured honestly instead of being
// sampled at a quarter, a half and three quarters of nothing.
//
//   npm run capture:interaction
//   npm run capture:interaction -- --scenario=open-water-tap --scale 1 --gif
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  INTERACTION_SCENARIOS,
  OBSERVATION_STEP_SECONDS,
  aquariumCache,
  observeInteraction,
  prepareScenario,
} from "../src/dev/interaction-observation.js";
import { DISPLAY } from "../src/sim/config.js";
import { CanvasSceneRenderer } from "../src/render/canvas-renderer.js";

const DEFAULT_SCALE = 0.5;
const DEFAULT_OUTPUT = ".behavior-captures";
const NATIVE = { width: 800, height: 480 };

async function loadCanvasModule() {
  try {
    return await import("@napi-rs/canvas");
  } catch (error) {
    const runtimeModules = process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES;
    if (runtimeModules) {
      const fallback = pathToFileURL(path.join(runtimeModules, "@napi-rs", "canvas", "index.js"));
      try {
        return await import(fallback.href);
      } catch {
        // Report the original resolution error with the installation hint below.
      }
    }
    throw new Error(
      "The interaction capture needs the development-only @napi-rs/canvas package. Run `npm install` first.",
      { cause: error },
    );
  }
}

function optionValue(argumentsList, name, fallback) {
  const prefix = `${name}=`;
  const inline = argumentsList.find((argument) => argument.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = argumentsList.indexOf(name);
  return index >= 0 ? argumentsList[index + 1] : fallback;
}

function parseOptions(argumentsList) {
  const requested = optionValue(argumentsList, "--scenario", "all");
  const scenarios = requested === "all"
    ? [...INTERACTION_SCENARIOS]
    : requested.split(",").map((id) => {
      const scenario = INTERACTION_SCENARIOS.find((entry) => entry.id === id.trim());
      if (!scenario) throw new Error(`unknown scenario: ${id}`);
      return scenario;
    });
  const scale = Number(optionValue(argumentsList, "--scale", DEFAULT_SCALE));
  if (!Number.isFinite(scale) || scale < 0.2 || scale > 1) throw new Error("--scale must be between 0.2 and 1");
  const seed = Number(optionValue(argumentsList, "--seed", 5));
  // The aquarium coerces its seed with >>> 0, so a larger number would quietly
  // capture a different tank than the manifest says it did.
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new Error("--seed must be a uint32 seed");
  }
  return {
    scenarios,
    scale,
    seed,
    // Draws each fish's response role over the frame. The aquarium itself never
    // shows a label; this is a developer overlay, and it is the only way a
    // still frame can say *why* two fish are doing different things.
    annotate: argumentsList.includes("--roles"),
    seconds: Number(optionValue(argumentsList, "--seconds", 12)),
    gif: argumentsList.includes("--gif"),
    output: path.resolve(optionValue(argumentsList, "--output", DEFAULT_OUTPUT)),
    name: optionValue(argumentsList, "--name", "interaction"),
  };
}

// One colour per response role, warm for the fish that come and cool for the
// ones that stay, so a frame reads at a glance.
const ROLE_MARKS = Object.freeze({
  investigate: { mark: "I", color: "#ffd166" },
  approach: { mark: "A", color: "#f4a261" },
  delayed: { mark: "D", color: "#e76f51" },
  watch: { mark: "W", color: "#8ecae6" },
  wary: { mark: "y", color: "#a2a8d3" },
  acknowledge: { mark: "\u00b7", color: "#7f9c96" },
});

function annotateRoles(context, state, scale) {
  const toPixels = (x, y) => [
    x / DISPLAY.cols * DISPLAY.pixelWidth * scale,
    y / DISPLAY.rows * DISPLAY.pixelHeight * scale,
  ];
  context.textBaseline = "middle";
  context.textAlign = "center";
  context.font = `700 ${Math.max(10, Math.round(16 * scale))}px sans-serif`;
  for (const stimulus of state.stimuli ?? []) {
    const [x, y] = toPixels(stimulus.x, stimulus.y);
    context.strokeStyle = "#ffffff";
    context.lineWidth = Math.max(1, scale);
    context.beginPath();
    context.arc(x, y, Math.max(3, 7 * scale), 0, Math.PI * 2);
    context.stroke();
  }
  for (const fish of state.individuals ?? []) {
    const role = fish.attention?.role;
    if (!role || !ROLE_MARKS[role]) continue;
    const [x, y] = toPixels(fish.x, fish.y);
    context.fillStyle = ROLE_MARKS[role].color;
    context.fillText(ROLE_MARKS[role].mark, x, y - Math.max(8, 16 * scale));
  }
  context.textAlign = "left";
}

function drawLabel(context, text, x, y, width, height, { strong = false } = {}) {
  context.fillStyle = strong ? "#13212b" : "#0a1117";
  context.fillRect(x, y, width, height);
  context.fillStyle = strong ? "#d8f5ef" : "#a9c8c4";
  context.font = strong ? "600 16px sans-serif" : "12px sans-serif";
  context.textBaseline = "middle";
  context.fillText(text, x + 8, y + height / 2, width - 16);
}

// Two moments can land on the same frame - today every fish answers a tap in
// the frame it arrives, so the first response is already the early one - and a
// contact sheet that drew that twice would claim a progression the aquarium
// does not have.
function momentColumns(moments) {
  const columns = [];
  for (const moment of moments) {
    const existing = columns.find((column) => column.frame === moment.frame);
    if (existing) existing.names.push(moment.moment);
    else columns.push({ frame: moment.frame, names: [moment.moment], moment });
  }
  return columns;
}

function momentLabel(column) {
  const moment = column.moment;
  return [
    `${column.names.join(" + ")}  ${moment.seconds.toFixed(1)}s`,
    `resp ${moment.response.toFixed(1)}`,
    `held ${moment.holdingStimulusActivity}`,
    `dmg ${moment.damagePercent.toFixed(0)}%`,
  ].join("  |  ");
}

const options = parseOptions(process.argv.slice(2));
const canvasModule = await loadCanvasModule();
const { createCanvas, GifEncoder } = canvasModule;
await mkdir(options.output, { recursive: true });

const baseFor = aquariumCache(options.seed);

// Measure every scenario first. The sheet is then exactly as wide as the
// scenario with the most distinct moments, rather than a fixed six columns with
// gaps where a response arrived all at once.
const rows = options.scenarios.map((scenario) => {
  const prepared = prepareScenario(scenario, baseFor);
  if (!prepared.history) return { scenario, prepared, observation: null, columns: [] };
  const observation = observeInteraction(prepared.state, {
    history: prepared.history,
    observeSeconds: scenario.observeSeconds ?? options.seconds,
  });
  return { scenario, prepared, observation, columns: momentColumns(observation.moments) };
});

const columnCount = Math.max(1, ...rows.map((row) => row.columns.length));
const frame = {
  width: Math.round(NATIVE.width * options.scale),
  height: Math.round(NATIVE.height * options.scale),
};
const headerHeight = 28;
const frameLabelHeight = 24;
const rowHeight = headerHeight + frameLabelHeight + frame.height;
const sheet = createCanvas(frame.width * columnCount, rowHeight * rows.length);
const sheetContext = sheet.getContext("2d");
sheetContext.imageSmoothingEnabled = false;
sheetContext.fillStyle = "#060b10";
sheetContext.fillRect(0, 0, sheet.width, sheet.height);

const manifest = {
  version: 1,
  seed: options.seed,
  stepSeconds: OBSERVATION_STEP_SECONDS,
  scale: options.scale,
  scenarios: [],
};

for (const [row, entry] of rows.entries()) {
  const { scenario, prepared, observation } = entry;
  if (!observation) {
    drawLabel(
      sheetContext,
      `${scenario.label} — precondition not reached`,
      0,
      row * rowHeight,
      sheet.width,
      headerHeight,
      { strong: true },
    );
    manifest.scenarios.push({ id: scenario.id, reached: false });
    continue;
  }

  drawLabel(
    sheetContext,
    `${scenario.label}  —  ${scenario.context} aquarium, seed ${options.seed}`
      + `, pointer at ${prepared.anchor.x}, ${prepared.anchor.y}`
      + `${prepared.precondition ? `, during ${prepared.precondition.activity}` : ""}`
      + `  —  ${observation.pointer.delivered}/${observation.pointer.total} events reached the aquarium`,
    0,
    row * rowHeight,
    sheet.width,
    headerHeight,
    { strong: true },
  );

  // The identical replay, drawn. The observation is deterministic, so frame 37
  // here is the frame 37 that was measured.
  const source = createCanvas(NATIVE.width, NATIVE.height);
  const renderer = new CanvasSceneRenderer(source);
  const frameCanvas = options.gif ? createCanvas(frame.width, frame.height) : null;
  const frameContext = frameCanvas?.getContext("2d") ?? null;
  if (frameContext) frameContext.imageSmoothingEnabled = false;
  const encoder = options.gif ? new GifEncoder(frame.width, frame.height, { repeat: 0, quality: 15 }) : null;
  const pending = new Map(entry.columns.map((column, index) => [column.frame, { column, index }]));

  observeInteraction(prepared.state, {
    history: prepared.history,
    observeSeconds: scenario.observeSeconds ?? options.seconds,
    onFrame: ({ frame: index, scene, state }) => {
      renderer.draw(scene);
      if (encoder) {
        frameContext.drawImage(source, 0, 0, frame.width, frame.height);
        const pixels = frameContext.getImageData(0, 0, frame.width, frame.height).data;
        encoder.addFrame(
          new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength),
          frame.width,
          frame.height,
          { delay: OBSERVATION_STEP_SECONDS * 1000 },
        );
      }
      const slot = pending.get(index);
      if (!slot) return;
      const x = slot.index * frame.width;
      const y = row * rowHeight + headerHeight;
      drawLabel(sheetContext, momentLabel(slot.column), x, y, frame.width, frameLabelHeight);
      sheetContext.drawImage(source, 0, 0, NATIVE.width, NATIVE.height, x, y + frameLabelHeight, frame.width, frame.height);
      if (options.annotate) {
        sheetContext.save();
        sheetContext.translate(x, y + frameLabelHeight);
        annotateRoles(sheetContext, state, options.scale);
        sheetContext.restore();
      }
    },
  });

  if (encoder) {
    await writeFile(path.join(options.output, `${options.name}-${scenario.id}.gif`), encoder.finish());
  }
  manifest.scenarios.push({
    id: scenario.id,
    label: scenario.label,
    context: scenario.context,
    reached: true,
    anchor: prepared.anchor,
    precondition: prepared.precondition,
    history: observation.pointer.encoded,
    delivered: observation.pointer.delivered,
    events: observation.pointer.total,
    moments: observation.moments,
    aquarium: observation.aquarium,
    render: observation.render,
  });
}

// A sheet is glyph noise on a dark field, which JPEG compresses worse than PNG
// and blurs; --scale is the size control, not the format.
const sheetPath = path.join(options.output, `${options.name}-contact-sheet.png`);
await writeFile(sheetPath, sheet.toBuffer("image/png"));
await writeFile(
  path.join(options.output, `${options.name}-capture-manifest.json`),
  `${JSON.stringify(manifest, null, 2)}\n`,
);

console.log(`Wrote interaction captures to ${options.output}`);
console.log(`- ${path.basename(sheetPath)} (${columnCount} moments per scenario)`);
if (options.gif) console.log(`- ${rows.length} animated GIF(s) at ${frame.width}\u00d7${frame.height}`);
