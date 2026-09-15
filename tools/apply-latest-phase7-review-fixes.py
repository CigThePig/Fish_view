from pathlib import Path


def replace_once(path, old, new):
    file = Path(path)
    text = file.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one match, found {count}\n--- needle ---\n{old}")
    file.write_text(text.replace(old, new, 1))


# 1. Recognition gates only the opening of a chase. Once the semantic arc has
# begun, widening the gap is part of the chase and cannot rewind its phase.
replace_once(
    "src/sim/chase-arc.js",
    '''  // A semantic chase cannot start before the companion is actually close
  // enough to perceive it. Natural selection now begins chases inside this
  // radius, and this guard also keeps hand-posed/lab states honest if the pair
  // starts or drifts outside it.
  if (!Number.isFinite(distance) || distance > radius) return CHASE_ARC_PHASES.engage;
''',
    '''  // Recognition gates the opening only. Production selection begins inside
  // this radius, while hand-posed/lab states may start farther away and wait.
  // Once the opening has run long enough to force the escape beat, a widening
  // gap is evidence that the chase is working, not a reason to rewind to engage.
  // The age-ordered ending must therefore remain monotonic through break/recover.
  if ((!Number.isFinite(distance) || distance > radius) && age < forcedEscapeStart) {
    return CHASE_ARC_PHASES.engage;
  }
''',
)

# Replace the regression that encoded the rewind bug with the actual contract.
replace_once(
    "tests/phase7-review-regressions.test.js",
    '''test("playful chase never advances beyond engagement outside recognition range", () => {
  const tuning = { breakSeconds: 3, recognitionRadiusRows: 4.9 };
  const bounds = chaseArcBoundaries(tuning);
  assert.equal(
    chaseArcPhase(bounds.recoverStart + 5, 5.05, tuning),
    CHASE_ARC_PHASES.engage,
  );
});
''',
    '''test("recognition gates the chase opening without rewinding a mature arc", () => {
  const tuning = { breakSeconds: 6.2, recognitionRadiusRows: 4.9 };
  const bounds = chaseArcBoundaries(tuning);
  const openingAge = (bounds.engageEnd + bounds.escapeEnd) * 0.5;
  assert.equal(
    chaseArcPhase(openingAge, 5.05, tuning),
    CHASE_ARC_PHASES.engage,
    "a far hand-posed chase should still wait for opening recognition",
  );
  assert.equal(
    chaseArcPhase((bounds.interceptStart + bounds.breakSeconds) * 0.5, 5.05, tuning),
    CHASE_ARC_PHASES.intercept,
    "a mature chase rewound after the evader opened the gap",
  );
  assert.equal(
    chaseArcPhase((bounds.breakSeconds + bounds.recoverStart) * 0.5, 6.2, tuning),
    CHASE_ARC_PHASES.break,
    "the chase ending disappeared outside recognition range",
  );
  assert.equal(
    chaseArcPhase(bounds.recoverStart + 0.2, 6.2, tuning),
    CHASE_ARC_PHASES.recover,
  );
});
''',
)

# 2. The final vocabulary audit must fail when a sequential visual sentence loses
# one of the beats that defines it. Extend semantic observation without paying
# the renderer cost for the long diagnostic tail.
replace_once(
    "tools/audit-phase7-vocabulary.mjs",
    '''const SEED_LABELS = Object.freeze([
  "phase-7-7-identity-a",
  "phase-7-7-identity-b",
  "phase-7-7-identity-c",
  "phase-7-7-identity-d",
  "phase-7-7-identity-e",
  "phase-7-7-identity-f",
]);
''',
    '''const SEED_LABELS = Object.freeze([
  "phase-7-7-identity-a",
  "phase-7-7-identity-b",
  "phase-7-7-identity-c",
  "phase-7-7-identity-d",
  "phase-7-7-identity-e",
  "phase-7-7-identity-f",
]);

// Only behaviors whose frozen meaning depends on an ordered multi-beat sentence
// get hard semantic gates. Broad motion metrics remain evidence, not a thicket
// of magic-number assertions. Longer windows tick production cheaply after the
// ordinary rendered evidence window has ended.
const SEMANTIC_CONTRACTS = Object.freeze({
  "individual-follow": Object.freeze({
    observationSeconds: 30,
    phases: Object.freeze(["trail", "peel-away"]),
  }),
  "companion-cruise": Object.freeze({
    observationSeconds: 42,
    phases: Object.freeze(["beside", "separate"]),
    requiresExit: true,
  }),
  "plant-investigate": Object.freeze({
    observationSeconds: 45,
    phases: Object.freeze(["approach", "inspect", "retreat"]),
    requiresExit: true,
  }),
  "plant-shelter": Object.freeze({
    observationSeconds: 55,
    phases: Object.freeze(["enter", "quiet", "emerge"]),
    requiresExit: true,
  }),
  "plant-weave": Object.freeze({
    observationSeconds: 122,
    phases: Object.freeze(["weave-1", "weave-2", "weave-3", "weave-4", "weave-5"]),
    requiresExit: true,
  }),
  "surface-investigate": Object.freeze({
    observationSeconds: 38,
    phases: Object.freeze(["ascend", "probe", "descend"]),
    requiresExit: true,
  }),
});
''',
)

