import { CanvasSceneRenderer } from "./render/canvas-renderer.js?v=true-rotation-20260902";
import {
  applyBodyProfileToSpriteScene,
  bodyProfileForSprite,
} from "./render/body-profile-lab.js?v=true-rotation-20260902";
import { individualSprites, renderSpriteScene } from "./render/render.js?v=true-rotation-20260902";
import { growthStagesFor, spriteDimensions } from "./art/sprites.js";

const TAU = Math.PI * 2;
const UPDATE_INTERVAL_MS = 100;
const CYCLE_SECONDS = 3.4;
// Roster and life-stage thumbnails are pickers, not the thing being judged, so
// they are drawn small and are not affected by the workbench zoom.
const THUMBNAIL_SCALE = 0.5;
const STRIP_SCALE = 0.45;
// The pitch sweep. A rotation regression is obvious side by side and almost
// invisible one pose at a time, so the lab draws the selected stage at every
// step of its own range, in both facings, on one row each.
const SWEEP_PITCHES = Object.freeze([-30, -20, -10, 0, 10, 20, 30]);
const SWEEP_SCALE = 0.42;

const PROFILE_FIELDS = Object.freeze([
  Object.freeze({
    key: "offsetX",
    label: "Horizontal offset",
    hint: "cells · negative moves toward the authored tail",
    min: -1.5,
    max: 1.5,
    step: 0.01,
  }),
  Object.freeze({
    key: "offsetY",
    label: "Vertical offset",
    hint: "cells · negative moves upward",
    min: -1,
    max: 1,
    step: 0.01,
  }),
  Object.freeze({
    key: "radiusXScale",
    label: "Body width",
    hint: "1.00 = saved width",
    min: 0.5,
    max: 1.5,
    step: 0.01,
  }),
  Object.freeze({
    key: "radiusYScale",
    label: "Body height",
    hint: "1.00 = saved height",
    min: 0.5,
    max: 1.5,
    step: 0.01,
  }),
  Object.freeze({
    key: "rearShoulder",
    label: "Tail-side taper",
    hint: "lower = sharper",
    min: 0.25,
    max: 6,
    step: 0.05,
  }),
  Object.freeze({
    key: "frontShoulder",
    label: "Nose taper",
    hint: "lower = sharper",
    min: 0.25,
    max: 6,
    step: 0.05,
  }),
]);

const controls = {
  freeze: document.querySelector("#freeze-toggle"),
  phase: document.querySelector("#phase-control"),
  phaseOutput: document.querySelector("#phase-output"),
  pitch: document.querySelector("#pitch-control"),
  pitchOutput: document.querySelector("#pitch-output"),
  turn: document.querySelector("#turn-control"),
  turnOutput: document.querySelector("#turn-output"),
  palette: document.querySelector("#palette-control"),
  deformation: document.querySelector("#deformation-control"),
  deformationOutput: document.querySelector("#deformation-output"),
  zoom: document.querySelector("#zoom-control"),
  zoomOutput: document.querySelector("#zoom-output"),
  sweep: document.querySelector("#pitch-sweep"),
  show: document.querySelector("#show-control"),
  spans: document.querySelector("#spans-control"),
  ink: document.querySelector("#ink-control"),
  anchors: document.querySelector("#anchors-control"),
  bounds: document.querySelector("#bounds-control"),
  damage: document.querySelector("#damage-control"),
  fish: document.querySelector("#profile-fish-control"),
  stage: document.querySelector("#profile-stage-control"),
  fields: document.querySelector("#profile-fields"),
  unavailable: document.querySelector("#profile-unavailable"),
  reset: document.querySelector("#profile-reset"),
  resetFish: document.querySelector("#profile-reset-fish"),
  resetAll: document.querySelector("#profile-reset-all"),
  copy: document.querySelector("#profile-copy"),
  copyFish: document.querySelector("#profile-copy-fish"),
  copyAll: document.querySelector("#profile-copy-all"),
  output: document.querySelector("#profile-copy-output"),
  status: document.querySelector("#profile-copy-status"),
  title: document.querySelector("#workbench-title"),
  summary: document.querySelector("#workbench-summary"),
  workbenchViews: document.querySelector("#workbench-views"),
  stageStrip: document.querySelector("#stage-strip"),
  roster: document.querySelector("#sprite-grid"),
};

