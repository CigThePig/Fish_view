// Phase 5 evidence: what a press does to the aquarium rather than to the fish,
// what the chains it starts cost, and whether any of it grows.
//
// Every scenario here is one of the production INTERACTION_SCENARIOS, replayed
// through the production observation harness at ten frames a second against a
// naturally stocked and settled tank. Nothing is forced: no fish is posed, no
// activity is imposed, and the anchors resolve themselves from the seed.
//
//   node tools/measure-environment-response.mjs
//   node tools/measure-environment-response.mjs --seeds=5,147,1234 --output=.audit-output/environment
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { createCanvas, GifEncoder } from "@napi-rs/canvas";

import {
  INTERACTION_SCENARIOS,
  aquariumCache,
  observeInteraction,
  prepareScenario,
} from "../src/dev/interaction-observation.js";
import { createBubbleWorldRecords, isInvestigableBubble } from "../src/sim/bubbles.js";
import { ACTIVITIES } from "../src/sim/fish-activities.js";
import {
  MAX_ENVIRONMENT_STIMULI,
  MAX_STIMULI,
  chainEnvironmentStimuli,
  environmentStimuli,
} from "../src/sim/interaction-events.js";
import { livingWorldRecords } from "../src/sim/living-world.js";
import { serializePersistentState } from "../src/sim/state.js";
import { CanvasSceneRenderer } from "../src/render/canvas-renderer.js";
import { render } from "../src/render/render.js";

const option = (name, fallback) => process.argv
  .find((argument) => argument.startsWith(`--${name}=`))?.split("=").slice(1).join("=") ?? fallback;

const output = path.resolve(option("output", ".audit-output/environment-response"));
const seeds = option("seeds", "5").split(",").map((value) => Number.parseInt(value, 10));
// The scenarios that reach past the fish, plus the two that must show no chain
// at all: a chain that happens in open water would be a chain that happens
// everywhere, which is the storm this phase is careful not to be.
const WANTED = [
  "substrate-release",
  "waterline-tap",
  "sand-drag",
  "resident-tap",
  "plant-drag",
  "open-water-tap",
];
const GIF_SCENARIO = "substrate-release";
const NATIVE = { width: 800, height: 480 };
// A close-up of the cause and its effect. The contact sheet shows the whole
// aquarium, which is the right scale for "nothing else changed" and the wrong
// one for "the sand lifted": these effects are deliberately quieter than a
// fish, so the evidence that they happened has to be drawn at a size a reader
// can see them at.
const CLOSEUP = { width: 150, height: 90, scale: 5, frames: [9, 11, 13, 16, 22, 40] };
const CLOSEUP_SCENARIOS = ["substrate-release", "waterline-tap", "resident-tap"];

await mkdir(output, { recursive: true });

const scenarios = WANTED
  .map((id) => INTERACTION_SCENARIOS.find((scenario) => scenario.id === id))
  .filter(Boolean);

const report = { seeds, fps: 10, scenarios: scenarios.map((one) => one.id), runs: [] };

