import { describe, expect, it } from "vitest";
import type { ServerMessage } from "../src/shared/protocol";
import type { Action } from "../src/shared/types";
import { RoomManager, type Delivery } from "../src/server/rooms";

const turnWheel: Action = { type: "turn", controlId: "wheel", direction: 1 };
const turnValve: Action = { type: "turn", controlId: "valve", direction: 1 };
const pullLever: Action = { type: "toggle", controlId: "lever" };
const pressButton: Action = { type: "press", controlId: "button" };

function setup(now = { t: 0 }) {
  let rooms = 0;
  let tokens = 0;
  const manager = new RoomManager({
    now: () => now.t,
    roomCode: () => `ROOM${String.fromCharCode(65 + rooms++)}A`,
    token: () => `token-${String(++tokens).padStart(26, "0")}`,
  });
  return { manager, now };
}

function to(deliveries: readonly Delivery[], connectionId: string): ServerMessage[] {
  return deliveries.filter((d) => d.connectionId === connectionId).map((d) => d.message);
}

function only<T extends ServerMessage["type"]>(messages: ServerMessage[], type: T) {
  return messages.filter((m): m is Extract<ServerMessage, { type: T }> => m.type === type);
}

function ready(deliveries: readonly Delivery[], connectionId: string) {
  const [message] = only(to(deliveries, connectionId), "room:ready");
  if (!message) throw new Error(`no room:ready for ${connectionId}`);
  return message;
}

/** A room with "a" seated as A and "b" seated as B. */
function pair() {
  const ctx = setup();
  const created = ready(ctx.manager.create("a"), "a");
  const joined = ready(ctx.manager.join("b", created.roomCode), "b");
  return { ...ctx, code: created.roomCode, tokenA: created.reconnectToken, tokenB: joined.reconnectToken };
}

describe("room membership", () => {
  it("seats the creator as A and the first joiner as B", () => {
    const { manager } = setup();
    const created = ready(manager.create("a"), "a");
    expect(created.role).toBe("A");
    const deliveries = manager.join("b", created.roomCode);
    expect(ready(deliveries, "b").role).toBe("B");
    expect(only(to(deliveries, "a"), "room:status")).toEqual([{ type: "room:status", partner: "connected" }]);
    expect(only(to(deliveries, "b"), "room:status")).toEqual([{ type: "room:status", partner: "connected" }]);
  });

  it("tells the creator they are waiting for a partner", () => {
    const { manager } = setup();
    expect(only(to(manager.create("a"), "a"), "room:status")).toEqual([{ type: "room:status", partner: "absent" }]);
  });

  it("gives each seat a different reconnect token", () => {
    const { tokenA, tokenB } = pair();
    expect(tokenA).not.toEqual(tokenB);
  });

  it("refuses a third participant, even while a seat is disconnected", () => {
    const { manager, code } = pair();
    expect(to(manager.join("c", code), "c")).toEqual([{ type: "room:error", code: "room-full" }]);
    manager.leave("b");
    expect(to(manager.join("c", code), "c")).toEqual([{ type: "room:error", code: "room-full" }]);
    expect(manager.act("c", "r1", turnValve)).toEqual([{ connectionId: "c", message: { type: "room:error", code: "not-in-room" } }]);
  });

  it("does not seat a connection twice when it repeats a join", () => {
    const { manager, code } = pair();
    const again = manager.join("a", code);
    expect(ready(again, "a").role).toBe("A");
    expect(to(manager.join("c", code), "c")).toEqual([{ type: "room:error", code: "room-full" }]);
  });

  it("reports an unknown room", () => {
    const { manager } = setup();
    expect(manager.join("x", "ZZZZZZ")).toEqual([{ connectionId: "x", message: { type: "room:error", code: "room-not-found" } }]);
  });

  it("keeps rooms isolated", () => {
    const { manager } = setup();
    const one = ready(manager.create("a1"), "a1").roomCode;
    manager.join("b1", one);
    const two = ready(manager.create("a2"), "a2").roomCode;
    manager.join("b2", two);
    expect(one).not.toEqual(two);

    const deliveries = manager.act("a1", "r1", turnWheel);
    expect(deliveries.map((d) => d.connectionId).sort()).toEqual(["a1", "b1"]);
    expect(manager.inspect(two)?.controls.wheel).toBe(0);
    expect(manager.inspect(one)?.controls.wheel).toBe(1);
  });
});

