/*
 * Substrate feeding, graded and drawn.
 *
 * Bottom feeding is the one behaviour whose whole point is contact: a fish that
 * hovers over the sand is not eating, it is loitering above debris it never
 * touched. Contact is also the thing a frame-average legibility number cannot
 * see, because it is a fraction of a row between two specific things - the
 * lowest ink of one fish and the crest directly under it.
 *
 * So this walks every growth stage of every species in both orientations,
 * parks each one on its own graze line, drives it through the deepest strike
 * its own seed produces, and measures the gap in rows against the rendered
 * frame rather than against any model the simulation holds. `--sheet` writes a
 * magnified contact sheet of the same poses next to a sand line, because the
 * numbers say a stage is wrong and the picture says what it looks like.
 *
 *   node tools/measure-substrate-feeding.mjs
 *   node tools/measure-substrate-feeding.mjs --sheet .feeding/contact.png
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { growthStagesFor, individualSprites, spriteDimensions, spriteMouthOffset } from "../src/art/sprites.js";
import { glyphPixelRects } from "../src/render/glyph-raster.js";
import { render } from "../src/render/render.js";
import { glyphsForObject } from "../src/render/scene.js";
import { sceneTuning } from "../src/sim/choreography-tuning.js";
import { CELL_WIDTH, DEFAULT_SEED, orientationConfig } from "../src/sim/config.js";
import { substrateSurfaceY } from "../src/sim/environment.js";
import { ACTIVITIES, createActivityState, peckRotationHeadroom } from "../src/sim/fish-activities.js";
import { forageActivity, substrateGrazeY } from "../src/sim/fish-motion.js";
import { createAquariumState } from "../src/sim/state.js";

const SUBJECT_INDEX = 3;
const ORIENTATIONS = ["landscape", "portrait"];

// `--tune grazeBurialRows=1.2,grazePitchDegrees=30` runs the whole sweep with
// the substrate-search scene tuning overridden, which is the same override the
// behaviour choreography lab writes. Authoring a feeding posture is a matter of
// looking at candidates, so the tool has to be able to hold one up.
function tuningOverride(spec) {
  if (!spec) return null;
  const scene = {};
  for (const pair of spec.split(",")) {
    const [key, value] = pair.split("=");
    if (!key || value === undefined) throw new Error(`--tune wants key=value, got ${JSON.stringify(pair)}`);
    scene[key.trim()] = Number(value);
  }
  return { scene: { "substrate-search": scene } };
}

function optionValue(argumentsList, name, fallback) {
  const prefix = `${name}=`;
  const inline = argumentsList.find((argument) => argument.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = argumentsList.indexOf(name);
  return index >= 0 ? argumentsList[index + 1] : fallback;
}

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
      "The contact sheet needs the development-only @napi-rs/canvas package. Run `npm install` first.",
      { cause: error },
    );
  }
}

export function rosterStages() {
  const seen = new Map();
  for (const species of individualSprites) {
    for (const stage of growthStagesFor(species.id)) {
      if (!seen.has(stage.id)) seen.set(stage.id, stage);
    }
  }
  return [...seen.values()];
}

// A fish wearing one stage's artwork. spriteForFish() hands back anything that
// already carries a shape, so both the clearance model and the renderer see the
// stage without having to hunt for a seed and an age that grow into it.
function poseStage(state, stage, pitch) {
  const resting = state.individuals[SUBJECT_INDEX];
  const fish = {
    ...resting,
    ...stage,
    x: state.cols * 0.5,
    behavior: { current: "forage", previous: "cruise", blend: 1, ageSeconds: 30, ageRealSeconds: 30 },
    activity: { ...createActivityState(ACTIVITIES.substrateSearch), ageRealSeconds: 0 },
    visual: {
      ...resting.visual,
      pitch,
      targetPitch: pitch,
      facing: 1,
      targetFacing: 1,
      turnProgress: 1,
    },
  };
  fish.y = substrateGrazeY(fish, state, fish.x, SUBJECT_INDEX);
  return fish;
}

// The moment in the fish's own peck cycle where the strike is deepest, and the
// ages either side of it that the debris and the contact mark are drawn at. A
// frame posed at age zero shows a fish over clean sand, which is exactly the
// frame that cannot answer whether feeding reads.
// The posture a strike is drawn at: the feeding lean plus as much of the
// authored peck rotation as the pitch ceiling leaves, composed exactly as
// resolveActivityTarget() does. Posing the strike at the grazing angle instead
// made every peckPitchDegrees setting measure and photograph identically, which
// is the one field this tool exists to let someone author.
function strikePitch(tuning, peck) {
  return tuning.grazePitchDegrees
    + peck * peckRotationHeadroom(tuning.grazePitchDegrees, tuning.peckPitchDegrees);
}

function strikeCycle(state, fish) {
  const at = (age) => forageActivity(
    { ...fish, activity: { ...fish.activity, ageRealSeconds: age } },
    SUBJECT_INDEX,
    state,
  );
  let peak = { age: 0, forage: at(0) };
  for (let age = 0; age < 30; age += 0.01) {
    const forage = at(age);
    if (forage.peck > peak.forage.peck) peak = { age, forage };
  }
  let debris = peak;
  for (let age = peak.age; age < peak.age + 1.2; age += 0.01) {
    const forage = at(age);
    if (forage.debrisPhase !== null && forage.debrisPhase > 0.35) { debris = { age, forage }; break; }
  }
  return { peak, debris };
}

function agedAt(fish, age, pitch = null) {
  const posed = { ...fish, activity: { ...fish.activity, ageRealSeconds: age } };
  if (pitch === null) return posed;
  return { ...posed, visual: { ...posed.visual, pitch, targetPitch: pitch } };
}

function sceneWith(state, fish) {
  return render({
    ...state,
    individuals: state.individuals.map((value, index) => (index === SUBJECT_INDEX ? fish : value)),
  });
}

// Two numbers decide whether a frame reads as feeding, and they pull against
// each other. `mouth` is how far the fish's mouth sits above the crest it is
// supposed to be working - the gap the puff of silt has to cross to look like
// the fish's doing, and the one that used to widen with every stage a fish
// grew. `buried` is how far its underside has passed through the crest to put
// the mouth there, which is what stops the cure being worse than the disease.
// Both are read off the rasterised glyph rectangles: the panel's own ink.
function contactRows(state, fish, metrics, sprite) {
  const { rowPixels, columnPixels } = metrics;
  const scene = sceneWith(state, fish);
  const object = scene.objects.find((candidate) => candidate.id.startsWith(`individual:${SUBJECT_INDEX}:`));
  const glyphs = glyphsForObject(scene, object);
  const bottomOf = (list) => Math.max(
    ...list.flatMap((glyph) => glyphPixelRects(glyph).map((rectangle) => rectangle.y + rectangle.height)),
  ) / rowPixels;
  const mouthGlyph = glyphs[spriteMouthOffset(sprite).glyph] ?? glyphs[0];
  // Each part is measured against the crest under itself. The terrain is not
  // flat and a grown fish's mouth leads its centre by two to three columns, so
  // one crest sample for the whole animal is a third of a row of noise - and it
  // is the crest under the mouth that the contact mark is drawn against.
  const mouthX = (mouthGlyph.x + CELL_WIDTH * mouthGlyph.scaleX / 2) / columnPixels;
  return {
    mouth: substrateSurfaceY(state, mouthX) - bottomOf([mouthGlyph]),
    buried: bottomOf(glyphs) - substrateSurfaceY(state, fish.x),
  };
}

export function measureFeeding(override = null) {
  const results = [];
  for (const orientation of ORIENTATIONS) {
    const config = orientationConfig(orientation);
    const metrics = {
      rowPixels: config.pixelHeight / config.rows,
      columnPixels: config.pixelWidth / config.cols,
    };
    const state = {
      ...createAquariumState({ orientation, seed: DEFAULT_SEED, wallClockHours: 12 }),
      ...(override ? { choreographyTuning: override } : {}),
    };
    const tuning = sceneTuning(state, "substrate-search");
    for (const stage of rosterStages()) {
      const grazing = poseStage(state, stage, tuning.grazePitchDegrees);
      const { peak } = strikeCycle(state, grazing);
      const striking = {
        ...agedAt(grazing, peak.age, strikePitch(tuning, peak.forage.peck)),
        y: grazing.y + peak.forage.peckDisplacement,
      };
      const { width, height } = spriteDimensions(stage);
      const rest = contactRows(state, grazing, metrics, stage);
      const hit = contactRows(state, striking, metrics, stage);
      results.push({
        orientation,
        id: stage.id,
        width,
        height,
        cells: width * height,
        graze: rest.mouth,
        strike: hit.mouth,
        buried: Math.max(rest.buried, hit.buried),
      });
    }
  }
  return results;
}

function report(results) {
  for (const orientation of ORIENTATIONS) {
    const rows = results.filter((entry) => entry.orientation === orientation);
    console.log(`\n${orientation}  mouth = rows the mouth sits above the crest, buried = rows the underside passes through it`);
    console.log(`${"stage".padEnd(26)} ${"size".padEnd(5)} ${"graze".padStart(6)} ${"strike".padStart(7)} ${"buried".padStart(7)}`);
    for (const entry of rows.slice().sort((left, right) => left.cells - right.cells)) {
      const flag = entry.strike >= 0.25 ? "  <- mouth never reaches the sand" : "";
      console.log(
        `${entry.id.padEnd(26)} ${`${entry.height}x${entry.width}`.padEnd(5)} `
        + `${entry.graze.toFixed(2).padStart(6)} ${entry.strike.toFixed(2).padStart(7)} `
        + `${entry.buried.toFixed(2).padStart(7)}${flag}`,
      );
    }
    const worst = (fits) => Math.max(...rows.filter(fits).map((entry) => entry.graze));
    const small = worst((entry) => entry.height <= 2);
    const large = worst((entry) => entry.height >= 5);
    const missed = rows.filter((entry) => entry.strike >= 0.25);
    console.log(`  worst graze: fry ${small.toFixed(2)}, grown ${large.toFixed(2)} (size gradient ${(large - small).toFixed(2)})`);
    console.log(`  deepest underside burial: ${Math.max(...rows.map((entry) => entry.buried)).toFixed(2)} rows`);
    console.log(`  stages whose deepest strike never brings the mouth to the sand: ${missed.length ? missed.map((entry) => entry.id).join(", ") : "none"}`);
  }
}

// One magnified strip per stage: the fish over its own sand, at rest on the
// graze line and at the bottom of its deepest strike, with the crest drawn
// across both so contact is something to look at rather than infer.
async function writeSheet(target, only = null, override = null) {
  const { createCanvas } = await loadCanvasModule();
  const { CanvasSceneRenderer } = await import("../src/render/canvas-renderer.js");
  const orientation = "landscape";
  const config = orientationConfig(orientation);
  const rowPixels = config.pixelHeight / config.rows;
  const columnPixels = config.pixelWidth / config.cols;
  const state = {
    ...createAquariumState({ orientation, seed: DEFAULT_SEED, wallClockHours: 12 }),
    ...(override ? { choreographyTuning: override } : {}),
  };
  const tuning = sceneTuning(state, "substrate-search");
  const stages = only
    ? rosterStages().filter((stage) => only.includes(stage.id))
    : rosterStages();

  const zoom = 3;
  const cropCols = 12;
  const cropRows = 6;
  const cropWidth = Math.round(cropCols * columnPixels);
  const cropHeight = Math.round(cropRows * rowPixels);
  const labelWidth = 210;
  const gap = 8;
  const sheet = createCanvas(
    labelWidth + (cropWidth * zoom + gap) * 3,
    stages.length * (cropHeight * zoom + gap) + gap,
  );
  const ink = sheet.getContext("2d");
  ink.fillStyle = "#101418";
  ink.fillRect(0, 0, sheet.width, sheet.height);
  ink.font = "16px monospace";
  ink.textBaseline = "middle";

  const frame = createCanvas(config.pixelWidth, config.pixelHeight);
  const renderer = new CanvasSceneRenderer(frame);

  for (const [row, stage] of stages.entries()) {
    const grazing = poseStage(state, stage, tuning.grazePitchDegrees);
    const { peak, debris } = strikeCycle(state, grazing);
    const striking = {
      ...agedAt(grazing, peak.age, strikePitch(tuning, peak.forage.peck)),
      y: grazing.y + peak.forage.peckDisplacement,
    };
    const settling = {
      ...agedAt(grazing, debris.age, strikePitch(tuning, debris.forage.peck)),
      y: grazing.y + debris.forage.peckDisplacement,
    };
    const top = gap + row * (cropHeight * zoom + gap);
    const crest = substrateSurfaceY(state, grazing.x);
    const cropTop = Math.round((crest - cropRows + 1.6) * rowPixels);
    const cropLeft = Math.round((grazing.x - cropCols / 2) * columnPixels);

    ink.fillStyle = "#cbd5e1";
    ink.fillText(stage.id, 8, top + cropHeight * zoom / 2 - 9);
    const { width, height } = spriteDimensions(stage);
    ink.fillStyle = "#7c8899";
    ink.fillText(`${height}x${width}`, 8, top + cropHeight * zoom / 2 + 11);

    for (const [column, fish] of [grazing, striking, settling].entries()) {
      renderer.reset();
      renderer.draw(sceneWith(state, fish));
      const left = labelWidth + column * (cropWidth * zoom + gap);
      ink.drawImage(
        frame,
        cropLeft, cropTop, cropWidth, cropHeight,
        left, top, cropWidth * zoom, cropHeight * zoom,
      );
      // The crest the fish is supposed to be working, drawn where the
      // simulation believes it is.
      ink.fillStyle = "rgba(255,96,96,0.75)";
      ink.fillRect(left, top + (crest * rowPixels - cropTop) * zoom, cropWidth * zoom, 1);
    }
  }

  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, sheet.toBuffer("image/png"));
  console.log(`\ncontact sheet: ${target}`);
}

const isEntry = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isEntry) {
  const argumentsList = process.argv.slice(2);
  const sheet = optionValue(argumentsList, "--sheet", null);
  const only = optionValue(argumentsList, "--stages", null);
  const override = tuningOverride(optionValue(argumentsList, "--tune", null));
  report(measureFeeding(override));
  if (sheet) await writeSheet(path.resolve(sheet), only ? only.split(",") : null, override);
}
