# Horizontal-only migration validation

Fish View has one 800 × 480 landscape world (66 × 20 logical cells). Viewport size only changes CSS presentation. This report supersedes orientation-related requirements in historical prototype notes.

## Architecture and systems changed

- `src/sim/config.js`: one frozen `DISPLAY`; no orientation registry or selector.
- `src/app.js`: one state, canvas, renderer, tick, touch, save, resume and reset path. No Compare mode or orientation routing.
- Simulation plants, bubbles, activity ranges and renderer configuration retain the former landscape values. No viewport-dependent world generation remains.
- `index.html` and `styles.css`: no normal toolbar, frame or caption; dynamic viewport and safe-area fitting.
- `src/platform/aquarium-input.js`: shared coordinate mapping and hidden gesture. Pointer lifecycle remains in the actual app.
- `src/platform/storage.js`: one key per seed with a small legacy-landscape import.
- Behavior and plant labs: removed orientation selectors and constructors. All existing diagnostic/tuning categories remain accessible.
- Tests, captures and measurement tools: removed duplicate orientation runs, helper arguments, dimensions and budgets. Capture tools produce only landscape outputs.
- Current README replaced the dual-orientation specification; the old detailed notes are explicitly archived. Historical screenshot comparisons remain historical evidence, not supported targets.
- Pages continues to stage the same root HTML/CSS/source. A `dev` alias for the existing static server makes browser QA reproducible through the supervised preview.

## Gesture and persistence

Three completed primary-pointer taps inside a rolling 3,000 ms window open the drawer. Each tap must finish within 600 ms with no more than 12 CSS pixels of movement. The invisible top-right region is 64 × 64 native pixels, with a 32 CSS-pixel minimum and a quarter-dimension ceiling. Outside input, cancellation, holding and dragging reset the sequence. That corner never reaches aquarium touch handling. Close/Escape resets the gesture; ordinary touches elsewhere remain immediate.

The canonical key is `fish-view:aquarium:<seed>`. The loader imports `fish-view:phase-0:<seed>:landscape` only when the canonical key is absent. Successful saving removes both old keys; quota failure preserves them. New payloads omit orientation. Tests cover offline catch-up once, biology retention, canonical precedence, ignored portrait saves and reset clearing obsolete keys.

## Browser measurements

Measured inside the real application embedded by `tools/viewport-lab.html`. The same iframe is resized, so these checks also exercise rotation without navigation or reinitialization. The harness may scale the outer iframe for inspection; its internal viewport dimensions remain exact. Harness controls and any surrounding scrollbars belong to the inspection page, not Fish View.

| Viewport | Displayed aquarium | Offset (x, y) | Backing canvas | Full fit / 5:3 / no page scroll |
|---|---|---|---|---|
| 800 × 480 | 800 × 480 | 0, 0 | 800 × 480 | Pass |
| 1280 × 720 | 1200 × 720 | 40, 0 | 800 × 480 | Pass |
| 1920 × 1080 | 1800 × 1080 | 60, 0 | 800 × 480 | Pass |
| 844 × 390 | 650 × 390 | 97, 0 | 800 × 480 | Pass |
| 390 × 844 | 390 × 234 | 0, 305 | 800 × 480 | Pass |
| 360 × 800 | 360 × 216 | 0, 292 | 800 × 480 | Pass |

Visually inspected native, desktop, portrait phone and landscape phone views, plus the developer drawer at desktop and phone sizes. Daylight and night rendering were inspected. The phone drawer scrolls to the time, metrics and lab controls independently. Two taps remained hidden; a third opened it, including after closing and at different scales. Browser synthetic touch events and actual mouse input were exercised; physical touch hardware was not available.

Screenshots:

- [Desktop at 1920 × 1080](assets/horizontal/fish-view-desktop-1920.jpg)
- [Portrait phone at 390 × 844](assets/horizontal/fish-view-portrait-390.jpg)
- [Landscape phone at 844 × 390](assets/horizontal/fish-view-landscape-844.jpg)
- [Mobile developer drawer, scrolled](assets/horizontal/fish-view-mobile-panel.jpg)

No application console errors were observed. The browser's own extension emitted metadata-transport errors unrelated to Fish View.

## Automated results

- `npm test`: **318 passed, 0 failed**.
- Focused actual-entry-point input/lifecycle and presentation/migration checks: **7 passed, 0 failed**, including the expanded pointer tests after the full-suite run.
- `audit:simulation`: **48,000 ticks, 48,000 fish samples, 0 failures** across eight seeds. This default run starts with the founding fish; mature behavior remains covered by the existing suite.
- `audit:persistence -- --cases=200`: **200 malformed saves, 0 failures**.
- `audit:render`: **540 incremental frames, 0 differences from full redraw, 0 escaped spans** across three seeds, touch and day/night transitions.
- `measure:feeding`: all **32 unique growth-stage sprites** meet the existing 0.25-row strike-gap tolerance.
- Behavior capture smoke run: one landscape contact sheet and manifest. Plant-lab inspection command completed.
- All source, tests and tools parse as JavaScript; `git diff --check` passes.

[Simulation audit](assets/horizontal/simulation.json), [persistence audit](assets/horizontal/persistence.json), [pixel-render audit](assets/horizontal/render.json).

## Aquarium preservation

Compared this implementation with baseline commit `29a8497`, using seeds 5, 83 and 147 at days 0 and 730. After 100 ticks in each of the six cases, complete simulation state and native scene commands were deeply identical after removing only the obsolete orientation metadata. The migration changes presentation and architecture without redesigning the aquarium.

## Limits

Browser validation uses Chromium with real iframe viewports, not physical Android/iOS devices or an ESP32-S3. Safe-area fitting is implemented but hardware insets were not emulated. ESP32 firmware compilation is not available in this web-reference repository.