// One row per species, youngest first and ending in the adult drawing itself.
// Everything the lab shows or edits is addressed through these entries, so a
// growth stage is a first-class subject rather than a strip below the adult.
const species = individualSprites.map((sprite) => ({
  id: sprite.id,
  adult: sprite,
  stages: growthStagesFor(sprite.id).map((stage) => ({
    id: stage.id,
    label: stage.label ?? "max",
    sprite: stage,
    // A fry is drawn as open ink. There is no opaque body at that size to
    // sculpt, so it stays selectable but carries no profile.
    sculptable: stage.body !== false,
  })),
}));

const speciesById = new Map(species.map((entry) => [entry.id, entry]));
const stageById = new Map(species.flatMap((entry) => entry.stages.map((stage) => [stage.id, stage])));
const profileState = new Map(
  [...stageById.values()]
    .filter((stage) => stage.sculptable)
    .map((stage) => [stage.id, bodyProfileForSprite(stage.sprite)]),
);

// Views the animation loop redraws. Roster and life-stage thumbnails are
// rebuilt when the selection changes; the three workbench canvases live for the
// whole session and only swap the sprite they draw.
const rosterViews = [];
const stripViews = [];
const workbenchViews = [];
const sweepViews = [];
const rosterCards = new Map();
const rosterThumbs = new Map();

let selectedSpeciesId = speciesById.has("round-fin") ? "round-fin" : species[0].id;
let selectedStageId = speciesById.get(selectedSpeciesId).stages.at(-1).id;
let frozen = false;
let currentPhase = 0;
let lastDrawAt = 0;

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function round(value) {
  return Number(Number(value).toFixed(4));
}

function selectedStage() {
  return stageById.get(selectedStageId);
}

function makeFigure(label) {
  const figure = document.createElement("figure");
  figure.className = "sprite-facing";
  const canvas = document.createElement("canvas");
  const caption = document.createElement("figcaption");
  caption.textContent = label;
  figure.append(canvas, caption);
  return { figure, canvas, renderer: new CanvasSceneRenderer(canvas) };
}

function select(speciesId, stageId) {
  const entry = speciesById.get(speciesId);
  if (!entry) return;
  const changedSpecies = speciesId !== selectedSpeciesId;
  selectedSpeciesId = speciesId;
  const stage = entry.stages.find((candidate) => candidate.id === stageId)
    // Holding the life stage across a species change is what makes comparing
    // two juveniles a single click instead of a hunt through two pickers.
    ?? entry.stages.find((candidate) => candidate.label === selectedStage()?.label)
    ?? entry.stages.at(-1);
  selectedStageId = stage.id;
  if (changedSpecies) buildStageStrip();
  refreshEditor();
  renderAll();
}

/* Workbench ------------------------------------------------------------- */

for (const definition of [
  { label: "Source / static", facing: "right", staticPose: true },
  { label: "Animated right", facing: "right", staticPose: false },
  { label: "Animated left", facing: "left", staticPose: false },
]) {
  const view = makeFigure(definition.label);
  controls.workbenchViews.append(view.figure);
  workbenchViews.push({ ...view, ...definition, sprite: selectedStage().sprite });
}

// One row per facing, one canvas per angle. The captions carry the angle rather
// than the fish, because what is being read here is whether the drawing turns
// evenly and symmetrically - not what species it is.
function buildPitchSweep() {
  sweepViews.length = 0;
  controls.sweep.replaceChildren();
  for (const facing of ["right", "left"]) {
    const row = document.createElement("div");
    row.className = "pitch-sweep__row";
    const label = document.createElement("p");
    label.className = "workbench__label";
    label.textContent = "Facing " + facing;
    row.append(label);
    const strip = document.createElement("div");
    strip.className = "pitch-sweep__strip";
    for (const pitch of SWEEP_PITCHES) {
      const view = makeFigure(pitch > 0 ? "+" + pitch + "°" : pitch + "°");
      strip.append(view.figure);
      sweepViews.push({
        ...view,
        sprite: selectedStage().sprite,
        facing,
        staticPose: true,
        scale: SWEEP_SCALE,
        pitchOverride: pitch,
      });
    }
    row.append(strip);
    controls.sweep.append(row);
  }
}

