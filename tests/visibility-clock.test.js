import assert from "node:assert/strict";
import test from "node:test";
import { VisibilityClock } from "../src/platform/visibility-clock.js";
import { advanceOffline, applyTouch, createAquariumState } from "../src/sim/state.js";

test("background autosaves keep the timestamp of the state they actually store", () => {
  const clock = new VisibilityClock();
  clock.pause(1000);
  clock.pause(5000);
  assert.equal(clock.saveTimestamp(12000), 1000);
  assert.equal(clock.saveTimestamp(3601000), 1000);
  assert.equal(clock.resume(3601000), 3600);
  assert.equal(clock.resume(3602000), 0, "visibility events must not double-count the gap");
  assert.equal(clock.saveTimestamp(3602000), 3602000);
});

test("returning to a suspended tab advances history and expires touch/strike state", () => {
  const clock = new VisibilityClock();
  const base = createAquariumState({ seed: 5, wallClockHours: 12 });
  const touched = applyTouch(base, 20, 8);
  touched.individuals[3].forageDip = 0.2;
  clock.pause(0);
  const resumed = advanceOffline(touched, clock.resume(90 * 86400 * 1000));
  assert.equal(resumed.totalDays, 90);
  assert.equal(resumed.timeOfDayHours, 12);
  assert.equal(resumed.reaction, null);
  assert.equal(resumed.individuals[3].forageDip, 0);
  assert.ok(resumed.individuals.length > base.individuals.length);
  for (const fish of base.individuals) {
    const next = resumed.individuals.find((candidate) => candidate.seed === fish.seed);
    assert.ok(Math.abs(next.ageDays - fish.ageDays - 90) < 1e-8);
  }
});

test("a wall-clock correction cannot rewind a suspended aquarium", () => {
  const clock = new VisibilityClock();
  clock.pause(5000);
  assert.equal(clock.resume(1000), 0);
});
