import type { Namespace, Server } from "socket.io";
import { normalizeRoomCode } from "../shared/protocol";
import { parseAction } from "../shared/rules";
import { parseTrace, type TraceEntry } from "../shared/trace";
import { isRole, type Action, type Role } from "../shared/types";
import type { Delivery, RoomManager } from "./rooms";

/** Socket.IO namespace of the development inspector; it exists only when enabled. */
export const INSPECTOR_NAMESPACE = "/inspect";

/** Inspector to server. The event name is the message type. */
export type InspectorMessage =
  | { readonly type: "inspect:watch"; readonly roomCode: string }
  | { readonly type: "inspect:act"; readonly roomCode: string; readonly role: Role; readonly action: Action }
  | { readonly type: "inspect:reset"; readonly roomCode: string }
  | { readonly type: "inspect:finale"; readonly roomCode: string }
  | { readonly type: "inspect:replay"; readonly roomCode: string; readonly trace: readonly TraceEntry[] };

export function parseInspectorMessage(event: unknown, payload: unknown): InspectorMessage | null {
  const body = typeof payload === "object" && payload !== null ? (payload as Record<string, unknown>) : {};
  const roomCode = normalizeRoomCode(body.roomCode);
  if (!roomCode) return null;
  switch (event) {
    case "inspect:watch":
    case "inspect:reset":
    case "inspect:finale":
      return { type: event, roomCode };
    case "inspect:act": {
      const action = parseAction(body.action);
      return isRole(body.role) && action ? { type: event, roomCode, role: body.role, action } : null;
    }
    case "inspect:replay": {
      const trace = parseTrace(body.trace);
      return trace ? { type: event, roomCode, trace } : null;
    }
    default:
      return null;
  }
}

const watchers = (roomCode: string) => `watch:${roomCode}`;

/**
 * Development only: shows complete room state and both observations, and can
 * act as either role, reset, force the finale and replay a trace. It has no
 * authentication, so `createGameServer` registers it only on request and the
 * entry point refuses to do so in production.
 *
 * Returns a function that refreshes every inspector watching `roomCode`.
 */
export function attachInspector(
  io: Server,
  rooms: RoomManager,
  deliver: (deliveries: readonly Delivery[]) => void,
): (roomCode: string) => void {
  const namespace: Namespace = io.of(INSPECTOR_NAMESPACE);
  const refresh = (roomCode: string) => {
    namespace.to(watchers(roomCode)).emit("inspect:room", { roomCode, room: rooms.inspectRoom(roomCode) });
  };

  namespace.on("connection", (socket) => {
    socket.onAny((event: unknown, payload: unknown) => {
      const message = parseInspectorMessage(event, payload);
      if (!message) {
        socket.emit("inspect:error", { event: String(event) });
        return;
      }
      const { roomCode } = message;
      switch (message.type) {
        case "inspect:watch":
          for (const joined of socket.rooms) if (joined !== socket.id) void socket.leave(joined);
          void socket.join(watchers(roomCode));
          break;
        case "inspect:act":
          deliver(rooms.inspectAct(roomCode, message.role, message.action) ?? []);
          break;
        case "inspect:reset":
          deliver(rooms.inspectReset(roomCode) ?? []);
          break;
        case "inspect:finale":
          deliver(rooms.inspectFinale(roomCode) ?? []);
          break;
        case "inspect:replay":
          deliver(rooms.inspectReplay(roomCode, message.trace) ?? []);
          break;
      }
      refresh(roomCode);
    });
  });

  return refresh;
}
