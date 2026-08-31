import { glyphFlip, mirrorRows, normalizeRows } from "../art/mirror.js";
import { PLANT_SPECIES_BY_ID } from "../art/plants.js";
import {
  individualSprites,
  schoolGlyphs,
  spriteDimensions,
  substrateArt,
} from "../art/sprites.js";
import { CELL_HEIGHT, CELL_WIDTH, orientationConfig, SUBSTRATE_ROWS, WATERLINE_ROWS } from "../sim/config.js";
import {
  SUBSTRATE_RELIEF_ROWS,
  SURFACE_WAVE_CURVATURE,
  SURFACE_WAVE_ROWS,
  SURFACE_Y_ROWS,
  substrateSurfaceY,
  surfaceWaveCurvature,
  surfaceWaveOffset,
  surfaceWaveSlope,
} from "../sim/environment.js";
import { spriteForSeed } from "../sim/entities.js";
import { forageActivity } from "../sim/fish-motion.js";
import { createPlantFrameContext, createPlantSpecimen } from "../sim/plants.js";
import { sample01, sampleRange, sampleSigned } from "../sim/prng.js";
import { glyphPixels } from "./bitmap-font.js";
import { pitchCoordinate } from "./fish-pitch.js?v=phase1-pitch-20260830";
import { drawBubbles } from "./bubbles.js?v=visual-depth-20260830";
import { BODY_PROFILES, DEFAULT_BODY_PROFILE } from "./body-profiles.js?v=final-body-profiles-20260830";
import {
  depthScale,
  laneForDepth,
  schoolDepthScale,
  scatteredDepth,
  spreadDepth,
} from "./depth.js?v=visual-depth-20260830";
import { bodyFillForDepth, mixColor, MASK_SYMBOLS, scenePalette } from "./palette.js?v=visual-depth-20260830";
import {
  addPlantRecord,
  createPlantRenderRecords,
  plantRenderRecord,
  skeletonLinesForRecord,
} from "./plants.js?v=visual-depth-20260830";
import {
  addGlyphObject,
  createSceneBuilder,
  finalizeScene,
  positionedGlyph,
  sceneMetrics,
} from "./scene.js?v=opaque-bodies-20260830";

const TAU = Math.PI * 2;
const BAYER_4 = Object.freeze([
  Object.freeze([0, 8, 2, 10]),
  Object.freeze([12, 4, 14, 6]),
  Object.freeze([3, 11, 1, 9]),
  Object.freeze([15, 7, 13, 5]),
]);

export const LAYERS = Object.freeze({
  // Sunlight is behind everything, the water surface included: a shaft is the
  // water being lit, not something floating in front of it.
  shafts: 5,
  waterline: 10,
  backgroundPlants: 20,
  // The far end of the school swims behind the midground weed rather than in
  // front of it. Something passing behind a plant is the one depth cue no
  // amount of colour work can fake.
  deepSchool: 22,
  midgroundPlants: 24,
  ambient: 25,
  // The nearer four school lanes stack on 30..33 and the five individual lanes
  // on 40..44. The six named individuals stay between the midground and
  // foreground vegetation at every distance: they are the characters, and an
  // opaque fish disappearing behind a weed reads as a bug rather than as depth.
  school: 30,
  forageDebris: 39,
  individuals: 40,
  reaction: 45,
  foregroundPlants: 50,
  substrate: 60,
});

// Sunlight entering a tank is cheap volume: a handful of tilted, widening,
// fading rectangles behind everything that swims. They are sliced into steps
// down the water column and each step is its own scene object, because the
// swell overhead only really moves the top of a shaft and a whole-column
// object would repaint four hundred pixels of still water to say so.
const SHAFT_STEPS = 11;
const SHAFT_MAX_TILT = 0.3;
// The sun's own direction, quantized to two-hour stages. That is the same
// trick as the 12 palette stages: the lean itself is a slow, coarse clock, and
// everything that moves shaft to shaft between its ticks comes from the water.
const SHAFT_STAGE_HOURS = 2;
// Sunlight in water is a suggestion, not a spotlight. Keeping the peak mix low
// is what stops the steps in the taper from reading as stacked blocks.
const SHAFT_MINIMUM = 0.008;
const SHAFT_PEAK = 0.15;
// Fresh water. Every coupling between the swell and the shafts below is some
// consequence of light crossing this boundary.
const WATER_IOR = 1.333;
// A crest is met earlier along a leaning ray than the still surface would have
// been, so the beam enters behind where it otherwise would. This is the term
// that makes the swell move a shaft sideways rather than merely pinch it, and
// it is the sun's lean that scales it: a shaft under a low sun wanders as the
// crests pass, and one under a noon sun barely does. Strictly the shift is the
// crest height times that lean, which is a pixel or two on a panel this size,
// so it is amplified the same way the lean itself already is.
const SHAFT_ENTRY_GAIN = 9;
// Snell on the facet: the beam bends by a fixed fraction of the facet's own
// slope, and keeps drifting sideways the deeper it goes. Unlike the entry
// shift this one does not care where the sun is, so it stays near its true
// strength - it is the small residue of movement a shaft keeps at noon.
const SHAFT_BEND_GAIN = 1;
// A crest is a converging lens and a trough a diverging one. Light a narrowed
// shaft no longer spends on width it spends on brightness.
const SHAFT_FOCUS_GAIN = 0.42;
const SHAFT_FOCUS_MIN = 0.58;
const SHAFT_FOCUS_MAX = 1.45;
const SHAFT_FOCUS_LIGHT = 0.8;
// Facets turned into the sun collect more of it than facets turned away. This
// is the half of the coupling that flips between morning and evening instead
// of merely pulsing, and it vanishes at noon when the light is straight down.
const SHAFT_FACET_GAIN = 2.5;
// How far down the column any of that still applies. One facet shapes the
// light it lets through; a few metres further down the beam has crossed enough
// of them for their deflections to average out, which is why real caustics are
// sharp near the surface and a steady glow below it. It is also what keeps the
// still half of every shaft off the dirty-rectangle list.
const SHAFT_COUPLE_REACH = 0.5;
// The swell runs at the frame rate; the shafts read it three times a second,
// staggered so no two shafts re-read it on the same frame. Light on water is
// slow and soft, the shaft mix peaks at 15%, and this is the difference
// between four tall objects repainting every frame and one of them doing so.
const SHAFT_WAVE_HZ = 1.5;
// The floor recedes towards the water it meets. Four slabs is enough to read as
// a ground plane and cheap enough to stay full width.
const FLOOR_STEPS = 4;
const FLOOR_LIFT = 0.5;
// A little falloff at the left and right edges turns six horizontal bands into
// a volume with a front pane.
const EDGE_STEPS = 3;
const EDGE_FRACTION = 0.12;
const EDGE_STRENGTH = 0.3;
// The water surface is re-cut along the swell one narrow column at a time, the
// same trick the terrain crest uses at the other end of the tank. Four pixels
// is fine enough that the crest never steps visibly and coarse enough that a
// whole surface costs about as many rectangles as the floor does.
const SURFACE_SAMPLE_PX = 4;
// Damage granularity along the surface. The swell moves every frame, so this
// only decides how few, how wide the repainted strips are.
const SURFACE_CHUNK_PX = 120;
// The lit meniscus and the sunlit water immediately under it.
const SURFACE_INK_PX = 2;
const SURFACE_SKIN_PX = 3;
const SURFACE_SHEEN_FLOOR = 0.16;
const SURFACE_SHEEN_GAIN = 0.52;
const SURFACE_SKIN_FLOOR = 0.05;
const SURFACE_SKIN_GAIN = 0.13;
// A slow travelling brightness that breaks the meniscus into glints instead of
// leaving it an even ribbon.
const SURFACE_GLINT_SPAN = 6.7;
const SURFACE_GLINT_DRIFT = 0.38;
// Surface chop, in glyphs. Spaced closely enough to read as one broken line.
const SURFACE_RIPPLE_SPACING = 3.6;
const SURFACE_RIPPLE_DRIFT = 0.18;
const SURFACE_RIPPLE_DROP = 0.5;

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function smoothstep(value) {
  const amount = clamp(value, 0, 1);
  return amount * amount * (3 - 2 * amount);
}

