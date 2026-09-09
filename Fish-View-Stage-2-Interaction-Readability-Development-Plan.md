# Fish View — Stage 2 Development Plan
## Interaction, Relationship, Readability, and Long-Term Watchability

**Repository:** `CigThePig/Fish_view`  
**Canonical aquarium:** 800 × 480 landscape, 66 × 20 logical world  
**Target hardware:** Waveshare ESP32-S3 7" touchscreen, 8 MB PSRAM  
**Target cadence:** approximately 8–10 FPS / current 10 Hz simulation cadence  
**Document purpose:** This is an implementation specification for an AI engineering agent. Follow the phases in order. Complete the evidence and acceptance gates for each phase before beginning the next.

---

# 1. Mission

Fish View is approximately halfway through its intended product development.

The first half created the aquarium itself:

- persistent fish with individual identity
- deterministic personalities
- drives and utility-driven behavior
- social relationships
- fish growth and scheduled arrivals
- a living school
- plant growth and propagation
- substrate feeding
- bubbles
- snails
- shrimp
- drifting plant material
- day/night lighting
- habitat aging over months and years
- depth-aware rendering
- incremental dirty-rectangle rendering
- developer laboratories and measurement tools
- persistence and offline progression

The second half is not a small collection of touch effects.

The purpose of Stage 2 is to build the **relationship layer** between the viewer and the aquarium, while simultaneously making the aquarium's autonomous behavior readable enough that a child can understand what is happening simply by watching it.

At the end of this stage, Fish View should no longer feel like:

> an aquarium simulation that can be poked

It should feel like:

> a small persistent ecosystem that notices the person outside the glass, reacts physically to their presence, develops recognizable individual relationships with them, and communicates its own internal behavior through motion rather than UI.

The primary product test remains long-term watchability.

The aquarium does not need to be maximally impressive during a five-minute demo. It needs to remain interesting on the four-hundredth glance.

---

# 2. Product Principles

These principles govern every phase.

## 2.1 One canonical aquarium

There is only one product orientation:

**800 × 480 horizontal landscape.**

Do not reintroduce portrait simulation, portrait layouts, orientation-specific world generation, comparison mode, alternate logical dimensions, or architecture intended to preserve orientation symmetry.

Portrait phones display the same horizontal aquarium scaled down.

---

## 2.2 No visible game UI

The aquarium should not acquire:

- buttons
- menus
- status bars
- friendship meters
- stamina bars
- text labels
- speech bubbles
- icons
- quest markers
- gesture hints
- notifications
- achievements
- explicit interaction modes

The hidden developer drawer remains developer-only.

All meaningful state must be expressed through:

- motion
- position
- posture
- spacing
- timing
- depth
- environmental response
- colour when appropriate
- visible cause and effect

---

## 2.3 Complexity belongs underneath a simple interaction grammar

The user-facing interaction system should remain discoverable through natural touchscreen behavior.

The primary one-finger vocabulary is:

1. **Tap**
2. **Hold**
3. **Slow drag**
4. **Fast swipe**

Do not require the user to memorize gesture combinations.

Multi-touch may remain available to the platform but is not required for the core product.

The same gesture can acquire different meaning because of **context**, not because the user entered a mode.

Examples of context include:

- open water
- near a fish
- near the surface
- through a plant
- near a bubble
- near the substrate
- near a small resident

---

## 2.4 Immediate response is mandatory, universal obedience is not

The previous interaction rule effectively meant:

> touch the screen and every fish immediately swims to the touch point.

That rule is superseded by this Stage 2 design.

Every valid interaction must still produce immediate visible acknowledgment, normally within one simulation tick.

However, **every fish does not need to perform the same response**.

The aquarium as a whole must respond reliably.

Individual fish may:

- approach
- orient
- watch from a distance
- follow later
- remain nearby
- briefly acknowledge and continue
- react through a companion
- react differently based on personality or familiarity

A resting or cautious fish does not need to abandon all current behavior every time a finger touches the glass.

The system must remain deterministic:

> same aquarium state + same input history = same result.

Do not use uncontrolled runtime randomness to make the response unpredictable.

Variation should come from deterministic state, identity, personality, position, relationships, context, and history.

---

## 2.5 Interaction should behave like an ecological event, not a command

A touch is not fundamentally:

> assign target coordinate to fish.

A touch is:

> something happened at this point in the aquarium.

Fish perceive it.

Plants may physically respond.

Bubbles may move.

Small residents may react.

The school may alter course.

The surface or substrate may respond when appropriate.

Secondary consequences can cause further behavior.

Interaction should create **causal chains**.

Example shape:

> finger disturbs substrate → silt rises → shrimp hops → curious bottom-feeder investigates → nearby companion joins later

The exact chain should emerge from bounded systems rather than a scripted cutscene.

---

## 2.6 Preserve personality

Interaction must reveal personality rather than flatten it.

A shy fish becoming familiar with the viewer should still look shy compared with a naturally bold fish.

A highly active fish should not react identically to a low-activity fish.

Personality modifies choreography.

It must not destroy the visual signature of the underlying behavior.

---

## 2.7 Nothing dies and interaction cannot punish the child

Existing product constraints remain.

No interaction may:

- kill a fish
- permanently harm a fish
- remove a fish
- make the aquarium worse because it was touched too much
- create a guilt mechanic
- introduce upkeep or chores
- cause permanent fear
- make a fish permanently dislike the viewer

If repetitive input needs to be moderated, use short-term attention saturation or changing response style, not punishment.

The screen must always remain responsive.

---

## 2.8 Keep runtime state bounded

This product is intended for an ESP32-S3 running continuously.

Do not introduce:

- unbounded particle systems
- event histories that grow forever
- per-frame logs
- unbounded gesture paths
- arbitrary-length replay buffers
- unbounded interaction queues
- dynamic populations whose size grows with play
- persistence fields that accumulate one record per interaction

Prefer:

