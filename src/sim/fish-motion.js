import { spriteDimensions, spriteMouthOffset, spriteUndersideProfile } from "../art/sprites.js";
import { sceneTuning } from "./choreography-tuning.js";
import {
  CELL_HEIGHT,
  CELL_WIDTH,
  INDIVIDUAL_VISUAL_SCALE_MAX,
  PITCH_CLEARANCE_FRACTION,
} from "./config.js";
import { individualDepthScale, spreadDepth } from "./depth.js";
import { spriteForFish } from "./fish-growth.js";
import { substrateSurfaceY, waterSurfaceY } from "./environment.js";
import { affinitiesFromSeed } from "./fish-personality.js";
import { sample01, sampleRange } from "./prng.js";

export const MAX_FISH_PITCH_DEGREES = 32;
// The authored forage and surface numbers. Every one of them is also an entry
// in the "substrate-search" / "surface-investigate" scene tuning, which is what
// the simulation actually reads and what the behaviour choreography lab edits;
// these exports remain the values that tuning starts from.
// Steep enough that the nose is unmistakably the leading edge of the fish. The
// lean is not decoration: it is what lets a tall fish get its mouth to the sand
// without putting its whole underside in it, because rotating the drawing moves
// the mouth down and the tail up at the same time.
//
// It stops six degrees short of MAX_FISH_PITCH_DEGREES because the strike adds
// its own rotation on top and the two share that one ceiling: authored to reach
// it exactly, so the graze lean is as steep as it can be and every degree of
// the peck rotation is still drawn.
export const FORAGE_PITCH_BIAS_DEGREES = 26;
export const SURFACE_PITCH_BIAS_DEGREES = -10;
// How far off the graze line still counts as working the substrate. This is a
// contact band, not an approach band: everything downstream of it - the feeding
// lean, the strike, the puff of silt the strike lifts - is a claim that the
// fish's mouth is in the sand, and a fish that claims it from most of a row up
// is miming. It used to be nearly a row wide, from when the line was measured
// to the belly and a fish inside the band was at least near the floor with it.
// A grazing fish is measured to sit within a hundredth of a row of its line, so
// tightening this costs no feeding at all: it only stops the transients.
export const FORAGE_SEARCH_DISTANCE_ROWS = 0.45;
// How close the drawn mouth has to be to the crest for a strike to land.
//
// Tighter than the search band above, and deliberately a separate number:
// being on the graze line in the feeding posture is what makes a fish a
// grazer, but putting a bright contact mark and a puff of silt on the sand is
// a claim that the nose is *there*. Reusing the search band let the worst
// strike fire from 0.47 rows up; a third of a row brings that to 0.29 and
// costs three strikes in a hundred, which is the knee of the curve - 0.2 rows
// buys another 0.05 for ten.
export const FORAGE_STRIKE_REACH_ROWS = 0.3;
// How close the mouth is allowed to come to the substrate crest while grazing,
// and how far the strike itself drives the fish down. Both are authored against
// the drawn artwork rather than the swimming envelope: a feeding fish that keeps
// its swimming clearance hovers a row above the sand and never reads as eating.
export const FORAGE_GRAZE_CONTACT_ROWS = 0.06;
// How far the drawing may sink past the crest to get its mouth down there.
//
// Feeding is a statement about the mouth, and on anything but a fry the mouth
// is not the lowest part of the fish: a five-row adult's belly fin hangs more
// than a row below its nose, so a fish parked by its lowest ink keeps its mouth
// in open water with the puff of silt it raised drawn a body's depth beneath
// it. The bigger the fish, the wider that gap - which is the whole of why
// bottom feeding used to read worse the more fish there was doing it.
//
// So the mouth comes down to the sand and the body follows it in. This is how
// far in it is allowed to go: enough that a grown fish gets its nose to the
// crest and its underside grazes through it, not so far that the drawing sits
// in the floor. A fry never reaches it - its mouth is its lowest ink, so the
// contact allowance above is what places it, and the bite only ever binds on a
// fish tall enough for the two to differ.
export const FORAGE_GRAZE_BURIAL_ROWS = 1.25;
export const FORAGE_PECK_ROWS = 0.30;
// The logical sprite box and the renderer's opaque-body box intentionally do
// not share font/profile internals, and this is the measured reserve for that
// mismatch after the exact depth scale is applied. It is now zero: the reserve
// was covering an opaque body that, at pitch, was drawn as the axis-aligned
// bounding box around each rotated slice and so reached further below the fish
// than the fish did. The body is rasterised as the rotated silhouette itself
// now, and the two models agree closely enough that adding to the reserve only
// lifts a feeding fish off the sand it is supposed to be working. The constant
// stays because it is where a measured disagreement belongs - `npm run
// measure:screen` reports the gap the panel receives, and the seed sweep in
// tests/review-regressions.test.js grades the other side of it.
//
// There is almost nothing left of the disagreement. The model projects the
// rasteriser's own pixels, in the rasteriser's own cell, so over the whole
// roster it predicts the rendered ink to within three hundredths of a row at
// every feeding angle. It did not start there: reserving whole cells overshot
// by a sixth of a row to well over half depending on which character a sprite
// stood on, and bounding a glyph's pixels into one corner still overshot by a
// fifth. What is left is quantisation, it is not a function of the fish, and
// the authored allowances mean what they say - which is why this stays zero.
const FORAGE_GRAZE_MODEL_MARGIN_ROWS = 0;
// The furthest ahead a grazing fish will chase its route point. The forage
// route drifts across the tank faster than a fish creeping along at a tenth of
// a row per second can follow, and an unreachable target makes the steering
// direction almost purely horizontal - which is what used to leave nothing of
// the peck for the vertical axis.
export const FORAGE_ROUTE_LEAD_COLUMNS = 1.15;

