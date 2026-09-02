import assert from "node:assert/strict";
import test from "node:test";

import {
  plantAttachmentLayout,
  plantGlyphScale,
  plantRenderRecord,
} from "../src/render/plants.js";
import { scenePalette } from "../src/render/palette.js";
import { render } from "../src/render/render.js";
import { glyphPixelRects } from "../src/render/bitmap-font.js";
import { glyphBounds, glyphsForObject } from "../src/render/scene.js";
import { DEFAULT_SEED, orientationConfig } from "../src/sim/config.js";
import {
  ACTIVITIES,
  createActivityState,
  resolveActivityTarget,
  schoolSummary,
  socialEngagement,
} from "../src/sim/fish-activities.js";
import { steerActivityVelocity } from "../src/sim/fish-choreography.js";
import { forageActivity, substrateGrazeY } from "../src/sim/fish-motion.js";
import { substrateSurfaceY } from "../src/sim/environment.js";
import {
  SHOWCASE_DEFAULT_SEED,
  SHOWCASE_SEED_LABEL,
  createShowcaseState,
} from "../src/dev/behavior-showcase.js";
import { hashSeed } from "../src/sim/prng.js";
import { createPlantFrameContext, createPlantSpecimen } from "../src/sim/plants.js";
import { createAquariumState, withSettings } from "../src/sim/state.js";
import { tick } from "../src/sim/tick.js";

test("implicit terminal stems stay structural instead of becoming detached tip decorations", () => {
  const state = {
    ...createAquariumState({ orientation: "portrait", seed: 147, wallClockHours: 12 }),
    individuals: [],
    reaction: null,
  };
  const target = orientationConfig("portrait");
  const metrics = {
    cellWidth: target.pixelWidth / target.cols,
    cellHeight: target.pixelHeight / target.rows,
  };
  const plant = createPlantSpecimen({
    speciesId: "tall-forkgrass",
    seed: 147,
    x: 20,
    ageDays: 200,
    rows: state.rows,
    size: "maximum",
  });
  const frameContext = createPlantFrameContext(state, {
    currentMultiplier: 0,
    still: true,
    interactions: false,
  });
  const record = plantRenderRecord(plant, 0, state, scenePalette(state), metrics, { frameContext });
  const scale = plantGlyphScale(plant, record.pose.species.layer);
  const terminalStems = record.pose.joints.filter((point) => point.isTip && point.role === "stem");
  const stemCharacters = new Set([
    ...record.pose.species.stemGlyphs.left,
    ...record.pose.species.stemGlyphs.upright,
    ...record.pose.species.stemGlyphs.right,
  ]);

  assert.ok(terminalStems.length > 0);
  for (const point of terminalStems) {
    const layout = plantAttachmentLayout(record.plant, record.pose, point, metrics, scale);
    assert.ok(layout.progresses.length >= 1);
    // The final bone of an implicit terminal stem is painted like any other:
    // filler along the span and the stem's own ink on the joint that ends it.
    // It must never collapse to a lone tip decoration floating past the bone.
    assert.equal(layout.progresses.at(-1), 1);
    assert.ok(layout.progresses.every((progress) => progress > 0 && progress <= 1));
    assert.ok(
      layout.segmentLengthPixels <= layout.projectedCoveragePixels * 1.4 || layout.progresses.length > 1,
      `terminal stem ${point.index} left a long bone on a single glyph`,
    );
  }

  // Tall forkgrass should still be visually made from its authored stem
  // vocabulary, even though long bones now receive several attachments.
  const stemInk = record.glyphs.filter((glyph) => stemCharacters.has(glyph.char)).length;
  assert.ok(record.attachmentStats.fillerAttachments > 0);
  assert.ok(stemInk >= record.attachmentStats.jointAttachments);
});

