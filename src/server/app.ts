import { createServer, type Server as HttpServer } from "node:http";
import { existsSync } from "node:fs";
import { join } from "node:path";
import express from "express";
import { Server } from "socket.io";
import { parseClientMessage, type ClientMessage } from "../shared/protocol";
import { attachInspector } from "./inspector";
import { RoomManager, type Delivery, type RoomManagerOptions } from "./rooms";

export interface GameServerOptions extends RoomManagerOptions {
  /** Directory of the built client; served when it contains index.html. */
  readonly clientDir?: string;
  readonly sweepIntervalMs?: number;
  /**
   * Development only: serve the unauthenticated inspector namespace, which
   * reveals complete room state. Never enable it for a public server.
   */
  readonly inspector?: boolean;
}

export interface GameServer {
  readonly httpServer: HttpServer;
  readonly rooms: RoomManager;
  close(): Promise<void>;
}

/** Messages per connection: a burst allowance refilled at a steady rate. */
const MESSAGE_BURST = 30;
const MESSAGES_PER_SECOND = 10;
/** Room creations per connection: a few retries, not a room factory. */
const CREATE_BURST = 3;
const CREATES_PER_SECOND = 1 / 20;

class TokenBucket {
  private tokens: number;
  private last: number;

  constructor(private readonly capacity: number, private readonly perSecond: number, private readonly now: () => number) {
    this.tokens = capacity;
    this.last = now();
  }

  take(): boolean {
    const now = this.now();
    this.tokens = Math.min(this.capacity, this.tokens + ((now - this.last) / 1000) * this.perSecond);
    this.last = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

/** One process: the static client, `/health` and Socket.IO rooms on one origin. */
export function createGameServer(options: GameServerOptions = {}): GameServer {
  const now = options.now ?? Date.now;
  const rooms = new RoomManager(options);
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, { maxHttpBufferSize: 4096, serveClient: false });

  const deliver = (deliveries: readonly Delivery[]) => {
    for (const { connectionId, message } of deliveries) io.to(connectionId).emit(message.type, message);
  };

  const handle = (connectionId: string, message: ClientMessage): Delivery[] => {
    switch (message.type) {
      case "room:create":
        return rooms.create(connectionId);
      case "room:join":
        return rooms.join(connectionId, message.roomCode, message.reconnectToken);
      case "control:act":
        return rooms.act(connectionId, message.requestId, message.action);
      case "room:reset":
        return rooms.reset(connectionId);
    }
  };

  const refreshInspectors = options.inspector ? attachInspector(io, rooms, deliver) : null;
  /** Runs a room operation for a player, then refreshes inspectors of the rooms it touched. */
  const forPlayer = (connectionId: string, operation: () => Delivery[]) => {
    const before = rooms.roomOf(connectionId);
    deliver(operation());
    if (!refreshInspectors) return;
    const after = rooms.roomOf(connectionId);
    if (before) refreshInspectors(before);
    if (after && after !== before) refreshInspectors(after);
  };

  io.on("connection", (socket) => {
    const messages = new TokenBucket(MESSAGE_BURST, MESSAGES_PER_SECOND, now);
    const creations = new TokenBucket(CREATE_BURST, CREATES_PER_SECOND, now);
    const reply = (code: "rate-limited" | "invalid-message") =>
      socket.emit("room:error", { type: "room:error", code });

    socket.onAny((event: unknown, payload: unknown) => {
      if (!messages.take()) return reply("rate-limited");
      const message = parseClientMessage(event, payload);
      if (!message) return reply("invalid-message");
      if (message.type === "room:create" && !creations.take()) return reply("rate-limited");
      forPlayer(socket.id, () => handle(socket.id, message));
    });
    socket.on("disconnect", () => forPlayer(socket.id, () => rooms.leave(socket.id)));
  });

  const sweep = setInterval(() => deliver(rooms.sweep()), options.sweepIntervalMs ?? 60_000);
  sweep.unref();

  app.get("/health", (_request, response) => {
    response.json({ status: "ok" });
  });

  const clientDir = options.clientDir ?? join(process.cwd(), "dist", "client");
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

  return {
    httpServer,
    rooms,
    close: async () => {
      clearInterval(sweep);
      await io.close();
    },
  };
}
