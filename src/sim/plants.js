import {
  PLANT_FAMILIES,
  PLANT_SPECIES_BY_ID,
  RARE_PLANT_IDS,
} from "../art/plants.js";
import { SUBSTRATE_ROWS, WATERLINE_ROWS } from "./config.js";
import { plantRootY } from "./environment.js";
import { mix32, sample01, sampleRange, sampleSigned } from "./prng.js";

const TAU = Math.PI * 2;
const UP = -Math.PI / 2;

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

const HABITATS = Object.freeze({
  landscape: Object.freeze([
    Object.freeze({ start: 0.025, end: 0.18, count: 5, families: Object.freeze(["grass", "lowLeaf"]) }),
    Object.freeze({ start: 0.235, end: 0.34, count: 3, families: Object.freeze(["ribbon", "meadow"]) }),
    Object.freeze({ start: 0.385, end: 0.43, count: 1, families: Object.freeze(["tall"]), solitary: true }),
    Object.freeze({ start: 0.5, end: 0.56, count: 1, families: Object.freeze(["lowLeaf"]), solitary: true }),
    Object.freeze({ start: 0.6, end: 0.76, count: 5, families: Object.freeze(["broadleaf", "meadow", "grass"]) }),
    Object.freeze({ start: 0.81, end: 0.98, count: 7, families: Object.freeze(["tall", "ribbon"]), rareChance: 0.085 }),
  ]),
  portrait: Object.freeze([
    Object.freeze({ start: 0.03, end: 0.26, count: 4, families: Object.freeze(["grass", "lowLeaf"]) }),
    Object.freeze({ start: 0.1, end: 0.34, count: 3, families: Object.freeze(["tall", "ribbon"]), rareChance: 0.07 }),
    Object.freeze({ start: 0.42, end: 0.5, count: 1, families: Object.freeze(["lowLeaf"]), solitary: true }),
    Object.freeze({ start: 0.55, end: 0.74, count: 3, families: Object.freeze(["broadleaf", "meadow"]) }),
    Object.freeze({ start: 0.72, end: 0.97, count: 5, families: Object.freeze(["tall", "ribbon"]), rareChance: 0.09 }),
  ]),
});

function orientationFromColumns(cols) {
  return cols < 50 ? "portrait" : "landscape";
}

function habitatSlot(orientation, index) {
  const habitats = HABITATS[orientation];
  let cursor = 0;
  for (const habitat of habitats) {
    if (index < cursor + habitat.count) {
      return { habitat, localIndex: index - cursor };
    }
    cursor += habitat.count;
  }
  return { habitat: habitats.at(-1), localIndex: index % habitats.at(-1).count };
}

function speciesIdForSlot(seed, habitat) {
  if (habitat.rareChance && sample01(seed, 3) < habitat.rareChance) {
    return RARE_PLANT_IDS[Math.floor(sample01(seed, 4) * RARE_PLANT_IDS.length) % RARE_PLANT_IDS.length];
  }
  const familyName = habitat.families[
    Math.floor(sample01(seed, 5) * habitat.families.length) % habitat.families.length
  ];
  const family = PLANT_FAMILIES[familyName];
  return family[Math.floor(sample01(seed, 6) * family.length) % family.length];
}

function heightForSpecies(species, seed, waterHeight, size = "seeded") {
  const [minimum, maximum] = species.heightRange;
  const fraction = size === "minimum"
    ? minimum
    : size === "maximum"
      ? maximum
      : size === "typical"
        ? (minimum + maximum) / 2
        : sampleRange(seed, 7, minimum, maximum);
  return clamp(waterHeight * fraction, 1.35, waterHeight - 0.75);
}

function variationFromSeed(seed) {
  return {
    phase: sampleRange(seed, 8, 0, TAU),
    frequency: sampleRange(seed, 9, 0.23, 0.39),
    sway: sampleRange(seed, 10, 0.82, 1.16),
    lean: sampleSigned(seed, 11) * 0.2,
    stiffness: sampleRange(seed, 12, 0.86, 1.14),
    secondaryPhase: sampleRange(seed, 13, 0, TAU),
    paletteSlot: Math.floor(sample01(seed, 14) * 3) % 3,
  };
}

function createPlantRecord({ seed, speciesId, x, ageDays, matureHeight }) {
  const species = PLANT_SPECIES_BY_ID[speciesId];
  if (!species) throw new Error(`Unknown plant species: ${speciesId}`);
  return {
    seed: seed >>> 0,
    speciesId,
    x,
    ageDays,
    matureHeight,
    layer: species.layer,
    ...variationFromSeed(seed),
  };
}

export function plantCountFor(orientation) {
  return HABITATS[orientation].reduce((total, habitat) => total + habitat.count, 0);
}

