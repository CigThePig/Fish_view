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

  // Keep the same dramatic proportions when the behaviour lab moves the break
  // time. At the authored 6.2 seconds these land near 0.78s, 1.73s and 4.55s.
  // The interception gets enough runway to become an actual crossing/near miss
  // rather than a label applied to the final second of an ordinary pursuit.
  const engageEnd = clamp(Math.min(0.78, breakSeconds * 0.16), 0.12, breakSeconds * 0.28);
  const remainingAfterEngage = Math.max(0.2, breakSeconds - engageEnd);
  const escapeDuration = clamp(
    Math.min(0.95, remainingAfterEngage * 0.26),
    0.18,
    remainingAfterEngage * 0.38,
  );
  const escapeEnd = Math.min(breakSeconds - 0.35, engageEnd + escapeDuration);
  const roomAfterEscape = Math.max(0.25, breakSeconds - escapeEnd);
  const interceptDuration = clamp(
    Math.min(1.65, breakSeconds * 0.27),
    0.3,
    Math.max(0.3, roomAfterEscape - 0.15),
  );
  const interceptStart = Math.max(escapeEnd + 0.15, breakSeconds - interceptDuration);
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
  const bounds = chaseArcBoundaries(tuning);

  // The target is allowed to remain unaware a little longer if the chaser has
  // not actually closed into recognition range yet. Once that opening window
  // has passed, time wins so a chase can never become stuck in engagement.
  if (age < bounds.engageEnd
    || (distance > radius && age < bounds.escapeEnd)) return CHASE_ARC_PHASES.engage;
  if (age < bounds.escapeEnd) return CHASE_ARC_PHASES.escape;
  if (age < bounds.interceptStart) return CHASE_ARC_PHASES.pursuit;
  if (age < bounds.breakSeconds) return CHASE_ARC_PHASES.intercept;
  if (age < bounds.recoverStart) return CHASE_ARC_PHASES.break;
  return CHASE_ARC_PHASES.recover;
}

// fish-activities.js already distinguishes its broad approach / pursuit / break
// steering branches. Keep that stable while exposing the finer dramatic phases
// to steering, telemetry and visual review.
export function chaseMacroPhase(ageRealSeconds, distance, tuning = null) {
  const phase = chaseArcPhase(ageRealSeconds, distance, tuning);
  if (phase === CHASE_ARC_PHASES.engage) return "approach";
  if (phase === CHASE_ARC_PHASES.break || phase === CHASE_ARC_PHASES.recover) return "break";
  return phase;
}

export function chaseArcProgress(ageRealSeconds, phase, tuning = null) {
  const age = Math.max(0, Number.isFinite(ageRealSeconds) ? ageRealSeconds : 0);
  const bounds = chaseArcBoundaries(tuning);
  let start = 0;
  let end = bounds.engageEnd;

  if (phase === CHASE_ARC_PHASES.escape) {
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