const MAX_PITCH_RADIANS = MAX_FISH_PITCH_DEGREES * Math.PI / 180;
const CLEARANCE_MARGIN_ROWS = 0.18;
const PECK_PATTERNS = Object.freeze([
  Object.freeze([0.08, 0.38, 0.49, 0.76]),
  Object.freeze([0.1, 0.22, 0.55]),
  Object.freeze([0.07, 0.43, 0.68, 0.79]),
]);
const DEBRIS_TAIL_SECONDS = 0.82;

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function smoothstep(value) {
  const amount = clamp(value, 0, 1);
  return amount * amount * (3 - 2 * amount);
}

function positiveModulo(value, modulus) {
  return ((value % modulus) + modulus) % modulus;
}

function spriteFor(value) {
  if (value?.shape) return value;
  // A growing fish is measured at the size it is now, not at the size it will
  // eventually be: a fry legitimately fits closer to the substrate and the
  // surface than the adult it becomes.
  return spriteForFish(value ?? { seed: 0 });
}

// Simulation clearance is deliberately conservative. A fish can be enlarged by
// visual depth and its horizontal silhouette contributes to its vertical
// envelope when pitched. The calculation stays in pure logical/authoring units,
// using the same 12x24 cell aspect as the bitmap artwork, so sim never imports
// render/depth.js or any backend geometry. width/2 and height/2 already include
// the half-cell of bitmap ink beyond the outermost authored glyph centres.
export function fishVerticalClearanceRows(fishOrSprite) {
  const sprite = spriteFor(fishOrSprite);
  const { width, height } = spriteDimensions(sprite);
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const horizontalAsRows = halfWidth * (CELL_WIDTH / CELL_HEIGHT);
  const projected = halfHeight * Math.cos(MAX_PITCH_RADIANS)
    + horizontalAsRows * Math.sin(MAX_PITCH_RADIANS);
  return projected * INDIVIDUAL_VISUAL_SCALE_MAX + CLEARANCE_MARGIN_ROWS;
}

// The pose a fish is drawn in, from the turn its simulation state is holding.
//
// This lives on the simulation side because `visual.turnProgress` is simulation
// state and because the graze line has to agree with it: a fish's mouth is what
// it feeds with, and the crest under a mouth is not the crest under the fish
// unless the terrain is flat. The renderer and the substrate both ask this one
// function where the drawing is facing and how much of its width is left, so
// the fish, the sand it is measured against, and the puff it throws cannot come
// apart mid-turn.
//
// A fish turning through the glass swings its drawing to the new facing halfway
// through, and is compressed to a third of its width at that moment - which is
// also why the nose barely leads the body there.
export function turnPose(fish) {
  const visual = fish?.visual ?? {
    facing: (fish?.vx ?? 0) < 0 ? -1 : 1,
    targetFacing: (fish?.vx ?? 0) < 0 ? -1 : 1,
    turnProgress: 1,
  };
  if (!(visual.turnProgress < 1)) return { facing: visual.targetFacing, widthScale: 1 };
  if (visual.turnProgress < 0.5) {
    return {
      facing: visual.facing,
      widthScale: 1 - smoothstep(visual.turnProgress * 2) * 0.68,
    };
  }
  return {
    facing: visual.targetFacing,
    widthScale: 0.32 + smoothstep((visual.turnProgress - 0.5) * 2) * 0.68,
  };
}

