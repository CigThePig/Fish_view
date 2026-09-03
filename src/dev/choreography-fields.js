/*
 * Slider metadata for the behaviour choreography lab: what each tunable number
 * is called, what it means, and how far it may reasonably travel. The values
 * themselves live in sim/choreography-tuning.js - the simulation must not import
 * anything from here, and this file must not restate a default.
 */

import { SCENE_TUNING, STEERING_PROFILES } from "../sim/choreography-tuning.js";
import { ACTIVITIES, DWELL_SECONDS } from "../sim/fish-activities.js";
import { MAX_FISH_PITCH_DEGREES } from "../sim/fish-motion.js";
import { showcaseScenario } from "./behavior-showcase.js";

function field(key, label, hint, min, max, step) {
  return Object.freeze({ key, label, hint, min, max, step });
}

// A break the chase never lives long enough to reach is not a tuning value: the
// activity is reselected once its dwell expires - the shortest sampled dwell is
// the second entry - and the lab restarts its own loop on its own schedule. The
// break slider therefore stops short of whichever deadline comes first, with
// room left for the glide that follows the break.
const CHASE_GLIDE_MARGIN_SECONDS = 0.4;
export const CHASE_BREAK_CEILING_SECONDS = Math.min(
  DWELL_SECONDS[ACTIVITIES.playfulChase][1],
  showcaseScenario(ACTIVITIES.playfulChase).loopSeconds,
) - CHASE_GLIDE_MARGIN_SECONDS;

// Every profile carries the same twelve, because the steering controller
// answers a target the same way whatever the fish thinks it is doing.
export const STEERING_FIELDS = Object.freeze([
  field("accelerationResponse", "Acceleration", "higher answers a speed change sooner", 0.1, 5, 0.01),
  field("turningResponse", "Turning", "higher swings the heading round faster", 0.1, 5, 0.01),
  field("verticalSpeedScale", "Vertical speed", "share of the requested speed spent climbing or diving", 0, 2, 0.01),
  field("minimumSpeed", "Minimum speed", "rows/s the fish never drops below", 0, 0.5, 0.005),
  field("maximumSpeed", "Maximum speed", "rows/s ceiling", 0.05, 1.6, 0.01),
  field("approachRadius", "Approach radius", "rows · where the fish starts easing off", 0, 6, 0.05),
  field("arrivalSpeedScale", "Arrival speed", "share of the speed kept once it arrives", 0, 1, 0.01),
  field("positionGain", "Position gain", "how hard a distance error is answered", 0, 2, 0.01),
  field("velocityMatch", "Velocity match", "share of the target's own velocity adopted", 0, 1, 0.01),
  field("pitchScale", "Pitch scale", "how much of the climb angle is drawn", 0, 1.5, 0.01),
  // These bounds are also enforced by tickVisualPose(). Keeping the editor on
  // the same interval means every displayed/exported value reaches the fish.
  field("pitchResponse", "Pitch response", "higher snaps the nose round sooner", 1, 7, 0.05),
  field("turnDuration", "Turn duration", "seconds to swing through a facing change", 0.2, 1.5, 0.01),
]);

// minimumSpeed and maximumSpeed describe one interval. The controller used to
// silently collapse an inverted interval at runtime, leaving the lab and its
// copied source claiming a value the fish could not use. Move the other end
// with the edited end instead, so the requested value remains authoritative.
export function constrainedSteeringEdit(profile, key, value) {
  if (key === "minimumSpeed" && value > profile.maximumSpeed) {
    return { minimumSpeed: value, maximumSpeed: value };
  }
  if (key === "maximumSpeed" && value < profile.minimumSpeed) {
    return { minimumSpeed: value, maximumSpeed: value };
  }
  return { [key]: value };
}

const SCENE_INTERVAL_PAIRS = Object.freeze([
  Object.freeze(["stageSecondsMin", "stageSecondsMax"]),
  Object.freeze(["trailingMinRows", "trailingMaxRows"]),
  Object.freeze(["besideMinRows", "besideMaxRows"]),
  Object.freeze(["panicNearRows", "panicFarRows"]),
]);

