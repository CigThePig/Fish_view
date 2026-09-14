// The Phase 7.7 freeze contract. This is developer-only evidence data and is
// never imported by the production aquarium. Phase 8 may change scene-level
// salience and timing, but individual choreography stays frozen unless new
// rendered evidence demonstrates a regression.

export const PHASE_7_FINAL_DECISION = Object.freeze({
  unchanged: "pass-unchanged",
  improved: "pass-targeted-improvement",
  reference: "frozen-reference",
  phase8Context: "frozen-motion-phase-8-context",
});

function entry({
  activity,
  label,
  visualSentence,
  cues,
  nearestNeighbors,
  decision,
  showcase = true,
  evidence,
  limitation = null,
}) {
  return Object.freeze({
    activity,
    label,
    visualSentence,
    cues: Object.freeze([...cues]),
    nearestNeighbors: Object.freeze([...nearestNeighbors]),
    decision,
    showcase,
    evidence: Object.freeze([...evidence]),
    limitation,
    frozen: true,
  });
}

export const PHASE_7_FINAL_VOCABULARY = Object.freeze([
  entry({
    activity: "cruise",
    label: "Cruise",
    visualSentence: "A fish travels calmly through open water without attending to a particular target.",
    cues: ["steady low-to-moderate speed", "broad gentle turns", "level relaxed posture"],
    nearestNeighbors: ["open-water-wander", "companion-cruise", "arrival-enter"],
    decision: PHASE_7_FINAL_DECISION.unchanged,
    evidence: ["7.1 blind baseline", "7.6 nearest-neighbor audit", "7.7 multi-identity showcase"],
  }),
  entry({
    activity: "open-water-wander",
    label: "Open-water wander",
    visualSentence: "A fish explores open water on a varied unhurried path rather than following a simple course.",
    cues: ["varied path geometry", "visible vertical exploration", "unhurried target changes"],
    nearestNeighbors: ["cruise", "substrate-search"],
    decision: PHASE_7_FINAL_DECISION.unchanged,
    evidence: ["7.1 blind baseline", "7.6 nearest-neighbor audit", "7.7 multi-identity showcase"],
  }),
  entry({
    activity: "school-follow",
    label: "School follow",
    visualSentence: "One fish closes toward the school and adjusts into the group's motion and spacing.",
    cues: ["approach toward school edge", "velocity matching", "adjustment into group spacing"],
    nearestNeighbors: ["individual-follow"],
    decision: PHASE_7_FINAL_DECISION.unchanged,
    evidence: ["7.1 blind baseline", "7.6 social comparison", "7.7 multi-identity showcase"],
  }),
  entry({
    activity: "individual-follow",
    label: "Individual follow",
    visualSentence: "A rear-offset follower tracks an independently moving leader and eventually peels away.",
    cues: ["consistent rear offset", "leader remains comparatively unaffected", "moderate follower corrections", "eventual peel-away"],
    nearestNeighbors: ["school-follow", "companion-cruise", "playful-chase"],
    decision: PHASE_7_FINAL_DECISION.unchanged,
    evidence: ["7.1 blind baseline", "7.3 chase control", "7.6 social comparison", "7.7 multi-identity showcase"],
  }),
  entry({
    activity: "companion-cruise",
    label: "Companion cruise",
    visualSentence: "Two companions travel side by side, correct independently, and then separate gently.",
    cues: ["matched relaxed travel", "comfortable side-by-side offset", "separate body slots", "gentle separation"],
    nearestNeighbors: ["individual-follow", "cruise"],
    decision: PHASE_7_FINAL_DECISION.improved,
    evidence: ["7.6 targeted repair", "natural companion episode", "7.7 multi-identity showcase"],
  }),
  entry({
    activity: "playful-chase",
    label: "Playful chase",
    visualSentence: "A pursuer closes on an evader through escape, renewed pursuit, near miss, decisive break, and recovery.",
    cues: ["asymmetric escape and pursuit", "gap closes and opens repeatedly", "interception or near miss", "different-heading break"],
    nearestNeighbors: ["individual-follow"],
    decision: PHASE_7_FINAL_DECISION.unchanged,
    evidence: ["7.2 pursuit evidence", "7.3 complete-arc evidence", "7.7 multi-identity showcase"],
  }),
  entry({
    activity: "open-water-rest",
    label: "Open-water rest",
    visualSentence: "A fish becomes nearly still in exposed open water and later wakes gradually.",
    cues: ["very low speed", "open-water location", "level quiet posture", "gradual wake-up"],
    nearestNeighbors: ["plant-shelter", "glass-visit"],
    decision: PHASE_7_FINAL_DECISION.unchanged,
    evidence: ["7.1 blind baseline", "7.5 shelter control", "7.7 multi-identity showcase"],
  }),
  entry({
    activity: "plant-shelter",
    label: "Plant shelter",
    visualSentence: "A fish enters vegetation, becomes conspicuously quiet inside cover, and then emerges.",
    cues: ["deliberate entry into cover", "extremely low speed in vegetation", "protected plant location", "physical emergence"],
    nearestNeighbors: ["open-water-rest", "plant-weave"],
    decision: PHASE_7_FINAL_DECISION.unchanged,
    evidence: ["7.5 six-seed physical arc", "7.5 exact visual comparison", "7.7 multi-identity showcase"],
  }),
  entry({
    activity: "plant-investigate",
    label: "Plant investigation",
    visualSentence: "A fish approaches one plant, inspects it stably and locally, then retreats on the same side.",
    cues: ["single-plant approach", "plant-facing stable inspection", "local movement rather than traversal", "same-side retreat"],
    nearestNeighbors: ["plant-weave", "touch-react"],
    decision: PHASE_7_FINAL_DECISION.unchanged,
    evidence: ["7.5 six-seed physical arc", "7.5 exact visual comparison", "7.7 multi-identity showcase"],
  }),
  entry({
    activity: "plant-weave",
    label: "Plant weave",
    visualSentence: "A fish commits to crossing vegetation, threads another plant or gap, and emerges into open water.",
    cues: ["alternating stem geometry", "two physical plant crossings", "continuous route progression", "clear emergence"],
    nearestNeighbors: ["plant-investigate", "plant-shelter"],
    decision: PHASE_7_FINAL_DECISION.unchanged,
    evidence: ["7.4 five-leg physical route", "7.4 six-seed production fixture", "7.7 multi-identity showcase"],
  }),
  entry({
    activity: "bubble-investigate",
    label: "Bubble investigation",
    visualSentence: "A fish notices a rising bubble, intercepts it with pitched pursuit, inspects it, and releases or searches.",
    cues: ["quick upward interception", "nose-up pursuit posture", "bubble-relative correction", "release or search after disappearance"],
    nearestNeighbors: ["surface-investigate", "touch-react", "drifting-inspect"],
    decision: PHASE_7_FINAL_DECISION.reference,
    evidence: ["7.1 strong reference", "natural production watch", "7.7 multi-identity showcase"],
  }),
  entry({
    activity: "surface-investigate",
    label: "Surface investigation",
    visualSentence: "A fish rises deliberately, probes and lingers at the waterline, then visibly descends.",
    cues: ["sustained local ascent", "nose-up surface posture", "waterline probe and linger", "physical descent"],
    nearestNeighbors: ["bubble-investigate"],
    decision: PHASE_7_FINAL_DECISION.improved,
    evidence: ["7.6 targeted repair", "natural seed-2 completion", "7.7 multi-identity showcase"],
  }),
  entry({
    activity: "substrate-search",
    label: "Substrate search / feeding",
    visualSentence: "A fish descends purposefully, aligns nose-down with the substrate, and performs discrete pecks.",
    cues: ["purposeful substrate descent", "nose-down grazing posture", "slow bottom sweep", "clustered pecks and recovery"],
    nearestNeighbors: ["open-water-wander"],
    decision: PHASE_7_FINAL_DECISION.reference,
    evidence: ["7.1 strong reference", "feeding safety gate", "natural production watch", "7.7 multi-identity showcase"],
  }),
  entry({
    activity: "touch-react",
    label: "Human / held-glass investigation",
    visualSentence: "A fish responds to a real contact at the front glass, approaches or watches it, then loses interest individually.",
    cues: ["target fixed to live glass contact", "response begins with the interaction", "approach and standoff", "individual release into swimming"],
    nearestNeighbors: ["bubble-investigate", "plant-investigate"],
    decision: PHASE_7_FINAL_DECISION.unchanged,
    evidence: ["Phase 2 response roles", "7.6 real contact episode", "7.7 blind showcase"],
  }),
  entry({
    activity: "glass-visit",
    label: "Autonomous familiar-glass visit",
    visualSentence: "A familiar fish returns locally to the glass, lingers and patrols, then resumes ordinary swimming.",
    cues: ["voluntary local approach", "extended glass-side linger", "short patrol", "independent exit"],
    nearestNeighbors: ["open-water-rest"],
    decision: PHASE_7_FINAL_DECISION.phase8Context,
    showcase: false,
    evidence: ["Phase 6 natural relationship gate", "7.6 unforced familiar visit episode", "7.7 production observation"],
    limitation: "Without recent interaction context, person-attribution can be weak in a busy scene; Phase 8 owns that salience problem.",
  }),
  entry({
    activity: "drifting-inspect",
    label: "Drifting-object inspection",
    visualSentence: "A fish intercepts a moving object, corrects relative to it, slows to inspect, and disengages.",
    cues: ["moving-object interception", "target-relative corrections", "slowdown near the object", "disengagement"],
    nearestNeighbors: ["bubble-investigate"],
    decision: PHASE_7_FINAL_DECISION.unchanged,
    evidence: ["7.6 forced showcase", "7.6 natural production episode", "7.7 multi-identity showcase"],
  }),
  entry({
    activity: "arrival-enter",
    label: "Arrival entry",
    visualSentence: "A newly hatched fish enters from the aquarium boundary, commits inward, settles, and joins ordinary life.",
    cues: ["small new body at boundary", "committed inward travel", "orientation into usable water", "settling transition"],
    nearestNeighbors: ["cruise"],
    decision: PHASE_7_FINAL_DECISION.unchanged,
    evidence: ["7.6 forced showcase", "7.6 genuine fry arrival", "7.7 multi-identity showcase"],
  }),
]);

