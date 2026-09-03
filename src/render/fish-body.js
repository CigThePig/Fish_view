import { CELL_HEIGHT, CELL_WIDTH } from "../sim/config.js";
import { glyphPixels } from "../art/bitmap-font.js";
import { bodyProfileForId } from "./body-profiles.js";
import { pitchAngleDegrees } from "./fish-pitch.js";
import { glyphWidthScale, poseCoordinate, spritePoints } from "./fish-pose.js";

// The one opaque-body implementation. Production and the Typographic Motion Lab
// both call it, so a profile tuned in the lab is by construction the profile the
// tank draws - there is no second copy of this geometry to drift.
//
// ASCII fish used to be see-through: water bands, plants, and every other fish
// read straight through the sprite, which is what made a crowded school look
// like scattered line fragments. Each fish gets one opaque body behind its
// strokes.
//
// The body used to be nine vertical slices, and at pitch each slice was
// replaced by the axis-aligned bounding box of its four rotated corners. A
// bounding box around a narrow tilted slice is several times wider than the
// slice, so nine of them overlapping swelled a pitched fish into a rectangular
// slab: measured, a thirty degree double-fin filled 91% of its own bounding box
// against 87% level, and a comma-tail 95% against 58%. Two courses of fudge -
// a per-index rear inset and a per-index expansion taper - existed only to claw
// some of that back out of the open tail.
//
// It is now rasterised instead. The silhouette is sampled along the body axis,
// each sample is posed through the same transform the glyphs use, and the
// resulting tilted ribbon is scan-converted into horizontal spans. The panel
// still receives nothing but axis-aligned fillRect calls; they simply describe
// the fish's actual shape rather than a box around it.

// A little more height than the ink strictly occupies, in cell units. `_` draws
// along the bottom of its cell, so the roof and belly sit right on the body's
// edge. A small swell backs those strokes without turning the silhouette square.
const BODY_SWELL = 0.2;
// Half a glyph's ink, in cell units. Turn compression pulls glyph anchors
// together without narrowing the bitmaps, so an edge-on fish carries ink wider
// than the geometry under it; the body is dilated by the share of that ink the
// compression left standing outside. At full width the dilation is zero and the
// silhouette is purely geometric.
const GLYPH_INK_HALF_WIDTH_CELLS = 0.45;

// How finely the body axis is sampled, in device pixels per sample. Samples are
// not rectangles - they are the ribbon's cross-sections - so this only sets how
// smooth the tilted outline is, and three pixels puts the staircase on the top
// edge of a strongly pitched fish well under two pixels.
const AXIS_SAMPLE_PIXELS = 3;
const MIN_AXIS_SAMPLES = 8;
const MAX_AXIS_SAMPLES = 48;

const FIN_GLYPHS = new Set(["/", "\\"]);
// The vocabulary asciiquarium draws a tail from: the fin itself, the stroke
// pair that fans it, and the peduncle joining it to the body.
const TAIL_GLYPHS = new Set([">", "<", "=", "/", "\\"]);

const DEGREES_TO_RADIANS = Math.PI / 180;

const bodyBoxCache = new Map();

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

// A glyph's lit pixels, as offsets in cell units from the cell's own centre.
// Measuring the real ink matters: `_` draws along the bottom of its cell, so a
// body sized from cell centres reaches most of a cell above the roof it backs
// and leaves a tab sticking out over the fish. The horizontal extent is
// symmetrised because the same body serves both facings, and a mirrored glyph
// puts its ink on the other side of the cell.
function inkExtent(char) {
  const pixels = glyphPixels(char);
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let reach = 0;
  for (const pixel of pixels) {
    minY = Math.min(minY, pixel.y);
    maxY = Math.max(maxY, pixel.y + pixel.height);
    reach = Math.max(
      reach,
      Math.abs(pixel.x - CELL_WIDTH / 2),
      Math.abs(pixel.x + pixel.width - CELL_WIDTH / 2),
    );
  }
  return {
    reach: reach / CELL_WIDTH,
    top: (minY - CELL_HEIGHT / 2) / CELL_HEIGHT,
    bottom: (maxY - CELL_HEIGHT / 2) / CELL_HEIGHT,
  };
}

