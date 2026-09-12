/*
 * Phase 6D — voluntary fish-initiated glass visits.
 *
 * The aquarium is a 2D front view: there is no literal z-axis that can move a
 * fish toward the front pane. The readable equivalent is therefore a deliberate
 * return to a viewer-associated region, a quiet hover, then a short lateral
 * patrol around that point. The movement itself is the invitation; there is no
 * icon, prompt, notification, or special interaction mode.
 *
 * A visit is deliberately transient and fixed-size. It lives inside the same
 * non-persistent `viewerRelationship` record used by short-term saturation.
 * Reload/offline catch-up therefore cannot manufacture visits and no visit log
 * grows with aquarium age.
 */

import { clamp } from "./entities.js";
import { fishSpriteWidth } from "./fish-growth.js";
import { substrateSafeY, surfaceSafeY } from "./fish-motion.js";
import { mix32, sample01, sampleRange, sampleSigned } from "./prng.js";
import {
  relationshipResponseProfile,
  viewerSaturationFor,
} from "./viewer-relationship.js";

export const GLASS_VISIT_MIN_FAMILIARITY = 0.3;
export const GLASS_VISIT_RECENT_REGION_SECONDS = 10 * 60;
export const GLASS_VISIT_MAX_SATURATION = 0.58;
export const GLASS_VISIT_OPPORTUNITY_MIN_SECONDS = 220;
export const GLASS_VISIT_OPPORTUNITY_MAX_SECONDS = 340;
export const GLASS_VISIT_OPPORTUNITY_WINDOW_SECONDS = 12;

const ELIGIBLE_BEHAVIORS = new Set(["cruise", "explore"]);
const LOW_COMMITMENT_ACTIVITIES = new Set(["cruise", "open-water-wander"]);
const VISIT_MIN_SECONDS = 26;
const VISIT_MAX_SECONDS = 38;
const VISIT_EXTRA_FAMILIAR_SECONDS = 7;
const APPROACH_RADIUS = 1.65;
const LINGER_FRACTION = 0.52;
const PATROL_COLUMNS_MIN = 2.4;
const PATROL_COLUMNS_MAX = 5.2;
const DEFAULT_REGION_SPAN_COLUMNS = 10;
const DEFAULT_REGION_SPAN_ROWS = 2.2;

const GLASS_VISIT_CHOREOGRAPHY = Object.freeze({
  approachRadius: 2.2,
  arrivalSpeedScale: 0.18,
  positionGain: 0.82,
  verticalSpeedScale: 0.68,
  accelerationResponse: 1.75,
  turningResponse: 1.62,
  maximumSpeed: 0.88,
  minimumSpeed: 0.035,
  turnDuration: 0.72,
  pitchScale: 0.72,
  pitchResponse: 3.1,
});

function positiveModulo(value, modulus) {
  return ((value % modulus) + modulus) % modulus;
}

function relationshipWithoutVisit(fish) {
  const relationship = fish?.viewerRelationship;
  if (!relationship || !("glassVisit" in relationship)) return fish;
  const { glassVisit, ...remaining } = relationship;
  if (Object.keys(remaining).length) return { ...fish, viewerRelationship: remaining };
  const { viewerRelationship, ...withoutRelationship } = fish;
  return withoutRelationship;
}

function safeVerticalRange(fish, index, state, x) {
  const top = surfaceSafeY(fish, state, x);
  const floor = substrateSafeY(fish, state, x);
  const protectedFloor = index < 3
    ? top + Math.max(0, floor - top) * 0.68
    : floor;
  return { top, bottom: Math.max(top, Math.min(floor, protectedFloor)) };
}

function clampVisitPoint(fish, index, state, x, y) {
  const halfWidth = fishSpriteWidth(fish) / 2;
  const boundedX = clamp(x, halfWidth, state.cols - halfWidth);
  const range = safeVerticalRange(fish, index, state, boundedX);
  return {
    x: boundedX,
    y: clamp(y, range.top, range.bottom),
  };
}

