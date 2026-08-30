import { SUBSTRATE_ROWS, WATERLINE_ROWS } from "./config.js";
import { clamp, createSchoolFish, spriteForSeed, traitsFromSeed } from "./entities.js";
import { sampleRange } from "./prng.js";

const TAU = Math.PI * 2;
const BEHAVIORS = Object.freeze(["cruise", "explore", "social", "forage", "rest"]);

function smoothstep(edge0, edge1, value) {
  const amount = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return amount * amount * (3 - 2 * amount);
}

export function daylightFactor(hour) {
  const normalized = ((hour % 24) + 24) % 24;
  if (normalized < 5.75 || normalized >= 20.25) return 0;
  if (normalized < 7.25) return smoothstep(5.75, 7.25, normalized);
  if (normalized < 18.4) return 1;
  return 1 - smoothstep(18.4, 20.25, normalized);
}

function safeNormalize(x, y, fallbackX = 1, fallbackY = 0) {
  const length = Math.hypot(x, y);
  if (length < 0.00001) return { x: fallbackX, y: fallbackY };
  return { x: x / length, y: y / length };
}

function limitVelocity(vx, vy, minimum, maximum, fallbackDirection = 1) {
  const direction = safeNormalize(vx, vy, fallbackDirection, 0);
  const speed = clamp(Math.hypot(vx, vy), minimum, maximum);
  return { vx: direction.x * speed, vy: direction.y * speed };
}

function reconcileSchool(state) {
  const requested = Math.round(clamp(state.settings.schoolCount, 25, 40));
  if (requested === state.school.length) return state.school;
  if (requested < state.school.length) return state.school.slice(0, requested);
  const school = state.school.map((fish) => ({ ...fish }));
  for (let index = school.length; index < requested; index += 1) {
    school.push(createSchoolFish(state.seed, index, state.cols, state.rows));
  }
  return school;
}

function tickSchool(state, realDelta, motionScale) {
  const source = reconcileSchool(state);
  const top = WATERLINE_ROWS + 0.65;
  const bottom = state.rows - SUBSTRATE_ROWS - 0.65;
  const centerY = top + (bottom - top) * (0.5 + Math.sin(state.elapsedSimSeconds / 94) * 0.055);
  const maxSpeed = state.settings.schoolSpeed * motionScale;
  const minimumSpeed = Math.max(0.24, maxSpeed * 0.42);
  const reactionStrength = state.reaction ? 1.8 * (1 - state.reaction.ageSeconds / state.reaction.durationSeconds) : 0;

  return source.map((fish, index) => {
    let separationX = 0;
    let separationY = 0;
    let alignmentX = 0;
    let alignmentY = 0;
    let cohesionX = 0;
    let cohesionY = 0;
    let alignmentCount = 0;
    let cohesionCount = 0;

    for (let otherIndex = 0; otherIndex < source.length; otherIndex += 1) {
      if (otherIndex === index) continue;
      const other = source[otherIndex];
      const dx = other.x - fish.x;
      const dy = other.y - fish.y;
      const distanceSquared = dx * dx + dy * dy;
      if (distanceSquared < 0.0001) continue;

      if (distanceSquared < 8) {
        separationX -= dx / distanceSquared;
        separationY -= dy / distanceSquared;
      }
      if (distanceSquared < 64) {
        alignmentX += other.vx;
        alignmentY += other.vy;
        alignmentCount += 1;
      }
      if (distanceSquared < 110) {
        cohesionX += other.x;
        cohesionY += other.y;
        cohesionCount += 1;
      }
    }

    let ax = separationX * state.settings.separation;
    let ay = separationY * state.settings.separation;
    if (alignmentCount) {
      ax += (alignmentX / alignmentCount - fish.vx) * state.settings.alignment;
      ay += (alignmentY / alignmentCount - fish.vy) * state.settings.alignment;
    }
    if (cohesionCount) {
      ax += (cohesionX / cohesionCount - fish.x) * state.settings.cohesion * 0.055;
      ay += (cohesionY / cohesionCount - fish.y) * state.settings.cohesion * 0.055;
    }

    const edge = 3.2;
    if (fish.x < edge) ax += (edge - fish.x) * state.settings.boundary;
    if (fish.x > state.cols - edge) ax -= (fish.x - (state.cols - edge)) * state.settings.boundary;
    if (fish.y < top + 1.2) ay += (top + 1.2 - fish.y) * state.settings.boundary;
    if (fish.y > bottom - 1.2) ay -= (fish.y - (bottom - 1.2)) * state.settings.boundary;
    ay += (centerY - fish.y) * state.settings.depthPreference * 0.09;

    if (state.reaction && reactionStrength > 0) {
      const toward = safeNormalize(state.reaction.x - fish.x, state.reaction.y - fish.y, index % 2 ? -1 : 1, 0);
      ax += toward.x * reactionStrength;
      ay += toward.y * reactionStrength;
    }

    const velocity = limitVelocity(
      fish.vx + ax * realDelta,
      fish.vy + ay * realDelta,
      minimumSpeed,
      maxSpeed,
      fish.vx < 0 ? -1 : 1,
    );
    let x = fish.x + velocity.vx * realDelta;
    let y = fish.y + velocity.vy * realDelta;
    let vx = velocity.vx;
    let vy = velocity.vy;

    if (x < 0.25) {
      x = 0.25;
      vx = Math.abs(vx);
    } else if (x > state.cols - 0.25) {
      x = state.cols - 0.25;
      vx = -Math.abs(vx);
    }
    if (y < top) {
      y = top;
      vy = Math.abs(vy);
    } else if (y > bottom) {
      y = bottom;
      vy = -Math.abs(vy);
    }

    return { x, y, vx, vy };
  });
}