- fixed-size transient arrays
- compact rolling histories
- bounded scalar memories
- reconstructable environmental effects
- deterministic derivation
- short-lived records with hard caps

---

## 2.9 Local visual change is preferable to global repaint

The current renderer is built around stable scene objects and dirty rectangles.

Transient interaction should normally modify:

- a fish object
- a small local effect
- a nearby plant
- a local bubble
- a small section of the surface
- a bounded resident

Avoid interaction effects that require changing the entire background signature every frame.

A visually modest local effect can be more valuable than a spectacular full-screen effect if it preserves sustained device performance.

---

# 3. Current Stage 2 Baseline

Before implementation begins, understand the current interaction architecture.

At present:

- normal aquarium interaction begins on primary `pointerdown`
- there is no gameplay meaning for pointer hold, pointer movement, drag, or release
- every touch becomes one transient global reaction
- the reaction lasts 3.2 seconds
- every persistent fish is forced into `touch-react`
- the school is attracted toward the reaction
- the previous fish activity is effectively interrupted rather than paused and resumed
- the nearest persistent fish receives a small persistent boldness and sociability drift
- future touch behavior does not meaningfully use that learned touch history
- plant specimens already bend in response to nearby touch and nearby persistent fish
- substrate touches already produce a small deterministic bubble burst
- persistent fish can physically disturb bubbles
- the renderer already draws an expanding reaction ripple
- touch-produced bubbles are technically eligible for fish investigation but cannot naturally be investigated because global `touch-react` overrides every fish for the entire lifetime of those bubbles
- the water surface is autonomous and does not currently react to touch
- snails, shrimp, drifting tufts, and habitat structures currently do not directly react to the user
- existing development tooling can run deterministic scenarios, produce semantic capture sheets, make videos, measure behavior readability, compare incremental rendering against full rendering, and report dirty-rectangle damage

Do not discard this work.

Stage 2 should evolve the existing architecture.

---

# 4. Definition of Done for the Entire Stage

Stage 2 is complete only when all of the following are true.

## Human interaction

A user can naturally discover and use:

- tap
- hold
- slow drag
- fast swipe

Those gestures have contextual consequences without explicit modes.

The aquarium immediately acknowledges all valid interactions.

Different fish visibly react differently.

Interaction no longer synchronizes the entire persistent cast into one identical response.

---

## Persistent relationship

Individual fish develop a visible long-term relationship with interaction at the front glass.

Long-term familiarity changes behavior gradually across repeated sessions.

A familiar fish can look noticeably different from an unfamiliar fish without any UI or text.

---

## Environmental causality

Interaction can visibly propagate beyond fish.

Plants, bubbles, substrate, surface, suspended matter, and selected small residents participate where appropriate.

Effects remain bounded.

---

## Autonomous behavior readability

Important activities can be identified visually by a person who has not read the code.

At minimum, the following must have distinct visual signatures:

- playful chase
- individual follow
- companion cruise
- school follow
- substrate forage
- bubble investigation
- plant investigation
- plant weave
- surface investigation
- open-water rest
- plant shelter
- human/glass interaction

A chase must unmistakably look like pursuit and evasion rather than casual following.

---

## Watchability

The aquarium avoids excessive synchronization.

It can support multiple independent points of interest.

High-energy events do not constantly overlap and cancel each other's readability.

Repeated touch does not produce the exact same three-second visual sentence every time.

The aquarium remains visually alive when untouched.

---

## Hardware discipline

All new systems remain bounded.

Ordinary animation and normal interaction remain compatible with the project's ESP32-S3 performance strategy.

No new feature requires permanent full-frame redraws.

No interaction path creates unbounded memory growth.

---

# 5. Development Workflow Requirements

These apply to every phase.

## 5.1 Investigate before modifying

Before changing a subsystem:

1. read its production code
2. read its relevant tests
3. inspect relevant existing developer tooling
4. understand current deterministic/persistence contracts
5. inspect the current rendered behavior when possible

Do not rewrite systems simply because a new architecture is easier to describe.

---

## 5.2 Preserve evidence

Every phase should leave reusable evidence.

Depending on the phase, this may include:

- deterministic test cases
- metrics
- interaction manifests
- contact sheets
- GIF/MP4 captures
- long-watch summaries
- damage-budget reports
- before/after comparisons
- developer-lab scenarios

Visual behavior must not be accepted only because tests pass.

---

## 5.3 Prefer production-path validation

Do not validate only hand-authored fake state.

Use forced fixtures to isolate behavior, but also prove that the same behavior can occur through production code.

---

## 5.4 Do not optimize for test count

This is one physical aquarium intended for a child's room.

Spend engineering effort on:

- visual quality
- behavioral correctness
- continuity
- bounded runtime cost
- practical recovery from persistence failures
- real interaction quality

Do not create hundreds of redundant edge-case tests simply to increase coverage.

---

## 5.5 One phase, one reviewable unit

Each major phase should be completed as a coherent implementation unit.

Before moving to the next phase:

- run the relevant regression suite
- capture required visual evidence
- record performance effects
- document remaining limitations
- resolve valid code-review findings

Do not allow later phases to conceal unfinished failures from earlier ones.

---

# 6. Phase 0 — Interaction Observation and Baseline Instrumentation

## Objective

Create the measurement and visual-observation foundation needed to evaluate interaction changes scientifically and visually.

This phase should change developer tooling, not the product interaction behavior.

---

## Required work

Build or extend an **interaction observation harness** capable of replaying deterministic pointer histories against production simulation behavior.

The harness must support at least:

- tap at world coordinate
- press/hold for configurable duration
- slow drag along a path
- fast swipe along a path
- repeated taps
- interactions in multiple environmental contexts

Record the input history in a bounded/replayable form.

The harness should be able to run against:

- a new aquarium
- a stocked/mature aquarium
- multiple deterministic seeds

---

## Required per-fish measurements

For each interaction observation, collect at least:

- fish identity/seed
- personality traits relevant to the response
- glass-related affinity/familiarity state when available
- starting activity
- activity immediately after input
- response latency
- starting distance from stimulus
- closest distance reached
- distance travelled
- average speed
- peak speed
- peak acceleration if practical
- peak pitch
- turn magnitude or turn count
- time spent near interaction
- ending/recovery activity
- whether behavior resumed, changed, or was replaced

---

## Required whole-aquarium measurements

Collect:

- number of persistent fish responding strongly
- number responding weakly/passively
- school centroid displacement
- school spread change
- plant objects disturbed
- bubbles created or disturbed
- small residents affected
- scene object count
- glyph count
- dirty rectangle count
- damaged pixel percentage
- full-redraw flag

---

## Required visual capture

For each interaction scenario produce a semantic capture sequence.

Suggested moments:

- before interaction
- first visible response
- early response
- peak response
- immediate recovery
- delayed aftermath

Do not use fixed percentages when better semantic moments can be detected.

Support native-resolution video/GIF capture for selected scenarios.

---

## Baseline scenarios

Capture the current implementation before changing it.

At minimum:

1. open-water tap
2. substrate tap
3. tap near plant
4. repeated taps
5. mature aquarium tap
6. tap during feeding
7. tap during chase
8. tap during rest
9. tap during bubble investigation

The purpose is to preserve evidence of the current synchronization and interruption behavior.

---

## Acceptance gate

Phase 0 is complete when:

- deterministic interaction histories can be replayed
- before/event/response/recovery can be observed
- renderer damage is recorded
- native captures can be generated
- current touch behavior has baseline evidence
- no production interaction semantics have changed

Do not begin Phase 1 without this harness.

---

# 7. Phase 1 — Core Stimulus and Impulse Architecture

## Objective

Replace the single global touch-reaction concept with a general bounded event model that can support all later interaction work.

This is an architectural phase.

Do not attempt to fully implement the final gesture vocabulary yet.

---

## Core concepts

Introduce two conceptually separate event types.

### Stimulus

Represents something that inhabitants can perceive.

Candidate properties:

- unique transient identity
- source type
- position
- optional direction
- optional recent path
- intensity
- radius
- age
- duration
- motion velocity
- contextual classification
- salience

### Impulse

Represents physical disturbance in the aquarium.

Candidate properties:

- origin
- direction
- strength
- radius
- age
- decay
- optional surface/substrate relevance

The exact field names are implementation details.

The architectural distinction is mandatory.

A fish can notice a stimulus without being physically pushed.

A plant can react to an impulse without having a behavioral state machine.

---

## Boundedness

Set explicit hard limits.

Examples:

- fixed maximum active stimuli
- fixed maximum active impulses
- fixed maximum short path samples
- expired events removed immediately
- repeated events coalesce where appropriate

Do not create an ever-growing interaction event list.

---

## Determinism

Event creation and response selection must remain deterministic.

Avoid `Math.random()`.

If tie-breaking is needed, derive it from:

- aquarium seed
- fish identity
- event identity
- deterministic state

---

## Backward compatibility

Route the current tap through the new system while initially preserving approximately the existing visible result.

The purpose is to prove:

> new event architecture works before behavior is redesigned.

Keep save-file compatibility.

Transient event state should not become persistent unless a later phase explicitly requires a durable summary.

---

## Required tests

Cover:

- event creation
- event expiration
- event cap
- deterministic event identity
- coalescing behavior if used
- same state + same event history = same result
- save/restore excludes transient active events
- offline progression clears transient events

---

## Acceptance gate

Phase 1 is complete when:

- current tap behavior is routed through stimulus/impulse infrastructure
- the simulation remains deterministic
- transient events are bounded
- persistence remains bounded
- existing visual behavior has not materially regressed
- interaction observation harness produces equivalent baseline results

Do not redesign individual fish response until this foundation is stable.

---

# 8. Phase 2 — Attention, Response Roles, and Contextual Tap

## Objective

End the global “every persistent fish does the same thing” response.

A tap becomes an attention event.

The aquarium must acknowledge it immediately, but individual fish should receive different deterministic response roles.

---

## Response role model

Design a bounded role vocabulary such as:

- **primary investigator**
- **secondary investigator**
- **observer**
- **cautious observer**
- **delayed investigator**
- **continue-current-activity with visible acknowledgment**

Names are not important.

The distinction is.

The role assignment should consider:

- distance
- current activity
- personality
- fixed glass affinity
- long-term familiarity once Phase 6 exists
- energy
- social relationships
- whether a trusted companion is responding
- species/body constraints
- event salience

---

## Hard response guarantees

Every valid tap must produce:

- immediate visible environmental acknowledgment
- at least one clearly readable animal response unless no fish are present
- no input lag caused by waiting for utility selection

But it must **not** require all persistent fish to abandon their activities.

---

## Passive acknowledgment

Create readable low-cost reactions for fish that do not approach.

Examples of response channels:

- turn head/body toward disturbance
- brief pitch/orientation change
- small trajectory bend
- pause/slow
- increase distance
- watch from a stable standoff

Do not rely on tiny imperceptible numbers.

If a reaction is encoded in state, it must have a visible correlate.

---

## Contextual tap classification

A tap should be classified based on its surroundings.

At minimum distinguish:

- open water
- near substrate
- near surface
- near plant mass
- near bubble
- near persistent fish

Classification must be deterministic and bounded.

Do not create explicit user modes.

---

## Direct fish proximity

A tap near a specific fish may increase that fish's response salience, but do not turn the fish into a draggable UI element.

The aquarium remains a world, not a character-selection interface.

---

## Recovery

A response must have an aftermath.

Do not recreate:

> event ends → all transient meaning disappears instantly.

A responder may:

- linger
- continue inspecting
- return gradually
- resume a compatible previous behavior
- transition naturally into another activity

Implement an explicit recovery policy.

Avoid invisible hard cancellations where possible.

---

## Required evidence

Capture the same tap:

- in multiple seeds
- in a stocked aquarium
- near multiple personality types
- during rest
- during forage
- during social behavior

