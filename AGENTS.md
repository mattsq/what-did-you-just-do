# AGENTS.md — Instructions for coding agents

These instructions apply to the whole repository. Read [docs/DESIGN.md](docs/DESIGN.md) before implementing features or proposing architecture changes.

## Mission

Build **What Did You Just Do?** as a tiny, playable, two-person browser experiment about distributed causes and effects. The deliverable is an interesting social encounter, not a reusable multiplayer engine. Optimize for fast, safe changes to game mechanics and feedback.

The first complete experience is two separate top-down clearings, four controls, asymmetric observations and a coordinated visual/audio finale. Use external voice chat. Keep the experience playable in approximately 5–10 minutes.

## Product invariants

1. Two active roles, A and B. Both must have agency and meaningful information to share.
2. Action consequences should be legible, interesting and mostly more visible to the *other* player.
3. No normal client receives the full authoritative game state or another player's private control state. The server sends role-specific observations; render from those observations.
4. The server owns room membership, puzzle transitions and finale conditions. Never trust clients to declare completion.
5. Core puzzle transitions must be deterministic, pure and independently testable.
6. No mandatory timed precision, puzzle failure, score, account, database or in-game chat in v1.
7. Debug omniscience must be confined to development; never open it to ordinary production clients.
8. Prefer a working two-player toy over extensible architecture, additional levels or polished assets.

## Intended stack

Use strict TypeScript, Phaser 3 and Vite on the client; Node.js + Socket.IO as a single room server; Vitest for unit tests; Playwright for a two-browser integration test; GitHub Actions for CI. Serve the production client and sockets from the same process/origin. Deployment target is one Railway service. Follow the design document if a detail is unspecified; record and justify deviations before making a substantial architecture change.

Do not add React, a database, Redis, microservices, ECS frameworks, heavyweight game tooling, built-in voice services, telemetry SaaS or multiple package layers by default. Add dependencies when there is a concrete measurable simplification.

## Module boundaries

- `src/shared/`: framework-free domain types, puzzles, deterministic transitions and per-role observation projections. It must not import browser APIs, Phaser or Socket.IO.
- `src/server/`: room lifecycle, identity/rejoin, input validation, sequencing, rate limits and network transport. It is the sole source of authoritative state.
- `src/client/`: input, rendering, camera, sound and UI. Never derive private information from hidden fields; only consume the permitted observation.
- `tests/`: transition, privacy/observation, lifecycle and two-client tests.

Keep the causal map data-driven so changing a wheel's remote effect is localized to a puzzle definition and (when needed) its view binding. Avoid putting puzzle rules in animation callbacks or networking event handlers.

## Architecture and protocol rules

- Prefer small explicit discriminated unions and typed actions. Validate all messages arriving from the network. Check action target, role, legal values and duplicates before applying an action.
- Maintain monotonically increasing revisions for room snapshots. Give ephemeral effects stable event IDs, so reconnect/retransmission cannot spuriously repeat a finale.
- Reconnect tokens must preserve player roles and not be predictable. Reject a third active participant; isolate rooms; expire idle rooms.
- A player can observe reactions occurring in their clearing without being told the hidden originating action. **Do not implement asymmetry by sending full state to both browsers and merely hiding components in the UI.**
- Do not invent anti-cheat or authoritative physics complexity. Avatar movement can be client-side for v1; if so, document any limits of proximity validation.
- Prefer discrete control positions over continuous physics and twitch mechanics.
- Provide a deterministic reset for tests and human repeat play.
- Do not log voice, personal details or invite/reconnect tokens. Do not commit credentials or hard-coded deployment secrets.
- A debug panel may inspect complete state only against a development server or explicitly secured nonproduction endpoint.

## Work process

1. Inspect current files before editing. Treat the repository as the source of truth, not assumptions from older conversations.
2. Identify the smallest vertical slice that can be implemented and tested end to end. Do not scaffold an unused framework.
3. Before a nontrivial change, state what player-facing behaviour it enables and its acceptance criterion.
4. Write or adjust transition and observation tests alongside rule changes. Run existing checks before reporting completion.
5. For network changes, verify **two independent browser contexts**, not merely two components on one page.
6. Keep commits/PRs focused. Give change descriptions and test evidence; disclose tests not run and why.
7. When changing mechanics, document the expected conversational effect and a quick manual playtest scenario.
8. Update design docs if core assumptions, protocol semantics or milestone acceptance criteria change.
9. Do not remove tests, relax typing, disable lint or introduce arbitrary waits to get CI green.
10. If asked to implement a large feature, deliver a small runnable slice first, then iterate.

## Definition of done for functional features

- Builds and runs locally using documented commands.
- Strict TypeScript/typecheck, unit tests and production build pass.
- Relevant transition and observation tests demonstrate intended behaviour and absence of unintended information leaks.
- If networking changed, two-browser flow passes: join, interaction, remote effect and role separation; reconnect if affected.
- No new console errors, secrets, private-state leaks or unauthenticated production debug features.
- README or docs explain new setup steps/environment variables and any deployment caveats.
- Change is visible to a human tester and tied to a real design objective.

## Playtest quality rubric

Do not assume that mechanically correct means fun. When proposing revisions, consider:

- Does each player have a reason to ask the other a question?
- Can either player discover something without waiting for instructions?
- Are local feedback and remote consequences distinctive enough to describe?
- Is the game comprehensible without explicit solution text?
- Is experimentation enjoyable even before the player knows the goal?

If a proposed feature makes the game more elaborate but does not help these questions, defer it.

## Initial implementation order

1. Typed domain state + simple game scene + interactive controls.
2. Rooms, observations, two browser clients and reconnection.
3. Finale, sound/visual tuning, debug trace/replay and real two-person playtesting.

**Avoid premature polish.** Prefer circles, rectangles, basic procedural textures and simple authored audio over searching for elaborate assets. The important outcome is a repeated loop of changing a mechanic, verifying it, and playing it together.

## Collaboration expectations

Use small PRs where practical for agent work, summarize files changed and checks run, and preserve the ability to reproduce the tested scenario. Ask for clarification only when a choice materially changes the game's intent or could cause destructive changes; otherwise make the smallest reversible implementation choice and document it.
