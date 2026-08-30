import { daylightFactor } from "../sim/tick.js";
import { DEPTH_LANES, LANE_CLARITY, LANE_HAZE } from "./depth.js?v=visual-depth-20260830";

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

// Sunlight entering the tank. The shafts are painted as background rectangles,
// so they need a colour rather than an alpha, and they have to stay on the
// water's own hue or they read as a lens flare pasted over the scene.
const DAY_SHAFT = "#8fe3d8";
const NIGHT_SHAFT = "#9d7d4c";
// The floor recedes: the crest where terrain meets water is the far edge and
// stays in shadow, while the strip nearest the bottom of the panel is the part
// closest to the viewer and picks up the most light.
const DAY_FLOOR_NEAR = "#26403a";
const NIGHT_FLOOR_NEAR = "#2b2318";
// Corners of the tank. A little falloff at the left and right edges is what
// turns six horizontal bands into a volume with a front pane.
const DAY_EDGE = "#04161c";
const NIGHT_EDGE = "#150f08";

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

function hazeList(colors, fog, amount) {
  return colors.map((color) => mixColor(color, fog, amount));
}

function hazeMap(colors, fog, amount, transform = (color) => color) {
  return Object.fromEntries(Object.entries(colors)
    .map(([key, color]) => [key, mixColor(transform(color), fog, amount)]));
}

export function scenePalette(state) {
  const daylight = daylightFactor(state.timeOfDayHours);
  const paletteStage = Math.round((1 - daylight) * PALETTE_STEPS);
  const night = paletteStage / PALETTE_STEPS;
  const waterBands = DAY_WATER.map((color, index) => (night < 0.5
    ? mixColor(color, TWILIGHT_WATER[index], night * 2)
    : mixColor(TWILIGHT_WATER[index], NIGHT_WATER[index], (night - 0.5) * 2)));
  const bodyShadow = mixColor(DAY_BODY_SHADOW, NIGHT_BODY_SHADOW, night);
  const bodyFills = waterBands.map((color) => mixColor(color, bodyShadow, BODY_SHADE));
  // Everything distant is seen through water, so "distant" is a mix towards the
  // water rather than a mix towards grey. One representative mid-band stands in
  // for the whole column: the vertical ramp is gentle enough that a per-band fog
  // would cost five more tables to say the same thing.
  const fog = mixColor(waterBands[1], waterBands[4], 0.5);
  const clarityTint = mixColor(fog, "#ffffff", 0.55);
  const school = [
    mixColor("#6bd0ca", "#261d14", night),
    mixColor("#d5b76a", "#2b2218", night),
    mixColor("#78aeca", "#221b13", night),
    mixColor("#8abf96", "#281f16", night),
  ];
  const masks = mixMap(DAY_MASK, NIGHT_MASK, night);
  // One table per depth lane, built once per palette stage. Every per-frame
  // depth colour lookup downstream is an array index into this.
  const depthLanes = Array.from({ length: DEPTH_LANES }, (_, lane) => {
    const haze = LANE_HAZE[lane];
    const clarity = LANE_CLARITY[lane] * (1 - night);
    const lift = (color) => (clarity > 0 ? mixColor(color, clarityTint, clarity) : color);
    return Object.freeze({
      lane,
      haze,
      masks: Object.freeze(hazeMap(masks, fog, haze, lift)),
      school: Object.freeze(hazeList(school.map(lift), fog, haze)),
      // A far fish still has to occlude, so its body is hazed less than its ink:
      // it fades towards the water without dissolving into it.
      bodyFills: Object.freeze(hazeList(bodyFills, fog, haze * 0.72)),
    });
  });
  // Vegetation already ships three authored depth groups. They were three
  // shades of the same distance; putting them on the same fog ramp as the fish
  // is what makes a plant belong to a plane instead of to a layer index.
  const plantFog = Object.freeze({ background: 0.46, midground: 0.2, foreground: 0 });
  const plants = {
    background: hazeList(mixList(DAY_PLANTS.background, NIGHT_PLANTS.background, night), fog, plantFog.background),
    midground: hazeList(mixList(DAY_PLANTS.midground, NIGHT_PLANTS.midground, night), fog, plantFog.midground),
    foreground: hazeList(mixList(DAY_PLANTS.foreground, NIGHT_PLANTS.foreground, night), fog, plantFog.foreground),
    growthTip: mixColor(DAY_PLANTS.growthTip, NIGHT_PLANTS.growthTip, night),
    glowTip: mixColor(DAY_PLANTS.glowTip, NIGHT_PLANTS.glowTip, night),
  };
  return {
    daylight: 1 - night,
    night,
    paletteStage,
    waterBands,
    bodyFills,
    fog,
    depthLanes,
    // Sun shafts, floor recession, and edge falloff are painted as background
    // rectangles, so each needs the colour the mix lands on, not an alpha.
    shaftLight: mixColor(DAY_SHAFT, NIGHT_SHAFT, night),
    floorNear: mixColor(DAY_FLOOR_NEAR, NIGHT_FLOOR_NEAR, night),
    edge: mixColor(DAY_EDGE, NIGHT_EDGE, night),
    // A small real air/glass strip now sits above the visible water boundary.
    // It stays darker than the water so the surface reads immediately without
    // spending valuable panel height on a decorative header.
    airBg: mixColor("#09282c", "#1d1710", night),
    waterline: mixColor("#58c3c4", "#8a7048", night),
    school,
    plants,
    plantBack: plants.background[0],
    plantFront: plants.foreground[0],
    // The floor is deliberately subdued and closer to the vegetation palette.
    // With only two rows of depth it reads as terrain rather than a brown panel.
    substrateBg: mixColor("#142522", "#211b14", night),
    substrateFg: mixColor("#536a55", "#30271c", night),
    ripple: mixColor("#e6d992", "#9a7d4e", night),
    ambient: mixColor("#74abae", "#3c2f1e", night),
    masks,
    recommendedBacklight: 0.2 + (1 - night) * 0.8,
  };
}

// `verticalDepth` is where in the water column the fish is swimming, and picks
// the band companion. `lane` is how far it is from the glass, and picks how far
// that companion has already been faded into the water.
// A null lane asks for the unhazed companion, which is what the motion lab
// wants: the lab is a reference for the artwork, not a view into the tank.
export function bodyFillForDepth(palette, verticalDepth, lane = null) {
  const fills = lane === null
    ? palette.bodyFills
    : palette.depthLanes[Math.max(0, Math.min(DEPTH_LANES - 1, lane))].bodyFills;
  const index = Math.floor(Math.max(0, Math.min(0.999, verticalDepth)) * fills.length);
  return fills[index];
}