The visual evidence should clearly show multiple response styles.

---

## Acceptance gate

Phase 2 is complete when:

- one tap no longer synchronizes the full persistent cast
- immediate feedback remains guaranteed
- multiple fish visibly react differently
- current activities are not indiscriminately cancelled
- recovery is readable
- interaction remains deterministic
- no obvious hardware-budget regression appears

---

# 9. Phase 3 — Hold Interaction and Persistent Presence

## Objective

A stationary finger held against the glass becomes a continuing presence rather than a single pulse.

---

## Gesture semantics

The press begins with the normal tap acknowledgment.

If the pointer remains within the hold movement threshold beyond the hold threshold, transition into a persistent-presence stimulus.

Do not require a mode switch.

---

## Interaction arc

A hold should support behavior phases such as:

1. notice
2. orient
3. approach
4. inspect
5. linger
6. lose interest / settle
7. departure after release

Different fish may stop at different phases.

---

## Personality effects

Personality should visibly shape:

- response latency
- standoff distance
- approach speed
- willingness to remain nearby
- whether a fish arrives late
- whether it follows a companion toward the glass

A cautious fish should not simply be a slower bold fish.

---

## Release behavior

Pointer release must matter.

The stimulus should not vanish without consequence.

Potential aftermath:

- responder remains near glass briefly
- fish searches the last position
- fish resumes previous activity
- fish peels away gradually

---

## Repeated hold behavior

Repeated holding at the same location should not produce a perfectly identical performance every time.

Variation should arise from changing state and context while remaining deterministic.

---

## Acceptance gate

Phase 3 is complete when:

- hold is behaviorally distinct from tap
- a fish can visibly remain engaged with a stationary finger
- multiple fish respond with different levels of commitment
- release has readable aftermath
- long holds remain bounded in state and rendering cost
- a 30–60 second hold cannot create unbounded effects

---

# 10. Phase 4 — Drag, Swipe, and Local Water Impulse

## Objective

Introduce meaningful pointer motion.

Slow movement represents a moving point of interest.

Fast movement represents a stronger directional physical disturbance.

---

## Pointer-path capture

Store only a short bounded path history.

The path representation should be sufficient to estimate:

- position
- direction
- speed
- recent curvature

It must not grow with gesture duration.

---

## Slow drag

A slow drag should create a moving stimulus.

Fish should not be rigidly attached to the cursor.

Possible readable behavior:

- follow behind
- intercept from the side
- investigate part of the trail
- follow briefly, then leave
- arrive after the finger passes
- companion follows responder rather than finger

The path should influence the aquarium through world response, not by drawing a touchscreen trail.

---

## Fast swipe

A fast swipe should create a stronger local directional impulse.

Potential physical consumers:

- nearby plants
- bubbles
- drifting material
- suspended particles
- school trajectory
- selected persistent fish
- small residents

The event arc should read:

> disturbance → displacement/response → settling

---

## Gesture classification

Avoid brittle exact-speed thresholds.

Use hysteresis or clear bands so normal human movement does not rapidly flip between drag and swipe semantics.

---

## No direct puppet control

Do not allow the finger to directly overwrite fish positions or velocities every frame.

Fish should remain autonomous agents reacting to moving stimuli.

---

## Required evidence

Capture:

- straight slow drag
- curved slow drag
- drag near a fish
- drag through plant mass
- drag through bubbles
- fast horizontal swipe
- fast diagonal swipe
- repeated swipes
- swipe during chase/social event

---

## Acceptance gate

Phase 4 is complete when:

- slow drag and fast swipe are visually distinct
- fish reactions retain autonomy
- nearby environment responds directionally
- effects settle cleanly
- pointer histories remain bounded
- repeated gestures cannot create runaway object counts
- repaint remains localized

---

# 11. Phase 5 — Environmental Interaction and Causal Chains

## Objective

Make the aquarium itself interactive rather than limiting interaction to fish.

---

## 11.1 Plants

Extend existing plant disturbance architecture rather than replacing it.

Plants should be able to respond to:

- direct nearby interaction
- moving water impulse
- nearby persistent fish
- potentially school motion only if cheap and visually useful

Improve spatial accuracy.

Current touch disturbance that ignores vertical distance should be reconsidered.

A high touch should not necessarily bend substrate plants directly below it with the same strength as a low touch.

---

## 11.2 Bubbles

Bubbles should react to relevant local impulse.

Potential responses:

- horizontal deflection
- increased rise
- local wobble
- pop/disperse when directly disturbed

Repair the current logical dead end where touch-created bubbles can be marked investigable but cannot naturally be investigated while global touch reaction is active.

Do not force a fish to investigate every touch bubble.

Make the path genuinely reachable.

---

## 11.3 Substrate

Substrate interaction should have a recognizable physical response.

Possible channels:

- short-lived silt
- displaced grains
- small deterministic bubble release
- nearby bottom-resident reaction

Reuse feeding debris/raster techniques where appropriate.

Do not create a persistent deformable terrain simulation.

---

## 11.4 Surface

Create a localized surface response to interaction near the waterline.

This must be implemented as localized scene change, not a global background-state mutation that forces whole-frame repaint.

The effect should be physically compatible with the existing autonomous surface wave system.

---

## 11.5 Suspended matter and drifting tufts

Moving stimuli/impulses may perturb:

- drifting tufts
- sparse dust
- other lightweight ambient material

These are useful because they make invisible water motion visible cheaply.

---

## 11.6 Shrimp and snails

Give selected small residents bounded interaction responses.

Examples:

- shrimp performs a short escape hop from nearby strong disturbance
- snail pauses/retracts briefly after direct nearby disturbance

Do not promote ambient residents into full persistent drive-based agents.

Keep them reconstructable/bounded.

---

## 11.7 Causal chaining

Allow one environmental response to become a stimulus for a fish when appropriate.

Examples:

- disturbed bubble becomes investigable
- substrate puff attracts a compatible fish
- moving tuft catches curiosity
- shrimp escape movement catches nearby fish attention only if visually useful

Use strict salience and cooldown rules to prevent chain explosions.

---

## Acceptance gate

Phase 5 is complete when:

- interaction visibly affects more than fish
- effects remain local and bounded
- environment settles naturally
- at least several production-reachable causal chains exist
- chains do not create recursive event storms
- transient global repaint has not become normal
- interaction captures make physical cause/effect obvious without UI

---

# 12. Phase 6 — Persistent Fish–Viewer Relationship

## Objective

Make individual fish visibly develop a relationship with the person at the glass over weeks and months.

This is one of the central emotional systems of Stage 2.

---

## Long-term state: glass familiarity

Introduce a compact bounded per-fish relationship measure.

Working concept:

**glass familiarity**

This should represent accumulated comfort/interest with human interaction.

It must not be displayed numerically.

It exists only because it changes visible behavior.

---

## Familiarity growth

Familiarity should increase gradually from meaningful interactions.

Do not simply add a fixed amount for every pointer event.

Possible contributing factors:

- fish was primary responder
- fish approached close to the stimulus
- fish remained engaged
- fish followed a moving stimulus
- fish voluntarily returned to front-glass depth
- repeated gentle contact across multiple sessions

Avoid rewarding spam linearly.

---

## Short-term attention saturation

Separate long-term familiarity from short-term repetition.

A fish may become temporarily less interested after many rapid interactions while still remaining highly familiar overall.

This prevents:

> tap 40 times = 40 identical enthusiastic responses

without punishing the child.

Short-term saturation should:

- decay naturally
- never make the aquarium unresponsive
- change response style rather than disable it

---

## Visible familiarity consequences

As familiarity grows, a fish may gradually:

- orient toward interaction sooner
- approach from farther away
- maintain a smaller standoff distance
- remain near the glass longer
- follow slow drags more readily
- visit front-glass depth voluntarily
- arrive earlier than unfamiliar fish
- react less strongly to startling impulse while remaining attentive
- follow the region of recent interaction after release

Do not enable all of these at one threshold.

Use gradual behavioral shaping.

---

## Preserve fixed personality

Long-term familiarity must compose with fixed personality.

Examples:

**Bold + familiar**  
Fast approach, small standoff, frequent voluntary glass visits.

**Bold + unfamiliar**  
Investigates readily but does not linger long.

**Cautious + familiar**  
Approaches reliably but slowly, keeps moderate distance, may watch for longer.

**Cautious + unfamiliar**  
Often observes from distance or follows a trusted companion.

---

## Voluntary initiation

Once familiarity and personality permit, fish should sometimes initiate apparent interaction.

Possible behavior:

- swim to front-glass depth
- face outward
- linger
- move laterally along the glass
- revisit a recent interaction region
- remain available for a touch response

Do not show a notification.

The fish's behavior itself is the invitation.

Keep frequency low enough that it remains special.

---

## Persistence

Store only compact bounded state.

Do not store raw interaction event logs.

Old saves must restore safely with sensible defaults.

Offline time should not fabricate thousands of interactions.

---

## Required long-horizon evidence

Create accelerated relationship captures at:

- unfamiliar baseline
- early familiarity
- medium familiarity
- high familiarity

For several personality types.

Also validate a production-time growth path rather than only directly setting the variable.

---

## Acceptance gate

Phase 6 is complete when:

- a viewer can visually distinguish unfamiliar and familiar behavior
- familiarity does not erase personality
- repeated input does not linearly spam relationship growth
- short-term saturation changes repeated interaction without punishment
- voluntary glass visits exist and are bounded
- save size remains essentially fixed
- no raw interaction history grows over time

---

# 13. Phase 7 — Behavior Choreography and Readability Overhaul

## Objective

Make autonomous behavior understandable at a glance.

This phase is as important as interaction.

The aquarium should communicate intent through motion.

---

## The three-cue rule

Every important activity must be identifiable through at least **three independent visual cues** selected from:

1. speed envelope
2. acceleration/deceleration profile
3. path geometry
4. posture/pitch
5. turn style
6. target relationship
7. spacing
8. body animation intensity
9. environmental consequence
10. explicit exit/break behavior

Do not count tiny parameter differences that are invisible on the panel.

---

## Required behavior signatures

Develop and visually validate clear signatures for:

- cruise
- open-water wander
- plant investigate
- plant weave
- bubble investigate
- surface investigate
- school follow
- individual follow
- companion cruise
- playful chase
- substrate search/feeding
- open-water rest
- plant shelter
- human/glass investigation
- arrival behavior
- drifting-object inspection

---

## Prevent visual aliasing

Two conceptually different activities should not share nearly identical motion sentences.

Priority comparisons:

- chase vs individual follow
- individual follow vs companion cruise
- companion cruise vs ordinary cruise
- rest vs shelter
- plant investigate vs plant weave
- bubble investigate vs surface investigate
- feeding descent vs normal downward movement
- human interaction vs bubble/plant investigation

---

# 14. Phase 7A — Flagship Chase Redesign

## Objective

Make playful chase unmistakable.

A viewer should immediately understand:

> that fish is chasing that fish.

---

## Required chase arc

A chase should contain clearly readable phases.

### 1. Provocation / engagement

The chaser deliberately closes.

The target becomes aware.

Do not begin with both fish already moving in parallel.

### 2. Escape burst

The target performs a genuine speed burst.

Escape direction should vary deterministically.

Allow:

- diagonal cuts
- vertical evasions
- horizontal reversals when safe
- changes in depth/path where readable

### 3. Pursuit

The chaser responds with a slight delay.

Avoid perfectly mirrored steering.

### 4. Gap oscillation

A chase should contain changing distance.

Required visual concept:

> close → evade → close → cut → overshoot or near miss

### 5. Overshoot / interception

Occasional deterministic overshoot is highly desirable.

The chaser should sometimes pass where the target was and then correct.

