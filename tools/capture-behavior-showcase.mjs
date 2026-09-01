import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { createBubbleWorldRecords } from "../src/sim/bubbles.js";
import {
  SHOWCASE_SCENARIOS,
  createShowcaseState,
  showcaseSubjects,
  showcaseTarget,
  tickShowcase,
} from "../src/dev/behavior-showcase.js";
import { forageActivity } from "../src/sim/fish-motion.js";
import { CanvasSceneRenderer } from "../src/render/canvas-renderer.js";
import { render } from "../src/render/render.js";

const STEP_SECONDS = 0.1;
const DEFAULT_SCALE = 0.5;
const DEFAULT_OUTPUT = ".behavior-captures";

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
        // Report the original resolution error with the portable installation hint below.
      }
    }
    throw new Error(
      "The render capture needs the development-only @napi-rs/canvas package. Run `npm install` first.",
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

function hasFlag(argumentsList, name) {
  return argumentsList.includes(name);
}

function parseList(value, allowed, allValue = "all") {
  if (value === allValue || value === "both") return [...allowed];
  const requested = value.split(",").map((item) => item.trim()).filter(Boolean);
  const unknown = requested.filter((item) => !allowed.includes(item));
  if (unknown.length) throw new Error(`Unknown value: ${unknown.join(", ")}`);
  return requested;
}

function parseOptions(argumentsList) {
  const scenarioIds = SHOWCASE_SCENARIOS.map((scenario) => scenario.id);
  const orientations = parseList(
    optionValue(argumentsList, "--orientation", "both"),
    ["landscape", "portrait"],
  );
  const scenarios = parseList(
    optionValue(argumentsList, "--scenario", "all"),
    scenarioIds,
  ).map((id) => SHOWCASE_SCENARIOS.find((scenario) => scenario.id === id));
  const scale = Number(optionValue(argumentsList, "--scale", DEFAULT_SCALE));
  if (!Number.isFinite(scale) || scale < 0.2 || scale > 1) {
    throw new Error("--scale must be between 0.2 and 1");
  }
  return {
    orientations,
    scenarios,
    scale,
    gif: hasFlag(argumentsList, "--gif"),
    output: path.resolve(optionValue(argumentsList, "--output", DEFAULT_OUTPUT)),
  };
}

function snapshotMetadata(state, scenario, elapsed) {
  const subjects = showcaseSubjects(state, scenario.id);
  const lead = subjects[0]?.fish;
  const target = lead ? showcaseTarget(state, scenario.id) : null;
  const spacing = subjects.length > 1
    ? Math.hypot(subjects[0].fish.x - subjects[1].fish.x, subjects[0].fish.y - subjects[1].fish.y)
    : null;
  const bubble = scenario.id === "bubble-investigate" && lead
    ? createBubbleWorldRecords(state).find((record) => record.id === lead.activity?.targetId)
    : null;
  const forage = scenario.id === "substrate-search" && lead
    ? forageActivity(lead, subjects[0].index, state)
    : null;
  return {
    seconds: Number(elapsed.toFixed(1)),
    phase: target?.choreographyPhase ?? lead?.activity?.current ?? null,
    speed: lead ? Number(Math.hypot(lead.vx, lead.vy).toFixed(2)) : null,
    pitch: lead ? Number((lead.visual?.pitch ?? 0).toFixed(1)) : null,
    spacing: spacing === null ? null : Number(spacing.toFixed(2)),
    bubbleDistance: bubble && lead
      ? Number(Math.hypot(lead.x - bubble.worldX, lead.y - bubble.worldY).toFixed(2))
      : null,
    peck: forage?.peck ?? false,
  };
}

function firstTime(timeline, predicate, fallback = null) {
  return timeline.find((frame) => predicate(frame.metadata))?.seconds ?? fallback;
}

function firstTimeAfter(timeline, seconds, predicate, fallback = null) {
  return timeline.find((frame) => frame.seconds >= seconds && predicate(frame.metadata))?.seconds ?? fallback;
}

function normalizeSnapshotTimes(times, loopSeconds) {
  const fallbacks = [0, loopSeconds * 0.33, loopSeconds * 0.66, loopSeconds * 0.94];
  const selected = [];
  for (const value of [...times, ...fallbacks]) {
    const bounded = Math.max(0, Math.min(loopSeconds, Number.isFinite(value) ? value : 0));
    if (selected.some((existing) => Math.abs(existing - bounded) < STEP_SECONDS * 0.75)) continue;
    selected.push(bounded);
    if (selected.length === 4) break;
  }
  return selected.sort((left, right) => left - right);
}

function semanticSnapshotTimes(orientation, scenario) {
  let state = createShowcaseState({ orientation, scenario: scenario.id });
  const timeline = [];
  const frameCount = Math.ceil(scenario.loopSeconds / STEP_SECONDS);
  for (let frame = 0; frame <= frameCount; frame += 1) {
    const seconds = Math.min(scenario.loopSeconds, frame * STEP_SECONDS);
    timeline.push({ seconds, metadata: snapshotMetadata(state, scenario, seconds) });
    if (frame < frameCount) state = tickShowcase(state, STEP_SECONDS, scenario.id);
  }

  const phaseTime = (phase, fallback = null) => firstTime(
    timeline,
    (metadata) => metadata.phase === phase,
    fallback,
  );
  let times;
  if (scenario.id === "bubble-investigate") {
    const pursue = phaseTime("pursue", scenario.loopSeconds * 0.25);
    const inspect = phaseTime("inspect", scenario.loopSeconds * 0.72);
    times = [phaseTime("acquire", 0), pursue, inspect, firstTimeAfter(
      timeline,
      inspect + 0.5,
      (metadata) => metadata.phase === "inspect" || metadata.phase === "pop-search",
      scenario.loopSeconds * 0.94,
    )];
  } else if (scenario.id === "playful-chase") {
    const pursuit = phaseTime("pursuit", scenario.loopSeconds * 0.35);
    const breaking = phaseTime("break", scenario.loopSeconds * 0.8);
    times = [phaseTime("approach", 0), pursuit, (pursuit + breaking) / 2, breaking];
  } else if (scenario.id === "substrate-search") {
    const search = firstTime(
      timeline,
      (metadata) => metadata.phase === "search" || metadata.phase === "peck",
      scenario.loopSeconds * 0.72,
    );
    const peck = firstTime(timeline, (metadata) => metadata.peck, search);
    const recovery = firstTimeAfter(
      timeline,
      peck + STEP_SECONDS,
      (metadata) => !metadata.peck && metadata.phase === "search",
      Math.min(scenario.loopSeconds, peck + 0.5),
    );
    times = [0, search * 0.52, peck, recovery];
  } else if (scenario.id === "surface-investigate") {
    const probe = phaseTime("probe", scenario.loopSeconds * 0.78);
    times = [0, probe * 0.5, probe, firstTimeAfter(
      timeline,
      probe + 0.8,
      (metadata) => metadata.phase === "probe",
      scenario.loopSeconds * 0.94,
    )];
  } else if (scenario.id === "plant-investigate") {
    const inspect = phaseTime("inspect", scenario.loopSeconds * 0.45);
    times = [0, inspect, Math.min(scenario.loopSeconds, inspect + 2.4), scenario.loopSeconds * 0.94];
  } else if (scenario.id === "plant-weave") {
    times = [1, 2, 3, 4].map((stage) => phaseTime(`weave-${stage}`, null));
  } else {
    times = [];
  }
  return normalizeSnapshotTimes(times, scenario.loopSeconds);
}

function metadataLabel(metadata) {
  const fields = [
    `${metadata.seconds.toFixed(1)}s`,
    metadata.phase,
    `v ${metadata.speed?.toFixed(2) ?? "-"}`,
    `pitch ${metadata.pitch?.toFixed(0) ?? "-"}\u00b0`,
  ];
  if (metadata.spacing !== null) fields.push(`gap ${metadata.spacing.toFixed(1)}`);
  if (metadata.bubbleDistance !== null) fields.push(`bubble ${metadata.bubbleDistance.toFixed(1)}`);
  if (metadata.peck) fields.push("PECK");
  return fields.filter(Boolean).join("  |  ");
}

function drawLabel(context, text, x, y, width, height, { strong = false } = {}) {
  context.fillStyle = strong ? "#13212b" : "#0a1117";
  context.fillRect(x, y, width, height);
  context.fillStyle = strong ? "#d8f5ef" : "#a9c8c4";
  context.font = strong ? "600 16px sans-serif" : "12px sans-serif";
  context.textBaseline = "middle";
  context.fillText(text, x + 8, y + height / 2, width - 16);
}

function addGifFrame({ source, frameCanvas, frameContext, encoder, width, height }) {
  frameContext.drawImage(source, 0, 0, width, height);
  const pixels = frameContext.getImageData(0, 0, width, height).data;
  const rgba = new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength);
  encoder.addFrame(rgba, width, height, { delay: STEP_SECONDS * 1000 });
}