export const PHASE_7_FINAL_BY_ACTIVITY = Object.freeze(Object.fromEntries(
  PHASE_7_FINAL_VOCABULARY.map((record) => [record.activity, record]),
));

function comparison(left, right, distinction, status = "pass") {
  return Object.freeze({ left, right, distinction, status });
}

export const PHASE_7_CONFUSION_MATRIX = Object.freeze([
  comparison("cruise", "open-water-wander", "Cruise holds a broad course; wander changes course and depth exploratorily."),
  comparison("cruise", "companion-cruise", "Companion cruise maintains a deliberate two-body side-by-side formation before separation."),
  comparison("cruise", "arrival-enter", "Arrival starts at the boundary with a small body and a one-way settling ingress."),
  comparison("school-follow", "individual-follow", "School follow closes toward group spacing; individual follow holds one leader's rear offset."),
  comparison("individual-follow", "companion-cruise", "Follow is asymmetric and rear-offset; companion travel is mutual and side by side."),
  comparison("individual-follow", "playful-chase", "Chase adds an evader, bursts, gap oscillation, near miss, and decisive break."),
  comparison("open-water-rest", "plant-shelter", "Shelter enters and stays inside vegetation; rest remains exposed in open water."),
  comparison("open-water-rest", "glass-visit", "A glass visit approaches the front, lingers and patrols before leaving.", "phase-8-context-deferred"),
  comparison("plant-investigate", "plant-weave", "Investigation stays local and retreats on the same side; weave crosses and emerges."),
  comparison("plant-shelter", "plant-weave", "Shelter becomes nearly still in cover; weave keeps progressing through it."),
  comparison("bubble-investigate", "surface-investigate", "Bubble motion tracks a rising object; surface motion holds the waterline then descends."),
  comparison("bubble-investigate", "touch-react", "Glass response is causally timed to a live contact and holds that contact point."),
  comparison("bubble-investigate", "drifting-inspect", "A drifting object moves laterally and persists; a bubble rises and disappears."),
  comparison("plant-investigate", "touch-react", "Plant inspection is anchored in vegetation; glass response is anchored to the front contact."),
  comparison("open-water-wander", "substrate-search", "Feeding commits to the bottom, pitches nose-down and pecks rather than merely descending."),
]);

export const PHASE_7_CONFUSION_BY_PAIR = Object.freeze(Object.fromEntries(
  PHASE_7_CONFUSION_MATRIX.map((record) => [
    [record.left, record.right].sort().join("|"),
    record,
  ]),
));

export function finalVocabularyFor(activity) {
  return PHASE_7_FINAL_BY_ACTIVITY[activity] ?? null;
}
