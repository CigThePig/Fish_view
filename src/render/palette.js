import { daylightFactor } from "../sim/tick.js";

const DAY_MASK = Object.freeze({
  c: "#319d9d", C: "#62d5d0", r: "#b85b58", R: "#e77b72",
  y: "#ae8b49", Y: "#e7c46f", b: "#477fa1", B: "#71abc8",
  g: "#4f8c65", G: "#75b986", m: "#8b638e", M: "#bc86ba", W: "#d9e7dc",
});

const NIGHT_MASK = Object.freeze({
  c: "#13201c", C: "#192821", r: "#261c17", R: "#2e2119",
  y: "#2b2419", Y: "#342a1c", b: "#15231f", B: "#1b2b25",
  g: "#15231a", G: "#1b2a1e", m: "#241d1d", M: "#2d2421", W: "#4f4b3c",
});

const DAY_WATER = Object.freeze(["#123f46", "#0e373f", "#0b3039", "#082933", "#07232d", "#061d27"]);
const NIGHT_WATER = Object.freeze(["#514534", "#454239", "#39413a", "#303d38", "#293934", "#23332f"]);

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

export function scenePalette(state) {
  const daylight = daylightFactor(state.timeOfDayHours);
  const paletteStage = Math.round((1 - daylight) * PALETTE_STEPS);
  const night = paletteStage / PALETTE_STEPS;
  return {
    daylight: 1 - night,
    night,
    paletteStage,
    waterBands: DAY_WATER.map((color, index) => mixColor(color, NIGHT_WATER[index], night)),
    waterline: mixColor("#58c3c4", "#2d3024", night),
    school: [
      mixColor("#6bd0ca", "#17251f", night),
      mixColor("#d5b76a", "#2a2418", night),
      mixColor("#78aeca", "#182620", night),
      mixColor("#8abf96", "#1d291d", night),
    ],
    plantBack: mixColor("#386d59", "#1b2920", night),
    plantFront: mixColor("#64a47a", "#253126", night),
    substrateBg: mixColor("#251b16", "#493d2f", night),
    substrateAlt: mixColor("#302119", "#514433", night),
    substrateFg: mixColor("#a37d52", "#2b251d", night),
    ripple: mixColor("#e6d992", "#39301f", night),
    ambient: mixColor("#74abae", "#2a342b", night),
    masks: mixMap(DAY_MASK, NIGHT_MASK, night),
    recommendedBacklight: 0.2 + (1 - night) * 0.8,
  };
}
