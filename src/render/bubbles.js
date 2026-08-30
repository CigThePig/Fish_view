import { SUBSTRATE_ROWS } from "../sim/config.js";
import { SURFACE_Y_ROWS, substrateSurfaceY } from "../sim/environment.js";
import { spriteForSeed } from "../sim/entities.js";
import { environmentalCurrent } from "../sim/plants.js";
import { mix32, sample01, sampleRange, sampleSigned } from "../sim/prng.js";
import { mixColor } from "./palette.js?v=environment-boundaries-20260830";
import { addGlyphObject, positionedGlyph } from "./scene.js?v=opaque-bodies-20260830";

const TAU = Math.PI * 2;
const POP_DURATION_SECONDS = 0.72;
const SURFACE_CLEARANCE = 0.28;

const SIZE_CLASSES = Object.freeze({
  micro: Object.freeze({ speed: [0.24, 0.35], scale: [0.5, 0.66], wobble: [0.11, 0.2] }),
  normal: Object.freeze({ speed: [0.3, 0.47], scale: [0.53, 0.78], wobble: [0.15, 0.25] }),
  large: Object.freeze({ speed: [0.42, 0.59], scale: [0.6, 0.88], wobble: [0.2, 0.32] }),
  jumbo: Object.freeze({ speed: [0.5, 0.68], scale: [0.66, 0.96], wobble: [0.25, 0.38] }),
});

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function positiveModulo(value, modulus) {
  return ((value % modulus) + modulus) % modulus;
}

function smoothstep(value) {
  const amount = clamp(value, 0, 1);
  return amount * amount * (3 - 2 * amount);
}

function sizeClassForSeed(seed, salt) {
  const roll = sample01(seed, salt);
  if (roll < 0.48) return "micro";
  if (roll < 0.84) return "normal";
  if (roll < 0.97) return "large";
  return "jumbo";
}

export function bubbleEmitterCount(orientation) {
  return orientation === "portrait" ? 3 : 5;
}

function isolatedBubbleCount(orientation) {
  return orientation === "portrait" ? 3 : 4;
}

function waterTop() {
  return SURFACE_Y_ROWS + SURFACE_CLEARANCE;
}

function waterBottom(state, worldX) {
  return substrateSurfaceY(state, worldX) - 0.18;
}

function depthAt(state, worldY) {
  const top = waterTop();
  const bottom = state.rows - SUBSTRATE_ROWS;
  return clamp((worldY - top) / Math.max(1, bottom - top), 0, 1);
}

function bubbleColor(state, palette, worldY) {
  const depth = depthAt(state, worldY);
  const bandIndex = Math.min(
    palette.waterBands.length - 1,
    Math.floor(depth * palette.waterBands.length),
  );
  const water = palette.waterBands[bandIndex];
  const visible = mixColor(water, palette.ambient, 0.44 + (1 - depth) * 0.24);
  return mixColor(visible, palette.waterline, (1 - depth) * 0.24);
}

function emitterX(state, emitterSeed, index) {
  if (index % 2 === 0 && state.plants?.length) {
    const plantIndex = Math.floor(sample01(emitterSeed, 7) * state.plants.length) % state.plants.length;
    return clamp(
      state.plants[plantIndex].x + sampleSigned(emitterSeed, 8) * 0.62,
      1,
      state.cols - 1,
    );
  }
  return sampleRange(emitterSeed, 9, 1.5, state.cols - 1.5);
}

export function createBubbleEmitters(state) {
  const count = bubbleEmitterCount(state.orientation);
  return Array.from({ length: count }, (_, index) => {
    const seed = mix32(state.seed ^ Math.imul(index + 1, 0x6c8e9cf5));
    const x = emitterX(state, seed, index);
    const burstCount = 2 + Math.floor(sample01(seed, 10) * 4);
    const period = state.orientation === "portrait"
      ? sampleRange(seed, 11, 154, 218)
      : sampleRange(seed, 11, 102, 158);
    return Object.freeze({
      id: index,
      seed,
      x,
      y: waterBottom(state, x),
      burstCount,
      burstSpacing: sampleRange(seed, 12, 0.48, 0.92),
      period,
      phase: sampleRange(seed, 13, 0, period),
    });
  });
}

