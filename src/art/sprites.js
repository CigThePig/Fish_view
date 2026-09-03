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

import { glyphPixels } from "./bitmap-font.js";
import { CELL_HEIGHT, CELL_WIDTH } from "../sim/config.js";

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

// The lit pixels of a character that can be the lowest thing it draws once the
// drawing leans, as offsets from the centre of its cell in cell units. Half a
// cell is the cell edge.
//
// A cell is not the same thing as the mark drawn in it. An apostrophe inks the
// top third of its cell and nothing below; the "·" a first-stage fry is made of
// is one dot in the middle of an otherwise empty cell. Anything that asks how
// close the artwork can come to something - the substrate, most of all - and
// answers with the cell has a fish hovering a third of a row above the sand it
// is supposed to be eating from, and no way to know it.
//
// Nor is the mark the box around it. A ">" reaches furthest right halfway down
// and furthest down at its back, and the corner where those two meet is empty:
// bounding them together invents ink the rasteriser never paints and reserves
// room for it. What is kept instead is the staircase - the pixels no other
// pixel of the same glyph is both lower and further forward than - which is
// exactly the set that can be the extreme in some direction. It is one point
// for most characters and five for "/".
//
// Read from the same bitmaps the renderer rasterises, in the same 12x24 cell
// `positionedGlyph` places them in, so the two cannot drift apart.
const glyphInkCache = new Map();

function paretoLowestForward(points) {
  const kept = [];
  for (const point of points) {
    if (kept.some((other) => other.dy >= point.dy && other.dx >= point.dx)) continue;
    for (let index = kept.length - 1; index >= 0; index -= 1) {
      if (point.dy >= kept[index].dy && point.dx >= kept[index].dx) kept.splice(index, 1);
    }
    kept.push(point);
  }
  return kept;
}

export function glyphInkReach(character) {
  const cached = glyphInkCache.get(character);
  if (cached) return cached;
  // The rasteriser's own rectangles, so there is nothing here to keep in step
  // with it: the same spans it paints, read in the same 12x24 cell that
  // `positionedGlyph` places them in.
  const corners = glyphPixels(character).map((pixel) => ({
    dx: (pixel.x + pixel.width) / CELL_WIDTH - 0.5,
    dy: (pixel.y + pixel.height) / CELL_HEIGHT - 0.5,
  }));
  const reach = Object.freeze(
    (corners.length ? paretoLowestForward(corners) : [{ dx: 0, dy: 0 }])
      .map((point) => Object.freeze(point)),
  );
  glyphInkCache.set(character, reach);
  return reach;
}

// The underside of a sprite: the points of ink that can be the lowest thing the
// drawing has when it leans, as offsets from the centre of the anchor grid.
//
// A fish is not a rectangle. The box `spriteDimensions` reports is the right
// answer for "how much room does this need", and the wrong one for "how close
// can this get to the sand", because the point a box puts furthest down when
// the drawing leans - the bottom corner on the nose side - is empty on every
// species in the roster. That corner is a bigger lie about a bigger fish,
// which is why anything measured from the box alone gets worse as a fish grows.
//
// The same staircase prune that reduces a glyph reduces the sprite: a point is
// dropped only when another reaches at least as far down *and* as far forward,
// and therefore reaches at least as far at every angle. Whole cells fall out of
// it - an apostrophe under a slash keeps both, a stack of slashes keeps one -
// and the roster comes out between two and nine points, which is what makes
// this cheap enough to evaluate per fish per frame on the panel.
const undersideCache = new Map();

export function spriteUndersideProfile(sprite) {
  const cached = sprite?.id ? undersideCache.get(sprite.id) : null;
  if (cached) return cached;
  const { width, height } = spriteDimensions(sprite);
  const points = [];
  for (let row = 0; row < sprite.shape.length; row += 1) {
    const cells = [...sprite.shape[row]];
    for (let column = 0; column < cells.length; column += 1) {
      const character = cells[column];
      if (!character || character === " ") continue;
      for (const ink of glyphInkReach(character)) {
        points.push({
          dx: column - (width - 1) / 2 + ink.dx,
          dy: row - (height - 1) / 2 + ink.dy,
        });
      }
    }
  }
  const profile = Object.freeze(paretoLowestForward(points).map((point) => Object.freeze(point)));
  if (sprite?.id) undersideCache.set(sprite.id, profile);
  return profile;
}

// Where a sprite's mouth is: the cell its nose glyph occupies, and the ink in
// that cell that can reach furthest into the sand.
//
// Feeding is a statement about the mouth. A fish grazes when its mouth is at
// the sand, and the puff of silt a strike lifts is drawn from the mouth; the
// body's lowest ink answers a different question, and on a five-row adult the
// two are two rows apart. `dx`/`dy` are the cell's own anchor, which is what
// the renderer poses to place the puff; `reach` is the same staircase as the
// underside, which is what the graze line is set by.
//
// The artwork already says which cell it is. Mask slot "5" is the nose glyph on
// every species that has one, the way slot "4" is the eye; the four stages
// without one - a fry that is a single "·", and the box-fin pair whose nose is
// a fin - fall back to the outermost ink of the row the eye is on, and then to
// the outermost ink of the middle row. Authored right-facing, so the mouth is
// always at the greatest column; mirroring moves it with the rest of the fish.
const mouthCache = new Map();

export function spriteMouthOffset(sprite) {
  const cached = sprite?.id ? mouthCache.get(sprite.id) : null;
  if (cached) return cached;
  const { width, height } = spriteDimensions(sprite);
  const rowAt = (index) => [...(sprite.shape[index] ?? "")];
  const maskAt = (index) => [...(sprite.mask?.[index] ?? "")];
  const outermost = (index) => {
    const cells = rowAt(index);
    for (let column = cells.length - 1; column >= 0; column -= 1) {
      if (cells[column] && cells[column] !== " ") return column;
    }
    return null;
  };

  let mouth = null;
  for (let row = 0; row < sprite.shape.length && !mouth; row += 1) {
    const column = maskAt(row).indexOf("5");
    if (column >= 0 && rowAt(row)[column]?.trim()) mouth = { column, row };
  }
  if (!mouth) {
    for (let row = 0; row < sprite.shape.length && !mouth; row += 1) {
      if (!maskAt(row).includes("4")) continue;
      const column = outermost(row);
      if (column !== null) mouth = { column, row };
    }
  }
  if (!mouth) {
    const row = Math.floor((height - 1) / 2);
    mouth = { column: outermost(row) ?? Math.floor((width - 1) / 2), row };
  }

  // Where the mouth lands in the row-major order the occupied cells are walked
  // in. That is the order the renderer emits one fish's glyphs in, so anything
  // holding a drawn fish - the feeding measurement tool, the regression tests -
  // can find the mouth on the panel without re-deriving the pose.
  let glyph = 0;
  for (let row = 0; row < mouth.row; row += 1) {
    for (const cell of rowAt(row)) if (cell && cell !== " ") glyph += 1;
  }
  for (const [column, cell] of rowAt(mouth.row).entries()) {
    if (column >= mouth.column) break;
    if (cell && cell !== " ") glyph += 1;
  }

  const dx = mouth.column - (width - 1) / 2;
  const dy = mouth.row - (height - 1) / 2;
  const offset = Object.freeze({
    dx,
    dy,
    glyph,
    reach: Object.freeze(glyphInkReach(rowAt(mouth.row)[mouth.column])
      .map((ink) => Object.freeze({ dx: dx + ink.dx, dy: dy + ink.dy }))),
  });
  if (sprite?.id) mouthCache.set(sprite.id, offset);
  return offset;
}
