/* Developer-only helpers for Phase 6 relationship inspection and accelerated fixtures. */

import { traitsFromSeed } from "../sim/entities.js";
import { affinitiesFromSeed } from "../sim/fish-personality.js";
import {
  glassFamiliarityFor,
  relationshipResponseProfile,
  viewerSaturationFor,
  withGlassFamiliarity,
} from "../sim/viewer-relationship.js";

function round(value, places = 3) {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

/**
 * Compact relationship row for reports and accelerated capture tooling.
 * Nothing here is user-facing and nothing mutates the simulation. The response
 * profile fields deliberately sit beside the seeded personality fields so a
 * capture can distinguish "this fish is bold" from "this fish knows the viewer".
 */
export function relationshipSnapshot(fish, elapsedRealSeconds = null) {
  const traits = traitsFromSeed(fish.seed, fish.history);
  const response = relationshipResponseProfile(fish);
  return Object.freeze({
    seed: fish.seed,
    glassFamiliarity: round(glassFamiliarityFor(fish), 4),
    attentionSaturation: round(viewerSaturationFor(fish, elapsedRealSeconds), 4),
    fixedGlassAffinity: round(affinitiesFromSeed(fish.seed).glass, 4),
    boldness: round(traits.boldness, 4),
    curiosity: round(traits.curiosity, 4),
    sociability: round(traits.sociability, 4),
    relationshipTrust: round(response.trust, 4),
    responseConfidence: round(response.confidence, 4),
    responseAttentiveness: round(response.attentiveness, 4),
  });
}

export function relationshipRoster(state) {
  return state.individuals.map((fish) => relationshipSnapshot(fish, state.elapsedRealSeconds));
}

/**
 * Create a controlled familiarity fixture without teaching production code a
 * developer shortcut. This is for deterministic captures at unfamiliar/early/
 * medium/high familiarity in later Phase 6 slices.
 */
export function withObservedGlassFamiliarity(state, fishSeed, familiarity) {
  let changed = false;
  const individuals = state.individuals.map((fish) => {
    if (fish.seed !== fishSeed) return fish;
    const next = withGlassFamiliarity(fish, familiarity);
    changed ||= next !== fish;
    return next;
  });
  return changed ? { ...state, individuals } : state;
}