function positiveModulo(value, modulus) {
  return ((value % modulus) + modulus) % modulus;
}

// Takes the mask table rather than the palette, because a fish is coloured from
// the table for the depth lane it is swimming in, not from the scene default.
function maskColor(symbol, seed, masks) {
  if (!symbol || symbol === " ") return masks.C;
  if (symbol === "4" || symbol === "W" || symbol === "w") return masks.W;
  if (/^[1-9]$/.test(symbol)) {
    const slot = Number(symbol);
    const choice = Math.floor(sample01(seed, slot * 37) * MASK_SYMBOLS.length) % MASK_SYMBOLS.length;
    return masks[MASK_SYMBOLS[choice]];
  }
  return masks[symbol] ?? masks.C;
}

const spritePointCache = new Map();

function spritePoints(sprite) {
  if (spritePointCache.has(sprite.id)) return spritePointCache.get(sprite.id);
  const { width, height } = spriteDimensions(sprite);
  const shape = normalizeRows(sprite.shape, width);
  const mask = normalizeRows(sprite.mask, width);
  const points = [];
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const char = [...shape[row]][column];
      if (!char || char === " ") continue;
      points.push({ char, mask: [...mask[row]][column], column, row });
    }
  }
  const result = Object.freeze({ id: sprite.id, width, height, points: Object.freeze(points) });
  spritePointCache.set(sprite.id, result);
  return result;
}

// One pose function owns the geometry for both glyphs and the opaque body.
// Keeping this shared is important: the fish flexes by column, so any underlay
// generated from a separate rigid transform will visibly drift behind the ink.
function poseCoordinate(source, column, row, {
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
    spriteId: source.id,
    column,
    row,
    width: source.width,
    height: source.height,
  });
  return {
    x: pitched.x,
    y: pitched.y,
    tail,
  };
}