// Two rotations sharing one ceiling. Nose-down pitch is bounded at
// MAX_FISH_PITCH_DEGREES for every fish, and a feeding fish spends it twice:
// once on the lean it holds while grazing and again on the extra rotation at
// the top of a strike. Left uncoupled, the pair is a slider whose top three
// quarters do nothing - the simulation clamps the sum, so with a 26 degree lean
// every peck rotation from 6 upwards drew exactly the same strike. Moving the
// mate is how the panel says so: raise the strike and the lean gives way.
const SCENE_CEILING_PAIRS = Object.freeze([
  Object.freeze(["grazePitchDegrees", "peckPitchDegrees", MAX_FISH_PITCH_DEGREES]),
]);

// Scene ranges are intervals too. Keep the edited endpoint and move its mate
// when necessary, exactly as the steering speed interval does.
export function constrainedSceneEdit(profile, key, value) {
  const ceiling = SCENE_CEILING_PAIRS.find(([first, second]) => (
    (key === first || key === second) && first in profile && second in profile
  ));
  if (ceiling) {
    const [first, second, limit] = ceiling;
    const mate = key === first ? second : first;
    const bounded = Math.max(0, Math.min(limit, value));
    if (bounded + profile[mate] <= limit) return { [key]: bounded };
    return { [key]: bounded, [mate]: limit - bounded };
  }
  const pair = SCENE_INTERVAL_PAIRS.find(([minimum, maximum]) => (
    (key === minimum || key === maximum) && minimum in profile && maximum in profile
  ));
  if (!pair) return { [key]: value };
  const [minimum, maximum] = pair;
  if (key === minimum && value > profile[maximum]) return { [minimum]: value, [maximum]: value };
  if (key === maximum && value < profile[minimum]) return { [minimum]: value, [maximum]: value };
  return { [key]: value };
}

