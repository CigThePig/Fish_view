import { CanvasSceneRenderer } from "./render/canvas-renderer.js?v=phase1-pitch-20260830";
import {
  applyBodyProfileToSpriteScene,
  bodyProfileForSprite,
} from "./render/body-profile-lab.js?v=phase1-pitch-20260830";
import { individualSprites, renderSpriteScene } from "./render/render.js?v=phase1-pitch-20260830";
import { spriteDimensions } from "./art/sprites.js";

const TAU = Math.PI * 2;
const UPDATE_INTERVAL_MS = 100;
const CYCLE_SECONDS = 3.4;
const views = [];
const cards = new Map();
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
  anchors: document.querySelector("#anchors-control"),
  bounds: document.querySelector("#bounds-control"),
  damage: document.querySelector("#damage-control"),
  profileFish: document.querySelector("#profile-fish-control"),
  profileFields: document.querySelector("#profile-fields"),
  profileReset: document.querySelector("#profile-reset"),
  profileResetAll: document.querySelector("#profile-reset-all"),
  profileCopy: document.querySelector("#profile-copy"),
  profileCopyAll: document.querySelector("#profile-copy-all"),
  profileOutput: document.querySelector("#profile-copy-output"),
  profileStatus: document.querySelector("#profile-copy-status"),
};

const profileState = new Map(individualSprites.map((sprite) => [sprite.id, bodyProfileForSprite(sprite)]));
let selectedProfileId = individualSprites.find((sprite) => sprite.id === "round-fin")?.id
  ?? individualSprites[0]?.id;
let frozen = false;
let currentPhase = 0;
let lastDrawAt = 0;

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
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

function selectProfile(id) {
  if (!profileState.has(id)) return;
  selectedProfileId = id;
  refreshProfileEditor();
}

const container = document.querySelector("#sprite-grid");
individualSprites.forEach((sprite) => {
  const dimensions = spriteDimensions(sprite);
  const card = document.createElement("article");
  card.className = "sprite-card";
  card.dataset.spriteId = sprite.id;
  const heading = document.createElement("div");
  heading.className = "sprite-card__heading";
  const title = document.createElement("h2");
  title.textContent = sprite.id;
  const tune = document.createElement("button");
  tune.type = "button";
  tune.className = "sprite-tune-button";
  tune.textContent = "Tune body";
  tune.addEventListener("click", () => selectProfile(sprite.id));
  heading.append(title, tune);
  const meta = document.createElement("p");
  meta.className = "sprite-meta";
  meta.textContent = sprite.source + " · " + dimensions.width + " × " + dimensions.height + " logical glyph layout";
  const row = document.createElement("div");
  row.className = "sprite-trio";

  const definitions = [
    { label: "Source / static", facing: "right", staticPose: true },
    { label: "Animated right", facing: "right", staticPose: false },
    { label: "Animated left", facing: "left", staticPose: false },
  ];
  definitions.forEach((definition) => {
    const view = makeFigure(definition.label);
    row.append(view.figure);
    views.push({ ...view, ...definition, sprite });
  });

  card.append(heading, meta, row);
  cards.set(sprite.id, card);
  container.append(card);
});

for (const sprite of individualSprites) {
  const option = document.createElement("option");
  option.value = sprite.id;
  option.textContent = sprite.id;
  controls.profileFish.append(option);
}

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
    const profile = profileState.get(selectedProfileId);
    number.value = String(profile[definition.key]);
  });

  label.append(heading, number, range);
  controls.profileFields.append(label);
  return { definition, number, range };
}

const profileInputs = PROFILE_FIELDS.map(makeProfileField);

function updateSelectedProfile(definition, value) {
  const profile = profileState.get(selectedProfileId);
  profileState.set(selectedProfileId, {
    ...profile,
    [definition.key]: value,
  });
  updateProfileOutput();
  renderAll();
}

function selectedSprite() {
  return individualSprites.find((sprite) => sprite.id === selectedProfileId);
}

