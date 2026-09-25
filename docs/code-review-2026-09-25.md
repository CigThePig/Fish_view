# Repository code review — 2026-09-25

Baseline: `main` at `3379019` (PR #44, "Load every browser module once").
Work branch: `claude/thorough-repo-code-review-wihebi`. No dependency was added
and no production behaviour outside the three defects below was changed.

## Scope and method

PR #44 was a read-through audit: it found module double-loading, a stale held
presence surviving a new press, the Reset clock and dead renderer code. This
pass deliberately did not repeat it. It asked a different question of the same
code: **where do the tests and audits exercise something other than what the
app actually does?** Every finding below came out of one of four probes run
against the production entry points rather than the fixtures:

- **An interaction fuzzer.** Random presses, holds, drags, swipes, lost
  releases and presses landing on a live contact, driven through `applyTouch`,
  `applyContact`, `applyRelease` and `tick` exactly as `src/app.js` drives them,
  with the documented invariants checked every frame: the stimulus, impulse,
  wake and consequence caps, at most one held stimulus, unique event ids, the
  path cap, bounded attention clocks, finite state, fish inside the tank, a
  bounded state size, and save → restore → save idempotence. Twelve runs of
  2,000–3,000 frames across stocked and founder-only tanks: every structural
  invariant held. The defects were semantic, not structural.
- **Restore onto the aquarium the app restores onto.** `loadPersistedState`
  restores a save onto a brand-new aquarium, which now holds only its founder.
  The slot-repair tests and `audit:persistence` restored onto the stocked
  aquarium that wrote the save.
- **Event lifecycles read end to end,** from `registerTouch` through `admit`,
  `releaseStimulus` and `ageInteractionEvents` to the renderer's crest geometry.
- **The interaction observation sweep compared field for field** against the
  same sweep from a `main` worktree, to show which scenarios the fixes change.

P2 is a substantive behaviour, identity or persistence defect; P3 is a smaller
validation or reporting defect.

## Findings fixed on this branch

| Finding | Severity | Root cause | Change and regression evidence |
| --- | --- | --- | --- |
| One damaged fish record deleted that fish for good | P2 | Restore repaired a damaged slot from `baseState.individuals[index]`. Since the stocking calendar (6c8a3a2) a new aquarium holds only the founder, so every slot past 0 had nothing to repair from and was dropped; its arrival milestone is already resolved, so it never came back, and every later fish shifted down a slot (the protected mid-water trio and feeding eligibility are by slot). An empty roster came back as the founder alone for the same reason. A record copied over its neighbour lost a fish even on the old base, because the copy came first and the original was dropped as the duplicate. This regressed a P2 the 2026-09-07 audit had fixed. | A damaged slot is rebuilt from the calendar's roster, only for a slot the calendar has reached, at its reconstructed age; an identity sitting in its own roster slot wins a duplicate. Two tests restore onto a fresh aquarium, as the app does. |
| Letting go of a short hold reset the ring the press had started | P2 | The release ring was a second `touch` impulse at the same point, so `admit` coalesced it into the arrival ring still expanding there. A press is a presence at 0.45 s and its ring lives 3.2 s, so this was most holds: the crest collapsed to the fingertip mid-swell and restarted as the gentle ring, and plants lost the arrival's push. | The release ring is its own kind of impulse and coalesces only with another release. Test: a one-second hold keeps its arrival ring untouched and adds the release ring. |
| Past the impulse cap, the newest ring was the one evicted | P2 | Eviction ranked impulses by `impulseStrength`, the arrive-peak-settle envelope, which is zero at birth. With six rings live, each new press evicted the one before it 0.3 s into its life while rings from two seconds earlier finished fading: a child tapping across the glass saw old taps answered and new ones cut off. | Eviction ranks by `impulseRemaining`, strength times the life left; the envelope still drives every physical reader. Test: fourteen taps at 0.3 s intervals always keep the youngest six. |
| The save audit never exercised the production restore | P3 | `audit:persistence` restored each malformed save onto the stocked aquarium that wrote it, so a repair that only worked there passed. | It now restores onto `createAquariumState({ seed })` as the app does, and reports fish not restored. |

### Evidence

`audit:persistence` on the app's restore path, same generator seed:

| Malformed saves | `main` | This branch |
| --- | ---: | ---: |
| 200 (the CI gate) | 130 fish lost in 94 saves | 13 fish lost in 12 saves |
| 1,000 (default) | 673 fish lost in 500 saves | 74 fish lost in 62 saves |

Neither has a failure by the audit's own oracle; before this change the loss
was invisible to it. What remains is compound damage that cannot be repaired
without guessing: a save whose own clock is destroyed cannot say which slots the
calendar has reached, and a fish rewritten to another valid seed is
indistinguishable from an aquarium older than the calendar, whose fish restore
under their own seeds.

`observe:interaction` against `main`: **90 of 99 scenarios identical field for
field.** The nine that differ are `open-water-hold`, `two-finger-press` and
`repeated-swipes` on each seed — the scenarios that release a hold inside its
ring's life or fill the impulse list — and every difference is in the render
readings: average damage moves by at most 0.2 points and the worst frame by at
most 0.3, with one release moment 5 points busier because the arrival ring is
still on the panel beside the release ring. No role, activity, response latency
or recovery changed anywhere.

`npm run verify` (543 tests), `audit:phase7-vocabulary`,
`measure:remaining-vocabulary -- --seconds=1800` (no required episode missing)
and the rest of CI's verify job - chase telemetry, the natural chase capture and
the relationship captures - pass.

## Open findings, not changed here

These need a decision rather than a fix, or belong to a later phase.

1. **A two-second tab switch resynchronises the whole cast** (P3 here, and a
   Phase 8 input wherever a platform pauses the aquarium). `src/app.js` calls
   `advanceOffline` on every return to visibility, however short. That is right
   for events, attention and the transient relationship clock, but it also
   rebuilds every fish's activity and blends
   energy 30 % toward the circadian value regardless of the gap. Measured on a
   stocked tank after twenty minutes: 2 s away rebuilds 15 of 15 activities in
   one frame and moves energy by up to 0.09 (13 % of the drive range). A viewer
   flicking between tabs, or a phone screen lock, synchronises the cast Stage 2
   exists to desynchronise and nudges every fish toward the same energy.
   Suggested: scale the energy blend by the gap and keep activities across a
   gap shorter than an activity's own dwell.
2. **The day/night clock is anchored to the wall only at creation and Reset.**
   The frame loop clamps each step to 0.25 s, so any frame longer than that is
   lost from `timeOfDayHours` and the long horizon, as is a sleep that suspends
   animation frames without a `visibilitychange`; a daylight-saving change is
   never corrected. The phase 0 brief asks for "a reliable daily arc". Suggested:
   let the platform re-anchor time of day from the wall clock on load and resume,
   which keeps the simulation clock-free.
3. **A truncated roster is pinned as legitimate.** `tests/phase2-relationships.test.js`
   ("restore remains safe anywhere between one fish and the roster ceiling")
   restores a day-590 save cut to one or five fish and expects one or five. Under
   the stocking calendar that tank cannot exist, and fish never leave, so a
   truncated save loses fish permanently. This branch repairs damaged records and
   an empty roster but leaves truncation alone because the test states it as the
   contract.
4. **The wake cap comment overstates its guarantee.** `MAX_WAKE_IMPULSES` says a
   wake "can never evict the press that started the gesture or the ring that
   ends it". Eviction is by life remaining across all sources, so a full list of
   recent taps can still give one up; this branch makes it much less likely.
5. **`tools/serve.mjs` listens on 0.0.0.0 and serves the whole checkout,
   `.git` included.** Useful for testing on a device on the same network, but
   worth binding to localhost by default.
6. **`plant-repair-verify.yml` runs only on pushes to
   `fix/sampled-skeletal-plant-rendering`,** a branch that still exists but has
   been superseded; the 2026-09-07 audit called it obsolete.
