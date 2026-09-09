// What the aquarium does before Stage 2 touches it.
//
// Stage 2 replaces the single global touch reaction, adds environmental
// response and grows a persistent relationship, and every one of those changes
// is judged against numbers that have to exist beforehand. This records them:
// how one tap currently lands on the cast, what a tap and an ordinary mature
// evening cost the incremental renderer, and how big the save gets over a
// decade.
//
// It is deliberately small. Phase 0 builds the real interaction observation
// harness - replayable pointer histories, per-fish response measurements,
// semantic captures - and this stays as the fixed pre-Stage-2 reading that
// harness is compared against.
import { auditOptions, importFrom, writeAudit } from "./audit-options.mjs";

const options = auditOptions({
  root: ".",
  seeds: "5,147,1234",
  days: 420,
  frames: 300,
  output: ".audit-output",
});

const { createAquariumState, applyTouch, serializePersistentState } =
  await importFrom(options.root, "src/sim/state.js");
const { advanceAquariumHistory } = await importFrom(options.root, "src/sim/aquarium-history.js");
const { tick } = await importFrom(options.root, "src/sim/tick.js");
const { render } = await importFrom(options.root, "src/render/render.js");
const { calculateDamage } = await importFrom(options.root, "src/render/damage.js");

// Percent of the panel the incremental renderer has to repaint between two
// consecutive scenes. Everything Stage 2 adds is spent out of the headroom
// this leaves.
function damagePercent(previous, next) {
  const damage = calculateDamage(previous, next);
  return {
    percent: damage.area / damage.total * 100,
    rectangles: damage.rects.length,
    full: damage.full,
  };
}

function watch(state, frames) {
  let scene = render(state);
  let total = 0;
  let worst = 0;
  let rectangles = 0;
  let fullFrames = 0;
  for (let frame = 0; frame < frames; frame += 1) {
    state = tick(state, 0.1);
    const next = render(state);
    const damage = damagePercent(scene, next);
    total += damage.percent;
    worst = Math.max(worst, damage.percent);
    rectangles += damage.rectangles;
    if (damage.full) fullFrames += 1;
    scene = next;
  }
  return {
    state,
    scene,
    averageDamagePercent: total / frames,
    worstDamagePercent: worst,
    averageRectangles: rectangles / frames,
    fullFrames,
  };
}

const report = { options, runs: [], save: [] };

for (const seed of options.seeds) {
  const mature = advanceAquariumHistory(createAquariumState({ seed }), options.days);
  // Let the arrival entries finish so the reading is of an aquarium going
  // about its evening, not of a roster still swimming in.
  const settled = watch(mature, 600).state;

  const untouched = watch(settled, options.frames);

  // One tap, at mid-depth in open water, and the four seconds of reaction that
  // the current 3.2-second global reaction fits inside.
  const before = settled.individuals.map((fish) => fish.activity?.current ?? null);
  const touched = applyTouch(settled, settled.cols / 2, settled.rows / 2);
  const after = touched.individuals.map((fish) => fish.activity?.current ?? null);
  const reaction = watch(touched, 40);

  report.runs.push({
    seed,
    fish: settled.individuals.length,
    school: settled.school.length,
    scene: {
      objects: untouched.scene.objects.length,
      glyphs: untouched.scene.glyphs.length,
    },
    untouched: {
      averageDamagePercent: untouched.averageDamagePercent,
      worstDamagePercent: untouched.worstDamagePercent,
      averageRectangles: untouched.averageRectangles,
      fullFrames: untouched.fullFrames,
    },
    tap: {
      activitiesBefore: before,
      activitiesAfter: after,
      distinctActivitiesBefore: new Set(before).size,
      distinctActivitiesAfter: new Set(after).size,
      // The behaviour Stage 2 exists to end: one tap, one activity, whole cast.
      wholeCastSynchronised: new Set(after).size === 1,
      averageDamagePercent: reaction.averageDamagePercent,
      worstDamagePercent: reaction.worstDamagePercent,
      averageRectangles: reaction.averageRectangles,
      fullFrames: reaction.fullFrames,
    },
  });
}

// The save has to stay a fixed-size record of biology and history rather than
// something that grows with how much the aquarium has been played with, so the
// reading covers a decade and fifty taps.
for (const days of [30, 365, 1095, 3650]) {
  let state = advanceAquariumHistory(createAquariumState({ seed: 1234 }), days);
  for (let index = 0; index < 50; index += 1) {
    state = applyTouch(state, (index * 7) % state.cols, 4 + index % 10);
  }
  const payload = serializePersistentState(state);
  report.save.push({
    days,
    fish: payload.individuals.length,
    plants: payload.plants?.specimens?.length ?? payload.plants?.length ?? null,
    bytes: JSON.stringify(payload).length,
    transientKeys: ["reaction", "stimuli", "impulses"].filter((key) => key in payload),
  });
}

for (const run of report.runs) {
  console.log(JSON.stringify({
    seed: run.seed,
    fish: run.fish,
    objects: run.scene.objects,
    glyphs: run.scene.glyphs,
    untouchedDamage: `${run.untouched.averageDamagePercent.toFixed(1)}/${run.untouched.worstDamagePercent.toFixed(1)}%`,
    tapDamage: `${run.tap.averageDamagePercent.toFixed(1)}/${run.tap.worstDamagePercent.toFixed(1)}%`,
    rectangles: run.untouched.averageRectangles.toFixed(1),
    fullRedraws: run.untouched.fullFrames + run.tap.fullFrames,
    activitiesAfterTap: run.tap.distinctActivitiesAfter,
  }));
}
for (const entry of report.save) {
  console.log(`save ${entry.days}d: ${entry.bytes} bytes, ${entry.fish} fish, ${entry.plants} plants`
    + `${entry.transientKeys.length ? `, transient keys: ${entry.transientKeys.join(",")}` : ""}`);
}

await writeAudit(options.output, "stage2-baseline", report);