export function forageEligible(index) {
  // The first three individuals are the permanent mid-water cast. Keeping them
  // out of forage is the simplest deterministic way to preserve that visibility
  // invariant without letting a fish claim to eat from several rows above the
  // substrate.
  return index >= 3;
}

export function substrateSafeY(fish, state, worldX = fish.x) {
  return substrateSurfaceY(state, worldX) - fishVerticalClearanceRows(fish);
}

// How far below the fish's centre one point of the artwork reaches once the
// drawing leans, in rows. The offsets already carry how far the ink extends
// past its own anchor, so what is left is the rotation: a column is
// CELL_WIDTH / CELL_HEIGHT of a row, and the lowest corner of an upright box
// under a nose-down turn is the one on the nose side. Mirroring moves the nose
// to the other side of the centre and takes the artwork with it, so the
// authored right-facing offsets answer for both facings.
function inkReachRows(point, drop, lean) {
  return point.dy * drop + point.dx * lean;
}

// The lowest any of a set of ink points reaches once the drawing leans.
function maxReachRows(points, drop, lean) {
  let lowest = 0;
  for (const point of points) {
    const reach = inkReachRows(point, drop, lean);
    if (reach > lowest) lowest = reach;
  }
  return lowest;
}

// The lean the renderer actually turns a drawing through, in radians, and the
// two factors every reach is projected with. A fish turning through the glass
// is drawn compressed and its lean is foreshortened to match, so both the
// downward drop and the forward reach shrink with the turn.
//
// The sign is kept. Nose-up is a real pose - a fish arriving at the graze line
// on the way up is drawn pointing away from the sand - and folding it onto the
// equivalent nose-down angle would report a mouth reaching into terrain it is
// in fact a row above. A negative lean subtracts the nose's forward offset
// instead of adding it, which is the honest answer for the mouth; the ink
// staircase behind it is the nose-down support, so for a nose-up pose the
// result is an under-estimate of the reach, and under-estimating is the safe
// direction for anything deciding whether a fish may strike.
function leanProjection(pitchDegrees, turnScale) {
  const turn = clamp(Number.isFinite(turnScale) ? turnScale : 1, 0, 1);
  const pitch = clamp(
    Number.isFinite(pitchDegrees) ? pitchDegrees : 0,
    -MAX_FISH_PITCH_DEGREES,
    MAX_FISH_PITCH_DEGREES,
  ) * turn * Math.PI / 180;
  return {
    drop: Math.cos(pitch),
    lean: Math.sin(pitch) * PITCH_CLEARANCE_FRACTION * (CELL_WIDTH / CELL_HEIGHT) * turn,
  };
}