test("school engagement comes from nearby school fish, not an empty centroid", () => {
  const base = withSettings(createAquariumState({ orientation: "landscape", seed: 2 }), { timeScale: 3600 });
  const center = schoolSummary(base.school, base);
  const nearestToCenter = Math.min(
    ...base.school.map((fish) => Math.hypot(fish.x - center.x, fish.y - center.y)),
  );
  // Seed 2 starts with a school scattered around an empty middle: the centroid
  // is the shape of the shoal, never a fish that another fish can swim beside.
  assert.ok(nearestToCenter > 5, "seed 2 no longer has an empty school centroid to guard");

  const follow = (x, y) => ({
    ...base,
    individuals: base.individuals.map((fish, index) => index === 0
      ? {
        ...fish,
        x,
        y,
        behavior: { current: "social", previous: "cruise", blend: 0, ageSeconds: 0 },
        activity: { ...createActivityState(ACTIVITIES.schoolFollow), targetType: "school" },
      }
      : fish),
  });

  const atCentroid = follow(center.x, center.y);
  assert.equal(socialEngagement(atCentroid.individuals[0], atCentroid, atCentroid.school), 0);

  const member = base.school[0];
  const beside = follow(member.x + 0.4, member.y);
  assert.ok(socialEngagement(beside.individuals[0], beside, beside.school) > 0);

  // A phantom contact must not relieve the social drive or drift sociability
  // any more than swimming alone in a corner does.
  const alone = tick(follow(1.5, base.rows - 5), 0.1).individuals[0];
  const phantom = tick(atCentroid, 0.1).individuals[0];
  const company = tick(beside, 0.1).individuals[0];
  assert.equal(phantom.drives.social, alone.drives.social);
  assert.equal(phantom.history.sociabilityDrift, alone.history.sociabilityDrift);
  assert.ok(company.drives.social < phantom.drives.social);
  assert.ok(company.history.sociabilityDrift > phantom.history.sociabilityDrift);
});

test("a target directly behind a level fish turns it around instead of holding its heading", () => {
  // Antiparallel headings are the degenerate case of a componentwise turn
  // blend: below a half-frame ease the blend never crosses zero, so the fish
  // used to swim away from a same-height waypoint until a wall flipped it.
  const target = { x: 8, y: 10, speed: 0.4 };
  const chase = (seed) => {
    let fish = { seed, x: 20, y: 10, vx: 0.4, vy: 0 };
    for (let frame = 0; frame < 60; frame += 1) {
      const steered = steerActivityVelocity(fish, target, { realDelta: 0.1 });
      fish = {
        ...fish,
        vx: steered.vx,
        vy: steered.vy,
        x: fish.x + steered.vx * 0.1,
        y: fish.y + steered.vy * 0.1,
      };
    }
    return fish;
  };

  const first = chase(1);
  const second = chase(2);
  for (const fish of [first, second]) {
    assert.ok(fish.vx < 0, "the fish never turned back toward a waypoint behind it");
    assert.ok(fish.x < 20, "the fish made no headway toward a waypoint behind it");
  }
  // The side of the turn comes from the fish, so a tank of level swimmers does
  // not pivot in unison when they all reverse at once.
  assert.equal(Math.sign(first.y - 10), -Math.sign(second.y - 10));
});

test("debris keeps the seed of the peck that raised it when the next peck overlaps it", () => {
  const state = createAquariumState({ orientation: "landscape", seed: 9, wallClockHours: 12 });
  const index = 3;
  const resting = state.individuals[index];
  const fish = {
    ...resting,
    y: substrateGrazeY(resting, state, resting.x),
    behavior: { current: "forage", previous: "cruise", blend: 1, ageSeconds: 30, ageRealSeconds: 30 },
  };
  const phaseAt = (ageRealSeconds) => forageActivity(fish, index, state, {
    ...createActivityState(ACTIVITIES.substrateSearch),
    ageRealSeconds,
  });

  let overlaps = 0;
  for (let age = 0; age < 40; age += 0.05) {
    const phase = phaseAt(age);
    assert.ok(phase.searching, "the fish is parked on the substrate and should be foraging");
    if (phase.debrisPhase === null) continue;
    // The salt the renderer draws from must name the event whose tail is on
    // screen, not whichever peck the fish happens to be performing over it.
    assert.ok(Number.isInteger(phase.debrisSeed), "debris has no salt of its own to draw from");
    if (phase.peckEvent === null || phase.peckEvent === phase.debrisEvent) continue;
    overlaps += 1;
    assert.notEqual(
      phase.debrisSeed,
      phase.eventSeed,
      "an overlapping peck reused its own salt for the previous peck's debris",
    );
    assert.equal(phase.debrisSeed, phaseAt(age - 0.05).debrisSeed);
  }
  assert.ok(overlaps > 0, "seed 9 no longer pecks closely enough to overlap a debris tail");
});

