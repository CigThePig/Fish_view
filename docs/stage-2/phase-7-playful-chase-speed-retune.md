# Phase 7 follow-up: playful chase speed retune

**Branch:** `tune-playful-chase-speed`  
**Base:** `3973b2fa268d0215b01ff6f0e2d774ded99ba36f`  
**Date:** 2026-09-15

This is a narrow, explicit follow-up to the Phase 7 speed-readability reopen. Direct viewing after the first correction showed that playful chase still topped out around 1.5 rows/s in production, leaving too little kinetic contrast between ordinary swimming and the aquarium's most energetic social behavior.

## Retune

The behavior vocabulary, chase phases, target geometry, activity selection, dwell timing, persistence and renderer remain unchanged. Only the velocity amplitude inside the existing playful-chase sentence is reopened:

- opening evader escape: absolute ceiling **4.0 rows/s**;
- recurring pursuit evasion: ceiling **3.0 rows/s**;
- final evader juke: ceiling **2.3 rows/s**;
- chaser ordinary pursuit profile: ceiling **2.7 rows/s**;
- chaser intercept surge: ceiling **3.0 rows/s**.

The 4.0 value is intentionally a brief burst ceiling rather than a sustained travel speed. The evader gets the explosive opening beat, the chaser remains slower, the later juke gives speed back for direction, and the existing break/recovery remains calm.

The authored target speeds were raised with the caps so the new range is reachable rather than decorative. Existing vertical steering scales remain in force, and the final velocity magnitude is still clamped by the shared steering controller.

## Regression evidence

`tests/speed-readability.test.js` now observes the chased fish through one continuous production-path evasion run and records both physical panel speed and logical rows-per-second speed. The gate requires:

- the escape phase to expose the authored 4.0 rows/s ceiling;
- the evader to actually exceed 2.5 rows/s for multiple frames;
- the evader never to exceed 4.01 rows/s;
- the chaser never to exceed 3.01 rows/s in the same observation;
- the continuous evasion and existing visible-speed requirements to remain intact.

The repository's full tests, simulation/render/persistence audits, readability measurements and frozen Phase 7 vocabulary gates remain required before merge.

## Scope decision

This does not reopen Phase 7 behavior ownership or introduce new motion vocabulary. It is an amplitude retune of the already-authored playful-chase sentence, prompted by direct production viewing and guarded by production-path speed measurement.