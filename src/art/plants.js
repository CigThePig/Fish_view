/*
 * Static plant art descriptors.
 *
 * A descriptor is compiled once at module load into a shallow parent-index
 * joint array. Runtime plant instances only carry identity, long-horizon
 * growth, mature size, and a handful of seeded motion traits. No animated
 * joint positions are stored here or in persistence.
 */

const UP = -Math.PI / 2;

function segment(length, angle = 0, stage = 0, role = "stem", glyph = null, detail = false) {
  return Object.freeze({
    length,
    angle,
    stage,
    role,
    glyph: Array.isArray(glyph) ? Object.freeze([...glyph]) : glyph,
    detail,
  });
}

const s = segment;

function compileSpecies(definition) {
  const source = [{
    parent: -1,
    length: 0,
    angle: 0,
    stage: 0,
    role: "root",
    glyph: null,
    detail: false,
  }];

  let parent = 0;
  for (const item of definition.trunk) {
    source.push({ ...item, parent });
    parent = source.length - 1;
  }
  for (const branch of definition.branches ?? []) {
    parent = branch.parent;
    for (const item of branch.segments) {
      source.push({ ...item, parent });
      parent = source.length - 1;
    }
  }

  const angles = new Array(source.length).fill(UP);
  const xs = new Array(source.length).fill(0);
  const ys = new Array(source.length).fill(0);
  const paths = new Array(source.length).fill(0);
  const childCounts = new Array(source.length).fill(0);
  let nominalHeight = 0;
  let maximumPath = 0;
  let maximumStage = 0;

  for (let index = 1; index < source.length; index += 1) {
    const joint = source[index];
    if (!Number.isInteger(joint.parent) || joint.parent < 0 || joint.parent >= index) {
      throw new Error(`Invalid parent in plant species ${definition.id} at joint ${index}`);
    }
    const parentJoint = source[joint.parent];
    if (joint.stage < parentJoint.stage) {
      throw new Error(`Growth stage precedes parent in plant species ${definition.id} at joint ${index}`);
    }
    childCounts[joint.parent] += 1;
    angles[index] = angles[joint.parent] + joint.angle;
    xs[index] = xs[joint.parent] + Math.cos(angles[index]) * joint.length;
    ys[index] = ys[joint.parent] + Math.sin(angles[index]) * joint.length;
    paths[index] = paths[joint.parent] + joint.length;
    nominalHeight = Math.max(nominalHeight, -ys[index]);
    maximumPath = Math.max(maximumPath, paths[index]);
    maximumStage = Math.max(maximumStage, joint.stage);
  }

  const joints = source.map((joint, index) => Object.freeze({
    ...joint,
    restAngle: angles[index],
    pathProgress: index === 0 || maximumPath === 0 ? 0 : paths[index] / maximumPath,
    lagSin: index === 0 || maximumPath === 0 ? 0 : Math.sin((paths[index] / maximumPath) * 0.72),
    lagCos: index === 0 || maximumPath === 0 ? 1 : Math.cos((paths[index] / maximumPath) * 0.72),
    branchSign: index === 0 ? 0 : Math.sign(joint.angle) || (index & 1 ? -1 : 1),
    childCount: childCounts[index],
  }));

  return Object.freeze({
    ...definition,
    heightRange: Object.freeze([...definition.heightRange]),
    stemGlyphs: Object.freeze({
      left: Object.freeze([...definition.stemGlyphs.left]),
      upright: Object.freeze([...definition.stemGlyphs.upright]),
      right: Object.freeze([...definition.stemGlyphs.right]),
    }),
    tipGlyphs: Object.freeze([...definition.tipGlyphs]),
    joints: Object.freeze(joints),
    nominalHeight: Math.max(0.5, nominalHeight),
    maximumPath,
    maximumStage,
    maximumGlyphs: joints.length - 1,
  });
}

const GRASS_STEMS = Object.freeze({ left: ["\\"], upright: ["|"], right: ["/"] });
const SOFT_STEMS = Object.freeze({ left: ["\\", "}"], upright: ["|", "{"], right: ["/", "{"] });
const RIBBON_STEMS = Object.freeze({ left: ["}", ")"], upright: ["{", "}"], right: ["{", "("] });
const REED_STEMS = Object.freeze({ left: ["\\", "|"], upright: ["|"], right: ["/", "|"] });