export function poseSprite(sprite, {
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
}

function turnPose(fish) {
  const visual = fish.visual ?? {
    facing: fish.vx < 0 ? -1 : 1,
    targetFacing: fish.vx < 0 ? -1 : 1,
    turnProgress: 1,
  };
  if (visual.turnProgress >= 1) return { facing: visual.targetFacing, widthScale: 1 };
  if (visual.turnProgress < 0.5) {
    return {
      facing: visual.facing,
      widthScale: 1 - smoothstep(visual.turnProgress * 2) * 0.68,
    };
  }
  return {
    facing: visual.targetFacing,
    widthScale: 0.32 + smoothstep((visual.turnProgress - 0.5) * 2) * 0.68,
  };
}

// How far a given horizontal position is dimmed by the tank's side falloff.
// Used by the explicit edge rectangles, by the per-column terrain segments and
// water surface, which are already split finely enough to be shaded in place,
// and by the sun shafts, which are painted over the falloff and so have to
// carry it themselves. Exported because it is part of how the scene composes:
// anything that paints its own water has to know what the pane took out of it.
export function edgeDimming(x, width) {
  const margin = width * EDGE_FRACTION;
  if (margin <= 0) return 0;
  const distance = Math.min(x, width - x);
  if (distance >= margin) return 0;
  const step = Math.floor((distance / margin) * EDGE_STEPS);
  return EDGE_STRENGTH * (1 - step / EDGE_STEPS);
}

// `tankDepth` is what separates the aquarium from the two labs. The labs exist
// to judge artwork, so they get the water and the terrain but never the sun
// shafts or the side falloff: a reference view has to show the ink, not the
// room it is standing in.
function createBackground(dimensions, palette, seed, {
  withSubstrate = true,
  tankDepth = true,
} = {}) {
  const metrics = sceneMetrics(dimensions);
  const surfaceTop = withSubstrate ? SURFACE_Y_ROWS * metrics.cellHeight : 0;
  const waterBottom = withSubstrate
    ? Math.min(
      dimensions.height,
      (dimensions.logicalHeight - SUBSTRATE_ROWS + SUBSTRATE_RELIEF_ROWS) * metrics.cellHeight,
    )
    : dimensions.height;
  const waterHeight = Math.max(1, waterBottom - surfaceTop);
  const bandHeight = waterHeight / palette.waterBands.length;
  const bands = palette.waterBands.map((color, index) => ({
    y: surfaceTop + index * bandHeight,
    height: index === palette.waterBands.length - 1
      ? waterBottom - (surfaceTop + index * bandHeight)
      : bandHeight,
    color,
  }));
  const transitions = bands.slice(1).map((band, index) => ({
    y: band.y,
    height: Math.min(18, metrics.cellHeight * 0.72),
    from: bands[index].color,
    to: band.color,
    matrix: BAYER_4,
    blockSize: 4,
  }));
  const substrateSegments = [];
  const floorSlabs = [];
  if (withSubstrate) {
    const terrainState = {
      seed,
      cols: dimensions.logicalWidth,
      rows: dimensions.logicalHeight,
    };
    const samplesPerCell = 2;
    const sampleWidth = metrics.cellWidth / samplesPerCell;
    const sampleCount = Math.ceil(dimensions.logicalWidth * samplesPerCell);
    for (let sample = 0; sample < sampleCount; sample += 1) {
      const worldX = (sample + 0.5) / samplesPerCell;
      const top = clamp(
        substrateSurfaceY(terrainState, worldX) * metrics.cellHeight,
        0,
        dimensions.height,
      );
      substrateSegments.push({
        x: sample * sampleWidth,
        y: top,
        width: sampleWidth + 1,
        height: dimensions.height - top,
        // The terrain crest is the far edge of the floor, and the side falloff
        // is folded straight into its colour because the segments are already
        // one narrow column each.
        color: tankDepth
          ? mixColor(
            palette.substrateBg,
            palette.edge,
            edgeDimming(sample * sampleWidth + sampleWidth / 2, dimensions.width),
          )
          : palette.substrateBg,
      });
    }
    // Below the lowest possible crest the floor is unbroken, so its recession
    // is a few full-width slabs instead of another per-column pass. The strip
    // nearest the bottom of the panel is the part closest to the viewer.
    const slabTop = clamp(waterBottom, 0, dimensions.height);
    const slabHeight = (dimensions.height - slabTop) / FLOOR_STEPS;
    if (slabHeight >= 1) {
      for (let step = 0; step < FLOOR_STEPS; step += 1) {
        const y = Math.round(slabTop + step * slabHeight);
        floorSlabs.push({
          x: 0,
          y,
          width: dimensions.width,
          height: Math.round(slabTop + (step + 1) * slabHeight) - y,
          // The first slab is the crest colour exactly, so the ground plane
          // brightens away from the water instead of starting with a seam.
          color: mixColor(
            palette.substrateBg,
            palette.floorNear,
            FLOOR_LIFT * (step / (FLOOR_STEPS - 1)),
          ),
        });
      }
    }
  }
  // One falloff rectangle per side, per step, for every horizontal zone that is
  // painted full width. Terrain segments shade themselves above.
  const edges = [];
  const stepWidth = (dimensions.width * EDGE_FRACTION) / EDGE_STEPS;
  if (tankDepth && stepWidth >= 1) {
    for (const zone of [...bands, ...floorSlabs]) {
      for (let step = 0; step < EDGE_STEPS; step += 1) {
        const amount = EDGE_STRENGTH * (1 - step / EDGE_STEPS);
        const color = mixColor(zone.color, palette.edge, amount);
        const left = Math.round(step * stepWidth);
        const right = Math.round((step + 1) * stepWidth);
        const height = zone.height + 1;
        edges.push({ x: left, y: zone.y, width: right - left, height, color });
        edges.push({ x: dimensions.width - right, y: zone.y, width: right - left, height, color });
      }
    }
  }
  return {
    signature: [
      dimensions.width,
      dimensions.height,
      dimensions.logicalWidth,
      dimensions.logicalHeight,
      palette.paletteStage,
      seed >>> 0,
      withSubstrate ? 1 : 0,
      tankDepth ? 1 : 0,
    ].join(":"),
    baseColor: withSubstrate ? palette.airBg : palette.waterBands[0],
    bands,
    transitions,
    // The sun shafts are scene objects rather than background rectangles now,
    // and they need the same water box the bands were cut from.
    surfaceTop,
    waterBottom,
    edges,
    substrateSegments,
    floorSlabs,
  };
}

function builderForState(state, palette) {
  const target = orientationConfig(state.orientation);
  const dimensions = {
    width: target.pixelWidth,
    height: target.pixelHeight,
    logicalWidth: state.cols,
    logicalHeight: state.rows,
  };
  return createSceneBuilder({
    ...dimensions,
    background: createBackground(dimensions, palette, state.seed),
    metadata: {
      orientation: state.orientation,
      paletteStage: palette.paletteStage,
      daylight: palette.daylight,
      night: palette.night,
      recommendedBacklight: palette.recommendedBacklight,
      elapsedRealSeconds: state.elapsedRealSeconds,
    },
  });
}

// Sunlight reaches the tank through the swell, so the swell is what moves it.
// Each shaft samples the wave at its own entry column and takes three things
// from it: the height of the water there slides the entry point along the
// sun's lean, the slope of that facet bends the beam under it, and the
// curvature of the facet focuses or spreads it. Two of the three are scaled by
// the lean, so the coupling changes character across the day - at noon a
// passing crest mostly pinches a shaft narrower and brighter, while under a
// low sun the same crest also swings it sideways and lights the flanks turned
// towards the light more than the flanks turned away.
function drawSunShafts(builder, state, palette, metrics) {
  const { bands, surfaceTop, waterBottom } = builder.background;
  const width = builder.width;
  const waterHeight = Math.max(1, waterBottom - surfaceTop);
  const strength = SHAFT_PEAK * (0.16 + palette.daylight * 0.84);
  const count = state.cols > 50 ? 4 : 3;
  const stages = 24 / SHAFT_STAGE_HOURS;
  const stage = Math.floor(positiveModulo(state.timeOfDayHours, 24) / SHAFT_STAGE_HOURS);
  // Morning light leans one way, evening light the other, on a clock coarse
  // enough that the direction itself never animates.
  const tilt = (((stage + 0.5) / stages) - 0.5) * 2 * SHAFT_MAX_TILT;
  // The same lean as a plain gradient - pixels sideways per pixel of descent -
  // and its steeper counterpart above the water, where nothing has refracted
  // it yet. Both are what the surface geometry gets multiplied by.
  const lean = (tilt * width) / waterHeight;
  const airLean = lean * WATER_IOR;
  // The swell is measured in rows per column and the shafts in pixels.
  const aspect = metrics.cellHeight / metrics.cellWidth;
  const stepHeight = waterHeight / SHAFT_STEPS;
  const beat = 1 / SHAFT_WAVE_HZ;

  for (let index = 0; index < count; index += 1) {
    const originX = sampleRange(state.seed, 5200 + index, 0.1, 0.9) * width;
    const coreWidth = sampleRange(state.seed, 5300 + index, 0.018, 0.038) * width;
    const brightness = sampleRange(state.seed, 5400 + index, 0.55, 1);
    // This shaft's own slot in the sampling clock. Each one reads the swell as
    // it stood at the last tick of its slot, so the four of them take turns.
    const slot = (index * beat) / count;
    const swell = {
      seed: state.seed,
      elapsedRealSeconds: Math.floor((state.elapsedRealSeconds + slot) / beat) * beat - slot,
    };
    const worldX = originX / metrics.cellWidth;
    const offset = surfaceWaveOffset(swell, worldX);
    const slope = surfaceWaveSlope(swell, worldX) * aspect;
    const curve = clamp(surfaceWaveCurvature(swell, worldX) / SURFACE_WAVE_CURVATURE, -1, 1);
    // A crest is met earlier along a leaning ray than the still surface would
    // have been, so the beam enters behind where it otherwise would. Straight
    // overhead there is nothing to enter behind and this term vanishes.
    const entryShift = offset * metrics.cellHeight * airLean * SHAFT_ENTRY_GAIN;
    const drop = offset * metrics.cellHeight;
    const bend = slope * (1 - 1 / WATER_IOR) * SHAFT_BEND_GAIN;
    const focus = clamp(1 - SHAFT_FOCUS_GAIN * curve, SHAFT_FOCUS_MIN, SHAFT_FOCUS_MAX);
    const facet = clamp(1 + SHAFT_FACET_GAIN * (airLean * slope - (slope * slope) / 2), 0.4, 1.8);
    // Two objects per shaft, not one per step: everything the swell reaches
    // moves together on this shaft's tick, and everything below it never moves
    // at all. Splitting them any finer only multiplies signatures to hash.
    const live = [];
    const still = [];

    for (let step = 0; step < SHAFT_STEPS; step += 1) {
      const progress = (step + 0.5) / SHAFT_STEPS;
      // Everything the surface did to this beam, faded out with depth. Below
      // the reach a step is exactly the shaft it would have been without any
      // waves at all, and so never repaints while they pass overhead.
      const couple = smoothstep(1 - progress / SHAFT_COUPLE_REACH);
      const lens = 1 + (focus - 1) * couple;
      const gather = (1 + (facet - 1) * couple) * Math.pow(1 / lens, SHAFT_FOCUS_LIGHT);
      const intensity = strength * brightness * gather * Math.pow(1 - progress, 1.7);
      if (intensity < SHAFT_MINIMUM) break;
      const top = surfaceTop + step * stepHeight + drop * couple;
      const band = bands.find((candidate) => top < candidate.y + candidate.height) ?? bands.at(-1);
      const spread = coreWidth * (1 + progress * 1.4) * lens;
      const centerX = originX + tilt * progress * width
        + (entryShift + bend * progress * waterHeight) * couple;
      const y = Math.round(top);
      const height = Math.min(Math.round(top + stepHeight), Math.round(waterBottom)) - y;
      if (height < 1) break;
      // Outer flank, core, outer flank. Widths are rounded so the panel driver
      // sees whole pixels, exactly like the opaque fish bodies.
      const columns = [
        { offset: -spread * 0.8, span: spread * 0.62, share: 0.42 },
        { offset: 0, span: spread, share: 1 },
        { offset: spread * 0.8, span: spread * 0.62, share: 0.42 },
      ];
      const fill = couple > 0 ? live : still;
      for (const column of columns) {
        const amount = intensity * column.share;
        if (amount < SHAFT_MINIMUM) continue;
        const left = Math.round(clamp(centerX + column.offset - column.span / 2, 0, width));
        const right = Math.round(clamp(centerX + column.offset + column.span / 2, 0, width));
        if (right - left < 1) continue;
        // The side falloff used to reach these when they were painted into the
        // background. As scene objects they have to carry it themselves, which
        // also means they can be checked against the water they sit on: the
        // faintest steps of a taper round to the colour already underneath
        // them, and a rectangle that changes no pixel is not worth sending.
        const dim = edgeDimming((left + right) / 2, width);
        const water = mixColor(band.color, palette.edge, dim);
        const color = mixColor(mixColor(band.color, palette.shaftLight, amount), palette.edge, dim);
        if (color === water) continue;
        fill.push({ x: left, y, width: right - left, height, color });
      }
    }

    addGlyphObject(builder, { id: `shaft:${index}:lit`, layer: LAYERS.shafts, glyphs: [], fill: live });
    addGlyphObject(builder, { id: `shaft:${index}:deep`, layer: LAYERS.shafts, glyphs: [], fill: still });
  }
}

// The water surface is painted, not merely decorated. The background stops the
// water band at a straight edge because a rectangle is all a panel driver
// understands cheaply; this pass then re-cuts that edge along the swell,
// carrying water above the line at every crest and uncovering air below it in
// every trough. A lit meniscus rides the cut, brightest where the crest stands
// highest, so the boundary reads as a moving surface rather than a ruled line.
function drawSurface(builder, state, palette, metrics) {
  const width = builder.width;
  const baseTop = Math.round(SURFACE_Y_ROWS * metrics.cellHeight);
  const bandColor = palette.waterBands[0];
  const sampleCount = Math.max(1, Math.round(width / SURFACE_SAMPLE_PX));
  const chunkCount = Math.max(1, Math.round(width / SURFACE_CHUNK_PX));
  const chunks = new Map();

  for (let index = 0; index < sampleCount; index += 1) {
    const left = Math.round((index * width) / sampleCount);
    const right = Math.round(((index + 1) * width) / sampleCount);
    if (right <= left) continue;
    const centerX = (left + right) / 2;
    const worldX = centerX / metrics.cellWidth;
    const offset = surfaceWaveOffset(state, worldX);
    const top = Math.round((SURFACE_Y_ROWS + offset) * metrics.cellHeight);
    // 1 on the highest crest, 0 in the deepest trough. Light collects on the
    // crests, which is the whole reason the swell is visible at all.
    const crest = clamp(-offset / SURFACE_WAVE_ROWS, -1, 1) * 0.5 + 0.5;
    const glint = 0.5 + 0.5 * Math.sin(
      ((worldX - state.elapsedRealSeconds * SURFACE_GLINT_DRIFT) / SURFACE_GLINT_SPAN) * TAU,
    );
    // The side falloff is already painted into the band underneath, so the
    // columns that replace it have to carry the same dimming.
    const dim = edgeDimming(centerX, width);
    const water = mixColor(bandColor, palette.edge, dim);
    const ink = mixColor(palette.waterline, palette.edge, dim);
    const key = Math.min(chunkCount - 1, Math.floor((centerX / width) * chunkCount));
    if (!chunks.has(key)) chunks.set(key, []);
    const fill = chunks.get(key);
    const span = { x: left, width: right - left };

    if (top < baseTop) {
      // A crest stands up into the air strip, so the water follows it up.
      fill.push({ ...span, y: top, height: baseTop - top, color: water });
    } else if (top > baseTop) {
      // A trough drops below where the band begins, uncovering the air behind.
      fill.push({ ...span, y: baseTop, height: top - baseTop, color: palette.airBg });
    }
    // Light reaches a little way into the water it enters. Without this the
    // meniscus sits on the band like a decal instead of belonging to it.
    fill.push({
      ...span,
      y: top + SURFACE_INK_PX,
      height: SURFACE_SKIN_PX,
      color: mixColor(water, ink, SURFACE_SKIN_FLOOR + SURFACE_SKIN_GAIN * crest),
    });
    fill.push({
      ...span,
      y: top,
      height: SURFACE_INK_PX,
      color: mixColor(water, ink, SURFACE_SHEEN_FLOOR + SURFACE_SHEEN_GAIN * crest * (0.4 + 0.6 * glint)),
    });
  }

  for (const [key, fill] of chunks) {
    addGlyphObject(builder, { id: `surface:${key}`, layer: LAYERS.waterline, glyphs: [], fill });
  }
}

// Ripple marks are the ASCII half of the surface. They ride the same swell the
// meniscus is cut from and drift along with the water, so they read as chop on
// one surface instead of as glyphs scattered near the top of the field. Each
// is its own object: they are sparse, and a shared chunk would make every one
// of them repaint a band the full width of that chunk.
function drawSurfaceRipples(builder, state, palette, metrics) {
  const count = Math.ceil(state.cols / SURFACE_RIPPLE_SPACING);
  const span = count * SURFACE_RIPPLE_SPACING;
  for (let index = 0; index < count; index += 1) {
    if (sample01(state.seed, 1050 + index) > 0.74) continue;
    const drift = sampleRange(state.seed, 1150 + index, 0.7, 1.3) * SURFACE_RIPPLE_DRIFT;
    const anchor = index * SURFACE_RIPPLE_SPACING
      + sampleRange(state.seed, 1100 + index, 0.3, SURFACE_RIPPLE_SPACING - 0.3);
    const worldX = positiveModulo(anchor + state.elapsedRealSeconds * drift, span);
    if (worldX >= state.cols) continue;
    const offset = surfaceWaveOffset(state, worldX);
    const shape = sample01(state.seed, 1350 + index);
    const char = shape < 0.52 ? "~" : shape < 0.84 ? "-" : "_";
    addGlyphObject(builder, {
      id: `waterline:${index}`,
      layer: LAYERS.waterline,
      glyphs: [positionedGlyph(metrics, {
        char,
        worldX,
        worldY: SURFACE_Y_ROWS + offset + SURFACE_RIPPLE_DROP,
        // Dimmer than the meniscus above it: the chop is texture, not the edge.
        fg: mixColor(palette.waterBands[0], palette.waterline, 0.52 + 0.32 * clamp(-offset / SURFACE_WAVE_ROWS, 0, 1)),
        scaleX: char === "~" ? 0.95 : 0.78,
        scaleY: 0.84,
      })],
    });
  }
}

function drawAmbient(builder, state, palette, metrics) {
  const waterTop = SURFACE_Y_ROWS + 0.5;
  const waterBottom = state.rows - SUBSTRATE_ROWS - 0.2;
  const travel = waterBottom - waterTop;
  const count = state.orientation === "portrait" ? 8 : 13;
  for (let index = 0; index < count; index += 1) {
    const initialY = sampleRange(state.seed, 1400 + index, 0, travel);
    const speed = sampleRange(state.seed, 1500 + index, 0.035, 0.085);
    const path = positiveModulo(initialY + state.elapsedRealSeconds * speed, travel);
    const phase = sampleRange(state.seed, 1600 + index, 0, TAU);
    const worldX = sampleRange(state.seed, 1700 + index, 1, state.cols - 1)
      + Math.sin(state.elapsedRealSeconds * 0.18 + phase) * 0.18;
    const worldY = waterBottom - path;
    const char = index % 9 === 0 ? "o" : index % 4 === 0 ? "'" : ".";
    addGlyphObject(builder, {
      id: `ambient:${index}`,
      layer: LAYERS.ambient,
      glyphs: [positionedGlyph(metrics, {
        char,
        worldX,
        worldY,
        fg: palette.ambient,
        scaleX: char === "o" ? 0.72 : 0.62,
        scaleY: char === "o" ? 0.72 : 0.62,
      })],
    });
  }
}

function drawSchool(builder, state, palette, metrics) {
  state.school.forEach((fish, index) => {
    const source = schoolGlyphs[index % schoolGlyphs.length];
    const facing = fish.vx < 0 ? -1 : 1;
    const displayed = facing < 0 ? mirrorRows([source])[0] : source;
    const chars = [...displayed];
    const seed = state.seed ^ Math.imul(index + 1, 0x9e3779b1);
    const phase = state.elapsedRealSeconds * sampleRange(seed, 1800, 2.2, 3.2)
      + sampleRange(seed, 1801, 0, TAU);
    const bob = Math.sin(phase * 0.46) * 0.035;
    const compression = 0.58 + clamp(Math.abs(fish.vx) / 0.34, 0, 1) * 0.42;
    // Distance from the glass, unrelated to how deep the fish is swimming.
    const distance = scatteredDepth(seed, 1900, state.elapsedRealSeconds);
    const lane = laneForDepth(distance);
    const scale = sampleRange(seed, 1802, 0.76, 0.88) * schoolDepthScale(distance);
    const spacing = 0.82 * (0.86 + schoolDepthScale(distance) * 0.14);
    const depth = clamp((fish.y - WATERLINE_ROWS) / Math.max(1, state.rows - WATERLINE_ROWS - SUBSTRATE_ROWS), 0, 0.999);
    const laneColors = palette.depthLanes[lane].school;
    const color = laneColors[Math.floor(depth * laneColors.length)];
    const glyphs = chars.map((char, offset) => {
      const tail = chars.length <= 1 ? 0 : facing > 0 ? 1 - offset / (chars.length - 1) : offset / (chars.length - 1);
      return positionedGlyph(metrics, {
        char,
        worldX: fish.x + (offset - (chars.length - 1) / 2) * spacing * compression,
        worldY: fish.y + bob + Math.sin(phase - offset * 0.55) * 0.045 * tail,
        fg: color,
        scaleX: scale,
        scaleY: scale,
      });
    });
    addGlyphObject(builder, {
      id: `school:${index}`,
      // The farthest lane goes behind the midground weed. Everything nearer
      // stacks above it in distance order.
      layer: lane === 0 ? LAYERS.deepSchool : LAYERS.school + lane - 1,
      glyphs,
    });
  });
}

// ASCII fish used to be see-through: water bands, plants, and every other fish
// read straight through the sprite, which is what made a crowded school look
// like scattered line fragments. Each fish gets one opaque body behind its
// strokes. The body is nine vertical slices across a soft ellipse, and each
// slice goes through the same pose transform as the glyph column beside it.
// That keeps the fill attached while the fish flexes and during the edge-on
// turn pose, without asking the panel driver to do anything but fillRect.
const BODY_SPANS = 9;
// A little more height than the ink strictly occupies, in cell units. `_` draws
// along the bottom of its cell, so the roof and belly sit right on the body's
// edge. A small swell backs those strokes without turning the silhouette square.
const BODY_SWELL = 0.2;
// One or two pixels of overlap keeps adjacent integer-snapped slices from
// opening hairline water gaps as their centres move independently.
const BODY_SLICE_OVERLAP = 1;

// The source artwork is deliberately varied, so each sprite gets an authored
// profile for body position, scale and taper. Those final values live in
// body-profiles.js and are shared with the Typographic Motion Lab so Reset in
// the lab always returns to the exact production geometry.
const bodyBoxCache = new Map();
const FIN_GLYPHS = new Set(["/", "\\"]);
// The vocabulary asciiquarium draws a tail from: the fin itself, the stroke
// pair that fans it, and the peduncle joining it to the body.
const TAIL_GLYPHS = new Set([">", "<", "=", "/", "\\"]);

// The body is fitted to the artwork rather than to the sprite's bounding box,
// which is a good deal larger than the fish inside it. Two kinds of row are
// fins, and fins stay outside the body so they keep their open ASCII
// silhouette: a row carrying a single stroke, and an outermost row drawn only
// from `/` and `\`. Everything else is fish and has to be backed - including
// the `_` roof and belly of the short sprites, which any fixed fraction of the
// sprite height leaves bare.
// A glyph's lit pixels, as offsets in cell units from the cell's own centre.
// Measuring the real ink matters: `_` draws along the bottom of its cell, so a
// body sized from cell centres reaches most of a cell above the roof it backs
// and leaves a tab sticking out over the fish. The horizontal extent is
// symmetrised because the same body serves both facings, and a mirrored glyph
// puts its ink on the other side of the cell.
function inkExtent(char) {
  const pixels = glyphPixels(char);
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let reach = 0;
  for (const pixel of pixels) {
    minY = Math.min(minY, pixel.y);
    maxY = Math.max(maxY, pixel.y + pixel.height);
    reach = Math.max(reach, Math.abs(pixel.x - CELL_WIDTH / 2), Math.abs(pixel.x + pixel.width - CELL_WIDTH / 2));
  }
  return {
    reach: reach / CELL_WIDTH,
    top: (minY - CELL_HEIGHT / 2) / CELL_HEIGHT,
    bottom: (maxY - CELL_HEIGHT / 2) / CELL_HEIGHT,
  };
}

// Sprites are authored facing right, so the tail is the run of columns at the
// trailing edge drawn only from tail glyphs. It stops at the first column
// carrying anything else, which is where the body proper starts. The tail is
// left open like the fins: an opaque body behind it would read as one blunt
// mass rather than as a fish.
function tailColumns(source) {
  const columns = new Map();
  for (const point of source.points) {
    columns.set(point.column, (columns.get(point.column) ?? true) && TAIL_GLYPHS.has(point.char));
  }
  let end = 0;
  while (columns.get(end) === true) end += 1;
  return end;
}

function spriteBodyBox(sprite) {
  if (bodyBoxCache.has(sprite.id)) return bodyBoxCache.get(sprite.id);
  const source = spritePoints(sprite);
  const tail = tailColumns(source);
  const rows = new Map();
  for (const point of source.points) {
    const row = rows.get(point.row) ?? { count: 0, points: [], strokesOnly: true };
    row.count += 1;
    row.points.push(point);
    row.strokesOnly = row.strokesOnly && FIN_GLYPHS.has(point.char);
    rows.set(point.row, row);
  }
  let top = Number.POSITIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  let left = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  for (const [index, row] of rows) {
    const edge = index === 0 || index === source.height - 1;
    if (row.count < 2 || (edge && row.strokesOnly)) continue;
    for (const point of row.points) {
      if (point.column < tail) continue;
      const ink = inkExtent(point.char);
      top = Math.min(top, index + ink.top);
      bottom = Math.max(bottom, index + ink.bottom);
      left = Math.min(left, point.column - ink.reach);
      right = Math.max(right, point.column + ink.reach);
    }
  }
  const box = Object.freeze({
    // Cell units, measured from the sprite's own centre, so a body that sits
    // off-centre inside its box travels with the fish.
    offsetX: (left + right) / 2 - (source.width - 1) / 2,
    offsetY: (top + bottom) / 2 - (source.height - 1) / 2,
    radiusX: (right - left) / 2,
    radiusY: (bottom - top) / 2,
  });
  bodyBoxCache.set(sprite.id, box);
  return box;
}

function bodyFill(sprite, metrics, {
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
    // Using a separate front shoulder lets pointed fish close around the nose instead
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
      const pitchFraction = Math.min(1, Math.abs(pitch) / 30);
      // The level body deliberately preserves enough local glyph width to
      // stay opaque through an edge-on turn. Once the body pitches, that
      // same safety width can extend through the authored tail at the rear
      // end. Inset only the trailing edge of the first two source slices,
      // proportional to pitch, while leaving their noseward edge and every
      // interior slice untouched.
      const rearBaseInset = sliceWidth
        * (index === 0 ? 0.42 : index === 1 ? 0.08 : 0)
        * pitchFraction;
      let baseLeft = centerX - sliceWidth / 2;
      let baseRight = centerX + sliceWidth / 2;
      if (facing < 0) baseRight -= rearBaseInset;
      else baseLeft += rearBaseInset;
      const fullLeft = Math.min(cornerLeft, baseLeft);
      const fullRight = Math.max(cornerRight, baseRight);
      // Bounding a rotated vertical slice as a rectangle adds empty
      // triangular corners. At the rear of the fish those corners can
      // reach into the authored tail even though the ideal slice does
      // not. Keep the full expansion through the body, but taper only
      // the trailing-side AABB excess across the two rear slices.
      const rearExpansionFactor = index === 0 ? 0 : index === 1 ? 0.45 : 1;
      if (facing < 0) {
        left = Math.round(fullLeft);
        right = Math.round(baseRight + (fullRight - baseRight) * rearExpansionFactor) + 1;
      } else {
        left = Math.round(baseLeft - (baseLeft - fullLeft) * rearExpansionFactor);
        right = Math.round(fullRight) + 1;
      }
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
}

function individualParts(fish, state, palette, metrics, deformationStrength = 1, {
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
}

// The visible water bands begin at the physical surface instead of y = 0.
// Normalise body shading against that same interval so opaque fish still pick
// the water companion behind the depth where they actually swim.
function waterBandDepth(state, worldY) {
  const waterTop = SURFACE_Y_ROWS;
  const waterBottom = state.rows - SUBSTRATE_ROWS + SUBSTRATE_RELIEF_ROWS;
  return clamp((worldY - waterTop) / Math.max(1, waterBottom - waterTop), 0, 0.999);
}

function drawIndividuals(builder, state, palette, metrics, deformationStrength) {
  const count = state.individuals.length;
  state.individuals.forEach((fish, index) => {
    const distance = spreadDepth(state.seed, fish.seed, index, count, state.elapsedRealSeconds);
    const lane = laneForDepth(distance);
    const parts = individualParts(fish, state, palette, metrics, deformationStrength, {
      verticalDepth: waterBandDepth(state, fish.y),
      lane,
      scale: depthScale(distance),
    });
    addGlyphObject(builder, {
      id: `individual:${index}:${fish.seed}`,
      // Individuals stay between the midground and foreground vegetation at
      // every distance and only sort against each other. They are the
      // characters of the tank, and one vanishing behind a weed reads as a bug
      // rather than as depth.
      layer: LAYERS.individuals + lane,
      glyphs: parts.glyphs,
      fill: parts.fill,
      padding: 2,
    });
  });
}

function drawForageDebris(builder, state, palette, metrics) {
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
      id: `forage-debris:${index}:${fish.seed}`,
      layer: LAYERS.forageDebris,
      glyphs,
      padding: 1,
    });
  });
}