test("the forage phase a fish moves to is the one its debris and pitch are drawn from", () => {
  const state = createAquariumState({ orientation: "landscape", seed: 9, wallClockHours: 12 });
  const index = 3;
  const resting = state.individuals[index];
  const fish = {
    ...resting,
    y: substrateGrazeY(resting, state, resting.x),
    behavior: { current: "forage", previous: "cruise", blend: 1, ageSeconds: 30, ageRealSeconds: 30 },
    activity: { ...createActivityState(ACTIVITIES.substrateSearch), ageRealSeconds: 0 },
  };
  const activityAt = (ageRealSeconds) => ({ ...fish.activity, ageRealSeconds });

  // A frame the peck starts in: the activity tick advances the age before it
  // resolves the target, so a target read from the stored age would displace
  // the fish for a contact the renderer has already drawn.
  let started = null;
  for (let age = 0; age < 40 && started === null; age += 0.1) {
    const before = forageActivity(fish, index, state, activityAt(age));
    const after = forageActivity(fish, index, state, activityAt(age + 0.1));
    if (before.peck === 0 && after.peck > 0) started = age;
  }
  assert.notEqual(started, null, "seed 9 no longer pecks within the sampled window");

  const advanced = activityAt(started + 0.1);
  const stale = { ...fish, activity: activityAt(started) };
  const target = resolveActivityTarget(stale, index, state, advanced, { bubbles: [], school: state.school });
  const rendered = forageActivity({ ...fish, activity: advanced }, index, state);
  assert.equal(target.peck, rendered.peck);
  assert.equal(target.forageEventSeed, rendered.eventSeed);
  assert.ok(target.peck > 0, "the sampled frame no longer starts a peck");
});

test("the choreography lab and its capture tools open the same tank", () => {
  // Traits, plants, bubble opportunities, routes, and timings are all
  // seed-derived: a contact sheet or a readability run made from another
  // default would grade a scene the deployed lab never shows.
  assert.equal(SHOWCASE_DEFAULT_SEED, hashSeed(SHOWCASE_SEED_LABEL));
  assert.equal(
    createShowcaseState({ orientation: "landscape", scenario: "substrate-search" }).seed,
    SHOWCASE_DEFAULT_SEED,
  );
});

function colorLuminance(color) {
  const channel = (offset) => Number.parseInt(color.slice(offset, offset + 2), 16);
  return channel(1) * 0.2126 + channel(3) * 0.7152 + channel(5) * 0.0722;
}

test("a feeding puff stands off the sand it is lifted from", () => {
  const state = createAquariumState({ orientation: "landscape", seed: 9, wallClockHours: 12 });
  const index = 3;
  const resting = state.individuals[index];
  const fish = {
    ...resting,
    y: substrateGrazeY(resting, state, resting.x),
    behavior: { current: "forage", previous: "cruise", blend: 1, ageSeconds: 30, ageRealSeconds: 30 },
  };
  const palette = scenePalette(state);
  const sand = colorLuminance(palette.substrateFg);

  let sampled = 0;
  for (let age = 0; age < 24; age += 0.05) {
    const posed = {
      ...fish,
      activity: { ...createActivityState(ACTIVITIES.substrateSearch), ageRealSeconds: age },
    };
    const scene = render({
      ...state,
      individuals: state.individuals.map((value, i) => (i === index ? posed : value)),
    });
    const debris = scene.objects.find((object) => object.id === `forage-debris:${index}:${fish.seed}`);
    if (!debris) continue;
    sampled += 1;
    const glyphs = scene.glyphs.slice(debris.glyphStart, debris.glyphStart + debris.glyphCount);
    // The substrate carries its own static speckle in the sand's colour. Silt
    // in the water has to be visibly lighter than that or a meal looks like
    // more floor, which is what it looked like before.
    for (const glyph of glyphs) {
      const separation = (colorLuminance(glyph.fg) - sand) / sand;
      assert.ok(
        separation > 0.25,
        `debris glyph sat ${(separation * 100).toFixed(0)}% off the substrate it was lifted from`,
      );
    }
  }
  assert.ok(sampled > 0, "seed 9 never raised any debris to measure");
});

test("a strike reaches into the substrate crest without burying the fish, on every seed", () => {
  // The clearance model works from the sprite's authored box; the renderer draws
  // the opaque body from a box of its own, with the tail excluded, a swell
  // added, and a per-sprite scale. The two do not agree to better than about a
  // third of a row, and the simulation deliberately cannot see the second one -
  // so the guard has to be the rendered frame, over enough tanks to catch the
  // sprite that sits furthest from the model. Seed 192's juvenile box-fin was
  // burying a whole row before the pitched width entered the clearance.
  for (const seed of [192, 444, 9, DEFAULT_SEED]) {
    for (const orientation of ["landscape", "portrait"]) {
      const config = orientationConfig(orientation);
      const rowPixels = config.pixelHeight / config.rows;
      let state = createAquariumState({ orientation, seed, wallClockHours: 12 });
      let deepest = null;
      for (let step = 0; step < 4000; step += 1) {
        state = tick(state, 0.1);
        for (const [index, fish] of state.individuals.entries()) {
          const forage = forageActivity(fish, index, state);
          if (!forage.searching || forage.peck < 0.9) continue;
          const scene = render(state);
          const object = scene.objects.find((candidate) => candidate.id === `individual:${index}:${fish.seed}`);
          if (!object?.fill?.length) continue;
          const entered = Math.max(...object.fill.map((span) => span.y + span.height)) / rowPixels
            - substrateSurfaceY(state, fish.x);
          if (!deepest || entered > deepest) deepest = entered;
        }
        if (deepest !== null && step > 3000) break;
      }
      if (deepest === null) continue;
      assert.ok(
        deepest <= 0.6,
        `${orientation} seed ${seed} buried a feeding fish ${deepest.toFixed(2)} rows into the substrate`,
      );
    }
  }
});

