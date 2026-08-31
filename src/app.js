import { CanvasSceneRenderer } from "./render/canvas-renderer.js?v=phase1-pitch-20260830";
import { render } from "./render/render.js?v=phase2-personality-20260831";
import { clearPersistedState, loadPersistedState, savePersistedState } from "./platform/storage.js";
import { DEFAULT_SEED } from "./sim/config.js";
import { topAffinities } from "./sim/fish-personality.js";
import { hashSeed } from "./sim/prng.js";
import { applyTouch, createAquariumState, withSettings } from "./sim/state.js";
import { tick } from "./sim/tick.js";

const TICK_INTERVAL = 1 / 10;
const query = new URLSearchParams(globalThis.location.search);
const requestedSeed = query.get("seed");
const seed = requestedSeed ? hashSeed(requestedSeed) : DEFAULT_SEED;
const now = new Date();
const wallClockHours = now.getHours() + now.getMinutes() / 60;

let states = {
  portrait: loadPersistedState(createAquariumState({ orientation: "portrait", seed, wallClockHours })),
  landscape: loadPersistedState(createAquariumState({ orientation: "landscape", seed, wallClockHours })),
};

const canvases = {
  portrait: document.querySelector("#portrait-canvas"),
  landscape: document.querySelector("#landscape-canvas"),
};
const renderers = {
  portrait: new CanvasSceneRenderer(canvases.portrait),
  landscape: new CanvasSceneRenderer(canvases.landscape),
};
const stage = document.querySelector("#aquarium-stage");
const debugPanel = document.querySelector("#debug-panel");
const debugToggle = document.querySelector("#debug-toggle");
let currentMode = query.get("orientation") === "portrait" ? "portrait" : "landscape";
if (query.get("orientation") === "compare") currentMode = "compare";
stage.dataset.mode = currentMode;

let lastFrameTime = performance.now();
let accumulator = TICK_INTERVAL;
let sampleStartedAt = lastFrameTime;
let sampledFrames = 0;
let sampledDamage = 0;
let sampledTotal = 0;
let sampledRectangles = 0;
let sampledPlantChanges = 0;
let sampledPlantFrames = 0;
const previousPlantSignatures = { portrait: new Map(), landscape: new Map() };
const latestPlantMetrics = { portrait: null, landscape: null };

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

function visibleOrientations() {
  return currentMode === "compare" ? ["portrait", "landscape"] : [currentMode];
}

function drawVisible() {
  visibleOrientations().forEach((orientation) => {
    const state = states[orientation];
    const scene = render(state);
    const result = renderers[orientation].draw(scene);
    latestPlantMetrics[orientation] = scene.metadata.plants;
    const previous = previousPlantSignatures[orientation];
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
    previousPlantSignatures[orientation] = next;
    sampledPlantChanges += changed;
    sampledPlantFrames += 1;
    sampledDamage += result.damagedPixels;
    sampledTotal += result.totalPixels;
    sampledRectangles += result.damageRectangles;
  });
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
  const state = states[currentMode === "portrait" ? "portrait" : "landscape"];
  const metrics = latestPlantMetrics[state.orientation];
  document.querySelector("#age-output").textContent = `${state.totalDays.toFixed(1)} days`;
  document.querySelector("#plant-output").textContent = metrics ? String(metrics.instances) : "—";
  document.querySelector("#plant-joints-output").textContent = metrics ? String(metrics.activeJoints) : "—";
  document.querySelector("#plant-glyphs-output").textContent = metrics ? String(metrics.glyphs) : "—";
  document.querySelector("#plant-changed-output").textContent = sampledPlantFrames
    ? (sampledPlantChanges / sampledPlantFrames).toFixed(1)
    : "0";
  updatePersonalityDiagnostics(state);
  sampledFrames = 0;
  sampledDamage = 0;
  sampledTotal = 0;
  sampledRectangles = 0;
  sampledPlantChanges = 0;
  sampledPlantFrames = 0;
  sampleStartedAt = timestamp;
}

