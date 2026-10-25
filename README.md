# What Did You Just Do?

A tiny cooperative browser-game experiment about **distributed cause and effect**. Two players operate strange outdoor installations. Their actions mostly change the *other* player's environment, creating reasons to ask questions, report surprises, and form hypotheses together.

See [the design specification](docs/DESIGN.md) and [agent instructions](AGENTS.md). This project explores multiplayer communication and outdoor follies as part of *Big Walk* research; it is not affiliated with that game.

## Current status

**Infrastructure scaffold, not a playable puzzle yet.** The current scene is placeholder artwork; the server supports Socket.IO connectivity but has no room membership, controls, or puzzle transitions. Progress is tracked in [implementation issues](https://github.com/mattsq/what-did-you-just-do/issues).

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

Open **http://localhost:5173**. Vite serves the client and proxies Socket.IO to the Node server on port **3000**. The page should show a placeholder Phaser scene and a “Server connected” status.

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

`npm run check` runs typechecking, Vitest and the production build. The first Playwright test checks that Phaser renders and Socket.IO connects; it does **not** prove any multiplayer gameplay. GitHub Actions runs the checks on each push and PR.

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
