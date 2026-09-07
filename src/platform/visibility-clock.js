// A hidden tab stops receiving animation frames. Its state belongs to the
// instant it was paused, including when a later autosave/pagehide writes it.
// Keeping that timestamp prevents autosaves from erasing time spent away.
export class VisibilityClock {
  constructor() {
    this.hiddenAtMs = null;
  }

  pause(nowMs) {
    if (this.hiddenAtMs === null) this.hiddenAtMs = nowMs;
  }

  resume(nowMs) {
    if (this.hiddenAtMs === null) return 0;
    const elapsed = Math.max(0, (nowMs - this.hiddenAtMs) / 1000);
    this.hiddenAtMs = null;
    return elapsed;
  }

  saveTimestamp(nowMs) {
    return this.hiddenAtMs ?? nowMs;
  }
}
