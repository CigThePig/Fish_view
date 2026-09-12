/*
 * Persistent fish-viewer relationship state.
 *
 * `glassFamiliarity` is the one durable value: accumulated comfort/interest
 * with the person at the front glass. It is deliberately separate from seeded
 * personality and fixed glass affinity, and it never needs a raw interaction
 * history.
 *
 * Phase 6B adds the short clock beside that long one. `viewerRelationship` is a
 * fixed-size, transient record carried only while the process is alive. It
 * remembers short-term attention saturation and enough bounded bookkeeping to
 * avoid paying the same held interaction twice. It is never serialised and is
 * cleared by offline progression/reload.
 */

export const GLASS_FAMILIARITY_MINIMUM = 0;
export const GLASS_FAMILIARITY_MAXIMUM = 1;
export const GLASS_FAMILIARITY_DEFAULT = 0;

export const VIEWER_SATURATION_MINIMUM = 0;
export const VIEWER_SATURATION_MAXIMUM = 1;
// Repetition should matter across a burst of separate interactions, not across
// bedtime and not merely because one finger stayed put. A half-life keeps decay
// smooth and deterministic without a per-frame timer.
export const VIEWER_SATURATION_HALF_LIFE_SECONDS = 22;

const SATURATION_ROLE_GAIN = Object.freeze({
  investigate: 0.28,
  approach: 0.18,
  delayed: 0.15,
  watch: 0.08,
  wary: 0.06,
  acknowledge: 0.05,
});

const FAMILIARITY_ROLE_GAIN = Object.freeze({
  investigate: 0.0022,
  approach: 0.0013,
  delayed: 0.001,
  watch: 0.00035,
  wary: 0.00012,
  acknowledge: 0.00008,
});

const ACTIVE_ROLES = new Set(["investigate", "approach", "delayed"]);
const ROTATABLE_ROLES = new Set(["approach", "delayed", "watch"]);
const SATURATION_STYLE_THRESHOLD = 0.55;
const SATURATION_STRONG_THRESHOLD = 0.82;
const SATURATION_ROTATE_THRESHOLD = 0.68;
const SATURATION_ROTATE_ADVANTAGE = 0.18;
const MAX_CREDIT_SECONDS = 1.2;
const NEAR_FAMILIARITY_PER_SECOND = 0.00042;
const MOVING_FAMILIARITY_PER_SECOND = 0.00024;
const MAX_LEGACY_TOUCHES = 1_000_000_000;

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function clampFamiliarity(value) {
  return clamp(value, GLASS_FAMILIARITY_MINIMUM, GLASS_FAMILIARITY_MAXIMUM);
}

function clampSaturation(value) {
  return clamp(value, VIEWER_SATURATION_MINIMUM, VIEWER_SATURATION_MAXIMUM);
}

/**
 * Return a safe persistent familiarity value.
 *
 * `fallback` exists for import/migration callers. Both values are sanitized so
 * a damaged save cannot smuggle NaN/Infinity or an out-of-range relationship
 * score into later response calculations.
 */
export function sanitizeGlassFamiliarity(value, fallback = GLASS_FAMILIARITY_DEFAULT) {
  const safeFallback = Number.isFinite(fallback)
    ? clampFamiliarity(fallback)
    : GLASS_FAMILIARITY_DEFAULT;
  return Number.isFinite(value) ? clampFamiliarity(value) : safeFallback;
}

/** Read familiarity from a fish without requiring every historical save shape to contain it. */
export function glassFamiliarityFor(fish) {
  return sanitizeGlassFamiliarity(fish?.history?.glassFamiliarity);
}

/**
 * Effective short-term saturation at `nowSeconds`.
 *
 * Saturation decays lazily when something asks for it. That makes the cost of
 * relationship bookkeeping zero on every ordinary untouched aquarium frame.
 */
export function viewerSaturationFor(fish, nowSeconds = null) {
  const transient = fish?.viewerRelationship;
  const stored = Number.isFinite(transient?.saturation)
    ? clampSaturation(transient.saturation)
    : VIEWER_SATURATION_MINIMUM;
  if (!Number.isFinite(nowSeconds) || !Number.isFinite(transient?.saturationAt)) return stored;
  const elapsed = Math.max(0, nowSeconds - transient.saturationAt);
  if (elapsed <= 0 || stored <= 0) return stored;
  return stored * (0.5 ** (elapsed / VIEWER_SATURATION_HALF_LIFE_SECONDS));
}

/** Materialise lazy saturation decay immediately before assigning a response. */
export function decayViewerSaturation(fish, nowSeconds) {
  if (!fish?.viewerRelationship) return fish;
  const saturation = viewerSaturationFor(fish, nowSeconds);
  if (saturation === fish.viewerRelationship.saturation
    && fish.viewerRelationship.saturationAt === nowSeconds) return fish;
  return {
    ...fish,
    viewerRelationship: {
      ...fish.viewerRelationship,
      saturation,
      saturationAt: nowSeconds,
    },
  };
}

