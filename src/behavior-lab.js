import { CanvasSceneRenderer } from "./render/canvas-renderer.js";
import { render } from "./render/render.js";
import {
  SCENE_FIELDS,
  STEERING_FIELDS,
  constrainedSteeringEdit,
  sceneFieldsFor,
  steeringKeyLabel,
  steeringKeysFor,
} from "./dev/choreography-fields.js?v=choreography-tuning-20260902";
import {
  SHOWCASE_DEFAULT_SEED,
  SHOWCASE_SCENARIOS,
  createShowcaseState,
  showcaseScenario,
  showcaseSubjects,
  showcaseTarget,
  tickShowcase,
} from "./dev/behavior-showcase.js";
import {
  SCENE_TUNING,
  STEERING_PROFILES,
  resolvedSceneTuning,
  resolvedSteeringProfile,
  steeringDeviations,
} from "./sim/choreography-tuning.js?v=choreography-tuning-20260902";
import { hashSeed } from "./sim/prng.js";

const TICK_SECONDS = 0.1;
const query = new URLSearchParams(globalThis.location.search);
const canvas = document.querySelector("#behavior-canvas");
const renderer = new CanvasSceneRenderer(canvas);
const behaviorSelect = document.querySelector("#behavior-select");
const orientationSelect = document.querySelector("#orientation-select");
const groupsHost = document.querySelector("#tuning-groups");
const summaryOutput = document.querySelector("#tuning-summary");
const titleOutput = document.querySelector("#tuning-title");
const copyOutput = document.querySelector("#tuning-output");
const copyStatus = document.querySelector("#tuning-status");

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

// Only the fields a person has actually moved. Everything else resolves from
// the authored tables, so a reset is a delete rather than a re-copy of the
// defaults, and the source printed below lists real edits.
let tuning = { steering: {}, scene: {} };
let state;
let sequenceSeconds = 0;
let accumulator = TICK_SECONDS;
let lastFrame = performance.now();

function round(value) {
  return Number(Number(value).toFixed(4));
}

function tuningForState() {
  // A fresh object each time so the ticked state never shares a mutable map
  // with the editor.
  return {
    steering: { ...tuning.steering },
    scene: { ...tuning.scene },
  };
}

function applyTuning() {
  if (state) state = { ...state, choreographyTuning: tuningForState() };
}

function setTunedValue(control, value) {
  const { table, key } = control;
  const patch = table === "steering"
    ? constrainedSteeringEdit(resolvedSteeringProfile(state, key), control.definition.key, value)
    : { [control.definition.key]: value };
  const group = { ...(tuning[table][key] ?? {}), ...patch };
  tuning = { ...tuning, [table]: { ...tuning[table], [key]: group } };
  applyTuning();
  // A phase profile inherits every field it does not list, so editing the
  // activity profile moves the phase sliders too. Re-reading all of them keeps
  // the panel showing what the tank is actually running.
  syncFields(control);
  updateOutput();
}

function clearTuning(keys) {
  const steering = { ...tuning.steering };
  const scene = { ...tuning.scene };
  for (const key of keys) {
    delete steering[key];
    delete scene[key];
  }
  tuning = { steering, scene };
  applyTuning();
}

/* Tuning editor ---------------------------------------------------------- */

// Every control on the panel, so a single edit can refresh the ones that read
// from the value it changed.
let fieldControls = [];

function resolvedValue(control) {
  return control.table === "scene"
    ? resolvedSceneTuning(state, control.key)[control.definition.key]
    : resolvedSteeringProfile(state, control.key)[control.definition.key];
}

function showValue(control) {
  const value = resolvedValue(control);
  control.number.value = String(round(value));
  control.range.value = String(value);
}

function syncFields(except = null) {
  for (const control of fieldControls) {
    // The control being typed into keeps what the person is typing.
    if (control !== except) showValue(control);
  }
}

function makeField(table, key, definition) {
  const label = document.createElement("label");
  label.className = "tuning-field";
  label.dataset.tuningField = definition.key;

  const heading = document.createElement("span");
  heading.className = "tuning-field__heading";
  const name = document.createElement("span");
  name.textContent = definition.label;
  const hint = document.createElement("small");
  hint.textContent = definition.hint;
  heading.append(name, hint);

  const number = document.createElement("input");
  number.type = "number";
  number.className = "tuning-number";
  number.min = String(definition.min);
  number.max = String(definition.max);
  number.step = String(definition.step);
  number.setAttribute("aria-label", definition.label + " exact value");

  const range = document.createElement("input");
  range.type = "range";
  range.min = String(definition.min);
  range.max = String(definition.max);
  range.step = String(definition.step);
  range.setAttribute("aria-label", definition.label);

  const control = { table, key, definition, number, range };

  range.addEventListener("input", () => {
    number.value = range.value;
    setTunedValue(control, Number(range.value));
  });
  number.addEventListener("input", () => {
    if (number.value === "") return;
    const parsed = Number(number.value);
    if (!Number.isFinite(parsed)) return;
    const clamped = Math.max(definition.min, Math.min(definition.max, parsed));
    range.value = String(clamped);
    setTunedValue(control, clamped);
  });
  // A typed value outside the field's range is clamped before it reaches the
  // tank. Showing the number back on commit stops the panel from claiming a
  // value the simulation never used.
  number.addEventListener("change", () => showValue(control));

  label.append(heading, number, range);
  showValue(control);
  fieldControls.push(control);
  return label;
}