function frame(timestamp) {
  const elapsed = Math.min((timestamp - lastFrameTime) / 1000, 0.25);
  lastFrameTime = timestamp;
  accumulator += elapsed;
  if (accumulator >= TICK_INTERVAL) {
    const delta = Math.min(accumulator, 0.25);
    states = {
      portrait: tick(states.portrait, delta),
      landscape: tick(states.landscape, delta),
    };
    accumulator = 0;
    drawVisible();
  }
  updateMetrics(timestamp);
  requestAnimationFrame(frame);
}

function setMode(mode) {
  currentMode = mode;
  stage.dataset.mode = mode;
  document.querySelectorAll("[data-mode-button]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.modeButton === mode);
    button.setAttribute("aria-pressed", String(button.dataset.modeButton === mode));
  });
  drawVisible();
}

document.querySelectorAll("[data-mode-button]").forEach((button) => {
  button.addEventListener("click", () => setMode(button.dataset.modeButton));
});
setMode(currentMode);

Object.entries(canvases).forEach(([orientation, canvas]) => {
  canvas.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const normalizedX = (event.clientX - rect.left) / rect.width;
    const normalizedY = (event.clientY - rect.top) / rect.height;
    states = {
      portrait: applyTouch(states.portrait, normalizedX * states.portrait.cols, normalizedY * states.portrait.rows),
      landscape: applyTouch(states.landscape, normalizedX * states.landscape.cols, normalizedY * states.landscape.rows),
    };
    drawVisible();
    canvas.setPointerCapture?.(event.pointerId);
  });
});

function setDebugOpen(open) {
  debugPanel.hidden = !open;
  debugToggle.setAttribute("aria-expanded", String(open));
}

debugToggle.addEventListener("click", () => setDebugOpen(debugPanel.hidden));
document.querySelector("#debug-close").addEventListener("click", () => setDebugOpen(false));

document.querySelectorAll("[data-setting]").forEach((input) => {
  input.addEventListener("input", () => {
    const name = input.dataset.setting;
    const value = Number(input.value);
    states = {
      portrait: withSettings(states.portrait, { [name]: value }),
      landscape: withSettings(states.landscape, { [name]: value }),
    };
    document.querySelector(`[data-output="${name}"]`).textContent = input.value;
  });
});

const timeScale = document.querySelector("#time-scale");
timeScale.addEventListener("change", () => {
  const value = Number(timeScale.value);
  states = {
    portrait: withSettings(states.portrait, { timeScale: value }),
    landscape: withSettings(states.landscape, { timeScale: value }),
  };
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
  states = {
    portrait: { ...states.portrait, timeOfDayHours: value },
    landscape: { ...states.landscape, timeOfDayHours: value },
  };
  clockOutput.textContent = formatClock(value);
});
clockControl.value = String(states.landscape.timeOfDayHours);
clockOutput.textContent = formatClock(states.landscape.timeOfDayHours);
timeScale.value = String(states.landscape.settings.timeScale);

document.querySelector("#fullscreen-toggle").addEventListener("click", async () => {
  if (!document.fullscreenElement) {
    await document.documentElement.requestFullscreen?.();
  } else {
    await document.exitFullscreen?.();
  }
});

function saveAll() {
  savePersistedState(states.portrait);
  savePersistedState(states.landscape);
}

setInterval(saveAll, 12_000);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") saveAll();
});
globalThis.addEventListener("pagehide", saveAll);

document.querySelector("#reset-simulation").addEventListener("click", () => {
  clearPersistedState(states.portrait);
  clearPersistedState(states.landscape);
  states = {
    portrait: createAquariumState({ orientation: "portrait", seed, wallClockHours }),
    landscape: createAquariumState({ orientation: "landscape", seed, wallClockHours }),
  };
  timeScale.value = "1";
  clockControl.value = String(wallClockHours);
  clockOutput.textContent = formatClock(wallClockHours);
  Object.values(renderers).forEach((renderer) => renderer.reset());
  drawVisible();
});

drawVisible();
requestAnimationFrame(frame);
