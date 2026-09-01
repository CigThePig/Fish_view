/*
 * Fish artwork extracted from asciiquarium 1.1 by Kirk Baucom.
 * Most original ASCII artwork is credited to Joan Stark.
 *
 * Copyright (C) 2003 Kirk Baucom
 * Licensed under GNU GPL v2 or later. See ../../LICENSE and
 * ../../THIRD_PARTY_NOTICES.md.
 *
 * Phase 0 keeps only right-facing fish no wider than eight cells. The
 * opposite direction is generated at runtime so both facings stay identical.
 *
 * Phase 4 adds the growth stages below each adult. An adult sprite is the last
 * frame of its own species' growth sequence, never a separate drawing, so a
 * fully grown aquarium is drawn from exactly the artwork it was drawn from
 * before growth existed.
 */

export const artAttribution = Object.freeze({
  source: "asciiquarium 1.1",
  author: "Kirk Baucom",
  primaryArtist: "Joan Stark",
  license: "GPL-2.0-or-later",
});

export const individualSprites = Object.freeze([
  {
    id: "double-fin",
    source: "add_new_fish:0",
    label: "max",
    shape: ["   \\\\", "  / \\\\", ">=_('>", "  \\\\_/", "   /"],
    mask: ["   1", "  1 1", "663745", "  111", "   3"],
  },
  {
    id: "round-fin",
    source: "add_old_fish:1",
    label: "max",
    shape: ["    \\", "\\ /--\\", ">=  (o>", "/ \\__/", "    /"],
    mask: ["    2", "6 1111", "66  745", "6 1111", "    3"],
  },
  {
    id: "tiny-dart",
    source: "add_old_fish:3",
    label: "max",
    shape: ["  __", "><_'>", "   '"],
    mask: ["  11", "61145", "   3"],
  },
  {
    id: "single-fin",
    source: "add_old_fish:5",
    label: "max",
    shape: ["   \\", "  / \\", ">=_('>", "  \\_/", "   /"],
    mask: ["   2", "  1 1", "661745", "  111", "   3"],
  },
  {
    id: "comma-tail",
    source: "add_old_fish:6",
    label: "max",
    shape: ["  ,\\", ">=('>", "  '/"],
    mask: ["  12", "66745", "  13"],
  },
  {
    id: "box-fin",
    source: "add_old_fish:7",
    label: "max",
    shape: ["  __", "\\/ o\\", "/\\__/"],
    mask: ["  11", "61 41", "61111"],
  },
  // Drawn for Fish View in the same eight-cell vocabulary rather than lifted
  // from asciiquarium. It is appended last so every existing sprite keeps its
  // roster index, its authored body profile, and its pitch pose.
  {
    id: "twin-sail",
    source: "fish-view:growth",
    label: "max",
    shape: [" /\\ /\\", ">=__('>", " \\___/"],
    mask: [" 11 11", "6633745", " 11111"],
  },
]);

/*
 * Growth artwork.
 *
 * Every stage below is the same fish at a smaller age, not a different fish:
 * the mask digits stay on the same anatomy from stage to stage (1/2/3 fins,
 * 4 eye, 5 mouth, 6 tail, 7 body), so a fish keeps its seeded colours as it
 * grows instead of being recoloured every time it develops.
 *
 * `body: false` marks the stages that are too small to carry the opaque body
 * underlay. A speck of a fry has no silhouette to fill, and backing three
 * characters with a solid slab reads as a rendering fault rather than as a
 * young fish.
 */
const SHARED_FRY = Object.freeze([
  Object.freeze({ label: "fry-1", shape: Object.freeze(["·"]), mask: Object.freeze(["7"]), body: false }),
  Object.freeze({ label: "fry-2", shape: Object.freeze([">>"]), mask: Object.freeze(["65"]), body: false }),
]);

