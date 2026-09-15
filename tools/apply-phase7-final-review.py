from pathlib import Path


def replace_once(path, old, new):
    file = Path(path)
    text = file.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one match, found {count}\n--- needle ---\n{old}")
    file.write_text(text.replace(old, new, 1))


# 1-3: Plant weave is a physical route. Keep it on fish that can reach the
# full route, never use a timer as proof of crossing, and give only pathological
# whole-route stalls a separate escape deadline.
replace_once(
    "src/sim/fish-activities.js",
    'const WEAVE_EMERGE_EXTRA_COLUMNS = 1.65;\n',
    'const WEAVE_EMERGE_EXTRA_COLUMNS = 1.65;\n'
    '// A valid weave is allowed to outlive its ordinary activity dwell while it\n'
    '// physically finishes the route. This is only a pathological-stall escape:\n'
    '// ordinary completion is still the final reached emergence waypoint.\n'
    'const WEAVE_ROUTE_FAILURE_SECONDS = 120;\n',
)

replace_once(
    "src/sim/fish-activities.js",
    '      if (secondWeavePlant(fish, plant.plant, state)) {\n',
    '      // Slots 0-2 are the permanent mid-water cast and are physically\n'
    '      // constrained to a shallower envelope by tickIndividual(). A plant\n'
    '      // route authored against the full substrate envelope can therefore\n'
    '      // contain unreachable waypoints for them, so they do not enter weave.\n'
    '      if (index >= 3 && secondWeavePlant(fish, plant.plant, state)) {\n',
)

replace_once(
    "src/sim/fish-activities.js",
    '    if (activity.current === ACTIVITIES.plantWeave) {\n'
    '      const tuning = sceneTuning(state, ACTIVITIES.plantWeave);\n',
    '    if (activity.current === ACTIVITIES.plantWeave) {\n'
    '      // Repair stale/dev states too: the permanent mid-water cast cannot\n'
    '      // physically reach every route generated in the full plant envelope.\n'
    '      if (index < 3) return null;\n'
    '      const tuning = sceneTuning(state, ACTIVITIES.plantWeave);\n',
)

replace_once(
    "src/sim/fish-activities.js",
    '  // Timeout is only a bounded escape hatch for intermediate legs. Entry and\n'
    '  // emergence must be physically reached; otherwise the route could still\n'
    '  // begin or end because a clock advanced, which is the Phase 7.4 defect.\n'
    '  const safetyAdvance = point.stage > 0\n'
    '    && point.stage < WEAVE_ROUTE_LAST_STAGE\n'
    '    && stageAge >= point.timeoutSeconds;\n'
    '  if ((arrived || safetyAdvance) && point.stage < WEAVE_ROUTE_LAST_STAGE) {\n',
    '  // A route cursor moves only when the body reaches the authored waypoint.\n'
    '  // The per-leg timeout remains telemetry for diagnosing slow geometry, but\n'
    '  // it must never erase a physical crossing by silently selecting the next\n'
    '  // target. A separate whole-route deadline below handles pathological stalls.\n'
    '  if (arrived && point.stage < WEAVE_ROUTE_LAST_STAGE) {\n',
)

# stageAge remains intentionally computed for the timeout telemetry carried by
# weavePoint/targets, but no longer authorizes cursor progression. Remove the now
# unused local to keep lint/readability clean.
replace_once(
    "src/sim/fish-activities.js",
    '  const stageAge = Math.max(0, activity.ageRealSeconds - activity.weaveStageStartedAt);\n'
    '  const arrived = distance <= point.arrivalRadius;\n',
    '  const arrived = distance <= point.arrivalRadius;\n',
)

replace_once(
    "src/sim/fish-activities.js",
    '  const activitySafetyMaximum = activity.current === ACTIVITIES.plantInvestigate\n'
    '    ? Math.max(dwell.maximum, 42)\n'
    '    : activity.current === ACTIVITIES.plantShelter\n'
    '      ? Math.max(dwell.maximum, 52)\n'
    '      : activity.current === ACTIVITIES.surfaceInvestigate ? 35 : dwell.maximum;\n',
    '  const activitySafetyMaximum = activity.current === ACTIVITIES.plantInvestigate\n'
    '    ? Math.max(dwell.maximum, 42)\n'
    '    : activity.current === ACTIVITIES.plantShelter\n'
    '      ? Math.max(dwell.maximum, 52)\n'
    '      : activity.current === ACTIVITIES.plantWeave\n'
    '        ? WEAVE_ROUTE_FAILURE_SECONDS\n'
    '        : activity.current === ACTIVITIES.surfaceInvestigate ? 35 : dwell.maximum;\n',
)

