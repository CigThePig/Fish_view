import { CELL_HEIGHT, CELL_WIDTH } from "../sim/config.js";
import { glyphPixels } from "./bitmap-font.js";

// Rotated ASCII, not sheared ASCII.
//
// The previous renderer leaned a pitched fish by shearing every glyph sideways
// in proportion to its distance from the middle of its cell. A shear is not a
// rotation: it keeps every horizontal stroke horizontal, so `_`, `-` and the
// flat top of `o` stayed exactly as level as they were and the fish read as an
// italicised horizontal drawing rather than as a creature pointing downwards.
//
// The ink is now genuinely turned. A glyph's lit pixels are rotated about the
// centre of its own authoring cell, resampled onto the same authoring grid, and
// run-length encoded back into axis-aligned spans - which is all the panel
// driver ever sees. A rotated glyph therefore still costs nothing but a run of
// fillRect calls, exactly as an upright one does.
//
// The angle is quantised so this is a lookup rather than a per-frame transform.
// There are thirty supported glyphs and a bounded pitch range, so the whole
// state space is a few hundred small rasters that are built once, on demand,
// and then reused for the life of the process.

const DEGREES_TO_RADIANS = Math.PI / 180;

// Two degrees. A glyph's ink is ten by twenty-one authoring units, so a one
// degree change usually resamples to exactly the same occupancy grid: halving
// the step would double the cache to buy rasters that are bit-identical to
// their neighbours. Two degrees moves the far corner of the largest glyph by
// about four tenths of a unit, which is below the grid the raster is snapped
// to. Glyph anchors still rotate continuously, so the fish's axis sweeps
// smoothly and only the ink inside each cell settles in steps.
export const SPIN_STEP_DEGREES = 2;
// The whole reachable range, and no more: the simulation caps pitch at
// MAX_FISH_PITCH_DEGREES and pitch is the only thing that rotates a glyph.
// Keeping the two equal is what lets the connectivity guarantee above be a
// guarantee about every raster this module can produce rather than about the
// ones that happen to get asked for - a test in tests/glyph-rotation.test.js
// holds them together.
export const MAX_SPIN_DEGREES = 32;
const MAX_SPIN_INDEX = Math.round(MAX_SPIN_DEGREES / SPIN_STEP_DEGREES);

// Authoring units are square on the panel only if the scene keeps the font's
// own 12x24 cell proportion. A scene that does not - the artwork lab used to
// draw 18x28 cells - would turn a circle into an ellipse if the raster ignored
// it, so the unit aspect travels with the spin and is corrected for inside the
// rotation. It is quantised for the same reason the angle is: it is a cache
// key, and in practice only one or two distinct values are ever live.
const UNIT_ASPECT_STEPS = 32;
const NEUTRAL_UNIT_ASPECT_INDEX = UNIT_ASPECT_STEPS;

// Five by five coverage sampling, kept if a third of the cell is covered.
// Every output unit is fully on or fully off - no antialiasing, because a grey
// edge pixel would read as a rendering fault against this artwork - so the only
// dial is where the cut sits, and it is set by connectivity rather than by
// area. The font draws `/`, `\\` and `>` as staircases of two-by-three blocks
// that meet at their corners; resampling that at a half-covered cut severs the
// stroke into pieces at eight of the supported angles. A third keeps every
// glyph in the font in exactly as many connected pieces after rotation as it
// had before it, at every angle in range, for about a fifth more ink - a
// rotated stroke reads very slightly bolder and never broken.
const SUPERSAMPLE = 5;
const COVERAGE_THRESHOLD = 0.32;
const COVERAGE_SAMPLES = SUPERSAMPLE * SUPERSAMPLE;
const COVERAGE_MINIMUM = Math.max(1, Math.ceil(COVERAGE_SAMPLES * COVERAGE_THRESHOLD));

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