// Grazing is measured against the artwork, not against the swimming envelope.
// The envelope above reserves room for a full-pitch rotation that the authored
// pitch pose only partly performs, and reserves it at the largest depth scale
// any fish can be drawn at; both are the right call for a fish crossing open
// water and both are wrong for one working the substrate, where the reserve
// simply parks it in mid-water with its debris falling out of reach below.
// The posture is the forage lean, not the fish's instantaneous pitch. Tracking
// the live angle makes the graze line climb exactly as the strike drives the
// fish down - the reservation grows with the lean, the clamp lifts the fish,
// and the two cancel almost perfectly. Reserving for the steady feeding posture
// instead leaves the strike free to reach past it, which is the whole point of
// a strike: the nose goes into the sand and comes back out.
//
// What the reserve is measured to is the mouth. A fish feeds with its mouth,
// the puff of silt a strike lifts is drawn from its mouth, and on anything past
// a fry the mouth is nowhere near the lowest part of the drawing - a five-row
// adult's belly fin hangs better than a row below its nose. Parking such a fish
// by its lowest ink is what left its mouth in open water with its own debris a
// body's depth beneath it, and it did so in proportion to the fish: the taller
// the artwork, the further the mouth from the sand it was supposed to be
// working. The underside is still what stops it, but as a limit rather than as
// the target: the fish comes down until its mouth meets the crest or its
// underside has grazed `burialRows` through it, whichever happens first.
export function fishGrazeClearanceRows(
  fishOrSprite,
  pitchDegrees = FORAGE_PITCH_BIAS_DEGREES,
  visualScale = INDIVIDUAL_VISUAL_SCALE_MAX,
  contactRows = FORAGE_GRAZE_CONTACT_ROWS,
  burialRows = FORAGE_GRAZE_BURIAL_ROWS,
  turnScale = 1,
) {
  const sprite = spriteFor(fishOrSprite);
  // A nose-down fish is longer than it is tall in the vertical direction that
  // matters here: the renderer turns the drawing bodily, so part of the body's
  // length projects downwards and the lowest ink is no longer the belly. A
  // height-only clearance was right while the pose was a gentle shear and buries
  // a wide fish by a whole row now that it leans for real.
  //
  // The underside is taken over the cells the artwork occupies, not over the box
  // that bounds them. The two agree for a fry, whose every cell is inked, and
  // diverge by more the larger the fish gets, because the point a box puts
  // furthest down when it leans - the bottom corner on the nose side - is empty
  // on every species and covers more empty rows the bigger the box is.
  // A fish turning through the glass is drawn compressed, and a body seen close
  // to edge-on has little length left to tilt: the renderer foreshortens the
  // lean by the same turn scale it narrows the drawing by. Reserving the full
  // authored lean through that held the fish at a clearance its own compressed
  // drawing could not reach.
  const { drop, lean } = leanProjection(
    Math.abs(Number.isFinite(pitchDegrees) ? pitchDegrees : 0),
    turnScale,
  );
  const underside = maxReachRows(spriteUndersideProfile(sprite), drop, lean);
  const mouth = maxReachRows(spriteMouthOffset(sprite).reach, drop, lean);
  const scale = clamp(
    Number.isFinite(visualScale) ? visualScale : INDIVIDUAL_VISUAL_SCALE_MAX,
    0,
    INDIVIDUAL_VISUAL_SCALE_MAX,
  );
  // Both allowances are screen rows rather than fractions of a fish: how close
  // the mouth comes to the sand, and how far the underside may pass through it,
  // are things the eye judges against the crest and not against the animal.
  const reserve = Math.max(
    mouth * scale - contactRows,
    underside * scale - Math.max(0, burialRows),
  );
  // Never below the crest itself: a reserve is how far the fish's centre is held
  // above the sand, and a negative one would park the centre inside it. The
  // floor used to be a fifth of a row, from when the model reserved whole cells
  // and nothing could legitimately want less - but a fry that is a single "·"
  // legitimately wants almost none, and the floor was holding it a sixth of a
  // row above sand its own ink could not then reach. The bite above is what
  // bounds the other end.
  return Math.max(0, reserve + FORAGE_GRAZE_MODEL_MARGIN_ROWS);
}

export function individualVisualScale(fish, index, state) {
  const individuals = state?.individuals ?? [];
  const resolvedIndex = Number.isInteger(index) && index >= 0 && index < individuals.length
    ? index
    : individuals.findIndex((candidate) => candidate === fish || candidate.seed === fish?.seed);
  if (resolvedIndex < 0 || !Number.isFinite(state?.seed)) return INDIVIDUAL_VISUAL_SCALE_MAX;
  const distance = spreadDepth(
    state.seed,
    fish.seed,
    resolvedIndex,
    individuals.length,
    state.elapsedRealSeconds,
  );
  return individualDepthScale(distance);
}

// How far ahead of the fish's centre its mouth is drawn, in columns. The lean
// swings the nose forward and down, mirroring puts it on the other side, and a
// fish turning through the glass has hardly any length left to lead with.
export function mouthLeadColumns(fish, pitchDegrees, visualScale = 1) {
  const sprite = spriteFor(fish);
  const mouth = spriteMouthOffset(sprite);
  const pitch = clamp(Number.isFinite(pitchDegrees) ? pitchDegrees : 0, -MAX_FISH_PITCH_DEGREES, MAX_FISH_PITCH_DEGREES)
    * Math.PI / 180;
  const pose = turnPose(fish);
  // The same rotation the renderer applies, foreshortened by the same turn and
  // done in row units and converted back: a lean shortens the reach forward as
  // it lengthens the reach down, and a compressed body has less of both.
  const angle = pitch * pose.widthScale;
  const forward = mouth.dx * Math.cos(angle) - mouth.dy * Math.sin(angle) * (CELL_HEIGHT / CELL_WIDTH);
  return forward * pose.widthScale * (pose.facing < 0 ? -1 : 1) * visualScale;
}

