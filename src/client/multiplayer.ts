import { io } from "socket.io-client";
import { normalizeRoomCode, type ErrorCode, type PartnerStatus } from "../shared/protocol";
import type { Observation, Role } from "../shared/types";
import { unlockAudio } from "./audio";
import { RoomConnection } from "./network";
import type { Stage } from "./session";

const CLEARING_NAMES: Readonly<Record<Role, string>> = {
  A: "the western clearing (A)",
  B: "the eastern clearing (B)",
};

const PARTNER_TEXT: Readonly<Record<PartnerStatus, string>> = {
  absent: "Waiting for your partner to open the invite link.",
  connected: "Your partner is here. Tell each other what you see.",
  disconnected: "Your partner has disconnected. They can rejoin with the same link.",
};

/** Errors that end the current room; the lobby is shown again. */
const ROOM_ENDING_TEXT: Partial<Readonly<Record<ErrorCode, string>>> = {
  "room-not-found":
    "That room no longer exists. Rooms close when left idle or when the server restarts. Create a new room to play.",
  "room-full": "That room already has two players. Ask your partner for their link, or create a new room.",
  replaced: "This clearing was opened in another tab or window. Reload this page to take it back.",
  "server-busy": "The server is busy. Try again in a moment.",
};

/** Two-player play: create or join a room by link and render one role's clearing. */
export function startMultiplayer(stage: Stage): void {
  const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;
  const status = element("connection-state");
  const lobby = element("lobby");
  const roomPanel = element("room-panel");
  const roleLabel = element("role-label");
  const inviteLink = element<HTMLInputElement>("invite-link");
  const resetButton = element<HTMLButtonElement>("reset");
  const devPanel = import.meta.env.DEV ? element("dev-panel") : null;
  // Development only, and only on request: complete room state from the
  // server's inspector. The production bundle leaves this module out.
  const inspecting = import.meta.env.DEV && new URLSearchParams(location.search).has("inspect");
  const inspector = inspecting ? import("./inspector").then((module) => module.startInspector()) : null;
  /** Keeps `inspect` in the address bar so a reload still inspects; never in the invite link. */
  const pageQuery = (query: string) => (inspecting ? `${query ? `${query}&` : "?"}inspect` : query) || location.pathname;

  const say = (text: string) => {
    if (status) status.textContent = text;
  };
  let room: { code: string; role: Role } | null = null;
  let partner: PartnerStatus = "absent";
  let latest: Observation | null = null;

  // Development only: this player's own observation, exactly as received.
  const renderDevPanel = () => {
    if (!devPanel) return;
    devPanel.hidden = false;
    devPanel.textContent = room
      ? `Room ${room.code} · role ${room.role} · partner ${partner}\nObservation: ${JSON.stringify(latest)}`
      : "Not in a room.";
  };

  /** `keepRoomUrl` leaves `?room=` in place so a reload rejoins with the stored token. */
  const showLobby = (keepRoomUrl = false) => {
    room = null;
    latest = null;
    stage.hide();
    if (!keepRoomUrl) history.replaceState(null, "", pageQuery(""));
    if (lobby) lobby.hidden = false;
    if (roomPanel) roomPanel.hidden = true;
    if (resetButton) resetButton.hidden = true;
    renderDevPanel();
  };

  const socket = io({ transports: ["websocket", "polling"] });
  const connection = new RoomConnection(socket, {
    onConnection: (connected) => {
      if (!connected) say("Connection lost. Reconnecting…");
      else if (!room && lobby && !lobby.hidden) say("Server connected. Create a room, then send the link to your partner.");
    },
    onReady: (code, role) => {
      room = { code, role };
      const link = `${location.origin}${location.pathname}?room=${code}`;
      history.replaceState(null, "", pageQuery(`?room=${code}`));
      void inspector?.then((panel) => panel.watch(code));
      if (lobby) lobby.hidden = true;
      if (roomPanel) roomPanel.hidden = false;
      if (resetButton) resetButton.hidden = false;
      if (roleLabel) roleLabel.textContent = `You are in ${CLEARING_NAMES[role]}.`;
      if (inviteLink) inviteLink.value = link;
      renderDevPanel();
    },
    onSession: (session) => stage.show(session),
    onUpdate: (observation) => {
      latest = observation;
      renderDevPanel();
    },
    onPartner: (next) => {
      partner = next;
      say(PARTNER_TEXT[next]);
      renderDevPanel();
    },
    onError: (code) => {
      const ending = ROOM_ENDING_TEXT[code];
      if (ending) {
        // A replaced seat still belongs to this tab's token: reloading takes it back.
        showLobby(code === "replaced");
        say(ending);
      } else {
        // Rejected or rate-limited actions simply have no effect.
        console.warn("Server declined a request", code);
      }
    },
  });

  element("create-room")?.addEventListener("click", (event) => {
    unlockAudio();
    (event.currentTarget as HTMLButtonElement).blur();
    say("Creating a room…");
    connection.create();
  });
  element("copy-link")?.addEventListener("click", (event) => {
    const button = event.currentTarget as HTMLButtonElement;
    button.blur();
    if (!inviteLink) return;
    inviteLink.select();
    void navigator.clipboard?.writeText(inviteLink.value).then(
      () => (button.textContent = "Copied"),
      () => (button.textContent = "Copy"),
    );
  });
  resetButton?.addEventListener("click", () => {
    resetButton.blur();
    connection.reset();
  });

  const code = normalizeRoomCode(new URLSearchParams(location.search).get("room"));
  if (code) {
    say("Joining room…");
    connection.join(code);
  } else {
    showLobby();
    say(socket.connected ? "Server connected. Create a room, then send the link to your partner." : "Connecting to server…");
  }
}
