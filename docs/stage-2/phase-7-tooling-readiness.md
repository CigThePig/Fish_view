# Phase 7 visual tooling readiness

Phase 7 is a visual choreography pass. A test suite that says `PASS` while the
reviewer is looking at `main` on GitHub Pages is not evidence for a working
branch. This note defines the inspection path before Phase 7.2 changes any fish
motion.

## The Pages trap

`CigThePig/Fish_view` has one GitHub Pages site. The deployment workflow in
`.github/workflows/pages.yml` deliberately publishes `main` only. Do **not** use
the normal Pages aquarium or behaviour lab to judge an unmerged Phase 7 branch:
it is showing a different commit.

Do not solve this by deploying each working branch over the Pages environment.
That would make a developer preview capable of replacing the live aquarium.

## Exact-commit interactive preview

For low-traffic development review, use the repository page through
`raw.githack.com`, which proxies public GitHub files with browser-safe MIME
types. Prefer an exact commit SHA rather than a branch name so caching can never
make the reviewer wonder which version is on screen.

Generate the link from a checked-out branch with:

```sh
npm run preview:branch -- --page=behaviors.html --activity=playful-chase
```

The helper prints both the exact-commit preview URL and the corresponding GitHub
source URL. Other useful pages are `index.html`, `plants.html`, and
`sprites.html`. The behaviour lab also accepts `--seed=<label>` through the
helper, which becomes the lab's existing `?seed=` parameter.

This is a developer convenience, not infrastructure. It is a third-party
service and may be delayed or unavailable. The branch CI artifact below is the
fallback and the durable record of what CI actually built.

## Working-branch CI

`.github/workflows/verify.yml` runs on `phase-*` branch pushes as well as normal
PR/main verification. Phase 7 branches produce a `phase7-working-branch-*`
artifact containing:

- `_site/` — the fingerprinted static site built from that exact branch commit,
- `chase-readiness/` — JSON, Markdown summary and SVG telemetry,
- `chase-captures/` — playful chase and individual-follow contact sheet/GIFs,
- `phase7-baseline/` — the blind all-behaviour baseline sheet and separate key.

The artifact is the fallback when an interactive proxy cannot be used. The
`_site` directory is also the exact static payload that would be suitable for a
Pages deployment; it is intentionally **not** deployed from the working branch.

## Chase observation surface

`src/dev/chase-observation.js` observes the forced production chase without
changing or grading it. `npm run measure:chase-readiness` runs the observer over
a deterministic six-seed matrix and writes:

- per-frame pair distance and distance rate,
- chaser and evader speeds,
- chaser and evader instantaneous turn rates,
- vertical separation,
- heading separation,
- chaser alignment to the evader (useful for identifying overshoot),
- evasion strength,
- choreography phase transitions,
- break timing and post-break gap growth,
- seeded personality traits and rendered sprite dimensions for both fish.

The tool deliberately does **not** assert that today's gap range, peak speed or
turn rate is correct. Phase 7.2 exists to change those values. Tests protect the
observer's determinism and completeness, not the current chase choreography.

Each seed also gets an SVG with three timelines: pair distance, both speeds and
both turn rates, with phase boundaries marked. This gives Phase 7.2 the evidence
the root specification asks for without requiring hand-transcription from a
video.

Run one labelled seed while iterating:

```sh
npm run measure:chase-readiness -- --seed=my-test --output=.audit-output/chase-one
```

Run the standard comparison matrix before and after a meaningful chase change:

```sh
npm run measure:chase-readiness
```

## Existing behaviour lab

The current `behaviors.html` lab is already suitable for live tuning:

- it runs the production simulation and renderer,
- it supports deterministic `?seed=` selection,
- chase scene and steering values are exposed as bounded sliders,
- changes apply to the running tank immediately,
- the output is paste-ready source for `src/sim/choreography-tuning.js`.

Keep using it. The new telemetry tools complement it rather than creating a
second tuning system.

For Phase 7.2, always compare chase against `individual-follow`. The latter is
provisionally frozen by Phase 7.1, so it is the nearest visual control rather
than another thing to tune at the same time.

## Phase 7.2 readiness checklist

Before changing chase choreography:

1. Open the **working commit**, not the normal Pages deployment.
2. Watch `playful-chase` without reading the telemetry first.
3. Watch `individual-follow` with the same seed.
4. Generate chase telemetry for the same seed.
5. Keep the six-seed matrix available for personality/body variation.
6. After a change, compare captures and telemetry against the previous commit.
7. Do not treat a numerical improvement as visual acceptance.
8. Do not retune the Phase 7.1 frozen reference behaviours to make chase look
   more distinctive.

No production behaviour was changed to create this tooling.
