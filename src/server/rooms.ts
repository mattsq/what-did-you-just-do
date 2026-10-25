import { randomBytes, randomInt } from "node:crypto";
import { observe, observeEffects } from "../shared/observe";
import {
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  type ErrorCode,
  type PartnerStatus,
  type ServerMessage,
} from "../shared/protocol";
import { applyAction, createInitialState, forceFinale, resetState } from "../shared/rules";
import { MAX_TRACE_LENGTH, replayTrace, type TraceEntry } from "../shared/trace";
import { otherRole, ROLES, type Action, type Effect, type GameState, type Observation, type Role } from "../shared/types";

/** One message for one connection; the transport decides how to send it. */
export interface Delivery {
  readonly connectionId: string;
  readonly message: ServerMessage;
}

/**
 * Everything about one room, for the development inspector only. Never send
 * this to a player: it holds both roles' control values.
 */
export interface RoomInspection {
  readonly roomCode: string;
  readonly state: GameState;
  readonly observations: Readonly<Record<Role, Observation>>;
  readonly seats: Readonly<Record<Role, PartnerStatus>>;
  readonly trace: readonly TraceEntry[];
  /** True once the trace reached its length limit and stopped recording. */
  readonly traceTruncated: boolean;
}

export interface RoomLimits {
  /** A disconnected seat is kept for its reconnect token this long. */
  readonly seatGraceMs: number;
  /** A room with nobody connected is deleted after this long without activity. */
  readonly roomIdleMs: number;
  readonly maxRooms: number;
  /** Remembered request IDs per seat, for suppressing duplicate actions. */
  readonly requestMemory: number;
}

export const DEFAULT_LIMITS: RoomLimits = {
  seatGraceMs: 10 * 60_000,
  roomIdleMs: 30 * 60_000,
  maxRooms: 1000,
  requestMemory: 100,
};

export interface RoomManagerOptions {
  readonly now?: () => number;
  readonly limits?: Partial<RoomLimits>;
  /** Injectable for tests; defaults to cryptographic randomness. */
  readonly roomCode?: () => string;
  readonly token?: () => string;
}

interface Seat {
  token: string;
  connectionId: string | null;
  disconnectedAt: number;
  recentRequests: string[];
}

interface Room {
  readonly code: string;
  state: GameState;
  readonly seats: Partial<Record<Role, Seat>>;
  lastActivity: number;
  /** Successful actions and resets since `traceStart`, for inspection and replay. */
  trace: TraceEntry[];
  traceStart: number;
}

interface Binding {
  readonly roomCode: string;
  readonly role: Role;
}

/**
 * Sole owner of authoritative room state: membership, reconnect tokens,
 * puzzle state and transitions. Players only ever receive `observe()`
 * projections of it.
 */
export class RoomManager {
  private readonly rooms = new Map<string, Room>();
  private readonly bindings = new Map<string, Binding>();
  private readonly now: () => number;
  private readonly limits: RoomLimits;
  private readonly makeRoomCode: () => string;
  private readonly makeToken: () => string;

  constructor(options: RoomManagerOptions = {}) {
    this.now = options.now ?? Date.now;
    this.limits = { ...DEFAULT_LIMITS, ...options.limits };
    this.makeRoomCode = options.roomCode ?? randomRoomCode;
    this.makeToken = options.token ?? (() => randomBytes(24).toString("base64url"));
  }

  get roomCount(): number {
    return this.rooms.size;
  }

  /** Creates a room and seats the creator as A. */
  create(connectionId: string): Delivery[] {
    const swept = this.sweep();
    if (this.rooms.size >= this.limits.maxRooms) return [...swept, error(connectionId, "server-busy")];
    let code = this.makeRoomCode();
    for (let attempt = 0; this.rooms.has(code); attempt += 1) {
      if (attempt > 20) return [...swept, error(connectionId, "server-busy")];
      code = this.makeRoomCode();
    }
    const left = this.leave(connectionId);
    const room: Room = {
      code,
      state: createInitialState(),
      seats: {},
      lastActivity: this.now(),
      trace: [],
      traceStart: this.now(),
    };
    this.rooms.set(code, room);
    return [...swept, ...left, ...this.seat(room, "A", connectionId)];
  }

  /**
   * Joins a room. A matching reconnect token reclaims its role (taking it over
   * from any older connection); otherwise the first free seat is assigned.
   */
  join(connectionId: string, roomCode: string, reconnectToken?: string): Delivery[] {
    const swept = this.sweep();
    return [...swept, ...this.joinRoom(connectionId, roomCode, reconnectToken)];
  }