function drawReaction(builder, reaction, palette, metrics) {
  if (!reaction) return;
  const progress = clamp(reaction.ageSeconds / reaction.durationSeconds, 0, 1);
  const radius = 0.62 + smoothstep(progress) * 5.15;
  const samples = 16;
  const glyphs = [];
  for (let index = 0; index < samples; index += 1) {
    const angle = (index / samples) * TAU;
    const char = progress < 0.3 ? "O" : progress < 0.68 ? "o" : index % 2 ? "." : "'";
    glyphs.push(positionedGlyph(metrics, {
      char,
      worldX: reaction.x + Math.cos(angle) * radius,
      worldY: reaction.y + Math.sin(angle) * radius * 0.5,
      fg: palette.ripple,
      scaleX: 0.78,
      scaleY: 0.78,
    }));
  }
  glyphs.push(positionedGlyph(metrics, {
    char: progress < 0.5 ? "o" : ".",
    worldX: reaction.x,
    worldY: reaction.y,
    fg: palette.ripple,
    scaleX: 0.72,
    scaleY: 0.72,
  }));
  addGlyphObject(builder, { id: "reaction:ripple", layer: LAYERS.reaction, glyphs, padding: 2 });
}

function drawSubstrate(builder, state, palette, metrics) {
  const chunks = new Map();
  for (let row = 0; row < SUBSTRATE_ROWS; row += 1) {
    const density = 0.24 + row * 0.17;
    for (let column = 0; column < state.cols; column += 1) {
      const salt = 2000 + row * 211 + column;
      if (sample01(state.seed, salt) > density) continue;
      const chunk = Math.floor(column / 10);
      if (!chunks.has(chunk)) chunks.set(chunk, []);
      const choice = Math.floor(sample01(state.seed, salt + 700) * substrateArt.length) % substrateArt.length;
      const worldX = column + 0.5 + sampleSigned(state.seed, salt + 900) * 0.3;
      const surfaceY = substrateSurfaceY(state, worldX);
      const worldY = Math.min(
        state.rows - 0.18,
        surfaceY + 0.36 + row * 0.74 + sampleSigned(state.seed, salt + 1100) * 0.18,
      );
      // The grain gets the same treatment as the floor beneath it: the row at
      // the crest is the far edge of the ground plane, so it is smaller and
      // sits closer to the shadow the crest is painted in.
      const near = SUBSTRATE_ROWS <= 1 ? 1 : row / (SUBSTRATE_ROWS - 1);
      const grainScale = 0.82 + near * 0.3;
      chunks.get(chunk).push(positionedGlyph(metrics, {
        char: row === 0 && sample01(state.seed, salt + 600) < 0.13 ? "_" : substrateArt[choice],
        worldX,
        worldY,
        fg: mixColor(palette.substrateBg, palette.substrateFg, 0.72 + near * 0.28),
        scaleX: sampleRange(state.seed, salt + 1300, 0.7, 0.84) * grainScale,
        scaleY: sampleRange(state.seed, salt + 1500, 0.64, 0.78) * grainScale,
      }));
    }
  }
  for (const [chunk, glyphs] of chunks) {
    addGlyphObject(builder, { id: `substrate:${chunk}`, layer: LAYERS.substrate, glyphs });
  }
}