# 5: individual follow must visibly end instead of selecting itself and the same
# companion again on the very next frame.
replace_once(
    "src/sim/fish-activities.js",
    '    // One school-follow bout after company gives the pair a gentle separation\n'
    '    // instead of immediately renewing the same formation or trailing partner.\n'
    '    if (fish.activity?.current === ACTIVITIES.companionCruise) return choices;\n',
    '    // One school-follow bout after company gives social sentences a visible\n'
    '    // punctuation instead of immediately renewing the same formation or\n'
    '    // trailing the same partner. Individual follow needs this too: resetting\n'
    '    // its dwell clock while keeping the same leader is visually no exit at all.\n'
    '    if ([ACTIVITIES.companionCruise, ACTIVITIES.individualFollow]\n'
    '      .includes(fish.activity?.current)) return choices;\n',
)

# 4: retain calm low-energy visits, but do not let a fish at the floor of its
# energy range start a 26-45s invitation just because the behavior lock still
# says cruise/social.
replace_once(
    "src/sim/glass-visits.js",
    'import { WATERLINE_ROWS } from "./config.js";\n',
    'import { DRIVE_MINIMUM, WATERLINE_ROWS } from "./config.js";\n',
)
replace_once(
    "src/sim/glass-visits.js",
    'export const GLASS_VISIT_MAX_SATURATION = 0.58;\n',
    'export const GLASS_VISIT_MAX_SATURATION = 0.58;\n'
    '// Mature fish can normally cruise around 0.27 energy, so this guard sits\n'
    '// well below that band. It catches genuine exhaustion near the drive floor\n'
    '// without resurrecting the old 0.3 cutoff that excluded healthy visitors.\n'
    'export const GLASS_VISIT_MIN_ENERGY = DRIVE_MINIMUM + 0.06;\n',
)
replace_once(
    "src/sim/glass-visits.js",
    '  if (profile.familiarity < GLASS_VISIT_MIN_FAMILIARITY) return null;\n'
    '  if (viewerSaturationFor(fish, nowSeconds) > GLASS_VISIT_MAX_SATURATION) return null;\n'
    '  if (!biologicallyAvailable(fish) || fish.attention) return null;\n',
    '  if (profile.familiarity < GLASS_VISIT_MIN_FAMILIARITY) return null;\n'
    '  if (viewerSaturationFor(fish, nowSeconds) > GLASS_VISIT_MAX_SATURATION) return null;\n'
    '  const energy = Number.isFinite(fish.drives?.energy) ? fish.drives.energy : DRIVE_MINIMUM;\n'
    '  if (energy < GLASS_VISIT_MIN_ENERGY) return null;\n'
    '  if (!biologicallyAvailable(fish) || fish.attention) return null;\n',
)
replace_once(
    "src/sim/glass-visits.js",
    '  // Energy follows the same rule: a mature fish can balance near 0.27 while\n'
    '  // freely choosing school-follow between rests. A second 0.3 cutoff would\n'
    '  // exclude it forever. Actual rest/shelter still blocks and cancels visits.\n',
    '  // Energy mostly follows the same rule: a mature fish can balance near 0.27\n'
    '  // while freely choosing school-follow between rests. The small exhaustion\n'
    '  // floor above exists only because behavior changes are real-time locked; it\n'
    '  // prevents a fish already at minimum energy from spending that lock on a\n'
    '  // new invitation. Actual rest/shelter still blocks and cancels visits.\n',
)