This strongly differentiates pursuit from casual following.

### 6. Break

The chase ends visibly.

The pair should separate on different headings.

They should decelerate independently.

Do not end with the pair quietly continuing nose-to-tail.

---

## Personality shaping

Personality may change:

- burst strength
- pursuit duration
- break threshold
- turn aggression
- target evasiveness
- likelihood of overshoot
- chase initiation frequency

But every chase must still read as a chase.

---

## Body-size effects

Do not force large and tiny fish to use identical choreography.

Large fish may:

- accelerate less sharply
- use broader turns
- maintain larger spacing

Small fish may:

- cut more tightly
- change vertical direction faster

Keep all movement inside safe rendering/substrate/surface envelopes.

---

## Required chase evidence

Produce:

- full native video
- semantic contact sheet
- pair-distance timeline
- speed timeline
- turn-rate evidence
- break-phase capture

Run several personality/body-size combinations.

---

## Acceptance gate

Do not consider chase complete because a numerical peak-speed target is met.

Chase passes only when visual inspection shows:

- obvious pursuer
- obvious evader
- visible speed contrast
- changing pair spacing
- at least one strong trajectory change
- readable chase ending

---

# 15. Phase 7B — Remaining Behavior Readability Pass

Apply the same rigor to all other activities.

## Companion cruise

Must read as:

> these two fish are intentionally spending time together.

Use:

- low/moderate matched speed
- side-by-side or relaxed offset
- stable proximity
- coordinated but not identical turning
- gentle separation at end

---

## Individual follow

Must read as:

> one fish is following another.

Use:

- consistent rear offset
- leader unaffected or less affected
- follower corrections
- moderate speed
- deliberate peel-away ending

---

## School follow

Must read as:

> this individual is joining/following the school.

Use:

- approach toward school edge
- matching velocity
- adjustment into group spacing
- eventual departure or integration

---

## Bubble investigation

Must read as:

> fish noticed that bubble.

Use:

- target interception
- upward/pursuit posture
- slowing at inspection range
- gaze/orientation toward bubble
- search/exit if bubble disappears

---

## Plant investigation

Must read as deliberate inspection, not accidental swimming near a plant.

Use:

- curved/local approach
- orientation toward plant feature
- slowdown
- short stable inspection
- deliberate retreat

---

## Plant weave

Must visually cross plant structure.

Use:

- alternating waypoint geometry
- visible lateral movement around stems
- continuous progression
- distinct exit

---

## Surface investigation

Must read as intentional surface behavior.

Use:

- sustained ascent
- nose-up posture
- surface probe
- short surface linger
- clear descent

---

## Rest and shelter

Rest should read as low-energy open-water stillness.

Shelter should read as deliberate use of plant cover.

They should differ through:

- location
- speed
- posture
- depth/layer relationship
- exit behavior

---

## Feeding

Retain current size-aware substrate safety.

Improve readability through:

- deliberate descent
- search sweep
- nose-down approach
- contact event
- silt/debris
- recoil/lift
- cluster rhythm
- clear return to swimming

Never reintroduce the previous vertical teleport/snapping defects.

---

## Acceptance gate

Phase 7 is complete when each important activity has:

- documented visual signature
- forced capture
- natural production evidence where applicable
- differentiation from its nearest visual neighbor

---

# 16. Phase 8 — Scene Salience and Aquarium Choreography

## Objective

Prevent the richer aquarium from becoming unreadable visual noise.

This is not a scripted director.

It is a lightweight pressure system that helps independent emergent activities coexist.

---

## Salience model

Define coarse event salience.

Example conceptual levels:

- ambient
- low
- medium
- high/focal

High-energy activities may include:

- chase
- major swipe response
- concentrated human interaction
- energetic social event

Ambient activities include:

- snail travel
- plant sway
- ordinary cruise
- dust
- calm bubbles

---

## Anti-synchronization

Reduce cases where many persistent fish enter the same activity simultaneously without a strong ecological reason.

Interaction response roles should already help.

Extend this principle into autonomous activity scheduling where appropriate.

---

## Focal-event pressure

When one high-salience event is already active, slightly reduce the probability/utility of starting another unrelated high-salience event nearby.

Do not:

- cancel existing natural behavior
- serialize the entire aquarium
- create hard “only one event at a time” rules

The system should remain emergent.

---

## Multiple visual regions

Encourage the tank to sustain independent interest across the horizontal field.

A healthy mature frame might contain:

- one social event
- one school movement
- one small resident
- one environmental movement
- one calm persistent fish

without all activity collapsing into the same coordinate.

---

## Event aftermath

Allow significant events to leave temporary low-energy tails.

Examples:

- plant settling
- drifting silt
- fish lingering
- school regrouping
- delayed curious arrival

This makes the aquarium feel causal instead of clip-based.

---

## Acceptance gate

Phase 8 is complete when:

- major events are visually readable in mature aquariums
- high-energy behavior does not constantly stack
- the aquarium does not feel artificially serialized
- multiple areas can remain independently interesting
- interaction does not collapse every visual focus into one location

---

# 17. Phase 9 — Repetition, Habituation, and Long-Watch Validation

## Objective

Evaluate whether the aquarium remains interesting over real viewing periods rather than only in short showcase loops.

---

## Observation windows

Run deterministic unforced observations at approximately:

- 5 minutes
- 30 minutes
- 2 hours

Use multiple seeds.

Include at least:

- young aquarium
- mature aquarium

Do not attempt to manually watch every frame.

Generate summaries and event timelines, then inspect selected footage.

---

## Measure repetition

Record:

- activity transition counts
- activity bout lengths
- high-salience event frequency
- repeated same-pair behavior
- repeated same-location behavior
- time with zero interesting persistent-fish activity
- simultaneous high-salience event count
- school centroid travel
- interaction-trigger response diversity

Look for **perceptual repetition**, not merely identical simulation state.

---

## Interaction habituation tests

Run repeated input patterns.

Examples:

