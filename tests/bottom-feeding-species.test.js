import assert from "node:assert/strict";
import test from "node:test";
import { advanceAquariumHistory } from "../src/sim/aquarium-history.js";
import { speciesCanBottomFeed, speciesForSeed } from "../src/sim/fish-growth.js";
import { createAquariumState } from "../src/sim/state.js";
import { tick } from "../src/sim/tick.js";

const LARGE_SPECIES = new Set(["double-fin", "round-fin", "single-fin"]);
const COMPACT_SPECIES = new Set(["tiny-dart", "comma-tail", "box-fin", "twin-sail", "ribbed-dart"]);

test("only compact adult species are substrate feeders", () => {
  for (let seed = 0; seed < 8; seed += 1) {
    const species = speciesForSeed(seed).id;
    if (LARGE_SPECIES.has(species)) assert.equal(speciesCanBottomFeed(seed), false, species);
    else {
      assert.ok(COMPACT_SPECIES.has(species), `unclassified species ${species}`);
      assert.equal(speciesCanBottomFeed(seed), true, species);
    }
  }
});

test("a large species cannot remain in forage even from a forage-capable roster slot", () => {
  let state = advanceAquariumHistory(createAquariumState({ seed: 5 }), 400);
  const index = state.individuals.findIndex((fish, slot) => slot >= 3 && !speciesCanBottomFeed(fish.seed));
  assert.ok(index >= 3, "mature roster should contain a large species outside the protected first three slots");

  state = {
    ...state,
    individuals: state.individuals.map((fish, slot) => slot === index ? {
      ...fish,
      drives: { ...fish.drives, hunger: 0.85 },
      behavior: { current: "forage", previous: "cruise", blend: 1, ageSeconds: 30, ageRealSeconds: 30 },
    } : fish),
  };

  const next = tick(state, 0.1);
  assert.notEqual(next.individuals[index].behavior.current, "forage");
  assert.notEqual(next.individuals[index].activity.current, "substrate-search");
});

test("compact species still keep substrate forage available", () => {
  let state = advanceAquariumHistory(createAquariumState({ seed: 5 }), 400);
  const index = state.individuals.findIndex((fish, slot) => slot >= 3 && speciesCanBottomFeed(fish.seed));
  assert.ok(index >= 3, "mature roster should contain a compact forage-capable species");

  state = {
    ...state,
    individuals: state.individuals.map((fish, slot) => slot === index ? {
      ...fish,
      drives: { ...fish.drives, hunger: 0.85 },
      behavior: { current: "forage", previous: "cruise", blend: 1, ageSeconds: 30, ageRealSeconds: 30 },
    } : fish),
  };

  const next = tick(state, 0.1);
  assert.equal(next.individuals[index].behavior.current, "forage");
  assert.equal(next.individuals[index].activity.current, "substrate-search");
});