export function render(state, { deformationStrength = 1 } = {}) {
  const palette = scenePalette(state);
  const builder = builderForState(state, palette);
  const metrics = sceneMetrics(builder);
  const plantFrame = createPlantRenderRecords(state, palette, metrics);
  builder.metadata.plants = plantFrame.diagnostics;

  drawSunShafts(builder, state, palette, metrics);
  drawSurface(builder, state, palette, metrics);
  drawSurfaceRipples(builder, state, palette, metrics);
  for (const record of plantFrame.records) {
    if (record.layerName === "background") addPlantRecord(builder, record, LAYERS.backgroundPlants);
    if (record.layerName === "midground") addPlantRecord(builder, record, LAYERS.midgroundPlants);
  }
  drawBubbles(builder, state, palette, metrics, LAYERS.ambient);
  drawSchool(builder, state, palette, metrics);
  drawForageDebris(builder, state, palette, metrics);
  drawIndividuals(builder, state, palette, metrics, deformationStrength);
  drawReaction(builder, state.reaction, palette, metrics);
  for (const record of plantFrame.records) {
    if (record.layerName === "foreground") addPlantRecord(builder, record, LAYERS.foregroundPlants);
  }
  drawSubstrate(builder, state, palette, metrics);
  return finalizeScene(builder);
}

