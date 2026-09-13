import assert from "node:assert/strict";
import test from "node:test";

import { SHOWCASE_SCENARIOS } from "../src/dev/behavior-showcase.js";
import {
  PHASE_7_PRIORITY_COMPARISONS,
  PHASE_7_READABILITY_BASELINE,
  READABILITY_BASELINE_STATUS,
  READABILITY_CHANGE_POLICY,
  readabilityBaselineFor,
} from "../src/dev/phase-7-readability-baseline.js";

const ids = (records) => records.map((record) => record.activity).sort();

const requiredSignatures = [
  "cruise",
  "open-water-wander",
  "plant-investigate",
  "plant-weave",
  "bubble-investigate",
  "surface-investigate",
  "school-follow",
  "individual-follow",
  "companion-cruise",
  "playful-chase",
  "substrate-search",
  "open-water-rest",
  "plant-shelter",
  "touch-react",
  "arrival-enter",
  "drifting-inspect",
].sort();

test("Phase 7.1 baseline covers every required readability signature and showcase scenario", () => {
  assert.deepEqual(ids(PHASE_7_READABILITY_BASELINE), requiredSignatures);
  assert.deepEqual(
    SHOWCASE_SCENARIOS.map((scenario) => scenario.id).sort(),
    requiredSignatures,
    "the forced behavior lab and the Phase 7 contract drifted apart",
  );
});

test("every Phase 7 signature has at least three visible cues and a comparison neighbor", () => {
  for (const record of PHASE_7_READABILITY_BASELINE) {
    assert.ok(record.visualSentence.length > 12, `${record.activity} has no readable visual sentence`);
    assert.ok(record.cues.length >= 3, `${record.activity} violates the Phase 7 three-cue rule`);
    assert.ok(record.nearestNeighbors.length >= 1, `${record.activity} has no nearest visual neighbor`);
    assert.ok(record.owner, `${record.activity} has no owning Phase 7 slice`);
  }
});

test("Phase 7.1 freezes the behaviors already judged strong", () => {
  const strong = PHASE_7_READABILITY_BASELINE.filter((record) => (
    record.status === READABILITY_BASELINE_STATUS.strong
  ));
  assert.deepEqual(ids(strong), ["bubble-investigate", "substrate-search"]);
  strong.forEach((record) => assert.equal(record.policy, READABILITY_CHANGE_POLICY.freeze));
});

test("Phase 7.1 provisionally freezes behaviors that are probably already readable", () => {
  const provisional = PHASE_7_READABILITY_BASELINE.filter((record) => (
    record.status === READABILITY_BASELINE_STATUS.provisional
  ));
  assert.deepEqual(ids(provisional), [
    "cruise",
    "individual-follow",
    "open-water-rest",
    "open-water-wander",
    "school-follow",
  ]);
  provisional.forEach((record) => (
    assert.equal(record.policy, READABILITY_CHANGE_POLICY.provisionalFreeze)
  ));
});

test("plant weave and playful chase are the only top-priority rework targets", () => {
  const priority = PHASE_7_READABILITY_BASELINE.filter((record) => (
    record.status === READABILITY_BASELINE_STATUS.priority
  ));
  assert.deepEqual(ids(priority), ["plant-weave", "playful-chase"]);
  priority.forEach((record) => (
    assert.equal(record.policy, READABILITY_CHANGE_POLICY.scheduledRework)
  ));
  assert.equal(readabilityBaselineFor("playful-chase").owner, "7.2");
  assert.equal(readabilityBaselineFor("plant-weave").owner, "7.4");
});

test("priority anti-aliasing comparisons are represented by the baseline neighbors", () => {
  for (const [left, right] of PHASE_7_PRIORITY_COMPARISONS) {
    const leftRecord = readabilityBaselineFor(left);
    const rightRecord = readabilityBaselineFor(right);
    assert.ok(leftRecord, `missing comparison source ${left}`);
    assert.ok(rightRecord, `missing comparison target ${right}`);
    assert.ok(
      leftRecord.nearestNeighbors.includes(right) || rightRecord.nearestNeighbors.includes(left),
      `${left} vs ${right} is not represented in either behavior's neighbor list`,
    );
  }
});

test("Phase 7.1 baseline is developer-only data and does not authorize unscheduled retuning", () => {
  const review = PHASE_7_READABILITY_BASELINE.filter((record) => (
    record.status === READABILITY_BASELINE_STATUS.review
  ));
  assert.ok(review.length > 0);
  review.forEach((record) => (
    assert.equal(record.policy, READABILITY_CHANGE_POLICY.reviewBeforeChange)
  ));
});