// Sprites are authored facing right, so the tail is the run of columns at the
// trailing edge drawn only from tail glyphs. It stops at the first column
// carrying anything else, which is where the body proper starts. The tail is
// left open like the fins: an opaque body behind it would read as one blunt
// mass rather than as a fish.
function tailColumns(source) {
  const columns = new Map();
  for (const point of source.points) {
    columns.set(point.column, (columns.get(point.column) ?? true) && TAIL_GLYPHS.has(point.char));
  }
  let end = 0;
  while (columns.get(end) === true) end += 1;
  return end;
}

// The body is fitted to the artwork rather than to the sprite's bounding box,
// which is a good deal larger than the fish inside it. Two kinds of row are
// fins, and fins stay outside the body so they keep their open ASCII
// silhouette: a row carrying a single stroke, and an outermost row drawn only
// from `/` and `\`. Everything else is fish and has to be backed - including
// the `_` roof and belly of the short sprites, which any fixed fraction of the
// sprite height leaves bare.
export function spriteBodyBox(sprite) {
  if (bodyBoxCache.has(sprite.id)) return bodyBoxCache.get(sprite.id);
  const source = spritePoints(sprite);
  const tail = tailColumns(source);
  const rows = new Map();
  for (const point of source.points) {
    const row = rows.get(point.row) ?? { count: 0, points: [], strokesOnly: true };
    row.count += 1;
    row.points.push(point);
    row.strokesOnly = row.strokesOnly && FIN_GLYPHS.has(point.char);
    rows.set(point.row, row);
  }
  let top = Number.POSITIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  let left = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  for (const [index, row] of rows) {
    const edge = index === 0 || index === source.height - 1;
    if (row.count < 2 || (edge && row.strokesOnly)) continue;
    for (const point of row.points) {
      if (point.column < tail) continue;
      const ink = inkExtent(point.char);
      top = Math.min(top, index + ink.top);
      bottom = Math.max(bottom, index + ink.bottom);
      left = Math.min(left, point.column - ink.reach);
      right = Math.max(right, point.column + ink.reach);
    }
  }
  const box = Object.freeze({
    // Cell units, measured from the sprite's own centre, so a body that sits
    // off-centre inside its box travels with the fish.
    offsetX: (left + right) / 2 - (source.width - 1) / 2,
    offsetY: (top + bottom) / 2 - (source.height - 1) / 2,
    radiusX: (right - left) / 2,
    radiusY: (bottom - top) / 2,
  });
  bodyBoxCache.set(sprite.id, box);
  return box;
}

// The tapered ellipse the six authored profile numbers describe, unchanged in
// meaning from the nine-slice renderer: `offsetX`/`offsetY` move it inside the
// measured box, `radiusXScale`/`radiusYScale` size it, and the two shoulder
// exponents set how sharply it closes at the tail and at the nose. Only the
// resolution it is evaluated at has changed - it is a curve now rather than
// nine steps of one.
function halfHeightAt(local, radiusX, radiusY, profile) {
  const waist = radiusX > 0 ? Math.abs(local) / radiusX : 0;
  // Positive source-space X is the nose because all source sprites face right.
  // Using a separate front shoulder lets pointed fish close around the nose
  // instead of carrying a round bubble beyond it, while the rear half is
  // unchanged.
  const shoulder = local >= 0 ? profile.frontShoulder : profile.rearShoulder;
  return radiusY * Math.sqrt(Math.max(0, 1 - waist ** shoulder));
}

