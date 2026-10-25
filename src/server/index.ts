import { createGameServer } from "./app";

const port = Number(process.env.PORT ?? "3000");
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be a valid TCP port");
}

// Rooms live in this process's memory: run exactly one instance.
const { httpServer } = createGameServer();
httpServer.listen(port, "0.0.0.0", () => {
  console.info("Game server listening", { port });
});
