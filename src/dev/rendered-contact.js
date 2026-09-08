import { spriteMouthOffset } from "../art/sprites.js";
import { spriteForFish } from "../sim/fish-growth.js";
import { glyphPixelRects } from "../render/glyph-raster.js";
import { glyphsForObject } from "../render/scene.js";

// Lowest clearance over every painted span and every terrain segment it
// overlaps. A centre-height sample misses slopes; glyphs alone miss opaque
// belly pixels. This intentionally measures the panel, independently of the
// simulation's conservative clearance model.
export function paintedSurfaceGap(scene, rectangles, depth = 0) {
  let gap = Infinity;
  for (const rectangle of rectangles) {
    for (const segment of scene.background.substrateSegments) {
      if (rectangle.x >= segment.x + segment.width || rectangle.x + rectangle.width <= segment.x) continue;
      const front = scene.height - 0.48 * (scene.height / scene.logicalHeight);
      const ground = segment.y + (front - segment.y) * depth;
      gap = Math.min(gap, ground - rectangle.y - rectangle.height);
    }
  }
  return gap / (scene.height / scene.logicalHeight);
}

export function renderedFeedingContact(scene, fish, index, {
  mouthIndex = spriteMouthOffset(spriteForFish(fish)).glyph,
  rasterize = glyphPixelRects,
} = {}) {
  const object = scene.objects.find((candidate) => candidate.id === `individual:${index}:${fish.seed}`);
  if (!object) throw new Error(`Missing rendered individual ${index}:${fish.seed}`);
  const glyphs = glyphsForObject(scene, object);
  const mouth = glyphs[mouthIndex];
  if (!mouth) throw new Error("The rendered fish is missing its authored mouth glyph");
  const depth = Math.max(0, Math.min(1, (object.layer - 20) / 36));
  const glyphBurial = -paintedSurfaceGap(scene, glyphs.flatMap(rasterize), depth);
  const bodyBurial = -paintedSurfaceGap(scene, object.fill, depth);
  return { mouth: paintedSurfaceGap(scene, rasterize(mouth), depth), glyphBurial, bodyBurial,
    buried: Math.max(glyphBurial, bodyBurial) };
}