describe("reconnection", () => {
  it("restores the same role and the latest observation", () => {
    const { manager, code, tokenB } = pair();
    manager.act("a", "r1", turnWheel);
    manager.act("a", "r2", pullLever);
    const left = manager.leave("b");
    expect(to(left, "a")).toEqual([{ type: "room:status", partner: "disconnected" }]);

    const deliveries = manager.join("b2", code, tokenB);
    expect(ready(deliveries, "b2")).toMatchObject({ role: "B", reconnectToken: tokenB });
    const [update] = only(to(deliveries, "b2"), "world:update");
    expect(update?.observation.fixtures.tower).toEqual({ orientation: 0, halo: true });
    expect(update?.effects).toEqual([]);
    expect(to(deliveries, "a")).toEqual([{ type: "room:status", partner: "connected" }]);
  });

  it("lets the token holder take over from a still-open connection", () => {
    const { manager, code, tokenA } = pair();
    const deliveries = manager.join("a2", code, tokenA);
    expect(to(deliveries, "a")).toEqual([{ type: "room:error", code: "replaced" }]);
    expect(ready(deliveries, "a2").role).toBe("A");
    expect(manager.act("a", "r1", turnWheel)).toEqual([{ connectionId: "a", message: { type: "room:error", code: "not-in-room" } }]);
    expect(manager.act("a2", "r1", turnWheel)).not.toHaveLength(0);
    // The replaced connection disconnecting later does not unseat the new one.
    expect(manager.leave("a")).toEqual([]);
    expect(only(to(manager.act("a2", "r2", turnWheel), "a2"), "world:update")).toHaveLength(1);
  });

  it("never replays effects or the finale on reconnect", () => {
    const { manager, code, tokenA } = pair();
    const steps = [["a", turnWheel], ["a", pullLever], ["b", turnValve], ["b", turnValve]] as const;
    steps.forEach(([id, action], index) => manager.act(id, `step-${index}`, action));
    const finale = manager.act("b", "press", pressButton);
    expect(only(to(finale, "a"), "world:update")[0]?.effects.map((e) => e.kind)).toEqual(["pulse", "finale"]);
    manager.leave("a");
    const [update] = only(to(manager.join("a2", code, tokenA), "a2"), "world:update");
    expect(update?.observation.finaleComplete).toBe(true);
    expect(update?.effects).toEqual([]);
  });

  it("frees an abandoned seat after the grace period, invalidating its token", () => {
    const { manager, now, code, tokenB } = pair();
    manager.leave("b");
    now.t += 10 * 60_000 - 1;
    expect(manager.sweep()).toEqual([]);
    now.t += 1;
    expect(manager.sweep()).toEqual([{ connectionId: "a", message: { type: "room:status", partner: "absent" } }]);
    const rejoin = manager.join("b2", code, tokenB);
    expect(ready(rejoin, "b2").reconnectToken).not.toEqual(tokenB);
  });

  it("deletes an empty room after inactivity", () => {
    const { manager, now, code, tokenA } = pair();
    manager.leave("a");
    manager.leave("b");
    now.t += 30 * 60_000;
    manager.sweep();
    expect(manager.roomCount).toBe(0);
    expect(to(manager.join("a2", code, tokenA), "a2")).toEqual([{ type: "room:error", code: "room-not-found" }]);
  });

  it("keeps a room while someone is connected", () => {
    const { manager, now } = pair();
    manager.leave("b");
    now.t += 3 * 60 * 60_000;
    manager.sweep();
    expect(manager.roomCount).toBe(1);
  });
});

describe("actions", () => {
  it("delivers role-specific observations: the remote effect goes to the other player", () => {
    const { manager } = pair();
    const deliveries = manager.act("a", "r1", turnWheel);
    const [forA] = only(to(deliveries, "a"), "world:update");
    const [forB] = only(to(deliveries, "b"), "world:update");
    expect(forA?.observation.controls.wheel).toMatchObject({ position: 1 });
    expect(forB?.observation.fixtures.tower?.orientation).toBe(0);
    expect(JSON.stringify(forB)).not.toMatch(/wheel|lever|pool|beacon/);
    expect(JSON.stringify(forA)).not.toMatch(/valve|button|tower/);
  });

  it("sends nothing to a player whose view did not change", () => {
    const { manager } = pair();
    // The button has no visible consequence in B's own clearing.
    const deliveries = manager.act("b", "r1", pressButton);
    expect(deliveries.map((d) => d.connectionId)).toEqual(["a"]);
  });

  it("rejects another role's control and changes nothing", () => {
    const { manager, code } = pair();
    const before = manager.inspect(code);
    expect(manager.act("a", "r1", turnValve)).toEqual([{ connectionId: "a", message: { type: "room:error", code: "rejected-action" } }]);
    expect(manager.inspect(code)).toBe(before);
  });

  it("ignores a repeated request ID", () => {
    const { manager, code } = pair();
    manager.act("a", "same", turnWheel);
    expect(manager.act("a", "same", turnWheel)).toEqual([]);
    expect(manager.inspect(code)?.controls.wheel).toBe(1);
  });

  it("keeps revisions increasing across actions and reset", () => {
    const { manager } = pair();
    const revisions = [
      manager.act("a", "r1", turnWheel),
      manager.act("a", "r2", pullLever),
      manager.reset("b"),
      manager.act("a", "r3", turnWheel),
    ].map((deliveries) => only(to(deliveries, "a"), "world:update")[0]?.observation.revision);
    expect(revisions).toEqual([1, 2, 3, 4]);
  });

  it("lets either player reset the room for both", () => {
    const { manager, code } = pair();
    manager.act("a", "r1", turnWheel);
    const deliveries = manager.reset("b");
    expect(deliveries.map((d) => d.connectionId).sort()).toEqual(["a", "b"]);
    expect(manager.inspect(code)?.controls.wheel).toBe(0);
  });

  it("refuses to create rooms beyond the limit", () => {
    const manager = new RoomManager({ limits: { maxRooms: 1 } });
    manager.create("a");
    expect(manager.create("b")).toEqual([{ connectionId: "b", message: { type: "room:error", code: "server-busy" } }]);
  });

  it("generates unpredictable room codes and tokens by default", () => {
    const manager = new RoomManager();
    const first = ready(manager.create("a"), "a");
    const second = ready(manager.create("b"), "b");
    expect(first.roomCode).toMatch(/^[23456789A-HJKMNP-Z]{6}$/);
    expect(first.roomCode).not.toEqual(second.roomCode);
    expect(first.reconnectToken).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(first.reconnectToken).not.toEqual(second.reconnectToken);
  });
});
