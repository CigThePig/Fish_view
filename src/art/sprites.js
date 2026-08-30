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
    shape: ["   \\\\", "  / \\\\", ">=_('>", "  \\\\_/", "   /"],
    mask: ["   1", "  1 1", "663745", "  111", "   3"],
  },
  {
    id: "round-fin",
    source: "add_old_fish:1",
    shape: ["    \\", "\\ /--\\", ">=  (o>", "/ \\__/", "    /"],
    mask: ["    2", "6 1111", "66  745", "6 1111", "    3"],
  },
  {
    id: "tiny-dart",
    source: "add_old_fish:3",
    shape: ["  __", "><_'>", "   '"],
    mask: ["  11", "61145", "   3"],
  },
  {
    id: "single-fin",
    source: "add_old_fish:5",
    shape: ["   \\", "  / \\", ">=_('>", "  \\_/", "   /"],
    mask: ["   2", "  1 1", "661745", "  111", "   3"],
  },
  {
    id: "comma-tail",
    source: "add_old_fish:6",
    shape: ["  ,\\", ">=('>", "  '/"],
    mask: ["  12", "66745", "  13"],
  },
  {
    id: "box-fin",
    source: "add_old_fish:7",
    shape: ["  __", "\\/ o\\", "/\\__/"],
    mask: ["  11", "61 41", "61111"],
  },
]);

export const schoolGlyphs = Object.freeze(["·", ">>", "><>"]);

export const waterlineArt = Object.freeze([
  "~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~",
  "^^^^ ^^^  ^^^   ^^^    ^^^^",
]);

export const plantArt = Object.freeze({
  left: Object.freeze(["(", "{", "/"]),
  right: Object.freeze([")", "}", "\\"]),
  stem: "|",
  tip: "'",
});

export const substrateArt = Object.freeze([".", ",", ":", ";", "_"]);

export function spriteDimensions(sprite) {
  return {
    width: Math.max(...sprite.shape.map((row) => [...row].length)),
    height: sprite.shape.length,
  };
}

