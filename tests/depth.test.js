import assert from "node:assert/strict";
import test from "node:test";

import { calculateDamage, rectanglesOverlap } from "../src/render/damage.js";
import {
  DEPTH_LANES,
  depthScale,
  laneForDepth,
  schoolDepthScale,
  spreadDepth,
} from "../src/render/depth.js";
import { scenePalette } from "../src/render/palette.js";
import { LAYERS, render } from "../src/render/render.js";
import { glyphsForObject } from "../src/render/scene.js";
import { SUBSTRATE_ROWS } from "../src/sim/config.js";
import { SUBSTRATE_RELIEF_ROWS, SURFACE_Y_ROWS } from "../src/sim/environment.js";
import { createAquariumState } from "../src/sim/state.js";
import { tick } from "../src/sim/tick.js";

const SEEDS = [1, 5, 7, 33, 818];

function channel(color, offset) {
  return Number.parseInt(color.slice(offset, offset + 2), 16);
}

function colorLuminance(color) {
  return channel(color, 1) * 0.2126 + channel(color, 3) * 0.7152 + channel(color, 5) * 0.0722;
}

function colorDistance(left, right) {
  return Math.hypot(
    channel(left, 1) - channel(right, 1),
    channel(left, 3) - channel(right, 3),
    channel(left, 5) - channel(right, 5),
  );
}

function individuals(scene) {
  return scene.objects.filter((object) => object.id.startsWith("individual:"));
}

function lanesFor(state) {
  return state.individuals.map((fish, index) => laneForDepth(
    spreadDepth(state.seed, fish.seed, index, state.individuals.length, state.elapsedRealSeconds),
  ));
}

test("the cast is spread through the tank instead of standing on one plane", () => {
  for (const orientation of ["portrait", "landscape"]) {
    for (const seed of SEEDS) {
      const state = createAquariumState({ orientation, seed, wallClockHours: 12 });
      const lanes = lanesFor(state);
      assert.equal(lanes.length, 6);
      // Six fish over five lanes will double up, but they must never all land
      // on the same plane - that is exactly the flatness this axis exists for.
      assert.ok(
        new Set(lanes).size >= 3,
        `${orientation}/${seed} put six fish on ${new Set(lanes).size} plane(s)`,
      );
      const scene = render(state);
      assert.deepEqual(
        individuals(scene).map((object) => object.layer),
        [...lanes].sort((left, right) => left - right).map((lane) => LAYERS.individuals + lane),
      );
    }
  }
});

test("distance changes a fish's size, its ink, and the body behind it together", () => {
  const state = createAquariumState({ orientation: "landscape", seed: 33, wallClockHours: 12 });
  const palette = scenePalette(state);
  const scene = render(state);
  const lanes = lanesFor(state);
  const farthest = lanes.indexOf(Math.min(...lanes));
  const nearest = lanes.indexOf(Math.max(...lanes));
  assert.notEqual(farthest, nearest);

  const measure = (index) => {
    const object = individuals(scene).find((candidate) => candidate.id.startsWith(`individual:${index}:`));
    const glyphs = glyphsForObject(scene, object);
    return {
      scale: glyphs.reduce((sum, glyph) => sum + glyph.scaleY, 0) / glyphs.length,
      fog: glyphs.reduce((sum, glyph) => sum + colorDistance(glyph.fg, palette.fog), 0) / glyphs.length,
      body: object.fill[0].color,
    };
  };
  const far = measure(farthest);
  const near = measure(nearest);

  // Size is the loudest cue and has to move first.
  assert.ok(near.scale > far.scale * 1.15, `near ${near.scale} vs far ${far.scale}`);
  // Atmospheric perspective: the far fish's ink has been pulled towards the
  // water it is seen through, so it sits closer to the fog than the near one.
  assert.ok(near.fog > far.fog * 1.2, `near ${near.fog} vs far ${far.fog} from fog`);
  // The opaque body travels with the ink, or a far fish would keep a near
  // fish's silhouette.
  assert.ok(
    colorDistance(far.body, palette.fog) < colorDistance(near.body, palette.fog),
    "the far body did not fade with its fish",
  );
});

test("depth colours come from tables the palette builds once per stage", () => {
  // This is the ESP32 contract: atmospheric perspective must cost one array
  // index per fish per frame, not a colour mix per glyph.
  const state = createAquariumState({ orientation: "portrait", seed: 5, wallClockHours: 9 });
  const palette = scenePalette(state);
  const scene = render(state);
  const known = new Set(palette.depthLanes.flatMap((lane) => [
    ...Object.values(lane.masks),
    ...lane.school,
    ...lane.bodyFills,
  ]));
  assert.equal(palette.depthLanes.length, DEPTH_LANES);
  for (const object of [...individuals(scene), ...scene.objects.filter((o) => o.id.startsWith("school:"))]) {
    for (const glyph of glyphsForObject(scene, object)) {
      assert.ok(known.has(glyph.fg), `${object.id} invented the colour ${glyph.fg}`);
    }
    for (const span of object.fill ?? []) {
      assert.ok(known.has(span.color), `${object.id} invented the body colour ${span.color}`);
    }
  }
});

