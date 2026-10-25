import Phaser from "phaser";

/**
 * Intentional placeholder: verifies Phaser boots before anyone starts
 * implementing the actual clearings, movement, puzzles or role-specific views.
 */
export class GameScene extends Phaser.Scene {
  constructor() {
    super("GameScene");
  }

  create(): void {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor("#acc39e");

    const ground = this.add.graphics();
    ground.fillStyle(0x78966c, 0.85);
    ground.fillRoundedRect(30, 30, width - 60, height - 60, 18);

    const wheel = this.add.circle(width * 0.3, height * 0.55, 48, 0xd7a958);
    wheel.setStrokeStyle(8, 0x615449);
    const tower = this.add.rectangle(width * 0.72, height * 0.55, 65, 165, 0xc86956);
    tower.setStrokeStyle(6, 0x6d5549);

    this.add.text(width / 2, 85, "Two clearings. Four controls. One shared mystery.", {
      fontFamily: "system-ui, sans-serif",
      fontSize: "21px",
      color: "#20332b",
    }).setOrigin(0.5);

    this.add.text(width / 2, height - 68, "Rendering scaffold. No interactions yet.", {
      fontFamily: "system-ui, sans-serif",
      fontSize: "17px",
      color: "#20332b",
    }).setOrigin(0.5);
  }
}