# 6: after Phase 7, keep the machine-readable freeze and natural production
# observation alive on later branches without rerunning the expensive captures.
replace_once(
    ".github/workflows/verify.yml",
    '      - run: npm run measure:readability\n'
    '      - run: npm run capture:relationship -- --scale=0.25 --output=.audit-output/relationship-captures\n',
    '      - run: npm run measure:readability\n'
    '      - name: Guard frozen Phase 7 vocabulary after Phase 7\n'
    "        if: ${{ !startsWith(github.ref_name, 'phase-7') && !startsWith(github.head_ref, 'phase-7') }}\n"
    '        run: npm run audit:phase7-vocabulary -- --output=.audit-output/phase7-frozen-audit\n'
    '      - name: Observe frozen vocabulary on production path after Phase 7\n'
    "        if: ${{ !startsWith(github.ref_name, 'phase-7') && !startsWith(github.head_ref, 'phase-7') }}\n"
    '        run: npm run measure:remaining-vocabulary -- --seconds=1800 --output=.audit-output/phase7-frozen-natural\n'
    '      - run: npm run capture:relationship -- --scale=0.25 --output=.audit-output/relationship-captures\n',
)

# Regression coverage for the four production contracts above.
replace_once(
    "tests/phase7-review-regressions.test.js",
    '  ACTIVITIES,\n'
    '  resolveActivityTarget,\n'
    '  tickFishActivity,\n',
    '  ACTIVITIES,\n'
    '  activityUtilities,\n'
    '  resolveActivityTarget,\n'
    '  tickFishActivity,\n',
)

review_tests = r'''

test("permanent mid-water fish cannot start or continue plant weave", () => {
  const base = createShowcaseState({ scenario: ACTIVITIES.plantWeave });
  const weaveSubject = showcaseSubjects(base, ACTIVITIES.plantWeave)[0];
  const source = base.individuals[0];
  const fish = {
    ...source,
    behavior: { ...source.behavior, current: "explore" },
    activity: {
      ...source.activity,
      current: ACTIVITIES.wander,
      previous: ACTIVITIES.cruise,
      ageRealSeconds: 2,
    },
  };
  const state = {
    ...base,
    individuals: base.individuals.map((entry, index) => index === 0 ? fish : entry),
  };
  const utilities = activityUtilities(fish, 0, state);
  assert.equal(utilities[ACTIVITIES.plantWeave], undefined);

  const stale = {
    ...fish,
    activity: {
      ...fish.activity,
      current: ACTIVITIES.plantWeave,
      targetType: "plant",
      targetId: weaveSubject.fish.activity.targetId,
      ageRealSeconds: 12,
      weaveStage: 0,
      weaveStageStartedAt: 0,
    },
  };
  assert.equal(resolveActivityTarget(stale, 0, state, stale.activity), null);
});

test("plant weave timeout cannot skip an unreached intermediate crossing", () => {
  const base = createShowcaseState({ scenario: ACTIVITIES.plantWeave });
  const subject = showcaseSubjects(base, ACTIVITIES.plantWeave)[0];
  const probeActivity = {
    ...subject.fish.activity,
    current: ACTIVITIES.plantWeave,
    ageRealSeconds: 10,
    weaveStage: 1,
    weaveStageStartedAt: 0,
  };
  const probe = resolveActivityTarget(subject.fish, subject.index, base, probeActivity);
  assert.ok(probe);
  const halfWidth = fishSpriteWidth(subject.fish) / 2;
  const farX = probe.x < base.cols / 2 ? base.cols - halfWidth : halfWidth;
  const fish = {
    ...subject.fish,
    x: farX,
    y: probe.y,
    behavior: { ...subject.fish.behavior, current: "explore" },
    activity: {
      ...probeActivity,
      ageRealSeconds: probe.weaveLegTimeoutSeconds + 1,
      weaveStageStartedAt: 0,
    },
  };
  const state = {
    ...base,
    individuals: base.individuals.map((entry, index) => index === subject.index ? fish : entry),
  };
  const frame = tickFishActivity(fish, subject.index, state, 0.1);
  assert.equal(frame.activity.current, ACTIVITIES.plantWeave);
  assert.equal(frame.activity.weaveStage, 1, "timer skipped a physical crossing");
});

test("valid plant weave survives the ordinary dwell ceiling until emergence", () => {
  const base = createShowcaseState({ scenario: ACTIVITIES.plantWeave });
  const subject = showcaseSubjects(base, ACTIVITIES.plantWeave)[0];
  const activity = {
    ...subject.fish.activity,
    current: ACTIVITIES.plantWeave,
    ageRealSeconds: 80,
    weaveStage: 3,
    weaveStageStartedAt: 79,
  };
  const target = resolveActivityTarget(subject.fish, subject.index, base, activity);
  assert.ok(target);
  const halfWidth = fishSpriteWidth(subject.fish) / 2;
  const fish = {
    ...subject.fish,
    x: target.x < base.cols / 2 ? base.cols - halfWidth : halfWidth,
    y: target.y,
    behavior: { ...subject.fish.behavior, current: "explore" },
    activity,
  };
  const state = {
    ...base,
    individuals: base.individuals.map((entry, index) => index === subject.index ? fish : entry),
  };
  const frame = tickFishActivity(fish, subject.index, state, 0.1);
  assert.equal(frame.activity.current, ACTIVITIES.plantWeave);
});

test("individual follow visibly exits before the same social sentence can restart", () => {
  const base = createShowcaseState({ scenario: ACTIVITIES.individualFollow });
  const subject = showcaseSubjects(base, ACTIVITIES.individualFollow)[0];
  const fish = {
    ...subject.fish,
    behavior: { ...subject.fish.behavior, current: "social" },
    activity: {
      ...subject.fish.activity,
      current: ACTIVITIES.individualFollow,
      ageRealSeconds: 100,
    },
  };
  const state = {
    ...base,
    individuals: base.individuals.map((entry, index) => index === subject.index ? fish : entry),
  };
  const frame = tickFishActivity(fish, subject.index, state, 0.1);
  assert.equal(frame.activity.current, ACTIVITIES.schoolFollow);
});
'''

