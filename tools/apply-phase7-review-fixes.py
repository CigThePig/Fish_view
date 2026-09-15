from pathlib import Path


def block(lines):
    return "\n".join(lines)


def replace_once(path, label, old_lines, new_lines):
    text = path.read_text()
    old = block(old_lines)
    new = block(new_lines)
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match in {path}, found {count}")
    path.write_text(text.replace(old, new, 1))


activities = Path("src/sim/fish-activities.js")
choreography = Path("src/sim/fish-choreography.js")
tests = Path("tests/phase7-review-regressions.test.js")

replace_once(activities, "secondary weave clearance setup", [
    "  const clearance = weaveClearanceColumns(fish);",
    "  const minimumDistance = clearance * 2 + 0.8;",
    "  const maximumDistance = Math.max(8, state.cols * 0.2);",
    "  const idealDistance = Math.min(maximumDistance, minimumDistance + 2.7);",
], [
    "  const clearance = weaveClearanceColumns(fish);",
    "  const halfWidth = spriteHalfWidth(fish);",
    "  const outwardRoom = clearance + WEAVE_EMERGE_EXTRA_COLUMNS;",
    "  const minimumDistance = clearance * 2 + 0.8;",
    "  const maximumDistance = Math.max(8, state.cols * 0.2);",
    "  const idealDistance = Math.min(maximumDistance, minimumDistance + 2.7);",
])

replace_once(activities, "secondary weave edge filter", [
    "    .filter((candidate) => (",
    "      candidate.distance >= minimumDistance",
    "      && candidate.distance <= maximumDistance",
    "    ))",
], [
    "    .filter((candidate) => {",
    "      if (candidate.distance < minimumDistance || candidate.distance > maximumDistance) return false;",
    "      const travelSide = Math.sign(candidate.plant.x - first.x) || 1;",
    "      const emergeX = candidate.plant.x + travelSide * outwardRoom;",
    "      return emergeX >= halfWidth && emergeX <= state.cols - halfWidth;",
    "    })",
])

replace_once(activities, "fallback weave orientation", [
    "  const clearance = weaveClearanceColumns(fish);",
    "  const verticalSign = sample01(pairSeed, 8161) < 0.5 ? -1 : 1;",
    "  const seededTravel = sample01(pairSeed, 8162) < 0.5 ? -1 : 1;",
    "  const travelSide = secondary",
    "    ? (Math.sign(secondary.x - primary.x) || seededTravel)",
    "    : seededTravel;",
    "  const entrySide = -travelSide;",
], [
    "  const clearance = weaveClearanceColumns(fish);",
    "  const verticalSign = sample01(pairSeed, 8161) < 0.5 ? -1 : 1;",
    "  const seededTravel = sample01(pairSeed, 8162) < 0.5 ? -1 : 1;",
    "  const halfWidth = spriteHalfWidth(fish);",
    "  const emergeDistance = clearance + WEAVE_EMERGE_EXTRA_COLUMNS;",
    "  const hasEmergenceRoom = (plant, side) => {",
    "    const x = plant.x + side * emergeDistance;",
    "    return x >= halfWidth && x <= state.cols - halfWidth;",
    "  };",
    "  const fallbackTravel = hasEmergenceRoom(primary, seededTravel)",
    "    ? seededTravel",
    "    : -seededTravel;",
    "  const travelSide = secondary",
    "    ? (Math.sign(secondary.x - primary.x) || fallbackTravel)",
    "    : fallbackTravel;",
    "  const entrySide = -travelSide;",
])

