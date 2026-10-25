import Phaser from "phaser";
import { isMuted, setMuted, unlockAudio } from "./audio";
import { FOCUS_EVENT, GameScene, type SceneData } from "./GameScene";
import { startMultiplayer } from "./multiplayer";
import { startPreview } from "./preview";
import type { Stage } from "./session";
import "./style.css";

const game = new Phaser.Game({
  // The scenes are plain 2D shapes, which Canvas draws as well as WebGL; Canvas
  // stays smooth where WebGL falls back to software rendering (about 60 fps
  // against under 10 in headless Chromium).
  type: Phaser.CANVAS,
  parent: "game",
  width: 900,
  height: 560,
  backgroundColor: "#8fae7b",
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_HORIZONTALLY,
  },
});
game.scene.add("GameScene", GameScene, false);

const stage: Stage = {
  show: (session) => {
    game.scene.start("GameScene", { session } satisfies SceneData);
  },
  hide: () => {
    game.scene.stop("GameScene");
  },
};

const hint = document.getElementById("interaction-hint");
const defaultHint = hint?.textContent ?? "";
game.events.on(FOCUS_EVENT, (label: string | null) => {
  if (hint) hint.textContent = label ? `Press E or Space to use the ${label}.` : defaultHint;
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
  if (event.target instanceof HTMLInputElement) return;
  if (event.key === "m" || event.key === "M") toggleMute();
});

if (new URLSearchParams(location.search).has("preview")) startPreview(stage);
else startMultiplayer(stage);
