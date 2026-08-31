import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function write(path, content) {
  fs.writeFileSync(path, content);
}

function replaceOnce(content, before, after, label) {
  const index = content.indexOf(before);
  if (index < 0) throw new Error(`Missing replacement anchor: ${label}`);
  if (content.indexOf(before, index + before.length) >= 0) {
    throw new Error(`Replacement anchor is not unique: ${label}`);
  }
  return content.slice(0, index) + after + content.slice(index + before.length);
}

function replaceBetween(content, startMarker, endMarker, replacement, label) {
  const start = content.indexOf(startMarker);
  if (start < 0) throw new Error(`Missing start marker: ${label}`);
  const end = content.indexOf(endMarker, start + startMarker.length);
  if (end < 0) throw new Error(`Missing end marker: ${label}`);
  return content.slice(0, start) + replacement + content.slice(end);
}

function patchRender() {
  const path = "src/render/render.js";
  let content = read(path);
  content = replaceOnce(
    content,
    'import { spriteForSeed } from "../sim/entities.js";\n',
    'import { spriteForSeed } from "../sim/entities.js";\nimport { forageActivity } from "../sim/fish-motion.js";\n',
    "render forage import",
  );
  content = replaceOnce(
    content,
    'import { glyphPixels } from "./bitmap-font.js";\n',
    'import { glyphPixels } from "./bitmap-font.js";\nimport { pitchCoordinate } from "./fish-pitch.js?v=phase1-pitch-20260830";\n',
    "render pitch import",
  );
  content = replaceOnce(
    content,
    "  individuals: 40,\n",
    "  forageDebris: 39,\n  individuals: 40,\n",
    "forage debris layer",
  );

  const poseCoordinate = `function poseCoordinate(source, column, row, {
  facing = 1,
  phase = 0,
  deformationStrength = 1,
  turnScale = 1,
  pitch = 0,
  cellAspect = CELL_HEIGHT / CELL_WIDTH,
} = {}) {
  const tail = source.width <= 1
    ? 0
    : clamp(1 - column / (source.width - 1), 0, 1);
  const displayColumn = facing < 0 ? source.width - 1 - column : column;
  const columnSpacing = 1 + Math.sin(phase + tail * 0.9) * 0.018 * deformationStrength;
  const rowSpacing = 1 + Math.sin(phase * 0.72 + column * 0.31) * 0.012 * deformationStrength;
  const localX = (displayColumn - (source.width - 1) / 2) * columnSpacing * turnScale;
  const localY = (row - (source.height - 1) / 2) * rowSpacing;
  const tailWeight = 0.1 + Math.pow(tail, 1.65) * 0.9;
  const bodyWave = Math.sin(phase - column * 0.22) * 0.145 * tailWeight * deformationStrength;
  const tailBeat = Math.sin(phase * 1.04 + 0.45) * 0.065 * Math.pow(tail, 3) * deformationStrength;
  const pitched = pitchCoordinate(localX, localY + bodyWave + tailBeat, {
    facing,
    pitch,
    cellAspect,
  });
  return {
    x: pitched.x,
    y: pitched.y,
    tail,
  };
}`;
  content = replaceBetween(
    content,
    "function poseCoordinate(source, column, row, {",
    "\n\nexport function poseSprite",
    poseCoordinate,
    "poseCoordinate",
  );

  const poseSprite = `export function poseSprite(sprite, {
  facing = 1,
  phase = 0,
  deformationStrength = 1,
  turnScale = 1,
  pitch = 0,
  cellAspect = CELL_HEIGHT / CELL_WIDTH,
} = {}) {
  const source = spritePoints(sprite);
  return source.points.map((point) => {
    const posed = poseCoordinate(source, point.column, point.row, {
      facing,
      phase,
      deformationStrength,
      turnScale,
      pitch,
      cellAspect,
    });
    return {
      char: facing < 0 ? (glyphFlip[point.char] ?? point.char) : point.char,
      mask: point.mask,
      x: posed.x,
      y: posed.y,
      tail: posed.tail,
    };
  });
}`;
  content = replaceBetween(
    content,
    "export function poseSprite(sprite, {",
    "\n\nfunction turnPose",
    poseSprite,
    "poseSprite",
  );

  const bodyFill = `function bodyFill(sprite, metrics, {
  worldX,
  worldY,
  turnScale,
  facing,
  phase,
  deformationStrength,
  pitch = 0,
  color,
  // Distance scale. It multiplies the posed offsets rather than the pose
  // itself, so the body keeps travelling with the same wave as the ink above
  // it however far away the fish is.
  scale = 1,
}) {
  const source = spritePoints(sprite);
  const box = spriteBodyBox(sprite);
  const profile = BODY_PROFILES[sprite.id] ?? DEFAULT_BODY_PROFILE;
  const centerColumn = (source.width - 1) / 2 + box.offsetX + profile.offsetX;
  const centerRow = (source.height - 1) / 2 + box.offsetY + profile.offsetY;
  const radiusX = box.radiusX * profile.radiusXScale;
  const radiusY = (box.radiusY + BODY_SWELL) * profile.radiusYScale;
  const sliceSourceWidth = (radiusX * 2) / BODY_SPANS;
  // Glyph centres compress with turnScale, but each bitmap intentionally stays
  // readable. Preserve that local ink width around each compressed slice so the
  // body does not collapse to 32% while the characters remain about 93% wide.
  const glyphScaleX = (0.9 + turnScale * 0.1) * scale;
  const cellAspect = metrics.cellHeight / metrics.cellWidth;
  const pose = { facing, phase, deformationStrength, turnScale, pitch, cellAspect };
  const fill = [];

  for (let index = 0; index < BODY_SPANS; index += 1) {
    const localLeft = -radiusX + index * sliceSourceWidth;
    const localRight = localLeft + sliceSourceWidth;
    const localCenter = (localLeft + localRight) / 2;
    const waist = radiusX > 0 ? Math.abs(localCenter) / radiusX : 0;
    // Positive source-space X is the nose because all source sprites face right.
    // Using a separate front shoulder lets pointed fish close around \\`>\\` instead
    // of carrying a round bubble beyond it, while the rear half stays unchanged.
    const shoulder = localCenter >= 0 ? profile.frontShoulder : profile.rearShoulder;
    const taper = Math.sqrt(Math.max(0, 1 - waist ** shoulder));
    const halfHeight = radiusY * taper;
    if (halfHeight <= 0) continue;

    const sourceColumn = centerColumn + localCenter;
    const center = poseCoordinate(source, sourceColumn, centerRow, pose);
    const top = poseCoordinate(source, sourceColumn, centerRow - halfHeight, pose);
    const bottom = poseCoordinate(source, sourceColumn, centerRow + halfHeight, pose);
    const leftEdge = poseCoordinate(source, centerColumn + localLeft, centerRow, pose);
    const rightEdge = poseCoordinate(source, centerColumn + localRight, centerRow, pose);

    const geometricWidth = Math.abs(rightEdge.x - leftEdge.x) * metrics.cellWidth * scale;
    const localInkWidth = sliceSourceWidth * metrics.cellWidth * glyphScaleX;
    // Narrow the end slices as well as shortening them. Besides keeping the
    // silhouette round, this preserves the old renderer contract that a body
    // cannot become a rectangular block.
    const sliceWidth = Math.max(
      2,
      Math.max(geometricWidth, localInkWidth) * (0.6 + taper * 0.4) + BODY_SLICE_OVERLAP,
    );
    const centerX = (worldX + center.x * scale) * metrics.cellWidth;

    let left;
    let right;
    let spanTop;
    let spanBottom;
    if (Math.abs(pitch) < 1e-12) {
      // Preserve the calibrated level pose exactly. Existing body profiles and
      // their registration regressions were tuned against these integer edges.
      left = Math.round(centerX - sliceWidth / 2);
      right = Math.round(centerX + sliceWidth / 2) + 1;
      spanTop = Math.round((worldY + Math.min(top.y, bottom.y) * scale) * metrics.cellHeight);
      spanBottom = Math.round((worldY + Math.max(top.y, bottom.y) * scale) * metrics.cellHeight) + 1;
    } else {
      // A pitched vertical source slice becomes a small quadrilateral. Keep the
      // production primitive axis-aligned by bounding those four posed corners
      // with one fillRect. Nine source slices still means nine rectangles.
      const corners = [
        poseCoordinate(source, centerColumn + localLeft, centerRow - halfHeight, pose),
        poseCoordinate(source, centerColumn + localLeft, centerRow + halfHeight, pose),
        poseCoordinate(source, centerColumn + localRight, centerRow - halfHeight, pose),
        poseCoordinate(source, centerColumn + localRight, centerRow + halfHeight, pose),
      ];
      const cornerLeft = (worldX + Math.min(...corners.map((point) => point.x)) * scale) * metrics.cellWidth;
      const cornerRight = (worldX + Math.max(...corners.map((point) => point.x)) * scale) * metrics.cellWidth;
      const cornerTop = (worldY + Math.min(...corners.map((point) => point.y)) * scale) * metrics.cellHeight;
      const cornerBottom = (worldY + Math.max(...corners.map((point) => point.y)) * scale) * metrics.cellHeight;
      left = Math.round(Math.min(cornerLeft, centerX - sliceWidth / 2));
      right = Math.round(Math.max(cornerRight, centerX + sliceWidth / 2)) + 1;
      spanTop = Math.round(cornerTop);
      spanBottom = Math.round(cornerBottom) + 1;
    }
    if (right - left < 1 || spanBottom - spanTop < 1) continue;

    fill.push({
      x: left,
      y: spanTop,
      width: right - left,
      height: spanBottom - spanTop,
      color,
    });
  }
  return fill;
}`;
  content = replaceBetween(
    content,
    "function bodyFill(sprite, metrics, {",
    "\n\nfunction individualParts",
    bodyFill,
    "bodyFill",
  );

  const individualParts = `function individualParts(fish, state, palette, metrics, deformationStrength = 1, {
  // Where in the water column the fish is swimming: picks the band companion
  // painted behind it.
  verticalDepth = 0,
  // How far it is from the glass: picks its size, its colour table, and how far
  // that companion has already faded into the water.
  lane = null,
  scale = 1,
} = {}) {
  const sprite = spriteForSeed(fish.seed);
  const turning = turnPose(fish);
  const masks = lane === null ? palette.masks : palette.depthLanes[lane].masks;
  const frequency = sampleRange(fish.seed, 100, 0.55, 0.78) * (0.64 + palette.daylight * 0.36);
  const phase = state.elapsedRealSeconds * TAU * frequency + sampleRange(fish.seed, 101, 0, TAU);
  const bob = Math.sin(state.elapsedRealSeconds * TAU * sampleRange(fish.seed, 102, 0.12, 0.19)
    + sampleRange(fish.seed, 103, 0, TAU)) * sampleRange(fish.seed, 104, 0.045, 0.085);
  const pitch = Number.isFinite(fish.visual?.pitch) ? fish.visual.pitch : 0;
  const cellAspect = metrics.cellHeight / metrics.cellWidth;
  const points = poseSprite(sprite, {
    facing: turning.facing,
    phase,
    deformationStrength,
    turnScale: turning.widthScale,
    pitch,
    cellAspect,
  });
  const glyphs = points.map((point) => positionedGlyph(metrics, {
    char: point.char,
    worldX: fish.x + point.x * scale,
    worldY: fish.y + point.y * scale + bob,
    fg: maskColor(point.mask, fish.seed, masks),
    scaleX: (0.9 + turning.widthScale * 0.1) * scale,
    scaleY: scale,
  }));
  const fill = bodyFill(sprite, metrics, {
    worldX: fish.x,
    worldY: fish.y + bob,
    turnScale: turning.widthScale,
    facing: turning.facing,
    phase,
    deformationStrength,
    pitch,
    scale,
    color: bodyFillForDepth(palette, verticalDepth, lane),
  });
  return { glyphs, fill };
}`;
  content = replaceBetween(
    content,
    "function individualParts(fish, state, palette, metrics, deformationStrength = 1, {",
    "\n\n// The visible water bands",
    individualParts,
    "individualParts",
  );

  const debris = `function drawForageDebris(builder, state, palette, metrics) {
  state.individuals.forEach((fish, index) => {
    const activity = forageActivity(fish, index, state);
    if (activity.peckPhase === null) return;
    const progress = activity.peckPhase;
    const count = 1 + Math.floor(sample01(fish.seed, 4700) * 4);
    const glyphs = [];
    for (let particle = 0; particle < count; particle += 1) {
      const rise = progress * sampleRange(fish.seed, 4710 + particle, 0.24, 0.62);
      const spread = sampleSigned(fish.seed, 4720 + particle) * (0.12 + progress * 0.34);
      const charChoice = sample01(fish.seed, 4730 + particle);
      const char = charChoice < 0.5 ? "." : charChoice < 0.78 ? "," : "'";
      glyphs.push(positionedGlyph(metrics, {
        char,
        worldX: fish.x + spread,
        worldY: activity.surfaceY - 0.04 - rise,
        fg: mixColor(palette.substrateBg, palette.substrateFg, 0.72),
        scaleX: sampleRange(fish.seed, 4740 + particle, 0.42, 0.58),
        scaleY: sampleRange(fish.seed, 4750 + particle, 0.42, 0.58),
      }));
    }
    addGlyphObject(builder, {
      id: \\`forage-debris:\${index}:\${fish.seed}\\`,
      layer: LAYERS.forageDebris,
      glyphs,
      padding: 1,
    });
  });
}

`;
  content = replaceOnce(
    content,
    "function drawReaction(builder, reaction, palette, metrics) {",
    debris + "function drawReaction(builder, reaction, palette, metrics) {",
    "forage debris renderer",
  );
  content = replaceOnce(
    content,
    "  drawSchool(builder, state, palette, metrics);\n  drawIndividuals(builder, state, palette, metrics, deformationStrength);",
    "  drawSchool(builder, state, palette, metrics);\n  drawForageDebris(builder, state, palette, metrics);\n  drawIndividuals(builder, state, palette, metrics, deformationStrength);",
    "forage debris render call",
  );

  const renderSpriteScene = `export function renderSpriteScene(sprite, {
  facing = "right",
  phase = 0,
  deformationStrength = 1,
  paletteMode = "day",
  staticPose = false,
  turnScale = 1,
  pitch = 0,
} = {}) {
  const { width: spriteWidth, height: spriteHeight } = spriteDimensions(sprite);
  const logicalWidth = spriteWidth + 4;
  const logicalHeight = spriteHeight + 3;
  const dimensions = {
    width: Math.round(logicalWidth * 18),
    height: Math.round(logicalHeight * 28),
    logicalWidth,
    logicalHeight,
  };
  const palette = scenePalette({ timeOfDayHours: paletteMode === "night" ? 2 : 12 });
  const builder = createSceneBuilder({
    ...dimensions,
    background: createBackground(dimensions, palette, 0x51a7, { withSubstrate: false, tankDepth: false }),
    metadata: { paletteStage: palette.paletteStage, lab: true, pitch },
  });
  const metrics = sceneMetrics(builder);
  const effectiveDeformation = staticPose ? 0 : deformationStrength;
  const facingValue = facing === "left" ? -1 : 1;
  const cellAspect = metrics.cellHeight / metrics.cellWidth;
  const points = poseSprite(sprite, {
    facing: facingValue,
    phase,
    deformationStrength: effectiveDeformation,
    turnScale,
    pitch,
    cellAspect,
  });
  const spriteSeed = individualSprites.indexOf(sprite) + 1;
  const glyphs = points.map((point) => positionedGlyph(metrics, {
    char: point.char,
    worldX: logicalWidth / 2 + point.x,
    worldY: logicalHeight / 2 + point.y,
    fg: maskColor(point.mask, spriteSeed, palette.masks),
    scaleX: 0.9 + turnScale * 0.1,
    scaleY: 1,
  }));
  addGlyphObject(builder, {
    id: \\`lab:\${sprite.id}:\${facing}\\`,
    layer: LAYERS.individuals,
    glyphs,
    fill: bodyFill(sprite, metrics, {
      worldX: logicalWidth / 2,
      worldY: logicalHeight / 2,
      turnScale,
      facing: facingValue,
      phase,
      deformationStrength: effectiveDeformation,
      pitch,
      color: bodyFillForDepth(palette, 0.5),
    }),
    padding: 3,
  });
  return finalizeScene(builder);
}`;
  content = replaceBetween(
    content,
    "export function renderSpriteScene(sprite, {",
    "\n\nexport function renderPlantLabScene",
    renderSpriteScene,
    "renderSpriteScene",
  );

  write(path, content);
}

