import { mirrorRows, mirrorSprite, normalizeRows } from "../art/mirror.js";
import {
  individualSprites,
  plantArt,
  schoolGlyphs,
  spriteDimensions,
  substrateArt,
  waterlineArt,
} from "../art/sprites.js";
import { SUBSTRATE_ROWS, WATERLINE_ROWS } from "../sim/config.js";
import { plantHeight, spriteForSeed } from "../sim/entities.js";
import { sample01 } from "../sim/prng.js";
import { createCellGrid } from "./cell-grid.js";
import { MASK_SYMBOLS, scenePalette } from "./palette.js";

const BAYER_4 = Object.freeze([
  Object.freeze([0, 8, 2, 10]),
  Object.freeze([12, 4, 14, 6]),
  Object.freeze([3, 11, 1, 9]),
  Object.freeze([15, 7, 13, 5]),
]);

const DEPTH = Object.freeze({
  waterline: 10,
  backgroundPlants: 20,
  school: 30,
  individuals: 40,
  reaction: 45,
  foregroundPlants: 50,
  substrate: 60,
});

function baseCell(x, y, state, palette) {
  const waterBottom = state.rows - SUBSTRATE_ROWS;
  if (y >= waterBottom) {
    return { char: " ", fg: palette.substrateFg, bg: palette.substrateBg };
  }
  const threshold = BAYER_4[y % 4][x % 4];
  const washed = threshold < palette.nightLevel;
  const nightBg = (x + y) % 5 === 0 ? palette.nightWaterAmber : palette.nightWaterTeal;
  return { char: " ", fg: palette.waterline, bg: washed ? nightBg : palette.dayWater };
}

function put(grid, depth, zBuffer, x, y, char, fg, bg = undefined) {
  if (!char || char === " " || x < 0 || y < 0 || x >= grid.cols || y >= grid.rows) return;
  const index = y * grid.cols + x;
  if (depth < zBuffer[index]) return;
  const previous = grid.cells[index];
  grid.cells[index] = {
    char,
    fg: fg ?? previous.fg,
    bg: bg ?? previous.bg,
  };
  zBuffer[index] = depth;
}

function drawWaterline(grid, zBuffer, palette) {
  for (let y = 0; y < WATERLINE_ROWS; y += 1) {
    const row = waterlineArt[y % waterlineArt.length];
    for (let x = 0; x < grid.cols; x += 1) {
      put(grid, DEPTH.waterline, zBuffer, x, y, row[x % row.length], palette.waterline);
    }
  }
}

function drawPlant(grid, zBuffer, plant, state, palette, foreground) {
  const height = plantHeight(plant);
  const rootY = state.rows - SUBSTRATE_ROWS;
  const swayPhase = Math.floor(state.elapsedRealSeconds * 1.2 + sample01(plant.seed, 8) * 4);
  let x = Math.round(plant.x);
  const color = foreground ? palette.plantFront : palette.plantBack;
  const depth = foreground ? DEPTH.foregroundPlants : DEPTH.backgroundPlants;
  for (let offset = 1; offset <= height; offset += 1) {
    const y = rootY - offset;
    const leansLeft = (offset + swayPhase + (plant.seed & 1)) % 4 < 2;
    const variants = leansLeft ? plantArt.left : plantArt.right;
    const glyph = offset === height ? plantArt.tip : variants[offset % variants.length];
    if (offset % 4 === 0) x += leansLeft ? -1 : 1;
    put(grid, depth, zBuffer, x, y, glyph, color);
  }
}

function drawSchool(grid, zBuffer, school, palette) {
  school.forEach((fish, index) => {
    const source = schoolGlyphs[index % schoolGlyphs.length];
    const glyph = fish.vx < 0 ? mirrorRows([source])[0] : source;
    const x = Math.round(fish.x - [...glyph].length / 2);
    const y = Math.round(fish.y);
    const color = palette.school[index % palette.school.length];
    [...glyph].forEach((char, offset) => put(grid, DEPTH.school, zBuffer, x + offset, y, char, color));
  });
}