replace_once(activities, "companion cruise pair ending", [
    "    const mutualCompanion = activity.current === ACTIVITIES.companionCruise",
    "      && companion.activity?.current === ACTIVITIES.companionCruise",
    "      && companion.activity?.targetId === fish.seed;",
    "    if (activity.current === ACTIVITIES.companionCruise",
    "      && activity.ageRealSeconds >= activityDwell(fish, activity.current).maximum - 4) {",
], [
    "    const mutualCompanion = activity.current === ACTIVITIES.companionCruise",
    "      && companion.activity?.current === ACTIVITIES.companionCruise",
    "      && companion.activity?.targetId === fish.seed;",
    "    const ownSeparationReady = activity.current === ACTIVITIES.companionCruise",
    "      && activity.ageRealSeconds >= activityDwell(fish, activity.current).maximum - 4;",
    "    const companionSeparationReady = mutualCompanion",
    "      && Math.max(0, companion.activity?.ageRealSeconds ?? 0)",
    "        >= activityDwell(companion, ACTIVITIES.companionCruise).maximum - 4;",
    "    if (activity.current === ACTIVITIES.companionCruise",
    "      && (ownSeparationReady || companionSeparationReady)) {",
])

replace_once(activities, "plant weave behavior commitment", [
    "  const committedPlantVisit = [ACTIVITIES.plantInvestigate, ACTIVITIES.plantShelter]",
    "    .includes(activity.current);",
], [
    "  const committedPlantVisit = [",
    "    ACTIVITIES.plantInvestigate,",
    "    ACTIVITIES.plantShelter,",
    "    ACTIVITIES.plantWeave,",
    "  ].includes(activity.current);",
])

replace_once(choreography, "staged plant transition steering", [
    "  // The final investigation beat is a deliberate back-away from the specimen,",
    "  // not ordinary roaming. Near the substrate, a graceful 180-degree steering",
    "  // arc can lose its vertical component to body/terrain clearance every frame;",
    "  // the fish then keeps travelling the wrong way until a wall finally turns it.",
    "  // The target already marks this one bounded beat explicitly, so let its motion",
    "  // heading commit to the authored retreat immediately while the existing",
    "  // acceleration and visual turn pose still soften the departure. No other",
    "  // activity, including plant weave and shelter, changes steering semantics.",
    "  const deliberatePlantRetreat = target?.plantTarget === true",
    "    && target?.plantVisitFinal === true",
    "    && target?.choreographyPhase === \"retreat\";",
    "  const turnTarget = turnableDirection(currentDirection, desiredDirection, fish.seed);",
    "  const steeredDirection = deliberatePlantRetreat",
    "    ? desiredDirection",
], [
    "  // A staged plant visit is a short authored sentence: arrive, inspect/settle,",
    "  // then leave. Near the substrate, a graceful 180-degree steering arc can lose",
    "  // its vertical component to body/terrain clearance every frame, so an entry",
    "  // or exit target directly behind the fish can otherwise turn into a tank-wide",
    "  // loop. Commit the simulation heading for the bounded transition beats while",
    "  // the existing acceleration and visual turn pose still soften what is drawn.",
    "  // The local inspect/quiet beats keep ordinary steering, as does plant weave.",
    "  const deliberatePlantVisitTurn = target?.plantTarget === true",
    "    && Number.isInteger(target?.plantVisitStage)",
    "    && [\"approach\", \"enter\", \"retreat\", \"emerge\"].includes(target?.choreographyPhase);",
    "  const turnTarget = turnableDirection(currentDirection, desiredDirection, fish.seed);",
    "  const steeredDirection = deliberatePlantVisitTurn",
    "    ? desiredDirection",
])

text = tests.read_text()
marker = 'test("plant weave remains committed through its authored emergence"'
if marker in text:
    raise SystemExit("review regression tests already present")