test("the puff is thrown from the mouth the fish is drawn with, not the one it is turning away from", () => {
  // turnPose() swings the drawing to targetFacing halfway through a turn while
  // visual.facing still holds the old direction, so a peck in that window used
  // to land its debris off the tail.
  const config = orientationConfig("landscape");
  const cellWidth = config.pixelWidth / config.cols;
  let checked = 0;
  let midTurn = 0;
  for (const seed of [444, 9]) {
    let state = createAquariumState({ orientation: "landscape", seed, wallClockHours: 12 });
    for (let step = 0; step < 4000; step += 1) {
      state = tick(state, 0.1);
      for (const [index, fish] of state.individuals.entries()) {
        const forage = forageActivity(fish, index, state);
        if (forage.debrisPhase === null && forage.peck <= 0.35) continue;
        const scene = render(state);
        const debris = scene.objects.find((candidate) => candidate.id === `forage-debris:${index}:${fish.seed}`);
        if (!debris) continue;
        const glyphs = scene.glyphs.slice(debris.glyphStart, debris.glyphStart + debris.glyphCount);
        if (!glyphs.length) continue;
        const visual = fish.visual ?? {};
        const drawnFacing = visual.turnProgress >= 1
          ? visual.targetFacing
          : (visual.turnProgress < 0.5 ? visual.facing : visual.targetFacing);
        if (visual.turnProgress < 1 && visual.facing !== visual.targetFacing) midTurn += 1;
        checked += 1;
        const centroid = glyphs.reduce((sum, glyph) => sum + glyph.x, 0) / glyphs.length / cellWidth;
        const offset = centroid - fish.x;
        if (Math.abs(offset) <= 0.15) continue;
        assert.equal(
          Math.sign(offset),
          drawnFacing,
          `debris landed on the wrong side of a fish drawn facing ${drawnFacing}`,
        );
      }
    }
  }
  assert.ok(checked > 200, "no debris frames were sampled");
  assert.ok(midTurn > 0, "no fish pecked while mid-turn, so the guard proved nothing");
});

test("a pitched fish leans its characters, not just their positions", () => {
  // Five-by-seven bitmaps cannot be turned - rotating one at this size destroys
  // the character - so the ink is sheared instead, by the same angle the body
  // is turned through. Without it a pitched fish is a leaning arrangement of
  // upright letters, which reads far flatter than its own axis.
  const state = createAquariumState({ orientation: "landscape", seed: 331, wallClockHours: 12 });
  const index = 0;
  const posed = (pitch) => render({
    ...state,
    individuals: state.individuals.map((fish, i) => (i === index
      ? { ...fish, visual: { ...fish.visual, pitch, targetPitch: pitch, facing: 1, targetFacing: 1, turnProgress: 1 } }
      : fish)),
  });

  const level = posed(0);
  const levelObject = level.objects.find((object) => object.id.startsWith(`individual:${index}:`));
  const levelGlyphs = glyphsForObject(level, levelObject);
  assert.ok(levelGlyphs.every((glyph) => (glyph.slant ?? 0) === 0), "a level fish leans nothing");

  const pitched = posed(30);
  const pitchedObject = pitched.objects.find((object) => object.id.startsWith(`individual:${index}:`));
  const pitchedGlyphs = glyphsForObject(pitched, pitchedObject);
  const slant = pitchedGlyphs[0].slant;
  assert.ok(Math.abs(slant) > 0.4, `a fully pitched fish sheared its ink by only ${slant}`);
  assert.ok(pitchedGlyphs.every((glyph) => glyph.slant === slant), "one fish, one lean");

  // The ink actually moves, and the bounds cover where it moved to - damage
  // tracking restores from those bounds, so ink outside them smears.
  const rects = glyphPixelRects(pitchedGlyphs[0]);
  const upright = glyphPixelRects({ ...pitchedGlyphs[0], slant: 0 });
  assert.ok(
    rects.some((rect, i) => rect.x !== upright[i].x),
    "the sheared glyph rasterised identically to an upright one",
  );
  const bounds = glyphBounds(pitchedGlyphs[0]);
  for (const rect of rects) {
    assert.ok(
      rect.x >= Math.floor(bounds.x) && rect.x + rect.width <= Math.ceil(bounds.x + bounds.width),
      "sheared ink fell outside the bounds damage tracking restores from",
    );
  }
});
