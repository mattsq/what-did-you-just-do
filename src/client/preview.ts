import { io } from "socket.io-client";
import { observe } from "../shared/observe";
import { isRole, type Role } from "../shared/types";
import { unlockAudio } from "./audio";
import { LocalPreview, type Stage } from "./session";

/**
 * Single-browser preview (`/?preview`): both clearings in one page, rules run
 * locally, for trying and tuning the causal map without a partner.
 */
export function startPreview(stage: Stage): void {
  const preview = new LocalPreview();
  stage.show(preview.view("A"));

  const controls = document.getElementById("preview-controls");
  if (controls) controls.hidden = false;
  const roleButtons = document.querySelectorAll<HTMLButtonElement>("[data-role]");
  const showClearing = (role: Role) => {
    for (const button of roleButtons) button.setAttribute("aria-pressed", String(button.dataset.role === role));
    stage.show(preview.view(role));
  };
  for (const button of roleButtons) {
    button.addEventListener("click", () => {
      unlockAudio();
      // Keep Space for the game rather than re-activating the focused button.
      button.blur();
      if (isRole(button.dataset.role)) showClearing(button.dataset.role);
    });
  }

  const reset = document.getElementById("reset");
  if (reset) {
    reset.hidden = false;
    reset.addEventListener("click", () => {
      reset.blur();
      preview.reset();
    });
  }

  // Development only: both role projections side by side, so a remote change
  // is visible without switching clearings. Raw authoritative state is not shown.
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
  if (status) status.textContent = "Single-browser preview: both clearings in this page, no partner needed.";
  // Still checks that the server is reachable, as a deployment smoke signal.
  const socket = io({ transports: ["websocket", "polling"] });
  socket.on("connect", () => {
    if (status) status.textContent = "Single-browser preview (server connected; rules run in this page).";
  });
}