function patchBodyProfileLab() {
  const path = "src/render/body-profile-lab.js";
  let content = read(path);
  content = replaceOnce(
    content,
    'import { glyphPixels } from "./bitmap-font.js";\n',
    'import { glyphPixels } from "./bitmap-font.js";\nimport { pitchCoordinate } from "./fish-pitch.js?v=phase1-pitch-20260830";\n',
    "body lab pitch import",
  );
  const poseCoordinate = `function poseCoordinate(source, column, row, {
  facing = 1,
  phase = 0,
  deformationStrength = 1,
  turnScale = 1,
  pitch = 0,
  cellAspect = CELL_HEIGHT / CELL_WIDTH,
} = {}) {
  const tail = source.width <= 1
    ? 0
    : clamp(1 - column / (source.width - 1), 0, 1);
  const displayColumn = facing < 0 ? source.width - 1 - column : column;
  const columnSpacing = 1 + Math.sin(phase + tail * 0.9) * 0.018 * deformationStrength;
  const rowSpacing = 1 + Math.sin(phase * 0.72 + column * 0.31) * 0.012 * deformationStrength;
  const localX = (displayColumn - (source.width - 1) / 2) * columnSpacing * turnScale;
  const localY = (row - (source.height - 1) / 2) * rowSpacing;
  const tailWeight = 0.1 + Math.pow(tail, 1.65) * 0.9;
  const bodyWave = Math.sin(phase - column * 0.22) * 0.145 * tailWeight * deformationStrength;
  const tailBeat = Math.sin(phase * 1.04 + 0.45) * 0.065 * Math.pow(tail, 3) * deformationStrength;
  return pitchCoordinate(localX, localY + bodyWave + tailBeat, {
    facing,
    pitch,
    cellAspect,
  });
}`;
  content = replaceBetween(
    content,
    "function poseCoordinate(source, column, row, {",
    "\n\nfunction inkExtent",
    poseCoordinate,
    "body lab pose",
  );

  const bodyFill = `function bodyFill(sprite, metrics, profile, {
  worldX,
  worldY,
  turnScale,
  facing,
  phase,
  deformationStrength,
  pitch = 0,
  color,
}) {
  const source = spritePoints(sprite);
  const box = spriteBodyBox(sprite);
  const centerColumn = (source.width - 1) / 2 + box.offsetX + profile.offsetX;
  const centerRow = (source.height - 1) / 2 + box.offsetY + profile.offsetY;
  const radiusX = box.radiusX * profile.radiusXScale;
  const radiusY = (box.radiusY + BODY_SWELL) * profile.radiusYScale;
  const sliceSourceWidth = (radiusX * 2) / BODY_SPANS;
  const glyphScaleX = 0.9 + turnScale * 0.1;
  const cellAspect = metrics.cellHeight / metrics.cellWidth;
  const pose = { facing, phase, deformationStrength, turnScale, pitch, cellAspect };
  const fill = [];

  for (let index = 0; index < BODY_SPANS; index += 1) {
    const localLeft = -radiusX + index * sliceSourceWidth;
    const localRight = localLeft + sliceSourceWidth;
    const localCenter = (localLeft + localRight) / 2;
    const waist = radiusX > 0 ? Math.abs(localCenter) / radiusX : 0;
    const shoulder = localCenter >= 0 ? profile.frontShoulder : profile.rearShoulder;
    const taper = Math.sqrt(Math.max(0, 1 - waist ** shoulder));
    const halfHeight = radiusY * taper;
    if (halfHeight <= 0) continue;

    const sourceColumn = centerColumn + localCenter;
    const center = poseCoordinate(source, sourceColumn, centerRow, pose);
    const top = poseCoordinate(source, sourceColumn, centerRow - halfHeight, pose);
    const bottom = poseCoordinate(source, sourceColumn, centerRow + halfHeight, pose);
    const leftEdge = poseCoordinate(source, centerColumn + localLeft, centerRow, pose);
    const rightEdge = poseCoordinate(source, centerColumn + localRight, centerRow, pose);

    const geometricWidth = Math.abs(rightEdge.x - leftEdge.x) * metrics.cellWidth;
    const localInkWidth = sliceSourceWidth * metrics.cellWidth * glyphScaleX;
    const sliceWidth = Math.max(
      2,
      Math.max(geometricWidth, localInkWidth) * (0.6 + taper * 0.4) + BODY_SLICE_OVERLAP,
    );
    const centerX = (worldX + center.x) * metrics.cellWidth;
    let left;
    let right;
    let spanTop;
    let spanBottom;
    if (Math.abs(pitch) < 1e-12) {
      left = Math.round(centerX - sliceWidth / 2);
      right = Math.round(centerX + sliceWidth / 2) + 1;
      spanTop = Math.round((worldY + Math.min(top.y, bottom.y)) * metrics.cellHeight);
      spanBottom = Math.round((worldY + Math.max(top.y, bottom.y)) * metrics.cellHeight) + 1;
    } else {
      const corners = [
        poseCoordinate(source, centerColumn + localLeft, centerRow - halfHeight, pose),
        poseCoordinate(source, centerColumn + localLeft, centerRow + halfHeight, pose),
        poseCoordinate(source, centerColumn + localRight, centerRow - halfHeight, pose),
        poseCoordinate(source, centerColumn + localRight, centerRow + halfHeight, pose),
      ];
      const cornerLeft = (worldX + Math.min(...corners.map((point) => point.x))) * metrics.cellWidth;
      const cornerRight = (worldX + Math.max(...corners.map((point) => point.x))) * metrics.cellWidth;
      const cornerTop = (worldY + Math.min(...corners.map((point) => point.y))) * metrics.cellHeight;
      const cornerBottom = (worldY + Math.max(...corners.map((point) => point.y))) * metrics.cellHeight;
      left = Math.round(Math.min(cornerLeft, centerX - sliceWidth / 2));
      right = Math.round(Math.max(cornerRight, centerX + sliceWidth / 2)) + 1;
      spanTop = Math.round(cornerTop);
      spanBottom = Math.round(cornerBottom) + 1;
    }
    if (right - left < 1 || spanBottom - spanTop < 1) continue;

    fill.push({ x: left, y: spanTop, width: right - left, height: spanBottom - spanTop, color });
  }
  return fill;
}`;
  content = replaceBetween(
    content,
    "function bodyFill(sprite, metrics, profile, {",
    "\n\nfunction boundsForObject",
    bodyFill,
    "body lab fill",
  );

  const apply = `export function applyBodyProfileToSpriteScene(scene, sprite, profile, {
  facing = "right",
  phase = 0,
  deformationStrength = 1,
  staticPose = false,
  turnScale = 1,
  pitch = 0,
} = {}) {
  const object = scene.objects.find((candidate) => candidate.id.startsWith(\\`lab:\${sprite.id}:\\`));
  if (!object) return scene;

  const normalized = normalizeTunableBodyProfile(profile, bodyProfileForSprite(sprite));
  const metrics = {
    cellWidth: scene.width / scene.logicalWidth,
    cellHeight: scene.height / scene.logicalHeight,
  };
  const effectiveDeformation = staticPose ? 0 : deformationStrength;
  const color = object.fill[0]?.color ?? "#000000";
  const fill = bodyFill(sprite, metrics, normalized, {
    worldX: scene.logicalWidth / 2,
    worldY: scene.logicalHeight / 2,
    turnScale,
    facing: facing === "left" ? -1 : 1,
    phase,
    deformationStrength: effectiveDeformation,
    pitch,
    color,
  });

  object.fill = fill;
  object.bounds = boundsForObject(scene, object, fill);
  object.signature += \\`:lab-profile:\${[
    normalized.offsetX,
    normalized.offsetY,
    normalized.radiusXScale,
    normalized.radiusYScale,
    normalized.rearShoulder,
    normalized.frontShoulder,
    pitch,
  ].join(":")}\\`;
  return scene;
}
`;
  content = replaceBetween(
    content,
    "export function applyBodyProfileToSpriteScene(scene, sprite, profile, {",
    "\n}",
    apply.trimEnd(),
    "body profile application",
  );
  // replaceBetween stops at the first closing brace after the marker. Repair by
  // slicing from the exported function marker to EOF instead, which is safe
  // because this function is the final declaration in the module.
  const applyStart = content.indexOf("export function applyBodyProfileToSpriteScene");
  const firstApply = content.slice(0, applyStart);
  content = firstApply + apply;
  write(path, content);
}

