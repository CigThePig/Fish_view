import { CanvasCellRenderer } from "./render/canvas-renderer.js";
import { scenePalette } from "./render/palette.js";
import { render } from "./render/render.js";
import { clearPersistedState, loadPersistedState, savePersistedState } from "./platform/storage.js";
import { DEFAULT_SEED } from "./sim/config.js";
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
  portrait: new CanvasCellRenderer(canvases.portrait),
  landscape: new CanvasCellRenderer(canvases.landscape),
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
let sampledDirty = 0;
let sampledTotal = 0;

function visibleOrientations() {
  return currentMode === "compare" ? ["portrait", "landscape"] : [currentMode];
}

function drawVisible() {
  visibleOrientations().forEach((orientation) => {
    const state = states[orientation];
    const result = renderers[orientation].draw(render(state));
    sampledDirty += result.dirty;
    sampledTotal += result.total;
    const brightness = 0.48 + scenePalette(state).daylight * 0.52;
    canvases[orientation].style.filter = `brightness(${brightness.toFixed(3)})`;
  });
  sampledFrames += 1;
}

function updateMetrics(timestamp) {
  if (timestamp - sampleStartedAt < 1000) return;
  const seconds = (timestamp - sampleStartedAt) / 1000;
  document.querySelector("#fps-output").textContent = `${(sampledFrames / seconds).toFixed(1)} fps`;
  const dirtyPercent = sampledTotal ? (sampledDirty / sampledTotal) * 100 : 0;
  document.querySelector("#dirty-output").textContent = `${dirtyPercent.toFixed(1)}%`;
  const state = states[currentMode === "portrait" ? "portrait" : "landscape"];
  document.querySelector("#age-output").textContent = `${state.totalDays.toFixed(1)} days`;
  sampledFrames = 0;
  sampledDirty = 0;
  sampledTotal = 0;
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
