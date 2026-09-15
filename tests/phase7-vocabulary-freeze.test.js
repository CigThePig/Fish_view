import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { SHOWCASE_SCENARIOS } from "../src/dev/behavior-showcase.js";
import {
  PHASE_7_CONFUSION_MATRIX,
  PHASE_7_FINAL_BY_ACTIVITY,
  PHASE_7_FINAL_DECISION,
  PHASE_7_FINAL_VOCABULARY,
  finalVocabularyFor,
} from "../src/dev/phase-7-behavior-vocabulary.js";

const ids = (records) => records.map((record) => record.activity).sort();

test("Phase 7 final vocabulary covers every showcase and the natural familiar-glass visit", () => {
  const showcased = PHASE_7_FINAL_VOCABULARY.filter((record) => record.showcase);
  assert.deepEqual(ids(showcased), SHOWCASE_SCENARIOS.map((scenario) => scenario.id).sort());
  assert.equal(PHASE_7_FINAL_VOCABULARY.length, SHOWCASE_SCENARIOS.length + 1);
  assert.equal(finalVocabularyFor("glass-visit").showcase, false);
});

test("every frozen behavior has a visual sentence, three cues, evidence and a neighbor", () => {
  for (const record of PHASE_7_FINAL_VOCABULARY) {
    assert.equal(record.frozen, true, record.activity);
    assert.ok(record.visualSentence.length > 20, record.activity + " has no visual sentence");
    assert.ok(record.cues.length >= 3, record.activity + " violates the three-cue rule");
    assert.ok(record.evidence.length >= 2, record.activity + " has no evidence trail");
    assert.ok(record.nearestNeighbors.length >= 1, record.activity + " has no comparison neighbor");
    for (const neighbor of record.nearestNeighbors) {
      assert.ok(PHASE_7_FINAL_BY_ACTIVITY[neighbor], record.activity + " names an unknown neighbor " + neighbor);
    }
  }
});

test("the final confusion matrix is unique, exhaustive and represented in both neighbor lists", () => {
  const seen = new Set();
  const represented = new Set();
  for (const comparison of PHASE_7_CONFUSION_MATRIX) {
    const key = [comparison.left, comparison.right].sort().join("|");
    assert.equal(seen.has(key), false, "duplicate comparison " + key);
    seen.add(key);
    const left = finalVocabularyFor(comparison.left);
    const right = finalVocabularyFor(comparison.right);
    assert.ok(left && right, "unknown comparison member " + key);
    assert.ok(left.nearestNeighbors.includes(right.activity), key + " missing from left neighbors");
    assert.ok(right.nearestNeighbors.includes(left.activity), key + " missing from right neighbors");
    assert.ok(comparison.distinction.length > 24, key + " has no semantic distinction");
    represented.add(left.activity);
    represented.add(right.activity);
  }
  assert.deepEqual([...represented].sort(), ids(PHASE_7_FINAL_VOCABULARY));
});

test("only the two demonstrated Phase 7.6 weaknesses are classified as targeted improvements", () => {
  const improved = PHASE_7_FINAL_VOCABULARY
    .filter((record) => record.decision === PHASE_7_FINAL_DECISION.improved);
  assert.deepEqual(ids(improved), ["companion-cruise", "surface-investigate"]);
});

test("bubble investigation and substrate feeding remain reference behavior", () => {
  const references = PHASE_7_FINAL_VOCABULARY
    .filter((record) => record.decision === PHASE_7_FINAL_DECISION.reference);
  assert.deepEqual(ids(references), ["bubble-investigate", "substrate-search"]);
});

test("the only Phase 8 context deferral is explicit and does not reopen glass-visit motion", () => {
  const deferred = PHASE_7_FINAL_VOCABULARY
    .filter((record) => record.decision === PHASE_7_FINAL_DECISION.phase8Context);
  assert.deepEqual(ids(deferred), ["glass-visit"]);
  assert.match(deferred[0].limitation, /Phase 8/);
  assert.equal(deferred[0].frozen, true);
});


test("later branches rerun the frozen Phase 7 machine and production-path gates", () => {
  const workflow = readFileSync(new URL("../.github/workflows/verify.yml", import.meta.url), "utf8");
  assert.match(workflow, /Guard frozen Phase 7 vocabulary after Phase 7/);
  assert.match(workflow, /npm run audit:phase7-vocabulary/);
  assert.match(workflow, /Observe frozen vocabulary on production path after Phase 7/);
  assert.match(workflow, /npm run measure:remaining-vocabulary/);
  assert.match(workflow, /!startsWith\(github\.ref_name, 'phase-7'\)/);
});


test("the vocabulary audit gates defining sequential motion beats per identity", () => {
  const audit = readFileSync(new URL("../tools/audit-phase7-vocabulary.mjs", import.meta.url), "utf8");
  assert.match(audit, /SEMANTIC_CONTRACTS/);
  assert.match(audit, /"individual-follow"[\s\S]*"trail", "peel-away"/);
  assert.match(audit, /"plant-weave"[\s\S]*"weave-1"[\s\S]*"weave-5"/);
  assert.match(audit, /for \(const sample of samples\)/);
  assert.match(audit, /missed semantic phase/);
  assert.match(audit, /never completed its frozen sentence/);
});
