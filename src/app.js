import { DeveloperGesture, aquariumPoint } from "./platform/aquarium-input.js";
import { CanvasSceneRenderer } from "./render/canvas-renderer.js?v=true-rotation-20260902";
import { render } from "./render/render.js?v=true-rotation-20260902";
import { clearPersistedState, loadPersistedState, savePersistedState } from "./platform/storage.js";
import { VisibilityClock } from "./platform/visibility-clock.js";
import { historyDiagnostics } from "./sim/aquarium-history.js";
import { DEFAULT_SEED } from "./sim/config.js";
import { topAffinities } from "./sim/fish-personality.js";
import { hashSeed } from "./sim/prng.js";
import { advanceOffline, applyTouch, createAquariumState, withSettings } from "./sim/state.js";
import { tick } from "./sim/tick.js";

const TICK_INTERVAL = 1 / 10;
const query = new URLSearchParams(globalThis.location.search);
const requestedSeed = query.get("seed");
const seed = requestedSeed ? hashSeed(requestedSeed) : DEFAULT_SEED;
const now = new Date();
const wallClockHours = now.getHours() + now.getMinutes() / 60;
const visibilityClock = new VisibilityClock();
if (document.visibilityState === "hidden") visibilityClock.pause(now.getTime());

let state = loadPersistedState(createAquariumState({ seed, wallClockHours }));
const canvas = document.querySelector("#aquarium-canvas");
const renderer = new CanvasSceneRenderer(canvas);
const debugPanel = document.querySelector("#debug-panel");
const gesture = new DeveloperGesture();

let lastFrameTime = performance.now();
let accumulator = TICK_INTERVAL;
let sampleStartedAt = lastFrameTime;
let sampledFrames = 0;
let sampledDamage = 0;
let sampledTotal = 0;
let sampledRectangles = 0;
let sampledPlantChanges = 0;
let sampledPlantFrames = 0;
let previousPlantSignatures = new Map();
let latestPlantMetrics = null;

function updatePersonalityDiagnostics(state) {
  const lines = state.individuals.map((fish, index) => {
    const affinities = topAffinities(fish.seed)
      .map(({ key, value }) => `${key} ${value.toFixed(2)}`)
      .join(", ");
    const target = fish.activity?.targetType
      ? `${fish.activity.targetType}:${fish.activity.targetId ?? "point"}`
      : "none";
    const companion = fish.history?.socialMemory?.[0];
    const familiar = companion
      ? `${companion.seed.toString(16)} ${companion.familiarity.toFixed(2)}`
      : "none";
    return [
      `${index + 1} / ${fish.seed.toString(16)}`,
      `${fish.behavior.current} > ${fish.activity?.current ?? "default"}`,
      `target ${target}`,
      `likes ${affinities}`,
      `familiar ${familiar}`,
    ].join(" · ");
  });
  document.querySelector("#personality-output").textContent = lines.join("\n");
}

// Developer tooling only, hidden behind the tuning panel. The aquarium itself
// never shows an age, a countdown, a plant tally, or any other historical
// statistic: the child is meant to discover a history by noticing the world.
function updateHistoryDiagnostics(state) {
  const diagnostics = historyDiagnostics(state);
  const lines = [
    `age ${diagnostics.ageDays.toFixed(2)} days · `
      + `fish ${diagnostics.individualCount}/${diagnostics.individualCap} · `
      + `plants ${diagnostics.plantCount}/${diagnostics.plantCap}`,
    `content v${diagnostics.content.version} · `
      + `propagation epoch ${diagnostics.content.propagationEpoch} · `
      + `milestone mask 0b${diagnostics.content.milestones.toString(2).padStart(4, "0")}`,
    `next milestone ${diagnostics.nextMilestone ?? "none"} · `
      + `arrived ${diagnostics.arrivedSeeds.map((seed) => seed.toString(16)).join(", ") || "none"}`,
    ...diagnostics.milestones.map((milestone) => [
      milestone.id.padEnd(18),
      `day ${milestone.day.toFixed(1)}`,
      milestone.resolved ? "resolved" : "pending",
      milestone.speciesId ?? (milestone.fishSeed === null ? "" : milestone.fishSeed.toString(16)),
    ].join(" · ")),
    `plants grown since creation: ${diagnostics.grownPlantCount}`,
  ];
  document.querySelector("#history-output").textContent = lines.join("\n");
}