test("the far end of the school swims behind the midground weed", () => {
  const scene = render(createAquariumState({ orientation: "landscape", seed: 7, wallClockHours: 12 }));
  const school = scene.objects.filter((object) => object.id.startsWith("school:"));
  assert.ok(school.length > 20);
  const layers = new Set(school.map((object) => object.layer));
  assert.ok(layers.size >= 3, "the school landed on one plane");
  assert.ok(
    school.some((object) => object.layer < LAYERS.midgroundPlants),
    "no school fish passes behind the midground plants",
  );
  assert.ok(
    school.some((object) => object.layer > LAYERS.midgroundPlants),
    "no school fish passes in front of the midground plants",
  );
  // Individuals are the characters of the tank and stay readable at every
  // distance: between the midground and the foreground, never inside them.
  for (const object of individuals(scene)) {
    assert.ok(object.layer > LAYERS.midgroundPlants && object.layer < LAYERS.foregroundPlants);
  }
});

test("both depth scales stay inside the crisp-glyph range at every lane", () => {
  for (let lane = 0; lane < DEPTH_LANES; lane += 1) {
    const depth = lane / (DEPTH_LANES - 1);
    assert.ok(depthScale(depth) >= 0.6 && depthScale(depth) <= 1.35);
    assert.ok(schoolDepthScale(depth) >= 0.7 && schoolDepthScale(depth) <= 1.25);
  }
  // Continuous between lanes, so a drifting fish grows instead of stepping.
  let previous = depthScale(0);
  for (let step = 1; step <= 40; step += 1) {
    const next = depthScale(step / 40);
    assert.ok(next > previous, "depth scale is not monotonic");
    assert.ok(next - previous < 0.05, "depth scale steps instead of interpolating");
    previous = next;
  }
});

test("sun shafts stay in the water, fade with depth, and dim at night", () => {
  for (const orientation of ["portrait", "landscape"]) {
    const state = createAquariumState({ orientation, seed: 5, wallClockHours: 12 });
    const scene = render(state);
    const { shafts, bands } = scene.background;
    assert.ok(shafts.length > 0);
    const waterTop = bands[0].y;
    const waterBottom = bands.at(-1).y + bands.at(-1).height;
    for (const shaft of shafts) {
      assert.ok(Number.isInteger(shaft.x) && Number.isInteger(shaft.y));
      assert.ok(Number.isInteger(shaft.width) && Number.isInteger(shaft.height));
      assert.ok(shaft.x >= 0 && shaft.x + shaft.width <= scene.width);
      assert.ok(shaft.y >= Math.floor(waterTop) && shaft.y + shaft.height <= Math.ceil(waterBottom) + 1);
      // Light, not paint: a shaft is always brighter than the band it crosses
      // and never brighter than the surface itself.
      const band = bands.find((candidate) => shaft.y < candidate.y + candidate.height) ?? bands.at(-1);
      assert.ok(colorLuminance(shaft.color) >= colorLuminance(band.color));
      assert.ok(colorLuminance(shaft.color) <= colorLuminance(bands[0].color) + 26);
    }
    const highest = shafts
      .filter((shaft) => shaft.y < waterTop + (waterBottom - waterTop) * 0.25)
      .map((shaft) => colorLuminance(shaft.color));
    const lowest = shafts
      .filter((shaft) => shaft.y > waterTop + (waterBottom - waterTop) * 0.7)
      .map((shaft) => colorLuminance(shaft.color));
    assert.ok(highest.length && lowest.length);
    assert.ok(Math.max(...highest) > Math.max(...lowest), "the shafts do not fade with depth");
  }

  const dayScene = render(createAquariumState({ orientation: "landscape", seed: 5, wallClockHours: 12 }));
  const nightScene = render(createAquariumState({ orientation: "landscape", seed: 5, wallClockHours: 2 }));
  const lift = (scene) => Math.max(...scene.background.shafts.map((shaft) => (
    colorLuminance(shaft.color) - colorLuminance(
      scene.background.bands.find((band) => shaft.y < band.y + band.height)?.color
        ?? scene.background.bands.at(-1).color,
    )
  )));
  assert.ok(lift(nightScene) < lift(dayScene) * 0.5, "night keeps too much sun in the water");
});