/** Remove all short-term viewer state. Used by offline catch-up and reload semantics. */
export function clearViewerRelationshipTransient(fish) {
  if (!fish || !("viewerRelationship" in fish)) return fish;
  const { viewerRelationship, ...rest } = fish;
  return rest;
}

function familiarityHeadroom(familiarity) {
  // Early progress is easier to notice, high familiarity is earned slowly, and
  // the final stretch never becomes mathematically unreachable.
  return 0.22 + 0.78 * (1 - familiarity);
}

function saturationRewardScale(saturation) {
  // A saturated fish can still learn a little from a real interaction. This is
  // diminishing return, not punishment and never a hard zero.
  return 1 - 0.9 * clampSaturation(saturation);
}

function addFamiliarity(fish, rawGain, saturation) {
  if (!(rawGain > 0)) return fish;
  const familiarity = glassFamiliarityFor(fish);
  const gain = rawGain * familiarityHeadroom(familiarity) * saturationRewardScale(saturation);
  const glassFamiliarity = sanitizeGlassFamiliarity(familiarity + gain);
  if (glassFamiliarity === familiarity && fish.history?.glassFamiliarity === familiarity) return fish;
  return {
    ...fish,
    history: {
      ...(fish.history ?? {}),
      glassFamiliarity,
    },
  };
}

function addSaturation(fish, amount, nowSeconds) {
  if (!(amount > 0)) return fish;
  const saturation = viewerSaturationFor(fish, nowSeconds);
  return {
    ...fish,
    viewerRelationship: {
      ...(fish.viewerRelationship ?? {}),
      saturation: clampSaturation(saturation + amount),
      saturationAt: nowSeconds,
    },
  };
}

function responseSequence(stimulus) {
  return Number.isFinite(stimulus?.sequence) ? stimulus.sequence : null;
}

function isDirectViewerStimulus(stimulus) {
  return stimulus?.source === "touch";
}

function isActiveRole(role) {
  return ACTIVE_ROLES.has(role);
}

function roleAfterSaturation(role, saturation) {
  if (saturation < SATURATION_STYLE_THRESHOLD) return role;
  if (role === "investigate") return saturation >= SATURATION_STRONG_THRESHOLD ? "watch" : "approach";
  if (role === "approach" || role === "delayed") {
    return saturation >= SATURATION_STRONG_THRESHOLD ? "acknowledge" : "watch";
  }
  if ((role === "watch" || role === "wary") && saturation >= 0.92) return "acknowledge";
  return role;
}

/**
 * Turn short-term repetition into a change of response style.
 *
 * The assignment engine still decides who noticed and what they would normally
 * do. Saturation softens that answer. A fresh press is still guaranteed a
 * visible response because the Phase 2 assignment already supplies one, but it
 * does not have to remain a full investigator forever: a lone saturated fish
 * may only approach partway or turn to look. With a cast, a much fresher fish
 * may inherit the prominent investigator role instead.
 */
export function shapeAttentionForSaturation(fish, assignments, { guarantee = true } = {}) {
  const shaped = assignments.map((record, index) => {
    if (!record) return null;
    return { ...record, role: roleAfterSaturation(record.role, viewerSaturationFor(fish[index])) };
  });

  if (!guarantee) return shaped;
  const originalInvestigators = assignments
    .map((record, index) => (record?.role === "investigate" ? index : -1))
    .filter((index) => index >= 0);
  if (!originalInvestigators.length) return shaped;

  const anchor = originalInvestigators.reduce((best, index) =>
    viewerSaturationFor(fish[index]) < viewerSaturationFor(fish[best]) ? index : best,
  originalInvestigators[0]);
  const anchorSaturation = viewerSaturationFor(fish[anchor]);

  if (anchorSaturation >= SATURATION_ROTATE_THRESHOLD) {
    const alternatives = assignments
      .map((record, index) => ({ record, index, saturation: viewerSaturationFor(fish[index]) }))
      .filter(({ record, index, saturation }) => index !== anchor
        && record
        && ROTATABLE_ROLES.has(record.role)
        && Number.isFinite(record.distance)
        && record.distance <= 30
        && saturation + SATURATION_ROTATE_ADVANTAGE < anchorSaturation)
      .sort((left, right) => left.saturation - right.saturation
        || left.record.distance - right.record.distance
        || fish[left.index].seed - fish[right.index].seed);
    if (alternatives.length) {
      // Demoting the saturated primary to a passive glance keeps the original
      // active-response caps intact when the fresher fish takes its place.
      shaped[anchor] = { ...shaped[anchor], role: "watch" };
      const replacement = alternatives[0].index;
      shaped[replacement] = { ...assignments[replacement], role: "investigate" };
    }
  }

  return shaped;
}

