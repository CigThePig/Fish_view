import { CanvasSceneRenderer } from "./render/canvas-renderer.js";
import { render } from "./render/render.js";
import {
  SHOWCASE_DEFAULT_SEED,
  SHOWCASE_SCENARIOS,
  createShowcaseState,
  showcaseScenario,
  showcaseSubjects,
  showcaseTarget,
  tickShowcase,
} from "./dev/behavior-showcase.js";
import { hashSeed } from "./sim/prng.js";

const TICK_SECONDS = 0.1;
const query = new URLSearchParams(globalThis.location.search);
const canvas = document.querySelector("#behavior-canvas");
const renderer = new CanvasSceneRenderer(canvas);
const behaviorSelect = document.querySelector("#behavior-select");
const orientationSelect = document.querySelector("#orientation-select");

for (const scenario of SHOWCASE_SCENARIOS) {
  const option = document.createElement("option");
  option.value = scenario.id;
  option.textContent = scenario.label;
  behaviorSelect.append(option);
}

let scenarioId = showcaseScenario(query.get("activity")).id;
let orientation = query.get("orientation") === "portrait" ? "portrait" : "landscape";
const requestedSeed = query.get("seed");
// No ?seed= means the scene the capture and readability tools grade, so the
// deployed lab and the QA artifacts stay the same aquarium.
const seed = requestedSeed ? hashSeed(requestedSeed) : SHOWCASE_DEFAULT_SEED;
behaviorSelect.value = scenarioId;
orientationSelect.value = orientation;

let state;
let sequenceSeconds = 0;
let accumulator = TICK_SECONDS;
let lastFrame = performance.now();

function restart() {
  scenarioId = showcaseScenario(behaviorSelect.value).id;
  orientation = orientationSelect.value === "portrait" ? "portrait" : "landscape";
  state = createShowcaseState({ orientation, scenario: scenarioId, seed });
  sequenceSeconds = 0;
  renderer.draw(render(state));
  updateReadout();
}

function updateReadout() {
  const subjects = showcaseSubjects(state, scenarioId);
  const lead = subjects[0]?.fish;
  const target = showcaseTarget(state, scenarioId);
  const spacing = subjects.length > 1
    ? Math.hypot(subjects[0].fish.x - subjects[1].fish.x, subjects[0].fish.y - subjects[1].fish.y)
    : null;
  document.querySelector("#phase-output").textContent = target?.choreographyPhase ?? lead?.activity?.current ?? "—";
  document.querySelector("#speed-output").textContent = lead
    ? `${Math.hypot(lead.vx, lead.vy).toFixed(2)} rows/s`
    : "—";
  document.querySelector("#pitch-output").textContent = lead
    ? `${(lead.visual?.pitch ?? 0).toFixed(1)}°`
    : "—";
  document.querySelector("#spacing-output").textContent = spacing === null ? "—" : `${spacing.toFixed(2)} rows`;
  const loopSeconds = showcaseScenario(scenarioId).loopSeconds;
  document.querySelector("#loop-output").textContent = `${sequenceSeconds.toFixed(1)} / ${loopSeconds}s`;
}

function frame(timestamp) {
  accumulator += Math.min((timestamp - lastFrame) / 1000, 0.25);
  lastFrame = timestamp;
  if (accumulator >= TICK_SECONDS) {
    const delta = Math.min(accumulator, 0.25);
    state = tickShowcase(state, delta, scenarioId);
    sequenceSeconds += delta;
    accumulator = 0;
    if (sequenceSeconds >= showcaseScenario(scenarioId).loopSeconds) restart();
    else {
      renderer.draw(render(state));
      updateReadout();
    }
  }
  requestAnimationFrame(frame);
}

behaviorSelect.addEventListener("change", restart);
orientationSelect.addEventListener("change", restart);
document.querySelector("#restart-showcase").addEventListener("click", restart);

restart();
requestAnimationFrame(frame);
