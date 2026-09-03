/*
 * Every number that decides how an intention *feels* - how hard a fish
 * accelerates, how far it stands off its target, how far its nose rotates down
 * to feed - used to be a literal spread through fish-choreography.js,
 * fish-activities.js, and fish-motion.js. Tuning one meant editing source,
 * reloading, and guessing. They live here instead, in two tables:
 *
 *   STEERING_PROFILES  how the steering controller answers a target, keyed by
 *                      activity and by "activity:phase" for the short-lived
 *                      variants an activity switches into (a chase breaking
 *                      off, a forager grazing rather than descending).
 *   SCENE_TUNING       the distances, speeds, and rotations that shape the
 *                      target itself, keyed by activity.
 *
 * The behaviour choreography lab reads both tables to build its sliders and
 * writes an override map onto the state it is ticking, so a tuning pass changes
 * the running aquarium immediately and prints the values back out as source.
 * Overrides travel on state rather than in a module-level register: the
 * simulation stays a pure function of the state handed to it, and a lab session
 * cannot leak tuning into the aquarium the way a shared mutable table would.
 */

const EMPTY = Object.freeze({});

// The steering controller's own answer, before any activity says otherwise.
export const DEFAULT_STEERING_PROFILE = Object.freeze({
  accelerationResponse: 1.45,
  turningResponse: 1.5,
  verticalSpeedScale: 0.72,
  minimumSpeed: 0.055,
  maximumSpeed: 0.82,
  approachRadius: 0,
  arrivalSpeedScale: 1,
  positionGain: 1,
  velocityMatch: 0,
  pitchScale: 1,
  pitchResponse: 3.6,
  turnDuration: 0.68,
});

