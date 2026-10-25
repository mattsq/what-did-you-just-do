import Phaser from "phaser";
import type { Placement } from "./layout";

// Simple coloured geometry: contemporary installations in a grassy landscape.
const INK = 0x3b362f;
const BRASS = 0xd7a958;
const STONE = 0x8d8a7f;
const TOWER_RED = 0xc4473a;
const LIGHT = 0xfff1a8;

/** Rotates by the shortest path, so wrapping detents do not spin backwards. */
function rotateTo(scene: Phaser.Scene, target: Phaser.GameObjects.Container, degrees: number, duration: number): void {
  const delta = ((degrees - target.angle + 540) % 360) - 180;
  scene.tweens.killTweensOf(target);
  scene.tweens.add({ targets: target, angle: target.angle + delta, duration, ease: "Back.easeOut" });
}

function shadow(scene: Phaser.Scene, p: Placement, scale = 1): void {
  scene.add.ellipse(p.x + 6, p.y + 10, p.radius * 2.2 * scale, p.radius * 1.6 * scale, 0x2c3a24, 0.25);
}

export interface ControlRenderer {
  /** Show the control's current position. `animate` is false on first draw. */
  show(value: number | boolean, animate: boolean): void;
  /** Momentary feedback when operated. */
  press?(): void;
}

export class WheelView implements ControlRenderer {
  private readonly body: Phaser.GameObjects.Container;

  constructor(private readonly scene: Phaser.Scene, p: Placement, private readonly positions: number) {
    shadow(scene, p);
    const ticks = scene.add.graphics({ x: p.x, y: p.y });
    ticks.fillStyle(INK, 0.8);
    for (let i = 0; i < positions; i += 1) {
      const angle = Phaser.Math.DegToRad(-90 + (i * 360) / positions);
      ticks.fillCircle(Math.cos(angle) * (p.radius + 13), Math.sin(angle) * (p.radius + 13), 5);
    }
    const rim = scene.add.circle(0, 0, p.radius, BRASS).setStrokeStyle(7, 0x6b5a45);
    const spokes = scene.add.graphics();
    spokes.lineStyle(7, 0x6b5a45);
    for (let i = 0; i < 3; i += 1) {
      const angle = Phaser.Math.DegToRad(i * 120 - 90);
      spokes.lineBetween(0, 0, Math.cos(angle) * p.radius, Math.sin(angle) * p.radius);
    }
    const hub = scene.add.circle(0, 0, 10, INK);
    const pointer = scene.add.triangle(0, -p.radius - 2, -9, 8, 9, 8, 0, -10, 0xf6ecd2).setStrokeStyle(2, INK);
    this.body = scene.add.container(p.x, p.y, [rim, spokes, hub, pointer]);
  }

  show(value: number | boolean, animate: boolean): void {
    const angle = (Number(value) * 360) / this.positions;
    if (animate) rotateTo(this.scene, this.body, angle, 320);
    else this.body.angle = angle;
  }
}

export class LeverView implements ControlRenderer {
  private readonly handle: Phaser.GameObjects.Container;
  private readonly lock: Phaser.GameObjects.Rectangle;

  constructor(private readonly scene: Phaser.Scene, p: Placement) {
    shadow(scene, p);
    scene.add.rectangle(p.x, p.y, p.radius * 2.2, p.radius * 1.2, STONE).setStrokeStyle(4, INK);
    const shaft = scene.add.rectangle(0, -p.radius * 0.9, 10, p.radius * 1.8, 0x5d5f63).setStrokeStyle(2, INK);
    const knob = scene.add.circle(0, -p.radius * 1.8, 11, 0x2f6f8f).setStrokeStyle(3, INK);
    this.handle = scene.add.container(p.x, p.y, [shaft, knob]);
    this.lock = scene.add.rectangle(p.x + p.radius * 0.75, p.y, 12, 12, 0xf6ecd2).setStrokeStyle(2, INK);
  }

