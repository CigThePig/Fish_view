import { CanvasSceneRenderer } from "./render/canvas-renderer.js?v=opaque-bodies-20260830";
import { individualSprites, renderSpriteScene } from "./render/render.js?v=profile-bodies-20260830";
import { spriteDimensions } from "./art/sprites.js";

const TAU = Math.PI * 2;
const UPDATE_INTERVAL_MS = 100;
const CYCLE_SECONDS = 3.4;
const views = [];
const controls = {
  freeze: document.querySelector("#freeze-toggle"),
  phase: document.querySelector("#phase-control"),
  phaseOutput: document.querySelector("#phase-output"),
  palette: document.querySelector("#palette-control"),
  deformation: document.querySelector("#deformation-control"),
  deformationOutput: document.querySelector("#deformation-output"),
  zoom: document.querySelector("#zoom-control"),
  zoomOutput: document.querySelector("#zoom-output"),
  anchors: document.querySelector("#anchors-control"),
  bounds: document.querySelector("#bounds-control"),
  damage: document.querySelector("#damage-control"),
};

let frozen = false;
let currentPhase = 0;
let lastDrawAt = 0;

function makeFigure(label) {
  const figure = document.createElement("figure");
  figure.className = "sprite-facing";
  const canvas = document.createElement("canvas");
  const caption = document.createElement("figcaption");
  caption.textContent = label;
  figure.append(canvas, caption);
  return { figure, canvas, renderer: new CanvasSceneRenderer(canvas) };
}

const container = document.querySelector("#sprite-grid");
individualSprites.forEach((sprite) => {
  const dimensions = spriteDimensions(sprite);
  const card = document.createElement("article");
  card.className = "sprite-card";
  const title = document.createElement("h2");
  title.textContent = sprite.id;
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

  card.append(title, meta, row);
  container.append(card);
});

function renderAll() {
  const deformationStrength = Number(controls.deformation.value);
  const zoom = Number(controls.zoom.value);
  const debug = {
    anchors: controls.anchors.checked,
    bounds: controls.bounds.checked,
    damage: controls.damage.checked,
  };
  for (const view of views) {
    const scene = renderSpriteScene(view.sprite, {
      facing: view.facing,
      phase: currentPhase * TAU,
      deformationStrength,
      paletteMode: controls.palette.value,
      staticPose: view.staticPose,
    });
    view.renderer.draw(scene, debug);
    view.canvas.style.width = Math.round(scene.width * zoom) + "px";
  }
  controls.phase.value = String(currentPhase);
  controls.phaseOutput.textContent = currentPhase.toFixed(2);
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

for (const control of [
  controls.palette,
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

renderAll();
requestAnimationFrame(frame);