import Phaser from "phaser";
import { io } from "socket.io-client";
import { observe } from "../shared/observe";
import { isRole, type Role } from "../shared/types";
import { isMuted, setMuted, unlockAudio } from "./audio";
import { FOCUS_EVENT, GameScene, type SceneData } from "./GameScene";
import { LocalPreview } from "./session";
import "./style.css";

const preview = new LocalPreview();
let role: Role = "A";

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: 900,
  height: 560,
  backgroundColor: "#8fae7b",
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_HORIZONTALLY,
  },
});
game.scene.add("GameScene", GameScene, true, { session: preview.view(role) } satisfies SceneData);

const hint = document.getElementById("interaction-hint");
const defaultHint = hint?.textContent ?? "";
game.events.on(FOCUS_EVENT, (label: string | null) => {
  if (hint) hint.textContent = label ? `Press E or Space to use the ${label}.` : defaultHint;
});

const roleButtons = document.querySelectorAll<HTMLButtonElement>("[data-role]");
function showClearing(next: Role): void {
  role = next;
  for (const button of roleButtons) button.setAttribute("aria-pressed", String(button.dataset.role === role));
  game.scene.getScene("GameScene")?.scene.restart({ session: preview.view(role) } satisfies SceneData);
}
for (const button of roleButtons) {
  button.addEventListener("click", () => {
    unlockAudio();
    // Keep Space for the game rather than re-activating the focused button.
    button.blur();
    if (isRole(button.dataset.role)) showClearing(button.dataset.role);
  });
}

document.getElementById("reset")?.addEventListener("click", (event) => {
  (event.currentTarget as HTMLButtonElement).blur();
  preview.reset();
});

const muteButton = document.getElementById("mute") as HTMLButtonElement | null;
function toggleMute(): void {
  unlockAudio();
  setMuted(!isMuted());
  if (muteButton) {
    muteButton.setAttribute("aria-pressed", String(isMuted()));
    muteButton.textContent = isMuted() ? "Sound off" : "Sound on";
  }
}
muteButton?.addEventListener("click", () => {
  muteButton.blur();
  toggleMute();
});
window.addEventListener("keydown", (event) => {
  if (event.key === "m" || event.key === "M") toggleMute();
});

// Development only: both role projections side by side, so a remote change is
// visible without switching clearings. Raw authoritative state is not shown.
if (import.meta.env.DEV) {
  const panel = document.getElementById("dev-panel");
  if (panel) {
    panel.hidden = false;
    const render = () => {
      const state = preview.snapshot();
      panel.textContent = (["A", "B"] as const)
        .map((r) => `Observation ${r}: ${JSON.stringify(observe(state, r))}`)
        .join("\n");
    };
    preview.onChange(render);
    render();
  }
}

const status = document.getElementById("connection-state");
const socket = io({ autoConnect: true });

socket.on("connect", () => {
  if (status) status.textContent = "Server connected (rooms not implemented; local preview).";
});
socket.on("disconnect", () => {
  if (status) status.textContent = "Disconnected from server.";
});
socket.on("connect_error", () => {
  if (status) status.textContent = "Server unavailable; run npm run dev.";
});
