import assert from "node:assert/strict";
import test from "node:test";

import { CanvasSceneRenderer } from "../src/render/canvas-renderer.js";
import { render } from "../src/render/render.js";
import { createAquariumState } from "../src/sim/state.js";
import { tick } from "../src/sim/tick.js";

// Fish View repaints only what changed. Every earlier renderer property that
// reached the rasteriser had to reach the damage signature and the object
// bounds as well, or ink stayed on the panel after the fish that drew it moved
// on - and rotation adds the largest reach yet, because a turned character
// leaves its own cell by up to half its height sideways.
//
// The numeric guards elsewhere check that bounds contain the spans and that the
// signature changes. This checks the thing those guards are proxies for: paint
// a run of frames incrementally, paint the same frames from scratch, and
// require the two framebuffers to be identical pixel for pixel. Anything left
// behind by anything shows up here.

// Colours are compared as identities, and the two buffers have to agree on
// which identity a colour string has - discovering them in a different order
// would make identical paint look different.
const COLOR_IDS = new Map();

function colorId(style) {
  if (!COLOR_IDS.has(style)) COLOR_IDS.set(style, COLOR_IDS.size + 1);
  return COLOR_IDS.get(style);
}

// The few 2D operations CanvasSceneRenderer actually uses, over a flat buffer.
// Rectangular clipping is all it ever asks for: it clips to one damage region
// at a time.
class BufferContext {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.pixels = new Int32Array(width * height);
    this.fillStyle = "#000000";
    this.strokeStyle = "#000000";
    this.lineWidth = 1;
    this.imageSmoothingEnabled = false;
    this.clipStack = [];
    this.clip_ = { x: 0, y: 0, width, height };
    this.pendingRect = null;
  }

  save() {
    this.clipStack.push(this.clip_);
  }

  restore() {
    this.clip_ = this.clipStack.pop() ?? { x: 0, y: 0, width: this.width, height: this.height };
  }

  beginPath() {
    this.pendingRect = null;
  }

  rect(x, y, width, height) {
    this.pendingRect = { x, y, width, height };
  }

  clip() {
    if (!this.pendingRect) return;
    const next = this.pendingRect;
    const left = Math.max(this.clip_.x, Math.round(next.x));
    const top = Math.max(this.clip_.y, Math.round(next.y));
    const right = Math.min(this.clip_.x + this.clip_.width, Math.round(next.x + next.width));
    const bottom = Math.min(this.clip_.y + this.clip_.height, Math.round(next.y + next.height));
    this.clip_ = { x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
  }

  fillRect(x, y, width, height) {
    const value = colorId(this.fillStyle);
    const left = Math.max(this.clip_.x, 0, Math.round(x));
    const top = Math.max(this.clip_.y, 0, Math.round(y));
    const right = Math.min(this.clip_.x + this.clip_.width, this.width, Math.round(x + width));
    const bottom = Math.min(this.clip_.y + this.clip_.height, this.height, Math.round(y + height));
    for (let row = top; row < bottom; row += 1) {
      this.pixels.fill(value, row * this.width + left, row * this.width + right);
    }
  }

  // Debug overlays are off in these runs; the renderer still needs the methods
  // to exist if a caller ever turns one on.
  strokeRect() {}
  moveTo() {}
  lineTo() {}
  stroke() {}
}

class BufferCanvas {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.context = new BufferContext(width, height);
  }

  getContext() {
    // The renderer re-fetches the context when the scene resizes. Handing back
    // the same buffer is right: a resize is a full repaint either way.
    if (this.context.width !== this.width || this.context.height !== this.height) {
      this.context = new BufferContext(this.width, this.height);
    }
    return this.context;
  }
}

function firstDifference(left, right, width) {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return { x: index % width, y: Math.floor(index / width), index };
    }
  }
  return null;
}

function paintFrames(orientation, seed, frames, decorate) {
  let state = createAquariumState({ orientation, seed, wallClockHours: 12 });
  for (let warm = 0; warm < 40; warm += 1) state = tick(state, 0.1);

  const first = render(decorate(state, 0));
  const incrementalCanvas = new BufferCanvas(first.width, first.height);
  const fullCanvas = new BufferCanvas(first.width, first.height);
  const incremental = new CanvasSceneRenderer(incrementalCanvas);
  const full = new CanvasSceneRenderer(fullCanvas);

  for (let frame = 0; frame < frames; frame += 1) {
    state = tick(state, 0.1);
    const scene = render(decorate(state, frame + 1));
    incremental.draw(scene);
    // Forgetting the previous scene forces a full repaint of the whole panel.
    full.reset();
    full.draw(scene);
    const difference = firstDifference(
      incrementalCanvas.context.pixels,
      fullCanvas.context.pixels,
      scene.width,
    );
    assert.equal(
      difference,
      null,
      `${orientation}/${seed} frame ${frame} left a trail at ${difference?.x},${difference?.y}`,
    );
  }
}

test("incremental repaint matches a full repaint while fish swim level", () => {
  for (const orientation of ["landscape", "portrait"]) {
    paintFrames(orientation, 5, 24, (state) => state);
  }
});

test("incremental repaint matches a full repaint through a full pitch sweep", () => {
  // Sweeping the pitch continuously is the case rotation makes dangerous: the
  // ink inside every cell moves while the cell's own rounded anchor may not.
  for (const orientation of ["landscape", "portrait"]) {
    paintFrames(orientation, 83, 40, (state, frame) => ({
      ...state,
      individuals: state.individuals.map((fish, index) => {
        const pitch = Math.sin((frame + index * 3) * 0.21) * 32;
        return { ...fish, visual: { ...fish.visual, pitch, targetPitch: pitch } };
      }),
    }));
  }
});

test("incremental repaint matches a full repaint while pitched fish also turn", () => {
  // Pitch, turn compression and the swim wave all moving at once: the body
  // silhouette, the glyph anchors and the rotation index change together, and
  // every one of them has to reach the signature.
  for (const orientation of ["landscape", "portrait"]) {
    paintFrames(orientation, 192, 40, (state, frame) => ({
      ...state,
      individuals: state.individuals.map((fish, index) => {
        const pitch = Math.cos((frame + index * 5) * 0.17) * 30;
        const progress = ((frame * 0.06 + index * 0.13) % 1);
        return {
          ...fish,
          visual: {
            ...fish.visual,
            pitch,
            targetPitch: pitch,
            turnProgress: progress,
            facing: index % 2 === 0 ? 1 : -1,
            targetFacing: index % 2 === 0 ? -1 : 1,
          },
        };
      }),
    }));
  }
});
