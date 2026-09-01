import {
  DRIVE_MAXIMUM,
  DRIVE_MINIMUM,
  MAX_DRIVE_HOURS_PER_REAL_SECOND,
  MIN_BEHAVIOR_REAL_SECONDS,
  MIN_BEHAVIOR_SIM_SECONDS,
  SUBSTRATE_ROWS,
  WATERLINE_ROWS,
} from "./config.js";
import { advanceAquariumHistory } from "./aquarium-history.js";
import { clamp, createSchoolFish, traitsFromSeed } from "./entities.js";
import {
  chaseEvasionForFish,
  steerActivityVelocity,
} from "./fish-choreography.js";
import { fishSpriteWidth } from "./fish-growth.js";
import { createBubbleWorldRecords } from "./bubbles.js";
import {
  BEHAVIORS,
  socialEngagement,
  tickFishActivity,
} from "./fish-activities.js";
import {
  MAX_FISH_PITCH_DEGREES,
  forageEligible,
  substrateSafeY,
  surfaceSafeY,
} from "./fish-motion.js";
import { affinitiesFromSeed, updateSocialMemories } from "./fish-personality.js";
import { sampleRange } from "./prng.js";

// Hunger above this point is discomfort rather than appetite.
const HUNGER_COMFORT = 0.62;
// How far a fully starving fish suppresses the behaviours that compete with
// feeding for the same active time.
const STARVATION_DAMPING = 0.45;

const FACING_THRESHOLD = 0.11;
const PITCH_DEADZONE = 0.035;
const PITCH_NORMAL_VY = 0.22;
const PITCH_HARD_VY = 0.44;
const PITCH_NORMAL_DEGREES = 26;
const PITCH_EASE_RATE = 3.6;

function smoothstep(edge0, edge1, value) {
  const amount = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return amount * amount * (3 - 2 * amount);
}

function positiveModulo(value, modulus) {
  return ((value % modulus) + modulus) % modulus;
}