tests.write_text(text + r'''

test("plant weave remains committed through its authored emergence", () => {
  const base = createShowcaseState({ scenario: ACTIVITIES.plantWeave });
  const subject = showcaseSubjects(base, ACTIVITIES.plantWeave)[0];
  const fish = {
    ...subject.fish,
    behavior: { ...subject.fish.behavior, current: "social" },
    activity: {
      ...subject.fish.activity,
      current: ACTIVITIES.plantWeave,
      ageRealSeconds: 12,
      weaveStage: 2,
      weaveStageStartedAt: 10,
    },
  };
  const state = {
    ...base,
    individuals: base.individuals.map((entry, index) => index === subject.index ? fish : entry),
  };
  const frame = tickFishActivity(fish, subject.index, state, 0.1);
  assert.equal(frame.activity.current, ACTIVITIES.plantWeave);
});

test("edge secondary plants cannot collapse weave crossing and emergence", () => {
  const base = createShowcaseState({ scenario: ACTIVITIES.plantWeave });
  const subject = showcaseSubjects(base, ACTIVITIES.plantWeave)[0];
  const originalPrimary = base.plants.find(({ seed }) => seed === subject.fish.activity.targetId);
  assert.ok(originalPrimary, "showcase weave is missing its primary plant");
  const primary = { ...originalPrimary, x: base.cols - 10 };
  const edgeSecondary = { ...originalPrimary, seed: originalPrimary.seed + 1000003, x: base.cols - 0.5 };
  const fish = {
    ...subject.fish,
    x: base.cols - 14,
    activity: { ...subject.fish.activity, current: ACTIVITIES.plantWeave, targetId: primary.seed, ageRealSeconds: 10 },
  };
  const state = {
    ...base,
    plants: [primary, edgeSecondary],
    individuals: base.individuals.map((entry, index) => index === subject.index ? fish : entry),
  };
  const cross = resolveActivityTarget(fish, subject.index, state, { ...fish.activity, weaveStage: 3, weaveStageStartedAt: 8 });
  const emerge = resolveActivityTarget(fish, subject.index, state, { ...fish.activity, weaveStage: 4, weaveStageStartedAt: 8 });
  assert.ok(cross && emerge);
  assert.equal(cross.weavePlantSeed, primary.seed, "edge secondary should be rejected");
  assert.equal(emerge.weavePlantSeed, primary.seed, "fallback route should stay coherent");
  assert.ok(Math.abs(emerge.x - cross.x) > 1, "crossing and emergence collapsed to the same body-clamped waypoint");
});

test("mutual companion cruise separates when either partner reaches the pair ending", () => {
  const base = createShowcaseState({ scenario: ACTIVITIES.companionCruise });
  const subject = showcaseSubjects(base, ACTIVITIES.companionCruise)[0];
  const companionIndex = base.individuals.findIndex(({ seed }) => seed === subject.fish.activity.targetId);
  assert.ok(companionIndex >= 0, "showcase companion cruise is missing its partner");
  const companionSource = base.individuals[companionIndex];
  const fish = {
    ...subject.fish,
    activity: { ...subject.fish.activity, current: ACTIVITIES.companionCruise, targetId: companionSource.seed, ageRealSeconds: 0.5 },
  };
  const companion = {
    ...companionSource,
    activity: { ...companionSource.activity, current: ACTIVITIES.companionCruise, targetId: fish.seed, ageRealSeconds: 100 },
  };
  const state = {
    ...base,
    individuals: base.individuals.map((entry, index) => index === subject.index ? fish : index === companionIndex ? companion : entry),
  };
  const target = resolveActivityTarget(fish, subject.index, state, fish.activity);
  assert.ok(target);
  assert.equal(target.choreographyPhase, "separate");
});

test("staged plant entry commits its heading through a constrained reversal", () => {
  const base = createShowcaseState({ scenario: ACTIVITIES.plantInvestigate });
  const subject = showcaseSubjects(base, ACTIVITIES.plantInvestigate)[0];
  const fish = { ...subject.fish, x: 24, y: 20, vx: 0.6, vy: 0 };
  const target = {
    x: 18,
    y: 20,
    speed: 0.55,
    postureBias: 0,
    plantTarget: true,
    plantVisitStage: 0,
    plantVisitFinal: false,
    choreographyPhase: "enter",
  };
  const steered = steerActivityVelocity(fish, target, { realDelta: 0.1 });
  assert.ok(steered.vx < 0, "plant entry kept swimming away during the reversal");
});
''')
