import {
  advanceOffline,
  restorePersistentState,
  serializePersistentState,
} from "../sim/state.js";

const STORAGE_PREFIX = "fish-view:phase-0";

function keyFor(state) {
  return `${STORAGE_PREFIX}:${state.seed}:${state.orientation}`;
}

export function loadPersistedState(baseState, nowMs = Date.now()) {
  try {
    const raw = globalThis.localStorage?.getItem(keyFor(baseState));
    if (!raw) return baseState;
    const envelope = JSON.parse(raw);
    const restored = restorePersistentState(baseState, envelope.state);
    // An incompatible/corrupt envelope must not age a brand-new aquarium.
    if (restored === baseState) return baseState;
    const elapsed = Math.max(0, (nowMs - Number(envelope.savedAtMs ?? nowMs)) / 1000);
    return advanceOffline(restored, elapsed);
  } catch {
    return baseState;
  }
}

export function savePersistedState(state, nowMs = Date.now()) {
  try {
    const envelope = {
      savedAtMs: nowMs,
      state: serializePersistentState(state),
    };
    if (!globalThis.localStorage) return false;
    globalThis.localStorage.setItem(keyFor(state), JSON.stringify(envelope));
    return true;
  } catch {
    return false;
  }
}

export function clearPersistedState(state) {
  try {
    if (!globalThis.localStorage) return false;
    globalThis.localStorage.removeItem(keyFor(state));
    return true;
  } catch {
    return false;
  }
}
