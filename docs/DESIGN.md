# What Did You Just Do? — Game Design and Implementation Spec

**Status:** Pre-implementation design baseline (25 October 2026)  
**Target:** A complete two-person, 5–10-minute browser prototype, with no account creation or installation  
**Working hypothesis:** A toy whose causes and effects are distributed across two players can make describing, questioning, misinterpreting, and discovering together intrinsically enjoyable.

## 1. Premise and intention

Two friends arrive in separate clearings in the same seemingly ordinary landscape. Each finds two peculiar, oversized mechanical controls. Operating them changes things in the *other* clearing. Neither player has a complete picture of what the machinery does or why it is there.

At first, they fiddle with objects for the pleasure of seeing what happens, ask one another what changed, and develop a shared explanation. Eventually they realize the contraptions can be coordinated to produce an absurd, spectacular event.

The primary designed experience is the conversation: “What did you just do?”, “Do that again,” “Wait, when I turn this…”, and the eventual feeling of having understood something together.

This is a research prototype inspired by questions around *Big Walk*, cooperative puzzles, landscape, outdoor follies and the difference between puzzles and toys. It is **not** an attempt to reproduce *Big Walk*.

### Experience goals, in priority order

1. **Immediate curiosity:** An unfamiliar control is attractive to try, even without a quest marker.
2. **Social surprise:** The response to an action is more interesting to someone else than to its operator.
3. **Reciprocal dependence:** Both players can initiate discoveries, conduct experiments, and report evidence. Neither should become a passive remote-control operator.
4. **Legible experimentation:** Repeating an action yields a sufficiently consistent result for players to form hypotheses.
5. **Low-friction collaboration:** Players can coordinate through an ordinary voice call without learning a bespoke in-game communication system.
6. **A memorable shared payoff:** Coordinated experimentation produces one conspicuous event both players witness.
7. **Short iteration time:** A designer/agent can adjust the causal map and retest without modifying multiplayer infrastructure.

### Questions for playtesting

- How many spontaneous questions and descriptions do players exchange?
- Do both players propose and test hypotheses, or does one direct the other?
- Do players re-operate mechanisms for amusement after understanding them?
- Is the eventual success a discovery they own or a solution they were led to?
- Does the strange sculpture amidst credible grass, rocks and trees encourage engagement?

Do not optimize first for completion speed, puzzle hardness, retention, or content volume.

## 2. First playable: one encounter

**Players:** Exactly two active roles, A and B; one web browser per player.  
**Duration:** Aim for 5 minutes of novel play, allowing 10 minutes for unhurried experimentation.  
**View:** Simple top-down 2D, one screen per clearing. No cross-view camera or minimap.  
**Communication:** External voice call, explicitly recommended on the join screen.  
**Win condition:** Trigger one shared, non-punitive finale. No timer, health, scoring, inventory, or fail state.

### Physical arrangement

- **Western clearing (A):** A rotary wheel, a large lever, a shallow circular pool and an oddly shaped dormant beacon.
- **Eastern clearing (B):** A three-position valve, a push button and a large red sculptural tower with a visible moving element.
- The spaces should appear part of one grassy place, but be separated by terrain/visibility. Players cannot walk to the other clearing in v1.
- Contemporary abstract forms should look deliberately installed in an otherwise slightly naturalistic landscape. Use simple coloured geometry, grass, scattered rocks and a restrained palette. High-end art production is not required.
- Each control should offer local tactile or audio feedback (wheel click, lever snap, valve friction, button thunk), even if its important effect is elsewhere.
- Avoid visually encoding an explicit solution in instructional text or objective arrows.

### Initial causal map (tunable, not sacred)

| Action | Local feedback | Main remote effect |
| --- | --- | --- |
| A rotates wheel through three detents | Wheel moves and clicks | B's red tower turns between three distinct orientations |
| B rotates valve through three detents | Valve moves and gurgles | A's pool shows three distinct ripple/flow patterns |
| A toggles lever | Lever locks/unlocks with a clunk | B's tower acquires/loses a faint halo or hum |
| B presses button | Button depresses, then resets | A's beacon emits a short, striking light-and-sound pulse |