export function createPlant(baseSeed, index, cols, rows, orientation = orientationFromColumns(cols)) {
  const seed = mix32(baseSeed ^ Math.imul(index + 31, 0xc2b2ae35));
  const { habitat, localIndex } = habitatSlot(orientation, index);
  const slotProgress = (localIndex + 0.18 + sample01(seed, 1) * 0.64) / habitat.count;
  const normalizedX = habitat.start + (habitat.end - habitat.start) * slotProgress;
  const margin = habitat.solitary ? 0.75 : 0.48;
  const x = clamp(normalizedX * cols + sampleSigned(seed, 2) * 0.16, margin, cols - margin);
  const speciesId = speciesIdForSlot(seed, habitat);
  const species = PLANT_SPECIES_BY_ID[speciesId];
  const waterHeight = rows - WATERLINE_ROWS - SUBSTRATE_ROWS;
  return createPlantRecord({
    seed,
    speciesId,
    x,
    ageDays: sampleRange(seed, 15, 1, 18),
    matureHeight: heightForSpecies(species, seed, waterHeight),
  });
}

export function createPlantSpecimen({
  speciesId,
  seed,
  x,
  ageDays,
  rows,
  size = "typical",
}) {
  const numericSeed = seed >>> 0;
  const species = PLANT_SPECIES_BY_ID[speciesId];
  const waterHeight = rows - WATERLINE_ROWS - SUBSTRATE_ROWS;
  return createPlantRecord({
    seed: numericSeed,
    speciesId,
    x,
    ageDays,
    matureHeight: heightForSpecies(species, numericSeed, waterHeight, size),
  });
}

export function plantSpecies(plant) {
  return PLANT_SPECIES_BY_ID[plant.speciesId] ?? PLANT_SPECIES_BY_ID["soft-ribbon"];
}

function smoothstep(value) {
  const amount = clamp(value, 0, 1);
  return amount * amount * (3 - 2 * amount);
}

export function plantGrowthState(plant, species = plantSpecies(plant)) {
  const ageDays = Math.max(0, Number.isFinite(plant.ageDays) ? plant.ageDays : 0);
  const active = new Array(species.joints.length).fill(false);
  const maturity = new Array(species.joints.length).fill(0);
  active[0] = true;
  maturity[0] = 1;
  let activeJointCount = 0;
  let currentStage = 0;
  for (let index = 1; index < species.joints.length; index += 1) {
    const joint = species.joints[index];
    const revealDay = joint.stage * species.growthStepDays;
    if (ageDays + 1e-9 < revealDay) continue;
    active[index] = true;
    const localProgress = joint.stage === 0 && ageDays === 0
      ? 0
      : clamp((ageDays - revealDay) / species.growthStepDays, 0, 1);
    maturity[index] = 0.45 + smoothstep(localProgress) * 0.55;
    activeJointCount += 1;
    currentStage = Math.max(currentStage, joint.stage);
  }
  return {
    active,
    maturity,
    activeJointCount,
    currentStage,
    mature: ageDays >= (species.maximumStage + 1) * species.growthStepDays,
  };
}

export function plantHeight(plant) {
  const species = plantSpecies(plant);
  const growth = plantGrowthState(plant, species);
  const structuralProgress = species.maximumStage === 0
    ? 1
    : clamp((growth.currentStage + 1) / (species.maximumStage + 1), 0, 1);
  return Math.max(0.7, plant.matureHeight * (0.28 + structuralProgress * 0.72));
}

export function environmentalCurrent(seed, timeSeconds, multiplier = 1) {
  const phaseA = sampleRange(seed, 301, 0, TAU);
  const phaseB = sampleRange(seed, 302, 0, TAU);
  const phaseC = sampleRange(seed, 303, 0, TAU);
  return {
    primary: (
      Math.sin(timeSeconds * 0.19 + phaseA) * 0.66
      + Math.sin(timeSeconds * 0.071 + phaseB) * 0.34
    ) * multiplier,
    secondary: Math.sin(timeSeconds * 0.113 + phaseC) * multiplier,
  };
}

function updateTime(elapsed, layer, still) {
  if (still) return 0;
  const rate = layer === "background" ? 5 : 10;
  return Math.floor(Math.max(0, elapsed) * rate + 1e-7) / rate;
}

export function createPlantFrameContext(state, {
  currentMultiplier = 1,
  still = false,
  interactions = true,
} = {}) {
  const timeByLayer = {
    background: updateTime(state.elapsedRealSeconds, "background", still),
    midground: updateTime(state.elapsedRealSeconds, "midground", still),
    foreground: updateTime(state.elapsedRealSeconds, "foreground", still),
  };
  return {
    still,
    interactions,
    timeByLayer,
    currentByLayer: {
      background: environmentalCurrent(state.seed, timeByLayer.background, currentMultiplier * 0.9),
      midground: environmentalCurrent(state.seed, timeByLayer.midground, currentMultiplier),
      foreground: environmentalCurrent(state.seed, timeByLayer.foreground, currentMultiplier * 1.06),
    },
  };
}

