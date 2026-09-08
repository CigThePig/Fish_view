/*
 * Fixtures for tests that need an aquarium with fish in it.
 *
 * A new aquarium is one hatchling in a quarter of a school - that is the
 * feature, not an accident - so a test about rendering a cast, about how two
 * fish behave near each other, or about the load a full tank puts on the
 * renderer has to say which aquarium it means. These helpers say it once.
 *
 * Nothing here ticks: locomotion, behaviour selection and the visual pose are
 * usually the thing under test, so the fixtures advance the long horizon and
 * fill the school without also running a frame of simulation.
 */

import {
  ROSTER_COMPLETE_DAY,
  SPECIES_COMPLETE_DAY,
  advanceAquariumHistory,
} from "../../src/sim/aquarium-history.js";
import { createSchoolFish } from "../../src/sim/entities.js";
import { forageActivity, forageEligible, substrateGrazeY } from "../../src/sim/fish-motion.js";
import { schoolCountFor } from "../../src/sim/fish-roster.js";
import { createAquariumState } from "../../src/sim/state.js";

// The school the aquarium's own age says it should be showing. `tick` does this
// every frame; a fixture that never ticks has to do it explicitly.
export function reconciledSchool(state) {
  return Array.from(
    { length: schoolCountFor(state.settings.schoolCount, state.totalDays) },
    (_, index) => createSchoolFish(state.seed, index, state.cols, state.rows),
  );
}

// Past the last arrival by more than the longest growth any fish can have, so
// a stocked aquarium is one where even the newest fish has finished developing
// rather than one holding a four-day-old fry with no body to draw.
const MATURITY_MARGIN_DAYS = 200;

/**
 * An aquarium old enough to hold everything it will ever hold: the full fish
 * roster, grown, and the full school. This is the aquarium most tests written
 * before the stocking calendar existed were assuming.
 */
export function stockedAquarium(options = {}, day = ROSTER_COMPLETE_DAY + MATURITY_MARGIN_DAYS) {
  const grown = advanceAquariumHistory(createAquariumState(options), day);
  return { ...grown, school: reconciledSchool(grown) };
}

/**
 * An aquarium partway through its calendar: every species present, the school
 * filled out, but the duplicate slots still to come. Use it where a test needs
 * a populated tank that still has room for one more fish.
 */
export function partStockedAquarium(options = {}) {
  return stockedAquarium(options, SPECIES_COMPLETE_DAY + 4);
}

/**
 * A fish from `state` placed on the substrate and genuinely working it, with
 * the roster slot it occupies.
 *
 * The graze line is per-fish and per-slot: a fish's distance from the glass
 * sets the scale it is drawn at and so how far its mouth reaches, and the mouth
 * leads the body over terrain that is not flat. A fixture that names a slot and
 * places it at a line computed without one lands a fish near the sand that
 * never registers as touching it, so this asks the production resolver instead.
 *
 * `pose` receives the individual and returns the fish to test; it defaults to
 * putting it in the foraging behaviour at its own graze line.
 */
export function grazingIndividual(state, { x = state.cols / 2, pose = null } = {}) {
  for (let slot = 0; slot < state.individuals.length; slot += 1) {
    if (!forageEligible(slot)) continue;
    const candidate = { ...state.individuals[slot], x };
    candidate.y = substrateGrazeY(candidate, state, candidate.x, slot);
    const fish = pose ? pose(candidate, slot) : {
      ...candidate,
      behavior: { current: "forage", previous: "cruise", blend: 1, ageSeconds: 30, ageRealSeconds: 30 },
    };
    if (forageActivity(fish, slot, state).contacting) return { index: slot, fish };
  }
  return null;
}
