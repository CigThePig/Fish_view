import { drawBubbles } from "./bubbles.js?v=living-bubbles-20260830";
import {
  LAYERS,
  individualSprites,
  poseSprite,
  render as renderCore,
  renderPlantLabScene,
  renderSpriteScene,
} from "./render.js?v=environment-boundaries-20260830";
import {
  createSceneBuilder,
  finalizeScene,
  glyphsForObject,
  sceneMetrics,
} from "./scene.js?v=opaque-bodies-20260830";

function copyCoreObject(builder, scene, object) {
  const glyphStart = builder.glyphs.length;
  const glyphs = glyphsForObject(scene, object).map((glyph) => ({ ...glyph }));
  builder.glyphs.push(...glyphs);
  builder.objects.push({
    ...object,
    glyphStart,
    fill: object.fill.map((span) => ({ ...span })),
    bounds: { ...object.bounds },
  });
}

// Keep the mature fish/plant scene composer untouched and replace only its old
// ambient punctuation layer. This preserves the exact existing object bounds,
// fills, signatures and draw ordering while letting bubbles evolve as a small,
// independently testable subsystem.
export function render(state, options = {}) {
  const core = renderCore(state, options);
  const builder = createSceneBuilder({
    width: core.width,
    height: core.height,
    logicalWidth: core.logicalWidth,
    logicalHeight: core.logicalHeight,
    background: core.background,
    metadata: { ...core.metadata },
  });

  for (const object of core.objects) {
    if (object.id.startsWith("ambient:")) continue;
    copyCoreObject(builder, core, object);
  }

  drawBubbles(builder, state, {
    daylight: core.metadata.daylight,
    night: core.metadata.night,
    waterBands: core.background.bands.map((band) => band.color),
    ambient: state.timeOfDayHours >= 20.25 || state.timeOfDayHours < 5.75 ? "#3c2f1e" : "#74abae",
    waterline: state.timeOfDayHours >= 20.25 || state.timeOfDayHours < 5.75 ? "#8a7048" : "#58c3c4",
  }, sceneMetrics(builder), LAYERS.ambient);

  return finalizeScene(builder);
}

export {
  LAYERS,
  individualSprites,
  poseSprite,
  renderPlantLabScene,
  renderSpriteScene,
};
