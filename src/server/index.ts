import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { join } from "node:path";
import express from "express";
import { Server } from "socket.io";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

// Transport bootstrap only; room membership and puzzle actions are separate
// implementation work described in docs/DESIGN.md.
io.on("connection", () => {});

app.get("/health", (_request, response) => {
  response.json({ status: "ok" });
});

const clientDir = join(process.cwd(), "dist", "client");
if (existsSync(join(clientDir, "index.html"))) {
  app.use(express.static(clientDir));
  app.use((request, response, next) => {
    if (request.method !== "GET" || !request.accepts("html")) {
      next();
      return;
    }
    response.sendFile(join(clientDir, "index.html"));
  });
}

const port = Number(process.env.PORT ?? "3000");
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be a valid TCP port");
}
httpServer.listen(port, "0.0.0.0", () => {
  console.info("Game server listening", { port });
});