replace_once(
    "tools/audit-phase7-vocabulary.mjs",
    '''  let previousFish = first;
  let previousScene = render(state);
  let maximumStep = 0;
  let maximumVelocityChange = 0;
  let damageTotal = 0;
  let maximumDamage = 0;
  let fullFrames = 0;
  let transition = null;
  const phases = new Set();
  const activities = new Set([startingActivity]);
  const frameCount = Math.ceil((scenario.loopSeconds + RECOVERY_SECONDS) / STEP_SECONDS);

  for (let frame = 1; frame <= frameCount; frame += 1) {
''',
    '''  let previousFish = first;
  let previousScene = render(state);
  let maximumStep = 0;
  let maximumVelocityChange = 0;
  let damageTotal = 0;
  let maximumDamage = 0;
  let fullFrames = 0;
  let transition = null;
  const phases = new Set();
  const activities = new Set([startingActivity]);
  const renderedSeconds = scenario.loopSeconds + RECOVERY_SECONDS;
  const renderedFrameCount = Math.ceil(renderedSeconds / STEP_SECONDS);
  const semanticSeconds = Math.max(
    renderedSeconds,
    SEMANTIC_CONTRACTS[scenario.id]?.observationSeconds ?? 0,
  );
  const frameCount = Math.ceil(semanticSeconds / STEP_SECONDS);

  for (let frame = 1; frame <= frameCount; frame += 1) {
''',
)

replace_once(
    "tools/audit-phase7-vocabulary.mjs",
    '''    const nextScene = render(state);
    const damage = calculateDamage(previousScene, nextScene);
    const damageFraction = damage.area / damage.total;
    damageTotal += damageFraction;
    maximumDamage = Math.max(maximumDamage, damageFraction);
    if (damage.full) fullFrames += 1;
    previousScene = nextScene;

    const target = showcaseTarget(state, scenario.id);
''',
    '''    if (frame <= renderedFrameCount) {
      const nextScene = render(state);
      const damage = calculateDamage(previousScene, nextScene);
      const damageFraction = damage.area / damage.total;
      damageTotal += damageFraction;
      maximumDamage = Math.max(maximumDamage, damageFraction);
      if (damage.full) fullFrames += 1;
      previousScene = nextScene;
    }

    const target = showcaseTarget(state, scenario.id);
''',
)

replace_once(
    "tools/audit-phase7-vocabulary.mjs",
    '''    meanDamagePercent: rounded(damageTotal / frameCount * 100),
''',
    '''    meanDamagePercent: rounded(damageTotal / renderedFrameCount * 100),
''',
)

replace_once(
    "tools/audit-phase7-vocabulary.mjs",
    '''  if (identityCount !== SEED_LABELS.length) failures.push(record.activity + ": identity matrix collapsed");
  if (profiles.length < 2) failures.push(record.activity + ": body-profile matrix did not vary");
  if (variedTraits < 3) failures.push(record.activity + ": fewer than three seeded traits varied materially");
  return {
''',
    '''  if (identityCount !== SEED_LABELS.length) failures.push(record.activity + ": identity matrix collapsed");
  if (profiles.length < 2) failures.push(record.activity + ": body-profile matrix did not vary");
  if (variedTraits < 3) failures.push(record.activity + ": fewer than three seeded traits varied materially");

  const semantic = SEMANTIC_CONTRACTS[record.activity];
  if (semantic) {
    for (const sample of samples) {
      const identity = sample.seedLabel ?? String(sample.identity.seed);
      for (const phase of semantic.phases) {
        if (!sample.phases.includes(phase)) {
          failures.push(record.activity + ": " + identity + " missed semantic phase " + phase);
        }
      }
      if (semantic.requiresExit && !sample.transition) {
        failures.push(record.activity + ": " + identity + " never completed its frozen sentence");
      }
    }
  }
  return {
''',
)