function buildStageStrip() {
  stripViews.length = 0;
  controls.stageStrip.replaceChildren();
  for (const stage of speciesById.get(selectedSpeciesId).stages) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "stage-chip";
    button.dataset.stageId = stage.id;
    const view = makeFigure(stage.label + (stage.sculptable ? "" : " · no body"));
    button.append(view.figure);
    button.addEventListener("click", () => select(selectedSpeciesId, stage.id));
    controls.stageStrip.append(button);
    stripViews.push({ ...view, sprite: stage.sprite, facing: "right", staticPose: false, scale: STRIP_SCALE, button });
  }
}

/* Roster ---------------------------------------------------------------- */

for (const entry of species) {
  const card = document.createElement("article");
  card.className = "sprite-card";
  card.dataset.spriteId = entry.id;

  const heading = document.createElement("div");
  heading.className = "sprite-card__heading";
  const title = document.createElement("h2");
  title.textContent = entry.id;
  const tune = document.createElement("button");
  tune.type = "button";
  tune.className = "sprite-tune-button";
  tune.textContent = "Tune body";
  tune.addEventListener("click", () => select(entry.id, null));
  heading.append(title, tune);

  const dimensions = spriteDimensions(entry.adult);
  const meta = document.createElement("p");
  meta.className = "sprite-meta";
  meta.textContent = entry.adult.source + " · " + dimensions.width + " × " + dimensions.height
    + " logical glyph layout · " + entry.stages.length + " life stages";

  const row = document.createElement("div");
  row.className = "sprite-growth";
  for (const stage of entry.stages) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "stage-chip";
    button.dataset.stageId = stage.id;
    const view = makeFigure(stage.label);
    button.append(view.figure);
    button.addEventListener("click", () => select(entry.id, stage.id));
    row.append(button);
    rosterViews.push({ ...view, sprite: stage.sprite, facing: "right", staticPose: false, scale: THUMBNAIL_SCALE });
    rosterThumbs.set(stage.id, button);
  }

  card.append(heading, meta, row);
  rosterCards.set(entry.id, card);
  controls.roster.append(card);
}

for (const entry of species) {
  const option = document.createElement("option");
  option.value = entry.id;
  option.textContent = entry.id;
  controls.fish.append(option);
}

/* Profile fields -------------------------------------------------------- */

function makeProfileField(definition) {
  const label = document.createElement("label");
  label.className = "profile-field";
  label.dataset.profileField = definition.key;

  const heading = document.createElement("span");
  heading.className = "profile-field__heading";
  const name = document.createElement("span");
  name.textContent = definition.label;
  const hint = document.createElement("small");
  hint.textContent = definition.hint;
  heading.append(name, hint);

  const number = document.createElement("input");
  number.type = "number";
  number.min = String(definition.min);
  number.max = String(definition.max);
  number.step = String(definition.step);
  number.className = "profile-number";
  number.dataset.profileNumber = definition.key;
  number.setAttribute("aria-label", definition.label + " exact value");

  const range = document.createElement("input");
  range.type = "range";
  range.min = String(definition.min);
  range.max = String(definition.max);
  range.step = String(definition.step);
  range.dataset.profileRange = definition.key;
  range.setAttribute("aria-label", definition.label);

  range.addEventListener("input", () => {
    const value = Number(range.value);
    number.value = range.value;
    updateSelectedProfile(definition, value);
  });
  number.addEventListener("input", () => {
    if (number.value === "") return;
    const value = Number(number.value);
    if (!Number.isFinite(value)) return;
    const clamped = clamp(value, definition.min, definition.max);
    range.value = String(clamped);
    updateSelectedProfile(definition, clamped);
  });
  number.addEventListener("change", () => {
    const profile = profileState.get(selectedStageId);
    if (profile) number.value = String(profile[definition.key]);
  });

  label.append(heading, number, range);
  controls.fields.append(label);
  return { definition, number, range };
}

const profileInputs = PROFILE_FIELDS.map(makeProfileField);

function updateSelectedProfile(definition, value) {
  const profile = profileState.get(selectedStageId);
  if (!profile) return;
  profileState.set(selectedStageId, { ...profile, [definition.key]: value });
  updateOutput();
  renderAll();
}

/* Copy output ----------------------------------------------------------- */

