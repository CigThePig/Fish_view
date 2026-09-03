import assert from "node:assert/strict";
import test from "node:test";

import { BITMAP_FONT, glyphPixels } from "../src/art/bitmap-font.js";
import {
  MAX_SPIN_DEGREES,
  SPIN_STEP_DEGREES,
  glyphPixelRects,
  glyphRasterBounds,
  glyphSpinMask,
  quantizeSpin,
  quantizeUnitAspect,
} from "../src/render/glyph-raster.js";
import { individualSprites, render, renderSpriteScene } from "../src/render/render.js";
import { glyphsForObject } from "../src/render/scene.js";
import { MAX_FISH_PITCH_DEGREES } from "../src/sim/fish-motion.js";
import { createAquariumState } from "../src/sim/state.js";

// The point of this file. The previous renderer proved its pitch by measuring
// the angle between glyph *anchors*, which a shear also moves; it never
// measured the ink. A sheared `_` is still a horizontal bar and a sheared `o`
// still has a flat top, so a strongly pitched fish read as a diagonal
// arrangement of upright letters. Everything here measures rendered pixels.

const SUPPORTED = Object.keys(BITMAP_FONT).filter((glyph) => glyph !== " ");
const NEUTRAL_ASPECT = quantizeUnitAspect(1);

function maskPixels(mask) {
  const pixels = [];
  for (const span of mask.spans) {
    for (let y = span.y; y < span.y + span.height; y += 1) {
      for (let x = span.x; x < span.x + span.width; x += 1) pixels.push({ x: x + 0.5, y: y + 0.5 });
    }
  }
  return pixels;
}

// Second moment of a pixel cloud: the direction its ink is longest in, and how
// much longer that is than the perpendicular. A round glyph has no meaningful
// direction, so `anisotropy` is what says whether the angle means anything.
function inkAxis(pixels) {
  const count = pixels.length;
  if (!count) return null;
  let meanX = 0;
  let meanY = 0;
  for (const pixel of pixels) {
    meanX += pixel.x;
    meanY += pixel.y;
  }
  meanX /= count;
  meanY /= count;
  let xx = 0;
  let xy = 0;
  let yy = 0;
  for (const pixel of pixels) {
    const dx = pixel.x - meanX;
    const dy = pixel.y - meanY;
    xx += dx * dx;
    xy += dx * dy;
    yy += dy * dy;
  }
  xx /= count;
  xy /= count;
  yy /= count;
  const trace = xx + yy;
  const spread = Math.sqrt(Math.max(0, (trace * trace) / 4 - (xx * yy - xy * xy)));
  const major = trace / 2 + spread;
  const minor = trace / 2 - spread;
  return {
    angle: 0.5 * Math.atan2(2 * xy, xx - yy) * 180 / Math.PI,
    anisotropy: minor > 1e-9 ? major / minor : Number.POSITIVE_INFINITY,
    area: count,
  };
}

// An axis has no head or tail, so it repeats every 180 degrees.
function axisDelta(from, to) {
  let delta = to - from;
  while (delta > 90) delta -= 180;
  while (delta < -90) delta += 180;
  return delta;
}

// Connected pieces under 8-connectivity - the same neighbourhood that makes the
// font's corner-touching diagonal staircases read as unbroken strokes.
function inkPieces(mask) {
  const covered = new Set();
  for (const span of mask.spans) {
    for (let y = span.y; y < span.y + span.height; y += 1) {
      for (let x = span.x; x < span.x + span.width; x += 1) covered.add(`${x},${y}`);
    }
  }
  let pieces = 0;
  const seen = new Set();
  for (const start of covered) {
    if (seen.has(start)) continue;
    pieces += 1;
    const stack = [start];
    seen.add(start);
    while (stack.length) {
      const [x, y] = stack.pop().split(",").map(Number);
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const key = `${x + dx},${y + dy}`;
          if (covered.has(key) && !seen.has(key)) {
            seen.add(key);
            stack.push(key);
          }
        }
      }
    }
  }
  return pieces;
}

