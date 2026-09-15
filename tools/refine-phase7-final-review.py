from pathlib import Path


def replace_once(path, old, new):
    file = Path(path)
    text = file.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one match, found {count}\n--- needle ---\n{old}")
    file.write_text(text.replace(old, new, 1))


# The first repair attempt forced a full school-follow bout after every
# individual-follow episode. That made the exit visible, but it also perturbed
# the production social scheduler enough to suppress a chase scenario in the
# interaction harness. Preserve selection semantics and author the visible exit
# where it belongs: at the tail of individual-follow itself.
replace_once(
    "src/sim/fish-activities.js",
    '    // One school-follow bout after company gives social sentences a visible\n'
    '    // punctuation instead of immediately renewing the same formation or\n'
    '    // trailing the same partner. Individual follow needs this too: resetting\n'
    '    // its dwell clock while keeping the same leader is visually no exit at all.\n'
    '    if ([ACTIVITIES.companionCruise, ACTIVITIES.individualFollow]\n'
    '      .includes(fish.activity?.current)) return choices;\n',
    '    // One school-follow bout after companion cruise gives the pair a gentle\n'
    '    // separation instead of immediately renewing the same formation.\n'
    '    if (fish.activity?.current === ACTIVITIES.companionCruise) return choices;\n',
)

replace_once(
    "src/sim/fish-activities.js",
    'const WEAVE_ROUTE_FAILURE_SECONDS = 120;\n',
    'const WEAVE_ROUTE_FAILURE_SECONDS = 120;\n'
    '// The follower spends the tail of its own dwell visibly leaving its rear\n'
    '// slot. Selection remains unchanged afterward, so social/chase frequency is\n'
    '// not distorted merely to make the sentence legible.\n'
    'const INDIVIDUAL_FOLLOW_PEEL_SECONDS = 3.2;\n',
)

replace_once(
    "src/sim/fish-activities.js",
    '    const point = companionOffset(fish, companion, activity.current, state);\n'
    '    const tuning = sceneTuning(state, activity.current);\n',
    '    const tuning = sceneTuning(state, activity.current);\n'
    '    if (activity.current === ACTIVITIES.individualFollow\n'
    '      && activity.ageRealSeconds >= activityDwell(fish, activity.current).maximum\n'
    '        - INDIVIDUAL_FOLLOW_PEEL_SECONDS) {\n'
    '      // Finish the sentence before the dwell boundary. Generate several\n'
    '      // short bounded exits and choose the one that actually opens the most\n'
    '      // space from the leader. This stays readable even when the obvious\n'
    '      // away vector points into a wall or the protected depth envelope.\n'
    '      const away = safeNormalize(\n'
    '        fish.x - companion.x,\n'
    '        fish.y - companion.y,\n'
    '        fish.seed < companion.seed ? -1 : 1,\n'
    '        0,\n'
    '      );\n'
    '      const tangent = { x: -away.y, y: away.x };\n'
    '      const candidates = [\n'
    '        boundedPlantPoint(fish, state, fish.x + away.x * 3.6, fish.y + away.y * 2.8),\n'
    '        boundedPlantPoint(\n'
    '          fish, state,\n'
    '          fish.x + away.x * 1.5 + tangent.x * 3.2,\n'
    '          fish.y + away.y * 1.2 + tangent.y * 2.5,\n'
    '        ),\n'
    '        boundedPlantPoint(\n'
    '          fish, state,\n'
    '          fish.x + away.x * 1.5 - tangent.x * 3.2,\n'
    '          fish.y + away.y * 1.2 - tangent.y * 2.5,\n'
    '        ),\n'
    '      ];\n'
    '      const currentGap = Math.hypot(fish.x - companion.x, fish.y - companion.y);\n'
    '      const departure = candidates.reduce((best, candidate) => {\n'
    '        const gap = Math.hypot(candidate.x - companion.x, candidate.y - companion.y);\n'
    '        return gap > best.gap ? { point: candidate, gap } : best;\n'
    '      }, { point: { x: fish.x, y: fish.y }, gap: currentGap }).point;\n'
    '      return choreographed(state, activity.current, {\n'
    '        ...departure,\n'
    '        speed: tuning.speedBase + traits.sociability * tuning.speedSociability * 0.55,\n'
    '        postureBias: 0,\n'
    '        companionTarget: true,\n'
    '        choreographyPhase: "peel-away",\n'
    '      });\n'
    '    }\n'
    '    const point = companionOffset(fish, companion, activity.current, state);\n',
)

# The timeout sliders are retained as stall diagnostics in targets/labs; they no
# longer authorize progression.
replace_once(
    "src/sim/choreography-tuning.js",
    '    // These are safety escapes only. Normal leg changes are position-driven.\n'
    '    legTimeoutSecondsMin: 11,\n'
    '    legTimeoutSecondsMax: 14,\n',
    '    // Diagnostic stall thresholds only. Route progression is position-driven;\n'
    '    // exceeding these values must never skip an unreached physical crossing.\n'
    '    legTimeoutSecondsMin: 11,\n'
    '    legTimeoutSecondsMax: 14,\n',
)

# Replace the first attempt's regression with one that verifies the authored
# peel itself rather than imposing a different activity afterward.
replace_once(
    "tests/phase7-review-regressions.test.js",
    '''test("individual follow visibly exits before the same social sentence can restart", () => {
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
''',
    '''test("individual follow has a visible peel-away before its dwell boundary", () => {
  const base = createShowcaseState({ scenario: ACTIVITIES.individualFollow });
  const subject = showcaseSubjects(base, ACTIVITIES.individualFollow)[0];
  const fish = {
    ...subject.fish,
    behavior: { ...subject.fish.behavior, current: "social" },
    activity: {
      ...subject.fish.activity,
      current: ACTIVITIES.individualFollow,
      ageRealSeconds: 23,
    },
  };
  const state = {
    ...base,
    individuals: base.individuals.map((entry, index) => index === subject.index ? fish : entry),
  };
  const target = resolveActivityTarget(fish, subject.index, state, fish.activity);
  assert.ok(target);
  assert.equal(target.choreographyPhase, "peel-away");
  const companion = state.individuals.find((entry) => entry.seed === fish.activity.targetId);
  assert.ok(companion);
  const currentGap = Math.hypot(fish.x - companion.x, fish.y - companion.y);
  const targetGap = Math.hypot(target.x - companion.x, target.y - companion.y);
  assert.ok(targetGap > currentGap, "peel-away target did not open space from the leader");
});
''',
)

print("Refined individual-follow into an authored peel-away without changing social selection")
