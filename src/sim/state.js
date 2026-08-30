import { DEFAULT_SEED, DEFAULT_SETTINGS, orientationConfig } from "./config.js";
import { clamp, createIndividual, createPlant, createSchoolFish } from "./entities.js";
import { hashSeed, mix32 } from "./prng.js";

export const PERSISTENCE_VERSION = 1;

function entityCountFor(cols) {
  return cols < 50 ? 8 : 12;
}

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
  const plants = Array.from({ length: entityCountFor(dimensions.cols) }, (_, index) =>
    createPlant(numericSeed, index, dimensions.cols, dimensions.rows),
  );

  return {
    version: 1,
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
    return {
      ...fish,
      vx: direction.x * 0.72,
      vy: direction.y * 0.44,
      drives: { ...fish.drives },
      history: { ...fish.history },
      behavior: { ...fish.behavior },
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
      ...fish,
      drives: { ...fish.drives },
      history: { ...fish.history },
      behavior: { ...fish.behavior },
    })),
    plants: state.plants.map((plant) => ({ ...plant })),
  };
}

function finite(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

export function restorePersistentState(baseState, saved) {
  if (!saved || saved.persistenceVersion !== PERSISTENCE_VERSION) return baseState;
  if (saved.seed !== baseState.seed || saved.orientation !== baseState.orientation) return baseState;
  if (!Array.isArray(saved.individuals) || !Array.isArray(saved.plants)) return baseState;

  const individuals = saved.individuals.slice(0, 8).map((fish, index) => {
    const fallback = baseState.individuals[index % baseState.individuals.length];
    return {
      ...fallback,
      ...fish,
      seed: finite(fish.seed, fallback.seed) >>> 0,
      x: finite(fish.x, fallback.x),
      y: finite(fish.y, fallback.y),
      vx: finite(fish.vx, fallback.vx),
      vy: finite(fish.vy, fallback.vy),
      drives: {
        hunger: clamp(finite(fish.drives?.hunger, fallback.drives.hunger), 0.15, 0.85),
        energy: clamp(finite(fish.drives?.energy, fallback.drives.energy), 0.15, 0.85),
        social: clamp(finite(fish.drives?.social, fallback.drives.social), 0.15, 0.85),
      },
      history: {
        touches: Math.max(0, Math.round(finite(fish.history?.touches, 0))),
        boldnessDrift: clamp(finite(fish.history?.boldnessDrift, 0), 0, 0.18),
        sociabilityDrift: clamp(finite(fish.history?.sociabilityDrift, 0), 0, 0.12),
      },
      behavior: {
        current: typeof fish.behavior?.current === "string" ? fish.behavior.current : "cruise",
        previous: typeof fish.behavior?.previous === "string" ? fish.behavior.previous : "cruise",
        blend: clamp(finite(fish.behavior?.blend, 1), 0, 1),
        ageSeconds: Math.max(0, finite(fish.behavior?.ageSeconds, 0)),
      },
    };
  });

  if (individuals.length < 5) return baseState;

  return {
    ...baseState,
    rngState: finite(saved.rngState, baseState.rngState) >>> 0,
    elapsedSimSeconds: Math.max(0, finite(saved.elapsedSimSeconds, 0)),
    totalDays: Math.max(0, finite(saved.totalDays, 0)),
    timeOfDayHours: ((finite(saved.timeOfDayHours, baseState.timeOfDayHours) % 24) + 24) % 24,
    settings: { ...baseState.settings, ...(saved.settings ?? {}) },
    individuals,
    plants: saved.plants.map((plant, index) => ({
      ...(baseState.plants[index % baseState.plants.length] ?? baseState.plants[0]),
      ...plant,
      seed: finite(plant.seed, baseState.seed) >>> 0,
      x: finite(plant.x, index + 1),
      ageDays: Math.max(0, finite(plant.ageDays, 1)),
      maxHeight: Math.max(2, finite(plant.maxHeight, 4)),
    })),
  };
}

export function advanceOffline(state, realSeconds) {
  const seconds = clamp(finite(realSeconds, 0), 0, 365 * 86400);
  if (seconds <= 0) return state;
  const days = seconds / 86400;
  const hour = (state.timeOfDayHours + seconds / 3600) % 24;
  const circadianEnergy = 0.48 + Math.max(0, Math.sin(((hour - 6) / 24) * Math.PI * 2)) * 0.2;

  return {
    ...state,
    elapsedSimSeconds: state.elapsedSimSeconds + seconds,
    totalDays: state.totalDays + days,
    timeOfDayHours: hour,
    plants: state.plants.map((plant) => ({ ...plant, ageDays: plant.ageDays + days })),
    individuals: state.individuals.map((fish) => ({
      ...fish,
      drives: {
        hunger: clamp(fish.drives.hunger + days * 0.03, 0.15, 0.85),
        energy: clamp(fish.drives.energy * 0.7 + circadianEnergy * 0.3, 0.15, 0.85),
        social: clamp(fish.drives.social + days * 0.015, 0.15, 0.85),
      },
      history: { ...fish.history },
      behavior: { ...fish.behavior },
    })),
  };
}