export const STEERING_PROFILES = Object.freeze({
  cruise: Object.freeze({
    accelerationResponse: 1.2,
    turningResponse: 1.12,
    verticalSpeedScale: 0.58,
    maximumSpeed: 0.7,
    pitchScale: 0.45,
    pitchResponse: 3,
    turnDuration: 0.78,
  }),
  "open-water-wander": Object.freeze({
    accelerationResponse: 1.35,
    turningResponse: 1.45,
    verticalSpeedScale: 0.78,
    maximumSpeed: 0.74,
    approachRadius: 1.2,
    arrivalSpeedScale: 0.45,
    pitchScale: 0.68,
  }),
  "plant-investigate": Object.freeze({
    accelerationResponse: 1.25,
    turningResponse: 1.9,
    verticalSpeedScale: 0.96,
    minimumSpeed: 0.028,
    maximumSpeed: 0.52,
    approachRadius: 1.8,
    arrivalSpeedScale: 0.24,
    positionGain: 0.78,
    pitchScale: 0.72,
    turnDuration: 0.52,
  }),
  // Close enough to read the plant: the fish trades reach for control.
  "plant-investigate:inspect": Object.freeze({
    approachRadius: 0.72,
    arrivalSpeedScale: 0.42,
    accelerationResponse: 1.55,
    turningResponse: 2.25,
  }),
  "plant-weave": Object.freeze({
    accelerationResponse: 2.05,
    turningResponse: 2.35,
    verticalSpeedScale: 1.12,
    minimumSpeed: 0.07,
    maximumSpeed: 0.76,
    approachRadius: 0.9,
    arrivalSpeedScale: 0.72,
    pitchResponse: 4.4,
    turnDuration: 0.48,
  }),
  "bubble-investigate": Object.freeze({
    accelerationResponse: 2.75,
    turningResponse: 3.15,
    verticalSpeedScale: 1.38,
    minimumSpeed: 0.075,
    maximumSpeed: 1,
    approachRadius: 2.1,
    arrivalSpeedScale: 0.32,
    positionGain: 0.92,
    pitchResponse: 5.2,
    turnDuration: 0.4,
  }),
  "bubble-investigate:inspect": Object.freeze({
    accelerationResponse: 1.9,
    turningResponse: 2.55,
    verticalSpeedScale: 1.12,
    minimumSpeed: 0.045,
    maximumSpeed: 0.62,
    approachRadius: 0.9,
    arrivalSpeedScale: 0.38,
  }),
  // The bubble is gone. The fish hunts the spot it burst at, slowly.
  "bubble-investigate:pop": Object.freeze({
    accelerationResponse: 0.8,
    turningResponse: 1.15,
    verticalSpeedScale: 0.72,
    minimumSpeed: 0.018,
    maximumSpeed: 0.3,
    approachRadius: 0.8,
    arrivalSpeedScale: 0.12,
    pitchResponse: 3.4,
    turnDuration: 0.72,
  }),
  "surface-investigate": Object.freeze({
    accelerationResponse: 2.1,
    turningResponse: 2.2,
    verticalSpeedScale: 1.42,
    minimumSpeed: 0.035,
    maximumSpeed: 0.78,
    approachRadius: 1.4,
    arrivalSpeedScale: 0.22,
    pitchResponse: 4.8,
    turnDuration: 0.5,
  }),
  "surface-investigate:probe": Object.freeze({
    accelerationResponse: 1.2,
    turningResponse: 1.35,
    verticalSpeedScale: 1.08,
    maximumSpeed: 0.38,
    approachRadius: 0.75,
    arrivalSpeedScale: 0.34,
  }),
  "school-follow": Object.freeze({
    accelerationResponse: 1.25,
    turningResponse: 1.5,
    verticalSpeedScale: 0.72,
    minimumSpeed: 0.04,
    maximumSpeed: 0.68,
    approachRadius: 2.6,
    arrivalSpeedScale: 0.12,
    positionGain: 0.58,
    velocityMatch: 0.72,
    pitchScale: 0.55,
    turnDuration: 0.7,
  }),
  "individual-follow": Object.freeze({
    accelerationResponse: 1.4,
    turningResponse: 1.72,
    verticalSpeedScale: 0.7,
    minimumSpeed: 0.035,
    maximumSpeed: 0.68,
    approachRadius: 2.4,
    arrivalSpeedScale: 0.1,
    positionGain: 0.66,
    velocityMatch: 0.82,
    pitchScale: 0.42,
    turnDuration: 0.62,
  }),
  "companion-cruise": Object.freeze({
    accelerationResponse: 0.92,
    turningResponse: 1.1,
    verticalSpeedScale: 0.56,
    minimumSpeed: 0.025,
    maximumSpeed: 0.56,
    approachRadius: 1.1,
    arrivalSpeedScale: 0.32,
    positionGain: 0.62,
    velocityMatch: 0.94,
    pitchScale: 0.35,
    pitchResponse: 2.7,
    turnDuration: 0.88,
  }),
  // Both fish have chosen each other. They hold formation instead of correcting
  // towards one another.
  "companion-cruise:mutual": Object.freeze({
    velocityMatch: 0.97,
    accelerationResponse: 0.82,
    turningResponse: 1,
  }),
  "playful-chase": Object.freeze({
    accelerationResponse: 3.25,
    turningResponse: 3.65,
    verticalSpeedScale: 1.18,
    minimumSpeed: 0.16,
    maximumSpeed: 1.04,
    approachRadius: 0.8,
    arrivalSpeedScale: 0.9,
    positionGain: 1.1,
    pitchResponse: 5.4,
    turnDuration: 0.34,
  }),
  // The chaser has arrived and gives up. The glide away is what opens the gap
  // again, so it is deliberately nothing like the pursuit.
  "playful-chase:break": Object.freeze({
    accelerationResponse: 0.85,
    turningResponse: 0.9,
    verticalSpeedScale: 0.62,
    minimumSpeed: 0.045,
    maximumSpeed: 0.42,
    approachRadius: 0,
    arrivalSpeedScale: 1,
    pitchResponse: 2.8,
    turnDuration: 0.78,
  }),
  "substrate-search": Object.freeze({
    accelerationResponse: 2.05,
    turningResponse: 1.8,
    verticalSpeedScale: 1.4,
    minimumSpeed: 0.035,
    maximumSpeed: 0.76,
    approachRadius: 1,
    arrivalSpeedScale: 0.5,
    pitchResponse: 4.7,
    turnDuration: 0.56,
  }),
  // Working the substrate rather than dropping to it: a creep, not a descent.
  "substrate-search:graze": Object.freeze({
    accelerationResponse: 1.55,
    turningResponse: 1.5,
    verticalSpeedScale: 1.05,
    minimumSpeed: 0.025,
    maximumSpeed: 0.34,
    approachRadius: 0.65,
    arrivalSpeedScale: 0.42,
    pitchResponse: 5,
    // A feeding fish holds its feeding posture. Inheriting the controller
    // default let the climb angle answer at full strength, so the drift back up
    // after each strike cancelled most of the authored lean and the fish spent
    // a twentieth of its grazing drawn at eighteen degrees rather than
    // twenty-six - nose off the sand its graze line had been computed for.
    pitchScale: 0.2,
  }),
  "open-water-rest": Object.freeze({
    accelerationResponse: 0.46,
    turningResponse: 0.52,
    verticalSpeedScale: 0.26,
    minimumSpeed: 0.012,
    maximumSpeed: 0.22,
    approachRadius: 2.8,
    arrivalSpeedScale: 0.08,
    positionGain: 0.38,
    pitchScale: 0.2,
    pitchResponse: 1.8,
    turnDuration: 1.2,
  }),
  // Still travelling to the resting spot, which is a slow swim rather than the
  // hover the profile above describes.
  "open-water-rest:settle": Object.freeze({
    accelerationResponse: 0.95,
    turningResponse: 0.9,
    verticalSpeedScale: 0.62,
    maximumSpeed: 0.38,
    approachRadius: 1.2,
    arrivalSpeedScale: 0.24,
  }),
  "plant-shelter": Object.freeze({
    accelerationResponse: 0.5,
    turningResponse: 0.62,
    verticalSpeedScale: 0.32,
    minimumSpeed: 0.01,
    maximumSpeed: 0.24,
    approachRadius: 2.3,
    arrivalSpeedScale: 0.08,
    positionGain: 0.4,
    pitchScale: 0.25,
    pitchResponse: 1.9,
    turnDuration: 1.08,
  }),
  "plant-shelter:settle": Object.freeze({
    accelerationResponse: 1,
    turningResponse: 1.05,
    maximumSpeed: 0.38,
    verticalSpeedScale: 0.64,
  }),
  "touch-react": Object.freeze({
    accelerationResponse: 2.25,
    turningResponse: 2.5,
    verticalSpeedScale: 0.9,
    minimumSpeed: 0.08,
    maximumSpeed: 0.92,
    approachRadius: 1.2,
    arrivalSpeedScale: 0.35,
    pitchResponse: 4.4,
    turnDuration: 0.45,
  }),
  "arrival-enter": Object.freeze({
    accelerationResponse: 1.65,
    turningResponse: 1.5,
    verticalSpeedScale: 0.75,
    minimumSpeed: 0.08,
    maximumSpeed: 0.72,
    approachRadius: 1.3,
    arrivalSpeedScale: 0.4,
  }),
});