// The signed angle the ink is turned through, snapped to the cached grid.
export function quantizeSpin(degrees) {
  if (!Number.isFinite(degrees)) return 0;
  return clamp(Math.round(degrees / SPIN_STEP_DEGREES), -MAX_SPIN_INDEX, MAX_SPIN_INDEX);
}

export function spinDegrees(index) {
  return index * SPIN_STEP_DEGREES;
}

// How tall one authoring unit is on the panel relative to how wide it is. One
// means the scene keeps the font's own cell proportion.
export function quantizeUnitAspect(aspect) {
  if (!Number.isFinite(aspect) || aspect <= 0) return NEUTRAL_UNIT_ASPECT_INDEX;
  return clamp(Math.round(aspect * UNIT_ASPECT_STEPS), 8, 128);
}

const EMPTY_MASK = Object.freeze({
  spans: Object.freeze([]),
  minX: 0,
  minY: 0,
  maxX: 0,
  maxY: 0,
});

// One glyph's lit authoring units, as a flat occupancy grid over its own cell.
const sourceGrids = new Map();

function sourceGrid(char) {
  const cached = sourceGrids.get(char);
  if (cached) return cached;
  const grid = new Uint8Array(CELL_WIDTH * CELL_HEIGHT);
  let minX = CELL_WIDTH;
  let minY = CELL_HEIGHT;
  let maxX = 0;
  let maxY = 0;
  for (const pixel of glyphPixels(char)) {
    for (let y = pixel.y; y < pixel.y + pixel.height; y += 1) {
      for (let x = pixel.x; x < pixel.x + pixel.width; x += 1) {
        if (x < 0 || x >= CELL_WIDTH || y < 0 || y >= CELL_HEIGHT) continue;
        grid[y * CELL_WIDTH + x] = 1;
      }
    }
    minX = Math.min(minX, pixel.x);
    minY = Math.min(minY, pixel.y);
    maxX = Math.max(maxX, pixel.x + pixel.width);
    maxY = Math.max(maxY, pixel.y + pixel.height);
  }
  const result = { grid, minX, minY, maxX, maxY, empty: maxX <= minX };
  sourceGrids.set(char, result);
  return result;
}

// Collapse an occupancy grid into axis-aligned spans: run-length encode each
// row, then merge vertically adjacent rows carrying identical runs. An upright
// glyph therefore emits one span per stroke rather than one per source pixel -
// a pipe is a single tall rectangle - and paints exactly the pixels the old
// per-pixel rasteriser painted, because the source pixels tiled exactly.
function spansFromGrid(grid, width, height, offsetX, offsetY) {
  const spans = [];
  let previousStart = 0;
  let previousCount = 0;
  let previousRow = -2;
  for (let row = 0; row < height; row += 1) {
    const rowStart = spans.length;
    let column = 0;
    while (column < width) {
      if (!grid[row * width + column]) {
        column += 1;
        continue;
      }
      let end = column;
      while (end < width && grid[row * width + end]) end += 1;
      spans.push({ x: offsetX + column, y: offsetY + row, width: end - column, height: 1 });
      column = end;
    }
    const count = spans.length - rowStart;
    // An identical run of runs directly below the previous one: grow those
    // spans instead of emitting a second row of rectangles.
    if (count > 0 && count === previousCount && previousRow === row - 1) {
      let identical = true;
      for (let index = 0; index < count; index += 1) {
        const above = spans[previousStart + index];
        const here = spans[rowStart + index];
        if (above.x !== here.x || above.width !== here.width) {
          identical = false;
          break;
        }
      }
      if (identical) {
        for (let index = 0; index < count; index += 1) spans[previousStart + index].height += 1;
        spans.length = rowStart;
        previousRow = row;
        continue;
      }
    }
    if (count > 0) {
      previousStart = rowStart;
      previousCount = count;
      previousRow = row;
    }
  }
  return spans;
}