  private joinRoom(connectionId: string, roomCode: string, reconnectToken?: string): Delivery[] {
    const room = this.rooms.get(roomCode);
    if (!room) return [...this.leave(connectionId), error(connectionId, "room-not-found")];

    const current = this.bindings.get(connectionId);
    const reclaimed = reconnectToken === undefined
      ? undefined
      : ROLES.find((role) => room.seats[role]?.token === reconnectToken);
    if (current && current.roomCode === roomCode && (reclaimed === undefined || reclaimed === current.role)) {
      // Already seated here: resend the snapshot rather than taking a second seat.
      return this.welcome(room, current.role, connectionId);
    }

    const role = reclaimed ?? ROLES.find((r) => room.seats[r] === undefined);
    if (!role) return [...this.leave(connectionId), error(connectionId, "room-full")];
    const deliveries = this.leave(connectionId);
    return [...deliveries, ...this.seat(room, role, connectionId)];
  }

  /** Disconnection or leaving: the seat stays reserved for its token. */
  leave(connectionId: string): Delivery[] {
    const binding = this.bindings.get(connectionId);
    if (!binding) return [];
    this.bindings.delete(connectionId);
    const room = this.rooms.get(binding.roomCode);
    const seat = room?.seats[binding.role];
    if (!room || !seat || seat.connectionId !== connectionId) return [];
    seat.connectionId = null;
    seat.disconnectedAt = this.now();
    room.lastActivity = this.now();
    return this.statusFor(room, otherRole(binding.role));
  }

  act(connectionId: string, requestId: string, action: Action): Delivery[] {
    const found = this.find(connectionId);
    if (!found) return [error(connectionId, "not-in-room")];
    const { room, role, seat } = found;
    if (seat.recentRequests.includes(requestId)) return [];
    seat.recentRequests.push(requestId);
    if (seat.recentRequests.length > this.limits.requestMemory) seat.recentRequests.shift();

    const result = applyAction(room.state, role, action);
    if (!result.ok) return [error(connectionId, "rejected-action")];
    this.record(room, { kind: "act", role, action });
    return this.commit(room, result.state, result.effects);
  }

  /** Either player may restore the starting positions. */
  reset(connectionId: string): Delivery[] {
    const found = this.find(connectionId);
    if (!found) return [error(connectionId, "not-in-room")];
    return this.resetRoom(found.room);
  }

  /** Frees expired seats and deletes idle, empty rooms. */
  sweep(): Delivery[] {
    const now = this.now();
    const deliveries: Delivery[] = [];
    for (const room of this.rooms.values()) {
      let freed = false;
      for (const role of ROLES) {
        const seat = room.seats[role];
        if (seat && seat.connectionId === null && now - seat.disconnectedAt >= this.limits.seatGraceMs) {
          delete room.seats[role];
          freed = true;
        }
      }
      if (freed) deliveries.push(...ROLES.flatMap((role) => this.statusFor(room, role)));
      const connected = ROLES.some((role) => room.seats[role]?.connectionId);
      if (!connected && now - room.lastActivity >= this.limits.roomIdleMs) this.rooms.delete(room.code);
    }
    return deliveries;
  }

  /** Test and diagnostics helper; never send this to a player. */
  inspect(roomCode: string): GameState | undefined {
    return this.rooms.get(roomCode)?.state;
  }

  // -------------------------------------------------------------------------
  // Development inspector. These bypass seats, so only a development-gated
  // transport may call them (see `inspector` in app.ts).
  // -------------------------------------------------------------------------

  /** The room a connection is seated in, if any. */
  roomOf(connectionId: string): string | undefined {
    return this.bindings.get(connectionId)?.roomCode;
  }

  inspectRoom(roomCode: string): RoomInspection | null {
    const room = this.rooms.get(roomCode);
    if (!room) return null;
    const seat = (role: Role): PartnerStatus => {
      const s = room.seats[role];
      return !s ? "absent" : s.connectionId ? "connected" : "disconnected";
    };
    return {
      roomCode,
      state: room.state,
      observations: { A: observe(room.state, "A"), B: observe(room.state, "B") },
      seats: { A: seat("A"), B: seat("B") },
      trace: [...room.trace],
      traceTruncated: room.trace.length >= MAX_TRACE_LENGTH,
    };
  }

  /** Acts as `role` whether or not anyone holds that seat. */
  inspectAct(roomCode: string, role: Role, action: Action): Delivery[] | null {
    const room = this.rooms.get(roomCode);
    if (!room) return null;
    const result = applyAction(room.state, role, action);
    if (!result.ok) return [];
    this.record(room, { kind: "act", role, action });
    return this.commit(room, result.state, result.effects);
  }