function behaviorBout(fish, state, salt, minimumPeriod, maximumPeriod, windowFraction) {
  const period = sampleRange(fish.seed, salt, minimumPeriod, maximumPeriod);
  const offset = sampleRange(fish.seed, salt + 1, 0, period);
  const phase = positiveModulo(state.elapsedRealSeconds + offset, period) / period;
  if (phase >= windowFraction) return 0;
  const progress = phase / windowFraction;
  return Math.sin(progress * Math.PI);
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
  const centerY = top + (bottom - top) * (0.5 + Math.sin(state.elapsedRealSeconds / 94) * 0.055);
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

// Hunger stops climbing once it reaches DRIVE_MAXIMUM, so a fish that keeps
// missing the substrate cannot express getting any hungrier: its forage utility
// plateaus while an equally saturated social drive outbids it indefinitely and
// the fish never eats again. Starvation therefore damps the behaviours that
// compete with feeding for the same active time rather than inflating forage
// past everything, which would also outrank rest and leave the fish exhausted.
function starvationPressure(hunger) {
  return clamp((hunger - HUNGER_COMFORT) / (DRIVE_MAXIMUM - HUNGER_COMFORT), 0, 1);
}

export function behaviorUtilities(
  fish,
  state,
  traits = traitsFromSeed(fish.seed, fish.history),
  allowForage = true,
) {
  const affinities = affinitiesFromSeed(fish.seed);
  const daylight = daylightFactor(state.timeOfDayHours);
  const utilities = {
    cruise: 0.3 + traits.activity * 0.18 + fish.drives.energy * 0.08,
    explore: traits.curiosity * 0.6 + fish.drives.energy * 0.28 - fish.drives.hunger * 0.08,
    social: fish.drives.social * (0.65 + traits.sociability * 0.62),
    forage: fish.drives.hunger * (0.68 + traits.activity * 0.28 + affinities.substrate * 0.13),
    rest: (1 - fish.drives.energy) * (0.72 + (1 - traits.activity) * 0.38) + (1 - daylight) * 0.16,
  };
  // Drives remain the reason a behavior can happen. Small real-time bout
  // windows let a meaningful need become visible within a watching session
  // instead of waiting hours for a hundredth-place drive change. The pulses
  // are seed-derived, bounded, and unable to manufacture hunger, fatigue, or
  // social need when those drives are low.
  if (allowForage) {
    const forageReadiness = clamp((fish.drives.hunger - 0.42) / 0.2, 0, 1);
    utilities.forage += behaviorBout(fish, state, 8700, 142, 218, 0.24)
      * forageReadiness * (0.48 + affinities.substrate * 0.18);
  }
  const socialReadiness = clamp((fish.drives.social - 0.38) / 0.3, 0, 1);
  utilities.social += behaviorBout(fish, state, 8710, 118, 188, 0.22)
    * socialReadiness * (0.07 + traits.sociability * 0.1);
  const restReadiness = clamp((0.58 - fish.drives.energy) / 0.28, 0, 1);
  utilities.rest += behaviorBout(fish, state, 8720, 176, 264, 0.2)
    * restReadiness * (0.34 + (1 - traits.activity) * 0.22);
  // Only a fish that can actually reach the substrate is steered by hunger. The
  // mid-water cast never forages, so damping its alternatives would buy nothing
  // and simply park it in a permanent rest.
  if (allowForage) {
    const damping = 1 - starvationPressure(fish.drives.hunger) * STARVATION_DAMPING;
    utilities.cruise *= damping;
    utilities.explore *= damping;
    utilities.social *= damping;
  }
  utilities[fish.behavior.current] = (utilities[fish.behavior.current] ?? 0) + 0.07;
  return utilities;
}

function selectBehavior(fish, state, traits, allowForage) {
  const utilities = behaviorUtilities(fish, state, traits, allowForage);
  if (!allowForage) utilities.forage = Number.NEGATIVE_INFINITY;
  return BEHAVIORS.reduce(
    (best, behavior) => (utilities[behavior] > utilities[best] ? behavior : best),
    BEHAVIORS[0],
  );
}

export function trajectoryPitchDegrees(vx, vy) {
  if (!Number.isFinite(vx) || !Number.isFinite(vy)) return 0;
  if (Math.hypot(vx, vy) < 0.06) return 0;
  const vertical = Math.abs(vy);
  if (vertical <= PITCH_DEADZONE) return 0;
  const normal = smoothstep(PITCH_DEADZONE, PITCH_NORMAL_VY, vertical) * PITCH_NORMAL_DEGREES;
  const extra = smoothstep(PITCH_NORMAL_VY, PITCH_HARD_VY, vertical)
    * (MAX_FISH_PITCH_DEGREES - PITCH_NORMAL_DEGREES);
  return Math.sign(vy) * clamp(normal + extra, 0, MAX_FISH_PITCH_DEGREES);
}

function tickVisualPose(fish, nextVx, nextVy, realDelta, postureBias = 0, choreography = null) {
  const initialFacing = fish.vx < 0 ? -1 : 1;
  const source = fish.visual ?? {};
  let facing = source.facing === -1 ? -1 : source.facing === 1 ? 1 : initialFacing;
  let targetFacing = source.targetFacing === -1 ? -1 : source.targetFacing === 1 ? 1 : facing;
  let turnProgress = clamp(Number.isFinite(source.turnProgress) ? source.turnProgress : 1, 0, 1);
  const desired = nextVx > FACING_THRESHOLD
    ? 1
    : nextVx < -FACING_THRESHOLD
      ? -1
      : targetFacing;

  if (desired !== targetFacing) {
    if (turnProgress >= 1) {
      targetFacing = desired;
      turnProgress = 0;
    } else if (desired === facing) {
      targetFacing = desired;
      turnProgress = 1 - turnProgress;
    }
  }

  const turnDuration = clamp(
    Number.isFinite(choreography?.turnDuration) ? choreography.turnDuration : 0.68,
    0.2,
    1.5,
  );
  turnProgress = clamp(turnProgress + realDelta / turnDuration, 0, 1);
  if (turnProgress >= 1) facing = targetFacing;

  const trajectory = trajectoryPitchDegrees(nextVx, nextVy);
  const pitchScale = clamp(
    Number.isFinite(choreography?.pitchScale) ? choreography.pitchScale : 1,
    0,
    1.5,
  );
  const targetPitch = clamp(
    trajectory * pitchScale + (Number.isFinite(postureBias) ? postureBias : 0),
    -MAX_FISH_PITCH_DEGREES,
    MAX_FISH_PITCH_DEGREES,
  );
  const previousPitch = clamp(
    Number.isFinite(source.pitch) ? source.pitch : 0,
    -MAX_FISH_PITCH_DEGREES,
    MAX_FISH_PITCH_DEGREES,
  );
  const pitchResponse = clamp(
    Number.isFinite(choreography?.pitchResponse) ? choreography.pitchResponse : PITCH_EASE_RATE,
    1,
    7,
  );
  const response = 1 - Math.exp(-realDelta * pitchResponse);
  const pitch = clamp(
    previousPitch + (targetPitch - previousPitch) * response,
    -MAX_FISH_PITCH_DEGREES,
    MAX_FISH_PITCH_DEGREES,
  );

  return { facing, targetFacing, turnProgress, pitch, targetPitch };
}

function tickIndividual(fish, index, state, school, bubbles, realDelta, simDelta, motionScale) {
  const traits = traitsFromSeed(fish.seed, fish.history);
  const affinities = affinitiesFromSeed(fish.seed);
  // See MAX_DRIVE_HOURS_PER_REAL_SECOND: appetite may not outrun the swimming
  // the fish has to do about it.
  const deltaHours = Math.min(simDelta / 3600, realDelta * MAX_DRIVE_HOURS_PER_REAL_SECOND);
  const daylight = daylightFactor(state.timeOfDayHours);
  const current = fish.behavior.current;
  const energyChange = current === "rest"
    ? deltaHours * 0.03
    : -deltaHours * (0.004 + traits.activity * 0.005);
  const engagement = socialEngagement(fish, state, school);
  const socialRelief = deltaHours * 0.024 * engagement;
  // Hunger relief waits for the activity tick below: the peck the fish performs
  // this frame is resolved there, and crediting a meal against the previous
  // frame's phase would feed the fish from contact the renderer has moved past.
  const drives = {
    hunger: clamp(fish.drives.hunger + deltaHours * 0.003, DRIVE_MINIMUM, DRIVE_MAXIMUM),
    energy: clamp(
      fish.drives.energy + energyChange + (1 - daylight) * deltaHours * 0.002,
      DRIVE_MINIMUM,
      DRIVE_MAXIMUM,
    ),
    social: clamp(fish.drives.social + deltaHours * 0.0025 - socialRelief, DRIVE_MINIMUM, DRIVE_MAXIMUM),
  };

  let behavior = {
    ...fish.behavior,
    ageSeconds: fish.behavior.ageSeconds + simDelta,
    ageRealSeconds: (fish.behavior.ageRealSeconds ?? 0) + realDelta,
    blend: clamp(fish.behavior.blend + realDelta / 1.8, 0, 1),
  };
  const allowForage = forageEligible(index);
  if (!allowForage && behavior.current === "forage") {
    behavior = { current: "cruise", previous: "forage", blend: 0, ageSeconds: 0, ageRealSeconds: 0 };
  }
  const candidate = selectBehavior({ ...fish, drives, behavior }, state, traits, allowForage);
  const settled = behavior.ageSeconds >= MIN_BEHAVIOR_SIM_SECONDS
    && behavior.ageRealSeconds >= MIN_BEHAVIOR_REAL_SECONDS
    && behavior.blend >= 1;
  if (candidate !== behavior.current && settled) {
    behavior = {
      current: candidate,
      previous: behavior.current,
      blend: 0,
      ageSeconds: 0,
      ageRealSeconds: 0,
    };
  }

  const fishWithBehavior = { ...fish, drives, behavior };
  const activityFrame = tickFishActivity(fishWithBehavior, index, state, realDelta, {
    traits,
    affinities,
    bubbles,
    school,
  });
  const { target } = activityFrame;
  const hungerRelief = target?.forageSearching
    ? deltaHours * 0.018 * (1 + (target.peck ?? 0) * 0.35)
    : 0;
  const fedDrives = hungerRelief > 0
    ? { ...drives, hunger: clamp(drives.hunger - hungerRelief, DRIVE_MINIMUM, DRIVE_MAXIMUM) }
    : drives;

  const evasion = chaseEvasionForFish(fishWithBehavior, state);
  const steered = steerActivityVelocity(fish, target, {
    realDelta,
    motionScale,
    behaviorBlend: behavior.blend,
    evasion,
  });
  let { vx, vy } = steered;

  const halfWidth = fishSpriteWidth(fish) / 2;
  let x = fish.x + vx * realDelta;
  let y = fish.y + vy * realDelta;

  if (x < halfWidth) {
    x = halfWidth;
    vx = Math.abs(vx);
  } else if (x > state.cols - halfWidth) {
    x = state.cols - halfWidth;
    vx = -Math.abs(vx);
  }

  const minimumY = surfaceSafeY(fish, state, x);
  const baseMaximumY = substrateSafeY(fish, state, x);
  const peckAllowance = behavior.current === "forage" && target.forageSearching
    ? Math.max(0, target.peckDisplacement ?? 0)
    : 0;
  const terrainMaximumY = baseMaximumY + peckAllowance;
  // The permanent mid-water cast keeps the same clearance-adjusted
  // swimming envelope it had before terrain-aware foraging. Applying the
  // 68% ceiling to the raw water column lets large/pitched fish drift
  // visibly deeper because their body clearance is ignored.
  const protectedMaximumY = WATERLINE_ROWS
    + Math.max(0, baseMaximumY - WATERLINE_ROWS) * 0.68;
  const maximumY = index < 3 ? Math.min(terrainMaximumY, protectedMaximumY) : terrainMaximumY;

  if (y < minimumY) {
    y = minimumY;
    vy = target.surfaceInspect ? Math.max(0, vy) : Math.abs(vy);
  } else if (y > maximumY) {
    y = maximumY;
    vy = behavior.current === "forage" ? Math.min(0, vy) : -Math.abs(vy);
  }

  const history = {
    ...fish.history,
    socialMemory: (fish.history.socialMemory ?? []).map((entry) => ({ ...entry })),
    sociabilityDrift: clamp(
      fish.history.sociabilityDrift + realDelta * (engagement > 0 ? engagement * 0.0000012 : -0.00000002),
      0,
      0.12,
    ),
  };

  return {
    ...fish,
    x,
    y,
    vx,
    vy,
    drives: fedDrives,
    history,
    behavior,
    activity: activityFrame.activity,
    visual: tickVisualPose(
      fish,
      vx,
      vy,
      realDelta,
      target.postureBias,
      target.choreography,
    ),
  };
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
  // Long-horizon world state - aquarium age, plant growth, and every discrete
  // historical event - is owned by one shared resolver so live accelerated
  // simulation and offline catch-up cannot drift apart. It runs on the full
  // simulated span, deliberately unlike the drive/behaviour clocks below.
  const advanced = advanceAquariumHistory(state, simDelta / 86400);
  const context = {
    ...advanced,
    elapsedRealSeconds: state.elapsedRealSeconds + realDelta,
    elapsedSimSeconds: state.elapsedSimSeconds + simDelta,
    timeOfDayHours,
    reaction: activeReaction,
  };
  const school = tickSchool(context, realDelta, motionScale);
  const activityContext = { ...context, school };
  const bubbles = createBubbleWorldRecords(activityContext);
  const movedIndividuals = advanced.individuals.map((fish, index) =>
    tickIndividual(fish, index, activityContext, school, bubbles, realDelta, simDelta, motionScale),
  );
  const individuals = updateSocialMemories(movedIndividuals, realDelta);

  return {
    ...context,
    school,
    individuals,
  };
}