  show(value: number | boolean, animate: boolean): void {
    const angle = value ? 40 : -40;
    // Locked state is shown by shape fill as well as position.
    this.lock.setFillStyle(value ? 0x2f6f8f : 0xf6ecd2);
    this.scene.tweens.killTweensOf(this.handle);
    if (animate) this.scene.tweens.add({ targets: this.handle, angle, duration: 150, ease: "Cubic.easeIn" });
    else this.handle.angle = angle;
  }
}

export class ValveView implements ControlRenderer {
  private readonly handle: Phaser.GameObjects.Container;
  private readonly sweep = 120;

  constructor(private readonly scene: Phaser.Scene, p: Placement, private readonly positions: number) {
    shadow(scene, p);
    const ticks = scene.add.graphics({ x: p.x, y: p.y });
    ticks.lineStyle(5, INK, 0.8);
    for (let i = 0; i < positions; i += 1) {
      const angle = Phaser.Math.DegToRad(this.angleFor(i) - 90);
      const [inner, outer] = [p.radius + 6, p.radius + 18];
      ticks.lineBetween(Math.cos(angle) * inner, Math.sin(angle) * inner, Math.cos(angle) * outer, Math.sin(angle) * outer);
    }
    scene.add.circle(p.x, p.y, p.radius, 0x4f7d86).setStrokeStyle(6, INK);
    const bar = scene.add.rectangle(0, 0, 14, p.radius * 2.3, 0xe5e0d1).setStrokeStyle(3, INK);
    const cross = scene.add.rectangle(0, 0, p.radius * 1.2, 12, 0xe5e0d1).setStrokeStyle(3, INK);
    const tip = scene.add.circle(0, -p.radius * 1.15, 8, 0xc4473a).setStrokeStyle(2, INK);
    this.handle = scene.add.container(p.x, p.y, [bar, cross, tip]);
  }

  private angleFor(position: number): number {
    return -this.sweep / 2 + (position * this.sweep) / Math.max(1, this.positions - 1);
  }

  show(value: number | boolean, animate: boolean): void {
    const angle = this.angleFor(Number(value));
    this.scene.tweens.killTweensOf(this.handle);
    if (animate) this.scene.tweens.add({ targets: this.handle, angle, duration: 420, ease: "Sine.easeInOut" });
    else this.handle.angle = angle;
  }
}

export class ButtonView implements ControlRenderer {
  private readonly cap: Phaser.GameObjects.Arc;

  constructor(private readonly scene: Phaser.Scene, p: Placement) {
    shadow(scene, p);
    scene.add.rectangle(p.x, p.y, p.radius * 2.6, p.radius * 2.6, STONE).setStrokeStyle(4, INK);
    this.cap = scene.add.circle(p.x, p.y, p.radius, 0xe39b3b).setStrokeStyle(5, INK);
  }

  show(): void {}

  press(): void {
    this.scene.tweens.killTweensOf(this.cap);
    this.cap.setScale(1);
    this.scene.tweens.add({ targets: this.cap, scale: 0.7, duration: 90, yoyo: true, hold: 120 });
  }
}

/** Water whose surface pattern is driven by the remote valve. */
export class PoolView {
  private readonly surface: Phaser.GameObjects.Graphics;
  private pattern = 0;
  private changedAt = -Infinity;

  constructor(private readonly scene: Phaser.Scene, private readonly p: Placement) {
    scene.add.circle(p.x, p.y, p.radius + 12, STONE).setStrokeStyle(4, INK);
    scene.add.circle(p.x, p.y, p.radius, 0x5f93a6);
    this.surface = scene.add.graphics({ x: p.x, y: p.y });
  }

  setPattern(pattern: number, animate: boolean): void {
    this.pattern = pattern;
    if (animate) this.changedAt = this.scene.time.now;
  }