function opportunity(state) {
  const period = sampleRange(
    state.seed >>> 0,
    9300,
    GLASS_VISIT_OPPORTUNITY_MIN_SECONDS,
    GLASS_VISIT_OPPORTUNITY_MAX_SECONDS,
  );
  const offset = sampleRange(state.seed >>> 0, 9301, 0, period);
  const clock = Math.max(0, state.elapsedRealSeconds ?? 0) + offset;
  const phase = positiveModulo(clock, period);
  return {
    open: phase < GLASS_VISIT_OPPORTUNITY_WINDOW_SECONDS,
    epoch: Math.floor(clock / period),
    phase,
    period,
  };
}

function activeVisit(fish) {
  const visit = fish?.viewerRelationship?.glassVisit;
  if (!visit || typeof visit !== "object") return null;
  const ageSeconds = Math.max(0, Number.isFinite(visit.ageSeconds) ? visit.ageSeconds : 0);
  const durationSeconds = Math.max(1, Number.isFinite(visit.durationSeconds) ? visit.durationSeconds : 1);
  if (ageSeconds >= durationSeconds) return null;
  return { ...visit, ageSeconds, durationSeconds };
}

function biologicallyAvailable(fish) {
  if (!ELIGIBLE_BEHAVIORS.has(fish.behavior?.current)) return false;
  return LOW_COMMITMENT_ACTIVITIES.has(fish.activity?.current);
}

function directViewerStimulusActive(state) {
  return (state.stimuli ?? []).some((stimulus) => stimulus?.source === "touch");
}

function invitationScore(fish, epoch, nowSeconds) {
  const profile = relationshipResponseProfile(fish);
  if (profile.familiarity < GLASS_VISIT_MIN_FAMILIARITY) return null;
  if (viewerSaturationFor(fish, nowSeconds) > GLASS_VISIT_MAX_SATURATION) return null;
  if (!biologicallyAvailable(fish) || fish.attention) return null;
  if ((fish.drives?.energy ?? 0.5) < 0.3 || (fish.drives?.hunger ?? 0.5) > 0.76) return null;

  // Bold, attentive, glass-oriented fish volunteer more readily, but high
  // familiarity can still carry a cautious fish over the line. The roll is per
  // opportunity epoch, so an unwilling fish does not change its mind every
  // frame inside the twelve-second invitation window.
  const willingness = clamp(
    0.07
      + profile.trust * 0.56
      + profile.confidence * 0.16
      + profile.attentiveness * 0.14
      + profile.familiarity * 0.07,
    0,
    0.92,
  );
  const epochSeed = mix32((fish.seed >>> 0) ^ Math.imul((epoch + 1) >>> 0, 0x9e3779b1));
  if (sample01(epochSeed, 9320) >= willingness) return null;
  return profile.trust * 0.5
    + profile.confidence * 0.2
    + profile.attentiveness * 0.16
    + profile.familiarity * 0.14
    + sampleRange(epochSeed, 9321, -0.055, 0.055);
}

/**
 * Return the one fish allowed to initiate during the current global opportunity.
 *
 * The opportunity is tank-wide rather than per-fish. Even a mature eight-fish
 * aquarium therefore produces at most one prominent invitation at a time, and
 * roughly one opportunity every four to six minutes rather than eight clocks
 * all firing independently.
 */
export function voluntaryGlassVisitor(state) {
  const existing = (state.individuals ?? [])
    .map((fish) => ({ fish, visit: activeVisit(fish) }))
    .filter(({ visit }) => visit)
    .sort((left, right) => (left.visit.startedAt ?? 0) - (right.visit.startedAt ?? 0)
      || left.fish.seed - right.fish.seed);
  if (existing.length) return existing[0].fish.seed;
  if (directViewerStimulusActive(state)) return null;

  const window = opportunity(state);
  if (!window.open) return null;
  let best = null;
  for (const fish of state.individuals ?? []) {
    const score = invitationScore(fish, window.epoch, state.elapsedRealSeconds);
    if (score === null) continue;
    if (!best || score > best.score || (score === best.score && fish.seed < best.seed)) {
      best = { seed: fish.seed, score };
    }
  }
  return best?.seed ?? null;
}

