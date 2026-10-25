import type { Socket } from "socket.io-client";
import type { ClientMessage, ErrorCode, PartnerStatus, ServerMessage } from "../shared/protocol";
import type { Action, Observation, Role } from "../shared/types";
import type { ClientSession, SessionUpdate } from "./session";

type Message<T extends ServerMessage["type"]> = Extract<ServerMessage, { type: T }>;

export interface RoomCallbacks {
  /** Seated (or re-seated) in a room; the reconnect token is already stored. */
  onReady(roomCode: string, role: Role): void;
  /** A first observation for a role: start (or restart) the clearing scene. */
  onSession(session: ClientSession): void;
  onUpdate(observation: Observation): void;
  onPartner(status: PartnerStatus): void;
  onError(code: ErrorCode): void;
  onConnection(connected: boolean): void;
}

/** One role's view of a server room, as consumed by the clearing scene. */
class NetworkSession implements ClientSession {
  private latest: Observation;
  private readonly listeners = new Set<(update: SessionUpdate) => void>();

  constructor(
    readonly role: Role,
    observation: Observation,
    private readonly send: (action: Action) => void,
  ) {
    this.latest = observation;
  }

  observation(): Observation {
    return this.latest;
  }

  act(action: Action): void {
    this.send(action);
  }

  subscribe(listener: (update: SessionUpdate) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Applies a server update unless it is older than what is shown. */
  receive(update: SessionUpdate): boolean {
    if (update.observation.revision < this.latest.revision) return false;
    this.latest = update.observation;
    for (const listener of this.listeners) listener(update);
    return true;
  }
}

/**
 * Client end of the room protocol. The server decides everything; this only
 * remembers which room to rejoin after a reconnect and forwards actions.
 */
export class RoomConnection {
  private roomCode: string | null = null;
  private seated = false;
  private session: NetworkSession | null = null;
  private requestCounter = 0;
  private readonly requestPrefix = Math.random().toString(36).slice(2, 10);

  constructor(private readonly socket: Socket, private readonly callbacks: RoomCallbacks) {
    socket.on("connect", () => {
      callbacks.onConnection(true);
      if (this.roomCode) this.join(this.roomCode);
    });
    socket.on("disconnect", () => {
      this.seated = false;
      callbacks.onConnection(false);
    });
    socket.on("room:ready", (message: Message<"room:ready">) => this.onReady(message));
    socket.on("world:update", (message: Message<"world:update">) => this.onUpdate(message));
    socket.on("room:status", (message: Message<"room:status">) => callbacks.onPartner(message.partner));
    socket.on("room:error", (message: Message<"room:error">) => this.onError(message.code));
  }

  create(): void {
    this.emit({ type: "room:create" });
  }

  join(roomCode: string): void {
    this.roomCode = roomCode;
    if (!this.socket.connected) return;
    const reconnectToken = loadToken(roomCode);
    this.emit(reconnectToken ? { type: "room:join", roomCode, reconnectToken } : { type: "room:join", roomCode });
  }

  reset(): void {
    if (this.seated) this.emit({ type: "room:reset" });
  }

  private act(action: Action): void {
    // Actions made while disconnected are dropped rather than queued: the
    // player sees nothing happen, and nothing surprising fires on reconnect.
    if (!this.seated) return;
    this.requestCounter += 1;
    this.emit({ type: "control:act", requestId: `${this.requestPrefix}-${this.requestCounter}`, action });
  }

  private onReady({ roomCode, role, reconnectToken }: Message<"room:ready">): void {
    this.roomCode = roomCode;
    this.seated = true;
    saveToken(roomCode, reconnectToken);
    if (this.session && this.session.role !== role) this.session = null;
    this.callbacks.onReady(roomCode, role);
  }

  private onUpdate({ observation, effects }: Message<"world:update">): void {
    if (!this.session || this.session.role !== observation.role) {
      this.session = new NetworkSession(observation.role, observation, (action) => this.act(action));
      this.callbacks.onSession(this.session);
    } else if (!this.session.receive({ observation, effects })) {
      return;
    }
    this.callbacks.onUpdate(observation);
  }

  private onError(code: ErrorCode): void {
    if (code === "room-not-found" || code === "room-full" || code === "replaced") {
      // Stop rejoining automatically; the page offers the next step.
      if (code === "room-not-found" && this.roomCode) clearToken(this.roomCode);
      this.roomCode = null;
      this.seated = false;
      this.session = null;
    }
    this.callbacks.onError(code);
  }

  private emit(message: ClientMessage): void {
    this.socket.emit(message.type, message);
  }
}

// Reconnect tokens are kept per tab (sessionStorage), so a refresh reclaims
// the role while a second tab in the same browser is a separate player.
const tokenKey = (roomCode: string) => `wdyjd:token:${roomCode}`;

function loadToken(roomCode: string): string | null {
  try {
    return sessionStorage.getItem(tokenKey(roomCode));
  } catch {
    return null;
  }
}

function saveToken(roomCode: string, token: string): void {
  try {
    sessionStorage.setItem(tokenKey(roomCode), token);
  } catch {
    // Without storage a refresh joins as a new player if a seat is free.
  }
}

function clearToken(roomCode: string): void {
  try {
    sessionStorage.removeItem(tokenKey(roomCode));
  } catch {
    // Nothing stored.
  }
}
