// Wire protocol between one browser and the room server. Framework-free so
// both sides share the types and the server can validate every payload.
import { parseAction } from "./rules";
import type { Action, Effect, Observation, Role } from "./types";

/** Room code alphabet without easily confused characters (0/O, 1/I/L). */
export const ROOM_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const ROOM_CODE_LENGTH = 6;
const ROOM_CODE_PATTERN = new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`);
/** Reconnect tokens are 24 random bytes, base64url encoded. */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32}$/;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export function normalizeRoomCode(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const code = input.trim().toUpperCase();
  return ROOM_CODE_PATTERN.test(code) ? code : null;
}

// ---------------------------------------------------------------------------
// Client to server. The Socket.IO event name is the message type.
// ---------------------------------------------------------------------------

export type ClientMessage =
  | { readonly type: "room:create" }
  | { readonly type: "room:join"; readonly roomCode: string; readonly reconnectToken?: string }
  | { readonly type: "control:act"; readonly requestId: string; readonly action: Action }
  | { readonly type: "room:reset" };

/** Validates one message from the network; anything malformed becomes null. */
export function parseClientMessage(event: unknown, payload: unknown): ClientMessage | null {
  const body = typeof payload === "object" && payload !== null ? (payload as Record<string, unknown>) : {};
  switch (event) {
    case "room:create":
    case "room:reset":
      return { type: event };
    case "room:join": {
      const roomCode = normalizeRoomCode(body.roomCode);
      if (!roomCode) return null;
      const token = body.reconnectToken;
      if (token === undefined || token === null) return { type: event, roomCode };
      if (typeof token !== "string" || !TOKEN_PATTERN.test(token)) return null;
      return { type: event, roomCode, reconnectToken: token };
    }
    case "control:act": {
      const { requestId } = body;
      if (typeof requestId !== "string" || !REQUEST_ID_PATTERN.test(requestId)) return null;
      const action = parseAction(body.action);
      return action ? { type: event, requestId, action } : null;
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Server to client.
// ---------------------------------------------------------------------------

/** What a player knows about the other seat; never which controls they used. */
export type PartnerStatus = "absent" | "connected" | "disconnected";

export type ErrorCode =
  | "invalid-message"
  | "room-not-found"
  | "room-full"
  | "not-in-room"
  | "rejected-action"
  | "rate-limited"
  | "server-busy"
  /** Another tab or device reclaimed this role with the same reconnect token. */
  | "replaced";

export type ServerMessage =
  | { readonly type: "room:ready"; readonly roomCode: string; readonly role: Role; readonly reconnectToken: string }
  | { readonly type: "room:status"; readonly partner: PartnerStatus }
  /**
   * The latest projection for this role, plus any ephemeral effects this role
   * may witness. `observation.revision` increases monotonically per room.
   */
  | { readonly type: "world:update"; readonly observation: Observation; readonly effects: readonly Effect[] }
  | { readonly type: "room:error"; readonly code: ErrorCode };
