import { createGameServer } from "./app";

const port = Number(process.env.PORT ?? "3000");
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be a valid TCP port");
}

// The inspector reveals complete room state without authentication, so it is
// opt-in (`npm run dev` passes the flag) and refused in production. The
// production build fixes NODE_ENV to "production", so `npm start` never serves it.
const inspector = process.argv.includes("--inspector");
if (inspector && process.env.NODE_ENV === "production") {
  throw new Error("The development inspector cannot run with NODE_ENV=production");
}

// Rooms live in this process's memory: run exactly one instance.
const { httpServer } = createGameServer({ inspector });
httpServer.listen(port, "0.0.0.0", () => {
  console.info("Game server listening", { port, inspector });
});