// Scratch buffers. The body is rebuilt for every fish of every frame, so the
// scan conversion runs entirely inside preallocated arrays: no per-frame
// allocation happens here beyond the span objects that are the result.
const MAX_SCRATCH = MAX_AXIS_SAMPLES;
const ribTopX = new Float64Array(MAX_SCRATCH);
const ribTopY = new Float64Array(MAX_SCRATCH);
const ribBottomX = new Float64Array(MAX_SCRATCH);
const ribBottomY = new Float64Array(MAX_SCRATCH);
const crossingX = new Float64Array(MAX_SCRATCH);

// Scan-convert the tilted ribbon into horizontal spans, merging vertically
// adjacent rows that came out identical into single rectangles.
//
// One span per scanline. The silhouette is a single tapered lens - convex,
// gently bent by the swim wave, rigidly turned by the pitch - so a horizontal
// line crosses it exactly once and the row is simply the interval between the
// outermost ribs that reach it.
//
// The subtlety a slice-and-bound renderer never has to face is how wide that
// interval is. Ribs are the body's short axis, so a pitched pair is separated
// along a horizontal scanline by their spacing divided by the cosine of the
// pitch, not multiplied by it: an authored slice width projected onto the
// scanline is too narrow at every angle and leaves the fill in stripes.
// Measuring the spacing on the scanline itself is exact, needs no deliberate
// overlap between slices, and stays right while the swim wave bends the ribs
// out of parallel.
function rasterizeRibbon(ribs, nominalSpacing, dilation, color, out) {
  let top = Number.POSITIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < ribs; index += 1) {
    top = Math.min(top, ribTopY[index], ribBottomY[index]);
    bottom = Math.max(bottom, ribTopY[index], ribBottomY[index]);
  }
  if (!Number.isFinite(top) || !Number.isFinite(bottom)) return out;

  const firstRow = Math.floor(top);
  const lastRow = Math.ceil(bottom);
  let previousLeft = 0;
  let previousRight = 0;
  let previousRow = Number.NaN;
  let previousSpan = null;

  for (let row = firstRow; row <= lastRow; row += 1) {
    const sampleY = row + 0.5;
    let crossings = 0;
    for (let index = 0; index < ribs; index += 1) {
      const yTop = ribTopY[index];
      const yBottom = ribBottomY[index];
      if (sampleY < Math.min(yTop, yBottom) || sampleY > Math.max(yTop, yBottom)) continue;
      // The rib is the body's cross-section, so it is steep by construction:
      // pitch is capped well short of edge-on and the rib is the fish's short
      // axis. Interpolating x along it is therefore stable at every angle.
      const height = yBottom - yTop;
      const along = Math.abs(height) > 1e-9 ? clamp((sampleY - yTop) / height, 0, 1) : 0;
      crossingX[crossings] = ribTopX[index] + (ribBottomX[index] - ribTopX[index]) * along;
      crossings += 1;
    }
    if (crossings === 0) {
      previousSpan = null;
      continue;
    }

    let low = crossingX[0];
    let high = low;
    for (let index = 1; index < crossings; index += 1) {
      low = Math.min(low, crossingX[index]);
      high = Math.max(high, crossingX[index]);
    }
    // The outermost ribs sit half a spacing inside the body's ends, exactly as
    // the sampled slices did, so the row reaches half a spacing past each.
    const spacing = crossings > 1 ? (high - low) / (crossings - 1) : nominalSpacing;
    const reach = spacing / 2 + dilation;
    const left = Math.round(low - reach);
    const right = Math.max(left + 1, Math.round(high + reach));

    if (previousSpan && previousRow === row - 1 && left === previousLeft && right === previousRight) {
      previousSpan.height += 1;
    } else {
      previousSpan = { x: left, y: row, width: right - left, height: 1, color };
      out.push(previousSpan);
      previousLeft = left;
      previousRight = right;
    }
    previousRow = row;
  }
  return out;
}

