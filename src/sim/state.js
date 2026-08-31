import { PLANT_SPECIES_BY_ID } from "../art/plants.js";
import {
  advanceAquariumHistory,
  createContentState,
  sanitizeContent,
} from "./aquarium-history.js";
import { DEFAULT_SEED, DEFAULT_SETTINGS, DRIVE_MAXIMUM, DRIVE_MINIMUM, orientationConfig } from "./config.js";
import { clamp, createIndividual, createSchoolFish } from "./entities.js";
import {
  ACTIVITIES,
  BEHAVIORS,
  createActivityState,
  defaultActivityForBehavior,
} from "./fish-activities.js";
import { MAX_FISH_PITCH_DEGREES } from "./fish-motion.js";
import { affinitiesFromSeed, sanitizeSocialMemory } from "./fish-personality.js";
import {
  createPlantFromSeed,
  createPlant,
  plantCapFor,
  plantCountFor,
  plantVariationFromSeed,
} from "./plants.js";
import { hashSeed, mix32 } from "./prng.js";

export const PERSISTENCE_VERSION = 2;

export function createAquariumState({
  orientation = "landscape",
  seed = DEFAULT_SEED,
  wallClockHours = 12,
  settings = {},
} = {}) {
  const dimensions = orientationConfig(orientation);
  const numericSeed = typeof seed === "number" ? seed >>> 0 : hashSeed(seed);
  const mergedSettings = { ...DEFAULT_SETTINGS, ...settings };
  const school = Array.from({ length: mergedSettings.schoolCount }, (_, index) =>
    createSchoolFish(numericSeed, index, dimensions.cols, dimensions.rows),
  );
  const individuals = Array.from({ length: 6 }, (_, index) =>
    createIndividual(numericSeed, index, dimensions.cols, dimensions.rows),
  );
  const plants = Array.from({ length: plantCountFor(orientation) }, (_, index) =>
    createPlant(numericSeed, index, dimensions.cols, dimensions.rows, orientation),
  );

  return {
    version: 2,
    seed: numericSeed,
    rngState: mix32(numericSeed ^ 0x27d4eb2f),
    orientation,
    cols: dimensions.cols,
    rows: dimensions.rows,
    elapsedRealSeconds: 0,
    elapsedSimSeconds: 0,
    totalDays: 0,
    timeOfDayHours: ((wallClockHours % 24) + 24) % 24,
    settings: mergedSettings,
    school,
    individuals,
    plants,
    // Bounded long-horizon bookkeeping. This is a processing cursor, not a
    // hidden user-facing statistic, and it cannot grow with aquarium age.
    content: createContentState(),
    reaction: null,
  };
}

function normalizeVector(x, y) {
  const length = Math.hypot(x, y) || 1;
  return { x: x / length, y: y / length };
}

export function applyTouch(state, x, y) {
  const safeX = clamp(x, 0, state.cols - 1);
  const safeY = clamp(y, 2, state.rows - 5);
  let nearestIndex = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;

  const school = state.school.map((fish) => {
    const direction = normalizeVector(safeX - fish.x, safeY - fish.y);
    return {
      ...fish,
      vx: direction.x * state.settings.schoolSpeed * 1.18,
      vy: direction.y * state.settings.schoolSpeed * 1.18,
    };
  });

  const individuals = state.individuals.map((fish, index) => {
    const distance = Math.hypot(safeX - fish.x, safeY - fish.y);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
    const direction = normalizeVector(safeX - fish.x, safeY - fish.y);
    const glassAffinity = affinitiesFromSeed(fish.seed).glass;
    return {
      ...fish,
      vx: direction.x * (0.58 + glassAffinity * 0.22),
      vy: direction.y * (0.38 + glassAffinity * 0.14),
      drives: { ...fish.drives },
      history: {
        ...fish.history,
        socialMemory: sanitizeSocialMemory(fish.history?.socialMemory, fish.seed),
      },
      behavior: { ...fish.behavior },
      activity: {
        ...createActivityState(ACTIVITIES.touchReact, fish.activity?.current ?? fish.behavior.current),
        targetType: "touch",
        targetX: safeX,
        targetY: safeY,
      },
      visual: { ...fish.visual },
    };
  });

  const chosen = individuals[nearestIndex];
  individuals[nearestIndex] = {
    ...chosen,
    history: {
      ...chosen.history,
      touches: chosen.history.touches + 1,
      boldnessDrift: clamp(chosen.history.boldnessDrift + 0.0025, 0, 0.18),
      sociabilityDrift: clamp(chosen.history.sociabilityDrift + 0.001, 0, 0.12),
    },
  };

  return {
    ...state,
    school,
    individuals,
    reaction: {
      x: safeX,
      y: safeY,
      ageSeconds: 0,
      durationSeconds: 3.2,
    },
  };
}

