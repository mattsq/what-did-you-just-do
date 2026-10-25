# What Did You Just Do?

A tiny cooperative browser-game experiment about **distributed cause and effect**. Two players operate strange outdoor installations. Their actions mostly change the *other* player's environment, creating reasons to ask questions, report surprises, and form hypotheses together.

See [the design specification](docs/DESIGN.md) and [agent instructions](AGENTS.md). This project explores multiplayer communication and outdoor follies as part of *Big Walk* research; it is not affiliated with that game.

## Current status

**Milestone 3 (in progress): complete encounter.** Two people on separate browsers share a room by link, each sees only their own clearing, and the server owns all puzzle state. The finale, reset and a development-only inspector with trace replay are implemented; paired playtests are still to be run and recorded in [docs/PLAYTESTS.md](docs/PLAYTESTS.md). Progress is tracked in [implementation issues](https://github.com/mattsq/what-did-you-just-do/issues).

### Playing with a partner

1. Start a voice call with your partner (any external call works; the game has no chat).
2. Open the game and press **Create a room**. You arrive in the western clearing (A).
3. Send your partner the invite link (**Copy** button). Opening it puts them in the eastern clearing (B).
4. **Move:** WASD or arrow keys. **Use the nearest control:** E or Space. **Mute:** M or the "Sound on" button. **Reset** restores the starting positions for both players.

Refreshing the page keeps your clearing and the current state of the puzzle. The reconnect token is kept in the tab's `sessionStorage`, so a second tab in the same browser counts as a different person; a third person opening the link is told the room is full.

Quick two-person check: A turns the wheel and pulls the lever; B should see the red tower turn and glow and ask what happened. B turns the valve and presses the button; A should see the pool's ripples change and the beacon flash. With the tower aligned and glowing and the pool still, B's button press starts the finale in both clearings.

### Single-browser preview

Open **`/?preview`** to try both clearings in one page without a partner. The puzzle rules run in the page; the buttons above the game switch between the western clearing (A) and the eastern clearing (B), and the game state is kept when switching. In development (`npm run dev`) a panel under the game shows both players' observations, so a control's effect on the other clearing is visible without switching. The beacon flash is a momentary effect in A's clearing, so the preview cannot show it while B's clearing is open.

### Development inspector

Under `npm run dev`, add `?inspect` to the page address (for example **http://localhost:5173/?inspect**, or `&inspect` after a room link) to open the room inspector below the game. It connects to a separate server namespace and shows, for the current room:

- the authoritative state, both players' observations side by side, the revision and whether each seat is connected;
- a button for every control action of **either** role (the seat need not be occupied), **Reset room** and **Force finale**;
- the room's action trace: every successful action, reset and forced finale, with milliseconds since the room started. Copy it, edit or paste a trace, and **Replay trace** resets the room and applies it at once; both players receive the resulting state and effects.

Replaying ignores the timestamps and is deterministic: the same trace always gives the same state (`replayTrace` in `src/shared/trace.ts`). A trace holds roles and actions only, never names, tokens or addresses, and stops recording after 1000 entries.

The inspector has no authentication. Only the development server serves it (`npm run dev` passes `--inspector`); the production build refuses that flag and its client bundle does not contain the inspector. The development server listens on all interfaces, so anyone on your network who can reach port 3000 can inspect a room whose code they know.

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

`npm run check` runs typechecking, Vitest and the production build. Vitest covers the puzzle rules, the per-role observations, message validation, the room lifecycle (seating, a refused third player, isolation, reconnection, seat and room expiry, duplicate requests) a socket-level test against a real server, deterministic trace replay and the inspector (absent unless enabled, then acting as either role). The Playwright tests check that Phaser renders and Socket.IO connects, drive the single-browser preview and the development inspector, and run a full two-player game in **two independent browser contexts**: create and join by link, remote effects in both directions, refresh to reclaim a role, a refused third browser, the finale on both sides and reset. That test also records every WebSocket frame each browser receives and checks that neither ever names the other side's controls or fixtures. GitHub Actions runs the checks on each push and PR.

Dependencies are pinned by the committed `package-lock.json`; use `npm ci` for a clean, reproducible install (CI does this on Node.js 24). Vite's production build warns that the client chunk exceeds 500 kB; that is Phaser itself and is expected.

## Hosting

The repository is prepared for one **Railway service** deployed from GitHub; no deployment exists yet. The service is described with Railway's Infrastructure as Code in [`.railway/railway.ts`](.railway/railway.ts) (Railway is retiring `railway.json`/`railway.toml` Config as Code, so there is none):

- **Source:** this repository's `main` branch.
- **Build command:** `npm run build`. Railpack installs dependencies first. `RAILPACK_NODE_VERSION=24` pins the Node version CI uses, because Railpack reads `engines.node` before `.nvmrc`.
- **Start command:** `node dist/server/index.js`, which is what `npm start` runs, without npm and a shell in between: they do not pass Railway's SIGTERM on, and the server uses it to close its sockets before a redeploy replaces it.
- **Health check:** `/health`, with a 60-second timeout.
- **Replicas:** 1. Rooms are in process memory; a second replica would not see the first one's rooms.
- **Port:** the server binds to the `PORT` Railway provides, on all interfaces. The client and Socket.IO share that origin, so there is no CORS setup.

`tests/railway.test.ts` fails if the file stops describing exactly this.

### Deploying (needs a Railway account)

1. Install the Railway CLI (version 5.42.1 or newer; the `railway` npm dev dependency only supplies the definition types), then `railway login`.
2. Create or pick an empty project and link it: `railway link`. Connect GitHub to Railway so it can read this repository.
3. Preview, then apply: `railway config plan`, then `railway config apply`. Check the plan: on a project that already has other resources, apply can remove anything the file does not declare.
4. In the service's **Networking** settings, generate a public Railway domain. Generated domains are not part of `.railway/railway.ts`.
5. After the first deployment, check the build log shows Node 24 and that the health check passed.
6. From your own machine, run the smoke test against the public address:

   ```sh
   npm run smoke -- https://<service>.up.railway.app
   ```

   It checks `/health`, that the page and sockets share the origin and that the inspector is not served, then plays the protocol with socket clients: create and join, a remote effect each way, a reconnect that keeps role B, a refused third player, the finale for both players and reset. It also checks that neither player receives the other side's control or fixture names. It creates one room, which expires after 30 minutes of inactivity.
7. For the human check, open the address in two different browsers or devices, create a room, join with the invite link, use each control, refresh one page to confirm it returns to the same clearing, and play to the finale.
8. Write the public URL in this README.

`E2E_BASE_URL=https://<address> npm run test:e2e` also runs the browser boot test (Phaser renders, the socket connects) against a deployment; the other browser tests need the development server's panels. CI runs both the smoke test and this boot test against `npm start` for every pull request and every push to `main`.

Operating limits of the room server:

- Rooms exist only in memory: a restart or redeploy ends every open room, and players see "That room no longer exists" and can create a new one. Avoid pushing to `main` while people are playing.
- A disconnected player's seat is held for 10 minutes for their reconnect token; after that a new person may take it. A room with nobody connected is deleted after 30 minutes without activity. At most 1000 rooms exist at once.
- Each connection may send about 10 messages per second (bursts of 30) and create a room about every 20 seconds (bursts of 3).
- Avatar movement is simulated in the browser. The server checks that each action names a real control owned by the sender's role, but not that the avatar is standing next to it: proximity is a gameplay affordance, not a security boundary.
- The server logs nothing about rooms, players or tokens.

## Implementation milestones

1. **Local toy:** Two clearing previews, movement, controls, and typed deterministic state transitions.
2. **Real multiplayer:** Two player slots, invitation link, reconnection, role-specific observations, and two-browser verification.
3. **Social puzzle:** Tune remote reactions, create a shared finale, add dev-only inspection and playtest against actual conversations.

Do not introduce 3D, user accounts, databases, built-in voice, or an extensible game engine prematurely. Prioritize the social interaction and the ability to iterate on the causal map without changing networking code.
