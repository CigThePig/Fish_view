import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  SHOWCASE_SCENARIOS,
  createShowcaseState,
  tickShowcase,
} from "../src/dev/behavior-showcase.js";
import { PHASE_7_BASELINE_BY_ACTIVITY } from "../src/dev/phase-7-readability-baseline.js";
import { PHASE_7_FINAL_BY_ACTIVITY } from "../src/dev/phase-7-behavior-vocabulary.js";
import { hashSeed, mix32 } from "../src/sim/prng.js";
import { CanvasSceneRenderer } from "../src/render/canvas-renderer.js";
import { render } from "../src/render/render.js";

const STEP_SECONDS = 0.1;
const DEFAULT_SCALE = 0.5;
const DEFAULT_OUTPUT = ".behavior-captures/phase-7-1";
const SNAPSHOT_FRACTIONS = Object.freeze([0, 0.32, 0.64, 0.92]);

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
        // Report the portable installation hint below.
      }
    }
    throw new Error(
      "The Phase 7 baseline capture needs @napi-rs/canvas. Run `npm install` first.",
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
  const scale = Number(optionValue(argumentsList, "--scale", DEFAULT_SCALE));
  if (!Number.isFinite(scale) || scale < 0.2 || scale > 1) {
    throw new Error("--scale must be between 0.2 and 1");
  }
  const contract = optionValue(argumentsList, "--contract", "baseline");
  if (!["baseline", "final"].includes(contract)) throw new Error("--contract must be baseline or final");
  return {
    contract,
    scale,
    output: path.resolve(optionValue(argumentsList, "--output", DEFAULT_OUTPUT)),
  };
}

function blindOrder(scenario, contract) {
  return mix32(hashSeed("phase-7-" + contract + "-blind-order") ^ hashSeed(scenario.id));
}

function sampleName(index) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  if (index < alphabet.length) return `Sample ${alphabet[index]}`;
  return `Sample ${index + 1}`;
}

function drawLabel(context, text, x, y, width, height, strong = false) {
  context.fillStyle = strong ? "#13212b" : "#0a1117";
  context.fillRect(x, y, width, height);
  context.fillStyle = strong ? "#d8f5ef" : "#a9c8c4";
  context.font = strong ? "600 16px sans-serif" : "12px sans-serif";
  context.textBaseline = "middle";
  context.fillText(text, x + 8, y + height / 2, width - 16);
}

function snapshotTimes(loopSeconds) {
  return SNAPSHOT_FRACTIONS.map((fraction) => loopSeconds * fraction);
}

async function captureBlindSheet(canvasModule, options) {
  const { createCanvas } = canvasModule;
  const native = { width: 800, height: 480 };
  const frame = {
    width: Math.round(native.width * options.scale),
    height: Math.round(native.height * options.scale),
  };
  const headerHeight = 28;
  const frameLabelHeight = 22;
  const columns = 4;
  const scenarios = [...SHOWCASE_SCENARIOS].sort((left, right) => (
    blindOrder(left, options.contract) - blindOrder(right, options.contract) || left.id.localeCompare(right.id)
  ));
  const rowHeight = headerHeight + frameLabelHeight + frame.height;
  const sheet = createCanvas(frame.width * columns, rowHeight * scenarios.length);
  const context = sheet.getContext("2d");
  context.imageSmoothingEnabled = false;
  context.fillStyle = "#060b10";
  context.fillRect(0, 0, sheet.width, sheet.height);

  const key = [];

  for (const [row, scenario] of scenarios.entries()) {
    const sample = sampleName(row);
    const source = createCanvas(native.width, native.height);
    const renderer = new CanvasSceneRenderer(source);
    let state = createShowcaseState({ scenario: scenario.id });
    renderer.draw(render(state));

    drawLabel(context, `${sample}  —  landscape`, 0, row * rowHeight, sheet.width, headerHeight, true);

    const times = snapshotTimes(scenario.loopSeconds);
    let captureIndex = 0;
    let elapsed = 0;
    const totalFrames = Math.ceil(scenario.loopSeconds / STEP_SECONDS);

    for (let frameIndex = 0; frameIndex <= totalFrames; frameIndex += 1) {
      while (captureIndex < times.length && elapsed + STEP_SECONDS / 2 >= times[captureIndex]) {
        const x = captureIndex * frame.width;
        const y = row * rowHeight + headerHeight;
        drawLabel(context, `${elapsed.toFixed(1)}s`, x, y, frame.width, frameLabelHeight);
        context.drawImage(
          source,
          0,
          0,
          native.width,
          native.height,
          x,
          y + frameLabelHeight,
          frame.width,
          frame.height,
        );
        captureIndex += 1;
      }

      if (frameIndex === totalFrames) break;
      state = tickShowcase(state, STEP_SECONDS, scenario.id);
      elapsed += STEP_SECONDS;
      renderer.draw(render(state));
    }

    const record = options.contract === "final"
      ? PHASE_7_FINAL_BY_ACTIVITY[scenario.id]
      : PHASE_7_BASELINE_BY_ACTIVITY[scenario.id];
    key.push({
      sample,
      activity: scenario.id,
      label: scenario.label,
      status: record?.status ?? null,
      policy: record?.policy ?? null,
      visualSentence: record?.visualSentence ?? null,
      cues: record?.cues ?? [],
      nearestNeighbors: record?.nearestNeighbors ?? [],
      owner: record?.owner ?? null,
      decision: record?.decision ?? null,
      frozen: record?.frozen ?? false,
    });
  }

  const prefix = options.contract === "final" ? "phase-7-7-final" : "phase-7-1";
  const sheetFile = prefix + "-blind-contact-sheet.png";
  const keyFile = prefix + "-blind-key.json";
  await writeFile(path.join(options.output, sheetFile), sheet.toBuffer("image/png"));
  await writeFile(path.join(options.output, keyFile), `${JSON.stringify({
    version: options.contract === "final" ? 2 : 1,
    contract: options.contract,
    purpose: "Review motion readability without behavior names or choreography-phase labels on the image.",
    stepSeconds: STEP_SECONDS,
    scale: options.scale,
    snapshots: SNAPSHOT_FRACTIONS,
    samples: key,
  }, null, 2)}\n`);

  return { sheetFile, keyFile, sampleCount: key.length };
}

const options = parseOptions(process.argv.slice(2));
const canvasModule = await loadCanvasModule();
await mkdir(options.output, { recursive: true });
const result = await captureBlindSheet(canvasModule, options);

console.log("Wrote Phase 7 " + options.contract + " blind readability evidence to " + options.output);
console.log(`- ${result.sheetFile}`);
console.log(`- ${result.keyFile}`);
console.log(`- ${result.sampleCount} behavior samples`);
console.log("Review the contact sheet before opening the key.");