function maskFromSpans(spans) {
  if (!spans.length) return EMPTY_MASK;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const span of spans) {
    minX = Math.min(minX, span.x);
    minY = Math.min(minY, span.y);
    maxX = Math.max(maxX, span.x + span.width);
    maxY = Math.max(maxY, span.y + span.height);
    Object.freeze(span);
  }
  return Object.freeze({ spans: Object.freeze(spans), minX, minY, maxX, maxY });
}

function buildMask(char, spinIndex, aspectIndex) {
  const source = sourceGrid(char);
  if (source.empty) return EMPTY_MASK;
  if (spinIndex === 0) {
    return maskFromSpans(spansFromGrid(source.grid, CELL_WIDTH, CELL_HEIGHT, 0, 0));
  }

  const angle = spinDegrees(spinIndex) * DEGREES_TO_RADIANS;
  const unitAspect = aspectIndex / UNIT_ASPECT_STEPS;
  const sin = Math.sin(angle);
  const cos = Math.cos(angle);
  const centerX = CELL_WIDTH / 2;
  const centerY = CELL_HEIGHT / 2;
  // Authoring offsets are turned in panel space, so a unit taller than it is
  // wide is stretched into square units, rotated, and squashed back. The
  // determinant of the combined map is one, so the inverse below is exact.
  //   forward:  dx = ux*cos - unitAspect*uy*sin
  //             dy = ux*sin/unitAspect + uy*cos
  //   inverse:  ux = dx*cos + unitAspect*dy*sin
  //             uy = -dx*sin/unitAspect + dy*cos
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  for (const corner of [
    [source.minX, source.minY],
    [source.maxX, source.minY],
    [source.minX, source.maxY],
    [source.maxX, source.maxY],
  ]) {
    const ux = corner[0] - centerX;
    const uy = corner[1] - centerY;
    const dx = ux * cos - unitAspect * uy * sin + centerX;
    const dy = (ux * sin) / unitAspect + uy * cos + centerY;
    left = Math.min(left, dx);
    top = Math.min(top, dy);
    right = Math.max(right, dx);
    bottom = Math.max(bottom, dy);
  }
  const originX = Math.floor(left) - 1;
  const originY = Math.floor(top) - 1;
  const width = Math.ceil(right) + 1 - originX;
  const height = Math.ceil(bottom) + 1 - originY;
  const destination = new Uint8Array(width * height);

  const step = 1 / SUPERSAMPLE;
  const half = step / 2;
  let lit = 0;
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      let covered = 0;
      for (let sampleY = 0; sampleY < SUPERSAMPLE; sampleY += 1) {
        const dy = originY + row + sampleY * step + half - centerY;
        for (let sampleX = 0; sampleX < SUPERSAMPLE; sampleX += 1) {
          const dx = originX + column + sampleX * step + half - centerX;
          const gridX = Math.floor(dx * cos + unitAspect * dy * sin + centerX);
          const gridY = Math.floor((-dx * sin) / unitAspect + dy * cos + centerY);
          if (gridX < 0 || gridX >= CELL_WIDTH || gridY < 0 || gridY >= CELL_HEIGHT) continue;
          if (source.grid[gridY * CELL_WIDTH + gridX]) covered += 1;
        }
      }
      if (covered >= COVERAGE_MINIMUM) {
        destination[row * width + column] = 1;
        lit += 1;
      }
    }
  }
  // A one-unit mark - the apostrophe's tail, the interpunct - can miss a half
  // covered cell at every sample point and vanish. Nothing in this font is
  // allowed to disappear because it was turned, so fall back to any coverage
  // at all rather than dropping the character.
  if (lit === 0) {
    for (let row = 0; row < height; row += 1) {
      for (let column = 0; column < width; column += 1) {
        const dy = originY + row + 0.5 - centerY;
        const dx = originX + column + 0.5 - centerX;
        const gridX = Math.floor(dx * cos + unitAspect * dy * sin + centerX);
        const gridY = Math.floor((-dx * sin) / unitAspect + dy * cos + centerY);
        if (gridX < 0 || gridX >= CELL_WIDTH || gridY < 0 || gridY >= CELL_HEIGHT) continue;
        if (source.grid[gridY * CELL_WIDTH + gridX]) destination[row * width + column] = 1;
      }
    }
  }
  return maskFromSpans(spansFromGrid(destination, width, height, originX, originY));
}

