import assert from "node:assert/strict";
import test from "node:test";

import { glyphPixelRects, glyphPixels } from "../src/render/bitmap-font.js";
import { calculateDamage } from "../src/render/damage.js";
import { individualSprites, poseSprite, render, renderSpriteScene } from "../src/render/render.js";
import { glyphsForObject } from "../src/render/scene.js";
import { forageActivity, substrateGrazeY, substrateSafeY } from "../src/sim/fish-motion.js";
import { createAquariumState } from "../src/sim/state.js";
import { tick } from "../src/sim/tick.js";

function objectByPrefix(scene, prefix) {
  const object = scene.objects.find((candidate) => candidate.id.startsWith(prefix));
  assert.ok(object, "missing scene object " + prefix);
  return object;
}

function sourceColumns(sprite) {
  const width = Math.max(...sprite.shape.map((row) => [...row].length));
  const columns = [];
  for (const row of sprite.shape) {
    const chars = [...row.padEnd(width, " ")];
    for (let column = 0; column < width; column += 1) {
      if (chars[column] !== " ") columns.push(column);
    }
  }
  return columns;
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function noseTailAxis(sprite, points, facing, cellWidth, cellHeight) {
  const columns = sourceColumns(sprite);
  assert.equal(columns.length, points.length);
  const minimum = Math.min(...columns);
  const maximum = Math.max(...columns);
  const tailPoints = [];
  const nosePoints = [];
  for (let index = 0; index < points.length; index += 1) {
    if (columns[index] === minimum) tailPoints.push(points[index]);
    if (columns[index] === maximum) nosePoints.push(points[index]);
  }
  assert.ok(tailPoints.length > 0 && nosePoints.length > 0);
  const tail = {
    x: average(tailPoints.map((point) => point.x)),
    y: average(tailPoints.map((point) => point.y)),
  };
  const nose = {
    x: average(nosePoints.map((point) => point.x)),
    y: average(nosePoints.map((point) => point.y)),
  };
  return {
    dx: (nose.x - tail.x) * cellWidth,
    dy: (nose.y - tail.y) * cellHeight,
    facing,
  };
}

function angleDegrees(axis) {
  return Math.atan2(axis.dy, axis.dx) * 180 / Math.PI;
}

function wrappedDelta(left, right) {
  let delta = right - left;
  while (delta > 180) delta -= 360;
  while (delta < -180) delta += 360;
  return delta;
}

function inkCentre(glyph) {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const pixel of glyphPixels(glyph.char)) {
    minX = Math.min(minX, pixel.x);
    maxX = Math.max(maxX, pixel.x + pixel.width);
    minY = Math.min(minY, pixel.y);
    maxY = Math.max(maxY, pixel.y + pixel.height);
  }
  return {
    x: Math.round(glyph.x) + ((minX + maxX) / 2) * glyph.scaleX,
    y: Math.round(glyph.y) + ((minY + maxY) / 2) * glyph.scaleY,
  };
}

function backsGlyph(object, glyph) {
  const centre = inkCentre(glyph);
  return object.fill.some((span) => centre.x >= span.x && centre.x <= span.x + span.width
    && centre.y >= span.y && centre.y <= span.y + span.height);
}

function hasUnbackedInk(object, glyph) {
  for (const rect of glyphPixelRects(glyph)) {
    for (let y = rect.y; y < rect.y + rect.height; y += 1) {
      for (let x = rect.x; x < rect.x + rect.width; x += 1) {
        const covered = object.fill.some((span) => x >= span.x && x < span.x + span.width
          && y >= span.y && y < span.y + span.height);
        if (!covered) return true;
      }
    }
  }
  return false;
}

test("all individual sprites have finite deterministic pitch poses across facings, waves, and turn compression", () => {
  for (const sprite of individualSprites) {
    for (const facing of [1, -1]) {
      for (const pitch of [-30, -15, 0, 15, 30]) {
        for (const phase of [0, 1.3, 3.2]) {
          for (const turnScale of [1, 0.32]) {
            const options = { facing, pitch, phase, turnScale, cellAspect: 2 };
            const first = poseSprite(sprite, options);
            const second = poseSprite(sprite, options);
            assert.deepEqual(first, second);
            for (const point of first) {
              assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
            }
          }
        }
      }
    }
  }
});