// Paste-ready source rather than JSON: the values are going straight back into
// the frozen table in body-profiles.js, and retyping them is where a tuning
// pass loses its last decimal.
function profileSource(stageId) {
  const profile = profileState.get(stageId);
  if (!profile) return null;
  const body = PROFILE_FIELDS
    .map(({ key }) => `    ${key}: ${round(profile[key])},`)
    .join("\n");
  return `  "${stageId}": Object.freeze({\n    ...DEFAULT_BODY_PROFILE,\n${body}\n  }),`;
}

// An adult and a growth stage live in different frozen tables, so the output is
// grouped by the table each entry belongs to rather than by the fish. Pasting is
// then a matter of dropping each block where its header says.
function tableFor(stageId) {
  return stageId.includes(":") ? "GROWTH_STAGE_BODY_PROFILES" : "ADULT_BODY_PROFILES";
}

function sourceFor(stageIds) {
  const tables = new Map();
  for (const stageId of stageIds) {
    const entry = profileSource(stageId);
    if (!entry) continue;
    const table = tableFor(stageId);
    tables.set(table, [...(tables.get(table) ?? []), entry]);
  }
  if (!tables.size) return "// Nothing selected carries an opaque body to sculpt.";
  return [...tables]
    .map(([table, entries]) => `// ${table} in src/render/body-profiles.js\n${entries.join("\n")}`)
    .join("\n\n");
}

function stageSource() {
  const stage = selectedStage();
  return stage.sculptable
    ? sourceFor([stage.id])
    : `// ${stage.id} is drawn as open ink and carries no opaque body to sculpt.`;
}

function fishSource() {
  return sourceFor(speciesById.get(selectedSpeciesId).stages.map((stage) => stage.id));
}

function allSource() {
  return sourceFor([...stageById.keys()]);
}

function updateOutput() {
  controls.output.value = stageSource();
  controls.status.textContent = "Values update live. Copy them when the silhouette looks right.";
}

async function copyText(text, label) {
  controls.output.value = text;
  let copied = false;
  try {
    await navigator.clipboard.writeText(text);
    copied = true;
  } catch {
    controls.output.focus();
    controls.output.select();
    try {
      copied = document.execCommand("copy");
    } catch {
      copied = false;
    }
  }
  controls.status.textContent = copied
    ? label + " copied to clipboard."
    : "Clipboard access was blocked. The exact values are selected below for manual copying.";
}

/* Editor state ---------------------------------------------------------- */

function refreshEditor() {
  const entry = speciesById.get(selectedSpeciesId);
  const stage = selectedStage();

  controls.fish.value = selectedSpeciesId;
  controls.stage.replaceChildren();
  for (const candidate of entry.stages) {
    const option = document.createElement("option");
    option.value = candidate.id;
    option.textContent = candidate.label + (candidate.sculptable ? "" : " · no opaque body");
    controls.stage.append(option);
  }
  controls.stage.value = stage.id;

  const dimensions = spriteDimensions(stage.sprite);
  const position = entry.stages.indexOf(stage) + 1;
  controls.title.textContent = entry.id + " · " + stage.label;
  controls.summary.textContent = "Life stage " + position + " of " + entry.stages.length
    + " · " + dimensions.width + " × " + dimensions.height + " logical glyph layout"
    + (stage.sculptable ? "" : " · drawn as open ink");

  const profile = profileState.get(stage.id);
  controls.fields.hidden = !profile;
  controls.unavailable.hidden = Boolean(profile);
  for (const { definition, number, range } of profileInputs) {
    number.disabled = !profile;
    range.disabled = !profile;
    if (!profile) continue;
    const value = profile[definition.key];
    number.value = String(value);
    range.value = String(value);
  }
  for (const button of [controls.reset, controls.copy]) button.disabled = !profile;

  for (const [id, card] of rosterCards) card.classList.toggle("is-selected", id === selectedSpeciesId);
  for (const [id, button] of rosterThumbs) button.classList.toggle("is-selected", id === stage.id);
  for (const view of stripViews) {
    view.button.classList.toggle("is-selected", view.button.dataset.stageId === stage.id);
  }
  for (const view of workbenchViews) view.sprite = stage.sprite;
  for (const view of sweepViews) view.sprite = stage.sprite;

  updateOutput();
}

/* Drawing --------------------------------------------------------------- */