// Distances in rows or columns, speeds in rows per second, rotations in
// degrees. Trait and affinity gains keep their own entries so the spread across
// a school stays tunable separately from the value every fish starts at.
export const SCENE_TUNING = Object.freeze({
  cruise: Object.freeze({
    speedBase: 0.2,
    speedActivity: 0.32,
    depthWaveRows: 0.8,
  }),
  "open-water-wander": Object.freeze({
    speedBase: 0.27,
    speedCuriosity: 0.24,
    speedAffinity: 0.08,
  }),
  "plant-investigate": Object.freeze({
    approachSpeed: 0.26,
    approachCuriosity: 0.18,
    inspectSpeed: 0.12,
    inspectCuriosity: 0.08,
    inspectAffinity: 0.035,
    headSweepColumns: 0.34,
    hoverRows: 0.2,
    stationSeconds: 2.35,
  }),
  "plant-weave": Object.freeze({
    speedBase: 0.4,
    speedActivity: 0.15,
    speedAffinity: 0.04,
    stageSecondsMin: 2.55,
    stageSecondsMax: 3.05,
    asymmetryRows: 0.18,
  }),
  "bubble-investigate": Object.freeze({
    acquireSpeed: 0.5,
    pursueSpeed: 0.63,
    inspectSpeed: 0.16,
    standoffRows: 0.58,
    // Close inspection already used a tighter 0.48-row distance. Naming it
    // separately preserves that motion while making the inspect phase tunable.
    inspectStandoffRows: 0.48,
    lookAheadSeconds: 0.58,
    acquirePitchDegrees: -4,
    inspectPitchDegrees: -2,
    pursuePitchDegrees: -5,
  }),
  "surface-investigate": Object.freeze({
    pitchBiasDegrees: -10,
    probePitchDegrees: -5,
    probePitchGain: -7,
    ascendSpeed: 0.39,
    probeSpeed: 0.11,
    sweepColumns: 0.75,
    probeReachRows: 0.24,
  }),
  "school-follow": Object.freeze({
    trailingMinRows: 1.65,
    trailingMaxRows: 2.45,
    sideSpreadRows: 0.62,
    speedBase: 0.28,
    speedSociability: 0.22,
    velocityMatchScale: 0.46,
  }),
  "individual-follow": Object.freeze({
    trailingScale: 0.35,
    trailingMinRows: 2.25,
    trailingMaxRows: 3.7,
    besideMinRows: 0.22,
    besideMaxRows: 0.46,
    speedBase: 0.36,
    speedSociability: 0.17,
  }),
  "companion-cruise": Object.freeze({
    trailingScale: 0.09,
    trailingMinRows: 0.45,
    trailingMaxRows: 0.9,
    besideMinRows: 3.35,
    besideMaxRows: 3.75,
    speedBase: 0.3,
    speedSociability: 0.14,
  }),
  // Both fish, because a chase is read from the gap between them: the chaser's
  // closing speed and the evader's burst are one setting in two halves.
  "playful-chase": Object.freeze({
    approachSpeed: 0.58,
    pursuitSpeed: 0.78,
    lungeSpeedGain: 0.24,
    approachLeadSeconds: 0.72,
    pursuitLeadSeconds: 1.02,
    approachStandoffRows: 0.9,
    pursuitStandoffRows: 1.45,
    breakGlideSpeed: 0.18,
    evasionSpeed: 0.5,
    evasionProximityGain: 0.46,
    recognitionRadiusRows: 4.9,
    breakSeconds: 6.2,
    panicNearRows: 1.3,
    panicFarRows: 3.6,
  }),
  // Rotation and distance are the whole read of bottom feeding: the nose has to
  // point into the sand, and the mouth has to be close enough to reach it. The
  // bite is what that costs - how far the underside may pass through the crest
  // to put the mouth there - and the search band is a contact band, not an
  // approach one, because everything downstream of it claims the fish is eating.
  "substrate-search": Object.freeze({
    grazePitchDegrees: 26,
    peckPitchDegrees: 6,
    grazeContactRows: 0.06,
    grazeBurialRows: 1.25,
    peckRows: 0.3,
    searchDistanceRows: 0.45,
    strikeReachRows: 0.3,
    routeLeadColumns: 1.15,
    searchSpanColumns: 6.8,
    searchSpeed: 0.105,
    descendSpeed: 0.36,
  }),
  "open-water-rest": Object.freeze({
    settleRadiusRows: 1.15,
    settleSpeed: 0.17,
    driftSpeed: 0.035,
    driftAmplitudeRows: 0.12,
    driftVerticalRows: 0.055,
  }),
});