function touchDisturbance(plant, state) {
  const reaction = state.reaction;
  if (!reaction || reaction.durationSeconds <= 0) return 0;
  const progress = clamp(reaction.ageSeconds / reaction.durationSeconds, 0, 1);
  const distance = Math.abs(plant.x - reaction.x);
  const radius = 7.5;
  if (distance >= radius) return 0;
  const outward = plant.x === reaction.x ? (plant.seed & 1 ? -1 : 1) : Math.sign(plant.x - reaction.x);
  const spatial = 1 - distance / radius;
  const envelope = Math.sin(progress * Math.PI) * (1 - progress * 0.45);
  return outward * spatial * envelope * 0.32;
}

function fishDisturbance(plant, state, species) {
  if (species.layer === "background" || !Array.isArray(state.individuals)) return 0;
  const rootY = plantRootY(state, plant.x);
  const canopyY = rootY - plant.matureHeight * 0.52;
  const radius = 2.8 + plant.matureHeight * 0.16;
  let influence = 0;
  let nearest = Number.POSITIVE_INFINITY;
  for (const fish of state.individuals) {
    const dx = plant.x - fish.x;
    const dy = (canopyY - fish.y) * 0.62;
    const distance = Math.hypot(dx, dy);
    if (distance >= radius || distance >= nearest) continue;
    nearest = distance;
    const speed = clamp(Math.hypot(fish.vx, fish.vy), 0, 0.85);
    influence = Math.sign(fish.vx || (plant.seed & 1 ? -1 : 1)) * (1 - distance / radius) * speed * 0.12;
  }
  return influence;
}

function disturbanceForPlant(plant, state, species, frameContext, override) {
  if (Number.isFinite(override)) return clamp(override, -0.6, 0.6);
  if (!frameContext.interactions) return 0;
  return clamp(touchDisturbance(plant, state) + fishDisturbance(plant, state, species), -0.42, 0.42);
}

export function posePlant(plant, state, {
  frameContext = createPlantFrameContext(state),
  ageDays = plant.ageDays,
  quality = 1,
  disturbanceOverride = null,
} = {}) {
  const species = plantSpecies(plant);
  const posedPlant = ageDays === plant.ageDays ? plant : { ...plant, ageDays };
  const growth = plantGrowthState(posedPlant, species);
  const rootY = plantRootY(state, plant.x);
  const points = new Array(species.joints.length).fill(null);
  points[0] = {
    index: 0,
    parent: -1,
    x: plant.x,
    y: rootY,
    angle: UP,
    active: true,
    role: "root",
    stage: 0,
    maturity: 1,
    isTip: false,
  };

  const time = frameContext.timeByLayer[species.layer];
  const current = frameContext.currentByLayer[species.layer];
  const waveAngle = time * plant.frequency + plant.phase;
  const waveSin = Math.sin(waveAngle);
  const waveCos = Math.cos(waveAngle);
  const secondary = Math.sin(time * plant.frequency * 0.61 + plant.secondaryPhase);
  const disturbance = disturbanceForPlant(plant, state, species, frameContext, disturbanceOverride);
  const flexibility = clamp(1.18 - species.stiffness * plant.stiffness, 0.26, 0.94);
  const scale = plant.matureHeight / species.nominalHeight;
  let activeJointCount = 0;

  for (let index = 1; index < species.joints.length; index += 1) {
    const joint = species.joints[index];
    if (!growth.active[index]) continue;
    if (quality < 1 && joint.role === "leaf" && (index & 1) === 1) continue;
    const parentPoint = points[joint.parent];
    if (!parentPoint) continue;
    const progress = joint.pathProgress;
    const laggedWave = waveSin * joint.lagCos - waveCos * joint.lagSin;
    const sharedBend = current.primary * species.current * 0.09
      + laggedWave * species.sway * plant.sway * 0.045
      + (current.secondary + secondary) * 0.014
      + disturbance * 0.12;
    const bend = sharedBend * (0.22 + progress * 0.78) * flexibility;
    const branchMotion = joint.branchSign * secondary * progress * 0.012;
    const angle = parentPoint.angle + joint.angle + bend + plant.lean * progress * 0.055 + branchMotion;
    const length = joint.length * scale * growth.maturity[index];
    points[index] = {
      index,
      parent: joint.parent,
      x: parentPoint.x + Math.cos(angle) * length,
      y: parentPoint.y + Math.sin(angle) * length,
      angle,
      active: true,
      role: joint.role,
      glyph: joint.glyph,
      restAngle: joint.restAngle,
      stage: joint.stage,
      maturity: growth.maturity[index],
      isTip: false,
      branchSign: joint.branchSign,
      pathProgress: progress,
    };
    activeJointCount += 1;
  }

  const activeChildren = new Array(species.joints.length).fill(0);
  for (let index = 1; index < points.length; index += 1) {
    const point = points[index];
    if (point) activeChildren[point.parent] += 1;
  }
  for (let index = 1; index < points.length; index += 1) {
    const point = points[index];
    if (point && activeChildren[index] === 0 && point.role === "stem") point.isTip = true;
  }

  return {
    species,
    root: points[0],
    points,
    joints: points.filter((point, index) => index > 0 && point),
    activeJointCount,
    maximumJointCount: species.joints.length - 1,
    current,
    disturbance,
    growth,
    updateTime: time,
  };
}

export { HABITATS as PLANT_HABITATS };
