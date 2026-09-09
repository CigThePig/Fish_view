import { DISPLAY } from "../sim/config.js";

// A 64 × 64 canonical-pixel corner, with a 32 CSS-pixel minimum on small
// screens (bounded to a quarter of either displayed dimension).
export function aquariumPoint(event, rect) {
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const width = Math.min(rect.width / 4, Math.max(32, rect.width * 64 / DISPLAY.pixelWidth));
  const height = Math.min(rect.height / 4, Math.max(32, rect.height * 64 / DISPLAY.pixelHeight));
  return {
    x: x / rect.width * DISPLAY.cols,
    y: y / rect.height * DISPLAY.rows,
    hotspot: x >= rect.width - width && x <= rect.width && y >= 0 && y <= height,
  };
}

export class DeveloperGesture {
  #taps = [];
  reset() { this.#taps = []; }
  tap(inside, now) {
    if (!inside) { this.reset(); return false; }
    this.#taps = this.#taps.filter((time) => now - time <= 3000);
    this.#taps.push(now);
    if (this.#taps.length < 3) return false;
    this.reset();
    return true;
  }
}
