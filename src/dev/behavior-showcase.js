/*
 * Public behavior-showcase facade.
 *
 * Phase 7.4 needs a longer plant-weave observation window so the developer lab
 * can show entry, both crossings and emergence. Scenario construction and every
 * other showcase remain in the established implementation unchanged.
 */
import * as core from "./behavior-showcase-core.js";
import { ACTIVITIES } from "../sim/fish-activities.js";

export * from "./behavior-showcase-core.js";

export const SHOWCASE_SCENARIOS = Object.freeze(core.SHOWCASE_SCENARIOS.map((scenario) => (
  scenario.id === ACTIVITIES.plantWeave
    ? Object.freeze({ ...scenario, loopSeconds: 26 })
    : scenario
)));

const SCENARIO_BY_ID = new Map(SHOWCASE_SCENARIOS.map((scenario) => [scenario.id, scenario]));

export function showcaseScenario(id) {
  return SCENARIO_BY_ID.get(id) ?? SHOWCASE_SCENARIOS[0];
}