test("the ground plane recedes and the tank edges fall away", () => {
  const scene = render(createAquariumState({ orientation: "landscape", seed: 5, wallClockHours: 12 }));
  const { floorSlabs, edges, bands, substrateSegments } = scene.background;
  assert.equal(floorSlabs.length >= 2, true);
  // The strip nearest the bottom of the panel is the part closest to the
  // viewer, so the floor brightens downwards.
  for (let index = 1; index < floorSlabs.length; index += 1) {
    assert.ok(
      colorLuminance(floorSlabs[index].color) > colorLuminance(floorSlabs[index - 1].color),
      "the floor does not recede",
    );
  }
  assert.equal(floorSlabs[0].color, substrateSegments[Math.floor(substrateSegments.length / 2)].color);

  assert.ok(edges.length > 0);
  const zones = [...bands, ...floorSlabs];
  for (const edge of edges) {
    assert.ok(edge.x === 0 || edge.x + edge.width === scene.width || edge.width > 0);
    assert.ok(edge.x >= 0 && edge.x + edge.width <= scene.width);
    const zone = zones.find((candidate) => edge.y === candidate.y);
    assert.ok(zone, "an edge rectangle belongs to no horizontal zone");
    assert.ok(
      colorLuminance(edge.color) <= colorLuminance(zone.color),
      "an edge rectangle is brighter than the zone it dims",
    );
  }
  // Both sides, and the darkest step sits hard against the glass.
  assert.ok(edges.some((edge) => edge.x === 0));
  assert.ok(edges.some((edge) => edge.x + edge.width === scene.width));
  const outermost = edges.filter((edge) => edge.x === 0 && edge.y === bands[0].y);
  assert.equal(outermost.length, 1);
});

test("depth costs a bounded number of background fills and no extra full repaints", () => {
  for (const orientation of ["landscape", "portrait"]) {
    let state = createAquariumState({ orientation, seed: 5, wallClockHours: 12 });
    for (let frame = 0; frame < 40; frame += 1) state = tick(state, 0.1);
    let worstRegionFills = 0;
    let previous = render(state);
    // Six simulated minutes of ordinary animation. The sun's two-hour stage
    // clock must not tick inside it, so the whole field is never repainted.
    for (let frame = 0; frame < 600; frame += 1) {
      state = tick(state, 0.6);
      const scene = render(state);
      const damage = calculateDamage(previous, scene);
      assert.equal(damage.full, false, `${orientation} repainted the whole field at frame ${frame}`);
      const background = scene.background;
      const painted = [
        ...background.shafts,
        ...background.edges,
        ...background.floorSlabs,
        ...background.substrateSegments,
      ];
      let fills = 0;
      for (const region of damage.rects) {
        fills += painted.filter((candidate) => rectanglesOverlap(region, candidate)).length;
      }
      worstRegionFills = Math.max(worstRegionFills, fills);
      previous = scene;
    }
    // A panel driver sees these as plain filled rectangles. Keeping the worst
    // frame in the low hundreds leaves the dithered band transitions, which
    // cost far more, as the real budget.
    assert.ok(
      worstRegionFills <= 260,
      `${orientation} asked for ${worstRegionFills} background fills in one frame`,
    );
  }
});

test("the sun restages the field only on its own two-hour clock", () => {
  const base = createAquariumState({ orientation: "landscape", seed: 5, wallClockHours: 12 });
  const at = (hours) => render({ ...base, timeOfDayHours: hours }).background.signature;
  assert.equal(at(12), at(13.4));
  assert.notEqual(at(12), at(14.1));
  // Morning and afternoon light lean opposite ways.
  const shaftsAt = (hours) => render({ ...base, timeOfDayHours: hours }).background.shafts;
  const centre = (shafts) => {
    const deep = shafts.filter((shaft) => shaft.y > shafts[0].y + 100);
    return deep.reduce((sum, shaft) => sum + shaft.x, 0) / deep.length;
  };
  assert.ok(centre(shaftsAt(8)) < centre(shaftsAt(16)));
});

test("the whole scene stays inside the substrate layer at every distance", () => {
  for (const orientation of ["portrait", "landscape"]) {
    const state = createAquariumState({ orientation, seed: 818, wallClockHours: 15 });
    const scene = render(state);
    const surface = SURFACE_Y_ROWS;
    const floor = state.rows - SUBSTRATE_ROWS + SUBSTRATE_RELIEF_ROWS;
    assert.ok(floor > surface);
    for (const object of scene.objects) {
      assert.ok(object.layer >= LAYERS.waterline && object.layer <= LAYERS.substrate);
    }
    for (const glyph of scene.glyphs) {
      assert.ok(glyph.scaleX >= 0.5 && glyph.scaleX <= 1.5, `glyph scaleX ${glyph.scaleX}`);
      assert.ok(glyph.scaleY >= 0.5 && glyph.scaleY <= 1.5, `glyph scaleY ${glyph.scaleY}`);
    }
  }
});
