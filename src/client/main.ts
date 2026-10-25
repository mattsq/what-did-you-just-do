import Phaser from "phaser";
import { io } from "socket.io-client";
import { GameScene } from "./GameScene";
import "./style.css";

new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: 900,
  height: 560,
  backgroundColor: "#acc39e",
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_HORIZONTALLY,
  },
  scene: [GameScene],
});

const status = document.getElementById("connection-state");
const socket = io({ autoConnect: true });

socket.on("connect", () => {
  if (status) status.textContent = "Server connected (rooms not implemented).";
});
socket.on("disconnect", () => {
  if (status) status.textContent = "Disconnected from server.";
});
socket.on("connect_error", () => {
  if (status) status.textContent = "Server unavailable; run npm run dev.";
});