// How far the fish's mouth reaches below its own centre once the drawing leans,
// in rows before any depth scale. The turn is part of the answer: the renderer
// compresses a body turning through the glass to a third of its width and
// foreshortens its lean to match, so a fish caught mid-turn has a nose that no
// longer reaches the sand however low its centre is.
export function fishMouthReachRows(fishOrSprite, pitchDegrees, turnScale = 1) {
  const { drop, lean } = leanProjection(pitchDegrees, turnScale);
  return maxReachRows(spriteMouthOffset(spriteFor(fishOrSprite)).reach, drop, lean);
}

export function substrateGrazeY(fish, state, worldX = fish.x, index = null) {
  // Rotation and distance together: the lean the fish feeds at decides how much
  // of its body projects downwards, and the contact allowance decides how close
  // that projection may come to the crest.
  //
  // The crest is sampled under the mouth, not under the fish. The terrain is not
  // flat, a grown fish's mouth leads its centre by two to three columns, and the
  // relief changes by more than a tenth of a row across that span - so a graze
  // line taken at the centre put the fish above or into the sand depending on
  // which way it was facing, while the contact mark it threw was already being
  // drawn against the terrain under the mouth. This is the same sample.
  const tuning = sceneTuning(state, "substrate-search");
  const scale = individualVisualScale(fish, index, state);
  const turnScale = turnPose(fish).widthScale;
  const mouthX = worldX + mouthLeadColumns(fish, tuning.grazePitchDegrees, scale);
  return substrateSurfaceY(state, mouthX)
    - fishGrazeClearanceRows(
      fish,
      tuning.grazePitchDegrees,
      scale,
      tuning.grazeContactRows,
      tuning.grazeBurialRows,
      turnScale,
    );
}

export function surfaceSafeY(fish, state, worldX = fish.x) {
  return waterSurfaceY(state, worldX) + fishVerticalClearanceRows(fish);
}

