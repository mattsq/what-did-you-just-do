import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { io as connect, type Socket } from "socket.io-client";
import type { ServerMessage } from "../src/shared/protocol";
import { createGameServer, type GameServer } from "../src/server/app";

type Message<T extends ServerMessage["type"]> = Extract<ServerMessage, { type: T }>;

let server: GameServer;
let url: string;
const sockets: Socket[] = [];

beforeEach(async () => {
  server = createGameServer({ clientDir: "/nonexistent" });
  await new Promise<void>((resolve) => server.httpServer.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(server.httpServer.address() as AddressInfo).port}`;
});

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.disconnect();
  await server.close();
});

/** A client that records every server message it receives. */
function client() {
  const socket = connect(url, { transports: ["websocket"], forceNew: true });
  sockets.push(socket);
  const received: ServerMessage[] = [];
  socket.onAny((_event, message: ServerMessage) => received.push(message));
  const next = <T extends ServerMessage["type"]>(type: T, predicate: (m: Message<T>) => boolean = () => true) =>
    new Promise<Message<T>>((resolve) => {
      const check = (message: Message<T>) => {
        if (!predicate(message)) return;
        socket.off(type, check as never);
        resolve(message);
      };
      socket.on(type, check as never);
    });
  return { socket, received, next };
}

describe("socket server", () => {
  it("runs a two-player room over real sockets without leaking the other side", async () => {
    const a = client();
    const b = client();
    const readyA = a.next("room:ready");
    a.socket.emit("room:create");
    const { roomCode } = await readyA;

    const readyB = b.next("room:ready");
    b.socket.emit("room:join", { roomCode });
    expect((await readyB).role).toBe("B");

    const towerTurned = b.next("world:update", (m) => m.observation.fixtures.tower?.orientation === 0);
    a.socket.emit("control:act", { requestId: "r1", action: { type: "turn", controlId: "wheel", direction: 1 } });
    await towerTurned;

    const pulse = a.next("world:update", (m) => m.effects.some((e) => e.kind === "pulse"));
    b.socket.emit("control:act", { requestId: "r1", action: { type: "press", controlId: "button" } });
    await pulse;

    expect(JSON.stringify(a.received)).not.toMatch(/valve|button|tower/);
    expect(JSON.stringify(b.received)).not.toMatch(/wheel|lever|pool|beacon/);
  });

  it("answers malformed messages with an error and keeps serving", async () => {
    const a = client();
    const invalid = a.next("room:error");
    a.socket.emit("control:act", { requestId: "r1", action: { type: "explode", controlId: "wheel" } });
    expect((await invalid).code).toBe("invalid-message");

    const notInRoom = a.next("room:error");
    a.socket.emit("control:act", { requestId: "r1", action: { type: "toggle", controlId: "lever" } });
    expect((await notInRoom).code).toBe("not-in-room");

    const ready = a.next("room:ready");
    a.socket.emit("room:create");
    expect((await ready).role).toBe("A");
  });

  it("marks the partner disconnected when their socket closes", async () => {
    const a = client();
    const b = client();
    const readyA = a.next("room:ready");
    a.socket.emit("room:create");
    const { roomCode } = await readyA;
    const joined = a.next("room:status", (m) => m.partner === "connected");
    b.socket.emit("room:join", { roomCode });
    await joined;

    const gone = a.next("room:status", (m) => m.partner === "disconnected");
    b.socket.disconnect();
    await gone;
  });

  it("rate-limits a flood of messages", async () => {
    const a = client();
    const limited = a.next("room:error", (m) => m.code === "rate-limited");
    for (let i = 0; i < 40; i += 1) a.socket.emit("room:reset");
    await limited;
  });

  it("serves the health check", async () => {
    const response = await fetch(`${url}/health`);
    expect(await response.json()).toEqual({ status: "ok" });
  });
});

describe("development inspector", () => {
  it("does not exist unless the server enables it", async () => {
    const inspector = connect(`${url}/inspect`, { transports: ["websocket"], forceNew: true });
    sockets.push(inspector);
    const failure = await new Promise<Error>((resolve) => inspector.on("connect_error", resolve));
    expect(failure.message).toMatch(/Invalid namespace/);
  });

  it("when enabled, shows a room's state and acts as either role", async () => {
    await server.close();
    server = createGameServer({ clientDir: "/nonexistent", inspector: true });
    await new Promise<void>((resolve) => server.httpServer.listen(0, "127.0.0.1", resolve));
    url = `http://127.0.0.1:${(server.httpServer.address() as AddressInfo).port}`;

    const a = client();
    const readyA = a.next("room:ready");
    a.socket.emit("room:create");
    const { roomCode } = await readyA;

    const inspector = connect(`${url}/inspect`, { transports: ["websocket"], forceNew: true });
    sockets.push(inspector);
    type Snapshot = { roomCode: string; room: { state: { controls: Record<string, unknown> }; trace: unknown[] } | null };
    const snapshot = (predicate: (s: Snapshot) => boolean) =>
      new Promise<Snapshot>((resolve) => {
        const check = (s: Snapshot) => predicate(s) && (inspector.off("inspect:room", check), resolve(s));
        inspector.on("inspect:room", check);
      });

    const watching = snapshot(() => true);
    inspector.emit("inspect:watch", { roomCode });
    expect((await watching).room?.state.controls).toMatchObject({ wheel: 0, valve: 0 });

    // A player's own action refreshes the inspector too.
    const afterPlayer = snapshot((s) => s.room?.state.controls.wheel === 1);
    a.socket.emit("control:act", { requestId: "r1", action: { type: "turn", controlId: "wheel", direction: 1 } });
    await afterPlayer;

    const poolChanged = a.next("world:update", (m) => m.observation.fixtures.pool?.pattern === 2);
    inspector.emit("inspect:act", { roomCode, role: "B", action: { type: "turn", controlId: "valve", direction: 1 } });
    await poolChanged;

    const refused = new Promise((resolve) => inspector.once("inspect:error", resolve));
    inspector.emit("inspect:replay", { roomCode, trace: [{ at: 0, kind: "explode" }] });
    await refused;
  });
});
