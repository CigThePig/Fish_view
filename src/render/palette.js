import { daylightFactor } from "../sim/tick.js";

const DAY_MASK = Object.freeze({
  c: "#319d9d", C: "#62d5d0", r: "#b85b58", R: "#e77b72",
  y: "#ae8b49", Y: "#e7c46f", b: "#477fa1", B: "#71abc8",
  g: "#4f8c65", G: "#75b986", m: "#8b638e", M: "#bc86ba", W: "#d9e7dc",
});

// Night keeps one warm hue family so silhouettes read as shape rather than as
// competing colours. Only W stays bright: the eye is the single night accent.
const NIGHT_MASK = Object.freeze({
  c: "#1d1710", C: "#241d15", r: "#251a12", R: "#2c2016",
  y: "#261e13", Y: "#2e2417", b: "#1c1811", B: "#231e16",
  g: "#1d1a12", G: "#242017", m: "#231a14", M: "#2a2119", W: "#7d6642",
});

const DAY_WATER = Object.freeze(["#123f46", "#0e373f", "#0b3039", "#082933", "#07232d", "#061d27"]);
// A single amber ramp that only loses value with depth. The previous night
// ramp drifted from warm brown to cold green, which read as muddy banding.
const NIGHT_WATER = Object.freeze(["#5e4a33", "#54422d", "#493a28", "#3e3123", "#33281d", "#282017"]);
// Day teal and night amber sit on opposite sides of the colour wheel, so
// interpolating straight between them drains all the colour out of dusk. The
// water is routed through an explicit green twilight instead: it is the short
// way round the wheel, and it keeps every stage of the arc saturated.
const TWILIGHT_WATER = Object.freeze(["#1c4a3d", "#193f35", "#16362e", "#132e28", "#112722", "#0e201c"]);

const DAY_PLANTS = Object.freeze({
  background: Object.freeze(["#315f54", "#3a6757", "#456b51"]),
  midground: Object.freeze(["#417b66", "#538567", "#637f50"]),
  foreground: Object.freeze(["#568f6c", "#6b9c70", "#82975d"]),
  growthTip: "#91b08a",
  glowTip: "#a5b879",
});

// Vegetation becomes low-contrast moving shadow at night. The two special tip
// colours are still subdued; only rare species can request glowTip.
const NIGHT_PLANTS = Object.freeze({
  background: Object.freeze(["#211a12", "#251e14", "#271f15"]),
  midground: Object.freeze(["#271f15", "#2a2217", "#2d2318"]),
  foreground: Object.freeze(["#2c2317", "#302619", "#33291b"]),
  growthTip: "#382c1d",
  glowTip: "#493821",
});

// Fish bodies are opaque: each water band gets one pre-darkened companion so a
// fish occludes whatever swims or grows behind it without a per-frame mix.
const DAY_BODY_SHADOW = "#03161d";
const NIGHT_BODY_SHADOW = "#171006";
const BODY_SHADE = 0.44;

export const MASK_SYMBOLS = Object.freeze(["c", "C", "r", "R", "y", "Y", "b", "B", "g", "G", "m", "M"]);
export const PALETTE_STEPS = 12;

function channel(hex, offset) {
  return Number.parseInt(hex.slice(offset, offset + 2), 16);
}

export function mixColor(from, to, amount) {
  const value = Math.max(0, Math.min(1, amount));
  const mixed = [1, 3, 5].map((offset) => Math.round(
    channel(from, offset) + (channel(to, offset) - channel(from, offset)) * value,
  ));
  return `#${mixed.map((item) => item.toString(16).padStart(2, "0")).join("")}`;
}

function mixMap(day, night, amount) {
  return Object.fromEntries(Object.keys(day).map((key) => [key, mixColor(day[key], night[key], amount)]));
}

function mixList(day, night, amount) {
  return day.map((color, index) => mixColor(color, night[index], amount));
}

export function scenePalette(state) {
  const daylight = daylightFactor(state.timeOfDayHours);
  const paletteStage = Math.round((1 - daylight) * PALETTE_STEPS);
  const night = paletteStage / PALETTE_STEPS;
  const waterBands = DAY_WATER.map((color, index) => (night < 0.5
    ? mixColor(color, TWILIGHT_WATER[index], night * 2)
    : mixColor(TWILIGHT_WATER[index], NIGHT_WATER[index], (night - 0.5) * 2)));
  const bodyShadow = mixColor(DAY_BODY_SHADOW, NIGHT_BODY_SHADOW, night);
  const plants = {
    background: mixList(DAY_PLANTS.background, NIGHT_PLANTS.background, night),
    midground: mixList(DAY_PLANTS.midground, NIGHT_PLANTS.midground, night),
    foreground: mixList(DAY_PLANTS.foreground, NIGHT_PLANTS.foreground, night),
    growthTip: mixColor(DAY_PLANTS.growthTip, NIGHT_PLANTS.growthTip, night),
    glowTip: mixColor(DAY_PLANTS.glowTip, NIGHT_PLANTS.glowTip, night),
  };
  return {
    daylight: 1 - night,
    night,
    paletteStage,
    waterBands,
    bodyFills: waterBands.map((color) => mixColor(color, bodyShadow, BODY_SHADE)),
    waterline: mixColor("#58c3c4", "#8a7048", night),
    school: [
      mixColor("#6bd0ca", "#261d14", night),
      mixColor("#d5b76a", "#2b2218", night),
      mixColor("#78aeca", "#221b13", night),
      mixColor("#8abf96", "#281f16", night),
    ],
    plants,
    plantBack: plants.background[0],
    plantFront: plants.foreground[0],
    // The floor stays the darkest, quietest band at night; its grain sits a
    // few values above it so texture never becomes speckle.
    substrateBg: mixColor("#251b16", "#241c13", night),
    substrateFg: mixColor("#a37d52", "#342819", night),
    ripple: mixColor("#e6d992", "#9a7d4e", night),
    ambient: mixColor("#74abae", "#3c2f1e", night),
    masks: mixMap(DAY_MASK, NIGHT_MASK, night),
    recommendedBacklight: 0.2 + (1 - night) * 0.8,
  };
}

export function bodyFillForDepth(palette, depth) {
  const span = palette.bodyFills.length;
  const index = Math.floor(Math.max(0, Math.min(0.999, depth)) * span);
  return palette.bodyFills[index];
}
