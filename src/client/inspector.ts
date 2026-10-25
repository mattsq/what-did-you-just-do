// Development-only room inspector, loaded by `?inspect` under `npm run dev`.
// It talks to the server's inspector namespace, which a production server
// never serves. Nothing here is available to the game scene.
import { io } from "socket.io-client";
import { FIRST_CLEARING } from "../shared/puzzles/first-clearing";
import type { TraceEntry } from "../shared/trace";
import { ROLES, type Action, type GameState, type Observation, type Role } from "../shared/types";

const INSPECTOR_NAMESPACE = "/inspect";

/** Mirrors `RoomInspection` in src/server/rooms.ts. */
interface RoomInspection {
  readonly state: GameState;
  readonly observations: Readonly<Record<Role, Observation>>;
  readonly seats: Readonly<Record<Role, string>>;
  readonly trace: readonly TraceEntry[];
  readonly traceTruncated: boolean;
}

export interface Inspector {
  watch(roomCode: string): void;
}

/** Every action the puzzle allows, by owning role, labelled for a button. */
function actionsFor(role: Role): { label: string; action: Action }[] {
  return Object.entries(FIRST_CLEARING.controls).flatMap(([controlId, control]): { label: string; action: Action }[] => {
    if (control.owner !== role) return [];
    if (control.kind === "detent") {
      return [
        { label: `${controlId} −1`, action: { type: "turn", controlId, direction: -1 } },
        { label: `${controlId} +1`, action: { type: "turn", controlId, direction: 1 } },
      ];
    }
    if (control.kind === "toggle") return [{ label: `toggle ${controlId}`, action: { type: "toggle", controlId } }];
    return [{ label: `press ${controlId}`, action: { type: "press", controlId } }];
  });
}

export function startInspector(): Inspector {
  const root = document.getElementById("inspector");
  if (!root) return { watch: () => {} };
  root.hidden = false;

  const make = <K extends keyof HTMLElementTagNameMap>(tag: K, text = "", parent: HTMLElement = root) => {
    const element = document.createElement(tag);
    element.textContent = text;
    parent.append(element);
    return element;
  };
  const button = (label: string, parent: HTMLElement, onClick: () => void) => {
    const element = make("button", label, parent);
    element.type = "button";
    element.addEventListener("click", () => {
      // Keep Space and E for the game.
      element.blur();
      onClick();
    });
    return element;
  };

  make("h2", "Inspector (development only)");
  const summary = make("p", "Connecting to the inspector…");
  const actions = make("div");
  actions.className = "toolbar";
  const views = make("div");
  views.className = "inspector-views";
  const panes = {
    state: make("pre", "", views),
    A: make("pre", "", views),
    B: make("pre", "", views),
  };
  make("label", "Action trace (JSON; edit or paste one, then replay)").setAttribute("for", "inspector-trace");
  const traceBox = make("textarea");
  traceBox.id = "inspector-trace";
  traceBox.rows = 6;
  traceBox.spellcheck = false;
  const traceTools = make("div");
  traceTools.className = "toolbar";

  let roomCode: string | null = null;
  let traceText = "[]";
  let traceEdited = false;
  traceBox.addEventListener("input", () => (traceEdited = true));

  const socket = io(INSPECTOR_NAMESPACE, { transports: ["websocket", "polling"], forceNew: true });
  const send = (event: string, body: Record<string, unknown> = {}) => {
    if (roomCode) socket.emit(event, { roomCode, ...body });
  };

  for (const role of ROLES) {
    for (const { label, action } of actionsFor(role)) button(`${role}: ${label}`, actions, () => send("inspect:act", { role, action }));
  }
  button("Reset room", actions, () => send("inspect:reset"));
  button("Force finale", actions, () => send("inspect:finale"));

  button("Replay trace", traceTools, () => {
    let trace: unknown;
    try {
      trace = JSON.parse(traceBox.value);
    } catch {
      summary.textContent = "The trace is not valid JSON.";
      return;
    }
    traceEdited = false;
    send("inspect:replay", { trace });
  });
  button("Copy trace", traceTools, () => void navigator.clipboard?.writeText(traceText));
  button("Show current trace", traceTools, () => {
    traceEdited = false;
    traceBox.value = traceText;
  });

  socket.on("connect", () => {
    summary.textContent = roomCode ? `Watching room ${roomCode}.` : "Inspector connected; waiting for a room.";
    if (roomCode) send("inspect:watch");
  });
  socket.on("connect_error", () => {
    summary.textContent = "Inspector unavailable: start the server with `npm run dev` (it passes --inspector).";
  });
  socket.on("inspect:error", ({ event }: { event: string }) => {
    summary.textContent = `The server refused ${event}: check the trace format.`;
  });
  socket.on("inspect:room", (message: { roomCode: string; room: RoomInspection | null }) => {
    if (message.roomCode !== roomCode) return;
    const { room } = message;
    if (!room) {
      summary.textContent = `Room ${message.roomCode} does not exist.`;
      return;
    }
    summary.textContent =
      `Room ${message.roomCode} · revision ${room.state.revision} · A ${room.seats.A} · B ${room.seats.B}` +
      ` · ${room.trace.length} trace entries${room.traceTruncated ? " (full; no longer recording)" : ""}`;
    panes.state.textContent = `Authoritative state\n${JSON.stringify(room.state, null, 2)}`;
    for (const role of ROLES) {
      panes[role].textContent = `Observation ${role}\n${JSON.stringify(room.observations[role], null, 2)}`;
    }
    traceText = JSON.stringify(room.trace);
    if (!traceEdited) traceBox.value = traceText;
  });

  return {
    watch(code) {
      roomCode = code;
      if (socket.connected) {
        summary.textContent = `Watching room ${code}.`;
        send("inspect:watch");
      }
    },
  };
}