The pool and tower provide remote-readable *continuous state* rather than only transient effects. The button is a repeatable event. The lever introduces a conditional state. Avoid making controls so subtle that the other player cannot tell anything happened.

**Proposed finale for v1:** The wheel is in the tower's aligned position, the valve is in the pool's aligned position, and the lever is armed; then B presses the button. The server triggers a conspicuous finale across both clearings (for example, both structures briefly rise, light propagates across the ground and a strange harmonic sound plays). Exact detents, visual cues and sequence are provisional and should be changed if playtesting finds the answer too obvious or too arbitrary.

**Crucial design constraint:** Each side has evidence about something only the other can directly manipulate. Do not make B solely the solver who dictates commands to A. The finale must be discoverable through repeated tests and spoken exchange, not a printed recipe. If a solo player with two browser tabs can trivially brute-force the puzzle without observing either viewport, revisit the causal map.

### Player journey

1. A creates a room and sends the short join link; B joins and each gets a different role.
2. Both can move, approach objects and interact without reading an instruction sheet. A short unobtrusive hint can teach movement and interaction keys.
3. Someone touches a control; their partner witnesses an inexplicable large effect. The other asks about it.
4. The pair gradually discovers two or three cause-effect relationships through repeated trials.
5. They coordinate a combination; the landscape responds visibly and audibly in both spaces.
6. Players may reset and experiment further; completion does not immediately kick them out.

### Interaction and accessibility

- Desktop browser first. Keyboard: WASD/arrows move; E or Space interacts with the nearest control. Mouse/touch controls are a later improvement, not a v1 dependency.
- Use forgiving proximity thresholds, a clear nearby-control affordance, and short control animations.
- Prefer discrete detents and predictable toggles to twitch timing. Avoid requiring frame-perfect synchronization or low-latency coordination.
- Never rely on colour or sound alone to communicate a state; pair important states with shape, motion, intensity or other visual cues.
- Offer an audio mute toggle. Do not require both players to hear music for solvability.
- Leave voice chat to existing external tools. Do not record voice.

## 3. Product boundaries

### In scope for v1

- One pair of playable clearing scenes with simple movement.
- Exactly four interactive controls and deterministic effects.
- Two-person room creation, copyable invite URL, joining, role assignment and refresh/rejoin.
- Server-authoritative puzzle transitions and player-specific observations.
- Local animation/sound feedback and a shared finale.
- A development-only inspect/reset/replay utility.
- Automated test coverage for rules, information partitioning and a two-browser playthrough.
- A deployment that yields a stable public URL.

### Explicitly out of scope

- 3D, Unity/Godot, procedural landscapes, physics simulation, NPCs or dialogue trees.
- Accounts, matchmaking, lobby lists, spectators, inventories, achievements, scores or progression.
- Database, Redis, microservices or multi-instance scaling.
- Built-in voice/video/text chat; speech transcription or LLM-driven gameplay.
- Complex anti-cheat, cross-platform mobile polish, networked physics interpolation.
- More than one puzzle, a level editor or user-generated content.

A compelling single-room experiment is preferable to a framework with no interesting encounter.

## 4. Technical architecture

### Proposed stack

- **Language:** TypeScript end to end, strict mode.
- **Client:** Phaser 3, Vite, 2D orthographic/top-down scenes. Use primitive geometry/assets initially.
- **Server:** One Node.js HTTP service that serves the production client and hosts Socket.IO rooms.
- **Shared logic:** Pure TypeScript state machine and protocol types; no Phaser or Socket.IO imports in game rules.
- **Testing:** Vitest for rules/protocol, Playwright for two distinct browser contexts, TypeScript compiler for type checks.
- **CI/CD:** GitHub Actions checks on PRs, deployment from main to a single Railway service when configured.

Prefer a single package unless package boundaries demonstrably simplify the work. An initial tree might be:

~~~text
src/
  client/
    main.ts
    GameScene.ts
    Network.ts
    ui/
  server/
    index.ts
    rooms.ts
    protocol.ts
  shared/
    types.ts
    rules.ts
    observe.ts
    puzzles/
      first-clearing.ts
tests/
  rules.test.ts
  observation.test.ts
  multiplayer.spec.ts