const GROWTH_STAGE_ART = Object.freeze({
  "double-fin": Object.freeze([
    Object.freeze({ label: "fry", shape: Object.freeze(["><>"]), mask: Object.freeze(["665"]), body: false }),
    Object.freeze({
      label: "young-juvenile",
      shape: Object.freeze(["  /\\", ">=('>", "  \\/"]),
      mask: Object.freeze(["  11", "66745", "  11"]),
    }),
    Object.freeze({
      label: "juvenile",
      shape: Object.freeze(["  /-\\", ">=('>", "  \\_/"]),
      mask: Object.freeze(["  111", "66745", "  111"]),
    }),
    Object.freeze({
      label: "subadult",
      shape: Object.freeze(["  / \\", ">=_('>", "  \\_/"]),
      mask: Object.freeze(["  1 1", "663745", "  111"]),
    }),
  ]),
  "round-fin": Object.freeze([
    Object.freeze({ label: "fry", shape: Object.freeze(["><>"]), mask: Object.freeze(["665"]), body: false }),
    Object.freeze({
      label: "young-juvenile",
      shape: Object.freeze(["  /\\", ">=(o>", "  \\/"]),
      mask: Object.freeze(["  11", "66745", "  11"]),
    }),
    Object.freeze({
      label: "juvenile",
      shape: Object.freeze(["  /-\\", ">=(o>", "  \\_/"]),
      mask: Object.freeze(["  111", "66745", "  111"]),
    }),
    Object.freeze({
      label: "subadult",
      shape: Object.freeze(["   \\", "\\ /-\\", ">= (o>", "/ \\_/", "   /"]),
      mask: Object.freeze(["   2", "6 111", "66 745", "6 111", "   3"]),
    }),
  ]),
  "tiny-dart": Object.freeze([
    ...SHARED_FRY,
    Object.freeze({ label: "fry-3", shape: Object.freeze(["><>"]), mask: Object.freeze(["615"]), body: false }),
    Object.freeze({
      label: "juvenile",
      shape: Object.freeze(["  _", "><'>"]),
      mask: Object.freeze(["  1", "6145"]),
    }),
  ]),
  "single-fin": Object.freeze([
    Object.freeze({ label: "fry", shape: Object.freeze(["><>"]), mask: Object.freeze(["665"]), body: false }),
    Object.freeze({
      label: "young-juvenile",
      shape: Object.freeze(["  /\\", ">=('>", "  \\/"]),
      mask: Object.freeze(["  11", "66745", "  11"]),
    }),
    Object.freeze({
      label: "juvenile",
      shape: Object.freeze(["  / \\", ">=_('>", "  \\_/"]),
      mask: Object.freeze(["  1 1", "661745", "  111"]),
    }),
  ]),
  "comma-tail": Object.freeze([
    ...SHARED_FRY,
    Object.freeze({ label: "fry-3", shape: Object.freeze(["><>"]), mask: Object.freeze(["665"]), body: false }),
    Object.freeze({
      label: "juvenile",
      shape: Object.freeze(["  ,", ">=(>", "  '"]),
      mask: Object.freeze(["  1", "6675", "  1"]),
    }),
  ]),
  "box-fin": Object.freeze([
    Object.freeze({ label: "fry", shape: Object.freeze(["<o>"]), mask: Object.freeze(["645"]), body: false }),
    Object.freeze({
      label: "juvenile",
      shape: Object.freeze(["  _", "\\/o\\", "/\\_/"]),
      mask: Object.freeze(["  1", "6141", "6111"]),
    }),
  ]),
  "twin-sail": Object.freeze([
    Object.freeze({ label: "fry", shape: Object.freeze(["><>"]), mask: Object.freeze(["665"]), body: false }),
    Object.freeze({
      label: "young-juvenile",
      shape: Object.freeze([" /\\", ">=('>", " \\_/"]),
      mask: Object.freeze([" 11", "66745", " 111"]),
    }),
    Object.freeze({
      label: "juvenile",
      shape: Object.freeze([" /\\", ">=_('>", " \\__/"]),
      mask: Object.freeze([" 11", "663745", " 1111"]),
    }),
    Object.freeze({
      label: "subadult",
      shape: Object.freeze([" /\\/\\", ">=_('>", " \\__/"]),
      mask: Object.freeze([" 1111", "663745", " 1111"]),
    }),
  ]),
});

// A species' complete sequence, youngest first, ending in the adult sprite
// object itself. Sharing that object rather than copying it is what keeps the
// renderer's per-id sprite, body-box, and pitch-pose lookups pointing at the
// artwork they were calibrated against.
export const growthStagesBySpecies = Object.freeze(Object.fromEntries(
  individualSprites.map((adult) => [adult.id, Object.freeze([
    ...GROWTH_STAGE_ART[adult.id].map((stage) => Object.freeze({
      ...stage,
      id: `${adult.id}:${stage.label}`,
      speciesId: adult.id,
    })),
    adult,
  ])]),
));

export function growthStagesFor(speciesId) {
  return growthStagesBySpecies[speciesId] ?? growthStagesBySpecies[individualSprites[0].id];
}

export const schoolGlyphs = Object.freeze(["·", ">>", "><>"]);

export const waterlineArt = Object.freeze([
  "~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~",
  "^^^^ ^^^  ^^^   ^^^    ^^^^",
]);

export const substrateArt = Object.freeze([".", ",", ":", ";", "_"]);

export function spriteDimensions(sprite) {
  return {
    width: Math.max(...sprite.shape.map((row) => [...row].length)),
    height: sprite.shape.length,
  };
}
