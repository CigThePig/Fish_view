// Screen-space legibility. The behaviour readability tool grades the
// simulation's own numbers - peck amplitude, pitch degrees, activity counts -
// and a cue can pass every one of them while changing two pixels. This tool
// renders real frames and measures what a person could actually see: how far a
// fish moves on the panel, how much of it changes during a feeding strike, how
// far its debris stands out from the sand it lands on, how much the body tilts,
// and whether night is darker than noon.
//
// Development-only: it depends on the canvas backend and is stripped from the
// firmware build along with the rest of tools/.
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(process.argv[2] ?? ".");
const stamp = Date.now();
const url = (relative) => pathToFileURL(path.join(root, relative)).href + `?screen=${stamp}`;

async function loadCanvasModule() {
  try {
    return await import("@napi-rs/canvas");
  } catch (error) {
    const runtimeModules = process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES;
    if (runtimeModules) {
      const fallback = pathToFileURL(path.join(runtimeModules, "@napi-rs", "canvas", "index.js"));
      try {
        return await import(fallback.href);
      } catch {
        // Fall through to the installation hint below.
      }
    }
    throw new Error(
      "The screen-space measurement needs the development-only @napi-rs/canvas package. Run `npm install` first.",
      { cause: error },
    );
  }
}

const { createCanvas } = await loadCanvasModule();
const { SHOWCASE_SCENARIOS, createShowcaseState, showcaseSubjects, tickShowcase } = await import(url("src/dev/behavior-showcase.js"));
const { CanvasSceneRenderer } = await import(url("src/render/canvas-renderer.js"));
const { render } = await import(url("src/render/render.js"));
const { scenePalette } = await import(url("src/render/palette.js"));
const { forageActivity } = await import(url("src/sim/fish-motion.js"));
const { substrateSurfaceY } = await import(url("src/sim/environment.js"));
const { DEFAULT_SEED, orientationConfig } = await import(url("src/sim/config.js"));
const { createAquariumState } = await import(url("src/sim/state.js"));
const { tick } = await import(url("src/sim/tick.js"));

const STEP_SECONDS = 0.1;
const failures = [];
const canvasCache = new Map();

function frame(state, orientation) {
  const config = orientationConfig(orientation);
  let entry = canvasCache.get(orientation);
  if (!entry) {
    const canvas = createCanvas(config.pixelWidth, config.pixelHeight);
    entry = { canvas, renderer: new CanvasSceneRenderer(canvas), config };
    canvasCache.set(orientation, entry);
  }
  const scene = render(state);
  entry.renderer.draw(scene);
  return { scene, canvas: entry.canvas, config: entry.config };
}

function pixels(canvas, x, y, width, height) {
  const left = Math.max(0, Math.round(x));
  const top = Math.max(0, Math.round(y));
  const right = Math.min(canvas.width, Math.round(x + width));
  const bottom = Math.min(canvas.height, Math.round(y + height));
  if (right <= left || bottom <= top) return { data: new Uint8ClampedArray(0), width: 0, height: 0, left, top };
  const image = canvas.getContext("2d").getImageData(left, top, right - left, bottom - top);
  return { data: image.data, width: right - left, height: bottom - top, left, top };
}

