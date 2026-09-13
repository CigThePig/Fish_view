// Semantic timing for playful chase.
//
// The activity itself stays one bounded, unsaved social activity. These phases
// are derived from its age, distance and authored break time so the complete
// chase can read as a small motion sentence without introducing another state
// machine or another piece of persistence.

export const CHASE_DEFAULT_RECOGNITION_RADIUS = 4.9;
export const CHASE_DEFAULT_BREAK_SECONDS = 6.2;
export const CHASE_RECOVERY_DELAY_SECONDS = 0.9;

export const CHASE_ARC_PHASES = Object.freeze({
  engage: "engage",
  escape: "escape",
  pursuit: "pursuit",
  intercept: "intercept",
  break: "break",
  recover: "recover",
});

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function finitePositive(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function chaseArcBoundaries(tuning = null) {
  const breakSeconds = finitePositive(tuning?.breakSeconds, CHASE_DEFAULT_BREAK_SECONDS);

  // At the authored 6.2 second chase the broad windows land near 0.78, 3.78,
  // 5.0 and 6.2 seconds. The target does not spend the whole escape window
  // fleeing: chaseArcPhase keeps engagement until the pair is physically close
  // or until the final short escape window is reached. That gives us a readable
  // deliberate close, a real burst, time to close again, then the final juke.
  const engageEnd = clamp(Math.min(0.78, breakSeconds * 0.16), 0.12, breakSeconds * 0.28);
  const remainingAfterEngage = Math.max(0.2, breakSeconds - engageEnd);
  const escapeDuration = clamp(
    Math.min(3, remainingAfterEngage * 0.62),
    0.5,
    remainingAfterEngage * 0.68,
  );
  const escapeEnd = Math.min(breakSeconds - 0.8, engageEnd + escapeDuration);
  const roomAfterEscape = Math.max(0.25, breakSeconds - escapeEnd);
  const interceptDuration = clamp(
    Math.min(1.2, breakSeconds * 0.2),
    0.3,
    Math.max(0.3, roomAfterEscape - 0.15),
  );
  const interceptStart = Math.max(escapeEnd + 0.35, breakSeconds - interceptDuration);
  const recoverStart = breakSeconds + CHASE_RECOVERY_DELAY_SECONDS;

  return {
    engageEnd,
    escapeEnd,
    interceptStart,
    breakSeconds,
    recoverStart,
  };
}

export function chaseArcPhase(ageRealSeconds, distance, tuning = null) {
  const age = Math.max(0, Number.isFinite(ageRealSeconds) ? ageRealSeconds : 0);
  const radius = finitePositive(
    tuning?.recognitionRadiusRows,
    CHASE_DEFAULT_RECOGNITION_RADIUS,
  );
  const panicFar = finitePositive(tuning?.panicFarRows, radius * 0.74);
  const bounds = chaseArcBoundaries(tuning);
  const forcedEscapeStart = Math.max(bounds.engageEnd, bounds.escapeEnd - 0.72);

  // Recognition is not panic. The chaser may be noticed at the outer radius,
  // but the target stays on its line while the gap closes. Once the pair enters
  // the panic band, or the opening has run long enough, the target gets one
  // unmistakable escape beat. This keeps the four-row invariant from becoming
  // a distant formation while still guaranteeing an escape in every chase.
  if (age < bounds.engageEnd
    || (distance > panicFar && age < forcedEscapeStart)) return CHASE_ARC_PHASES.engage;
  if (age < bounds.escapeEnd) return CHASE_ARC_PHASES.escape;
  if (age < bounds.interceptStart) return CHASE_ARC_PHASES.pursuit;
  if (age < bounds.breakSeconds) return CHASE_ARC_PHASES.intercept;
  if (age < bounds.recoverStart) return CHASE_ARC_PHASES.break;
  return CHASE_ARC_PHASES.recover;
}

// fish-activities.js already distinguishes its broad approach / pursuit / break
// steering branches. Escape deliberately reuses the slower approach target:
// the evader gets the first acceleration while the chaser has a human-readable
// beat of hesitation. Semantic telemetry still calls the moment `escape`; this
// mapping only chooses which existing target envelope drives the chaser.
export function chaseMacroPhase(ageRealSeconds, distance, tuning = null) {
  const phase = chaseArcPhase(ageRealSeconds, distance, tuning);
  if (phase === CHASE_ARC_PHASES.engage || phase === CHASE_ARC_PHASES.escape) return "approach";
  if (phase === CHASE_ARC_PHASES.break || phase === CHASE_ARC_PHASES.recover) return "break";
  return phase;
}

export function chaseArcProgress(ageRealSeconds, phase, tuning = null) {
  const age = Math.max(0, Number.isFinite(ageRealSeconds) ? ageRealSeconds : 0);
  const bounds = chaseArcBoundaries(tuning);
  let start = 0;
  let end = bounds.engageEnd;

  if (phase === CHASE_ARC_PHASES.escape) {
    // The actual escape may begin later than engageEnd because its trigger is
    // distance-sensitive. Using the fixed outer window here is intentional: it
    // keeps the burst deterministic and naturally stronger when the target was
    // forced to wait until the pair became close.
    start = bounds.engageEnd;
    end = bounds.escapeEnd;
  } else if (phase === CHASE_ARC_PHASES.pursuit) {
    start = bounds.escapeEnd;
    end = bounds.interceptStart;
  } else if (phase === CHASE_ARC_PHASES.intercept) {
    start = bounds.interceptStart;
    end = bounds.breakSeconds;
  } else if (phase === CHASE_ARC_PHASES.break) {
    start = bounds.breakSeconds;
    end = bounds.recoverStart;
  } else if (phase === CHASE_ARC_PHASES.recover) {
    start = bounds.recoverStart;
    end = bounds.recoverStart + 1.2;
  }

  return clamp((age - start) / Math.max(0.00001, end - start), 0, 1);
}
