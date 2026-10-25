import { describe, expect, it } from "vitest";
import { normalizeRoomCode, parseClientMessage } from "../src/shared/protocol";

const token = "abcdefghijklmnopqrstuvwxyzAB-_12";

describe("client message validation", () => {
  it("accepts well-formed messages", () => {
    expect(parseClientMessage("room:create", undefined)).toEqual({ type: "room:create" });
    expect(parseClientMessage("room:reset", {})).toEqual({ type: "room:reset" });
    expect(parseClientMessage("room:join", { roomCode: "abc234" })).toEqual({ type: "room:join", roomCode: "ABC234" });
    expect(parseClientMessage("room:join", { roomCode: "ABC234", reconnectToken: token })).toEqual({
      type: "room:join",
      roomCode: "ABC234",
      reconnectToken: token,
    });
    expect(
      parseClientMessage("control:act", { requestId: "x-1", action: { type: "turn", controlId: "wheel", direction: -1 } }),
    ).toEqual({ type: "control:act", requestId: "x-1", action: { type: "turn", controlId: "wheel", direction: -1 } });
  });

  it("rejects unknown events and malformed payloads", () => {
    const bad: Array<[unknown, unknown]> = [
      ["room:delete", {}],
      [42, {}],
      ["room:join", {}],
      ["room:join", { roomCode: "ABC23" }],
      ["room:join", { roomCode: "ABCD10" }],
      ["room:join", { roomCode: "ABC234", reconnectToken: "short" }],
      ["room:join", { roomCode: "ABC234", reconnectToken: 7 }],
      ["control:act", { action: { type: "toggle", controlId: "lever" } }],
      ["control:act", { requestId: "x".repeat(65), action: { type: "toggle", controlId: "lever" } }],
      ["control:act", { requestId: "has space", action: { type: "toggle", controlId: "lever" } }],
      ["control:act", { requestId: "r", action: { type: "turn", controlId: "wheel", direction: 2 } }],
      ["control:act", { requestId: "r", action: null }],
      ["control:act", "toggle"],
    ];
    for (const [event, payload] of bad) expect(parseClientMessage(event, payload)).toBeNull();
  });

  it("normalizes room codes and refuses ambiguous characters", () => {
    expect(normalizeRoomCode(" k7m2pq ")).toBe("K7M2PQ");
    expect(normalizeRoomCode("KOM2PQ")).toBeNull();
    expect(normalizeRoomCode("K1M2PQ")).toBeNull();
    expect(normalizeRoomCode(null)).toBeNull();
  });
});