function maskColor(symbol, seed, palette) {
  if (!symbol || symbol === " ") return palette.masks.C;
  if (symbol === "4" || symbol === "W" || symbol === "w") return palette.masks.W;
  if (/^[1-9]$/.test(symbol)) {
    const slot = Number(symbol);
    const choice = Math.floor(sample01(seed, slot * 37) * MASK_SYMBOLS.length) % MASK_SYMBOLS.length;
    return palette.masks[MASK_SYMBOLS[choice]];
  }
  return palette.masks[symbol] ?? palette.masks.C;
}

function drawIndividual(grid, zBuffer, fish, palette) {
  const source = spriteForSeed(fish.seed);
  const facing = fish.vx < 0 ? mirrorSprite(source) : source;
  const { width, height } = spriteDimensions(source);
  const shape = normalizeRows(facing.shape, width);
  const mask = normalizeRows(facing.mask, width);
  const originX = Math.round(fish.x - width / 2);
  const originY = Math.round(fish.y - height / 2);
  for (let row = 0; row < height; row += 1) {
    const glyphs = [...shape[row]];
    const colors = [...mask[row]];
    for (let column = 0; column < width; column += 1) {
      put(
        grid,
        DEPTH.individuals,
        zBuffer,
        originX + column,
        originY + row,
        glyphs[column],
        maskColor(colors[column], fish.seed, palette),
      );
    }
  }
}

function drawReaction(grid, zBuffer, reaction, palette) {
  if (!reaction) return;
  const progress = reaction.ageSeconds / reaction.durationSeconds;
  const radius = 0.6 + progress * 4.5;
  const samples = 12;
  for (let index = 0; index < samples; index += 1) {
    const angle = (index / samples) * Math.PI * 2;
    const x = Math.round(reaction.x + Math.cos(angle) * radius);
    const y = Math.round(reaction.y + Math.sin(angle) * radius * 0.48);
    put(grid, DEPTH.reaction, zBuffer, x, y, progress < 0.45 ? "O" : "o", palette.ripple);
  }
  put(grid, DEPTH.reaction, zBuffer, Math.round(reaction.x), Math.round(reaction.y), "·", palette.ripple);
}

function drawSubstrate(grid, zBuffer, state, palette) {
  const start = state.rows - SUBSTRATE_ROWS;
  for (let y = start; y < state.rows; y += 1) {
    for (let x = 0; x < state.cols; x += 1) {
      const choice = (x * 7 + y * 13 + state.seed) % substrateArt.length;
      const glyph = y === start ? (x % 3 === 0 ? "_" : ".") : substrateArt[choice];
      put(grid, DEPTH.substrate, zBuffer, x, y, glyph, palette.substrateFg, palette.substrateBg);
    }
  }
}

export function render(state) {
  const palette = scenePalette(state);
  const grid = createCellGrid(state.cols, state.rows, (x, y) => baseCell(x, y, state, palette));
  const zBuffer = new Int16Array(state.cols * state.rows);
  zBuffer.fill(-1);

  drawWaterline(grid, zBuffer, palette);
  state.plants.filter((plant) => (plant.seed & 1) === 0).forEach((plant) =>
    drawPlant(grid, zBuffer, plant, state, palette, false),
  );
  drawSchool(grid, zBuffer, state.school, palette);
  state.individuals.forEach((fish) => drawIndividual(grid, zBuffer, fish, palette));
  drawReaction(grid, zBuffer, state.reaction, palette);
  state.plants.filter((plant) => (plant.seed & 1) === 1).forEach((plant) =>
    drawPlant(grid, zBuffer, plant, state, palette, true),
  );
  drawSubstrate(grid, zBuffer, state, palette);
  return grid;
}

export function renderSpritePreview(sprite, facing = "right") {
  const selected = facing === "left" ? mirrorSprite(sprite) : sprite;
  const dimensions = spriteDimensions(sprite);
  return {
    ...dimensions,
    shape: normalizeRows(selected.shape, dimensions.width),
    mask: normalizeRows(selected.mask, dimensions.width),
  };
}

export { individualSprites };