function schoolCenter(school, state) {
  if (!school.length) return { x: state.cols / 2, y: state.rows / 2 };
  const sum = school.reduce((result, fish) => ({ x: result.x + fish.x, y: result.y + fish.y }), { x: 0, y: 0 });
  return { x: sum.x / school.length, y: sum.y / school.length };
}

export function behaviorUtilities(fish, state, traits = traitsFromSeed(fish.seed, fish.history)) {
  const daylight = daylightFactor(state.timeOfDayHours);
  const utilities = {
    cruise: 0.34 + traits.activity * 0.22 + fish.drives.energy * 0.1,
    explore: traits.curiosity * 0.55 + fish.drives.energy * 0.25 - fish.drives.hunger * 0.08,
    social: fish.drives.social * (0.5 + traits.sociability * 0.62),
    forage: fish.drives.hunger * (0.68 + traits.activity * 0.32),
    rest: (1 - fish.drives.energy) * (0.72 + (1 - traits.activity) * 0.38) + (1 - daylight) * 0.16,
  };
  utilities[fish.behavior.current] = (utilities[fish.behavior.current] ?? 0) + 0.07;
  return utilities;
}

function selectBehavior(fish, state, traits) {
  const utilities = behaviorUtilities(fish, state, traits);
  return BEHAVIORS.reduce(
    (best, behavior) => (utilities[behavior] > utilities[best] ? behavior : best),
    BEHAVIORS[0],
  );
}

function behaviorTarget(fish, state, traits, center, behavior) {
  const sprite = spriteForSeed(fish.seed);
  const halfHeight = sprite.shape.length / 2;
  const top = WATERLINE_ROWS + halfHeight + 0.4;
  const bottom = state.rows - SUBSTRATE_ROWS - halfHeight - 0.4;
  const preferredY = top + (bottom - top) * traits.preferredDepth;
  const cycle = state.elapsedSimSeconds;
  const driftX = state.cols * (0.5 + 0.42 * Math.sin(cycle / 41 + sampleRange(fish.seed, 21, 0, TAU)));
  const driftY = top + (bottom - top) * (0.5 + 0.38 * Math.sin(cycle / 57 + sampleRange(fish.seed, 22, 0, TAU)));

  if (behavior === "social") return { x: center.x, y: center.y, speed: 0.3 + traits.sociability * 0.28 };
  if (behavior === "forage") return { x: driftX, y: bottom, speed: 0.24 + traits.activity * 0.24 };
  if (behavior === "rest") return { x: driftX, y: preferredY + (bottom - preferredY) * 0.35, speed: 0.09 + traits.activity * 0.07 };
  if (behavior === "explore") return { x: driftX, y: driftY, speed: 0.28 + traits.curiosity * 0.35 };
  return {
    x: fish.vx < 0 ? 0 : state.cols,
    y: preferredY + Math.sin(cycle / 33 + sampleRange(fish.seed, 23, 0, TAU)) * 0.8,
    speed: 0.2 + traits.activity * 0.32,
  };
}

