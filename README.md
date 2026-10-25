# What Did You Just Do?

A tiny cooperative browser-game experiment about **distributed cause and effect**. Two players operate strange outdoor installations. Their actions mostly change the *other* player's environment, creating reasons to ask questions, report surprises, and form hypotheses together.

See [the design specification](docs/DESIGN.md) and [agent instructions](AGENTS.md). This project explores multiplayer communication and outdoor follies as part of *Big Walk* research; it is not affiliated with that game.

## Current status

**Milestone 2: two-player rooms.** Two people on separate browsers share a room by link, each sees only their own clearing, and the server owns all puzzle state. Progress is tracked in [implementation issues](https://github.com/mattsq/what-did-you-just-do/issues).

### Playing with a partner

1. Start a voice call with your partner (any external call works; the game has no chat).
2. Open the game and press **Create a room**. You arrive in the western clearing (A).
3. Send your partner the invite link (**Copy** button). Opening it puts them in the eastern clearing (B).
4. **Move:** WASD or arrow keys. **Use the nearest control:** E or Space. **Mute:** M or the "Sound on" button. **Reset** restores the starting positions for both players.

Refreshing the page keeps your clearing and the current state of the puzzle. The reconnect token is kept in the tab's `sessionStorage`, so a second tab in the same browser counts as a different person; a third person opening the link is told the room is full.

Quick two-person check: A turns the wheel and pulls the lever; B should see the red tower turn and glow and ask what happened. B turns the valve and presses the button; A should see the pool's ripples change and the beacon flash. With the tower aligned and glowing and the pool still, B's button press starts the finale in both clearings.

### Single-browser preview

Open **`/?preview`** to try both clearings in one page without a partner. The puzzle rules run in the page; the buttons above the game switch between the western clearing (A) and the eastern clearing (B), and the game state is kept when switching. In development (`npm run dev`) a panel under the game shows both players' observations, so a control's effect on the other clearing is visible without switching. The beacon flash is a momentary effect in A's clearing, so the preview cannot show it while B's clearing is open.

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

Open **http://localhost:5173**. Vite serves the client and proxies Socket.IO to the Node server on port **3000**. The page should show a “Server connected” status and a **Create a room** button. To play both sides yourself, open the invite link in a second browser or a private window (another tab of the same browser also works). In development, a panel under the game shows the room code, your role and the observation your browser received from the server; it never shows the other player's state.

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

`npm run check` runs typechecking, Vitest and the production build. Vitest covers the puzzle rules, the per-role observations, message validation, the room lifecycle (seating, a refused third player, isolation, reconnection, seat and room expiry, duplicate requests) and a socket-level test against a real server. The Playwright tests check that Phaser renders and Socket.IO connects, drive the single-browser preview, and run a full two-player game in **two independent browser contexts**: create and join by link, remote effects in both directions, refresh to reclaim a role, a refused third browser, the finale on both sides and reset. That test also records every WebSocket frame each browser receives and checks that neither ever names the other side's controls or fixtures. GitHub Actions runs the checks on each push and PR.

Dependencies are pinned by the committed `package-lock.json`; use `npm ci` for a clean, reproducible install (CI does this on Node.js 24). Vite's production build warns that the client chunk exceeds 500 kB; that is Phaser itself and is expected.

## Hosting

Target one **Railway service** with GitHub deployment, built as a Node application:

- **Build command:** `npm run build` (install dependencies as part of the service's build process).
- **Start command:** `npm start`.
- **Health check path:** `/health`.
- **Replicas:** 1 (rooms are in process memory; a second replica would not see the first one's rooms).
- **Port:** use the Railway-provided `PORT`; do not hardcode a published port.

Operating limits of the room server:

- Rooms exist only in memory: a restart or redeploy ends every open room, and players see "That room no longer exists" and can create a new one.
- A disconnected player's seat is held for 10 minutes for their reconnect token; after that a new person may take it. A room with nobody connected is deleted after 30 minutes without activity. At most 1000 rooms exist at once.
- Each connection may send about 10 messages per second (bursts of 30) and create a room about every 20 seconds (bursts of 3).
- Avatar movement is simulated in the browser. The server checks that each action names a real control owned by the sender's role, but not that the avatar is standing next to it: proximity is a gameplay affordance, not a security boundary.
- The server logs nothing about rooms, players or tokens.

Configure these in Railway service settings or its supported Infrastructure as Code workflow when connected. Do not create a `railway.json` for a new service: Railway has deprecated that mechanism for new projects. No deployment is provisioned by the repository itself.

## Implementation milestones

1. **Local toy:** Two clearing previews, movement, controls, and typed deterministic state transitions.
2. **Real multiplayer:** Two player slots, invitation link, reconnection, role-specific observations, and two-browser verification.
3. **Social puzzle:** Tune remote reactions, create a shared finale, add dev-only inspection and playtest against actual conversations.

Do not introduce 3D, user accounts, databases, built-in voice, or an extensible game engine prematurely. Prioritize the social interaction and the ability to iterate on the causal map without changing networking code.
