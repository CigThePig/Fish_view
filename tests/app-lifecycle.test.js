import assert from "node:assert/strict";
import test from "node:test";
import { createCanvas } from "@napi-rs/canvas";
import { DEFAULT_SETTINGS, INITIAL_INDIVIDUAL_COUNT } from "../src/sim/config.js";
import { createAquariumState } from "../src/sim/state.js";
import { ARRIVAL_INTERVAL_DAYS } from "../src/sim/fish-roster.js";
import { savePersistedState } from "../src/platform/storage.js";
import { MAX_HOLD_SECONDS } from "../src/sim/interaction-events.js";

test("the application resumes one aquarium after suspension and displays restored/reset controls", async (t) => {
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
      focus() {}, classList: { toggle() {} }, setAttribute() {},
      addEventListener(name, callback) { this.listeners.set(name, callback); } });
  }
  const nodes = new Map();
  let bounds = {left: 0, top: 0, width: 800, height: 480};
  nodes.set("#aquarium-canvas", element(Object.assign(createCanvas(1, 1), { getBoundingClientRect: () => bounds })));
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
  {

    savePersistedState(createAquariumState({ settings: {
      schoolSpeed: 1.8, timeScale: 3600,
    } }), now);
  }
  await import("../src/app.js?audit-lifecycle");
  const speed = settings.find((input) => input.dataset.setting === "schoolSpeed");
  assert.equal(speed.value, "1.8");
  assert.equal(nodes.get("#time-scale").value, "3600");
  assert.equal(stored.size, 1);
  assert.equal(nodes.get("#aquarium-canvas").width, 800);
  assert.equal(nodes.get("#aquarium-canvas").height, 480);
  const canvas = nodes.get("#aquarium-canvas");
  const panel = nodes.get("#debug-panel");
  const pointer = (type, x, y, extra = {}) => canvas.listeners.get(type)({
    clientX: x, clientY: y, pointerId: 1, isPrimary: true, button: 0,
    preventDefault() {}, ...extra,
  });
  const tap = (x, y, pointerType = "touch") => {
    pointer("pointerdown", x, y, {pointerType});
    pointer("pointerup", x, y, {pointerType});
  };
  const save = () => { intervals[0](); return JSON.parse([...stored.values()][0]).state; };
  const touches = () => save().individuals.reduce((sum, fish) => sum + fish.history.touches, 0);
  for (const [width, height] of [[800,480],[1920,1080],[844,390],[390,844],[360,800]]) {
    const scale = Math.min(width/800,height/480);
    bounds = {left:(width-800*scale)/2,top:(height-480*scale)/2,width:800*scale,height:480*scale};
    const x = bounds.left + bounds.width - 10, y = bounds.top + 10;
    const before = touches();
    tap(x,y); now += 100; tap(x,y);
    assert.equal(panel.hidden,true);
    now += 100; tap(x,y,'mouse');
    assert.equal(panel.hidden,false);
    assert.equal(touches(),before,'the reserved corner disturbed the fish');
    nodes.get("#debug-close").listeners.get("click")();
    tap(x,y); now += 3100; tap(x,y); tap(x,y);
    assert.equal(panel.hidden,true,'expired taps completed a gesture');
    tap(bounds.left+bounds.width/2,bounds.top+bounds.height/2);
    tap(x,y);
    assert.equal(panel.hidden,true,'outside input did not cancel the sequence');
    assert.equal(touches(),before+1,'normal aquarium touch was swallowed');
    document.listeners.get('pointerdown')({target: document});
    pointer('pointerdown',x,y); now+=700; pointer('pointerup',x,y);
    tap(x,y); tap(x,y);
    assert.equal(panel.hidden,true,'a hold counted as a tap');
    pointer('pointercancel',x,y);
  }
  canvas.listeners.get('keydown')({key:'Enter', repeat:true, preventDefault(){}});
  assert.equal(panel.hidden,true);
  canvas.listeners.get('keydown')({key:'Enter', repeat:false, preventDefault(){}});
  assert.equal(panel.hidden,false);
  document.listeners.get('keydown')({key:'Escape'});
  assert.equal(panel.hidden,true);
  canvas.listeners.get('keydown')({key:' ', repeat:false, preventDefault(){}});
  assert.equal(panel.hidden,false);
  nodes.get('#debug-close').listeners.get('click')();

  // The pointer lifecycle assertions below are about platform cleanup, not the
  // relationship layer. Earlier in this same test we deliberately hammer the
  // aquarium while exercising responsive layout and the hidden debug gesture;
  // Phase 6B correctly leaves that cast temporarily saturated, where a valid
  // answer may be a watch instead of `touch-react`. Start this independent
  // contact-lifecycle scenario from a fresh aquarium so its old investigator
  // assertion continues to test only what it was written to test.
  nodes.get("#reset-simulation").listeners.get("click")();

  // A finger left on the glass, and the three ways this file has of letting go
  // of one. The simulation's own staleness guard cannot help while the app is
  // still confirming a contact every frame, so ending it is the platform's job
  // and every path out of a press has to take it.
  const centreX = bounds.left + bounds.width / 2;
  const centreY = bounds.top + bounds.height / 2;
  const advance = (steps, ms = 250) => {
    for (let step = 0; step < steps; step += 1) { now += ms; animationFrame(now); }
  };
  // The app's own window onto what the fish are doing. A press is answered by
  // at least one fish going to look, and a response outlives its stimulus by a
  // second or two, so five seconds without one is a released contact.
  const answering = () => nodes.get("#personality-output").textContent.includes("touch-react");

  pointer("pointerdown", centreX, centreY);
  advance(8);
  assert.equal(answering(), true, "a press was not answered");

  // A second finger on the five-point panel reaches nothing, and that has to
  // include the way it leaves: cancelling it must not release the primary hold.
  pointer("pointercancel", centreX, centreY, { pointerId: 2, isPrimary: false });
  advance(20);
  assert.equal(answering(), true, "another finger's cancellation released the hold");

  // The browser saying the contact is no longer ours does end it - and it says
  // so in the cases where the release itself never reaches the canvas.
  canvas.listeners.get("lostpointercapture")({ pointerId: 1 });
  advance(24);
  assert.equal(answering(), false, "losing the pointer capture did not release the hold");

  // And with no event of any kind - a `pointerup` the page simply never
  // received - the frame loop stops confirming the contact by itself once it
  // passes the longest hold the simulation will describe. Nothing else in this
  // file can rescue that case, and a contact nothing ever clears would pin a
  // fish to the glass for as long as the page stayed open.
  pointer("pointerdown", centreX, centreY);
  advance(8);
  assert.equal(answering(), true, "a second press was not answered");
  advance(1, MAX_HOLD_SECONDS * 1000 + 1000);
  advance(24);
  assert.equal(answering(), false, "an abandoned contact was still being confirmed");

  // Clear touch bookkeeping before the existing offline lifecycle assertions.
  nodes.get("#reset-simulation").listeners.get("click")();
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
