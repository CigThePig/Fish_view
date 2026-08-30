import { daylightFactor } from "../sim/tick.js";

const DAY_MASK = Object.freeze({
  c: "#30a9a7",
  C: "#61e7df",
  r: "#bd4a4d",
  R: "#ff716e",
  y: "#b28b3d",
  Y: "#ffd76a",
  b: "#397db3",
  B: "#63bff2",
  g: "#4c9a67",
  G: "#72d68f",
  m: "#9a589f",
  M: "#dd82df",
  W: "#dff6ee",
});

const NIGHT_MASK = Object.freeze({
  c: "#0b2523",
  C: "#12322d",
  r: "#2d1c16",
  R: "#382318",
  y: "#392b18",
  Y: "#49351d",
  b: "#102624",
  B: "#17302c",
  g: "#10271f",
  G: "#173326",
  m: "#291e22",
  M: "#35262a",
  W: "#6f6a56",
});

export const MASK_SYMBOLS = Object.freeze(["c", "C", "r", "R", "y", "Y", "b", "B", "g", "G", "m", "M"]);

export function scenePalette(state) {
  const daylight = daylightFactor(state.timeOfDayHours);
  const night = 1 - daylight;
  const isNightInk = night >= 0.52;
  return {
    daylight,
    night,
    nightLevel: Math.round(night * 16),
    isNightInk,
    dayWater: "#000a0d",
    nightWaterTeal: "#35534a",
    nightWaterAmber: "#493e2d",
    waterline: isNightInk ? "#233226" : "#36a7b4",
    school: isNightInk
      ? ["#0a211e", "#14251e", "#241d12"]
      : ["#65d8d3", "#e5ba65", "#7bbbe0"],
    plantBack: isNightInk ? "#14261d" : "#31694e",
    plantFront: isNightInk ? "#1d2f22" : "#58a468",
    substrateBg: isNightInk ? "#584833" : "#24170f",
    substrateFg: isNightInk ? "#2d2419" : "#987047",
    ripple: isNightInk ? "#302817" : "#e8d98c",
    masks: isNightInk ? NIGHT_MASK : DAY_MASK,
  };
}