# A lightweight source contract makes it difficult to accidentally turn the
# frozen-motion audit back into an observational-only report.
freeze_path = Path("tests/phase7-vocabulary-freeze.test.js")
freeze_text = freeze_path.read_text()
if "the vocabulary audit gates defining sequential motion beats per identity" in freeze_text:
    raise SystemExit("phase7 semantic audit regression already present")
freeze_text += r'''

test("the vocabulary audit gates defining sequential motion beats per identity", () => {
  const audit = readFileSync(new URL("../tools/audit-phase7-vocabulary.mjs", import.meta.url), "utf8");
  assert.match(audit, /SEMANTIC_CONTRACTS/);
  assert.match(audit, /"individual-follow"[\s\S]*"trail", "peel-away"/);
  assert.match(audit, /"plant-weave"[\s\S]*"weave-1"[\s\S]*"weave-5"/);
  assert.match(audit, /for \(const sample of samples\)/);
  assert.match(audit, /missed semantic phase/);
  assert.match(audit, /never completed its frozen sentence/);
});
'''
freeze_path.write_text(freeze_text)

# 3. Per-leg weave timeout values are diagnostic telemetry, not choreography.
# Keep them internal and remove dead tuning/export controls from the lab.
replace_once(
    "src/sim/fish-activities.js",
    '''const WEAVE_ROUTE_FAILURE_SECONDS = 120;
''',
    '''const WEAVE_ROUTE_FAILURE_SECONDS = 120;
const WEAVE_LEG_DIAGNOSTIC_TIMEOUT_SECONDS_MIN = 11;
const WEAVE_LEG_DIAGNOSTIC_TIMEOUT_SECONDS_MAX = 14;
''',
)

replace_once(
    "src/sim/fish-activities.js",
    '''function weavePoint(fish, primary, state, activity) {
  const tuning = sceneTuning(state, ACTIVITIES.plantWeave);
  const route = weaveRoute(fish, primary, state);
''',
    '''function weavePoint(fish, primary, state, activity) {
  const route = weaveRoute(fish, primary, state);
''',
)
replace_once(
    "src/sim/fish-activities.js",
    '''    tuning.legTimeoutSecondsMin,
    tuning.legTimeoutSecondsMax,
''',
    '''    WEAVE_LEG_DIAGNOSTIC_TIMEOUT_SECONDS_MIN,
    WEAVE_LEG_DIAGNOSTIC_TIMEOUT_SECONDS_MAX,
''',
)

replace_once(
    "src/sim/choreography-tuning.js",
    '''    speedAffinity: 0.06,
    // Diagnostic stall thresholds only. Route progression is position-driven;
    // exceeding these values must never skip an unreached physical crossing.
    legTimeoutSecondsMin: 11,
    legTimeoutSecondsMax: 14,
    asymmetryRows: 0.22,
''',
    '''    speedAffinity: 0.06,
    asymmetryRows: 0.22,
''',
)

replace_once(
    "src/dev/choreography-fields.js",
    '''    field("speedAffinity", "Speed · plant affinity", "rows/s added by a plant lover", 0, 0.5, 0.005),
    field("legTimeoutSecondsMin", "Leg timeout · min", "safety seconds before a stuck middle leg may advance", 4, 20, 0.1),
    field("legTimeoutSecondsMax", "Leg timeout · max", "safety seconds before a stuck middle leg may advance", 4, 20, 0.1),
    field("asymmetryRows", "Route asymmetry", "rows of per-fish variation in the route", 0, 1.5, 0.01),
''',
    '''    field("speedAffinity", "Speed · plant affinity", "rows/s added by a plant lover", 0, 0.5, 0.005),
    field("asymmetryRows", "Route asymmetry", "rows of per-fish variation in the route", 0, 1.5, 0.01),
''',
)
replace_once(
    "src/dev/choreography-fields.js",
    '''const SCENE_INTERVAL_PAIRS = Object.freeze([
  Object.freeze(["legTimeoutSecondsMin", "legTimeoutSecondsMax"]),
''',
    '''const SCENE_INTERVAL_PAIRS = Object.freeze([
''',
)
replace_once(
    "tests/choreography-tuning.test.js",
    '''  const cases = [
    ["legTimeoutSecondsMin", "legTimeoutSecondsMax"],
''',
    '''  const cases = [
''',
)