function fishDisturbance(state, worldX, worldY, skipFishIndex = -1) {
  let pushX = 0;
  let lift = 0;
  for (let index = 0; index < (state.individuals?.length ?? 0); index += 1) {
    if (index === skipFishIndex) continue;
    const fish = state.individuals[index];
    const dx = worldX - fish.x;
    const dy = worldY - fish.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= 0.0001 || distance >= 2.35) continue;
    const falloff = 1 - distance / 2.35;
    pushX += (dx / distance) * falloff * (0.22 + Math.abs(fish.vx ?? 0) * 0.2);
    lift += falloff * (0.1 + Math.abs(fish.vx ?? 0) * 0.08);
  }
  return { pushX, lift: Math.min(0.36, lift) };
}

function bubbleGlyphs(metrics, {
  sizeClass,
  progress,
  worldX,
  worldY,
  color,
  seed,
}) {
  const config = SIZE_CLASSES[sizeClass];
  const growth = smoothstep(progress);
  const scale = config.scale[0] + (config.scale[1] - config.scale[0]) * growth;
  let chars;
  if (sizeClass === "micro") {
    chars = [progress < 0.7 ? "." : "'"];
  } else if (sizeClass === "normal") {
    chars = [progress < 0.16 ? "." : "o"];
  } else if (sizeClass === "large") {
    chars = [progress < 0.18 ? "." : progress < 0.58 ? "o" : "O"];
  } else {
    chars = progress < 0.12 ? ["o"] : progress < 0.7 ? ["O"] : ["(", ")"];
  }

  const glyphs = chars.map((char, index) => positionedGlyph(metrics, {
    char,
    worldX: worldX + (chars.length === 2 ? (index === 0 ? -0.2 : 0.2) : 0),
    worldY,
    fg: color,
    scaleX: chars.length === 2 ? scale * 0.74 : scale,
    scaleY: scale,
  }));

  if ((sizeClass === "large" || sizeClass === "jumbo") && progress > 0.62) {
    glyphs.push(positionedGlyph(metrics, {
      char: "'",
      worldX: worldX - 0.22 + sampleSigned(seed, 71) * 0.04,
      worldY: worldY - 0.34,
      fg: color,
      scaleX: 0.5,
      scaleY: 0.5,
    }));
  }
  return glyphs;
}

function popGlyphs(metrics, {
  sizeClass,
  progress,
  worldX,
  worldY,
  color,
}) {
  const large = sizeClass === "large" || sizeClass === "jumbo";
  if (progress < 0.28) {
    return [positionedGlyph(metrics, {
      char: large ? "O" : "o",
      worldX,
      worldY,
      fg: color,
      scaleX: large ? 0.95 : 0.76,
      scaleY: Math.max(0.5, (large ? 0.8 : 0.68) * (1 - progress * 1.25)),
    })];
  }
  if (progress < 0.62) {
    return [positionedGlyph(metrics, {
      char: "*",
      worldX,
      worldY: worldY - 0.06,
      fg: color,
      scaleX: large ? 0.72 : 0.6,
      scaleY: large ? 0.72 : 0.6,
    })];
  }
  return [
    positionedGlyph(metrics, {
      char: "~",
      worldX,
      worldY: worldY + 0.03,
      fg: color,
      scaleX: large ? 0.86 : 0.68,
      scaleY: 0.56,
    }),
    positionedGlyph(metrics, {
      char: "'",
      worldX: worldX + 0.22,
      worldY: worldY - 0.2,
      fg: color,
      scaleX: 0.5,
      scaleY: 0.5,
    }),
  ];
}