function makeGroup(title, note, fields) {
  const group = document.createElement("details");
  group.className = "tuning-group";
  group.open = true;
  const summary = document.createElement("summary");
  summary.textContent = title;
  const description = document.createElement("p");
  description.className = "tuning-group__note";
  description.textContent = note;
  const grid = document.createElement("div");
  grid.className = "tuning-group__fields";
  grid.append(...fields);
  group.append(summary, description, grid);
  return group;
}

function buildEditor() {
  const scenario = showcaseScenario(scenarioId);
  const activity = scenario.id;
  titleOutput.textContent = scenario.label;
  const sceneFields = sceneFieldsFor(activity);
  const steeringKeys = steeringKeysFor(activity);
  summaryOutput.textContent = sceneFields.length
    ? `${sceneFields.length} scene values and ${steeringKeys.length} steering profile`
      + `${steeringKeys.length === 1 ? "" : "s"} shape this activity.`
    : `${steeringKeys.length} steering profile${steeringKeys.length === 1 ? "" : "s"} shape this activity.`;

  const groups = [];
  fieldControls = [];

  if (sceneFields.length) {
    const fields = sceneFields.map((definition) => makeField("scene", activity, definition));
    groups.push(makeGroup(
      "Scene · " + activity,
      "Distances, speeds, and rotations that shape where the fish is asked to be.",
      fields,
    ));
  }

  for (const key of steeringKeys) {
    const fields = STEERING_FIELDS.map((definition) => makeField("steering", key, definition));
    groups.push(makeGroup(
      steeringKeyLabel(key),
      key.includes(":")
        ? "A short-lived phase of the activity. It starts from the profile above and only lists what it changes."
        : "How the steering controller answers the target: response, ceilings, and how it arrives.",
      fields,
    ));
  }

  groupsHost.replaceChildren(...groups);
  updateOutput();
}

/* Paste-ready source ------------------------------------------------------ */

function entrySource(key, values) {
  const body = Object.entries(values)
    .map(([field, value]) => `    ${field}: ${round(value)},`)
    .join("\n");
  return `  "${key}": Object.freeze({\n${body}\n  }),`;
}

// Printing only the fields the profile actually changes keeps the table
// readable and reproduces the authored entries exactly when nothing is tuned.
function steeringSource(key) {
  const deviations = steeringDeviations(state, key);
  return Object.keys(deviations).length ? entrySource(key, deviations) : null;
}

function sourceFor(activities) {
  const steering = activities
    .flatMap((activity) => steeringKeysFor(activity))
    .map(steeringSource)
    .filter(Boolean);
  const scene = activities
    .filter((activity) => SCENE_TUNING[activity])
    .map((activity) => entrySource(activity, resolvedSceneTuning(state, activity)));
  const blocks = [];
  if (steering.length) {
    blocks.push("// STEERING_PROFILES in src/sim/choreography-tuning.js\n" + steering.join("\n"));
  }
  if (scene.length) {
    blocks.push("// SCENE_TUNING in src/sim/choreography-tuning.js\n" + scene.join("\n"));
  }
  return blocks.join("\n\n");
}

function allActivities() {
  const keys = new Set([
    ...Object.keys(STEERING_PROFILES).map((key) => key.split(":")[0]),
    ...Object.keys(SCENE_FIELDS),
  ]);
  return [...keys];
}

function updateOutput() {
  copyOutput.value = sourceFor([scenarioId]);
  copyStatus.textContent = "The tank is already running these values. Copy them when the motion reads right.";
}

async function copyText(text, label) {
  copyOutput.value = text;
  let copied = false;
  try {
    await navigator.clipboard.writeText(text);
    copied = true;
  } catch {
    copyOutput.focus();
    copyOutput.select();
    try {
      copied = document.execCommand("copy");
    } catch {
      copied = false;
    }
  }
  copyStatus.textContent = copied
    ? label + " copied to clipboard."
    : "Clipboard access was blocked. The exact values are selected below for manual copying.";
}

/* Showcase loop ----------------------------------------------------------- */

function restart() {
  scenarioId = showcaseScenario(behaviorSelect.value).id;
  orientation = orientationSelect.value === "portrait" ? "portrait" : "landscape";
  state = createShowcaseState({ orientation, scenario: scenarioId, seed });
  applyTuning();
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

function reselect() {
  restart();
  buildEditor();
}

behaviorSelect.addEventListener("change", reselect);
orientationSelect.addEventListener("change", reselect);
document.querySelector("#restart-showcase").addEventListener("click", restart);

document.querySelector("#tuning-reset").addEventListener("click", () => {
  clearTuning([scenarioId, ...steeringKeysFor(scenarioId)]);
  buildEditor();
});
document.querySelector("#tuning-reset-all").addEventListener("click", () => {
  tuning = { steering: {}, scene: {} };
  applyTuning();
  buildEditor();
});
document.querySelector("#tuning-copy").addEventListener("click", () => {
  copyText(sourceFor([scenarioId]), showcaseScenario(scenarioId).label + " tuning");
});
document.querySelector("#tuning-copy-all").addEventListener("click", () => {
  copyText(sourceFor(allActivities()), "All choreography tuning");
});

restart();
buildEditor();
requestAnimationFrame(frame);