function visitAnchor(fish, index, state, epoch) {
  const relationship = fish.viewerRelationship ?? {};
  const now = Math.max(0, state.elapsedRealSeconds ?? 0);
  const recent = Number.isFinite(relationship.lastViewerX)
    && Number.isFinite(relationship.lastViewerY)
    && Number.isFinite(relationship.lastViewerAt)
    && now - relationship.lastViewerAt <= GLASS_VISIT_RECENT_REGION_SECONDS;
  if (recent) {
    return {
      ...clampVisitPoint(fish, index, state, relationship.lastViewerX, relationship.lastViewerY),
      recentRegion: true,
    };
  }

  // With no recent viewer region, the invitation stays local. A fish should not
  // spend a minute crossing the whole aquarium merely because a periodic clock
  // fired; it chooses a nearby piece of the glass and makes the intent visible
  // there instead.
  const seed = mix32((fish.seed >>> 0) ^ Math.imul((epoch + 1) >>> 0, 0x85ebca6b));
  const x = fish.x + sampleSigned(seed, 9330) * DEFAULT_REGION_SPAN_COLUMNS;
  const y = fish.y + sampleSigned(seed, 9331) * DEFAULT_REGION_SPAN_ROWS;
  return { ...clampVisitPoint(fish, index, state, x, y), recentRegion: false };
}

/**
 * Start one bounded visit when the global opportunity and fish personality agree.
 *
 * Expired or biologically-invalid visits are removed first. This is also the
 * guard that makes feeding/rest/social bouts outrank an invitation: the moment
 * the broad behavior leaves cruise/explore, the transient visit disappears.
 */
export function prepareVoluntaryGlassVisits(state) {
  let cleanupChanged = false;
  let individuals = (state.individuals ?? []).map((fish) => {
    const visit = activeVisit(fish);
    if (!visit) {
      const cleaned = relationshipWithoutVisit(fish);
      cleanupChanged ||= cleaned !== fish;
      return cleaned;
    }
    if (!biologicallyAvailable(fish) && !fish.attention) {
      cleanupChanged = true;
      return relationshipWithoutVisit(fish);
    }
    return fish;
  });

  // Defensive arbitration: production starts only one visit, but a malformed
  // dev fixture or future migration must not be able to create a glass crowd.
  const active = individuals
    .map((fish, index) => ({ fish, index, visit: activeVisit(fish) }))
    .filter(({ visit }) => visit)
    .sort((left, right) => (left.visit.startedAt ?? 0) - (right.visit.startedAt ?? 0)
      || left.fish.seed - right.fish.seed);
  if (active.length > 1) {
    const keep = active[0].index;
    individuals = individuals.map((fish, index) => {
      if (index === keep || !activeVisit(fish)) return fish;
      cleanupChanged = true;
      return relationshipWithoutVisit(fish);
    });
  }

  let next = cleanupChanged ? { ...state, individuals } : state;
  if (individuals.some((fish) => activeVisit(fish))) return next;
  if (directViewerStimulusActive(next)) return next;

  const seed = voluntaryGlassVisitor(next);
  if (seed === null) return next;
  const window = opportunity(next);
  let changed = false;
  individuals = individuals.map((fish, index) => {
    if (fish.seed !== seed) return fish;
    const anchor = visitAnchor(fish, index, next, window.epoch);
    const profile = relationshipResponseProfile(fish);
    const durationSeconds = sampleRange(
      mix32((fish.seed >>> 0) ^ Math.imul((window.epoch + 1) >>> 0, 0xc2b2ae35)),
      9340,
      VISIT_MIN_SECONDS,
      VISIT_MAX_SECONDS,
    ) + profile.familiarity * VISIT_EXTRA_FAMILIAR_SECONDS;
    changed = true;
    return {
      ...fish,
      viewerRelationship: {
        ...(fish.viewerRelationship ?? {}),
        glassVisit: {
          epoch: window.epoch,
          startedAt: next.elapsedRealSeconds,
          ageSeconds: 0,
          durationSeconds,
          anchorX: anchor.x,
          anchorY: anchor.y,
          recentRegion: anchor.recentRegion,
        },
      },
    };
  });
  return changed ? { ...next, individuals } : next;
}

/**
 * Remember the region a fish actually answered while a viewer stimulus is live.
 *
 * This happens in the normal live tick rather than in persistence. A slow drag
 * therefore leaves its latest meaningful region behind for a later visit, and
 * reload/offline time erases that short context instead of inventing history.
 */