test("a rotated glyph raster turns its ink by the angle it was asked for", () => {
  let graded = 0;
  for (const glyph of SUPPORTED) {
    const level = inkAxis(maskPixels(glyphSpinMask(glyph, 0, NEUTRAL_ASPECT)));
    // A round or tiny glyph has no direction to measure: `=` is very nearly
    // square, and a full stop is one two-by-three block whose measured axis
    // snaps to the diagonal of its own six units long before it can report a
    // thirty degree turn. They are covered by the determinism and connectivity
    // tests instead.
    if (!level || level.anisotropy < 4 || level.area < 18) continue;
    graded += 1;
    for (const degrees of [-30, -20, -10, 10, 20, 30]) {
      const turned = inkAxis(maskPixels(glyphSpinMask(glyph, quantizeSpin(degrees), NEUTRAL_ASPECT)));
      const moved = axisDelta(level.angle, turned.angle);
      assert.ok(
        Math.abs(moved - degrees) <= 4,
        `'${glyph}' ink turned ${moved.toFixed(1)}° when asked for ${degrees}°`,
      );
    }
  }
  assert.ok(graded >= 15, `only ${graded} glyphs carried a measurable ink direction`);
});

test("rotation never breaks a glyph into more pieces than it was drawn in", () => {
  // The font draws `/`, `\\` and `>` as staircases of blocks that meet only at
  // their corners. Resampling that at a half-covered threshold severs the
  // stroke; the coverage rule is set where it is precisely to stop that.
  for (const glyph of SUPPORTED) {
    const level = inkPieces(glyphSpinMask(glyph, 0, NEUTRAL_ASPECT));
    for (let spin = -MAX_SPIN_DEGREES / SPIN_STEP_DEGREES; spin <= MAX_SPIN_DEGREES / SPIN_STEP_DEGREES; spin += 1) {
      const mask = glyphSpinMask(glyph, spin, NEUTRAL_ASPECT);
      assert.ok(mask.spans.length > 0, `'${glyph}' vanished at spin ${spin}`);
      assert.ok(
        inkPieces(mask) <= level,
        `'${glyph}' came apart at ${spin * SPIN_STEP_DEGREES}°`,
      );
    }
  }
});

test("an upright glyph rasterises to exactly the pixels its source bitmap covers", () => {
  // Run-length encoding is a cost saving, not a change of appearance: the
  // source pixels tile exactly, so merging them paints the same ink in fewer
  // rectangles. A pipe is one tall rectangle now instead of seven.
  for (const glyph of SUPPORTED) {
    const fromSource = new Set();
    for (const pixel of glyphPixels(glyph)) {
      for (let y = pixel.y; y < pixel.y + pixel.height; y += 1) {
        for (let x = pixel.x; x < pixel.x + pixel.width; x += 1) fromSource.add(`${x},${y}`);
      }
    }
    const fromMask = new Set();
    for (const span of glyphSpinMask(glyph, 0, NEUTRAL_ASPECT).spans) {
      for (let y = span.y; y < span.y + span.height; y += 1) {
        for (let x = span.x; x < span.x + span.width; x += 1) fromMask.add(`${x},${y}`);
      }
    }
    assert.deepEqual([...fromMask].sort(), [...fromSource].sort(), `'${glyph}' upright raster changed`);
  }
  assert.equal(glyphSpinMask("|", 0, NEUTRAL_ASPECT).spans.length, 1);
  assert.equal(glyphSpinMask("-", 0, NEUTRAL_ASPECT).spans.length, 1);
});

test("rotated rasters are crisp, deterministic and identical between calls", () => {
  for (const glyph of ["o", "(", "/", "_", ">", "\\", "|", "-"]) {
    for (const degrees of [-32, -18, 0, 18, 32]) {
      const spin = quantizeSpin(degrees);
      const first = glyphSpinMask(glyph, spin, NEUTRAL_ASPECT);
      const second = glyphSpinMask(glyph, spin, NEUTRAL_ASPECT);
      // Cached, so it is the same object rather than merely an equal one.
      assert.equal(first, second);
      for (const span of first.spans) {
        assert.ok(Number.isInteger(span.x) && Number.isInteger(span.y));
        assert.ok(Number.isInteger(span.width) && Number.isInteger(span.height));
        assert.ok(span.width > 0 && span.height > 0);
      }
      const rects = glyphPixelRects({ char: glyph, x: 40.4, y: 12.6, scaleX: 1.5, scaleY: 1.5, spin, spinAspect: NEUTRAL_ASPECT });
      const bounds = glyphRasterBounds({ char: glyph, x: 40.4, y: 12.6, scaleX: 1.5, scaleY: 1.5, spin, spinAspect: NEUTRAL_ASPECT });
      for (const rect of rects) {
        // Every painted pixel is fully on: no fractional coordinates, and
        // nothing outside the bounds damage tracking restores from.
        assert.ok(Number.isInteger(rect.x) && Number.isInteger(rect.y));
        assert.ok(rect.width > 0 && rect.height > 0);
        assert.ok(rect.x >= bounds.x && rect.x + rect.width <= bounds.x + bounds.width);
        assert.ok(rect.y >= bounds.y && rect.y + rect.height <= bounds.y + bounds.height);
      }
    }
  }
});