// Forage contact has no persistent animation state. Search and clustered peck
// phases are reconstructed from activity age + seed, which keeps saves compact
// and makes the substrate puff renderer observe exactly the same event as the
// simulation. The deliberately uneven patterns read as feeding rather than a
// metronome: single pecks, close pairs, a lateral scoot, then a longer pause.
// `activity` defaults to the fish's own stored activity, which is what the
// renderer and the drive tick observe. Callers that have already advanced the
// activity for this frame pass that state in, so the target, the pitch, and the
// puff of debris all describe the same contact instead of drifting a frame — up
// to a quarter second on a delayed step — apart.
export function forageActivity(fish, index, state, activity = fish?.activity) {
  const eligible = forageEligible(index);
  const tuning = sceneTuning(state, "substrate-search");
  const surfaceY = substrateSurfaceY(state, fish.x);
  const targetY = substrateGrazeY(fish, state, fish.x, index);
  const distanceRows = Math.abs(fish.y - targetY);
  // Working the substrate: the fish is on its graze line, in the feeding
  // posture it holds there. This is measured against the authored lean rather
  // than the fish's live pitch, because the fish only adopts that lean while it
  // is searching - reading its instantaneous angle back here would mean it
  // could never start.
  const searching = eligible
    && fish.behavior?.current === "forage"
    && distanceRows <= tuning.searchDistanceRows;

  // Striking is a narrower claim, and it is about the nose the fish is actually
  // drawn with rather than the posture it is heading for. Two things move that
  // nose off the sand while the fish is otherwise perfectly placed: the pitch
  // eases in over a fraction of a second and is pulled about by the fish's own
  // trajectory, so a settled grazer is often drawn leaning eight degrees rather
  // than twenty-six; and a fish turning through the glass is compressed to a
  // third of its width with its lean foreshortened to match. Either way its
  // mouth can sit half a row above the crest - and a strike from there threw a
  // bright contact mark and a puff of silt at ground the fish was nowhere near.
  //
  // There is no feedback loop to worry about here: the lean answers `searching`
  // above, and this only decides whether the nose has arrived yet. It gates the
  // strike, the bright contact mark that goes with it, and the silt the strike
  // lifts - a puff is a thing a strike did, and leaving the tail on `searching`
  // alone drew one for events that never made contact at all.
  const scale = individualVisualScale(fish, index, state);
  const pose = turnPose(fish);
  const drawnPitch = Number.isFinite(fish.visual?.pitch) ? fish.visual.pitch : 0;
  const mouthX = fish.x + mouthLeadColumns(fish, drawnPitch, scale);
  const mouthY = fish.y + fishMouthReachRows(fish, drawnPitch, pose.widthScale) * scale;
  // One-sided on purpose. Only a mouth held *above* the sand is a reason to
  // withhold a strike; one driven into it is the strike working. Testing the
  // distance either way meant the plunge invalidated its own gate - the fish
  // dips, the gate closes, the peck reads zero, the clamp lifts it back, and
  // the event resumes a frame later. That collapsed 18% of strike arcs mid-swing
  // and let the renderer draw a peck the simulation had already abandoned.
  const contacting = searching
    && substrateSurfaceY(state, mouthX) - mouthY <= tuning.strikeReachRows;

  const substrateAffinity = affinitiesFromSeed(fish.seed).substrate;
  const period = sampleRange(fish.seed, 4600, 5.4, 7.8) * (1.08 - substrateAffinity * 0.2);
  const offset = sampleRange(fish.seed, 4601, 0, period);
  const age = Math.max(0, activity?.current === "substrate-search"
    && Number.isFinite(activity?.ageRealSeconds)
    ? activity.ageRealSeconds
    : fish.behavior?.ageRealSeconds ?? 0);
  const absoluteClock = age + offset;
  const cycleIndex = Math.floor(absoluteClock / period);
  const cycleSeconds = positiveModulo(absoluteClock, period);
  const pattern = PECK_PATTERNS[Math.floor(sample01(fish.seed, 4602) * PECK_PATTERNS.length)
    % PECK_PATTERNS.length];
  // Which strike actually landed, latched by the tick that drove it. The peck
  // above answers the pose of this frame; the silt has to answer the strike
  // that raised it, which may be half a second in the past.
  const contacted = (candidate) => candidate === activity?.contactSeed
    || candidate === activity?.priorContactSeed;
  let peckPhase = null;
  let peckEvent = null;
  let debrisPhase = null;
  let debrisEvent = null;
  for (let event = 0; event < pattern.length; event += 1) {
    const start = pattern[event] * period;
    const duration = sampleRange(fish.seed, 4610 + event, 0.3, 0.46);
    const elapsed = cycleSeconds - start;
    if (contacting && elapsed >= 0 && elapsed < duration) {
      peckPhase = elapsed / duration;
      peckEvent = event;
    }
    const debrisAge = elapsed - duration * 0.34;
    // Both: the strike landed, and the fish is still working this patch. The
    // latch alone would keep a tail alive after the fish had left the sand,
    // for as long as the renderer drew from the activity the tick last wrote.
    if (searching && contacted((cycleIndex * 7 + event) >>> 0)
      && debrisAge >= 0 && debrisAge < DEBRIS_TAIL_SECONDS
      && (debrisPhase === null || debrisAge < debrisPhase * DEBRIS_TAIL_SECONDS)) {
      debrisPhase = debrisAge / DEBRIS_TAIL_SECONDS;
      debrisEvent = event;
    }
  }
  const peck = peckPhase === null ? 0 : Math.sin(Math.PI * clamp(peckPhase, 0, 1));
  const sizeFactor = clamp(fishVerticalClearanceRows(fish) / 2.2, 0.88, 1.04);
  const displacementAmplitude = (tuning.peckRows + substrateAffinity * 0.1) * sizeFactor;
  const eventSeed = (cycleIndex * 7 + (peckEvent ?? debrisEvent ?? 0)) >>> 0;
  // Close peck pairs overlap: the previous peck's debris is still rising when
  // the next peck starts. Salting the debris with the peck event would swap the
  // particle count, glyphs, spread, and rise partway through a tail that is
  // already on screen, so the debris keeps the seed of the event that raised it
  // while scoot behaviour stays with the peck the fish is performing.
  const debrisSeed = debrisEvent === null ? eventSeed : (cycleIndex * 7 + debrisEvent) >>> 0;
  const scootDirection = sample01(fish.seed ^ eventSeed, 4630) < 0.5 ? -1 : 1;
  const recovery = peckPhase === null ? 0 : smoothRecovery(peckPhase);

  return {
    eligible,
    searching,
    contacting,
    peck,
    peckPhase,
    peckEvent,
    peckDisplacement: peck * displacementAmplitude,
    displacementAmplitude,
    recovery,
    debrisPhase,
    debrisEvent,
    eventSeed,
    debrisSeed,
    scootDirection,
    clusterSize: pattern.length,
    clusterProgress: cycleSeconds / period,
    surfaceY,
    targetY,
    distanceRows,
  };
}

function smoothRecovery(peckPhase) {
  const progress = clamp((peckPhase - 0.52) / 0.48, 0, 1);
  return Math.sin(progress * Math.PI);
}