function tickIndividual(fish, index, state, school, realDelta, simDelta, motionScale) {
  const traits = traitsFromSeed(fish.seed, fish.history);
  const deltaHours = simDelta / 3600;
  const deltaDays = simDelta / 86400;
  const daylight = daylightFactor(state.timeOfDayHours);
  const current = fish.behavior.current;
  const hungerRelief = current === "forage" ? deltaHours * 0.018 : 0;
  const energyChange = current === "rest"
    ? deltaHours * 0.03
    : -deltaHours * (0.004 + traits.activity * 0.005);
  const socialRelief = current === "social" ? deltaHours * 0.022 : 0;
  const drives = {
    hunger: clamp(fish.drives.hunger + deltaHours * 0.003 - hungerRelief, 0.15, 0.85),
    energy: clamp(fish.drives.energy + energyChange + (1 - daylight) * deltaHours * 0.002, 0.15, 0.85),
    social: clamp(fish.drives.social + deltaHours * 0.0025 - socialRelief, 0.15, 0.85),
  };

  let behavior = {
    ...fish.behavior,
    ageSeconds: fish.behavior.ageSeconds + simDelta,
    blend: clamp(fish.behavior.blend + realDelta / 1.8, 0, 1),
  };
  const candidate = selectBehavior({ ...fish, drives, behavior }, state, traits);
  if (candidate !== behavior.current && behavior.ageSeconds >= 38 && behavior.blend >= 1) {
    behavior = { current: candidate, previous: behavior.current, blend: 0, ageSeconds: 0 };
  }

  const center = schoolCenter(school, state);
  let target = behaviorTarget(fish, state, traits, center, behavior.current);
  if (state.reaction) {
    target = {
      x: state.reaction.x,
      y: state.reaction.y,
      speed: 0.58 + traits.boldness * 0.22,
    };
  }

  const direction = safeNormalize(target.x - fish.x, target.y - fish.y, fish.vx < 0 ? -1 : 1, 0);
  const targetSpeed = target.speed * motionScale;
  const easing = 1 - Math.exp(-realDelta * (0.7 + behavior.blend * 0.8));
  let vx = fish.vx + (direction.x * targetSpeed - fish.vx) * easing;
  let vy = fish.vy + (direction.y * targetSpeed * 0.7 - fish.vy) * easing;
  const limited = limitVelocity(vx, vy, 0.055, 0.82 * motionScale, fish.vx < 0 ? -1 : 1);
  vx = limited.vx;
  vy = limited.vy;

  const sprite = spriteForSeed(fish.seed);
  const width = Math.max(...sprite.shape.map((row) => [...row].length));
  const height = sprite.shape.length;
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const top = WATERLINE_ROWS + halfHeight;
  const bottom = state.rows - SUBSTRATE_ROWS - halfHeight;
  let x = fish.x + vx * realDelta;
  let y = fish.y + vy * realDelta;
  const minimumY = index < 3 ? Math.max(top, WATERLINE_ROWS + 2.2) : top;
  const maximumY = index < 3 ? Math.min(bottom, WATERLINE_ROWS + (bottom - WATERLINE_ROWS) * 0.68) : bottom;

  if (x < halfWidth) {
    x = halfWidth;
    vx = Math.abs(vx);
  } else if (x > state.cols - halfWidth) {
    x = state.cols - halfWidth;
    vx = -Math.abs(vx);
  }
  if (y < minimumY) {
    y = minimumY;
    vy = Math.abs(vy);
  } else if (y > maximumY) {
    y = maximumY;
    vy = -Math.abs(vy);
  }

  const history = {
    ...fish.history,
    sociabilityDrift: clamp(
      fish.history.sociabilityDrift + deltaDays * (behavior.current === "social" ? 0.0007 : -0.00008),
      0,
      0.12,
    ),
  };

  return { ...fish, x, y, vx, vy, drives, history, behavior };
}

export function tick(state, dt) {
  const realDelta = clamp(Number.isFinite(dt) ? dt : 0, 0, 0.25);
  if (realDelta <= 0) return state;
  const timeScale = clamp(state.settings.timeScale, 1, 604800);
  const simDelta = realDelta * timeScale;
  const timeOfDayHours = (state.timeOfDayHours + simDelta / 3600) % 24;
  const daylight = daylightFactor(timeOfDayHours);
  const motionScale = 0.43 + daylight * 0.57;
  const reaction = state.reaction
    ? { ...state.reaction, ageSeconds: state.reaction.ageSeconds + realDelta }
    : null;
  const activeReaction = reaction && reaction.ageSeconds < reaction.durationSeconds ? reaction : null;
  const context = {
    ...state,
    elapsedRealSeconds: state.elapsedRealSeconds + realDelta,
    elapsedSimSeconds: state.elapsedSimSeconds + simDelta,
    totalDays: state.totalDays + simDelta / 86400,
    timeOfDayHours,
    reaction: activeReaction,
  };
  const school = tickSchool(context, realDelta, motionScale);
  const individuals = state.individuals.map((fish, index) =>
    tickIndividual(fish, index, context, school, realDelta, simDelta, motionScale),
  );
  const plants = state.plants.map((plant) => ({
    ...plant,
    ageDays: plant.ageDays + simDelta / 86400,
  }));

  return {
    ...context,
    school,
    individuals,
    plants,
  };
}