- same tap every 5 seconds
- rapid repeated tap
- repeated hold
- repeated slow drag
- repeated swipe
- alternating interaction regions

Inspect whether the system produces:

- deterministic but context-sensitive variation
- short-term saturation
- preserved immediate feedback
- no event accumulation
- no fish becoming permanently unresponsive

---

## Viewer-readable event sampling

Generate selected video segments around:

- chase
- feeding
- relationship interaction
- plant investigation
- school-follow
- environmental causal chain

Prefer random/semi-random production observations in addition to forced showcase scenarios.

---

## Acceptance gate

Phase 9 is complete when:

- no short master-loop feeling dominates
- repeated interaction no longer looks like the same fixed animation
- long-watch summaries show varied event structure
- high-energy behavior frequency is reasonable
- the aquarium remains active during calm periods
- no unbounded event/memory accumulation occurs

---

# 18. Phase 10 — ESP32-Oriented Performance and Memory Budget

## Objective

Prove that Stage 2 did not design the product into a corner that cannot reasonably run on the intended device.

The JavaScript prototype is not a physical ESP32 benchmark.

Be explicit about that limitation.

---

## Required bounded-count report

Document maximum counts for all new transient structures.

At minimum:

- stimuli
- impulses
- pointer path samples
- fish interaction state
- environmental transient effects
- relationship persistence fields
- new scene objects
- new glyphs
- effect particles if any

All must have hard upper bounds.

---

## Rendering budget

Measure mature aquarium:

- average dirty area
- worst ordinary dirty area
- average interaction dirty area
- worst representative interaction dirty area
- dirty rectangle count
- full redraw count
- object count
- glyph count

Pay special attention to:

- mature plants
- full fish roster
- full school
- active interaction
- simultaneous environmental aftermath

---

## Performance red flags

Investigate if any feature:

- changes the background signature continuously
- repaints most of the screen for a local interaction
- creates many large overlapping damage rectangles
- turns many normally static objects into continuously animated objects
- allocates large structures per frame
- performs all-pairs work unnecessarily
- creates expensive rotated raster states beyond existing bounded cache strategy

---

## Memory discipline

Estimate JavaScript-side structure growth, but do not claim it equals C/C++ firmware memory.

The real goal is to establish architecture that can be translated efficiently.

---

## Physical-device gate

When firmware/hardware becomes available, repeat the relevant measurements on the ESP32-S3.

Required eventual device evidence:

- sustained frame rate
- PSRAM use
- framebuffer strategy
- tearing behavior
- touch latency
- long-run stability
- heat/power behavior as practical
- backlight behavior

Do not falsely treat desktop timing as ESP32 timing.

---

## Acceptance gate

Phase 10 is complete when:

- all new systems are explicitly bounded
- representative interaction does not routinely force full redraw
- performance regressions have explanations
- the renderer remains incremental
- no architecture obviously depends on desktop-class resources

---

# 19. Phase 11 — Integrated Product Validation and Polish

## Objective

Evaluate Stage 2 as one product rather than as isolated subsystems.

---

## Full interaction matrix

Test each primary gesture in representative contexts.

| Gesture | Open water | Fish | Plant | Bubble | Surface | Substrate |
|---|---:|---:|---:|---:|---:|---:|
| Tap | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Hold | ✓ | ✓ | evaluate | evaluate | evaluate | evaluate |
| Slow drag | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Fast swipe | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

Not every cell must have a unique handcrafted response.

The table exists to expose dead or contradictory interaction paths.

---

## Young aquarium validation

Remember that Fish View starts with very little content.

Stage 2 must still feel interactive on day one.

A feature set that is excellent only after the fifteenth fish arrives has failed the opening experience.

---

## Mature aquarium validation

At maturity:

- interaction must remain readable
- no excessive crowd synchronization
- no large persistent repaint storm
- focal events must survive visual density
- relationship behavior should remain identifiable

---

## Day/night validation

Interaction should work at night.

Do not solve readability with bright effects that destroy the nightlight aesthetic.

Night reactions should use the warm subdued palette and remain visible through motion/contrast.

---

## Phone/browser validation

Because browser and GitHub Pages remain development/reference environments:

- interaction coordinates must remain correct under CSS scaling
- portrait phones still show the horizontal aquarium
- hold/drag/swipe must work when the aquarium is scaled
- hidden developer triple-tap must remain isolated from aquarium gestures
- developer gesture recognition must not steal normal interaction outside its hotspot

---

## Persistence validation

Verify:

- relationship state survives save/restore
- transient gestures do not
- offline progression does not replay old gestures
- old saves gain safe defaults
- malformed relationship values are bounded/repaired
- save size remains bounded

Keep this practical.

Do not spend disproportionate effort fuzzing improbable save corruption.

---

## Final visual review

Produce a Stage 2 evidence package containing:

- interaction grammar video
- personality comparison
- familiarity progression
- environmental interaction montage
- chase sequence
- behavior-readability contact sheet
- mature 30-second untouched aquarium
- mature 30-second interactive aquarium
- night interaction
- performance summary

---

# 20. Behavior Readability Reference Matrix

Use this as the initial target language.

| Activity | Speed signature | Path signature | Posture | Relationship cue | Exit cue |
|---|---|---|---|---|---|
| Cruise | steady moderate | broad travel | neutral | none | natural continuation |
| Wander | variable moderate | exploratory arcs | neutral | environmental scanning | new route |
| Companion cruise | low/moderate matched | parallel | relaxed | stable pair spacing | gentle separation |
| Individual follow | moderate | trailing | neutral | rear offset | follower peels away |
| School follow | moderate | joins school edge | neutral | velocity matching | departure/integration |
| Playful chase | bursts | pursuit, cuts, overshoot | energetic | closing/opening gap | explicit break |
| Plant investigate | slow finish | curved approach | targeted | plant-facing | back away |
| Plant weave | moderate | alternating stem path | responsive | passes through plant structure | clear emergence |
| Bubble investigate | quick ascent then slow | moving intercept | nose-up | bubble standoff | search/leave/pop |
| Surface investigate | ascent | vertical probe | nose-up | waterline | descent |
| Substrate forage | descent then slow | bottom sweep | nose-down | terrain contact | lift/recover |
| Open-water rest | very low | gentle drift | level | none | gradual wake |
| Plant shelter | extremely low | confined | quiet | inside cover | slow emergence |
| Human/glass inspect | rapid orient, variable approach | stimulus-dependent | attentive | finger/glass standoff | linger/search/disengage |

