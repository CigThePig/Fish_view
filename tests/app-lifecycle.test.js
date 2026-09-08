import assert from "node:assert/strict";
import test from "node:test";
import { createCanvas } from "@napi-rs/canvas";
import { DEFAULT_SETTINGS, INITIAL_INDIVIDUAL_COUNT } from "../src/sim/config.js";
import { createAquariumState } from "../src/sim/state.js";
import { ARRIVAL_INTERVAL_DAYS } from "../src/sim/fish-roster.js";
import { savePersistedState } from "../src/platform/storage.js";

test("the application resumes both tanks after suspension and displays restored/reset controls", async (t) => {
  // Load the actual entry point with a small event host and real Canvas. This
  // exercises the visibility listener, RAF guard and autosave wiring together.
  const globals = new Map();
  function install(name, value) {
    globals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, value });
  }
  t.after(() => {
    for (const [name, descriptor] of globals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  });
  function element(base = {}) {
    return Object.assign(base, { dataset: {}, hidden: true, value: "", textContent: "", listeners: new Map(),
      classList: { toggle() {} }, setAttribute() {},
      addEventListener(name, callback) { this.listeners.set(name, callback); } });
  }
  const nodes = new Map();
  for (const orientation of ["portrait", "landscape"]) nodes.set(`#${orientation}-canvas`, element(createCanvas(1, 1)));
  const settings = Object.keys(DEFAULT_SETTINGS).filter((key) => key !== "timeScale")
    .map((key) => Object.assign(element(), { dataset: { setting: key } }));
  const document = element({ visibilityState: "visible",
    querySelector(selector) {
      if (!nodes.has(selector)) nodes.set(selector, element());
      return nodes.get(selector);
    },
    querySelectorAll(selector) { return selector === "[data-setting]" ? settings : []; },
  });
  const stored = new Map();
  const intervals = [];
  let animationFrame;
  let now = 1_000_000;
  t.mock.method(Date, "now", () => now);
  t.mock.method(performance, "now", () => now);
  install("document", document);
  install("location", { search: "?orientation=portrait" });
  install("localStorage", { getItem: (key) => stored.get(key), setItem: (key, value) => stored.set(key, value), removeItem: (key) => stored.delete(key) });
  install("requestAnimationFrame", (callback) => { animationFrame = callback; });
  install("setInterval", (callback) => { intervals.push(callback); return intervals.length; });
  install("addEventListener", () => {});
  for (const orientation of ["portrait", "landscape"]) {
    savePersistedState(createAquariumState({ orientation, settings: {
      schoolSpeed: orientation === "portrait" ? 2.2 : 1.8, timeScale: 3600,
    } }), now);
  }
  await import("../src/app.js?audit-lifecycle");
  const speed = settings.find((input) => input.dataset.setting === "schoolSpeed");
  assert.equal(speed.value, "2.2");
  assert.equal(nodes.get("#time-scale").value, "3600");
  const hiddenAt = now;
  document.visibilityState = "hidden";
  document.listeners.get("visibilitychange")();
  now += 90 * 86400 * 1000;
  animationFrame(now);
  intervals[0]();
  for (const value of stored.values()) {
    const envelope = JSON.parse(value);
    assert.equal(envelope.savedAtMs, hiddenAt);
    assert.equal(envelope.state.totalDays, 0);
  }
  document.visibilityState = "visible";
  document.listeners.get("visibilitychange")();
  document.listeners.get("visibilitychange")();
  intervals[0]();
  for (const value of stored.values()) {
    const envelope = JSON.parse(value);
    assert.equal(envelope.savedAtMs, now);
    // Offline history counts wall time, independently of the developer speed.
    assert.equal(envelope.state.totalDays, 90);
    // Ninety days of wall time is ninety days of stocking: the founder plus one
    // arrival a fortnight, materialized by the offline catch-up rather than by
    // any frame the tab actually rendered.
    assert.equal(
      envelope.state.individuals.length,
      INITIAL_INDIVIDUAL_COUNT + Math.floor(90 / ARRIVAL_INTERVAL_DAYS),
    );
  }
  nodes.get("#reset-simulation").listeners.get("click")();
  assert.equal(speed.value, String(DEFAULT_SETTINGS.schoolSpeed));
  assert.equal(nodes.get("#time-scale").value, "1");
  assert.equal(nodes.get('[data-output="schoolSpeed"]').textContent, speed.value);
});