  update(time: number): void {
    const { radius } = this.p;
    const g = this.surface;
    const t = time / 1000;
    // A brief churn makes every remote change noticeable, even between similar patterns.
    const churn = Math.max(0, 1 - (time - this.changedAt) / 900);
    g.clear();
    g.lineStyle(3 + churn * 3, 0xd8eef2, 0.75);
    if (this.pattern === 0) {
      // Still, concentric rings, slowly breathing.
      for (let i = 1; i <= 4; i += 1) {
        g.strokeCircle(0, 0, (radius * i) / 5 + Math.sin(t * 1.5 + i) * 2 + churn * 10 * Math.sin(t * 20));
      }
    } else if (this.pattern === 1) {
      // Parallel currents flowing from west to east.
      for (let row = -3; row <= 3; row += 1) {
        const y = (row * radius) / 4;
        const half = Math.sqrt(Math.max(0, radius * radius - y * y)) - 6;
        g.beginPath();
        for (let x = -half; x <= half; x += 6) {
          const wave = Math.sin(x / 14 - t * 4 + row) * (5 + churn * 8);
          if (x === -half) g.moveTo(x, y + wave);
          else g.lineTo(x, y + wave);
        }
        g.strokePath();
      }
    } else {
      // A turning three-armed whirlpool.
      for (let arm = 0; arm < 3; arm += 1) {
        g.beginPath();
        for (let r = 6; r < radius - 4; r += 4) {
          const angle = (arm * Math.PI * 2) / 3 + r / 22 - t * 2.2;
          const point = [Math.cos(angle) * r, Math.sin(angle) * r] as const;
          if (r === 6) g.moveTo(...point);
          else g.lineTo(...point);
        }
        g.strokePath();
      }
    }
  }
}

/** An oddly shaped dormant beacon that flares when the remote button is pressed. */
export class BeaconView {
  private readonly body: Phaser.GameObjects.Polygon;
  private readonly glow: Phaser.GameObjects.Arc;

  constructor(private readonly scene: Phaser.Scene, private readonly p: Placement) {
    shadow(scene, p, 1.2);
    this.glow = scene.add.circle(p.x, p.y, p.radius, LIGHT, 0);
    const r = p.radius;
    this.body = scene.add
      .polygon(p.x, p.y, [0, -r * 1.2, r * 0.9, -r * 0.2, r * 0.5, r, -r * 0.7, r * 0.8, -r, -r * 0.4], 0x56606a)
      // Origin 0 keeps the points centred on (x, y) rather than on their bounding box.
      .setOrigin(0, 0)
      .setStrokeStyle(5, INK);
  }

  pulse(): void {
    const { scene } = this;
    scene.tweens.killTweensOf([this.glow, this.body]);
    this.glow.setScale(0.8).setAlpha(0.95).setFillStyle(LIGHT, 1);
    scene.tweens.add({ targets: this.glow, scale: 4.5, alpha: 0, duration: 900, ease: "Cubic.easeOut" });
    this.body.setFillStyle(LIGHT);
    scene.time.delayedCall(700, () => this.body.setFillStyle(0x56606a));
    const rays = scene.add.graphics({ x: this.p.x, y: this.p.y });
    rays.lineStyle(6, LIGHT, 1);
    for (let i = 0; i < 8; i += 1) {
      const angle = (i * Math.PI) / 4;
      rays.lineBetween(Math.cos(angle) * 60, Math.sin(angle) * 60, Math.cos(angle) * 120, Math.sin(angle) * 120);
    }
    scene.tweens.add({ targets: rays, alpha: 0, scale: 1.6, duration: 650, onComplete: () => rays.destroy() });
  }

  rise(): void {
    this.scene.tweens.add({ targets: this.body, scale: 1.35, duration: 700, yoyo: true, hold: 900, ease: "Sine.easeInOut" });
  }
}

/** The red sculptural tower: its arm turns with the remote wheel; it glows with the remote lever. */
export class TowerView {
  private readonly arm: Phaser.GameObjects.Container;
  private readonly halo: Phaser.GameObjects.Arc;
  private readonly base: Phaser.GameObjects.Rectangle;
  private haloOn = false;
  /** Arm angle for each orientation; 0 points west, towards the other clearing. */
  static readonly ANGLES = [180, 300, 60];