export function withSettings(state, patch) {
  return {
    ...state,
    settings: { ...state.settings, ...patch },
  };
}

export function serializePersistentState(state) {
  return {
    persistenceVersion: PERSISTENCE_VERSION,
    seed: state.seed,
    orientation: state.orientation,
    rngState: state.rngState,
    elapsedSimSeconds: state.elapsedSimSeconds,
    totalDays: state.totalDays,
    timeOfDayHours: state.timeOfDayHours,
    settings: { ...state.settings },
    individuals: state.individuals.map((fish) => ({
      seed: fish.seed,
      x: fish.x,
      y: fish.y,
      vx: fish.vx,
      vy: fish.vy,
      drives: { ...fish.drives },
      history: {
        touches: fish.history.touches,
        boldnessDrift: fish.history.boldnessDrift,
        sociabilityDrift: fish.history.sociabilityDrift,
        socialMemory: sanitizeSocialMemory(fish.history.socialMemory, fish.seed)
          .map((entry) => ({ ...entry })),
      },
      behavior: { ...fish.behavior },
      visual: { ...fish.visual },
    })),
    // Animated joints are reconstructed from this compact biological record.
    // Keeping the fields explicit prevents transient render data from leaking
    // into long-lived saves as the plant renderer evolves.
    plants: state.plants.map((plant) => ({
      seed: plant.seed,
      speciesId: plant.speciesId,
      x: plant.x,
      ageDays: plant.ageDays,
      matureHeight: plant.matureHeight,
      layer: plant.layer,
      phase: plant.phase,
      frequency: plant.frequency,
      sway: plant.sway,
      lean: plant.lean,
      stiffness: plant.stiffness,
      secondaryPhase: plant.secondaryPhase,
      paletteSlot: plant.paletteSlot,
    })),
    content: { ...state.content },
  };
}