docs/
  DESIGN.md
AGENTS.md
~~~

Keep all causal definitions in a typed data structure (controls, legal values, reactions, success condition). The renderer translates *observed state* into visuals; it must not contain authoritative puzzle logic.

### Authority, observation and privacy boundary

The server owns:

- Room membership, assigned A/B roles, reconnect credentials, the authoritative puzzle state, monotonic state revision, finale state and action validation.
- The mapping from control actions to changes and the checks for finale success.

Clients own:

- Presentation, local audio and animations, the current player's UI, and responsive movement/interaction inputs.
- Only a *player-specific projection* of shared game state.

Use pure functions conceptually equivalent to:

~~~ts
applyAction(state: GameState, role: Role, action: Action): GameState
observe(state: GameState, role: Role): Observation
~~~

Make room routing, input validation, state transitions and observations independently testable. Define observation as an explicit allowlist, not “send full state and hide the other side visually.” A's normal client should never receive B's internal control values or puzzle-solution flags; B should not receive A's. Each may receive the *effects* visible locally, including remote-driven changes. After the finale, a shared public completed-state flag is fine.

For prototype simplicity, movement may be simulated locally, while interactions are sent to the server. The server must still check role, target and allowed action/value. If location is authoritative, send movement intents and derive proximity server-side; otherwise state clearly that proximity is a gameplay affordance, not a security guarantee. Do not turn avatar movement into the main engineering challenge.

### Suggested wire protocol

Client to server:

~~~text
room:create
room:join { roomCode, reconnectToken? }
control:act { requestId, controlId, action, value? }
room:reset
~~~

Server to client:

~~~text
room:ready { roomCode, role, reconnectToken }
room:status { connectedPlayers, waitingForPartner }
world:observation { revision, playerLocalState }
world:effect { eventId, kind, parameters }
room:error { code, message }
~~~

These are illustrative message shapes, not a frozen public API. Prefer discriminated unions with runtime validation at the network boundary (Zod or a small explicit parser; add a dependency only if it pays for itself). Keep controls bounded to enums/ranges; reject malformed, wrong-role or impossible operations. Suppress duplicate request IDs and ensure repeat/replay messages do not accidentally double-fire effects.

**Room lifecycle:** Generate cryptographically unpredictable short room codes. One A slot and one B slot. A valid reconnect token can reclaim a role on refresh. Unclaimed/disconnected slots expire after a reasonable period. A room expires entirely after inactivity. No account or persistent storage in v1. A server restart may reset open rooms; state this in the UI if it matters. Rate-limit room creation and interactions at a basic level to prevent accidental or trivial abuse of the public service.

**Deployment:** One process and in-memory room state are intentional. Do not enable autoscaling or multiple independent replicas without introducing shared state or sticky session semantics. Serve client assets and Socket.IO on the same origin to avoid avoidable CORS complexity. The server must bind to the host-provided PORT and provide a health endpoint. Keep deployment credentials out of the repository.

### Sound and audiovisual work

Use a tiny palette of recognizably different cues: click, creak, low pulse, rising harmonic, distant thump. Basic generated or properly licensed sounds are fine. Remote actions should have the biggest spectacle; local actions still need confirmation. Important changes should remain visually legible when muted.

## 5. Debugging and automated verification

### Development-only experiment panel

Provide an explicitly development-gated inspection mode that can:

- Display server-authoritative state and both player observation projections side by side.
- Trigger any valid control action for testing, reset a room and force finale.
- Capture/replay a deterministic action trace (sequence of typed actions with relative timestamps).
- Show room ID, role, revision and socket connection status.

**Never expose hidden global state through normal production observation messages or an unauthenticated production debug endpoint.** The panel may use local dev infrastructure or a tightly gated nonproduction-only endpoint. Build-time gating alone is not a reason to ship server secrets to every browser.

### Required tests

