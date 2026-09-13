/*
 * Public choreography-tuning facade.
 *
 * Phase 7.4 removed timer-driven plant-weave progression from the product and
 * from the developer tuning surface. The mature activity core still evaluates
 * its historical weave target while it performs shared selection / interruption
 * bookkeeping, so that delegated implementation needs a harmless fixed legacy
 * dwell internally. Keep those compatibility values private here rather than
 * pretending they are still authorable plant-weave controls.
 */

import * as core from "./choreography-tuning-core.js";

export * from "./choreography-tuning-core.js";

const {
  stageSecondsMin: _legacyStageSecondsMin,
  stageSecondsMax: _legacyStageSecondsMax,
  ...PLANT_WEAVE_TUNING
} = core.SCENE_TUNING["plant-weave"];

export const SCENE_TUNING = Object.freeze({
  ...core.SCENE_TUNING,
  "plant-weave": Object.freeze(PLANT_WEAVE_TUNING),
});

export function sceneTuning(state, activity) {
  const base = SCENE_TUNING[activity] ?? Object.freeze({});
  const override = state?.choreographyTuning?.scene?.[activity];

  if (activity !== "plant-weave") {
    return override ? { ...base, ...override } : base;
  }

  // Ignore stale lab overrides for the retired timer fields. The only consumer
  // that still asks for them is the delegated pre-7.4 core, where a long fixed
  // dwell prevents its old clock from replacing the spatial route target.
  const {
    stageSecondsMin: _ignoredStageSecondsMin,
    stageSecondsMax: _ignoredStageSecondsMax,
    ...visibleOverride
  } = override ?? {};
  return {
    ...base,
    ...visibleOverride,
    stageSecondsMin: 60,
    stageSecondsMax: 60,
  };
}

export function resolvedSceneTuning(state, activity) {
  return { ...sceneTuning(state, activity) };
}