for (const seed of seeds) {
  const cache = aquariumCache(seed);
  const source = createCanvas(NATIVE.width, NATIVE.height);
  const reference = createCanvas(NATIVE.width, NATIVE.height);
  const incremental = new CanvasSceneRenderer(source);
  const full = new CanvasSceneRenderer(reference);
  const sheet = createCanvas(1200, scenarios.length * 264);
  const context = sheet.getContext("2d");
  context.fillStyle = "#07191f";
  context.fillRect(0, 0, sheet.width, sheet.height);

  for (const [row, scenario] of scenarios.entries()) {
    const prepared = prepareScenario(scenario, cache);
    incremental.reset();
    const run = {
      seed,
      scenario: scenario.id,
      // Cost, against the same incremental renderer the panel uses.
      pixelFrames: 0,
      differingFrames: 0,
      fullRedraws: 0,
      // Caps. None of these may grow with how long a viewer keeps touching.
      peakStimuli: 0,
      peakConsequences: 0,
      peakImpulses: 0,
      consequenceCap: MAX_ENVIRONMENT_STIMULI,
      stimulusCap: MAX_STIMULI,
      // The chain, measured on what the aquarium actually did.
      consequencesRaised: new Set(),
      investigableBurstFrames: 0,
      burstInvestigators: new Set(),
      surfaceTrips: new Set(),
      grazersDrawn: new Set(),
      // The environment's own response, as a displacement against the same
      // aquarium at the same second with the water left alone.
      residentDisplacement: 0,
      driftDisplacement: 0,
      bubbleDisplacement: 0,
      dispersedBubbles: 0,
      // What is left when it is over.
      finalConsequences: 0,
      finalImpulses: 0,
      finalSaveBytes: 0,
      objectsPeak: 0,
      glyphsPeak: 0,
      siltObjectWidthPeak: 0,
      surfaceObjectWidthPeak: 0,
      backgroundUnchanged: true,
    };

    const thumbnail = createCanvas(400, 240);
    const encoder = scenario.id === GIF_SCENARIO && seed === seeds[0]
      ? new GifEncoder(400, 240, { repeat: 0, quality: 15 })
      : null;

    const observation = observeInteraction(prepared.state, {
      history: prepared.history,
      observeSeconds: scenario.observeSeconds ?? 12,
      onFrame: ({ frame, state, scene, control }) => {
        incremental.draw(scene);
        full.reset();
        full.draw(scene);
        const drawn = source.getContext("2d").getImageData(0, 0, NATIVE.width, NATIVE.height).data;
        const expected = reference.getContext("2d").getImageData(0, 0, NATIVE.width, NATIVE.height).data;
        run.pixelFrames += 1;
        if (Buffer.compare(Buffer.from(drawn.buffer), Buffer.from(expected.buffer))) run.differingFrames += 1;

        run.peakStimuli = Math.max(run.peakStimuli, state.stimuli.length);
        run.peakImpulses = Math.max(run.peakImpulses, state.impulses.length);
        const consequences = environmentStimuli(state);
        run.peakConsequences = Math.max(run.peakConsequences, consequences.length);
        for (const consequence of consequences) run.consequencesRaised.add(consequence.id);
        run.finalConsequences = consequences.length;
        run.finalImpulses = state.impulses.length;
        run.finalSaveBytes = Buffer.byteLength(JSON.stringify(serializePersistentState(state)));
        run.objectsPeak = Math.max(run.objectsPeak, scene.objects.length);
        run.glyphsPeak = Math.max(run.glyphsPeak, scene.glyphs.length);

        // The chain. A burst that is investigable and a fish that went to it
        // are two different claims, so both are counted; a third counts the
        // grazing fish whose patch leaned onto a fresh cloud.
        const burst = createBubbleWorldRecords(state)
          .filter((record) => record.kind === "touch" && isInvestigableBubble(record));
        if (burst.length) run.investigableBurstFrames += 1;
        for (const fish of state.individuals) {
          const target = fish.activity?.targetId;
          if (fish.activity?.current === ACTIVITIES.bubbleInvestigate
            && typeof target === "string" && target.includes("substrate-release")) {
            run.burstInvestigators.add(fish.seed.toString(16));
          }
          if (fish.activity?.current === ACTIVITIES.surfaceInvestigate
            && consequences.some((consequence) => consequence.source === "surface-break"
              && Math.abs(consequence.x - (fish.activity.targetX ?? -99)) <= consequence.radius)) {
            run.surfaceTrips.add(fish.seed.toString(16));
          }
          if (fish.activity?.current === ACTIVITIES.substrateSearch
            && consequences.some((consequence) => consequence.source === "substrate-release"
              && Math.abs(consequence.x - fish.x) <= consequence.radius)) {
            run.grazersDrawn.add(fish.seed.toString(16));
          }
        }

        // The environment against its own control: the same aquarium, the same
        // second, with nothing done to the water. This isolates what the press
        // did from what the tank was doing anyway.
        const quiet = livingWorldRecords(control);
        const quietById = new Map(quiet.map((record) => [record.id, record]));
        for (const record of livingWorldRecords(state)) {
          const twin = quietById.get(record.id);
          if (!twin) continue;
          const moved = Math.hypot((record.x - twin.x), (record.y - twin.y));
          if (record.kind === "tuft") run.driftDisplacement = Math.max(run.driftDisplacement, moved);
          else run.residentDisplacement = Math.max(run.residentDisplacement, moved);
        }
        const quietBubbles = new Map(createBubbleWorldRecords({ ...state, impulses: [] })
          .map((record) => [record.id, record]));
        for (const record of createBubbleWorldRecords(state)) {
          const twin = quietBubbles.get(record.id);
          if (!twin) continue;
          run.bubbleDisplacement = Math.max(run.bubbleDisplacement,
            Math.hypot(record.worldX - twin.worldX, record.worldY - twin.worldY));
          if ((record.disturbance ?? 0) > 0.45) run.dispersedBubbles += 1;
        }

        // Locality. Both new scene objects have to stay inside their own event.
        for (const object of scene.objects) {
          if (object.id.startsWith("substrate-release:")) {
            run.siltObjectWidthPeak = Math.max(run.siltObjectWidthPeak, object.bounds.width);
          }
          if (object.id.startsWith("surface-break:")) {
            run.surfaceObjectWidthPeak = Math.max(run.surfaceObjectWidthPeak, object.bounds.width);
          }
        }


        if (encoder) {
          thumbnail.getContext("2d").drawImage(source, 0, 0, 400, 240);
          const pixels = thumbnail.getContext("2d").getImageData(0, 0, 400, 240).data;
          encoder.addFrame(new Uint8Array(pixels.buffer), 400, 240, { delay: 100 });
        }

        const column = [12, 22, Math.min(48, (scenario.observeSeconds ?? 12) * 10 - 2)].indexOf(frame);
        if (column >= 0) {
          const x = column * 400;
          const y = row * 264;
          context.fillStyle = "#b2cdce";
          context.font = "12px sans-serif";
          context.fillText(`${scenario.id} / seed ${seed} / ${(frame / 10).toFixed(1)} s`, x + 8, y + 16);
          context.drawImage(source, x, y + 24, 400, 240);
        }
      },
    });

    run.fullRedraws = observation.render.fullRedraws ?? 0;
    run.render = observation.render;
    run.environment = observation.aquarium;
    // A press must never rewrite the background: that is what a full redraw
    // looks like before the damage calculator gets to it.
    // The backdrop the panel would have to repaint in full. A press may change
    // what is drawn on top of the water; it may not change the water. The probe
    // carries one of everything the chain can produce at once.
    const probe = {
      ...prepared.state,
      impulses: Object.freeze([{
        id: "probe", x: prepared.anchor.x, y: prepared.anchor.y, ageSeconds: 0.5,
        durationSeconds: 3.2, radius: 7.5, strength: 1, contact: "substrate", seed: 1, sequence: 1,
        dirX: 0, dirY: 0, source: "touch",
      }]),
    };
    run.backgroundUnchanged = JSON.stringify(render(prepared.state).background)
      === JSON.stringify(render({
        ...probe,
        stimuli: chainEnvironmentStimuli(probe, { stimuli: [], impulses: probe.impulses }),
      }).background);

    run.consequencesRaised = run.consequencesRaised.size;
    run.burstInvestigators = [...run.burstInvestigators];
    run.surfaceTrips = [...run.surfaceTrips];
    run.grazersDrawn = [...run.grazersDrawn];
    run.residentDisplacement = Number(run.residentDisplacement.toFixed(3));
    run.driftDisplacement = Number(run.driftDisplacement.toFixed(3));
    run.bubbleDisplacement = Number(run.bubbleDisplacement.toFixed(3));
    report.runs.push(run);

    if (encoder) await writeFile(path.join(output, `${scenario.id}.gif`), encoder.finish());
    console.log(JSON.stringify({
      seed,
      scenario: run.scenario,
      consequences: `${run.consequencesRaised} raised, ${run.peakConsequences} live at once (cap ${run.consequenceCap})`,
      chain: `${run.burstInvestigators.length} to the burst, ${run.surfaceTrips.length} to the surface, ${run.grazersDrawn.length} grazing it`,
      burstInvestigableFrames: run.investigableBurstFrames,
      displacement: `resident ${run.residentDisplacement}, drift ${run.driftDisplacement}, bubble ${run.bubbleDisplacement}`,
      damage: `${run.render.averageDamagePercent}% avg, ${run.render.worstDamagePercent}% worst, ${run.fullRedraws} full`,
      pixels: `${run.pixelFrames} frames, ${run.differingFrames} differing`,
      settled: `${run.finalConsequences} consequences, ${run.finalImpulses} impulses left`,
      saveBytes: run.finalSaveBytes,
    }));
  }

  await writeFile(path.join(output, `contact-sheet-seed-${seed}.png`), sheet.toBuffer("image/png"));

  // The same runs again, cropped to the disturbance and drawn at five times
  // the panel's own scale.
  const closeUps = CLOSEUP_SCENARIOS
    .map((id) => scenarios.find((scenario) => scenario.id === id))
    .filter(Boolean);
  const rowHeight = CLOSEUP.height * CLOSEUP.scale + 22;
  const zoom = createCanvas(CLOSEUP.frames.length * CLOSEUP.width * CLOSEUP.scale, closeUps.length * rowHeight);
  const zoomContext = zoom.getContext("2d");
  zoomContext.fillStyle = "#07191f";
  zoomContext.fillRect(0, 0, zoom.width, zoom.height);
  zoomContext.imageSmoothingEnabled = false;

  for (const [row, scenario] of closeUps.entries()) {
    const prepared = prepareScenario(scenario, cache);
    const canvas = createCanvas(NATIVE.width, NATIVE.height);
    const renderer = new CanvasSceneRenderer(canvas);
    const centreX = Math.round(prepared.anchor.x / prepared.state.cols * NATIVE.width);
    // The silt is below the point a viewer can reach and the break is above it,
    // so each crop is nudged toward the thing it is evidence of.
    const lift = scenario.id === "waterline-tap" ? -20 : 30;
    const centreY = Math.round(prepared.anchor.y / prepared.state.rows * NATIVE.height) + lift;
    const cropX = Math.max(0, Math.min(NATIVE.width - CLOSEUP.width, centreX - CLOSEUP.width / 2));
    const cropY = Math.max(0, Math.min(NATIVE.height - CLOSEUP.height, centreY - CLOSEUP.height / 2));
    observeInteraction(prepared.state, {
      history: prepared.history,
      observeSeconds: 8,
      onFrame: ({ frame, scene }) => {
        renderer.draw(scene);
        const column = CLOSEUP.frames.indexOf(frame);
        if (column < 0) return;
        const x = column * CLOSEUP.width * CLOSEUP.scale;
        const y = row * rowHeight;
        zoomContext.fillStyle = "#b2cdce";
        zoomContext.font = "14px sans-serif";
        zoomContext.fillText(`${scenario.id} @ ${(frame / 10).toFixed(1)} s`, x + 6, y + 15);
        zoomContext.drawImage(canvas, cropX, cropY, CLOSEUP.width, CLOSEUP.height,
          x, y + 20, CLOSEUP.width * CLOSEUP.scale, CLOSEUP.height * CLOSEUP.scale);
      },
    });
  }
  await writeFile(path.join(output, `close-up-seed-${seed}.png`), zoom.toBuffer("image/png"));
}

await writeFile(path.join(output, "measurements.json"), `${JSON.stringify(report, null, 2)}\n`);

const broken = report.runs.filter((run) => run.differingFrames
  || run.fullRedraws
  || !run.backgroundUnchanged
  || run.peakConsequences > run.consequenceCap
  || run.peakStimuli > run.stimulusCap);
if (broken.length) {
  console.error(`FAILED: ${broken.map((run) => `${run.scenario}@${run.seed}`).join(", ")}`);
  process.exitCode = 1;
}