- Pure transition tests for each control, legal detents, toggle behavior, success condition, reset and event idempotency.
- Observation tests: changing B's private valve value changes A's *pool projection*, but does not leak the raw B control field; equivalent tests in reverse. No victory flags before actual completion.
- Room tests: both roles assigned once, third player refused, rooms isolated, invalid controls rejected, reconnect restores correct role and observation, expired tokens/rooms handled.
- Browser integration: launch two independent contexts; one creates room, the other joins; perform A and B interactions; assert only intended effects appear on each side; trigger finale and verify both see it.
- CI must execute format/lint, typecheck, unit tests, build and, if available, a headless two-player smoke test. Do not silently skip failing tests.

Use fixed seeds if visual or rule randomness is later introduced. Keep core puzzles deterministic by default.

## 6. Research instrumentation and playtest protocol

Testing software correctness is not testing whether the social mechanic works. Run genuine two-person sessions, preferably with participants unfamiliar with the puzzle.

**Baseline protocol:** Send participants the link and ask them to call one another. Give no verbal explanation beyond controls. Observe or, with informed consent, review a recorded session. Do not record speech automatically.

Record qualitatively:

- First control touched and first spontaneous “what happened?” question.
- Examples of surprise, laughter, confusion, repeated experimentation and unprompted help.
- Which participant first hypothesizes each causal relationship.
- Whether one player becomes a passive executor.
- Where the game stops being interesting, regardless of completion.

Optional developer-exported room event traces may include relative timestamps, role, action type, observation/effect type and completion state. No names, accounts, IP logging as a product feature, or conversation content. Event logs alone cannot determine whether a player felt curiosity or delight.

**Useful success threshold:** In at least a few fresh paired sessions, both players independently discover or test an idea, they describe unseen effects to one another without prompting, and they can achieve the finale without outside hints. If it is mechanically solvable but socially flat, redesign the causal map before adding content.

## 7. Implementation sequence

### Milestone 1: Local toy

- Bootable Phaser/Vite/TypeScript application with both clearing configurations available in single-player developer preview.
- Controllable avatar, four interactable mechanisms, local feedback and first pass visual effects.
- Shared typed puzzle model and pure transition tests.
- **Acceptance:** An agent can run the application locally and operate every control; another agent can change one causal relationship via puzzle data with no rendering rewrite.

### Milestone 2: Two browsers

- Node/Socket.IO room service, create/join/invite flow, role-specific scenes and observations.
- Reconnect, reasonable invalid-action handling, reset, stable update ordering.
- Automated two-browser smoke test and a deployment pathway.
- **Acceptance:** Two people on different computers can join a single URL, communicate externally, and see the intended remote effects without receiving the other side's hidden state.

### Milestone 3: Complete encounter and playtest

- Refine timing, sounds and signals; create finale and conclusion/replay.
- Add dev inspection/action replay; run fresh-pair sessions and collect observations.
- **Acceptance:** One full playthrough is possible with no facilitator, and the playtest produces actionable evidence about the social interaction.

### Follow-on controlled experiment (not v1)

Preserve the same puzzle/causal rules while varying visual presentation:

1. Naturalistic interventions: stones, channels and vegetation appear to cause effects.
2. Garden-folly installation: contemporary abstract structures against a credible natural landscape (default v1 aesthetic).
3. Unified abstract world: scenery and interactive objects share the same graphic language.

Compare discovery, approach behaviour and willingness to experiment. Implement skins/scenes only after the core multiplayer experience works. Do not pretend these variations are scientifically controlled unless confounds such as readability, camera and affordances are addressed.

## 8. Decisions, tradeoffs and change control

- **Two players, not a generic multiplayer platform:** Tests the intended relationship with minimal hosting complexity.
- **2D, not 3D:** Assesses causal communication while keeping implementation and navigation trivial.
- **Authoritative server for puzzle rules, local rendering for responsiveness:** Avoids desynchronizing cause and effect; does not require networked physics.
- **One in-memory Node process:** Disposable play sessions remove the need for database infrastructure.
- **External voice call:** Voice quality and social availability are critical, but building voice transport is irrelevant to the hypothesis.
- **The initial causal map is provisional:** Tune it based on observed conversations. Preserve testability rather than its exact aesthetic implementation.

Changes that add infrastructure should identify a specific player-facing problem they solve. When scope competes with polish, improve remote feedback, reaction timing and opportunities for reciprocal explanation before adding more mechanics.

The guiding question for each feature is: **What will one player now have a reason to say to the other?**