async function captureOrientation(canvasModule, options, orientation) {
  const { createCanvas, GifEncoder } = canvasModule;
  const native = orientation === "portrait"
    ? { width: 480, height: 800 }
    : { width: 800, height: 480 };
  const frame = {
    width: Math.round(native.width * options.scale),
    height: Math.round(native.height * options.scale),
  };
  const headerHeight = 28;
  const frameLabelHeight = 24;
  const rowHeight = headerHeight + frameLabelHeight + frame.height;
  const columns = 4;
  const sheet = createCanvas(frame.width * columns, rowHeight * options.scenarios.length);
  const sheetContext = sheet.getContext("2d");
  sheetContext.imageSmoothingEnabled = false;
  sheetContext.fillStyle = "#060b10";
  sheetContext.fillRect(0, 0, sheet.width, sheet.height);
  const manifest = [];

  for (const [row, scenario] of options.scenarios.entries()) {
    const source = createCanvas(native.width, native.height);
    const renderer = new CanvasSceneRenderer(source);
    let state = createShowcaseState({ orientation, scenario: scenario.id });
    renderer.draw(render(state));
    const times = semanticSnapshotTimes(orientation, scenario);
    let captureIndex = 0;
    let elapsed = 0;
    const rowSnapshots = [];
    const frameCanvas = options.gif ? createCanvas(frame.width, frame.height) : null;
    const frameContext = frameCanvas?.getContext("2d") ?? null;
    if (frameContext) frameContext.imageSmoothingEnabled = false;
    const encoder = options.gif
      ? new GifEncoder(frame.width, frame.height, { repeat: 0, quality: 15 })
      : null;

    drawLabel(
      sheetContext,
      `${scenario.label}  \u2014  ${orientation}`,
      0,
      row * rowHeight,
      sheet.width,
      headerHeight,
      { strong: true },
    );

    const totalFrames = Math.ceil(scenario.loopSeconds / STEP_SECONDS);
    for (let tickIndex = 0; tickIndex <= totalFrames; tickIndex += 1) {
      while (captureIndex < times.length && elapsed + STEP_SECONDS / 2 >= times[captureIndex]) {
        const metadata = snapshotMetadata(state, scenario, elapsed);
        const x = captureIndex * frame.width;
        const y = row * rowHeight + headerHeight;
        drawLabel(sheetContext, metadataLabel(metadata), x, y, frame.width, frameLabelHeight);
        sheetContext.drawImage(
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
        rowSnapshots.push(metadata);
        captureIndex += 1;
      }

      if (encoder) {
        addGifFrame({
          source,
          frameCanvas,
          frameContext,
          encoder,
          width: frame.width,
          height: frame.height,
        });
      }
      if (tickIndex === totalFrames) break;
      state = tickShowcase(state, STEP_SECONDS, scenario.id);
      elapsed += STEP_SECONDS;
      renderer.draw(render(state));
    }

    if (encoder) {
      const gifPath = path.join(options.output, `${orientation}-${scenario.id}.gif`);
      await writeFile(gifPath, encoder.finish());
    }
    manifest.push({ activity: scenario.id, loopSeconds: scenario.loopSeconds, snapshots: rowSnapshots });
  }

  const sheetPath = path.join(options.output, `${orientation}-behavior-contact-sheet.png`);
  await writeFile(sheetPath, sheet.toBuffer("image/png"));
  return { orientation, contactSheet: path.basename(sheetPath), scenarios: manifest };
}

const options = parseOptions(process.argv.slice(2));
const canvasModule = await loadCanvasModule();
await mkdir(options.output, { recursive: true });
const manifest = {
  version: 1,
  stepSeconds: STEP_SECONDS,
  scale: options.scale,
  captures: [],
};
for (const orientation of options.orientations) {
  manifest.captures.push(await captureOrientation(canvasModule, options, orientation));
}
await writeFile(
  path.join(options.output, "behavior-capture-manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);

console.log(`Wrote deterministic behaviour captures to ${options.output}`);
for (const capture of manifest.captures) console.log(`- ${capture.contactSheet}`);
if (options.gif) console.log(`- ${options.scenarios.length * options.orientations.length} animated GIF(s)`);