function movingBubbleRecord(state, palette, metrics, {
  id,
  seed,
  sourceX,
  sourceY,
  ageSeconds,
  sizeClass = sizeClassForSeed(seed, 20),
  speedMultiplier = 1,
  laneOffset = 0,
  kind = "stream",
  skipFishIndex = -1,
}) {
  if (ageSeconds < 0) return null;
  const top = waterTop();
  const travel = Math.max(0.25, sourceY - top);
  const config = SIZE_CLASSES[sizeClass];
  const orientationMultiplier = state.orientation === "portrait" ? 1.16 : 1;
  const speed = sampleRange(seed, 21, config.speed[0], config.speed[1])
    * orientationMultiplier
    * speedMultiplier;
  const ascentSeconds = travel / speed;
  if (ageSeconds > ascentSeconds + POP_DURATION_SECONDS) return null;

  const current = environmentalCurrent(state.seed, state.elapsedRealSeconds);
  if (ageSeconds >= ascentSeconds) {
    const popProgress = clamp((ageSeconds - ascentSeconds) / POP_DURATION_SECONDS, 0, 1);
    const worldX = sourceX + laneOffset + current.primary * 0.28
      + Math.sin(ageSeconds * 1.7 + sampleRange(seed, 22, 0, TAU)) * 0.08;
    const worldY = top + Math.sin(popProgress * Math.PI) * -0.04;
    const color = mixColor(bubbleColor(state, palette, worldY), palette.waterline, 0.38);
    return {
      id,
      kind,
      phase: "pop",
      sizeClass,
      worldX,
      worldY,
      glyphs: popGlyphs(metrics, { sizeClass, progress: popProgress, worldX, worldY, color }),
    };
  }

  const progress = clamp(ageSeconds / ascentSeconds, 0, 1);
  const wobble = sampleRange(seed, 23, config.wobble[0], config.wobble[1]);
  const slowFrequency = sampleRange(seed, 24, 0.58, 1.05);
  const fastFrequency = sampleRange(seed, 25, 1.45, 2.35);
  const phaseA = sampleRange(seed, 26, 0, TAU);
  const phaseB = sampleRange(seed, 27, 0, TAU);
  let worldX = sourceX + laneOffset
    + current.primary * (0.07 + progress * 0.3)
    + current.secondary * 0.05
    + Math.sin(ageSeconds * slowFrequency + phaseA) * wobble
    + Math.sin(ageSeconds * fastFrequency + phaseB) * wobble * 0.38;
  let worldY = sourceY - travel * progress;
  const disturbance = fishDisturbance(state, worldX, worldY, skipFishIndex);
  worldX = clamp(worldX + disturbance.pushX, 0.35, state.cols - 0.35);
  worldY -= disturbance.lift;
  const color = bubbleColor(state, palette, worldY);
  return {
    id,
    kind,
    phase: "rise",
    sizeClass,
    speed,
    progress,
    worldX,
    worldY,
    glyphs: bubbleGlyphs(metrics, { sizeClass, progress, worldX, worldY, color, seed }),
  };
}

function streamBubbleRecords(state, palette, metrics) {
  const records = [];
  for (const emitter of createBubbleEmitters(state)) {
    const clock = positiveModulo(state.elapsedRealSeconds + emitter.phase, emitter.period);
    for (let slot = 0; slot < emitter.burstCount; slot += 1) {
      const bubbleSeed = mix32(emitter.seed ^ Math.imul(slot + 1, 0x85ebca6b));
      const launch = slot * emitter.burstSpacing + sampleRange(bubbleSeed, 30, 0, 0.2);
      const record = movingBubbleRecord(state, palette, metrics, {
        id: `bubble:stream:${emitter.id}:${slot}`,
        seed: bubbleSeed,
        sourceX: emitter.x,
        sourceY: emitter.y,
        ageSeconds: clock - launch,
        laneOffset: sampleSigned(bubbleSeed, 31) * 0.28,
        kind: "stream",
      });
      if (record) records.push(record);
    }
  }
  return records;
}

function isolatedBubbleRecords(state, palette, metrics) {
  const count = isolatedBubbleCount(state.orientation);
  const records = [];
  const top = waterTop();
  for (let index = 0; index < count; index += 1) {
    const seed = mix32(state.seed ^ Math.imul(index + 1, 0x27d4eb2f));
    const sourceX = sampleRange(seed, 40, 1, state.cols - 1);
    const bottom = waterBottom(state, sourceX);
    const sourceY = top + (bottom - top) * sampleRange(seed, 41, 0.62, 0.96);
    const period = state.orientation === "portrait"
      ? sampleRange(seed, 42, 92, 148)
      : sampleRange(seed, 42, 62, 112);
    const ageSeconds = positiveModulo(
      state.elapsedRealSeconds + sampleRange(seed, 43, 0, period),
      period,
    );
    const record = movingBubbleRecord(state, palette, metrics, {
      id: `bubble:isolated:${index}`,
      seed,
      sourceX,
      sourceY,
      ageSeconds,
      speedMultiplier: 1.08,
      kind: "isolated",
    });
    if (record) records.push(record);
  }
  return records;
}

function spriteWidthForFish(fish) {
  const sprite = spriteForSeed(fish.seed);
  return Math.max(...sprite.shape.map((row) => [...row].length));
}

