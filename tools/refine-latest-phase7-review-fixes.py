from pathlib import Path

path = Path("tools/audit-phase7-vocabulary.mjs")
text = path.read_text()
old = '''  let transition = null;
  const phases = new Set();
  const activities = new Set([startingActivity]);
  const renderedSeconds = scenario.loopSeconds + RECOVERY_SECONDS;
'''
new = '''  let transition = null;
  const phases = new Set();
  // Capture the authored target at t=0 before the first production tick can
  // physically arrive and advance a short opening leg. Otherwise a fish posed
  // inside its first arrival radius can genuinely perform weave-1 while the
  // audit starts its evidence at weave-2.
  const initialTarget = showcaseTarget(state, scenario.id);
  if (initialTarget?.choreographyPhase) phases.add(initialTarget.choreographyPhase);
  const activities = new Set([startingActivity]);
  const renderedSeconds = scenario.loopSeconds + RECOVERY_SECONDS;
'''
count = text.count(old)
if count != 1:
    raise SystemExit(f"audit initial-target insertion expected one match, found {count}")
path.write_text(text.replace(old, new, 1))
