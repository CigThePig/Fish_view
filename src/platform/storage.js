import {
  advanceOffline,
  restorePersistentState,
  serializePersistentState,
} from "../sim/state.js";

const STORAGE_PREFIX = "fish-view:aquarium";

function keyFor(state) {
  return `${STORAGE_PREFIX}:${state.seed}`;
}

export function loadPersistedState(baseState, nowMs = Date.now()) {
  try {
    const raw = globalThis.localStorage?.getItem(keyFor(baseState))
      ?? globalThis.localStorage?.getItem(legacyKey(baseState, "landscape"));
    if (!raw) return baseState;
    const envelope = JSON.parse(raw);
    const restored = restorePersistentState(baseState, envelope.state);
    // An incompatible/corrupt envelope must not age a brand-new aquarium.
    if (restored === baseState) return baseState;
    const elapsed = Math.max(0, (nowMs - Number(envelope.savedAtMs ?? nowMs)) / 1000);
    const state = advanceOffline(restored, elapsed);
    savePersistedState(state, nowMs);
    return state;
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
    removeLegacy(state);
    return true;
  } catch {
    return false;
  }
}

export function clearPersistedState(state) {
  try {
    if (!globalThis.localStorage) return false;
    globalThis.localStorage.removeItem(keyFor(state));
    removeLegacy(state);
    return true;
  } catch {
    return false;
  }
}

// Only the old landscape save can be imported. Remove prototype keys only
// after a successful canonical write, so quota failures cannot lose the save.
function legacyKey(state, orientation) {
  return `fish-view:phase-0:${state.seed}:${orientation}`;
}
function removeLegacy(state) {
  for (const orientation of ["landscape", "portrait"]) {
    globalThis.localStorage.removeItem(legacyKey(state, orientation));
  }
}