export const SCENE_FIELDS = Object.freeze({
  cruise: Object.freeze([
    field("speedBase", "Speed", "rows/s before personality", 0.02, 1.2, 0.005),
    field("speedActivity", "Speed · activity", "rows/s added by an energetic fish", 0, 1, 0.005),
    field("depthWaveRows", "Depth wave", "rows the cruising lane drifts up and down", 0, 3, 0.05),
  ]),
  "open-water-wander": Object.freeze([
    field("speedBase", "Speed", "rows/s before personality", 0.02, 1.2, 0.005),
    field("speedCuriosity", "Speed · curiosity", "rows/s added by a curious fish", 0, 1, 0.005),
    field("speedAffinity", "Speed · wander affinity", "rows/s added by a wanderer", 0, 1, 0.005),
  ]),
  "plant-investigate": Object.freeze([
    field("approachSpeed", "Approach speed", "rows/s crossing to the plant", 0.02, 1.2, 0.005),
    field("approachCuriosity", "Approach · curiosity", "rows/s added by a curious fish", 0, 1, 0.005),
    field("inspectSpeed", "Inspect speed", "rows/s once it is reading the plant", 0.01, 0.8, 0.005),
    field("inspectCuriosity", "Inspect · curiosity", "rows/s added by a curious fish", 0, 0.5, 0.005),
    field("inspectAffinity", "Inspect · plant affinity", "rows/s added by a plant lover", 0, 0.5, 0.005),
    field("headSweepColumns", "Head sweep", "columns the nose sweeps across the leaf", 0, 2, 0.01),
    field("hoverRows", "Hover", "rows the body rises and falls while reading", 0, 1.5, 0.01),
    field("stationSeconds", "Station dwell", "seconds before it moves to the next spot", 0.5, 8, 0.05),
  ]),
  "plant-weave": Object.freeze([
    field("speedBase", "Speed", "rows/s through the weave", 0.05, 1.4, 0.005),
    field("speedActivity", "Speed · activity", "rows/s added by an energetic fish", 0, 1, 0.005),
    field("speedAffinity", "Speed · plant affinity", "rows/s added by a plant lover", 0, 0.5, 0.005),
    field("stageSecondsMin", "Stage dwell · min", "seconds on each waypoint", 0.5, 8, 0.05),
    field("stageSecondsMax", "Stage dwell · max", "seconds on each waypoint", 0.5, 8, 0.05),
    field("asymmetryRows", "Route asymmetry", "rows of per-fish variation in the route", 0, 1.5, 0.01),
  ]),
  "bubble-investigate": Object.freeze([
    field("acquireSpeed", "Acquire speed", "rows/s in the first moment of noticing", 0.02, 1.4, 0.005),
    field("pursueSpeed", "Pursue speed", "rows/s closing on the bubble", 0.02, 1.4, 0.005),
    field("inspectSpeed", "Inspect speed", "rows/s hovering under it", 0.01, 0.8, 0.005),
    field("standoffRows", "Pursuit standoff", "rows kept below the bubble while closing", 0, 3, 0.01),
    field("inspectStandoffRows", "Inspection standoff", "rows kept below the bubble while inspecting", 0, 3, 0.01),
    field("lookAheadSeconds", "Lead", "seconds ahead of the rising bubble it aims", 0, 2, 0.01),
    field("acquirePitchDegrees", "Acquire rotation", "degrees · negative is nose-up", -32, 32, 0.5),
    field("inspectPitchDegrees", "Inspect rotation", "degrees · negative is nose-up", -32, 32, 0.5),
    field("pursuePitchDegrees", "Pursue rotation", "degrees · negative is nose-up", -32, 32, 0.5),
  ]),
  "surface-investigate": Object.freeze([
    field("pitchBiasDegrees", "Rotation", "degrees · negative is nose-up", -32, 32, 0.5),
    field("probePitchDegrees", "Probe rotation", "extra degrees while probing the meniscus", -32, 32, 0.5),
    field("probePitchGain", "Probe rotation · peak", "extra degrees at the top of a probe", -32, 32, 0.5),
    field("ascendSpeed", "Ascend speed", "rows/s on the way up", 0.02, 1.4, 0.005),
    field("probeSpeed", "Probe speed", "rows/s once it is at the surface", 0.01, 0.8, 0.005),
    field("sweepColumns", "Lateral sweep", "columns it patrols along the surface", 0, 4, 0.01),
    field("probeReachRows", "Probe reach", "rows the nose lifts into the meniscus", 0, 1.5, 0.01),
  ]),
  "school-follow": Object.freeze([
    field("trailingMinRows", "Trailing distance · min", "rows behind the school member", 0, 8, 0.05),
    field("trailingMaxRows", "Trailing distance · max", "rows behind the school member", 0, 8, 0.05),
    field("sideSpreadRows", "Side spread", "rows either side of the wake", 0, 4, 0.01),
    field("speedBase", "Speed", "rows/s before personality", 0.02, 1.2, 0.005),
    field("speedSociability", "Speed · sociability", "rows/s added by a sociable fish", 0, 1, 0.005),
    field("velocityMatchScale", "Velocity match", "share of the member's velocity carried into the target", 0, 1, 0.01),
  ]),
  "individual-follow": Object.freeze([
    field("trailingScale", "Trailing · body scale", "trailing rows per combined sprite width", 0, 1, 0.01),
    field("trailingMinRows", "Trailing distance · min", "rows behind the companion", 0, 8, 0.05),
    field("trailingMaxRows", "Trailing distance · max", "rows behind the companion", 0, 8, 0.05),
    field("besideMinRows", "Side offset · min", "rows to the side of the companion", 0, 6, 0.01),
    field("besideMaxRows", "Side offset · max", "rows to the side of the companion", 0, 6, 0.01),
    field("speedBase", "Speed", "rows/s before personality", 0.02, 1.2, 0.005),
    field("speedSociability", "Speed · sociability", "rows/s added by a sociable fish", 0, 1, 0.005),
  ]),
  "companion-cruise": Object.freeze([
    field("trailingScale", "Trailing · body scale", "trailing rows per combined sprite width", 0, 1, 0.01),
    field("trailingMinRows", "Trailing distance · min", "rows behind the companion", 0, 8, 0.05),
    field("trailingMaxRows", "Trailing distance · max", "rows behind the companion", 0, 8, 0.05),
    field("besideMinRows", "Spacing · min", "rows between the two bodies", 0, 8, 0.01),
    field("besideMaxRows", "Spacing · max", "rows between the two bodies", 0, 8, 0.01),
    field("speedBase", "Speed", "rows/s before personality", 0.02, 1.2, 0.005),
    field("speedSociability", "Speed · sociability", "rows/s added by a sociable fish", 0, 1, 0.005),
  ]),
  "playful-chase": Object.freeze([
    field("approachSpeed", "Chaser speed · approach", "rows/s while it is still closing", 0.05, 1.6, 0.005),
    field("pursuitSpeed", "Chaser speed · pursuit", "rows/s once the chase is on", 0.05, 1.6, 0.005),
    field("lungeSpeedGain", "Chaser lunge", "rows/s added at the top of each lunge", 0, 1, 0.005),
    field("evasionSpeed", "Evader speed", "rows/s the chased fish bolts at", 0.05, 1.6, 0.005),
    field("evasionProximityGain", "Evader panic", "rows/s added as the chaser closes", 0, 1, 0.005),
    field("approachLeadSeconds", "Lead · approach", "seconds ahead of the companion it aims", 0, 3, 0.01),
    field("pursuitLeadSeconds", "Lead · pursuit", "seconds ahead of the companion it aims", 0, 3, 0.01),
    field("approachStandoffRows", "Standoff · approach", "rows short of the companion", 0, 5, 0.01),
    field("pursuitStandoffRows", "Standoff · pursuit", "rows short of the companion", 0, 5, 0.01),
    field("breakGlideSpeed", "Break glide speed", "rows/s once the chaser gives up", 0.02, 1, 0.005),
    field("recognitionRadiusRows", "Recognition radius", "rows within which the chase is noticed", 0.5, 12, 0.05),
    field(
      "breakSeconds",
      "Break after",
      "seconds before the chaser breaks off · bounded by how long a chase lives",
      1,
      CHASE_BREAK_CEILING_SECONDS,
      0.1,
    ),
    field("panicNearRows", "Panic · near", "rows at which the evader is fully alarmed", 0, 6, 0.05),
    field("panicFarRows", "Panic · far", "rows at which the evader stops caring", 0, 10, 0.05),
  ]),
  "substrate-search": Object.freeze([
    field("grazePitchDegrees", "Graze rotation", "degrees nose-down while feeding · shares a ceiling with the strike", 0, MAX_FISH_PITCH_DEGREES, 0.5),
    field("peckPitchDegrees", "Peck rotation", "extra degrees at the top of a strike · takes them from the lean", 0, MAX_FISH_PITCH_DEGREES, 0.5),
    field("grazeContactRows", "Substrate distance", "rows the mouth is allowed to meet the crest", -0.5, 1.5, 0.01),
    field("grazeBurialRows", "Substrate bite", "rows the underside may graze through the crest to get the mouth down", 0, 2, 0.01),
    field("peckRows", "Peck depth", "rows the strike drives the fish down", 0, 1.5, 0.01),
    field("searchDistanceRows", "Search band", "rows off the graze line that still count as feeding", 0, 3, 0.01),
    field("strikeReachRows", "Strike reach", "rows the drawn mouth may be off the crest and still land a strike", 0, 1.5, 0.01),
    field("routeLeadColumns", "Route lead", "columns ahead the grazer will chase its patch", 0, 5, 0.01),
    field("searchSpanColumns", "Search span", "columns the patch sweeps across", 0.5, 20, 0.1),
    field("searchSpeed", "Graze speed", "rows/s creeping along the sand", 0.005, 0.6, 0.005),
    field("descendSpeed", "Descent speed", "rows/s dropping to the substrate", 0.02, 1.2, 0.005),
  ]),
  "open-water-rest": Object.freeze([
    field("settleRadiusRows", "Settle radius", "rows within which it counts as parked", 0.1, 4, 0.01),
    field("settleSpeed", "Settle speed", "rows/s on the way to the resting spot", 0.01, 0.8, 0.005),
    field("driftSpeed", "Drift speed", "rows/s once parked", 0.005, 0.4, 0.005),
    field("driftAmplitudeRows", "Drift · horizontal", "columns of idle sway", 0, 1, 0.005),
    field("driftVerticalRows", "Drift · vertical", "rows of idle rise and fall", 0, 1, 0.005),
  ]),
});

// A phase profile is keyed "<activity>:<phase>" and only lists what it changes.
export function steeringKeysFor(activity) {
  return Object.keys(STEERING_PROFILES)
    .filter((key) => key === activity || key.startsWith(activity + ":"));
}

const VELOCITY_TARGET_ACTIVITIES = new Set([
  ACTIVITIES.schoolFollow,
  ACTIVITIES.individualFollow,
  ACTIVITIES.companionCruise,
]);

export function steeringFieldsFor(key) {
  const activity = key.split(":")[0];
  return STEERING_FIELDS.filter((definition) => (
    definition.key !== "velocityMatch" || VELOCITY_TARGET_ACTIVITIES.has(activity)
  ));
}

export function steeringKeyLabel(key) {
  const separator = key.indexOf(":");
  return separator < 0 ? "Steering · " + key : "Phase · " + key.slice(separator + 1);
}

export function sceneFieldsFor(activity) {
  return SCENE_FIELDS[activity] ?? [];
}

export function tunedActivities() {
  return Object.keys(SCENE_TUNING);
}