export function trackViewerRegions(state) {
  const touchById = new Map((state.stimuli ?? [])
    .filter((stimulus) => stimulus?.source === "touch")
    .map((stimulus) => [stimulus.id, stimulus]));
  if (!touchById.size) return state;

  let changed = false;
  const individuals = (state.individuals ?? []).map((fish) => {
    const stimulus = touchById.get(fish.attention?.stimulusId);
    if (!stimulus) return fish;
    const previous = fish.viewerRelationship ?? {};
    const visit = activeVisit(fish);
    const glassVisit = visit
      ? { ...visit, anchorX: stimulus.x, anchorY: stimulus.y, recentRegion: true }
      : previous.glassVisit;
    changed = true;
    return {
      ...fish,
      viewerRelationship: {
        ...previous,
        lastViewerX: stimulus.x,
        lastViewerY: stimulus.y,
        lastViewerAt: state.elapsedRealSeconds,
        ...(glassVisit ? { glassVisit } : null),
      },
    };
  });
  return changed ? { ...state, individuals } : state;
}

function visitTarget(fish, index, visit, state) {
  const profile = relationshipResponseProfile(fish);
  const distance = Math.hypot(visit.anchorX - fish.x, visit.anchorY - fish.y);
  const arrived = distance <= APPROACH_RADIUS;
  const progress = clamp(visit.ageSeconds / visit.durationSeconds, 0, 1);
  const patrol = arrived && progress >= LINGER_FRACTION;
  const seed = mix32((fish.seed >>> 0) ^ Math.imul((visit.epoch + 1) >>> 0, 0x27d4eb2f));
  const phase = visit.ageSeconds * sampleRange(seed, 9350, 0.38, 0.56)
    + sampleRange(seed, 9351, 0, Math.PI * 2);
  const sweep = sampleRange(seed, 9352, PATROL_COLUMNS_MIN, PATROL_COLUMNS_MAX)
    * (0.82 + profile.confidence * 0.18);
  const hoverX = patrol ? Math.sin(phase) * sweep : 0;
  const hoverY = arrived ? Math.sin(phase * 0.73) * (0.12 + profile.attentiveness * 0.12) : 0;
  const point = clampVisitPoint(
    fish,
    index,
    state,
    visit.anchorX + hoverX,
    visit.anchorY + hoverY,
  );
  const phaseName = !arrived ? "approach" : patrol ? "patrol" : "linger";
  return {
    ...point,
    speed: !arrived
      ? 0.58 + profile.confidence * 0.2
      : patrol
        ? 0.14 + profile.attentiveness * 0.1
        : 0.065 + profile.attentiveness * 0.055,
    postureBias: arrived ? Math.sin(phase * 0.5) * 1.8 : 0,
    glassVisit: true,
    glassVisitPhase: phaseName,
    glassVisitRecentRegion: Boolean(visit.recentRegion),
    choreography: GLASS_VISIT_CHOREOGRAPHY,
  };
}

/**
 * Advance/steer an already-started invitation for one simulation frame.
 *
 * Direct attention pauses the clock and leaves the base touch target untouched.
 * Biological priorities or a high-commitment activity suppress the overlay; the
 * next `prepareVoluntaryGlassVisits()` call removes it cleanly.
 */
export function tickVoluntaryGlassVisit(fish, index, state, baseTarget, realDelta) {
  const visit = activeVisit(fish);
  if (!visit) return { fish, target: baseTarget };
  if (fish.attention) return { fish, target: baseTarget };
  if (!biologicallyAvailable(fish)) return { fish, target: baseTarget };

  const ageSeconds = Math.min(
    visit.durationSeconds,
    visit.ageSeconds + Math.max(0, Number.isFinite(realDelta) ? realDelta : 0),
  );
  if (ageSeconds >= visit.durationSeconds) {
    return {
      fish: {
        ...fish,
        viewerRelationship: {
          ...(fish.viewerRelationship ?? {}),
          glassVisit: { ...visit, ageSeconds },
        },
      },
      target: baseTarget,
    };
  }

  const nextVisit = { ...visit, ageSeconds };
  return {
    fish: {
      ...fish,
      viewerRelationship: {
        ...(fish.viewerRelationship ?? {}),
        glassVisit: nextVisit,
      },
    },
    target: visitTarget(fish, index, nextVisit, state),
  };
}