test("level pitch preserves the existing pose geometry exactly", () => {
  for (const sprite of individualSprites) {
    for (const facing of [1, -1]) {
      for (const phase of [0, 1.4, 3.8]) {
        const original = poseSprite(sprite, { facing, phase, deformationStrength: 1, turnScale: 0.61 });
        const explicit = poseSprite(sprite, {
          facing,
          phase,
          deformationStrength: 1,
          turnScale: 0.61,
          pitch: 0,
          cellAspect: 1.973,
        });
        assert.deepEqual(explicit, original);
      }
    }
  }
});

test("nose-down and nose-up semantics remain correct for both facings", () => {
  for (const sprite of individualSprites) {
    for (const facing of [1, -1]) {
      const down = poseSprite(sprite, { facing, pitch: 30, deformationStrength: 0, cellAspect: 2 });
      const up = poseSprite(sprite, { facing, pitch: -30, deformationStrength: 0, cellAspect: 2 });
      const downAxis = noseTailAxis(sprite, down, facing, 12, 24);
      const upAxis = noseTailAxis(sprite, up, facing, 12, 24);
      assert.ok(downAxis.dy > 0, `${sprite.id} facing ${facing} points its nose up during a dive`);
      assert.ok(upAxis.dy < 0, `${sprite.id} facing ${facing} points its nose down during an ascent`);
    }
  }
});

test("pitch turns the drawing by a real angle and by the same angle in every aspect", () => {
  const sprite = individualSprites.find((candidate) => candidate.id === "round-fin");
  assert.ok(sprite);
  const lab = renderSpriteScene(sprite, { staticPose: true });
  const modes = [
    { name: "landscape", cellWidth: 800 / 66, cellHeight: 480 / 20 },
    { name: "portrait", cellWidth: 480 / 40, cellHeight: 800 / 33 },
    { name: "lab", cellWidth: lab.width / lab.logicalWidth, cellHeight: lab.height / lab.logicalHeight },
  ];
  const magnitudes = [];
  for (const mode of modes) {
    for (const facing of [1, -1]) {
      const aspect = mode.cellHeight / mode.cellWidth;
      const level = poseSprite(sprite, { facing, pitch: 0, deformationStrength: 0, cellAspect: aspect });
      const pitched = poseSprite(sprite, { facing, pitch: 30, deformationStrength: 0, cellAspect: aspect });
      const levelAngle = angleDegrees(noseTailAxis(sprite, level, facing, mode.cellWidth, mode.cellHeight));
      const pitchedAngle = angleDegrees(noseTailAxis(sprite, pitched, facing, mode.cellWidth, mode.cellHeight));
      const delta = wrappedDelta(levelAngle, pitchedAngle);
      assert.ok(delta * facing > 0, `${mode.name}/${facing} pitched in the wrong semantic direction`);
      const magnitude = Math.abs(delta);
      // The authored shear alone put about a sixth of the simulated pitch on
      // the panel - four pixels across a fifty pixel fish - which is a posture
      // the viewer never sees. The drawing is now also turned bodily, so most
      // of the angle survives to the glass.
      assert.ok(magnitude >= 26 && magnitude <= 36, `${mode.name}/${facing} pitched pose was ${magnitude.toFixed(2)}°`);
      magnitudes.push(magnitude);
    }
  }
  // The turn is resolved in physical units, so a fish leans by the same angle
  // on a wide panel, a tall one, and in the artwork lab.
  assert.ok(Math.max(...magnitudes) - Math.min(...magnitudes) < 0.25);
});