function luminance(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function hexLuminance(hex) {
  const value = hex.replace("#", "");
  return luminance(
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  );
}

// Weber contrast against the background the mark is seen on: the fraction of
// the background's own brightness that the mark adds or removes.
function contrast(markLuminance, groundLuminance) {
  return Math.abs(markLuminance - groundLuminance) / Math.max(1, groundLuminance);
}

function objectFor(scene, id) {
  return scene.objects.find((object) => object.id === id);
}

function subjectId(index, fish) {
  return `individual:${index}:${fish.seed}`;
}

function bodyCentre(bounds) {
  return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
}

function report(title) {
  console.log(`\n${title}`);
}

// --- A. How far each behaviour actually moves on the panel -------------------

report("Behaviour motion on the panel (pixels)");
console.log("scenario              orientation   travel  vertical  peak px/s  body px");
const motion = new Map();
for (const orientation of ["landscape", "portrait"]) {
  for (const scenario of SHOWCASE_SCENARIOS) {
    let state = createShowcaseState({ orientation, scenario: scenario.id });
    const first = showcaseSubjects(state, scenario.id)[0];
    let previous = bodyCentre(objectFor(frame(state, orientation).scene, subjectId(first.index, first.fish)).bounds);
    let travel = 0;
    let vertical = 0;
    let peak = 0;
    let bodyWidth = 0;
    const frames = Math.round(scenario.loopSeconds / STEP_SECONDS);
    for (let index = 0; index < frames; index += 1) {
      state = tickShowcase(state, STEP_SECONDS, scenario.id);
      const subject = showcaseSubjects(state, scenario.id)[0];
      const object = objectFor(frame(state, orientation).scene, subjectId(subject.index, subject.fish));
      const centre = bodyCentre(object.bounds);
      const step = Math.hypot(centre.x - previous.x, centre.y - previous.y);
      travel += step;
      vertical += Math.abs(centre.y - previous.y);
      peak = Math.max(peak, step / STEP_SECONDS);
      bodyWidth = Math.max(bodyWidth, object.bounds.width);
      previous = centre;
    }
    motion.set(`${orientation}:${scenario.id}`, { travel, vertical, peak });
    console.log(
      `${scenario.id.padEnd(21)} ${orientation.padEnd(12)} ${travel.toFixed(0).padStart(6)} ${vertical.toFixed(0).padStart(9)} ${peak.toFixed(0).padStart(10)} ${bodyWidth.toFixed(0).padStart(8)}`,
    );
  }
}
// Three registers, graded differently. A fish going somewhere in particular -
// up to a bubble, down to the sand, after a companion - has to cover at least
// its own body width inside one loop or the errand never reads as an errand.
// Ambient swimming only has to keep visibly travelling; it is calm on purpose,
// and a nightlight fish crossing the tank in a hurry would be worse, not
// better. Station-keeping - resting, hovering at a plant, holding formation -
// is meant to look still, and is graded on its own cues elsewhere.
const ERRANDS = new Set([
  "bubble-investigate",
  "individual-follow",
  "playful-chase",
  "substrate-search",
  "surface-investigate",
]);
const AMBIENT = new Set(["cruise", "school-follow", "plant-weave"]);
for (const [key, value] of motion) {
  const [orientation, id] = key.split(":");
  const floor = ERRANDS.has(id) ? 57 : AMBIENT.has(id) ? 30 : 0;
  if (floor && value.travel < floor) {
    failures.push(`${orientation}: ${id} moves only ${value.travel.toFixed(0)}px across its whole loop`);
  }
}

// --- B. The feeding strike ---------------------------------------------------

report("Feeding strike (production tank)");
console.log("orientation  plunge px  belly gap rows  debris glyphs  debris contrast  strike repaint");
for (const orientation of ["landscape", "portrait"]) {
  let state = createAquariumState({ orientation, seed: DEFAULT_SEED, wallClockHours: 12 });
  const config = orientationConfig(orientation);
  const cellHeight = config.pixelHeight / config.rows;
  let best = null;
  let rest = null;
  let window = null;
  let watching = null;
  for (let step = 0; step < 6000 && !best; step += 1) {
    state = tick(state, STEP_SECONDS);
    for (const [index, fish] of state.individuals.entries()) {
      const forage = forageActivity(fish, index, state);
      if (!forage.searching) continue;
      if (watching === null) watching = index;
      if (watching !== index) continue;
      const { scene, canvas } = frame(state, orientation);
      const object = objectFor(scene, subjectId(index, fish));
      const debris = objectFor(scene, `forage-debris:${index}:${fish.seed}`);
      // One window, pinned to the panel on first sighting. A window that
      // followed the fish would subtract its movement, which is the very thing
      // being measured.
      window ??= {
        x: object.bounds.x - 44,
        y: object.bounds.y - 34,
        width: object.bounds.width + 88,
        height: object.bounds.height + 104,
      };
      const sample = {
        index,
        peck: forage.peck,
        fish,
        state,
        centre: bodyCentre(object.bounds),
        bounds: object.bounds,
        bellyGap: substrateSurfaceY(state, fish.x) - (object.bounds.y + object.bounds.height) / cellHeight,
        debris: debris ? scene.glyphs.slice(debris.glyphStart, debris.glyphStart + debris.glyphCount) : [],
        image: pixels(canvas, window.x, window.y, window.width, window.height),
      };
      // The frame just before the strike, so the slow drift of a grazing fish
      // is not counted as part of its lunge.
      if (forage.peck < 0.05) rest = sample;
      if (forage.peck > 0.9 && rest) best = { peak: sample, rest };
      break;
    }
  }
  if (!best) {
    failures.push(`${orientation}: no feeding strike happened in ten simulated minutes`);
    console.log(`${orientation.padEnd(12)} no strike observed`);
    continue;
  }
  const plunge = best.peak.centre.y - best.rest.centre.y;
  const palette = scenePalette(state);
  const debrisContrast = best.peak.debris.length
    ? contrast(hexLuminance(best.peak.debris[0].fg), hexLuminance(palette.substrateFg))
    : 0;
  // What the strike itself repaints, with the rest of the tank held still: the
  // peak frame against the same frame with this one fish put back the way it
  // stood before the lunge. Diffing two consecutive frames instead would count
  // the water and every other fish moving through the window.
  const counterfactual = {
    ...best.peak.state,
    individuals: best.peak.state.individuals.map((fish, index) => (index === best.peak.index ? best.rest.fish : fish)),
  };
  const quiet = pixels(frame(counterfactual, orientation).canvas, window.x, window.y, window.width, window.height);
  const peakImage = best.peak.image;
  let changed = 0;
  if (quiet.width === peakImage.width && quiet.height === peakImage.height) {
    for (let offset = 0; offset < quiet.data.length; offset += 4) {
      const delta = Math.abs(luminance(quiet.data[offset], quiet.data[offset + 1], quiet.data[offset + 2])
        - luminance(peakImage.data[offset], peakImage.data[offset + 1], peakImage.data[offset + 2]));
      if (delta > 6) changed += 1;
    }
  }
  // Graded against the fish's own silhouette rather than a flat pixel count: a
  // strike has to repaint a tenth of the animal that performs it, whatever size
  // that animal is drawn at.
  const silhouette = best.peak.bounds.width * best.peak.bounds.height;
  const repaintShare = changed / Math.max(1, silhouette);
  console.log(
    `${orientation.padEnd(12)} ${plunge.toFixed(1).padStart(9)} ${best.peak.bellyGap.toFixed(2).padStart(15)} ${String(best.peak.debris.length).padStart(14)} ${`${(debrisContrast * 100).toFixed(0)}%`.padStart(16)} ${`${changed} (${(repaintShare * 100).toFixed(0)}%)`.padStart(14)}`,
  );
  if (plunge < 6) failures.push(`${orientation}: a feeding strike moves the fish ${plunge.toFixed(1)}px down the panel`);
  if (best.peak.bellyGap > 0.45) failures.push(`${orientation}: a feeding fish hovers ${best.peak.bellyGap.toFixed(2)} rows above the substrate`);
  if (best.peak.debris.length < 4) failures.push(`${orientation}: a feeding strike raised ${best.peak.debris.length} debris glyphs`);
  if (debrisContrast < 0.3) failures.push(`${orientation}: debris sits ${(debrisContrast * 100).toFixed(0)}% off the substrate it lands on`);
  if (repaintShare < 0.1) {
    failures.push(`${orientation}: a feeding strike repaints only ${(repaintShare * 100).toFixed(0)}% of the fish`);
  }
}

// --- C. The chase has to close and break -------------------------------------

report("Pair spacing through a chase (rows)");
console.log("scenario              min    max   range");
for (const id of ["playful-chase", "individual-follow", "companion-cruise"]) {
  const scenario = SHOWCASE_SCENARIOS.find((entry) => entry.id === id);
  let state = createShowcaseState({ orientation: "landscape", scenario: id });
  let minimum = Infinity;
  let maximum = 0;
  for (let step = 0; step < Math.round(scenario.loopSeconds / STEP_SECONDS); step += 1) {
    state = tickShowcase(state, STEP_SECONDS, id);
    const subjects = showcaseSubjects(state, id);
    if (subjects.length < 2) continue;
    const gap = Math.hypot(subjects[0].fish.x - subjects[1].fish.x, subjects[0].fish.y - subjects[1].fish.y);
    minimum = Math.min(minimum, gap);
    maximum = Math.max(maximum, gap);
  }
  console.log(`${id.padEnd(21)} ${minimum.toFixed(2).padStart(5)} ${maximum.toFixed(2).padStart(6)} ${(maximum - minimum).toFixed(2).padStart(7)}`);
  if (id === "playful-chase" && maximum - minimum < 2) {
    failures.push(`landscape: a playful chase changes its gap by only ${(maximum - minimum).toFixed(2)} rows`);
  }
}

// --- D. Day and night --------------------------------------------------------

report("Panel brightness and fish separation through the day");
console.log("hour   mean luminance  body vs water  accent vs body");
const NIGHT_HOURS = new Set([21, 23, 3]);
let noonLuminance = 0;
for (const hour of [12, 16, 19, 21, 23, 3, 6, 9]) {
  let state = createAquariumState({ orientation: "landscape", seed: DEFAULT_SEED, wallClockHours: hour });
  for (let step = 0; step < 60; step += 1) state = tick(state, STEP_SECONDS);
  const { scene, canvas } = frame(state, "landscape");
  const whole = pixels(canvas, 0, 0, canvas.width, canvas.height);
  let total = 0;
  for (let offset = 0; offset < whole.data.length; offset += 4) {
    total += luminance(whole.data[offset], whole.data[offset + 1], whole.data[offset + 2]);
  }
  const mean = total / (whole.data.length / 4);
  if (hour === 12) noonLuminance = mean;

  // Body against the water it swims in, sampled from the painted silhouette
  // rather than from a bounding box full of background.
  const separations = [];
  const inkSeparations = [];
  for (const [index, fish] of state.individuals.entries()) {
    const object = objectFor(scene, subjectId(index, fish));
    if (!object?.fill?.length) continue;
    const bodyLuminance = hexLuminance(object.fill[0].color);
    const ring = pixels(canvas, object.bounds.x - 16, object.bounds.y - 16, object.bounds.width + 32, object.bounds.height + 32);
    let ringTotal = 0;
    let ringCount = 0;
    for (let py = 0; py < ring.height; py += 1) {
      for (let px = 0; px < ring.width; px += 1) {
        const x = ring.left + px;
        const y = ring.top + py;
        const inside = x >= object.bounds.x - 2 && x <= object.bounds.x + object.bounds.width + 2
          && y >= object.bounds.y - 2 && y <= object.bounds.y + object.bounds.height + 2;
        if (inside) continue;
        const offset = (py * ring.width + px) * 4;
        ringTotal += luminance(ring.data[offset], ring.data[offset + 1], ring.data[offset + 2]);
        ringCount += 1;
      }
    }
    separations.push(contrast(bodyLuminance, ringTotal / Math.max(1, ringCount)));
    const glyphs = scene.glyphs.slice(object.glyphStart, object.glyphStart + object.glyphCount);
    if (glyphs.length) {
      // Night is deliberately a silhouette palette, so the average marking is
      // allowed to sink into the body. What may not disappear is the accent -
      // the eye - because it is what turns a dark shape back into a fish.
      const accent = Math.max(...glyphs.map((glyph) => contrast(hexLuminance(glyph.fg), bodyLuminance)));
      inkSeparations.push(accent);
    }
  }
  const mean2 = (list) => list.reduce((sum, value) => sum + value, 0) / Math.max(1, list.length);
  const bodySeparation = mean2(separations);
  const inkSeparation = mean2(inkSeparations);
  console.log(
    `${String(hour).padStart(2, "0")}:00 ${mean.toFixed(1).padStart(15)} ${`${(bodySeparation * 100).toFixed(0)}%`.padStart(14)} ${`${(inkSeparation * 100).toFixed(0)}%`.padStart(12)}`,
  );
  // A nightlight may not be brighter after dark than it is at noon.
  if (NIGHT_HOURS.has(hour) && mean > noonLuminance * 0.8) {
    failures.push(`${String(hour).padStart(2, "0")}:00 is ${(mean / noonLuminance * 100).toFixed(0)}% as bright as noon (${mean.toFixed(1)} vs ${noonLuminance.toFixed(1)})`);
  }
  if (mean > noonLuminance * 1.05) {
    failures.push(`${String(hour).padStart(2, "0")}:00 is brighter than noon (${mean.toFixed(1)} vs ${noonLuminance.toFixed(1)})`);
  }
  if (bodySeparation < 0.22) {
    failures.push(`${String(hour).padStart(2, "0")}:00 leaves the body only ${(bodySeparation * 100).toFixed(0)}% off the water`);
  }
  if (inkSeparation < 0.6) {
    failures.push(`${String(hour).padStart(2, "0")}:00 leaves the fish's brightest accent only ${(inkSeparation * 100).toFixed(0)}% off its body`);
  }
}

// --- E. The pitch pose that reaches the screen -------------------------------

report("Rendered pitch (landscape)");
console.log("pitch  nose vs tail px  rows   apparent tilt");
{
  let state = createShowcaseState({ orientation: "landscape", scenario: "substrate-search" });
  for (let step = 0; step < 90; step += 1) state = tickShowcase(state, STEP_SECONDS, "substrate-search");
  const subject = showcaseSubjects(state, "substrate-search")[0];
  const config = orientationConfig("landscape");
  const cellHeight = config.pixelHeight / config.rows;
  let maximumTilt = 0;
  for (const pitch of [0, 16, 32, -32]) {
    const posed = {
      ...state,
      individuals: state.individuals.map((fish, index) => (index === subject.index
        ? { ...fish, visual: { ...fish.visual, pitch } }
        : fish)),
    };
    const { scene } = frame(posed, "landscape");
    const object = objectFor(scene, subjectId(subject.index, subject.fish));
    // The opaque silhouette, banded by panel position: after a turn the glyph
    // cells no longer sit in source order, but the painted body still runs nose
    // to tail across the panel and is what carries the lean at a glance.
    const xs = object.fill.map((rectangle) => rectangle.x);
    const minimumX = Math.min(...xs);
    const maximumX = Math.max(...xs);
    const span = maximumX - minimumX;
    const mean = (list) => list.reduce((sum, rectangle) => sum + rectangle.y + rectangle.height / 2, 0) / Math.max(1, list.length);
    const nose = object.fill.filter((rectangle) => rectangle.x >= maximumX - span * 0.15);
    const tail = object.fill.filter((rectangle) => rectangle.x <= minimumX + span * 0.15);
    const tilt = mean(nose) - mean(tail);
    const apparent = Math.atan2(tilt, span) * 180 / Math.PI;
    maximumTilt = Math.max(maximumTilt, Math.abs(apparent));
    console.log(
      `${String(pitch).padStart(5)} ${tilt.toFixed(1).padStart(16)} ${(tilt / cellHeight).toFixed(2).padStart(6)} ${`${apparent.toFixed(0)}deg`.padStart(14)}`,
    );
  }
  // A fish at full pitch has to look pitched. Two thirds of the simulated angle
  // is the working target; the authored shear alone delivered about a third.
  if (maximumTilt < 20) {
    failures.push(`a fully pitched fish leans only ${maximumTilt.toFixed(0)} degrees on the panel`);
  }
}

if (failures.length) {
  console.error("\nScreen-space legibility failure(s):");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log("\nEvery cue measured reaches the panel.");
}
