// Remote smoke test for a running server, for example a fresh deployment:
//
//   npm run smoke -- https://your-service.up.railway.app
//
// Checks the health endpoint, then plays the protocol with three socket
// clients: create and join by room code, a remote effect in each direction,
// reconnection with the stored token, a refused third player, the finale on
// both sides and reset. It also checks that neither player ever receives the
// other side's controls or fixtures, and that the inspector is not served.
// It creates one room, which the server deletes after it has been idle.
import { io, type Socket } from "socket.io-client";
import type { ServerMessage } from "../src/shared/protocol";
import type { Action } from "../src/shared/types";

type Message<T extends ServerMessage["type"]> = Extract<ServerMessage, { type: T }>;

const TIMEOUT_MS = 10_000;
const base = process.argv[2];
if (!base || !/^https?:\/\//.test(base)) {
  console.error("Usage: npm run smoke -- <server URL, e.g. https://example.up.railway.app>");
  process.exit(2);
}
const origin = new URL(base).origin;
const sockets: Socket[] = [];

/** `received` collects every message, and can be shared by a player's later connections. */
function client(name: string, received: ServerMessage[] = []) {
  const socket = io(origin, { transports: ["websocket"], forceNew: true, reconnection: false });
  sockets.push(socket);
  socket.onAny((_event, message: ServerMessage) => received.push(message));
  socket.on("room:error", ({ code }: Message<"room:error">) => console.warn(`    ${name} got room:error ${code}`));
  const next = <T extends ServerMessage["type"]>(type: T, predicate: (m: Message<T>) => boolean = () => true) =>
    new Promise<Message<T>>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${name}: no ${type} within ${TIMEOUT_MS} ms`)), TIMEOUT_MS);
      const check = (message: Message<T>) => {
        if (!predicate(message)) return;
        clearTimeout(timer);
        socket.off(type, check as never);
        resolve(message);
      };
      socket.on(type, check as never);
    });
  let request = 0;
  const act = (action: Action) => socket.emit("control:act", { requestId: `smoke-${name}-${++request}`, action });
  return { socket, received, next, act };
}

async function step(description: string, run: () => Promise<void>): Promise<void> {
  const start = Date.now();
  await run();
  console.log(`ok  ${description} (${Date.now() - start} ms)`);
}

function check(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

async function main(): Promise<void> {
  await step("health check answers", async () => {
    const response = await fetch(`${origin}/health`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    check(response.ok, `/health returned ${response.status}`);
    const body: unknown = await response.json();
    check(JSON.stringify(body) === JSON.stringify({ status: "ok" }), `/health returned ${JSON.stringify(body)}`);
  });

  await step("the page is served from the same origin", async () => {
    const response = await fetch(`${origin}/`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    check(response.ok && (await response.text()).includes("What Did You Just Do?"), "the game page is missing");
  });

  await step("the development inspector is not served", async () => {
    const inspector = io(`${origin}/inspect`, { transports: ["websocket"], forceNew: true, reconnection: false });
    sockets.push(inspector);
    const outcome = await new Promise<string>((resolve) => {
      inspector.on("connect", () => resolve("connected"));
      inspector.on("connect_error", (error) => resolve(error.message));
      setTimeout(() => resolve("timeout"), TIMEOUT_MS);
    });
    check(outcome === "Invalid namespace", `inspector namespace answered: ${outcome}`);
  });

  const a = client("A");
  let b = client("B");
  let roomCode = "";
  let tokenB = "";

  await step("A creates a room and B joins it", async () => {
    const readyA = a.next("room:ready");
    a.socket.emit("room:create");
    const createdA = await readyA;
    check(createdA.role === "A", `creator was seated as ${createdA.role}`);
    roomCode = createdA.roomCode;
    const readyB = b.next("room:ready");
    const partner = a.next("room:status", (m) => m.partner === "connected");
    b.socket.emit("room:join", { roomCode });
    const joined = await readyB;
    check(joined.role === "B", `joiner was seated as ${joined.role}`);
    tokenB = joined.reconnectToken;
    await partner;
  });

  await step("A's wheel turns B's tower", async () => {
    const turned = b.next("world:update", (m) => m.observation.fixtures.tower?.orientation === 0);
    a.act({ type: "turn", controlId: "wheel", direction: 1 });
    await turned;
  });

  await step("B's button pulses A's beacon", async () => {
    const pulse = a.next("world:update", (m) => m.effects.some((e) => e.kind === "pulse" && e.fixture === "beacon"));
    b.act({ type: "press", controlId: "button" });
    await pulse;
  });

  await step("B reconnects with its token and keeps role and state", async () => {
    const gone = a.next("room:status", (m) => m.partner === "disconnected");
    b.socket.disconnect();
    await gone;
    b = client("B-again", b.received);
    const ready = b.next("room:ready");
    const snapshot = b.next("world:update");
    b.socket.emit("room:join", { roomCode, reconnectToken: tokenB });
    check((await ready).role === "B", "reconnect did not restore role B");
    const { observation, effects } = await snapshot;
    check(observation.fixtures.tower?.orientation === 0, "reconnect did not restore the tower");
    check(effects.length === 0, "reconnect replayed effects");
  });

  await step("a third player is refused", async () => {
    const third = client("third");
    const refused = third.next("room:error");
    third.socket.emit("room:join", { roomCode });
    const { code } = await refused;
    check(code === "room-full", `third player got ${code}`);
  });

  await step("both players see the finale", async () => {
    a.act({ type: "toggle", controlId: "lever" });
    b.act({ type: "turn", controlId: "valve", direction: -1 });
    const finaleA = a.next("world:update", (m) => m.effects.some((e) => e.kind === "finale"));
    const finaleB = b.next("world:update", (m) => m.effects.some((e) => e.kind === "finale"));
    // The valve turn must arrive before the button press; Socket.IO keeps one client's messages in order.
    b.act({ type: "press", controlId: "button" });
    await Promise.all([finaleA, finaleB]);
  });

  await step("reset restores the start for both", async () => {
    const resetA = a.next("world:update", (m) => !m.observation.finaleComplete);
    const resetB = b.next("world:update", (m) => !m.observation.finaleComplete);
    a.socket.emit("room:reset");
    await Promise.all([resetA, resetB]);
  });

  await step("neither player received the other side's controls or fixtures", async () => {
    check(!/valve|button|tower/.test(JSON.stringify(a.received)), "A received B's private names");
    check(!/wheel|lever|pool|beacon/.test(JSON.stringify(b.received)), "B received A's private names");
  });
}

main().then(
  () => {
    console.log(`Smoke test passed against ${origin}`);
    for (const socket of sockets) socket.disconnect();
  },
  (error: unknown) => {
    console.error(`FAILED: ${error instanceof Error ? error.message : String(error)}`);
    for (const socket of sockets) socket.disconnect();
    process.exitCode = 1;
  },
);