// The opaque body of one fish, as device-space rectangles.
export function fishBodyFill(sprite, metrics, {
  worldX,
  worldY,
  turnScale = 1,
  facing = 1,
  phase = 0,
  deformationStrength = 1,
  pitch = 0,
  color,
  // Distance scale. It multiplies the posed offsets rather than the pose
  // itself, so the body keeps travelling with the same wave as the ink above
  // it however far away the fish is.
  scale = 1,
  // The lab passes a candidate profile; production takes the authored one.
  profile = null,
} = {}) {
  // The earliest growth stages are a speck, a pair of chevrons, three
  // characters. There is no silhouette there to make opaque, and a solid slab
  // behind three glyphs reads as a rendering fault rather than as a young fish,
  // so a fry is drawn as open ink exactly like the school it is the size of.
  if (sprite.body === false) return [];
  const source = spritePoints(sprite);
  const box = spriteBodyBox(sprite);
  if (!Number.isFinite(box.radiusX) || !Number.isFinite(box.radiusY)) return [];

  const shape = profile ?? bodyProfileForId(sprite.id);
  const centerColumn = (source.width - 1) / 2 + box.offsetX + shape.offsetX;
  const centerRow = (source.height - 1) / 2 + box.offsetY + shape.offsetY;
  const radiusX = box.radiusX * shape.radiusXScale;
  const radiusY = (box.radiusY + BODY_SWELL) * shape.radiusYScale;
  if (!(radiusX > 0) || !(radiusY > 0)) return [];

  const cellAspect = metrics.cellHeight / metrics.cellWidth;
  const pose = { facing, phase, deformationStrength, turnScale, pitch, cellAspect };
  const bodyPixels = radiusX * 2 * metrics.cellWidth * scale;
  const samples = clamp(
    Math.ceil(bodyPixels / AXIS_SAMPLE_PIXELS),
    MIN_AXIS_SAMPLES,
    MAX_AXIS_SAMPLES,
  );
  const step = (radiusX * 2) / samples;
  // How far apart two ribs land on one scanline. A run of two or more ribs
  // measures this from the ribs themselves; this is the fallback for the single
  // rib left at the very tip of a taper, and it is the exact figure for a rigid
  // pose - a tilted axis spreads its samples out by one over the cosine.
  const lean = Math.abs(pitchAngleDegrees(pitch, facing, turnScale)) * DEGREES_TO_RADIANS;
  const nominalSpacing = (step * metrics.cellWidth * scale * turnScale)
    / Math.max(0.25, Math.cos(lean));
  const widthScale = glyphWidthScale(turnScale);
  // Only the width compression took away; at full width this is zero and the
  // silhouette is exactly the posed geometry.
  const inkDilation = GLYPH_INK_HALF_WIDTH_CELLS * widthScale
    * (1 - clamp(Number.isFinite(turnScale) ? turnScale : 1, 0, 1))
    * metrics.cellWidth * scale;

  let ribs = 0;
  for (let index = 0; index < samples; index += 1) {
    // The middle of this sample's stretch of the body axis.
    const local = -radiusX + (index + 0.5) * step;
    const halfHeight = halfHeightAt(local, radiusX, radiusY, shape);
    if (halfHeight <= 0) continue;

    const sourceColumn = centerColumn + local;
    const top = poseCoordinate(source, sourceColumn, centerRow - halfHeight, pose);
    const bottom = poseCoordinate(source, sourceColumn, centerRow + halfHeight, pose);
    ribTopX[ribs] = (worldX + top.x * scale) * metrics.cellWidth;
    ribTopY[ribs] = (worldY + top.y * scale) * metrics.cellHeight;
    ribBottomX[ribs] = (worldX + bottom.x * scale) * metrics.cellWidth;
    ribBottomY[ribs] = (worldY + bottom.y * scale) * metrics.cellHeight;
    ribs += 1;
  }
  if (ribs === 0) return [];
  return rasterizeRibbon(ribs, nominalSpacing, inkDilation, color, []);
}