const maskCache = new Map();

// The rotated ink of one glyph, in authoring units relative to its own cell
// origin. Built once per (glyph, angle, unit aspect) and then shared.
export function glyphSpinMask(char, spin = 0, spinAspect = 0) {
  const spinIndex = Number.isInteger(spin) ? clamp(spin, -MAX_SPIN_INDEX, MAX_SPIN_INDEX) : 0;
  const aspectIndex = spinIndex === 0
    ? NEUTRAL_UNIT_ASPECT_INDEX
    : (Number.isInteger(spinAspect) && spinAspect > 0 ? spinAspect : NEUTRAL_UNIT_ASPECT_INDEX);
  const key = `${char} ${spinIndex} ${aspectIndex}`;
  const cached = maskCache.get(key);
  if (cached) return cached;
  const mask = buildMask(char, spinIndex, aspectIndex);
  maskCache.set(key, mask);
  return mask;
}

export function glyphSpinCacheSize() {
  let spans = 0;
  for (const mask of maskCache.values()) spans += mask.spans.length;
  return { entries: maskCache.size, spans };
}

// The device rectangles one placed glyph paints. Each span's far edge is
// rounded rather than its size, so neighbouring rows and columns tile exactly:
// rounding origin and size independently opens one-pixel seams inside a glyph
// at any scale above 1, which is what made stems and blades look dashed.
export function glyphPixelRects({ char, x, y, scaleX = 1, scaleY = 1, spin = 0, spinAspect = 0 }) {
  const originX = Math.round(x);
  const originY = Math.round(y);
  return glyphSpinMask(char, spin, spinAspect).spans.map((span) => {
    const left = originX + Math.round(span.x * scaleX);
    const right = originX + Math.round((span.x + span.width) * scaleX);
    const top = originY + Math.round(span.y * scaleY);
    const bottom = originY + Math.round((span.y + span.height) * scaleY);
    return {
      x: left,
      y: top,
      width: Math.max(1, right - left),
      height: Math.max(1, bottom - top),
    };
  });
}

// Exactly the rectangle the call above paints into, computed by the same rules
// so it cannot disagree with it. Bounding the mask's raw extent is one pixel
// short wherever a one-unit span at the edge rounds to zero height and is
// widened back to the minimum of one; damage tracking restores only inside
// these bounds, and a single row of rotated ink outside them smears across the
// water the fish left.
export function glyphRasterBounds({ char, x, y, scaleX = 1, scaleY = 1, spin = 0, spinAspect = 0 }) {
  const mask = glyphSpinMask(char, spin, spinAspect);
  const originX = Math.round(x);
  const originY = Math.round(y);
  if (!mask.spans.length) {
    return { x: originX, y: originY, width: CELL_WIDTH * scaleX, height: CELL_HEIGHT * scaleY };
  }
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  for (const span of mask.spans) {
    const spanLeft = Math.round(span.x * scaleX);
    const spanTop = Math.round(span.y * scaleY);
    left = Math.min(left, spanLeft);
    top = Math.min(top, spanTop);
    right = Math.max(right, spanLeft + Math.max(1, Math.round((span.x + span.width) * scaleX) - spanLeft));
    bottom = Math.max(bottom, spanTop + Math.max(1, Math.round((span.y + span.height) * scaleY) - spanTop));
  }
  return {
    x: originX + left,
    y: originY + top,
    width: right - left,
    height: bottom - top,
  };
}
