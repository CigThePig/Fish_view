// The aquarium the measurement and capture tools grade.
//
// A new aquarium is one hatchling in a quarter of a school and fills itself up
// over the following seven months, so "the tank" a legibility, feeding or
// readability run is measuring is the stocked one at the end of that calendar -
// the fullest and least forgiving thing the renderer and the choreography ever
// have to carry. Every tool that poses a named roster slot, or watches an
// ordinary evening, opens the aquarium through here.
import { ROSTER_COMPLETE_DAY, advanceAquariumHistory } from "../src/sim/aquarium-history.js";

// Past the last arrival by more than the longest growth any fish can have, so
// even the newest member of the cast is drawn at the size it will keep.
export const STOCKED_AQUARIUM_DAY = ROSTER_COMPLETE_DAY + 200;

export function stocked(state, day = STOCKED_AQUARIUM_DAY) {
  return advanceAquariumHistory(state, day);
}
