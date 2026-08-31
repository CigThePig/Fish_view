import { renderPlantLabScene } from "../src/render/render.js";
import { glyphsForObject } from "../src/render/scene.js";

const SPECIES = [
  "tall-forkgrass",
  "split-reed",
  "long-kelp",
  "ribbon-kelp",
  "leaf-reed",
  "long-frond",
  "forked-grass",
  "feather-weed",
  "lantern-weed",
  "bell-frond",
];

const BIN_X = 8;
const BIN_Y = 16;

function plot(canvas, x, y, char) {
  const row = Math.max(0, Math.min(canvas.length - 1, Math.floor(y / BIN_Y)));
  const column = Math.max(0, Math.min(canvas[0].length - 1, Math.floor(x / BIN_X)));
  canvas[row][column] = char;
}

function drawSkeleton(canvas, line) {
  const dx = line.x2 - line.x1;
  const dy = line.y2 - line.y1;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 5));
  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps;
    plot(canvas, line.x1 + dx * t, line.y1 + dy * t, "·");
  }
}

function snapshot(speciesId, orientation = "landscape") {
  const scene = renderPlantLabScene(speciesId, {
    orientation,
    size: "maximum",
    currentMultiplier: 1,
    elapsedRealSeconds: 6.3,
    seed: 901,
  });
  const width = Math.ceil(scene.width / BIN_X);
  const height = Math.ceil(scene.height / BIN_Y);
  const canvas = Array.from({ length: height }, () => Array(width).fill(" "));

  for (const line of scene.metadata.skeletonLines) drawSkeleton(canvas, line);
  const objects = scene.objects.filter((object) => object.id.startsWith("plant-lab:"));
  for (const object of objects) {
    for (const glyph of glyphsForObject(scene, object)) {
      plot(canvas, glyph.x + glyph.width / 2, glyph.y + glyph.height / 2, glyph.char);
    }
  }

  const body = canvas
    .map((row) => row.join("").replace(/\s+$/u, ""))
    .join("\n")
    .replace(/\n+$/u, "");
  return [
    `${speciesId} / ${orientation} / skeleton overlay`,
    `active joints: ${scene.metadata.plants.activeJoints}; rendered glyphs: ${scene.metadata.plants.glyphs}; max specimen glyphs: ${scene.metadata.plants.maximumGlyphs}`,
    body,
  ].join("\n");
}

for (const speciesId of SPECIES) {
  console.log("\n" + snapshot(speciesId));
}
console.log("\n" + snapshot("tall-forkgrass", "portrait"));
console.log("\n" + snapshot("split-reed", "portrait"));