// Growth is deliberately illegible inside a session, which makes it exactly the
// thing a developer cannot check by looking at the tank. Ages, stages, paces and
// the stage each fish will stop at are therefore readable here and nowhere else.
function updateGrowthDiagnostics(state) {
  const lines = historyDiagnostics(state).growth.map((fish, index) => [
    `${index + 1} / ${fish.seed.toString(16)}`,
    `${fish.speciesId} ${fish.label}`,
    `stage ${fish.stageIndex}/${fish.stageCount - 1}`,
    fish.grown ? `stops here (${fish.terminalStage})` : `grows to ${fish.terminalStage}`,
    `age ${fish.ageDays.toFixed(1)}d`,
    fish.nextStageDay === null ? "finished" : `next at ${fish.nextStageDay.toFixed(1)}d`,
  ].join(" · "));
  document.querySelector("#growth-output").textContent = lines.join("\n");
}

function drawVisible() {
  const scene = render(state);
  const result = renderer.draw(scene);
  latestPlantMetrics = scene.metadata.plants;
  const previous = previousPlantSignatures;
  const next = new Map(scene.objects
    .filter((object) => object.id.startsWith("plant:"))
    .map((object) => [object.id, object.signature]));
  let changed = 0;
  for (const [id, signature] of next) {
    if (previous.get(id) !== signature) changed += 1;
  }
  for (const id of previous.keys()) {
    if (!next.has(id)) changed += 1;
  }
  previousPlantSignatures = next;
  sampledPlantChanges += changed;
  sampledPlantFrames += 1;
  sampledDamage += result.damagedPixels;
  sampledTotal += result.totalPixels;
  sampledRectangles += result.damageRectangles;
  sampledFrames += 1;
}

function updateMetrics(timestamp) {
  if (timestamp - sampleStartedAt < 1000) return;
  const seconds = (timestamp - sampleStartedAt) / 1000;
  document.querySelector("#fps-output").textContent = `${(sampledFrames / seconds).toFixed(1)} fps`;
  const damagePercent = sampledTotal ? (sampledDamage / sampledTotal) * 100 : 0;
  document.querySelector("#damage-output").textContent = `${damagePercent.toFixed(1)}%`;
  document.querySelector("#rect-output").textContent = sampledFrames
    ? (sampledRectangles / sampledFrames).toFixed(1)
    : "0";
  const metrics = latestPlantMetrics;
  document.querySelector("#age-output").textContent = `${state.totalDays.toFixed(1)} days`;
  document.querySelector("#plant-output").textContent = metrics ? String(metrics.instances) : "—";
  document.querySelector("#plant-joints-output").textContent = metrics ? String(metrics.activeJoints) : "—";
  document.querySelector("#plant-glyphs-output").textContent = metrics ? String(metrics.glyphs) : "—";
  document.querySelector("#plant-changed-output").textContent = sampledPlantFrames
    ? (sampledPlantChanges / sampledPlantFrames).toFixed(1)
    : "0";
  updatePersonalityDiagnostics(state);
  updateHistoryDiagnostics(state);
  updateGrowthDiagnostics(state);
  sampledFrames = 0;
  sampledDamage = 0;
  sampledTotal = 0;
  sampledRectangles = 0;
  sampledPlantChanges = 0;
  sampledPlantFrames = 0;
  sampleStartedAt = timestamp;
}

function frame(timestamp) {
  if (document.visibilityState === "hidden") {
    lastFrameTime = timestamp;
    requestAnimationFrame(frame);
    return;
  }
  const elapsed = Math.min((timestamp - lastFrameTime) / 1000, 0.25);
  lastFrameTime = timestamp;
  accumulator += elapsed;
  if (accumulator >= TICK_INTERVAL) {
    const delta = Math.min(accumulator, 0.25);
    state = tick(state, delta);
    accumulator = 0;
    drawVisible();
  }
  updateMetrics(timestamp);
  requestAnimationFrame(frame);
}

