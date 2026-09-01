import assert from "node:assert/strict";
import test from "node:test";

import {
  plantAttachmentLayout,
  plantGlyphScale,
  plantRenderRecord,
} from "../src/render/plants.js";
import { scenePalette } from "../src/render/palette.js";
import { orientationConfig } from "../src/sim/config.js";
import {
  ACTIVITIES,
  createActivityState,
  resolveActivityTarget,
  schoolSummary,
  socialEngagement,
} from "../src/sim/fish-activities.js";
import { steerActivityVelocity } from "../src/sim/fish-choreography.js";
import { forageActivity, substrateSafeY } from "../src/sim/fish-motion.js";
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
    y: substrateSafeY(resting, state, resting.x),
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
    y: substrateSafeY(resting, state, resting.x),
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
