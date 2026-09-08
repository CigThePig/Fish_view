// Native Canvas pixel oracle. Unlike a rounded software mock, this catches
// differences from fractional background fills clipped by incremental damage.
import { createCanvas } from "@napi-rs/canvas";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { auditOptions, importFrom, writeAudit } from "./audit-options.mjs";

const options = auditOptions({ root: ".", seeds: "5,83,147", frames: 180, days: 420, output: ".audit-output" });
const { createAquariumState, applyTouch } = await importFrom(options.root, "src/sim/state.js");
const { advanceAquariumHistory } = await importFrom(options.root, "src/sim/aquarium-history.js");
const { tick } = await importFrom(options.root, "src/sim/tick.js");
const { render } = await importFrom(options.root, "src/render/render.js");
const { CanvasSceneRenderer } = await importFrom(options.root, "src/render/canvas-renderer.js");
const { glyphPixelRects } = await importFrom(options.root, "src/render/glyph-raster.js");
const report = { options, frames: 0, differences: 0, escapedBounds: 0, runs: [] };

for (const orientation of ["landscape", "portrait"]) for (const seed of options.seeds) {
  let state = advanceAquariumHistory(createAquariumState({ orientation, seed }), options.days);
  const canvas = createCanvas(1, 1), reference = createCanvas(1, 1);
  const incremental = new CanvasSceneRenderer(canvas), full = new CanvasSceneRenderer(reference);
  const run = { orientation, seed, differingFrames: 0, worstPixels: 0, first: null, escaped: null };
  for (let frame = 0; frame < options.frames; frame++) {
    if (frame === Math.floor(options.frames / 6)) state = applyTouch(state, state.cols / 2, state.rows - 4);
    if (frame === Math.floor(options.frames * 5 / 9)) state = { ...state, timeOfDayHours: 0 };
    state = tick(state, 0.1);
    const scene = render(state);
    incremental.draw(scene);
    full.reset(); full.draw(scene);
    for (const object of scene.objects) {
      const bounds = object.bounds;
      const spans = [...object.fill];
      for (let i = object.glyphStart; i < object.glyphStart + object.glyphCount; i++) {
        spans.push(...glyphPixelRects(scene.glyphs[i]));
      }
      for (const span of spans) {
        if (span.x < bounds.x || span.y < bounds.y || span.x + span.width > bounds.x + bounds.width
          || span.y + span.height > bounds.y + bounds.height) {
          report.escapedBounds++;
          run.escaped ??= { frame, id: object.id, bounds, span };
        }
      }
    }
    const a = canvas.getContext("2d").getImageData(0, 0, scene.width, scene.height).data;
    const b = reference.getContext("2d").getImageData(0, 0, scene.width, scene.height).data;
    let pixels = 0;
    for (let p = 0; p < a.length; p += 4) {
      if (a[p] === b[p] && a[p + 1] === b[p + 1] && a[p + 2] === b[p + 2] && a[p + 3] === b[p + 3]) continue;
      pixels++;
      run.first ??= { frame, x: p / 4 % scene.width, y: Math.floor(p / 4 / scene.width),
        actual: [...a.slice(p, p + 4)], expected: [...b.slice(p, p + 4)] };
    }
    if (pixels) {
      report.differences++;
      run.differingFrames++;
      run.worstPixels = Math.max(run.worstPixels, pixels);
      if (run.first.frame === frame) {
        await mkdir(options.output, { recursive: true });
        for (const [name, image] of [["incremental", canvas], ["full", reference]]) {
          await writeFile(path.join(options.output, `${orientation}-${seed}-${name}.png`), image.toBuffer("image/png"));
        }
      }
    }
    report.frames++;
  }
  report.runs.push(run);
  console.log(JSON.stringify(run));
}
await writeAudit(options.output, "render", report);
console.log(`${report.frames} frames, ${report.differences} differing frames, ${report.escapedBounds} escaped spans`);
if (report.differences || report.escapedBounds) process.exitCode = 1;