# Add a direct lab contract: no dead timeout slider/tuning keys, but resolved
# weave targets still expose the internal diagnostic threshold as telemetry.
tuning_path = Path("tests/choreography-tuning.test.js")
tuning_text = tuning_path.read_text()
needle = '''test("bubble inspection answers its own standoff tuning", () => {'''
addition = '''test("plant weave timeout remains telemetry rather than a dead lab control", () => {
  const tuning = SCENE_TUNING[ACTIVITIES.plantWeave];
  const fields = new Set(SCENE_FIELDS[ACTIVITIES.plantWeave].map(({ key }) => key));
  assert.equal("legTimeoutSecondsMin" in tuning, false);
  assert.equal("legTimeoutSecondsMax" in tuning, false);
  assert.equal(fields.has("legTimeoutSecondsMin"), false);
  assert.equal(fields.has("legTimeoutSecondsMax"), false);

  const state = createShowcaseState({ scenario: ACTIVITIES.plantWeave });
  const target = showcaseTarget(state, ACTIVITIES.plantWeave);
  assert.ok(Number.isFinite(target?.weaveLegTimeoutSeconds));
  assert.ok(target.weaveLegTimeoutSeconds > 0);
});

'''
if tuning_text.count(needle) != 1:
    raise SystemExit("choreography tuning insertion point missing")
tuning_path.write_text(tuning_text.replace(needle, addition + needle, 1))

# 4. Count a glass invitation by the stable visit record, not by resets of the
# underlying ordinary activity while that invitation is still active.
replace_once(
    "tools/audit-remaining-vocabulary.mjs",
    '''function summary(state, index) {
 const f=state.individuals[index];
 const target=resolveActivityTarget(f,index,state,f.activity,{bubbles:createBubbleWorldRecords(state)});
 const glass=tickVoluntaryGlassVisit(f,index,state,target,0).target;
 return {t:+state.elapsedRealSeconds.toFixed(2),activity:f.activity.current,age:f.activity.ageRealSeconds,
 phase:glass?.glassVisitPhase ?? target?.choreographyPhase, x:f.x,y:f.y,vx:f.vx,vy:f.vy,pitch:f.visual?.pitch,
 targetX:glass?.x,targetY:glass?.y,targetId:f.activity.targetId,
 partner:state.individuals.find(p=>p.seed===f.activity.targetId)?.seed ?? null};
}
''',
    '''function summary(state, index) {
 const f=state.individuals[index];
 const target=resolveActivityTarget(f,index,state,f.activity,{bubbles:createBubbleWorldRecords(state)});
 const glass=tickVoluntaryGlassVisit(f,index,state,target,0).target;
 return {t:+state.elapsedRealSeconds.toFixed(2),activity:f.activity.current,age:f.activity.ageRealSeconds,
 phase:glass?.glassVisitPhase ?? target?.choreographyPhase, x:f.x,y:f.y,vx:f.vx,vy:f.vy,pitch:f.visual?.pitch,
 targetX:glass?.x,targetY:glass?.y,targetId:f.activity.targetId,
 partner:state.individuals.find(p=>p.seed===f.activity.targetId)?.seed ?? null};
}
function glassVisitStarted(fish, previousFish) {
 const visit=fish?.viewerRelationship?.glassVisit;
 if(!visit) return false;
 const previous=previousFish?.viewerRelationship?.glassVisit;
 return !previous || visit.epoch!==previous.epoch || visit.startedAt!==previous.startedAt;
}
''',
)

replace_once(
    "tools/audit-remaining-vocabulary.mjs",
    '''  const f=state.individuals[i], old=previous.individuals[i];
  const name=f.viewerRelationship?.glassVisit ? 'glass-visit' : f.activity.current;
  counts[name]=(counts[name]??0)+dt;
  const oldName=old?.viewerRelationship?.glassVisit ? 'glass-visit' : old?.activity.current;
  if(name!==oldName || f.activity.ageRealSeconds<old.activity.ageRealSeconds){
   episodes[name]=(episodes[name]??0)+1;
   if(wanted.has(name) && !examples[name]) examples[name]={state,index:i};
  }
''',
    '''  const f=state.individuals[i], old=previous.individuals[i];
  const visit=f.viewerRelationship?.glassVisit;
  const oldVisit=old?.viewerRelationship?.glassVisit;
  const name=visit ? 'glass-visit' : f.activity.current;
  counts[name]=(counts[name]??0)+dt;
  const oldName=oldVisit ? 'glass-visit' : old?.activity.current;
  const episodeStarted=visit
   ? glassVisitStarted(f,old)
   : name!==oldName || f.activity.ageRealSeconds<old.activity.ageRealSeconds;
  if(episodeStarted){
   episodes[name]=(episodes[name]??0)+1;
   if(wanted.has(name) && !examples[name]) examples[name]={state,index:i};
  }
''',
)

