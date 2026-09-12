/*
 * Persistent fish-viewer relationship state.
 *
 * Phase 6 is deliberately built on one compact durable scalar before any
 * behaviour is allowed to depend on it. `glassFamiliarity` answers one question:
 * how familiar is this individual fish with the person at the front glass?
 *
 * It is not personality. It never replaces seeded boldness, curiosity or the
 * fixed glass affinity. It is learned history that later Phase 6 slices can use
 * to shape latency, standoff, lingering and voluntary glass visits while the
 * fish remains recognisably itself.
 *
 * The state is bounded and contains no event history. Old saves that predate the
 * field read as unfamiliar, malformed imports are clamped, and offline time does
 * not manufacture familiarity.
 */

export const GLASS_FAMILIARITY_MINIMUM = 0;
export const GLASS_FAMILIARITY_MAXIMUM = 1;
export const GLASS_FAMILIARITY_DEFAULT = 0;

function clampFamiliarity(value) {
  return Math.max(GLASS_FAMILIARITY_MINIMUM, Math.min(GLASS_FAMILIARITY_MAXIMUM, value));
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
 * Immutable helper used by developer tooling and later learning code.
 *
 * This intentionally sets only the scalar. It does not grant relationship
 * progress, alter personality, or create interaction history.
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