function patchSpriteLab() {
  const path = "src/sprite-sheet.js";
  let content = read(path)
    .replaceAll("visual-depth-20260830", "phase1-pitch-20260830")
    .replaceAll("final-body-profiles-20260830", "phase1-pitch-20260830");

  content = replaceOnce(
    content,
    '  phaseOutput: document.querySelector("#phase-output"),\n',
    '  phaseOutput: document.querySelector("#phase-output"),\n  pitch: document.querySelector("#pitch-control"),\n  pitchOutput: document.querySelector("#pitch-output"),\n  turn: document.querySelector("#turn-control"),\n  turnOutput: document.querySelector("#turn-output"),\n',
    "lab pitch controls",
  );

  const renderAll = `function renderAll() {
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
}`;
  content = replaceBetween(content, "function renderAll() {", "\n\nfunction setFrozen", renderAll, "lab renderAll");
  content = replaceOnce(
    content,
    "  controls.palette,\n  controls.deformation,",
    "  controls.palette,\n  controls.pitch,\n  controls.turn,\n  controls.deformation,",
    "lab pitch listeners",
  );
  write(path, content);

  const htmlPath = "sprites.html";
  let html = read(htmlPath)
    .replaceAll("fish-profile-lab-20260830", "phase1-pitch-20260830")
    .replaceAll("visual-depth-20260830", "phase1-pitch-20260830");
  html = replaceOnce(
    html,
    `      <label>Swim phase <output id="phase-output">0.00</output>
        <input id="phase-control" type="range" min="0" max="1" step="0.005" value="0">
      </label>
`,
    `      <label>Swim phase <output id="phase-output">0.00</output>
        <input id="phase-control" type="range" min="0" max="1" step="0.005" value="0">
      </label>
      <label>Pitch <output id="pitch-output">0°</output>
        <input id="pitch-control" type="range" min="-35" max="35" step="1" value="0">
      </label>
      <label>Turn width <output id="turn-output">1.00</output>
        <input id="turn-control" type="range" min="0.32" max="1" step="0.02" value="1">
      </label>
`,
    "lab html controls",
  );
  write(htmlPath, html);
}