function drawView(view, options, debug, zoom) {
  const phase = currentPhase * TAU;
  // A sweep cell fixes its own angle and ignores the pitch slider; everything
  // else follows the controls.
  const pose = view.pitchOverride === undefined
    ? options
    : { ...options, pitch: view.pitchOverride };
  const scene = renderSpriteScene(view.sprite, {
    facing: view.facing,
    phase,
    staticPose: view.staticPose,
    ...pose,
  });
  // A growth stage without an opaque body has nothing for the profile pass to
  // reshape; running it anyway would paint a black slab behind three glyphs.
  const profile = profileState.get(view.sprite.id);
  if (profile && pose.show !== "ascii") {
    applyBodyProfileToSpriteScene(scene, view.sprite, profile, {
      facing: view.facing,
      phase,
      staticPose: view.staticPose,
      ...pose,
    });
  }
  view.renderer.draw(scene, debug);
  view.canvas.style.width = Math.round(scene.width * (view.scale ?? zoom)) + "px";
}

function renderAll() {
  const deformationStrength = Number(controls.deformation.value);
  const pitch = Number(controls.pitch.value);
  const turnScale = Number(controls.turn.value);
  const zoom = Number(controls.zoom.value);
  const options = {
    deformationStrength,
    paletteMode: controls.palette.value,
    pitch,
    turnScale,
    show: controls.show.value,
  };
  const debug = {
    anchors: controls.anchors.checked,
    bounds: controls.bounds.checked,
    damage: controls.damage.checked,
    spans: controls.spans.checked,
    ink: controls.ink.checked,
  };
  // The roster and life-stage pickers are pickers: they always show the fish as
  // the tank draws it, whatever the workbench is currently isolating.
  const pickerOptions = { ...options, show: "combined" };
  for (const view of [...workbenchViews, ...sweepViews]) drawView(view, options, debug, zoom);
  for (const view of [...stripViews, ...rosterViews]) drawView(view, pickerOptions, debug, zoom);
  controls.phase.value = String(currentPhase);
  controls.phaseOutput.textContent = currentPhase.toFixed(2);
  controls.pitchOutput.textContent = pitch.toFixed(0) + "°";
  controls.turnOutput.textContent = turnScale.toFixed(2);
  controls.deformationOutput.textContent = deformationStrength.toFixed(2);
  controls.zoomOutput.textContent = zoom.toFixed(2) + "×";
}

function setFrozen(value) {
  frozen = value;
  controls.freeze.setAttribute("aria-pressed", String(frozen));
  controls.freeze.textContent = frozen ? "Resume animation" : "Freeze animation";
}

function resetStages(stages) {
  for (const stage of stages) {
    if (stage.sculptable) profileState.set(stage.id, bodyProfileForSprite(stage.sprite));
  }
  refreshEditor();
  renderAll();
}

/* Events ---------------------------------------------------------------- */

controls.freeze.addEventListener("click", () => {
  setFrozen(!frozen);
  renderAll();
});

controls.phase.addEventListener("input", () => {
  currentPhase = Number(controls.phase.value);
  setFrozen(true);
  renderAll();
});

controls.fish.addEventListener("change", () => select(controls.fish.value, null));
controls.stage.addEventListener("change", () => select(selectedSpeciesId, controls.stage.value));

controls.reset.addEventListener("click", () => resetStages([selectedStage()]));
controls.resetFish.addEventListener("click", () => resetStages(speciesById.get(selectedSpeciesId).stages));
controls.resetAll.addEventListener("click", () => resetStages([...stageById.values()]));

controls.copy.addEventListener("click", () => copyText(stageSource(), selectedStageId));
controls.copyFish.addEventListener("click", () => copyText(fishSource(), selectedSpeciesId + " life stages"));
controls.copyAll.addEventListener("click", () => copyText(allSource(), "All body profiles"));

for (const control of [
  controls.palette,
  controls.pitch,
  controls.turn,
  controls.deformation,
  controls.zoom,
  controls.anchors,
  controls.bounds,
  controls.damage,
  controls.show,
  controls.spans,
  controls.ink,
]) {
  control.addEventListener("input", renderAll);
  control.addEventListener("change", renderAll);
}

function frame(timestamp) {
  if (!frozen && timestamp - lastDrawAt >= UPDATE_INTERVAL_MS) {
    currentPhase = (timestamp / 1000 / CYCLE_SECONDS) % 1;
    lastDrawAt = timestamp;
    renderAll();
  }
  requestAnimationFrame(frame);
}

buildPitchSweep();
buildStageStrip();
refreshEditor();
renderAll();
requestAnimationFrame(frame);