test("pitch keeps the ASCII drawing whole instead of scattering it", () => {
  for (const sprite of individualSprites) {
    for (const facing of [1, -1]) {
      const level = poseSprite(sprite, { facing, pitch: 0, deformationStrength: 0, cellAspect: 2 });
      const strong = poseSprite(sprite, { facing, pitch: 30, deformationStrength: 0, cellAspect: 2 });
      assert.equal(level.length, strong.length);
      const extent = (points) => {
        const xs = points.map((point) => point.x);
        const ys = points.map((point) => point.y);
        return (Math.max(...xs) - Math.min(...xs) + 1) * (Math.max(...ys) - Math.min(...ys) + 1);
      };
      // A turn moves every glyph, which a shear did not - that is the point of
      // it. What must not happen is the drawing coming apart: the ink stays
      // within about a cell of where it was, the silhouette does not balloon,
      // and no glyph overtakes its neighbour along the body.
      for (let index = 0; index < level.length; index += 1) {
        assert.ok(Math.abs(strong[index].y - level[index].y) <= 1.2, `${sprite.id} displaced a glyph by more than 1.2 rows`);
        assert.ok(Math.abs(strong[index].x - level[index].x) <= 1.8, `${sprite.id} displaced a glyph sideways by more than 1.8 columns`);
      }
      assert.ok(extent(strong) / extent(level) <= 1.35, `${sprite.id} spread out while pitching`);
      for (let index = 1; index < level.length; index += 1) {
        const wasAhead = level[index].x - level[index - 1].x;
        const isAhead = strong[index].x - strong[index - 1].x;
        if (Math.abs(wasAhead) < 0.05) continue;
        assert.ok(
          Math.sign(wasAhead) === Math.sign(isAhead) || Math.abs(isAhead) < 0.05,
          `${sprite.id} reordered its own glyphs while pitching`,
        );
      }
    }
  }
});

test("pitched opaque bodies remain bounded, registered, tapered, and inside the nine-fill budget", () => {
  const interior = new Set(["(", ")", "o", "O"]);
  for (const sprite of individualSprites) {
    const columns = sourceColumns(sprite);
    const tailColumn = Math.min(...columns);
    for (const facing of ["right", "left"]) {
      for (const pitch of [-30, -15, 15, 30]) {
        for (const phase of [0, 1.3, 3.1]) {
          for (const turnScale of [1, 0.32]) {
            const scene = renderSpriteScene(sprite, { facing, pitch, phase, turnScale });
            const object = objectByPrefix(scene, "lab:");
            assert.ok(object.fill.length > 0 && object.fill.length <= 9, `${sprite.id} exceeded fill budget at ${pitch}°`);
            for (const span of object.fill) {
              assert.ok(Number.isInteger(span.x) && Number.isInteger(span.y));
              assert.ok(Number.isInteger(span.width) && Number.isInteger(span.height));
              assert.ok(span.width > 0 && span.height > 0);
              assert.ok(span.x >= object.bounds.x && span.y >= object.bounds.y);
              assert.ok(span.x + span.width <= object.bounds.x + object.bounds.width);
              assert.ok(span.y + span.height <= object.bounds.y + object.bounds.height);
            }
            const heights = object.fill.map((span) => span.height);
            assert.ok(new Set(heights).size >= 2, `${sprite.id} became a rectangular pitched block`);
            const glyphs = glyphsForObject(scene, object);
            for (const glyph of glyphs) {
              if (interior.has(glyph.char)) {
                assert.ok(backsGlyph(object, glyph), `${sprite.id} exposed interior '${glyph.char}' at ${pitch}° ${facing}`);
              }
            }
            assert.equal(glyphs.length, columns.length);
            const tailGlyphs = glyphs.filter((_, index) => columns[index] === tailColumn);
            assert.ok(tailGlyphs.length > 0);
            assert.ok(
              tailGlyphs.some((glyph) => hasUnbackedInk(object, glyph)),
              `${sprite.id} swallowed all authored pitched tail ink at ${pitch}° ${facing}`,
            );
          }
        }
      }
    }
  }
});

