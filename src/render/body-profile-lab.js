import { DEFAULT_BODY_PROFILE, bodyProfileForId } from "./body-profiles.js?v=true-rotation-20260902";
import { fishBodyFill } from "./fish-body.js?v=true-rotation-20260902";
import { glyphBounds } from "./scene.js?v=true-rotation-20260902";

// The editor side of the Typographic Motion Lab.
//
// It used to carry its own copy of the sprite pose, the body box and the whole
// body-fill routine - four hundred lines duplicated from the renderer, kept in
// step by a regression test that compared their output. Any argument production
// grew and the copy did not silently re-tuned profiles against a body the tank
// never draws. There is now one implementation in render/fish-body.js and this
// file only supplies the candidate profile to it, so lab geometry and
// production geometry cannot differ.

export const DEFAULT_TUNABLE_BODY_PROFILE = DEFAULT_BODY_PROFILE;

function finiteOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function bodyProfileForSprite(sprite) {
  return { ...bodyProfileForId(sprite.id) };
}

export function normalizeTunableBodyProfile(profile, fallback = DEFAULT_TUNABLE_BODY_PROFILE) {
  return {
    offsetX: finiteOr(profile?.offsetX, fallback.offsetX),
    offsetY: finiteOr(profile?.offsetY, fallback.offsetY),
    radiusXScale: Math.max(0.1, finiteOr(profile?.radiusXScale, fallback.radiusXScale)),
    radiusYScale: Math.max(0.1, finiteOr(profile?.radiusYScale, fallback.radiusYScale)),
    rearShoulder: Math.max(0.05, finiteOr(profile?.rearShoulder, fallback.rearShoulder)),
    frontShoulder: Math.max(0.05, finiteOr(profile?.frontShoulder, fallback.frontShoulder)),
  };
}

function boundsForObject(scene, object, fill, padding = 3) {
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  const end = object.glyphStart + object.glyphCount;
  for (let index = object.glyphStart; index < end; index += 1) {
    const bounds = glyphBounds(scene.glyphs[index]);
    left = Math.min(left, bounds.x);
    top = Math.min(top, bounds.y);
    right = Math.max(right, bounds.x + bounds.width);
    bottom = Math.max(bottom, bounds.y + bounds.height);
  }
  for (const span of fill) {
    left = Math.min(left, span.x);
    top = Math.min(top, span.y);
    right = Math.max(right, span.x + span.width);
    bottom = Math.max(bottom, span.y + span.height);
  }
  if (!Number.isFinite(left)) return object.bounds;
  return {
    x: left - padding,
    y: top - padding,
    width: right - left + padding * 2,
    height: bottom - top + padding * 2,
  };
}

export function applyBodyProfileToSpriteScene(scene, sprite, profile, {
  facing = "right",
  phase = 0,
  deformationStrength = 1,
  staticPose = false,
  turnScale = 1,
  pitch = 0,
} = {}) {
  const object = scene.objects.find((candidate) => candidate.id.startsWith(`lab:${sprite.id}:`));
  if (!object) return scene;

  const normalized = normalizeTunableBodyProfile(profile, bodyProfileForSprite(sprite));
  const metrics = {
    cellWidth: scene.width / scene.logicalWidth,
    cellHeight: scene.height / scene.logicalHeight,
  };
  const color = object.fill[0]?.color ?? "#000000";
  const fill = fishBodyFill(sprite, metrics, {
    worldX: scene.logicalWidth / 2,
    worldY: scene.logicalHeight / 2,
    turnScale,
    facing: facing === "left" ? -1 : 1,
    phase,
    // The workbench freezes the swim wave to judge a silhouette; the tank never
    // does, so the frozen pose is the same pose with the deformation at zero.
    deformationStrength: staticPose ? 0 : deformationStrength,
    pitch,
    color,
    profile: normalized,
  });

  object.fill = fill;
  object.bounds = boundsForObject(scene, object, fill);
  object.signature += `:lab-profile:${[
    normalized.offsetX,
    normalized.offsetY,
    normalized.radiusXScale,
    normalized.radiusYScale,
    normalized.rearShoulder,
    normalized.frontShoulder,
    pitch,
  ].join(":")}`;
  return scene;
}