  inspectReset(roomCode: string): Delivery[] | null {
    const room = this.rooms.get(roomCode);
    return room ? this.resetRoom(room) : null;
  }

  inspectFinale(roomCode: string): Delivery[] | null {
    const room = this.rooms.get(roomCode);
    if (!room) return null;
    const result = forceFinale(room.state);
    if (result.effects.length === 0) return [];
    this.record(room, { kind: "finale" });
    return this.commit(room, result.state, result.effects);
  }

  /**
   * Resets the room, then applies the trace at once. Players receive one
   * update with the final state and every effect they may witness. The room's
   * trace becomes the replayed one, so exporting it again gives the same trace.
   */
  inspectReplay(roomCode: string, trace: readonly TraceEntry[]): Delivery[] | null {
    const room = this.rooms.get(roomCode);
    if (!room) return null;
    const result = replayTrace(trace, resetState(room.state));
    room.trace = trace.slice(0, MAX_TRACE_LENGTH);
    room.traceStart = this.now() - (trace.at(-1)?.at ?? 0);
    return this.commit(room, result.state, result.effects, true);
  }

  private resetRoom(room: Room): Delivery[] {
    this.record(room, { kind: "reset" });
    return this.commit(room, resetState(room.state), [], true);
  }

  /** Recording stops at the length limit rather than dropping the start, so a trace always replays from a fresh room. */
  private record(room: Room, entry: DistributiveOmit<TraceEntry, "at">): void {
    if (room.trace.length >= MAX_TRACE_LENGTH) return;
    room.trace.push({ ...entry, at: this.now() - room.traceStart } as TraceEntry);
  }

  private seat(room: Room, role: Role, connectionId: string): Delivery[] {
    const existing = room.seats[role];
    const deliveries: Delivery[] = [];
    if (existing?.connectionId && existing.connectionId !== connectionId) {
      this.bindings.delete(existing.connectionId);
      deliveries.push(error(existing.connectionId, "replaced"));
    }
    const seat: Seat = existing ?? { token: this.makeToken(), connectionId: null, disconnectedAt: 0, recentRequests: [] };
    seat.connectionId = connectionId;
    room.seats[role] = seat;
    room.lastActivity = this.now();
    this.bindings.set(connectionId, { roomCode: room.code, role });
    return [...deliveries, ...this.welcome(room, role, connectionId), ...this.statusFor(room, otherRole(role))];
  }

  private welcome(room: Room, role: Role, connectionId: string): Delivery[] {
    const seat = room.seats[role]!;
    return [
      { connectionId, message: { type: "room:ready", roomCode: room.code, role, reconnectToken: seat.token } },
      // A snapshot carries no effects, so reconnecting never replays a pulse or the finale.
      { connectionId, message: { type: "world:update", observation: observe(room.state, role), effects: [] } },
      ...this.statusFor(room, role),
    ];
  }

  private commit(room: Room, next: GameState, effects: readonly Effect[], always = false): Delivery[] {
    const previous = room.state;
    room.state = next;
    room.lastActivity = this.now();
    const deliveries: Delivery[] = [];
    for (const role of ROLES) {
      const connectionId = room.seats[role]?.connectionId;
      if (!connectionId) continue;
      const observation = observe(next, role);
      const visible = observeEffects(effects, role);
      // Only tell a player something happened when their own view changed, so
      // revision numbers do not reveal unseen activity in the other clearing.
      if (!always && visible.length === 0 && sameView(observation, observe(previous, role))) continue;
      deliveries.push({ connectionId, message: { type: "world:update", observation, effects: visible } });
    }
    return deliveries;
  }

  private statusFor(room: Room, role: Role): Delivery[] {
    const connectionId = room.seats[role]?.connectionId;
    if (!connectionId) return [];
    const partner = room.seats[otherRole(role)];
    const status = !partner ? "absent" : partner.connectionId ? "connected" : "disconnected";
    return [{ connectionId, message: { type: "room:status", partner: status } }];
  }

  private find(connectionId: string): { room: Room; role: Role; seat: Seat } | null {
    const binding = this.bindings.get(connectionId);
    const room = binding && this.rooms.get(binding.roomCode);
    const seat = binding && room?.seats[binding.role];
    if (!binding || !room || !seat || seat.connectionId !== connectionId) return null;
    return { room, role: binding.role, seat };
  }
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

function error(connectionId: string, code: ErrorCode): Delivery {
  return { connectionId, message: { type: "room:error", code } };
}

function sameView(a: Observation, b: Observation): boolean {
  return JSON.stringify({ ...a, revision: 0 }) === JSON.stringify({ ...b, revision: 0 });
}

function randomRoomCode(): string {
  let code = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i += 1) code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
  return code;
}