function species({
  id,
  name,
  family,
  layer,
  heightRange,
  trunk,
  branches = [],
  stemGlyphs = SOFT_STEMS,
  tipGlyphs = ["'", "."],
  growthStepDays = 7,
  sway = 1,
  current = 1,
  stiffness = 0.5,
  paletteSlot = 0,
  rare = false,
  glowTips = false,
}) {
  return compileSpecies({
    id,
    name,
    family,
    layer,
    heightRange,
    trunk: Object.freeze(trunk),
    branches: Object.freeze(branches.map((branch) => Object.freeze({
      parent: branch.parent,
      segments: Object.freeze(branch.segments),
    }))),
    stemGlyphs,
    tipGlyphs,
    growthStepDays,
    sway,
    current,
    stiffness,
    paletteSlot,
    rare,
    glowTips,
  });
}

export const PLANT_SPECIES = Object.freeze([
  species({
    id: "needle-grass", name: "Needle grass", family: "grass", layer: "foreground", heightRange: [0.1, 0.19],
    stemGlyphs: GRASS_STEMS, tipGlyphs: ["'", "/", "\\"], growthStepDays: 5, sway: 1.16, current: 1.08, stiffness: 0.58,
    trunk: [s(0.72, -0.04, 0), s(0.72, 0.08, 1), s(0.66, -0.04, 2)],
    branches: [
      { parent: 0, segments: [s(1.28, -0.48, 1, "leaf", "\\")] },
      { parent: 0, segments: [s(1.18, 0.52, 2, "leaf", "/")] },
    ],
  }),
  species({
    id: "split-grass", name: "Split grass", family: "grass", layer: "foreground", heightRange: [0.12, 0.22],
    stemGlyphs: GRASS_STEMS, tipGlyphs: ["'", "/", "\\"], growthStepDays: 5.5, sway: 1.08, current: 1.05, stiffness: 0.6, paletteSlot: 1,
    trunk: [s(0.74, 0, 0), s(0.76, -0.02, 1, "fork", "Y"), s(0.7, -0.34, 2)],
    branches: [
      { parent: 2, segments: [s(0.86, 0.72, 2, "leaf", "/")] },
      { parent: 2, segments: [s(0.72, -0.76, 3, "leaf", "\\")] },
    ],
  }),
  species({
    id: "ground-tuft", name: "Ground tuft", family: "grass", layer: "foreground", heightRange: [0.09, 0.17],
    stemGlyphs: GRASS_STEMS, tipGlyphs: ["'", "."], growthStepDays: 4.8, sway: 1.2, current: 1.12, stiffness: 0.62, paletteSlot: 2,
    trunk: [s(0.66, 0.03, 0), s(0.66, -0.04, 1)],
    branches: [
      { parent: 0, segments: [s(1.0, -0.82, 1, "leaf", "\\")] },
      { parent: 0, segments: [s(0.88, -0.38, 2, "leaf", "\\")] },
      { parent: 0, segments: [s(0.94, 0.42, 1, "leaf", "/")] },
      { parent: 0, segments: [s(1.05, 0.78, 2, "leaf", "/")] },
    ],
  }),
  species({
    id: "tiny-broadleaf", name: "Tiny broadleaf", family: "leaf", layer: "foreground", heightRange: [0.11, 0.2],
    stemGlyphs: REED_STEMS, tipGlyphs: [".", "o"], growthStepDays: 6, sway: 0.94, current: 0.92, stiffness: 0.66,
    trunk: [s(0.7, 0, 0), s(0.7, 0.03, 1), s(0.58, -0.04, 3, "tip", ".")],
    branches: [
      { parent: 2, segments: [s(0.52, -1.02, 2, "leaf", "(")] },
      { parent: 2, segments: [s(0.52, 1.02, 2, "leaf", ")")] },
    ],
  }),
  species({
    id: "crooked-sprout", name: "Crooked sprout", family: "leaf", layer: "foreground", heightRange: [0.13, 0.23],
    stemGlyphs: SOFT_STEMS, tipGlyphs: ["'", "("], growthStepDays: 6.4, sway: 1.05, current: 1, stiffness: 0.56, paletteSlot: 1,
    trunk: [s(0.72, -0.08, 0), s(0.74, -0.15, 1), s(0.7, 0.2, 2), s(0.62, 0.12, 3)],
    branches: [{ parent: 2, segments: [s(0.6, -1.08, 2, "leaf", "(")] }],
  }),
  species({
    id: "fork-tuft", name: "Fork tuft", family: "grass", layer: "foreground", heightRange: [0.13, 0.23],
    stemGlyphs: GRASS_STEMS, tipGlyphs: ["'", "."], growthStepDays: 5.4, sway: 1.12, current: 1.08, stiffness: 0.59,
    trunk: [s(0.72, 0, 0), s(0.72, 0.03, 1, "fork", "Y"), s(0.76, -0.32, 2)],
    branches: [{ parent: 2, segments: [s(0.7, 0.64, 2), s(0.64, 0.08, 3)] }],
  }),
  species({
    id: "fan-grass", name: "Fan grass", family: "grass", layer: "foreground", heightRange: [0.12, 0.21],
    stemGlyphs: GRASS_STEMS, tipGlyphs: ["'", "."], growthStepDays: 5.1, sway: 1.18, current: 1.12, stiffness: 0.61, paletteSlot: 2,
    trunk: [s(0.68, 0, 0), s(0.7, 0, 1)],
    branches: [
      { parent: 0, segments: [s(1.06, -0.92, 1, "leaf", "\\")] },
      { parent: 0, segments: [s(1.16, -0.48, 2, "leaf", "\\")] },
      { parent: 0, segments: [s(1.2, 0.08, 1, "leaf", "|")] },
      { parent: 0, segments: [s(1.12, 0.5, 2, "leaf", "/")] },
      { parent: 0, segments: [s(1.02, 0.92, 3, "leaf", "/")] },
    ],
  }),
  species({
    id: "pearl-sprout", name: "Pearl sprout", family: "leaf", layer: "foreground", heightRange: [0.12, 0.22],
    stemGlyphs: REED_STEMS, tipGlyphs: ["o"], growthStepDays: 6.2, sway: 0.9, current: 0.9, stiffness: 0.67, paletteSlot: 1,
    trunk: [s(0.72, 0, 0), s(0.72, -0.04, 1), s(0.64, 0.08, 3, "tip", "o")],
    branches: [
      { parent: 2, segments: [s(0.56, -1.05, 2, "leaf", "(")] },
      { parent: 2, segments: [s(0.48, 0.98, 2, "leaf", ")")] },
    ],
  }),

  species({
    id: "soft-ribbon", name: "Soft ribbon", family: "ribbon", layer: "midground", heightRange: [0.27, 0.44],
    stemGlyphs: RIBBON_STEMS, tipGlyphs: ["{", "("], growthStepDays: 7, sway: 1.05, current: 1.08, stiffness: 0.38,
    trunk: [s(0.82, -0.03, 0), s(0.84, -0.12, 0), s(0.86, 0.2, 1), s(0.86, 0.16, 2), s(0.84, -0.22, 3), s(0.8, -0.14, 4), s(0.74, 0.18, 5)],
  }),
  species({
    id: "double-ribbon", name: "Double ribbon", family: "ribbon", layer: "midground", heightRange: [0.26, 0.43],
    stemGlyphs: RIBBON_STEMS, tipGlyphs: ["(", ")"], growthStepDays: 7.4, sway: 0.96, current: 1.02, stiffness: 0.43, paletteSlot: 1,
    trunk: [s(0.8, -0.2, 0), s(0.82, -0.04, 1), s(0.84, 0.18, 2), s(0.82, 0.12, 3), s(0.76, -0.14, 4)],
    branches: [{ parent: 0, segments: [s(0.78, 0.22, 0), s(0.82, 0.04, 1), s(0.84, -0.2, 2), s(0.8, -0.1, 3), s(0.72, 0.16, 4)] }],
  }),
  species({
    id: "alternating-leaf", name: "Alternating leaf stem", family: "leaf", layer: "midground", heightRange: [0.27, 0.45],
    stemGlyphs: REED_STEMS, tipGlyphs: ["'", "."], growthStepDays: 7.5, sway: 0.92, current: 0.94, stiffness: 0.55,
    trunk: [s(0.78, 0, 0), s(0.8, 0.03, 1), s(0.8, -0.05, 2), s(0.82, 0.04, 3), s(0.8, -0.02, 4), s(0.72, 0.06, 5)],
    branches: [
      { parent: 2, segments: [s(0.7, -1.02, 2, "leaf", "(")] },
      { parent: 3, segments: [s(0.72, 1.05, 3, "leaf", ")")] },
      { parent: 4, segments: [s(0.74, -1.06, 4, "leaf", "(")] },
      { parent: 5, segments: [s(0.68, 1.02, 5, "leaf", ")")] },
    ],
  }),
  species({
    id: "bushy-grass", name: "Bushy grass", family: "grass", layer: "midground", heightRange: [0.25, 0.42],
    stemGlyphs: GRASS_STEMS, tipGlyphs: ["'", "."], growthStepDays: 6.6, sway: 1.08, current: 1.08, stiffness: 0.5, paletteSlot: 2,
    trunk: [s(0.78, 0, 0), s(0.78, 0.02, 1), s(0.78, -0.03, 2), s(0.76, 0.04, 3), s(0.7, -0.03, 4)],
    branches: [
      { parent: 1, segments: [s(1.2, -0.72, 2, "leaf", "\\")] },
      { parent: 2, segments: [s(1.14, 0.7, 2, "leaf", "/")] },
      { parent: 3, segments: [s(1.0, -0.75, 3, "leaf", "\\")] },
      { parent: 4, segments: [s(0.9, 0.78, 4, "leaf", "/")] },
    ],
  }),
  species({
    id: "feather-weed", name: "Feather weed", family: "leaf", layer: "midground", heightRange: [0.28, 0.46],
    stemGlyphs: REED_STEMS, tipGlyphs: ["'", "^"], growthStepDays: 7.8, sway: 0.82, current: 0.88, stiffness: 0.59, paletteSlot: 1,
    trunk: [s(0.82, 0, 0), s(0.82, -0.01, 1), s(0.82, 0.02, 2), s(0.8, -0.02, 3), s(0.74, 0.02, 4)],
    branches: [
      { parent: 2, segments: [s(0.82, -1.18, 2, "leaf", "-")] },
      { parent: 2, segments: [s(0.82, 1.18, 2, "leaf", "-")] },
      { parent: 3, segments: [s(0.72, -1.16, 3, "leaf", "-")] },
      { parent: 3, segments: [s(0.72, 1.16, 3, "leaf", "-")] },
      { parent: 4, segments: [s(0.62, -1.1, 4, "leaf", "/")] },
      { parent: 4, segments: [s(0.62, 1.1, 4, "leaf", "\\")] },
    ],
  }),
  species({
    id: "curlweed", name: "Curlweed", family: "ribbon", layer: "midground", heightRange: [0.29, 0.48],
    stemGlyphs: RIBBON_STEMS, tipGlyphs: ["@"], growthStepDays: 8, sway: 1.06, current: 1.12, stiffness: 0.36, paletteSlot: 2,
    trunk: [s(0.82, -0.04, 0), s(0.84, -0.14, 1), s(0.84, -0.14, 2), s(0.82, 0.08, 3), s(0.78, 0.22, 4), s(0.7, 0.32, 5), s(0.58, 0.38, 5, "tip", "@")],
  }),
  species({
    id: "broadleaf-stem", name: "Broadleaf stem", family: "leaf", layer: "midground", heightRange: [0.28, 0.47],
    stemGlyphs: REED_STEMS, tipGlyphs: ["o", "'"], growthStepDays: 8.2, sway: 0.78, current: 0.84, stiffness: 0.64,
    trunk: [s(0.82, 0, 0), s(0.84, 0.02, 1), s(0.84, -0.02, 2), s(0.84, 0.02, 3), s(0.8, -0.02, 4), s(0.72, 0.04, 5)],
    branches: [
      { parent: 2, segments: [s(0.7, -1.0, 2, "leaf", "(")] },
      { parent: 2, segments: [s(0.7, 1.0, 2, "leaf", ")")] },
      { parent: 4, segments: [s(0.76, -1.02, 4, "leaf", "(")] },
      { parent: 4, segments: [s(0.76, 1.02, 4, "leaf", ")")] },
    ],
  }),
  species({
    id: "willow-spray", name: "Willow spray", family: "leaf", layer: "midground", heightRange: [0.3, 0.49],
    stemGlyphs: SOFT_STEMS, tipGlyphs: ["'", "."], growthStepDays: 7.2, sway: 1.02, current: 1, stiffness: 0.46, paletteSlot: 1,
    trunk: [s(0.8, -0.02, 0), s(0.82, -0.07, 1), s(0.82, -0.08, 2), s(0.82, 0.02, 3), s(0.78, 0.1, 4), s(0.7, 0.12, 5)],
    branches: [
      { parent: 2, segments: [s(0.76, -0.95, 2, "leaf", "{")] },
      { parent: 3, segments: [s(0.74, 1.02, 3, "leaf", ")")] },
      { parent: 4, segments: [s(0.7, -1.0, 4, "leaf", "(")] },
      { parent: 5, segments: [s(0.64, 0.96, 5, "leaf", "}")] },
    ],
  }),
  species({
    id: "ladder-leaf", name: "Ladder leaf", family: "leaf", layer: "midground", heightRange: [0.26, 0.44],
    stemGlyphs: REED_STEMS, tipGlyphs: ["^", "'"], growthStepDays: 7.1, sway: 0.84, current: 0.9, stiffness: 0.61, paletteSlot: 2,
    trunk: [s(0.84, 0, 0), s(0.84, 0, 1), s(0.84, 0, 2), s(0.82, 0, 3), s(0.74, 0, 4)],
    branches: [
      { parent: 2, segments: [s(0.72, -1.2, 2, "leaf", "-")] },
      { parent: 2, segments: [s(0.72, 1.2, 2, "leaf", "-")] },
      { parent: 4, segments: [s(0.68, -1.18, 4, "leaf", "-")] },
      { parent: 4, segments: [s(0.68, 1.18, 4, "leaf", "-")] },
    ],
  }),
  species({
    id: "comb-grass", name: "Comb grass", family: "grass", layer: "midground", heightRange: [0.27, 0.45],
    stemGlyphs: GRASS_STEMS, tipGlyphs: ["'", "."], growthStepDays: 6.8, sway: 1.1, current: 1.08, stiffness: 0.53,
    trunk: [s(0.8, 0, 0), s(0.8, -0.02, 1), s(0.8, -0.02, 2), s(0.78, 0.03, 3), s(0.7, 0.04, 4)],
    branches: [
      { parent: 1, segments: [s(0.86, 0.9, 2, "leaf", "/")] },
      { parent: 2, segments: [s(0.82, 0.9, 2, "leaf", "/")] },
      { parent: 3, segments: [s(0.74, 0.88, 3, "leaf", "/")] },
      { parent: 4, segments: [s(0.66, 0.86, 4, "leaf", "/")] },
    ],
  }),

  species({
    id: "long-kelp", name: "Long kelp", family: "kelp", layer: "background", heightRange: [0.46, 0.7],
    stemGlyphs: RIBBON_STEMS, tipGlyphs: ["{", "}"], growthStepDays: 8.5, sway: 0.78, current: 1.06, stiffness: 0.34,
    trunk: [s(0.9, 0, 0), s(0.92, -0.06, 0), s(0.94, -0.12, 1), s(0.94, 0.18, 2), s(0.94, 0.16, 3), s(0.92, -0.2, 4), s(0.9, -0.14, 5), s(0.86, 0.18, 6), s(0.8, 0.12, 7), s(0.7, -0.16, 8)],
  }),
  species({
    id: "ribbon-kelp", name: "Ribbon kelp", family: "kelp", layer: "background", heightRange: [0.44, 0.68],
    stemGlyphs: RIBBON_STEMS, tipGlyphs: ["/", "("], growthStepDays: 8.3, sway: 0.86, current: 1.1, stiffness: 0.31, paletteSlot: 1,
    trunk: [s(0.92, -0.04, 0), s(0.94, -0.12, 1), s(0.94, -0.14, 2), s(0.92, 0.22, 3), s(0.9, 0.22, 4), s(0.86, -0.24, 5), s(0.82, -0.18, 6), s(0.76, 0.2, 7), s(0.66, 0.16, 8)],
  }),
  species({
    id: "tall-forkgrass", name: "Tall forkgrass", family: "reed", layer: "background", heightRange: [0.43, 0.66],
    stemGlyphs: REED_STEMS, tipGlyphs: ["'", "/", "\\"], growthStepDays: 8, sway: 0.72, current: 0.88, stiffness: 0.66, paletteSlot: 2,
    trunk: [s(0.9, 0, 0), s(0.92, 0, 1), s(0.92, -0.01, 2), s(0.92, 0.02, 3, "fork", "Y"), s(0.9, -0.18, 4), s(0.82, -0.14, 5)],
    branches: [{ parent: 4, segments: [s(0.88, 0.42, 4), s(0.84, 0.12, 5), s(0.76, 0.08, 6)] }],
  }),
  species({
    id: "leaf-reed", name: "Leaf reed", family: "reed", layer: "background", heightRange: [0.45, 0.69],
    stemGlyphs: REED_STEMS, tipGlyphs: ["'", "^"], growthStepDays: 8.8, sway: 0.68, current: 0.82, stiffness: 0.7,
    trunk: [s(0.9, 0, 0), s(0.92, 0, 1), s(0.92, 0, 2), s(0.92, -0.01, 3), s(0.9, 0.02, 4), s(0.88, -0.01, 5), s(0.84, 0.02, 6), s(0.76, 0, 7)],
    branches: [
      { parent: 3, segments: [s(0.84, -0.92, 3, "leaf", "(")] },
      { parent: 5, segments: [s(0.8, 0.94, 5, "leaf", ")")] },
      { parent: 7, segments: [s(0.68, -0.9, 7, "leaf", "/")] },
    ],
  }),
  species({
    id: "long-frond", name: "Long frond", family: "reed", layer: "background", heightRange: [0.46, 0.72],
    stemGlyphs: REED_STEMS, tipGlyphs: ["'", "|"], growthStepDays: 9, sway: 0.7, current: 0.9, stiffness: 0.62, paletteSlot: 1,
    trunk: [s(0.9, 0, 0), s(0.92, 0, 1), s(0.92, 0.01, 2), s(0.92, 0.01, 3), s(0.9, -0.02, 4), s(0.88, -0.02, 5), s(0.84, 0.03, 6), s(0.76, 0.02, 7)],
    branches: [
      { parent: 2, segments: [s(1.08, -0.86, 2, "leaf", "\\")] },
      { parent: 3, segments: [s(1.0, -0.82, 3, "leaf", "\\")] },
      { parent: 4, segments: [s(0.92, -0.78, 4, "leaf", "\\")] },
      { parent: 5, segments: [s(0.82, -0.72, 5, "leaf", "\\")] },
    ],
  }),
  species({
    id: "split-reed", name: "Split reed", family: "reed", layer: "background", heightRange: [0.42, 0.65],
    stemGlyphs: REED_STEMS, tipGlyphs: ["'", "."], growthStepDays: 8.7, sway: 0.74, current: 0.88, stiffness: 0.68, paletteSlot: 2,
    trunk: [s(0.9, -0.06, 0), s(0.92, -0.03, 1), s(0.92, 0.02, 2), s(0.9, -0.02, 3), s(0.86, 0.03, 4), s(0.78, 0.03, 5)],
    branches: [{ parent: 0, segments: [s(0.88, 0.1, 0), s(0.9, 0.05, 1), s(0.9, -0.03, 2), s(0.88, 0.04, 3), s(0.84, -0.03, 4), s(0.76, -0.04, 5)] }],
  }),

  species({
    id: "spiral-weed", name: "Spiral weed", family: "feature", layer: "midground", heightRange: [0.3, 0.5],
    stemGlyphs: RIBBON_STEMS, tipGlyphs: ["@"], growthStepDays: 8.4, sway: 0.9, current: 1.02, stiffness: 0.42, paletteSlot: 2, rare: true,
    trunk: [s(0.78, 0, 0), s(0.78, -0.18, 1, "bead", "@"), s(0.76, -0.2, 2, "bead", "@"), s(0.72, 0.08, 3, "bead", "@"), s(0.68, 0.28, 4, "bead", "@"), s(0.62, 0.34, 5, "bead", "@"), s(0.56, 0.1, 6, "bead", "@"), s(0.48, -0.3, 7, "tip", "@")],
  }),
  species({
    id: "lantern-plant", name: "Lantern plant", family: "feature", layer: "midground", heightRange: [0.31, 0.49],
    stemGlyphs: REED_STEMS, tipGlyphs: ["*"], growthStepDays: 9, sway: 0.7, current: 0.78, stiffness: 0.7, paletteSlot: 1, rare: true, glowTips: true,
    trunk: [s(0.8, 0, 0), s(0.82, 0, 1), s(0.78, 0, 2, "lantern", "*"), s(0.82, 0, 3), s(0.8, 0, 4), s(0.76, 0, 5, "lantern", "*"), s(0.66, 0, 6, "tip", "*")],
    branches: [
      { parent: 3, segments: [s(0.56, -1.05, 2, "leaf", "(")] },
      { parent: 3, segments: [s(0.56, 1.05, 2, "leaf", ")")] },
      { parent: 6, segments: [s(0.52, -1.05, 5, "leaf", "(")] },
      { parent: 6, segments: [s(0.52, 1.05, 5, "leaf", ")")] },
    ],
  }),
  species({
    id: "split-ribbon", name: "Split ribbon", family: "feature", layer: "background", heightRange: [0.42, 0.66],
    stemGlyphs: RIBBON_STEMS, tipGlyphs: ["(", ")"], growthStepDays: 9.2, sway: 0.82, current: 1, stiffness: 0.4, rare: true,
    trunk: [s(0.88, -0.02, 0), s(0.9, -0.08, 1), s(0.9, -0.1, 2, "fork", "Y"), s(0.88, -0.2, 3), s(0.84, 0.08, 4), s(0.76, 0.16, 5)],
    branches: [{ parent: 3, segments: [s(0.88, 0.48, 3), s(0.84, -0.06, 4), s(0.8, -0.14, 5), s(0.7, -0.12, 6)] }],
  }),
  species({
    id: "floating-bell", name: "Floating bell", family: "feature", layer: "midground", heightRange: [0.31, 0.51],
    stemGlyphs: SOFT_STEMS, tipGlyphs: ["."], growthStepDays: 9.4, sway: 0.72, current: 0.8, stiffness: 0.64, paletteSlot: 2, rare: true, glowTips: true,
    trunk: [s(0.8, 0, 0), s(0.82, -0.04, 1), s(0.8, -0.08, 2), s(0.78, 0.12, 3), s(0.74, 0.14, 4), s(0.68, -0.1, 5, "bell", "^")],
    branches: [
      { parent: 6, segments: [s(0.62, -1.05, 5, "bell", "(")] },
      { parent: 6, segments: [s(0.56, 0, 5, "bell", "-")] },
      { parent: 6, segments: [s(0.62, 1.05, 5, "bell", ")")] },
      { parent: 4, segments: [s(0.58, -0.8, 4, "leaf", "(")] },
    ],
  }),
]);

