# Phase N — <title>

**Branch:** `<branch>`  ·  **Baseline commit:** `<sha>`  ·  **Date:** `<yyyy-mm-dd>`

One paragraph: what this phase was for, and what a viewer can now see that they
could not see before.

## Changes made

Production changes and tooling changes, separately. Name the files. Say what
each change does, not how many lines it took.

## Architecture

New state, new runtime concepts, new caps. For anything transient, give the
hard upper bound and where it is enforced. For anything persistent, say what it
adds to the save.

## Visual result

What is visibly different, in the words a person watching the tank would use.
If nothing is visibly different, say so — that is a finding, not a gap to fill
with prose.

## Evidence

| Claim | How it was checked | Where the evidence is |
| --- | --- | --- |
|  |  |  |

Include the tests run, the measurements taken, the deterministic scenarios, and
at least one observation on the production path rather than a forced fixture.

## Performance

Compared against [the baseline](baseline-2026-09-09.md) or the previous phase,
whichever is more honest.

| Measure | Before | After |
| --- | --- | --- |
| Mature untouched avg / max damage |  |  |
| Interaction avg / max damage |  |  |
| Dirty rectangles per frame |  |  |
| Full redraws |  |  |
| Scene objects / glyphs |  |  |

Explain any regression. "Within noise" needs the noise.

## Persistence

Whether the save schema changed. If it did: the new fields, their bounds, what
an old save restores to, what a malformed value repairs to, and the serialised
size of a stocked ten-year aquarium.

## Remaining limitations

Be explicit. Anything deferred to a later phase is named here, with the phase.

## Gate decision

State each acceptance-gate item from the plan and whether it is met, then:

**PASS — phase complete; proceed.**

or

**FAIL — phase is not complete. Do not proceed.**
