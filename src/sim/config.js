export const ORIENTATIONS = Object.freeze({
  portrait: Object.freeze({
    id: "portrait",
    cols: 40,
    rows: 33,
    pixelWidth: 480,
    pixelHeight: 792,
  }),
  landscape: Object.freeze({
    id: "landscape",
    cols: 66,
    rows: 20,
    pixelWidth: 792,
    pixelHeight: 480,
  }),
});

export const CELL_WIDTH = 12;
export const CELL_HEIGHT = 24;
export const WATERLINE_ROWS = 2;
export const SUBSTRATE_ROWS = 4;
export const DEFAULT_SEED = 0xa51c0a7e;

export const DEFAULT_SETTINGS = Object.freeze({
  timeScale: 1,
  schoolCount: 32,
  separation: 1.25,
  alignment: 0.72,
  cohesion: 0.48,
  boundary: 1.1,
  depthPreference: 0.24,
  schoolSpeed: 1.45,
});

export function orientationConfig(orientation) {
  const config = ORIENTATIONS[orientation];
  if (!config) throw new Error(`Unknown orientation: ${orientation}`);
  return config;
}

export function waterBounds(state) {
  return {
    top: WATERLINE_ROWS,
    bottom: state.rows - SUBSTRATE_ROWS,
    height: state.rows - WATERLINE_ROWS - SUBSTRATE_ROWS,
  };
}