function fishExhaleRecords(state, palette, metrics) {
  const records = [];
  for (let index = 0; index < (state.individuals?.length ?? 0); index += 1) {
    const fish = state.individuals[index];
    const seed = mix32(fish.seed ^ 0xa511e9b3);
    const interval = sampleRange(seed, 50, 32, 118);
    const clock = positiveModulo(
      state.elapsedRealSeconds + sampleRange(seed, 51, 0, interval),
      interval,
    );
    if (clock > 4.8) continue;
    const facing = fish.visual?.targetFacing === -1 || fish.visual?.targetFacing === 1
      ? fish.visual.targetFacing
      : fish.vx < 0 ? -1 : 1;
    const mouthOffset = clamp(spriteWidthForFish(fish) * 0.36, 1.2, 3.4);
    const current = environmentalCurrent(state.seed, state.elapsedRealSeconds);
    const worldX = clamp(
      fish.x + facing * mouthOffset
        + current.primary * 0.06
        + Math.sin(clock * 1.8 + sampleRange(seed, 52, 0, TAU)) * 0.12,
      0.4,
      state.cols - 0.4,
    );
    const worldY = fish.y - 0.25 - clock * sampleRange(seed, 53, 0.3, 0.46);
    if (worldY <= waterTop()) continue;
    const sizeClass = sample01(seed, 54) < 0.72 ? "micro" : "normal";
    const progress = clamp(clock / 4.8, 0, 1);
    const color = bubbleColor(state, palette, worldY);
    records.push({
      id: `bubble:fish:${index}`,
      kind: "fish",
      phase: "rise",
      sizeClass,
      progress,
      worldX,
      worldY,
      glyphs: bubbleGlyphs(metrics, { sizeClass, progress, worldX, worldY, color, seed }),
    });
  }
  return records;
}

function touchBubbleRecords(state, palette, metrics) {
  const reaction = state.reaction;
  if (!reaction) return [];
  // applyTouch intentionally clamps fish reactions above the floor. A touch on
  // the substrate therefore arrives at this exact lower clamp, which lets the
  // bubble layer recognize a floor tap without expanding persistent state.
  const substrateTouchY = state.rows - 5;
  if (reaction.y < substrateTouchY - 0.01) return [];

  const burstSeed = mix32(state.seed ^ Math.imul(Math.round(reaction.x * 64) + 1, 0x9e3779b1));
  const count = 3 + Math.floor(sample01(burstSeed, 60) * 4);
  const sourceY = waterBottom(state, reaction.x);
  const current = environmentalCurrent(state.seed, state.elapsedRealSeconds);
  const records = [];
  for (let index = 0; index < count; index += 1) {
    const seed = mix32(burstSeed ^ Math.imul(index + 1, 0xc2b2ae35));
    const ageSeconds = reaction.ageSeconds - index * sampleRange(seed, 61, 0.12, 0.24);
    if (ageSeconds < 0 || ageSeconds > reaction.durationSeconds) continue;
    const speed = sampleRange(seed, 62, 0.5, 0.76);
    const worldX = clamp(
      reaction.x + sampleSigned(seed, 63) * 0.65
        + current.primary * 0.12
        + Math.sin(ageSeconds * sampleRange(seed, 64, 1.2, 2.2)) * 0.18,
      0.4,
      state.cols - 0.4,
    );
    const worldY = sourceY - ageSeconds * speed;
    const sizeClass = sample01(seed, 65) < 0.74 ? "micro" : "normal";
    const progress = clamp(ageSeconds / reaction.durationSeconds, 0, 1);
    const color = bubbleColor(state, palette, worldY);
    records.push({
      id: `bubble:touch:${index}`,
      kind: "touch",
      phase: "rise",
      sizeClass,
      progress,
      worldX,
      worldY,
      glyphs: bubbleGlyphs(metrics, { sizeClass, progress, worldX, worldY, color, seed }),
    });
  }
  return records;
}

export function createBubbleRenderRecords(state, palette, metrics) {
  return [
    ...streamBubbleRecords(state, palette, metrics),
    ...isolatedBubbleRecords(state, palette, metrics),
    ...fishExhaleRecords(state, palette, metrics),
    ...touchBubbleRecords(state, palette, metrics),
  ];
}

export function drawBubbles(builder, state, palette, metrics, layer) {
  const records = createBubbleRenderRecords(state, palette, metrics);
  for (const record of records) {
    addGlyphObject(builder, {
      id: record.id,
      layer,
      glyphs: record.glyphs,
      padding: 2,
    });
  }
  builder.metadata.bubbles = {
    emitters: bubbleEmitterCount(state.orientation),
    active: records.length,
    stream: records.filter((record) => record.kind === "stream").length,
    isolated: records.filter((record) => record.kind === "isolated").length,
    fish: records.filter((record) => record.kind === "fish").length,
    touch: records.filter((record) => record.kind === "touch").length,
    pops: records.filter((record) => record.phase === "pop").length,
  };
  return records;
}
