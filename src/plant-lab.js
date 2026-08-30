import { PLANT_SPECIES } from "./art/plants.js";
import { CanvasSceneRenderer } from "./render/canvas-renderer.js";
import { renderPlantLabScene } from "./render/render.js";
import { mix32 } from "./sim/prng.js";

const UPDATE_INTERVAL_MS = 100;
const controls = {
  freeze: document.querySelector("#freeze-toggle"),
  orientation: document.querySelector("#orientation-control"),
  palette: document.querySelector("#palette-control"),
  size: document.querySelector("#size-control"),
  current: document.querySelector("#current-control"),
  disturbance: document.querySelector("#disturbance-control"),
  variation: document.querySelector("#variation-control"),
  quality: document.querySelector("#quality-control"),
  skeleton: document.querySelector("#skeleton-control"),
  bounds: document.querySelector("#bounds-control"),
  damage: document.querySelector("#damage-control"),
};

const views = [];
const container = document.querySelector("#plant-grid");
let frozen = false;
let frozenTime = 0;
let lastDrawAt = 0;

for (const [index, species] of PLANT_SPECIES.entries()) {
  const card = document.createElement("article");
  card.className = "plant-card";
  const heading = document.createElement("div");
  heading.className = "plant-card__heading";
  const title = document.createElement("h2");
  title.textContent = species.name;
  const meta = document.createElement("p");
  meta.textContent = `${species.layer} · ${species.joints.length - 1} joints max · ${species.rare ? "uncommon" : species.family}`;
  heading.append(title, meta);
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-label", `${species.name}: seedling and mature skeletal ASCII plant`);
  const ages = document.createElement("div");
  ages.className = "plant-card__ages";
  ages.innerHTML = "<span>Seedling</span><span>Mature</span>";
  card.append(heading, canvas, ages);
  container.append(card);
  views.push({
    index,
    species,
    card,
    renderer: new CanvasSceneRenderer(canvas),
    visible: true,
  });
}

if ("IntersectionObserver" in globalThis) {
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const view = views.find((candidate) => candidate.card === entry.target);
      if (view) view.visible = entry.isIntersecting;
    }
  }, { rootMargin: "180px" });
  for (const view of views) observer.observe(view.card);
}

function renderVisible(timeSeconds) {
  const variation = Number(controls.variation.value);
  const debug = {
    skeleton: controls.skeleton.checked,
    bounds: controls.bounds.checked,
    damage: controls.damage.checked,
  };
  let rendered = 0;
  let joints = 0;
  let glyphs = 0;
  for (const view of views) {
    if (!view.visible) continue;
    const seed = mix32(0x51a7 ^ Math.imul(view.index + 1, 0x9e3779b1) ^ Math.imul(variation + 1, 0x85ebca6b));
    const scene = renderPlantLabScene(view.species.id, {
      orientation: controls.orientation.value,
      paletteMode: controls.palette.value,
      elapsedRealSeconds: timeSeconds,
      seed,
      size: controls.size.value,
      currentMultiplier: Number(controls.current.value),
      disturbance: controls.disturbance.value,
      quality: Number(controls.quality.value),
    });
    view.renderer.draw(scene, debug);
    rendered += 1;
    joints += scene.metadata.plants.activeJoints;
    glyphs += scene.metadata.plants.glyphs;
  }
  document.querySelector("#lab-metrics").textContent = `${PLANT_SPECIES.length} species · ${rendered} visible cards · ${joints} active joints · ${glyphs} plant glyphs in visible cards`;
}

function setFrozen(value, timeSeconds) {
  frozen = value;
  if (value) frozenTime = timeSeconds;
  controls.freeze.setAttribute("aria-pressed", String(value));
  controls.freeze.textContent = value ? "Resume animation" : "Freeze animation";
}

controls.freeze.addEventListener("click", () => {
  setFrozen(!frozen, performance.now() / 1000);
  renderVisible(frozen ? frozenTime : performance.now() / 1000);
});

for (const control of Object.values(controls).filter((item) => item !== controls.freeze)) {
  control.addEventListener("input", () => renderVisible(frozen ? frozenTime : performance.now() / 1000));
  control.addEventListener("change", () => renderVisible(frozen ? frozenTime : performance.now() / 1000));
}

function frame(timestamp) {
  if (!frozen && timestamp - lastDrawAt >= UPDATE_INTERVAL_MS) {
    lastDrawAt = timestamp;
    renderVisible(timestamp / 1000);
  }
  requestAnimationFrame(frame);
}

renderVisible(0);
requestAnimationFrame(frame);