test("the rotation range is exactly the pitch range the simulation can ask for", () => {
  // The connectivity guarantee above is a guarantee about every raster this
  // module can produce. That is only worth something while the module cannot be
  // asked for an angle outside the range that guarantee was measured over.
  assert.equal(MAX_SPIN_DEGREES, MAX_FISH_PITCH_DEGREES);
  assert.equal(quantizeSpin(90), MAX_SPIN_DEGREES / SPIN_STEP_DEGREES);
  assert.equal(quantizeSpin(-90), -MAX_SPIN_DEGREES / SPIN_STEP_DEGREES);
});

test("mirrored facings draw mirrored fish", () => {
  // A dive is the same rotation either way round the tank. The left-facing
  // sprite is the right-facing one mirrored, so its whole drawing - the ink and
  // the body under it - has to come out as the exact reflection, or a shoal
  // turning together would visibly disagree about which way is down.
  for (const sprite of individualSprites) {
    for (const pitch of [-30, -15, 15, 30]) {
      const right = renderSpriteScene(sprite, { facing: "right", pitch, staticPose: true });
      const left = renderSpriteScene(sprite, { facing: "left", pitch, staticPose: true });
      const rightObject = right.objects.find((candidate) => candidate.id.startsWith("lab:"));
      const leftObject = left.objects.find((candidate) => candidate.id.startsWith("lab:"));

      const mirrored = rightObject.fill
        .map((span) => `${right.width - (span.x + span.width)},${span.y},${span.width},${span.height}`)
        .sort();
      const actual = leftObject.fill
        .map((span) => `${span.x},${span.y},${span.width},${span.height}`)
        .sort();
      assert.deepEqual(actual, mirrored, `${sprite.id} body did not mirror at ${pitch}°`);

      // The ink is a weaker statement, and deliberately so. A mirrored sprite
      // draws mirrored *characters* - `(` for `)`, `/` for `\\` - laid out on a
      // pixel grid that is not symmetric about the scene's centre, so its ink
      // has never matched the reflection exactly: level poses agree on about
      // 55% of their pixels. What must hold is that rotation does not make it
      // worse, which is what says the two facings are turning the same way by
      // the same amount.
      const inkOf = (scene, object, flip) => {
        const covered = new Set();
        for (const glyph of glyphsForObject(scene, object)) {
          for (const rect of glyphPixelRects(glyph)) {
            for (let y = rect.y; y < rect.y + rect.height; y += 1) {
              for (let x = rect.x; x < rect.x + rect.width; x += 1) {
                covered.add(`${flip ? scene.width - 1 - x : x},${y}`);
              }
            }
          }
        }
        return covered;
      };
      const mirrorOverlap = (angle) => {
        const rightSide = renderSpriteScene(sprite, { facing: "right", pitch: angle, staticPose: true });
        const leftSide = renderSpriteScene(sprite, { facing: "left", pitch: angle, staticPose: true });
        const fromRight = inkOf(rightSide, rightSide.objects.find((c) => c.id.startsWith("lab:")), true);
        const fromLeft = inkOf(leftSide, leftSide.objects.find((c) => c.id.startsWith("lab:")), false);
        let shared = 0;
        for (const key of fromLeft) if (fromRight.has(key)) shared += 1;
        return shared / (fromLeft.size + fromRight.size - shared);
      };
      const pitchedOverlap = mirrorOverlap(pitch);
      assert.ok(
        pitchedOverlap >= mirrorOverlap(0) - 0.05,
        `${sprite.id} mirrored ink agreed on ${(pitchedOverlap * 100).toFixed(1)}% at ${pitch}°`
          + ` against ${(mirrorOverlap(0) * 100).toFixed(1)}% level`,
      );
    }
  }
});