/**
 * Pay the one-time part of a direct response and raise short-term saturation.
 *
 * Role, proximity and the fish's own participation decide the relationship
 * reward. `history.touches` is retained only as bounded compatibility telemetry:
 * one responding fish gets one count for a fresh press, but that count has no
 * effect on personality, familiarity or response selection.
 *
 * Saturation is also paid once per interaction sequence, so a long hold is
 * still one interaction. Its existing hold-habituation system remains
 * responsible for deciding when a fish gets bored with one unmoving finger.
 */
export function registerViewerResponses(fish, stimulus, nowSeconds) {
  if (!isDirectViewerStimulus(stimulus)) return fish;
  const sequence = responseSequence(stimulus);
  const freshPress = (stimulus.ageSeconds ?? 0) <= 1e-9 && (stimulus.holdSeconds ?? 0) <= 1e-9;
  const touchOwner = freshPress
    ? fish.findIndex((one) => one.attention?.stimulusId === stimulus.id)
    : -1;

  return fish.map((one, index) => {
    const response = one.attention;
    if (!response || response.stimulusId !== stimulus.id) return one;
    const previousSequence = one.viewerRelationship?.responseSequence;
    if (sequence !== null && previousSequence === sequence) return one;

    const saturation = viewerSaturationFor(one, nowSeconds);
    const proximity = Number.isFinite(response.distance)
      ? clamp(1 - response.distance / Math.max(1, stimulus.radius ?? 30), 0, 1)
      : 0;
    const rawGain = (FAMILIARITY_ROLE_GAIN[response.role] ?? 0) * (0.55 + proximity * 0.45);
    let next = addFamiliarity(one, rawGain, saturation);
    if (index === touchOwner) {
      next = {
        ...next,
        history: {
          ...(next.history ?? {}),
          touches: Math.min(MAX_LEGACY_TOUCHES, Math.max(0, next.history?.touches ?? 0) + 1),
        },
      };
    }
    next = addSaturation(next, SATURATION_ROLE_GAIN[response.role] ?? 0.04, nowSeconds);
    return {
      ...next,
      viewerRelationship: {
        ...(next.viewerRelationship ?? {}),
        responseSequence: sequence,
        engagementSequence: sequence,
        creditedNearSeconds: Math.max(0, response.nearSeconds ?? 0),
        engagementAt: nowSeconds,
      },
    };
  });
}

/**
 * Credit what actually happened after assignment: arriving, lingering, or
 * following a moving finger. Only the uncredited delta is paid, so a long hold
 * can be re-read forever without becoming an interaction log or a familiarity
 * mint. This adds familiarity but deliberately does not add saturation: the
 * hold system already has its own habituation clock, while saturation exists to
 * distinguish repeated separate interactions in a short burst.
 */
export function creditViewerEngagement(fish, stimulus, nowSeconds) {
  if (!isDirectViewerStimulus(stimulus)) return fish;
  const sequence = responseSequence(stimulus);
  return fish.map((one) => {
    const response = one.attention;
    if (!response || response.stimulusId !== stimulus.id || !isActiveRole(response.role)) return one;

    const transient = one.viewerRelationship ?? {};
    const sameEngagement = sequence !== null && transient.engagementSequence === sequence;
    const creditedNear = sameEngagement ? Math.max(0, transient.creditedNearSeconds ?? 0) : 0;
    const nearSeconds = Math.max(0, response.nearSeconds ?? 0);
    const nearDelta = Math.max(0, nearSeconds - creditedNear);
    const previousAt = sameEngagement && Number.isFinite(transient.engagementAt)
      ? transient.engagementAt
      : nowSeconds;
    const elapsed = clamp(nowSeconds - previousAt, 0, MAX_CREDIT_SECONDS);
    const moving = stimulus.held && stimulus.gesture !== "press" && (stimulus.speed ?? 0) > 0.5;
    const movingSeconds = moving ? elapsed : 0;
    const rawGain = nearDelta * NEAR_FAMILIARITY_PER_SECOND
      + movingSeconds * MOVING_FAMILIARITY_PER_SECOND;

    const saturation = viewerSaturationFor(one, nowSeconds);
    const next = addFamiliarity(decayViewerSaturation(one, nowSeconds), rawGain, saturation);
    return {
      ...next,
      viewerRelationship: {
        ...(next.viewerRelationship ?? {}),
        engagementSequence: sequence,
        creditedNearSeconds: nearSeconds,
        engagementAt: nowSeconds,
      },
    };
  });
}

/**
 * Immutable helper used by developer tooling and later learning code.
 *
 * This intentionally sets only the durable scalar. It does not grant progress,
 * alter personality, or create interaction history.
 */
export function withGlassFamiliarity(fish, familiarity) {
  if (!fish || typeof fish !== "object") return fish;
  const glassFamiliarity = sanitizeGlassFamiliarity(familiarity);
  if (glassFamiliarityFor(fish) === glassFamiliarity && fish.history?.glassFamiliarity === glassFamiliarity) {
    return fish;
  }
  return {
    ...fish,
    history: {
      ...(fish.history ?? {}),
      glassFamiliarity,
    },
  };
}