function patchCaches() {
  for (const path of ["src/app.js", "index.html"]) {
    write(path, read(path).replaceAll("visual-depth-20260830", "phase1-pitch-20260830"));
  }
}

function patchSimulationRegression() {
  const path = "tests/simulation.test.js";
  let content = read(path);
  content = replaceOnce(
    content,
    '  assert.deepEqual(indecisive.visual, { facing: 1, targetFacing: 1, turnProgress: 1 });\n',
    '  assert.equal(indecisive.visual.facing, 1);\n  assert.equal(indecisive.visual.targetFacing, 1);\n  assert.equal(indecisive.visual.turnProgress, 1);\n  assert.ok(Number.isFinite(indecisive.visual.pitch));\n  assert.ok(Number.isFinite(indecisive.visual.targetPitch));\n',
    "existing facing regression",
  );
  write(path, content);
}

function patchReadme() {
  const path = "README.md";
  let content = read(path);
  content = replaceOnce(
    content,
    `- Six persistent individual fish with seeded traits, changing drives,
  utility-selected behavior, interaction history, and local persistence.
`,
    `- Six persistent individual fish with seeded traits, changing drives,
  utility-selected behavior, interaction history, and local persistence. Their
  body posture now exposes that behavior: meaningful climbs and dives ease into
  bounded vertical pitch, while tiny velocity noise leaves them nearly level.
- Substrate-aware foraging. Eligible individuals approach the real deterministic
  terrain contour, slow into a lateral search, carry a deliberate nose-down
  bias, make small seeded peck/dip motions, and kick up a sparse 1-4 glyph puff.
  Hunger relief begins only after the fish actually reaches that search zone.
  The first three permanently visible mid-water individuals do not select forage,
  which keeps the visibility invariant without phantom feeding above the floor.
- Curious exploration can occasionally become a brief surface inspection using
  the same pure moving-water helper as the renderer. Fish climb nose-up, slow
  below the actual swell, then return to ordinary exploration.
`,
    "README Phase 1 bullets",
  );
  content = replaceOnce(
    content,
    `World positions remain floating point through scene composition. Each visible
ASCII character becomes an independent glyph command with continuous physical
coordinates, a bitmap scale, colour, and layer. A scene object may also carry
`,
    `World positions remain floating point through scene composition. Each visible
ASCII character becomes an independent glyph command with continuous physical
coordinates, a bitmap scale, colour, and layer. Individual glyph bitmaps remain
upright and crisp when a fish pitches; the shared fish pose rotates only their
anchors after facing, body wave, and turn compression. The transform first
normalizes logical X/Y by the current physical cell aspect, so the 12x24
art-authoring proportions do not double the apparent angle in portrait,
landscape, or the motion lab. Positive simulation pitch always means nose-down,
including after a fish mirrors to face left.

The opaque body passes through that exact same pose. Its nine calibrated source
slices become nine axis-aligned bounding rectangles around the pitched slice
quadrilaterals, preserving the ESP32-friendly fillRect budget instead of adding
polygon rotation or a per-pixel mask. A level pitch takes the original integer
geometry path exactly, so existing profile calibration remains unchanged.

Fish/substrate clearance stays on the simulation side. A single shared maximum
individual visual scale is exposed from sim/config.js and the simulation uses a
conservative logical envelope for the strongest permitted pitch; it never imports
render/depth.js. Forage and surface targets then come from substrateSurfaceY()
and waterSurfaceY() respectively.

A scene object may also carry
`,
    "README pitch architecture",
  );
  content = replaceOnce(
    content,
    `  showing every static source sprite beside animated right- and left-facing
  poses, with phase, palette, deformation, anchor, bounds, and damage controls.
`,
    `  showing every static source sprite beside animated right- and left-facing
  poses, with phase, pitch (-35°..+35°), turn compression, palette, deformation,
  anchor, bounds, damage, and live body-profile controls.
`,
    "README lab controls",
  );
  write(path, content);
}

patchRender();
patchBodyProfileLab();
patchSpriteLab();
patchCaches();
patchSimulationRegression();
patchReadme();
console.log("Phase 1 source integration applied.");