Treat this as a design starting point.

Actual values must be tuned from visual evidence.

---

# 21. Interaction Grammar Reference

## Tap

**Concept:** short localized attention/disturbance event.

Must always:

- acknowledge instantly
- create local response
- allow personality-dependent fish roles

Should not:

- summon all fish identically
- require a persistent target

---

## Hold

**Concept:** continuing presence.

Must support:

- continuing engagement
- changing commitment over time
- release aftermath

---

## Slow drag

**Concept:** moving point of interest plus gentle local disturbance.

Must support:

- trailing
- interception
- partial following
- environmental visualization of motion

Should not:

- rigidly attach fish to cursor

---

## Fast swipe

**Concept:** strong directional impulse.

Must support:

- visible direction
- short-lived physical effect
- local animal/environment response
- settling

Should not:

- become a full-screen shake/effect

---

# 22. Architectural Non-Goals

Do not turn Stage 2 into:

- a virtual pet game with meters
- Tamagotchi-style chores
- feeding buttons
- minigame menus
- collectible currencies
- achievements
- explicit friendship points
- a touch-driven fish-control game
- physics simulation of every water molecule
- a fully persistent simulation for snails/shrimp
- an unbounded particle engine
- a 60 FPS animation project
- a general-purpose aquarium app
- a second portrait product
- an attempt to make every interaction affect every subsystem

The strength of the design should come from **coherent causal systems**, not feature count.

---

# 23. Failure Modes to Watch For

An AI implementing Stage 2 should actively look for these.

## Interaction becomes too subtle

The code may contain different response roles, but everything still looks like ordinary cruising.

Fix the visual language, not the documentation.

---

## Interaction becomes too synchronized

Different states may exist internally, but six fish still visibly turn at once and converge on one point.

Reduce common choreography.

---

## Every gesture becomes a particle effect

Environmental response should feel physical.

Do not compensate for weak fish choreography with visual noise.

---

## Personality makes behavior unreadable

If personality variation is so large that chase sometimes resembles rest, the design has failed.

Behavior owns the core signature.

Personality modifies it.

---

## Familiarity becomes a hidden number with no visible meaning

If changing familiarity cannot be identified from footage, remove or redesign it.

---

## Interaction destroys autonomous life

Fish View should still feel like an aquarium, not a touchscreen toy waiting for input.

The autonomous simulation remains primary.

---

## The aquarium becomes hyperactive

More possible events does not mean more simultaneous events.

Use salience pressure and aftermath.

---

## Day-one aquarium feels empty

All interaction systems must work meaningfully with the founder fish and reduced school.

---

## Mature aquarium becomes unreadable

Test with the full roster and habitat.

Do not tune only against sparse early states.

---

## Full-screen repaint sneaks into local interaction

Inspect dirty rectangles.

Local event should usually create local damage.

---

# 24. Recommended Phase Order Summary

Follow this order unless an actual technical dependency discovered during implementation requires a documented change.

1. **Phase 0 — Interaction observation and baseline tooling**
2. **Phase 1 — Stimulus and impulse architecture**
3. **Phase 2 — Response roles and contextual tap**
4. **Phase 3 — Hold / persistent presence**
5. **Phase 4 — Drag, swipe, and directional water impulse**
6. **Phase 5 — Environmental interaction and causal chains**
7. **Phase 6 — Persistent fish–viewer relationships**
8. **Phase 7 — Autonomous behavior readability**
   - 7A chase first
   - 7B remaining activity vocabulary
9. **Phase 8 — Scene salience and anti-synchronization**
10. **Phase 9 — Long-watch / habituation validation**
11. **Phase 10 — ESP32-oriented performance budget**
12. **Phase 11 — Integrated polish and final validation**

Do not collapse these into two or three giant implementation passes.

This stage represents roughly half of the intended product development.

Treat it accordingly.

---

# 25. Required Completion Report for Every Phase

At the end of each phase, produce a concise engineering report with:

## Changes made

List production and tooling changes.

## Architecture

Explain any new state or runtime concepts.

## Visual result

Describe what is visibly different.

## Evidence

Include:

- tests run
- measurements
- captures
- deterministic scenarios
- production observations

## Performance

Report:

- glyph/object changes where relevant
- dirty-area changes
- full redraws
- known cost increases

## Persistence

State whether save schema changed.

If it did, describe compatibility.

## Remaining limitations

Be explicit.

## Gate decision

Conclude with one of:

**PASS — phase complete; proceed.**

or

**FAIL — phase is not complete. Do not proceed.**

A passing test suite alone does not justify PASS for a visual/behavioral phase.

---

# 26. Final Product Standard

The finished Stage 2 aquarium should produce moments such as these naturally:

A fish notices a finger before the others.

Another remains in the plants and watches.

A familiar fish comes close to the glass.

A finger traces across the aquarium and one fish follows while another cuts across the path.

A swipe bends nearby plants and sends bubbles sideways.

A shrimp hops after a disturbance.

A bottom-feeder later investigates the disturbed area.

Two fish suddenly accelerate.

One cuts upward.

The other overshoots.

They separate.

Without text, the viewer understands:

> they were chasing each other.

Hours later, nothing needs attention.

No task is waiting.

No meter has drained.

The aquarium is simply doing something else.

Weeks later, the same fish is bigger.

The plants have changed.

There are new inhabitants.

And the fish that has spent months seeing the person outside the glass behaves as though that history matters.

That is the target for this stage of Fish View.
