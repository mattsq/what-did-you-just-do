# What Did You Just Do?

A tiny cooperative browser-game experiment about **distributed cause and effect**. Two players operate strange outdoor installations. Their actions mostly change the *other* player's environment, creating reasons to ask questions, report surprises, and form hypotheses together.

See [the design specification](docs/DESIGN.md) and [agent instructions](AGENTS.md). This project explores multiplayer communication and outdoor follies as part of *Big Walk* research; it is not affiliated with that game.

## Current status

**Milestone 1: single-browser local preview.** Both clearings, all four controls, the causal map and the finale run in one browser so the toy can be tried and tuned. The puzzle rules run in the page for now; two-player rooms and server-authoritative state are Milestone 2. Progress is tracked in [implementation issues](https://github.com/mattsq/what-did-you-just-do/issues).

### Playing the preview

- **Move:** WASD or arrow keys. **Use the nearest control:** E or Space. **Mute:** M or the "Sound on" button.
- The buttons above the game switch between the western clearing (A: wheel, lever, pool, beacon) and the eastern clearing (B: valve, button, red tower). The game state is kept when switching. **Reset** restores the starting positions.
- In development (`npm run dev`) a panel under the game shows both players' observations, so a control's effect on the other clearing is visible without switching.

Quick manual check: as A, turn the wheel and pull the lever, then switch to B and see that the tower has turned and glows. As B, turn the valve and press the button, then switch to A: the pool pattern has changed. The button's beacon flash is a momentary effect in A's clearing, so the single-browser preview cannot show it while B's clearing is open; with two players (Milestone 2) A will see it. The finale is shown in whichever clearing is open.

### Changing the causal map

The causes and effects are data in [`src/shared/puzzles/first-clearing.ts`](src/shared/puzzles/first-clearing.ts): which control drives which fixture, how each detent maps to a visible pattern or orientation, and the finale condition. Change that file and the matching expectations in `tests/rules.test.ts` and `tests/observation.test.ts`; rules (`src/shared/rules.ts`) and observations (`src/shared/observe.ts`) need no edits. Positions and drawings of objects are in `src/client/layout.ts` and `src/client/views.ts`.

## Prerequisites

- Node.js 24 recommended (see `.nvmrc`; Node 22.12+ should also work).
- npm. No database, API credentials or accounts required.
- Two independent browsers or computers when testing actual multiplayer.
- An ordinary external voice call for real player sessions.

## Development

```sh
npm ci
npm run dev
```

Open **http://localhost:5173**. Vite serves the client and proxies Socket.IO to the Node server on port **3000**. The page should show the western clearing and a “Server connected” status.

To test the production bundle:

```sh
npm run build
npm start
```

Then open **http://localhost:3000**. The production server serves the built game and sockets from the same origin. `PORT` overrides the server port, but the local Vite proxy remains set to 3000 unless updated.

## Verification

```sh
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

`npm run check` runs typechecking, Vitest and the production build. The Playwright tests check that Phaser renders and Socket.IO connects, and drive the local preview with the keyboard (walk to a control, use it, see the other clearing's observation change). They do **not** prove any multiplayer gameplay yet. GitHub Actions runs the checks on each push and PR.

Dependencies are pinned by the committed `package-lock.json`; use `npm ci` for a clean, reproducible install (CI does this on Node.js 24). Vite's production build warns that the client chunk exceeds 500 kB; that is Phaser itself and is expected.

## Hosting

Target one **Railway service** with GitHub deployment, built as a Node application:

- **Build command:** `npm run build` (install dependencies as part of the service's build process).
- **Start command:** `npm start`.
- **Health check path:** `/health`.
- **Replicas:** 1 (rooms are in process memory).
- **Port:** use the Railway-provided `PORT`; do not hardcode a published port.

Configure these in Railway service settings or its supported Infrastructure as Code workflow when connected. Do not create a `railway.json` for a new service: Railway has deprecated that mechanism for new projects. No deployment is provisioned by the repository itself.

## Implementation milestones

1. **Local toy:** Two clearing previews, movement, controls, and typed deterministic state transitions.
2. **Real multiplayer:** Two player slots, invitation link, reconnection, role-specific observations, and two-browser verification.
3. **Social puzzle:** Tune remote reactions, create a shared finale, add dev-only inspection and playtest against actual conversations.

Do not introduce 3D, user accounts, databases, built-in voice, or an extensible game engine prematurely. Prioritize the social interaction and the ability to iterate on the causal map without changing networking code.