export function renderSpriteScene(sprite, {
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
    id: `lab:${sprite.id}:${facing}`,
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
}

export function renderPlantLabScene(speciesId, {
  orientation = "landscape",
  paletteMode = "day",
  elapsedRealSeconds = 0,
  seed = 0x51a7,
  size = "typical",
  currentMultiplier = 1,
  still = false,
  disturbance = "none",
  quality = 1,
} = {}) {
  const target = orientationConfig(orientation);
  const cellWidth = target.pixelWidth / target.cols;
  const logicalWidth = 18;
  const dimensions = {
    width: Math.round(logicalWidth * cellWidth),
    height: target.pixelHeight,
    logicalWidth,
    logicalHeight: target.rows,
  };
  const timeOfDayHours = paletteMode === "night" ? 2 : 12;
  const rootY = target.rows - SUBSTRATE_ROWS + 0.18;
  const specimenSeed = seed >>> 0;
  const species = PLANT_SPECIES_BY_ID[speciesId];
  if (!species) throw new Error(`Unknown plant species: ${speciesId}`);
  const seedling = createPlantSpecimen({
    speciesId,
    seed: specimenSeed,
    x: 5.1,
    ageDays: species.growthStepDays * 0.72,
    rows: target.rows,
    size,
  });
  const mature = createPlantSpecimen({
    speciesId,
    seed: specimenSeed,
    x: 12.9,
    ageDays: (species.maximumStage + 1) * species.growthStepDays + 2,
    rows: target.rows,
    size,
  });
  const plants = [seedling, mature];
  const state = {
    version: 2,
    seed: specimenSeed,
    orientation,
    cols: logicalWidth,
    rows: target.rows,
    elapsedRealSeconds,
    elapsedSimSeconds: elapsedRealSeconds,
    totalDays: mature.ageDays,
    timeOfDayHours,
    plants,
    individuals: disturbance === "fish"
      ? [
        { x: 4.1, y: rootY - seedling.matureHeight * 0.52, vx: 0.62, vy: 0 },
        { x: 11.9, y: rootY - mature.matureHeight * 0.52, vx: 0.62, vy: 0 },
      ]
      : [],
    reaction: disturbance === "touch"
      ? { x: 9, y: rootY - mature.matureHeight * 0.35, ageSeconds: 0.9, durationSeconds: 3.2 }
      : null,
  };
  const palette = scenePalette(state);
  const builder = createSceneBuilder({
    ...dimensions,
    background: createBackground(dimensions, palette, specimenSeed, { tankDepth: false }),
    metadata: {
      lab: true,
      plantLab: true,
      speciesId,
      paletteStage: palette.paletteStage,
      orientation,
      seed: specimenSeed,
    },
  });
  const metrics = sceneMetrics(builder);
  const frameContext = createPlantFrameContext(state, {
    currentMultiplier,
    still,
    interactions: disturbance !== "none",
  });
  const records = plants.map((plant, index) => plantRenderRecord(
    plant,
    index,
    state,
    palette,
    metrics,
    { frameContext, quality, id: `plant-lab:${speciesId}:${index}` },
  ));
  const layerByName = {
    background: LAYERS.backgroundPlants,
    midground: LAYERS.midgroundPlants,
    foreground: LAYERS.foregroundPlants,
  };
  for (const record of records) addPlantRecord(builder, record, layerByName[record.layerName]);
  builder.metadata.plants = {
    instances: records.length,
    activeJoints: records.reduce((sum, record) => sum + record.pose.activeJointCount, 0),
    glyphs: records.reduce((sum, record) => sum + record.glyphs.length, 0),
    maximumActiveJoints: Math.max(...records.map((record) => record.pose.activeJointCount)),
    maximumGlyphs: Math.max(...records.map((record) => record.glyphs.length)),
  };
  builder.metadata.skeletonLines = records.flatMap((record) => skeletonLinesForRecord(record, metrics));
  return finalizeScene(builder);
}

export { individualSprites };