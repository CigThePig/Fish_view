// Production pointer replay at 10 Hz, before/after captures, and an incremental
// pixel oracle. Run with --baseline=/path/to/previous/worktree for comparison.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createCanvas, GifEncoder } from "@napi-rs/canvas";

const option = (name, fallback) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.split("=").slice(1).join("=") ?? fallback;
const output = path.resolve(option("output", ".audit-output/water-response"));
const baseline = option("baseline", "");
await mkdir(output, { recursive: true });
const scenarios = [
  { id: "untouched", history: "" },
  { id: "water-tap", history: "1:d:33:9.5 1.1:u:33:9.5" },
  { id: "canopy-tap", history: "1:d:55:11 1.1:u:55:11" },
  { id: "high-tap", history: "1:d:55:2 1.1:u:55:2" },
  { id: "plant-drag", history: "1:d:49:12 1.4:m:51:12 1.8:m:53:12 2.2:m:55:12 2.6:m:57:12 3:m:59:12 3.4:m:61:12 3.5:u:61:12" },
  { id: "plant-swipe", history: "1:d:46:12 1.1:m:52:12 1.2:m:58:12 1.3:u:64:12" },
  { id: "night-drag", night: true, history: "1:d:49:12 1.4:m:51:12 1.8:m:53:12 2.2:m:55:12 2.6:m:57:12 3:m:59:12 3.4:m:61:12 3.5:u:61:12" },
];
const report = { seed: 5, seconds: 8, fps: 10, runs: [] };
for (const [label, root] of [...(baseline ? [["before", baseline]] : []), ["after", "."]]) {
  const load = (file) => import(pathToFileURL(path.resolve(root, file)).href);
  const { createObservationAquarium, observeInteraction, decodePointerHistory } = await load("src/dev/interaction-observation.js");
  const { posePlant } = await load("src/sim/plants.js");
  const { render } = await load("src/render/render.js");
  const { serializePersistentState } = await load("src/sim/state.js");
  const { CanvasSceneRenderer } = await load("src/render/canvas-renderer.js");
  const source = createCanvas(800, 480), reference = createCanvas(800, 480);
  const incremental = new CanvasSceneRenderer(source), full = new CanvasSceneRenderer(reference);
  const sheet = createCanvas(1200, scenarios.length * 264);
  const context = sheet.getContext("2d");
  context.fillStyle = "#07191f"; context.fillRect(0, 0, sheet.width, sheet.height);
  const dayState = createObservationAquarium({ seed: report.seed });
  for (const [row, scenario] of scenarios.entries()) {
    const base = scenario.night ? { ...dayState, timeOfDayHours: 0 } : dayState;
    incremental.reset();
    const run = { label, scenario: scenario.id, pixelFrames: 0, differingFrames: 0,
      maxPlantDisplacementPx: 0, maxWaterObjects: 0, maxWaterSpans: 0, maxWaterPixels: 0,
      peakImpulses: 0, peakStimuli: 0, finalImpulses: 0, finalPlantDisplacementPx: 0 };
    const thumbnail = createCanvas(400, 240);
    const encoder = scenario.id === "plant-drag"
      ? new GifEncoder(400, 240, { repeat: 0, quality: 15 }) : null;
    const observation = observeInteraction(base, {
      history: decodePointerHistory(scenario.history), observeSeconds: report.seconds,
      onFrame: ({ frame, state, scene }) => {
        incremental.draw(scene);
        if (label === "after") {
          full.reset(); full.draw(scene);
          const a = source.getContext("2d").getImageData(0, 0, 800, 480).data;
          const b = reference.getContext("2d").getImageData(0, 0, 800, 480).data;
          run.pixelFrames++;
          if (Buffer.compare(Buffer.from(a.buffer), Buffer.from(b.buffer))) run.differingFrames++;
        }
        // Same fish and time on both sides: isolate water's contribution to
        // stem displacement, not the secondary movement of fish coming over.
        const unforced = { ...state, impulses: [] };
        let displacement = 0;
        for (const plant of state.plants) {
          const posed = posePlant(plant, state), rest = posePlant(plant, unforced);
          for (const joint of posed.joints) {
            const twin = rest.points[joint.index];
            displacement = Math.max(displacement,
              Math.hypot((joint.x - twin.x) * 800 / 66, (joint.y - twin.y) * 24));
          }
        }
        const water = scene.objects.filter((object) => object.id.startsWith("reaction:ripple:"));
        run.maxWaterObjects = Math.max(run.maxWaterObjects, water.length);
        run.maxWaterSpans = Math.max(run.maxWaterSpans, water.reduce((sum, object) => sum + object.fill.length, 0));
        // Upper bound, including overlapping spans; meaningful for opaque fill cost.
        run.maxWaterPixels = Math.max(run.maxWaterPixels,
          water.flatMap((object) => object.fill).reduce((sum, span) => sum + span.width * span.height, 0));
        run.maxPlantDisplacementPx = Math.max(run.maxPlantDisplacementPx, displacement);
        run.peakImpulses = Math.max(run.peakImpulses, state.impulses.length);
        run.peakStimuli = Math.max(run.peakStimuli, state.stimuli.length);
        run.finalImpulses = state.impulses.length;
        run.finalPlantDisplacementPx = displacement;
        run.finalSaveBytes = Buffer.byteLength(JSON.stringify(serializePersistentState(state)));
        if (encoder) {
          thumbnail.getContext("2d").drawImage(source, 0, 0, 400, 240);
          const pixels = thumbnail.getContext("2d").getImageData(0, 0, 400, 240).data;
          encoder.addFrame(new Uint8Array(pixels.buffer), 400, 240, { delay: 100 });
        }
        const column = [15, 26, 48].indexOf(frame);
        if (column >= 0) {
          const x = column * 400, y = row * 264;
          context.fillStyle = "#b2cdce"; context.font = "12px sans-serif";
          context.fillText(`${label} / ${scenario.id} / ${(frame / 10).toFixed(1)} s`, x + 8, y + 16);
          context.drawImage(source, x, y + 24, 400, 240);
        }
      },
    });
    run.render = observation.render;
    // Validate stable backdrop separately from damage percentage: interaction
    // must not animate the whole aquarium's background signature.
    run.backgroundUnchanged = JSON.stringify(render(base).background) === JSON.stringify(render({ ...base,
      impulses: [{ id: "probe", x: 33, y: 9, ageSeconds: 0.5, durationSeconds: 3.2, radius: 7.5, strength: 1 }],
    }).background);
    report.runs.push(run);
    if (encoder) await writeFile(path.join(output, `${label}-${scenario.id}.gif`), encoder.finish());
    console.log(JSON.stringify(run));
  }
  await writeFile(path.join(output, `${label}-contact-sheet.png`), sheet.toBuffer("image/png"));
}
await writeFile(path.join(output, "measurements.json"), `${JSON.stringify(report, null, 2)}\n`);
if (report.runs.some((run) => run.differingFrames || !run.backgroundUnchanged || run.finalImpulses)) process.exitCode = 1;