# 5. Shelter emergence must choose the inward side when its seeded side would
# collapse into a side-wall clamp.
replace_once(
    "src/sim/fish-activities.js",
    '''  const side = Math.sign(base.x - plant.x) || (sample01(pairSeed, 8182) < 0.5 ? -1 : 1);
  const emerge = departureColumns(fish, tuning.emergeColumns);
  return {
    ...boundedPlantPoint(fish, state, base.x + side * emerge, base.y - tuning.emergeRiseRows),
''',
    '''  const seededSide = Math.sign(base.x - plant.x) || (sample01(pairSeed, 8182) < 0.5 ? -1 : 1);
  const emerge = departureColumns(fish, tuning.emergeColumns);
  const halfWidth = spriteHalfWidth(fish);
  const hasEmergenceRoom = (side) => {
    const x = base.x + side * emerge;
    return x >= halfWidth && x <= state.cols - halfWidth;
  };
  const side = hasEmergenceRoom(seededSide) ? seededSide : -seededSide;
  return {
    ...boundedPlantPoint(fish, state, base.x + side * emerge, base.y - tuning.emergeRiseRows),
''',
)

# Import plantTargetPosition into the focused review test and add a wall fixture
# whose seeded shelter side is deliberately placed against the matching wall.
replace_once(
    "tests/phase7-review-regressions.test.js",
    '''  activityUtilities,
  resolveActivityTarget,
  tickFishActivity,
''',
    '''  activityUtilities,
  plantTargetPosition,
  resolveActivityTarget,
  tickFishActivity,
''',
)

review_path = Path("tests/phase7-review-regressions.test.js")
review_text = review_path.read_text()
if "edge shelter emergence turns inward instead of completing at the wall" in review_text:
    raise SystemExit("shelter emergence regression already present")
review_text += r'''

test("edge shelter emergence turns inward instead of completing at the wall", () => {
  const base = createShowcaseState({ scenario: ACTIVITIES.plantShelter });
  const subject = showcaseSubjects(base, ACTIVITIES.plantShelter)[0];
  const sourcePlant = base.plants.find(({ seed }) => seed === subject.fish.activity.targetId);
  assert.ok(sourcePlant, "showcase shelter is missing its plant");

  const centered = { ...sourcePlant, x: base.cols / 2 };
  const centeredPoint = plantTargetPosition(subject.fish, centered, base, { shelter: true });
  const seededSide = Math.sign(centeredPoint.x - centered.x) || 1;
  const halfWidth = fishSpriteWidth(subject.fish) / 2;
  const edgeX = seededSide < 0 ? halfWidth + 0.5 : base.cols - halfWidth - 0.5;
  const edgePlant = { ...sourcePlant, x: edgeX };
  const quietPoint = plantTargetPosition(subject.fish, edgePlant, base, { shelter: true });
  const fish = {
    ...subject.fish,
    x: quietPoint.x,
    y: quietPoint.y,
    behavior: { ...subject.fish.behavior, current: "rest" },
    activity: {
      ...subject.fish.activity,
      current: ACTIVITIES.plantShelter,
      targetId: edgePlant.seed,
      ageRealSeconds: 12,
      plantVisitStage: 2,
      plantVisitStageStartedAt: 10,
    },
  };
  const state = {
    ...base,
    plants: base.plants.map((plant) => plant.seed === edgePlant.seed ? edgePlant : plant),
    individuals: base.individuals.map((entry, index) => index === subject.index ? fish : entry),
  };
  const target = resolveActivityTarget(fish, subject.index, state, fish.activity);
  assert.ok(target);
  assert.equal(target.choreographyPhase, "emerge");
  assert.ok(
    (target.x - quietPoint.x) * seededSide < 0,
    "edge shelter kept its outward departure instead of turning into the tank",
  );
  assert.ok(
    Math.hypot(target.x - fish.x, target.y - fish.y) > target.plantVisitArrivalRadius,
    "edge shelter emergence collapsed inside its completion radius",
  );
});
'''
review_path.write_text(review_text)