  constructor(private readonly scene: Phaser.Scene, p: Placement) {
    shadow(scene, p, 1.5);
    this.halo = scene.add.circle(p.x, p.y, p.radius * 2.4, LIGHT, 0).setStrokeStyle(6, LIGHT, 0);
    this.base = scene.add.rectangle(p.x, p.y, p.radius * 1.7, p.radius * 1.7, TOWER_RED).setStrokeStyle(6, 0x6d2f27);
    const beam = scene.add.rectangle(p.radius * 1.5, 0, p.radius * 3, 20, 0xa3362c).setStrokeStyle(4, 0x6d2f27);
    const tip = scene.add.circle(p.radius * 3, 0, 15, TOWER_RED).setStrokeStyle(4, 0x6d2f27);
    const hub = scene.add.circle(0, 0, 16, 0x6d2f27);
    this.arm = scene.add.container(p.x, p.y, [beam, tip, hub]);
  }

  setOrientation(orientation: number, animate: boolean): void {
    const angle = TowerView.ANGLES[orientation] ?? 0;
    if (animate) rotateTo(this.scene, this.arm, angle, 1100);
    else this.arm.angle = angle;
  }

  setHalo(on: boolean): void {
    this.haloOn = on;
  }

  update(time: number): void {
    // The halo is shown by a pulsing outline and fill, not only by colour.
    const strength = this.haloOn ? 0.5 + 0.3 * Math.sin(time / 260) : 0;
    this.halo.setFillStyle(LIGHT, strength * 0.35);
    this.halo.setStrokeStyle(6, LIGHT, strength);
    this.halo.setScale(1 + (this.haloOn ? 0.05 * Math.sin(time / 400) : 0));
  }

  rise(): void {
    this.scene.tweens.add({ targets: [this.base, this.arm], scale: 1.35, duration: 700, yoyo: true, hold: 900, ease: "Sine.easeInOut" });
  }
}

/** Grass, rocks and a tree line facing the unseen other clearing. Deterministic. */
export function drawScenery(
  scene: Phaser.Scene,
  treeEdge: "east" | "west",
  avoid: readonly Placement[],
  seed: number,
): void {
  const { width, height } = scene.scale;
  const random = mulberry32(seed);
  scene.add.rectangle(width / 2, height / 2, width, height, 0x8fae7b);
  const grass = scene.add.graphics();
  for (let i = 0; i < 260; i += 1) {
    grass.fillStyle(random() > 0.5 ? 0x86a572 : 0x9bb886, 0.8);
    grass.fillEllipse(random() * width, random() * height, 10 + random() * 30, 6 + random() * 12);
  }
  const clear = (x: number, y: number, margin: number) =>
    avoid.every((p) => Phaser.Math.Distance.Between(x, y, p.x, p.y) > p.radius + margin);
  const rocks = scene.add.graphics();
  for (let i = 0; i < 18; i += 1) {
    const [x, y] = [40 + random() * (width - 80), 40 + random() * (height - 80)];
    if (!clear(x, y, 70)) continue;
    rocks.fillStyle(0x9b978c, 1);
    rocks.fillEllipse(x, y, 12 + random() * 22, 9 + random() * 14);
  }
  const trees = scene.add.graphics();
  const edgeX = treeEdge === "east" ? width - 40 : 40;
  for (let i = 0; i < 70; i += 1) {
    const dense = i < 40;
    const x = dense ? edgeX + (random() - 0.5) * 110 : random() * width;
    const y = dense ? random() * height : random() > 0.5 ? random() * 40 : height - random() * 40;
    const r = 18 + random() * 22;
    trees.fillStyle(0x3f6a3c, 1);
    trees.fillCircle(x, y, r);
    trees.fillStyle(0x4f7d48, 1);
    trees.fillCircle(x - r * 0.25, y - r * 0.25, r * 0.6);
  }
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