review_path = Path("tests/phase7-review-regressions.test.js")
review_text = review_path.read_text()
if 'permanent mid-water fish cannot start or continue plant weave' in review_text:
    raise SystemExit("review regression tests already present")
review_path.write_text(review_text + review_tests)

glass_tests = r'''

test("exhausted calm fish cannot start a glass visit while the behavior lock masks rest", () => {
  const initial = readyState(1);
  const state = {
    ...initial,
    individuals: initial.individuals.map((fish) => ({
      ...fish,
      drives: { ...fish.drives, energy: 0.15 },
      behavior: { ...fish.behavior, current: "cruise", ageSeconds: 0, ageRealSeconds: 0 },
      activity: { ...fish.activity, current: "cruise" },
    })),
  };
  assert.equal(findStartedVisit(state), null);
});
'''

glass_path = Path("tests/phase6-glass-visits.test.js")
glass_text = glass_path.read_text()
if 'exhausted calm fish cannot start a glass visit' in glass_text:
    raise SystemExit("glass regression test already present")
glass_path.write_text(glass_text + glass_tests)

replace_once(
    "tests/phase7-vocabulary-freeze.test.js",
    'import assert from "node:assert/strict";\n'
    'import test from "node:test";\n',
    'import assert from "node:assert/strict";\n'
    'import { readFileSync } from "node:fs";\n'
    'import test from "node:test";\n',
)

freeze_path = Path("tests/phase7-vocabulary-freeze.test.js")
freeze_text = freeze_path.read_text()
freeze_test = r'''

test("later branches rerun the frozen Phase 7 machine and production-path gates", () => {
  const workflow = readFileSync(new URL("../.github/workflows/verify.yml", import.meta.url), "utf8");
  assert.match(workflow, /Guard frozen Phase 7 vocabulary after Phase 7/);
  assert.match(workflow, /npm run audit:phase7-vocabulary/);
  assert.match(workflow, /Observe frozen vocabulary on production path after Phase 7/);
  assert.match(workflow, /npm run measure:remaining-vocabulary/);
  assert.match(workflow, /!startsWith\(github\.ref_name, 'phase-7'\)/);
});
'''
if 'later branches rerun the frozen Phase 7 machine' in freeze_text:
    raise SystemExit("workflow regression test already present")
freeze_path.write_text(freeze_text + freeze_test)

print("Applied six Phase 7 review fixes and regressions")