export function steeringProfile(state, key) {
  const base = STEERING_PROFILES[key] ?? EMPTY;
  const override = state?.choreographyTuning?.steering?.[key];
  // Production never carries an override map, and merging one frozen table into
  // another every fish every tick would be pure waste, so the default path
  // hands back the authored object itself.
  return override ? { ...base, ...override } : base;
}

export function sceneTuning(state, activity) {
  const base = SCENE_TUNING[activity] ?? EMPTY;
  const override = state?.choreographyTuning?.scene?.[activity];
  return override ? { ...base, ...override } : base;
}

// "playful-chase:break" is a phase of "playful-chase" and only lists what it
// changes, so everything it leaves out comes from the activity profile rather
// than from the controller default.
export function steeringParentKey(key) {
  const separator = key.indexOf(":");
  return separator < 0 ? null : key.slice(0, separator);
}

// What a profile would resolve to if it were deleted. This is the baseline the
// lab compares against, so the source it prints back out lists exactly the
// fields the profile is there to change.
export function inheritedSteeringProfile(state, key) {
  const parent = steeringParentKey(key);
  return parent
    ? { ...DEFAULT_STEERING_PROFILE, ...steeringProfile(state, parent) }
    : { ...DEFAULT_STEERING_PROFILE };
}

export function resolvedSteeringProfile(state, key) {
  return { ...inheritedSteeringProfile(state, key), ...steeringProfile(state, key) };
}

export function resolvedSceneTuning(state, activity) {
  return { ...sceneTuning(state, activity) };
}

// What a profile is worth writing down: the fields it changes from what it
// would otherwise inherit, plus the fields it already lists - a table entry that
// deliberately restates an inherited value keeps saying so. This is what the lab
// prints back out, so a copied profile is the same shape as the one it replaces.
export function steeringDeviations(state, key) {
  const authored = STEERING_PROFILES[key] ?? EMPTY;
  const inherited = inheritedSteeringProfile(state, key);
  const resolved = resolvedSteeringProfile(state, key);
  return Object.fromEntries(Object.entries(resolved).filter(
    ([field, value]) => field in authored || value !== inherited[field],
  ));
}