function profilePayload(id) {
  const profile = profileState.get(id);
  return {
    id,
    offsetX: profile.offsetX,
    offsetY: profile.offsetY,
    radiusXScale: profile.radiusXScale,
    radiusYScale: profile.radiusYScale,
    rearShoulder: profile.rearShoulder,
    frontShoulder: profile.frontShoulder,
  };
}

function selectedProfileText() {
  return JSON.stringify(profilePayload(selectedProfileId), null, 2);
}

function allProfilesText() {
  return JSON.stringify(individualSprites.map((sprite) => profilePayload(sprite.id)), null, 2);
}

function updateProfileOutput() {
  controls.profileOutput.value = selectedProfileText();
  controls.profileStatus.textContent = "Values update live. Copy them when the silhouette looks right.";
}

function refreshProfileEditor() {
  controls.profileFish.value = selectedProfileId;
  const profile = profileState.get(selectedProfileId);
  for (const { definition, number, range } of profileInputs) {
    const value = profile[definition.key];
    number.value = String(value);
    range.value = String(value);
  }
  for (const [id, card] of cards) {
    card.classList.toggle("is-profile-selected", id === selectedProfileId);
  }
  updateProfileOutput();
}

async function copyText(text, label) {
  controls.profileOutput.value = text;
  let copied = false;
  try {
    await navigator.clipboard.writeText(text);
    copied = true;
  } catch {
    controls.profileOutput.focus();
    controls.profileOutput.select();
    try {
      copied = document.execCommand("copy");
    } catch {
      copied = false;
    }
  }
  controls.profileStatus.textContent = copied
    ? label + " copied to clipboard."
    : "Clipboard access was blocked. The exact values are selected below for manual copying.";
}

function renderAll() {
  const deformationStrength = Number(controls.deformation.value);
  const pitch = Number(controls.pitch.value);
  const turnScale = Number(controls.turn.value);
  const zoom = Number(controls.zoom.value);
  const debug = {
    anchors: controls.anchors.checked,
    bounds: controls.bounds.checked,
    damage: controls.damage.checked,
  };
  for (const view of views) {
    const phase = currentPhase * TAU;
    const scene = renderSpriteScene(view.sprite, {
      facing: view.facing,
      phase,
      deformationStrength,
      paletteMode: controls.palette.value,
      staticPose: view.staticPose,
      pitch,
      turnScale,
    });
    applyBodyProfileToSpriteScene(scene, view.sprite, profileState.get(view.sprite.id), {
      facing: view.facing,
      phase,
      deformationStrength,
      staticPose: view.staticPose,
      pitch,
      turnScale,
    });
    view.renderer.draw(scene, debug);
    view.canvas.style.width = Math.round(scene.width * zoom) + "px";
  }
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

controls.freeze.addEventListener("click", () => {
  setFrozen(!frozen);
  renderAll();
});

controls.phase.addEventListener("input", () => {
  currentPhase = Number(controls.phase.value);
  setFrozen(true);
  renderAll();
});

controls.profileFish.addEventListener("change", () => selectProfile(controls.profileFish.value));
controls.profileReset.addEventListener("click", () => {
  const sprite = selectedSprite();
  if (!sprite) return;
  profileState.set(sprite.id, bodyProfileForSprite(sprite));
  refreshProfileEditor();
  renderAll();
});
controls.profileResetAll.addEventListener("click", () => {
  for (const sprite of individualSprites) profileState.set(sprite.id, bodyProfileForSprite(sprite));
  refreshProfileEditor();
  renderAll();
});
controls.profileCopy.addEventListener("click", () => copyText(selectedProfileText(), selectedProfileId + " profile"));
controls.profileCopyAll.addEventListener("click", () => copyText(allProfilesText(), "All fish profiles"));

for (const control of [
  controls.palette,
  controls.pitch,
  controls.turn,
  controls.deformation,
  controls.zoom,
  controls.anchors,
  controls.bounds,
  controls.damage,
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

refreshProfileEditor();
renderAll();
requestAnimationFrame(frame);