test("production fish pitch does not change depth scale or layer", () => {
  for (const orientation of ["landscape", "portrait"]) {
    const base = createAquariumState({ orientation, seed: 331, wallClockHours: 12 });
    const atPitch = (pitch) => render({
      ...base,
      individuals: base.individuals.map((fish) => ({
        ...fish,
        visual: { ...fish.visual, pitch, targetPitch: pitch },
      })),
    });
    const level = atPitch(0);
    const pitched = atPitch(28);
    for (let index = 0; index < base.individuals.length; index += 1) {
      const before = objectByPrefix(level, `individual:${index}:`);
      const after = objectByPrefix(pitched, `individual:${index}:`);
      assert.equal(after.layer, before.layer);
      const beforeGlyph = glyphsForObject(level, before)[0];
      const afterGlyph = glyphsForObject(pitched, after)[0];
      assert.equal(afterGlyph.scaleX, beforeGlyph.scaleX);
      assert.equal(afterGlyph.scaleY, beforeGlyph.scaleY);
    }
  }
});

test("active forage pecks emit one deterministic debris object and approach emits none", () => {
  const base = createAquariumState({ orientation: "landscape", seed: 444, wallClockHours: 12 });
  const index = 3;
  const original = base.individuals[index];
  let activeFish = null;
  let quietFish = null;
  for (let age = 0; age < 12; age += 0.025) {
    const candidate = {
      ...original,
      x: 25,
      // The peck cadence is an animation, so it advances on real seconds.
      behavior: { current: "forage", previous: "cruise", blend: 1, ageSeconds: age, ageRealSeconds: age },
    };
    candidate.y = substrateGrazeY(candidate, base, candidate.x);
    const activity = forageActivity(candidate, index, base);
    if (activity.peckPhase !== null && activity.debrisPhase !== null && !activeFish) activeFish = candidate;
    if (activity.searching && activity.peckPhase === null && activity.debrisPhase === null && !quietFish) quietFish = candidate;
    if (activeFish && quietFish) break;
  }
  assert.ok(activeFish && quietFish);
  const withFish = (fish) => ({ ...base, individuals: base.individuals.map((value, i) => i === index ? fish : value) });
  const activeState = withFish(activeFish);
  const first = render(activeState);
  const second = render(activeState);
  assert.deepEqual(first, second);
  const debris = first.objects.filter((object) => object.id.startsWith(`forage-debris:${index}:`));
  assert.equal(debris.length, 1);
  // A puff of five to eight grains, plus the contact mark while the mouth is
  // actually in the sand. Fewer than that and a meal was indistinguishable
  // from the substrate's own static speckle.
  assert.ok(debris[0].glyphCount >= 5 && debris[0].glyphCount <= 9);

  const quiet = render(withFish(quietFish));
  assert.equal(quiet.objects.some((object) => object.id.startsWith("forage-debris:")), false);

  const approaching = { ...activeFish, y: activeFish.y - 2 };
  assert.equal(render(withFish(approaching)).objects.some((object) => object.id.startsWith("forage-debris:")), false);
});

test("representative pitched and forage frames stay inside the existing ordinary damage regression", () => {
  for (const orientation of ["landscape", "portrait"]) {
    let state = createAquariumState({ orientation, seed: 5, wallClockHours: 12 });
    for (let frame = 0; frame < 100; frame += 1) state = tick(state, 0.1);
    const fish = state.individuals[3];
    const forager = {
      ...fish,
      behavior: { current: "forage", previous: fish.behavior.current, blend: 1, ageSeconds: 1.5 },
      visual: { ...fish.visual, pitch: 24, targetPitch: 24 },
    };
    forager.y = substrateSafeY(forager, state, forager.x);
    state = {
      ...state,
      individuals: state.individuals.map((value, index) => index === 3 ? forager : value),
    };
    const before = render(state);
    const after = render(tick(state, 0.1));
    const damage = calculateDamage(before, after);
    assert.equal(damage.full, false);
    assert.ok(damage.rects.length > 0);
    assert.ok(damage.area < damage.total * 0.45, `${orientation} pitched/forage damaged ${(damage.area / damage.total * 100).toFixed(1)}%`);
  }
});
