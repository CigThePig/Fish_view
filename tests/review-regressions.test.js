import assert from "node:assert/strict";
import test from "node:test";

import {
  plantAttachmentLayout,
  plantGlyphScale,
  plantRenderRecord,
} from "../src/render/plants.js";
import { scenePalette } from "../src/render/palette.js";
import { individualSprites, render, renderSpriteScene } from "../src/render/render.js";
import { applyBodyProfileToSpriteScene, bodyProfileForSprite } from "../src/render/body-profile-lab.js";
import { isSupportedGlyph } from "../src/render/bitmap-font.js";
import { SPIN_STEP_DEGREES, glyphPixelRects, spinDegrees } from "../src/render/glyph-raster.js";
import { glyphBounds, glyphsForObject } from "../src/render/scene.js";
import { CELL_HEIGHT, CELL_WIDTH, DEFAULT_SEED, orientationConfig } from "../src/sim/config.js";
import {
  ACTIVITIES,
  DWELL_SECONDS,
  createActivityState,
  resolveActivityTarget,
  schoolSummary,
  socialEngagement,
} from "../src/sim/fish-activities.js";
import { CHASE_BREAK_SECONDS, steerActivityVelocity } from "../src/sim/fish-choreography.js";
import { forageActivity, substrateGrazeY } from "../src/sim/fish-motion.js";
import { substrateSurfaceY } from "../src/sim/environment.js";
import {
  SHOWCASE_DEFAULT_SEED,
  SHOWCASE_SEED_LABEL,
  createShowcaseState,
  showcaseTarget,
  tickShowcase,
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

test("a far-plane feeding fish reaches the contact mark at its rendered scale", () => {
  // Seed 2 puts this fish close to the far wall. Reserving the global 1.26x
  // maximum while drawing it near 0.72x left more than a row of clear water
  // between its ink and a contact mark fixed to the substrate crest.
  const orientation = "landscape";
  const config = orientationConfig(orientation);
  const rowPixels = config.pixelHeight / config.rows;
  const base = createAquariumState({ orientation, seed: 2, wallClockHours: 12 });
  const index = 3;
  const resting = base.individuals[index];
  let peak = null;
  for (let age = 0; age < 30; age += 0.01) {
    const activity = { ...createActivityState(ACTIVITIES.substrateSearch), ageRealSeconds: age };
    const fish = {
      ...resting,
      behavior: { current: "forage", previous: "cruise", blend: 1, ageSeconds: 30, ageRealSeconds: 30 },
      activity,
    };
    fish.y = substrateGrazeY(fish, base, fish.x, index);
    const forage = forageActivity(fish, index, base);
    if (!peak || forage.peck > peak.forage.peck) peak = { fish, forage };
  }
  assert.ok(peak.forage.peck > 0.99, "the sampled cycle never reached a full strike");

  const feeding = {
    ...peak.fish,
    y: peak.fish.y + peak.forage.peckDisplacement,
    visual: {
      ...peak.fish.visual,
      pitch: 31,
      targetPitch: 31,
      facing: 1,
      targetFacing: 1,
      turnProgress: 1,
    },
  };
  const state = {
    ...base,
    individuals: base.individuals.map((fish, fishIndex) => (fishIndex === index ? feeding : fish)),
  };
  const scene = render(state);
  const object = scene.objects.find((candidate) => candidate.id.startsWith(`individual:${index}:`));
  const lowestInk = Math.max(
    ...glyphsForObject(scene, object)
      .flatMap((glyph) => glyphPixelRects(glyph).map((rectangle) => rectangle.y + rectangle.height)),
  ) / rowPixels;
  const gap = substrateSurfaceY(state, feeding.x) - lowestInk;
  assert.ok(gap <= 0.55, `far feeding ink hovered ${gap.toFixed(2)} rows above its contact mark`);
  assert.ok(gap >= -0.6, `far feeding ink buried ${(-gap).toFixed(2)} rows into the substrate`);
});

test("the puff is thrown from the mouth the fish is drawn with, not the one it is turning away from", () => {
  // turnPose() swings the drawing to targetFacing halfway through a turn while
  // visual.facing still holds the old direction, so a peck in that window used
  // to land its debris off the tail.
  const config = orientationConfig("landscape");
  const cellWidth = config.pixelWidth / config.cols;
  const cellHeight = config.pixelHeight / config.rows;
  let checked = 0;
  let midTurn = 0;
  let slopedContacts = 0;
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
        if (forage.peck > 0.35) {
          // The contact mark is appended after every debris grain. It moved to
          // the mouth horizontally, so its vertical origin must use the terrain
          // under that same point rather than the crest under the fish centre.
          const contact = glyphs.at(-1);
          const contactX = (contact.x + CELL_WIDTH * contact.scaleX / 2) / cellWidth;
          const contactY = (contact.y + CELL_HEIGHT * contact.scaleY / 2) / cellHeight;
          const localSurface = substrateSurfaceY(state, contactX);
          assert.ok(
            Math.abs(contactY - (localSurface - 0.12)) < 1e-9,
            "the contact mark did not sit on the terrain under the visible mouth",
          );
          if (Math.abs(localSurface - forage.surfaceY) > 0.1) slopedContacts += 1;
        }
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
  assert.ok(slopedContacts > 0, "no strike reached enough terrain slope to test its vertical origin");
});

test("a pitched fish turns its characters, not just their positions", () => {
  // This guarded a horizontal shear of the glyph bitmaps, on the reasoning that
  // a five-by-seven raster could not be turned at all. It can - the ink is a
  // cached rotated raster now - and a shear was never the same thing: it leaves
  // every horizontal stroke horizontal, so `_`, `-` and the flat top of `o`
  // stayed exactly as level as the water while the fish around them leaned.
  // What the fish carries now is one rotation index, shared by every glyph, and
  // the raster it selects is a genuinely turned one.
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
  assert.ok(levelGlyphs.every((glyph) => (glyph.spin ?? 0) === 0), "a level fish rotates nothing");

  const pitched = posed(30);
  const pitchedObject = pitched.objects.find((object) => object.id.startsWith(`individual:${index}:`));
  const pitchedGlyphs = glyphsForObject(pitched, pitchedObject);
  const spin = pitchedGlyphs[0].spin;
  assert.ok(Math.abs(spinDegrees(spin) - 30) <= SPIN_STEP_DEGREES, `a fully pitched fish turned its ink by ${spinDegrees(spin)}°`);
  assert.ok(pitchedGlyphs.every((glyph) => glyph.spin === spin), "one fish, one rotation");
  assert.ok(pitchedGlyphs.every((glyph) => glyph.spinAspect === pitchedGlyphs[0].spinAspect), "one fish, one unit aspect");

  // The ink actually moves - and moves in both axes, which is what separates a
  // rotation from the shear this replaced. A shear only ever moved it sideways.
  const rects = glyphPixelRects(pitchedGlyphs[0]);
  const upright = glyphPixelRects({ ...pitchedGlyphs[0], spin: 0, spinAspect: 0 });
  assert.ok(
    rects.some((rect) => !upright.some((other) => other.x === rect.x && other.y === rect.y)),
    "the rotated glyph rasterised identically to an upright one",
  );
  const rows = (list) => new Set(list.map((rect) => rect.y));
  assert.notDeepEqual([...rows(rects)].sort(), [...rows(upright)].sort(), "the ink moved sideways only");

  // And the bounds cover where it moved to - damage tracking restores from
  // those bounds, so ink outside them smears.
  for (const glyph of pitchedGlyphs) {
    const bounds = glyphBounds(glyph);
    for (const rect of glyphPixelRects(glyph)) {
      assert.ok(
        rect.x >= bounds.x && rect.x + rect.width <= bounds.x + bounds.width
          && rect.y >= bounds.y && rect.y + rect.height <= bounds.y + bounds.height,
        "rotated ink fell outside the bounds damage tracking restores from",
      );
    }
  }
});

test("a change that moves lit pixels always moves the damage signature", () => {
  // Damage tracking repaints an object only when its signature changes, so any
  // property the rasteriser reads has to reach the hash. The lean is the
  // dangerous one: it is multiplied by most of a cell height before it is
  // rounded to a pixel, so it can move ink while changing far too little to
  // survive a hash of its raw value. The rasteriser snaps it to a grid the
  // signature carries exactly, which is what this walks.
  const base = createAquariumState({ orientation: "landscape", seed: 331, wallClockHours: 12 });
  const snapshot = (pitch) => {
    const scene = render({
      ...base,
      individuals: base.individuals.map((fish, index) => (index === 0
        ? { ...fish, visual: { ...fish.visual, pitch, targetPitch: pitch, facing: 1, targetFacing: 1, turnProgress: 1 } }
        : fish)),
    });
    const object = scene.objects.find((candidate) => candidate.id.startsWith("individual:0:"));
    const glyphs = glyphsForObject(scene, object);
    return {
      signature: object.signature,
      ink: glyphs
        .flatMap((glyph) => glyphPixelRects(glyph).map((rect) => `${rect.x},${rect.y},${rect.width},${rect.height}`))
        .join("|"),
    };
  };

  let previous = snapshot(0);
  let moves = 0;
  // Fine steps on purpose: the pitch eases continuously in production, so it
  // lands between whatever grid the signature happens to use.
  for (let step = 1; step <= 3200; step += 1) {
    const current = snapshot(step * 0.01);
    if (current.ink !== previous.ink) {
      moves += 1;
      assert.notEqual(
        current.signature,
        previous.signature,
        `ink moved at pitch ${(step * 0.01).toFixed(2)} without changing the damage signature`,
      );
    }
    previous = current;
  }
  assert.ok(moves > 50, `only ${moves} ink changes were sampled`);
});

test("the body-profile editor lays out against the same geometry the tank draws", () => {
  // The editor keeps its own copy of the pose. Any pose argument production
  // grows and the copy does not silently re-tunes profiles against a body the
  // tank never draws - here, a turn the editor was not foreshortening.
  const sprite = individualSprites.find((candidate) => candidate.id === "double-fin");
  for (const turnScale of [1, 0.6, 0.32]) {
    for (const pitch of [0, 18, 30]) {
      const options = { facing: "right", pitch, phase: 0, turnScale };
      const production = renderSpriteScene(sprite, options);
      const relaid = applyBodyProfileToSpriteScene(
        renderSpriteScene(sprite, options),
        sprite,
        bodyProfileForSprite(sprite),
        options,
      );
      const spans = (scene) => scene.objects
        .find((candidate) => candidate.id.startsWith("lab:"))
        .fill.map((span) => `${span.x},${span.y},${span.width},${span.height}`)
        .join("|");
      assert.equal(
        spans(relaid),
        spans(production),
        `the editor re-laid the default profile differently at pitch ${pitch}, turn ${turnScale}`,
      );
    }
  }
});

test("a chase outlives its own break", () => {
  // chasePhase() only returns "break" once the activity is CHASE_BREAK_SECONDS
  // old. If the dwell can expire first, the activity is reselected before the
  // chaser ever peels away and the close-then-separate arc is never drawn.
  const [, dwellLow] = DWELL_SECONDS[ACTIVITIES.playfulChase];
  assert.ok(
    dwellLow > CHASE_BREAK_SECONDS,
    `the shortest chase runs ${dwellLow}s but the break does not come until ${CHASE_BREAK_SECONDS}s`,
  );

  // And it actually reaches that phase in the lab, not just on paper.
  let state = createShowcaseState({ orientation: "landscape", scenario: "playful-chase" });
  const phases = new Set();
  for (let step = 0; step < 95; step += 1) {
    state = tickShowcase(state, 0.1, "playful-chase");
    const target = showcaseTarget(state, "playful-chase");
    if (target?.choreographyPhase) phases.add(target.choreographyPhase);
  }
  assert.ok(phases.has("pursuit"), "the chase never reached its pursuit");
  assert.ok(phases.has("break"), `the chase never broke off; phases seen: ${[...phases].join(", ")}`);
});

test("every glyph a feeding strike draws exists in the font", () => {
  // An unsupported character does not fail loudly: glyphPixels() falls back to
  // the "?" bitmap, so the softer half of every strike was quietly drawing a
  // question mark on the sand. The scene-wide contract test never caught it
  // because a contact mark lives for about a sixth of a second and its sampled
  // frames never landed inside one. This walks the peck instead of sampling it.
  const state = createAquariumState({ orientation: "landscape", seed: 9, wallClockHours: 12 });
  const index = 3;
  const resting = state.individuals[index];
  const fish = {
    ...resting,
    y: substrateGrazeY(resting, state, resting.x),
    behavior: { current: "forage", previous: "cruise", blend: 1, ageSeconds: 30, ageRealSeconds: 30 },
  };

  const seen = new Set();
  let marks = 0;
  for (let age = 0; age < 24; age += 0.02) {
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
    if (forageActivity(posed, index, state).peck > 0.35) marks += 1;
    for (const glyph of scene.glyphs.slice(debris.glyphStart, debris.glyphStart + debris.glyphCount)) {
      seen.add(glyph.char);
      assert.ok(
        isSupportedGlyph(glyph.char),
        `a feeding strike drew ${JSON.stringify(glyph.char)}, which the font renders as "?"`,
      );
    }
  }
  // Both halves of the strike have to have been walked, or the guard proves
  // nothing about the one that was broken.
  assert.ok(marks > 20, `only ${marks} contact-mark frames were sampled`);
  assert.ok(seen.has("*"), "the strong contact mark never appeared");
  assert.ok(seen.has(":"), "the soft contact mark never appeared");
});