function finite(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function stableSeed(value, fallback) {
  return Number.isSafeInteger(value) && value >= 0 && value <= 0xffffffff
    ? value >>> 0
    : fallback >>> 0;
}

function validBehavior(value, fallback = "cruise") {
  return BEHAVIORS.includes(value) ? value : fallback;
}

export function restorePersistentState(baseState, saved) {
  if (!saved || (saved.persistenceVersion !== 1 && saved.persistenceVersion !== PERSISTENCE_VERSION)) return baseState;
  if (saved.seed !== baseState.seed || saved.orientation !== baseState.orientation) return baseState;
  if (!Array.isArray(saved.individuals) || !Array.isArray(saved.plants)) return baseState;

  const individuals = saved.individuals.slice(0, 8).map((fish, index) => {
    const fallback = baseState.individuals[index % baseState.individuals.length];
    const seed = stableSeed(fish.seed, fallback.seed);
    const currentBehavior = validBehavior(fish.behavior?.current);
    const previousBehavior = validBehavior(fish.behavior?.previous, currentBehavior);
    return {
      ...fallback,
      ...fish,
      seed,
      x: finite(fish.x, fallback.x),
      y: finite(fish.y, fallback.y),
      vx: finite(fish.vx, fallback.vx),
      vy: finite(fish.vy, fallback.vy),
      drives: {
        hunger: clamp(finite(fish.drives?.hunger, fallback.drives.hunger), DRIVE_MINIMUM, DRIVE_MAXIMUM),
        energy: clamp(finite(fish.drives?.energy, fallback.drives.energy), DRIVE_MINIMUM, DRIVE_MAXIMUM),
        social: clamp(finite(fish.drives?.social, fallback.drives.social), DRIVE_MINIMUM, DRIVE_MAXIMUM),
      },
      history: {
        touches: Math.max(0, Math.round(finite(fish.history?.touches, 0))),
        boldnessDrift: clamp(finite(fish.history?.boldnessDrift, 0), 0, 0.18),
        sociabilityDrift: clamp(finite(fish.history?.sociabilityDrift, 0), 0, 0.12),
        socialMemory: sanitizeSocialMemory(fish.history?.socialMemory, seed),
      },
      behavior: {
        current: currentBehavior,
        previous: previousBehavior,
        blend: clamp(finite(fish.behavior?.blend, 1), 0, 1),
        ageSeconds: Math.max(0, finite(fish.behavior?.ageSeconds, 0)),
        ageRealSeconds: Math.max(0, finite(fish.behavior?.ageRealSeconds, 0)),
      },
      // Activity targets are visual intentions, not durable biology. Rebuild a
      // safe broad-behavior default instead of resuming yesterday's bubble or
      // retaining an object reference from a malformed save.
      activity: createActivityState(defaultActivityForBehavior(currentBehavior)),
      visual: {
        facing: fish.visual?.facing === -1 ? -1 : fish.visual?.facing === 1 ? 1 : (finite(fish.vx, fallback.vx) < 0 ? -1 : 1),
        targetFacing: fish.visual?.targetFacing === -1 ? -1 : fish.visual?.targetFacing === 1
          ? 1
          : (finite(fish.vx, fallback.vx) < 0 ? -1 : 1),
        turnProgress: clamp(finite(fish.visual?.turnProgress, 1), 0, 1),
        pitch: clamp(finite(fish.visual?.pitch, 0), -MAX_FISH_PITCH_DEGREES, MAX_FISH_PITCH_DEGREES),
        targetPitch: clamp(finite(fish.visual?.targetPitch, 0), -MAX_FISH_PITCH_DEGREES, MAX_FISH_PITCH_DEGREES),
      },
    };
  });

  if (individuals.length < 5) return baseState;
  const availableSeeds = new Set(individuals.map((fish) => fish.seed));
  const normalizedIndividuals = individuals.map((fish) => ({
    ...fish,
    history: {
      ...fish.history,
      socialMemory: sanitizeSocialMemory(fish.history.socialMemory, fish.seed, availableSeeds),
    },
  }));

  const plants = saved.persistenceVersion === 1
    ? restoreLegacyPlants(baseState, saved)
    : restoreDynamicPlants(baseState, saved);
  const totalDays = Math.max(0, finite(saved.totalDays, 0));

  const restored = {
    ...baseState,
    rngState: finite(saved.rngState, baseState.rngState) >>> 0,
    elapsedSimSeconds: Math.max(0, finite(saved.elapsedSimSeconds, 0)),
    totalDays,
    timeOfDayHours: ((finite(saved.timeOfDayHours, baseState.timeOfDayHours) % 24) + 24) % 24,
    settings: { ...baseState.settings, ...(saved.settings ?? {}) },
    individuals: normalizedIndividuals,
    plants,
    content: sanitizeContent(saved.content, { totalDays, seed: baseState.seed }),
  };

  // A zero-length advance resolves nothing new, but it does materialize the
  // bounded one-time milestones an older save is already overdue for. That is
  // what keeps a long-lived Phase 2 aquarium from being stuck at six fish
  // forever, and it is a no-op for a save that already recorded them.
  return advanceAquariumHistory(restored, 0);
}

// Version 1 stored maxHeight and no species or motion traits. Its positions and
// ages are retained while the missing compact traits come from the
// deterministic version-2 specimen occupying the same layout slot, so the
// original roster is what an old save comes back as.
function restoreLegacyPlants(baseState, saved) {
  return baseState.plants.map((fallback, index) => {
    const plant = saved.plants[index];
    if (!plant || typeof plant !== "object") return fallback;
    const speciesId = typeof plant.speciesId === "string" && PLANT_SPECIES_BY_ID[plant.speciesId]
      ? plant.speciesId
      : fallback.speciesId;
    const species = PLANT_SPECIES_BY_ID[speciesId];
    return {
      ...fallback,
      seed: finite(plant.seed, fallback.seed) >>> 0,
      speciesId,
      x: clamp(finite(plant.x, fallback.x), 0.35, baseState.cols - 0.35),
      ageDays: Math.max(0, finite(plant.ageDays, fallback.ageDays)),
      matureHeight: clamp(
        finite(plant.matureHeight, finite(plant.maxHeight, fallback.matureHeight)),
        1.2,
        baseState.rows - 6.5,
      ),
      layer: species.layer,
      phase: finite(plant.phase, fallback.phase),
      frequency: clamp(finite(plant.frequency, fallback.frequency), 0.15, 0.55),
      sway: clamp(finite(plant.sway, fallback.sway), 0.55, 1.45),
      lean: clamp(finite(plant.lean, fallback.lean), -0.4, 0.4),
      stiffness: clamp(finite(plant.stiffness, fallback.stiffness), 0.65, 1.35),
      secondaryPhase: finite(plant.secondaryPhase, fallback.secondaryPhase),
      paletteSlot: Math.round(clamp(finite(plant.paletteSlot, fallback.paletteSlot), 0, 2)),
    };
  });
}

// A Phase 3 garden grows, so restoration can no longer rebuild it from the
// orientation's original habitat roster: doing that would silently delete every
// propagated shoot and every delayed rare plant on the next reload. A plant's
// identity is its stable seed, never its array position, so the saved roster is
// what comes back - validated field by field, deduplicated by seed, and capped.
// A plant whose seed matches an original specimen still falls back to that
// specimen for anything the save is missing, which is what keeps an existing
// garden byte-identical across the upgrade.
function restoreDynamicPlants(baseState, saved) {
  const originals = new Map(baseState.plants.map((plant) => [plant.seed >>> 0, plant]));
  const cap = plantCapFor(baseState.orientation);
  const seen = new Set();
  const plants = [];

  for (const plant of saved.plants) {
    if (plants.length >= cap) break;
    if (!plant || typeof plant !== "object") continue;
    if (!Number.isSafeInteger(plant.seed) || plant.seed < 0 || plant.seed > 0xffffffff) continue;
    const seed = plant.seed >>> 0;
    if (seen.has(seed)) continue;
    const fallback = originals.get(seed) ?? null;
    const speciesId = typeof plant.speciesId === "string" && PLANT_SPECIES_BY_ID[plant.speciesId]
      ? plant.speciesId
      : fallback?.speciesId;
    if (!speciesId) continue;
    if (!Number.isFinite(plant.x) && !fallback) continue;
    if (!Number.isFinite(plant.ageDays) && !fallback) continue;
    seen.add(seed);

    // Motion traits are cheap to re-derive and impossible to guess wrong: a
    // corrupt field falls back to the plant's own seeded variation rather than
    // to another specimen's animation.
    const derived = plantVariationFromSeed(seed);
    const base = fallback ?? createPlantFromSeed({
      seed,
      speciesId,
      x: clamp(finite(plant.x, baseState.cols / 2), 0.35, baseState.cols - 0.35),
      ageDays: Math.max(0, finite(plant.ageDays, 0)),
      rows: baseState.rows,
      matureHeight: plant.matureHeight,
    });
    plants.push({
      ...base,
      seed,
      speciesId,
      x: clamp(finite(plant.x, base.x), 0.35, baseState.cols - 0.35),
      ageDays: Math.max(0, finite(plant.ageDays, base.ageDays)),
      matureHeight: clamp(
        finite(plant.matureHeight, base.matureHeight),
        1.2,
        baseState.rows - 6.5,
      ),
      // Depth group is a species property, never a saved one.
      layer: PLANT_SPECIES_BY_ID[speciesId].layer,
      phase: finite(plant.phase, derived.phase),
      frequency: clamp(finite(plant.frequency, derived.frequency), 0.15, 0.55),
      sway: clamp(finite(plant.sway, derived.sway), 0.55, 1.45),
      lean: clamp(finite(plant.lean, derived.lean), -0.4, 0.4),
      stiffness: clamp(finite(plant.stiffness, derived.stiffness), 0.65, 1.35),
      secondaryPhase: finite(plant.secondaryPhase, derived.secondaryPhase),
      paletteSlot: Math.round(clamp(finite(plant.paletteSlot, derived.paletteSlot), 0, 2)),
    });
  }

  return plants.length ? plants : baseState.plants;
}

// Catch-up, never a neglect simulation. A month away costs an aquarium nothing:
// no fish is lost, no plant dies, no relationship is punished, and no milestone
// that fell inside the gap is missed. Locomotion is deliberately not replayed -
// a fish that arrived while the device was off simply resumes near the edge it
// entered from, so the next viewer effectively sees it joining.
export function advanceOffline(state, realSeconds) {
  const seconds = clamp(finite(realSeconds, 0), 0, 365 * 86400);
  if (seconds <= 0) return state;
  const days = seconds / 86400;
  const hour = (state.timeOfDayHours + seconds / 3600) % 24;
  const circadianEnergy = 0.48 + Math.max(0, Math.sin(((hour - 6) / 24) * Math.PI * 2)) * 0.2;
  // The same shared resolver the live tick uses, so a week spent offline and a
  // week spent accelerated reach the same aquarium.
  const advanced = advanceAquariumHistory(state, days);

  return {
    ...advanced,
    elapsedSimSeconds: state.elapsedSimSeconds + seconds,
    timeOfDayHours: hour,
    individuals: advanced.individuals.map((fish) => ({
      ...fish,
      drives: {
        hunger: clamp(fish.drives.hunger + days * 0.03, DRIVE_MINIMUM, DRIVE_MAXIMUM),
        energy: clamp(fish.drives.energy * 0.7 + circadianEnergy * 0.3, DRIVE_MINIMUM, DRIVE_MAXIMUM),
        social: clamp(fish.drives.social + days * 0.015, DRIVE_MINIMUM, DRIVE_MAXIMUM),
      },
      history: {
        ...fish.history,
        socialMemory: sanitizeSocialMemory(fish.history?.socialMemory, fish.seed)
          .map((entry) => ({ ...entry })),
      },
      behavior: { ...fish.behavior },
      // Transient intentions are rebuilt rather than resumed, with one
      // exception: a fish that arrived during the gap keeps its entry swim, so
      // the next viewer sees it joining instead of finding it already parked.
      activity: fish.activity?.current === ACTIVITIES.arrivalEnter
        ? { ...fish.activity }
        : createActivityState(defaultActivityForBehavior(fish.behavior.current)),
      visual: { ...fish.visual },
    })),
  };
}