export const PLANT_SPECIES_BY_ID = Object.freeze(Object.fromEntries(
  PLANT_SPECIES.map((item) => [item.id, item]),
));

export const PLANT_FAMILIES = Object.freeze({
  grass: Object.freeze(["needle-grass", "split-grass", "ground-tuft", "fork-tuft", "fan-grass"]),
  lowLeaf: Object.freeze(["tiny-broadleaf", "crooked-sprout", "pearl-sprout"]),
  ribbon: Object.freeze(["soft-ribbon", "double-ribbon", "curlweed"]),
  meadow: Object.freeze(["alternating-leaf", "bushy-grass", "feather-weed", "willow-spray", "ladder-leaf", "comb-grass"]),
  broadleaf: Object.freeze(["alternating-leaf", "broadleaf-stem", "willow-spray", "ladder-leaf"]),
  tall: Object.freeze(["long-kelp", "ribbon-kelp", "tall-forkgrass", "leaf-reed", "long-frond", "split-reed"]),
});

export const RARE_PLANT_IDS = Object.freeze(
  PLANT_SPECIES.filter((item) => item.rare).map((item) => item.id),
);

export const MAX_PLANT_JOINTS = Math.max(...PLANT_SPECIES.map((item) => item.joints.length - 1));
export const MAX_PLANT_GLYPHS = Math.max(...PLANT_SPECIES.map((item) => item.maximumGlyphs));