function syncControls() {
  document.querySelectorAll("[data-setting]").forEach((input) => {
    const value = String(state.settings[input.dataset.setting]);
    input.value = value;
    document.querySelector(`[data-output="${input.dataset.setting}"]`).textContent = value;
  });
  document.querySelector("#time-scale").value = String(state.settings.timeScale);
  document.querySelector("#clock-control").value = String(state.timeOfDayHours);
  document.querySelector("#clock-output").textContent = formatClock(state.timeOfDayHours);
}

syncControls();
let pointerStart = null;
canvas.addEventListener("pointerdown", (event) => {
  if (!event.isPrimary || event.button !== 0 || !debugPanel.hidden) return;
  event.preventDefault();
  const point = aquariumPoint(event, canvas.getBoundingClientRect());
  pointerStart = { id: event.pointerId, x: event.clientX, y: event.clientY, time: performance.now() };
  if (event.isTrusted) canvas.setPointerCapture?.(event.pointerId);
  if (!point.hotspot) {
    gesture.reset();
    state = applyTouch(state, point.x, point.y);
    drawVisible();
  }
});
canvas.addEventListener("pointerup", (event) => {
  const start = pointerStart;
  pointerStart = null;
  if (!start || start.id !== event.pointerId) return;
  const point = aquariumPoint(event, canvas.getBoundingClientRect());
  const now = performance.now();
  if (now - start.time > 600 || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 12) {
    gesture.reset();
    return;
  }
  const startPoint = aquariumPoint({ clientX: start.x, clientY: start.y }, canvas.getBoundingClientRect());
  if (!startPoint.hotspot) return;
  if (gesture.tap(point.hotspot, now)) setDebugOpen(true);
});
canvas.addEventListener("contextmenu", (event) => event.preventDefault());
canvas.addEventListener("pointercancel", () => { pointerStart = null; gesture.reset(); });
document.addEventListener("pointerdown", (event) => {
  if (event.target !== canvas) gesture.reset();
});
function setDebugOpen(open) {
  gesture.reset();
  debugPanel.hidden = !open;
  if (open) { syncControls(); document.querySelector("#debug-close").focus(); }
}
document.querySelector("#debug-close").addEventListener("click", () => setDebugOpen(false));
document.addEventListener("keydown", (event) => { if (event.key === "Escape") setDebugOpen(false); });

document.querySelectorAll("[data-setting]").forEach((input) => {
  input.addEventListener("input", () => {
    const name = input.dataset.setting;
    const value = Number(input.value);
    state = withSettings(state, { [name]: value });
    document.querySelector(`[data-output="${name}"]`).textContent = input.value;
  });
});

const timeScale = document.querySelector("#time-scale");
timeScale.addEventListener("change", () => {
  const value = Number(timeScale.value);
  state = withSettings(state, { timeScale: value });
});

const clockControl = document.querySelector("#clock-control");
const clockOutput = document.querySelector("#clock-output");
function formatClock(hours) {
  const wholeHours = Math.floor(hours) % 24;
  const minutes = Math.floor((hours - Math.floor(hours)) * 60);
  return `${String(wholeHours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}
clockControl.addEventListener("input", () => {
  const value = Number(clockControl.value);
  state = { ...state, timeOfDayHours: value };
  clockOutput.textContent = formatClock(value);
});

document.querySelector("#fullscreen-toggle").addEventListener("click", async () => {
  if (!document.fullscreenElement) {
    try { await document.documentElement.requestFullscreen?.(); } catch { /* Viewport fitting remains available. */ }
  } else {
    try { await document.exitFullscreen?.(); } catch { /* The user can still close the drawer. */ }
  }
});

function saveAquarium() {
  const savedAtMs = visibilityClock.saveTimestamp(Date.now());
  savePersistedState(state, savedAtMs);
}

setInterval(saveAquarium, 12_000);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    visibilityClock.pause(Date.now());
    saveAquarium();
  } else {
    const elapsed = visibilityClock.resume(Date.now());
    state = advanceOffline(state, elapsed);
    lastFrameTime = performance.now();
    accumulator = 0;
    drawVisible();
  }
});
globalThis.addEventListener("pagehide", saveAquarium);

document.querySelector("#reset-simulation").addEventListener("click", () => {
  clearPersistedState(state);
  state = createAquariumState({ seed, wallClockHours });
  syncControls();
  renderer.reset();
  previousPlantSignatures.clear();
  drawVisible();
});

drawVisible();
requestAnimationFrame(frame);