test("a pitched fish in the tank turns the ink inside every one of its glyphs", () => {
  const base = createAquariumState({ orientation: "landscape", seed: 331, wallClockHours: 12 });
  const index = 0;
  const posed = (pitch) => {
    const scene = render({
      ...base,
      individuals: base.individuals.map((fish, i) => (i === index
        ? { ...fish, visual: { ...fish.visual, pitch, targetPitch: pitch, facing: 1, targetFacing: 1, turnProgress: 1 } }
        : fish)),
    });
    const object = scene.objects.find((candidate) => candidate.id.startsWith(`individual:${index}:`));
    return { object, glyphs: glyphsForObject(scene, object) };
  };

  const level = posed(0);
  assert.ok(level.glyphs.every((glyph) => glyph.spin === 0), "a level fish rotates nothing");

  const pitched = posed(30);
  const spin = pitched.glyphs[0].spin;
  assert.ok(spin !== 0, "a fully pitched fish left its ink upright");
  assert.ok(pitched.glyphs.every((glyph) => glyph.spin === spin), "one fish, one rotation");

  // Every glyph's own ink moved - not just its cell. Compare each glyph against
  // the upright raster of the same character at the same anchor and scale.
  let turned = 0;
  for (const glyph of pitched.glyphs) {
    const rotated = glyphPixelRects(glyph);
    const upright = glyphPixelRects({ ...glyph, spin: 0, spinAspect: 0 });
    const key = (rects) => rects.map((r) => `${r.x},${r.y},${r.width},${r.height}`).sort().join("|");
    if (key(rotated) !== key(upright)) turned += 1;
    // And it stays inside the bounds damage tracking repaints from.
    const bounds = glyphBoundsOf(glyph, pitched.object);
    for (const rect of rotated) {
      assert.ok(rect.x >= bounds.x && rect.x + rect.width <= bounds.x + bounds.width);
      assert.ok(rect.y >= bounds.y && rect.y + rect.height <= bounds.y + bounds.height);
    }
  }
  assert.equal(turned, pitched.glyphs.length, "some glyphs rasterised exactly as upright ones");

  // The aggregate direction of the ink, measured about each glyph's own centre
  // so the anchor arrangement cannot contribute, has turned with the fish.
  const inkDirection = (view) => {
    const pixels = [];
    for (const glyph of view.glyphs) {
      const rects = glyphPixelRects(glyph);
      let sumX = 0;
      let sumY = 0;
      let count = 0;
      const local = [];
      for (const rect of rects) {
        for (let y = rect.y; y < rect.y + rect.height; y += 1) {
          for (let x = rect.x; x < rect.x + rect.width; x += 1) {
            local.push({ x: x + 0.5, y: y + 0.5 });
            sumX += x + 0.5;
            sumY += y + 0.5;
            count += 1;
          }
        }
      }
      for (const pixel of local) pixels.push({ x: pixel.x - sumX / count, y: pixel.y - sumY / count });
    }
    return inkAxis(pixels);
  };
  const moved = axisDelta(inkDirection(level).angle, inkDirection(pitched).angle);
  assert.ok(
    Math.abs(moved - 30) <= 6,
    `the fish's own ink turned ${moved.toFixed(1)}° for a 30° dive`,
  );
});

function glyphBoundsOf(glyph, object) {
  const bounds = glyphRasterBounds(glyph);
  assert.ok(bounds.x >= object.bounds.x && bounds.y >= object.bounds.y);
  return bounds;
}

test("every sprite the tank can draw survives the whole supported pitch range", () => {
  for (const sprite of individualSprites) {
    for (const row of sprite.shape) {
      for (const glyph of [...row]) {
        if (glyph === " ") continue;
        for (let degrees = -32; degrees <= 32; degrees += SPIN_STEP_DEGREES) {
          const mask = glyphSpinMask(glyph, quantizeSpin(degrees), NEUTRAL_ASPECT);
          assert.ok(mask.spans.length > 0, `'${glyph}' of ${sprite.id} vanished at ${degrees}°`);
          assert.ok(mask.maxX > mask.minX && mask.maxY > mask.minY);
        }
      }
    }
  }
});
