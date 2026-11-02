import Phaser from "phaser";
import type { Placement } from "./layout";

// Simple coloured geometry: contemporary installations in a grassy landscape.
const INK = 0x3b362f;
const BRASS = 0xd7a958;
const STONE = 0x8d8a7f;
const TOWER_RED = 0xc4473a;
const LIGHT = 0xfff1a8;
const ICE = 0xdff3f7;

function fade(scene: Phaser.Scene, target: Phaser.GameObjects.Graphics, alpha: number, animate: boolean): void {
  scene.tweens.killTweensOf(target);
  if (animate) scene.tweens.add({ targets: target, alpha, duration: 900, ease: "Sine.easeInOut" });
  else target.setAlpha(alpha);
}

function drawIce(scene: Phaser.Scene, p: Placement): Phaser.GameObjects.Graphics {
  const ice = scene.add.graphics({ x: p.x, y: p.y });
  ice.fillStyle(ICE, 0.82);
  ice.fillCircle(0, 0, p.radius);
  ice.lineStyle(2, 0x9fc3cc, 1);
  for (const [a, b] of [[-0.4, 0.9], [2.2, 1.6], [3.9, 0.7], [5.1, 1.2]] as const) {
    const [x1, y1] = [Math.cos(a) * p.radius * 0.95, Math.sin(a) * p.radius * 0.95];
    const [x2, y2] = [Math.cos(a + b) * p.radius * 0.3, Math.sin(a + b) * p.radius * 0.3];
    ice.lineBetween(x1, y1, x2, y2);
    ice.lineBetween(x2, y2, x2 * -0.4, y2 * 0.6);
  }
  ice.setAlpha(0);
  return ice;
}

const rotations = new WeakMap<Phaser.GameObjects.Container, Phaser.Tweens.Tween>();

/**
 * Rotates by the shortest path, so wrapping detents do not spin backwards.
 * Stops only the previous rotation: other tweens on the target, such as the
 * finale's rise, must run to their end or the target stays enlarged.
 */
function rotateTo(scene: Phaser.Scene, target: Phaser.GameObjects.Container, degrees: number, duration: number): void {
  rotations.get(target)?.stop();
  const delta = ((degrees - target.angle + 540) % 360) - 180;
  rotations.set(target, scene.tweens.add({ targets: target, angle: target.angle + delta, duration, ease: "Back.easeOut" }));
}

const risings = new WeakMap<Phaser.GameObjects.GameObject, Phaser.Tweens.Tween>();

/**
 * The finale's swell: up and back to normal size. A second finale soon after
 * a reset restarts from normal size, rather than settling back to a size
 * caught in the middle of the first.
 */
function rise(scene: Phaser.Scene, targets: readonly (Phaser.GameObjects.Components.Transform & Phaser.GameObjects.GameObject)[]): void {
  const [first] = targets;
  if (!first) return;
  risings.get(first)?.stop();
  for (const target of targets) target.setScale(1);
  risings.set(first, scene.tweens.add({ targets: [...targets], scale: 1.35, duration: 700, yoyo: true, hold: 900, ease: "Sine.easeInOut" }));
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

/** A low stone sundial whose gnomon turns a quarter at a time. */
export class SundialView implements ControlRenderer {
  private readonly gnomon: Phaser.GameObjects.Container;

  constructor(private readonly scene: Phaser.Scene, p: Placement, private readonly positions: number) {
    shadow(scene, p);
    scene.add.circle(p.x, p.y, p.radius, 0xcfc6b0).setStrokeStyle(5, INK);
    const marks = scene.add.graphics({ x: p.x, y: p.y });
    marks.lineStyle(3, INK, 0.7);
    for (let i = 0; i < 12; i += 1) {
      const angle = (i * Math.PI) / 6;
      const inner = i % 3 === 0 ? p.radius * 0.6 : p.radius * 0.78;
      marks.lineBetween(Math.cos(angle) * inner, Math.sin(angle) * inner, Math.cos(angle) * p.radius * 0.92, Math.sin(angle) * p.radius * 0.92);
    }
    const blade = scene.add.triangle(0, 0, 0, -6, p.radius * 0.95, 0, 0, 6, 0x6b5a45).setOrigin(0, 0).setStrokeStyle(2, INK);
    const cast = scene.add.triangle(4, 6, 0, -4, p.radius * 0.8, 0, 0, 4, 0x2c3a24, 0.3).setOrigin(0, 0);
    const pin = scene.add.circle(0, 0, 7, BRASS).setStrokeStyle(2, INK);
    this.gnomon = scene.add.container(p.x, p.y, [cast, blade, pin]);
  }

  show(value: number | boolean, animate: boolean): void {
    const angle = -90 + (Number(value) * 360) / this.positions;
    if (animate) rotateTo(this.scene, this.gnomon, angle, 600);
    else this.gnomon.angle = angle;
  }
}

/** A tall weathervane: an arrow on a post that swings a quarter at a time. */
export class WeathervaneView implements ControlRenderer {
  private readonly arrow: Phaser.GameObjects.Container;

  constructor(private readonly scene: Phaser.Scene, p: Placement, private readonly positions: number) {
    shadow(scene, p, 0.7);
    const compass = scene.add.graphics({ x: p.x, y: p.y });
    compass.lineStyle(4, INK, 0.8);
    compass.lineBetween(-p.radius, 0, p.radius, 0);
    compass.lineBetween(0, -p.radius, 0, p.radius);
    scene.add.circle(p.x, p.y, 12, 0x5d5f63).setStrokeStyle(3, INK);
    const shaft = scene.add.rectangle(0, 0, p.radius * 2.2, 6, 0x3b362f);
    const head = scene.add.triangle(p.radius * 1.1, 0, 0, -11, 18, 0, 0, 11, 0x3b362f).setOrigin(0, 0.5);
    // A flat fin, cut at the back, so the tail never reads as a second arrowhead.
    const r = p.radius;
    const tail = scene.add
      .polygon(0, 0, [-r * 1.25, -15, -r * 0.55, -6, -r * 0.55, 6, -r * 1.25, 15, -r * 1.05, 0], 0xc4473a)
      .setOrigin(0, 0)
      .setStrokeStyle(2, INK);
    const pivot = scene.add.circle(0, 0, 6, BRASS);
    this.arrow = scene.add.container(p.x, p.y, [shaft, head, tail, pivot]);
  }

  show(value: number | boolean, animate: boolean): void {
    const angle = (Number(value) * 360) / this.positions;
    if (!animate) {
      this.arrow.angle = angle;
      return;
    }
    // Overshoots and settles, as if caught by wind.
    const delta = ((angle - this.arrow.angle + 540) % 360) - 180;
    this.scene.tweens.killTweensOf(this.arrow);
    this.scene.tweens.add({ targets: this.arrow, angle: this.arrow.angle + delta, duration: 900, ease: "Elastic.easeOut" });
  }
}

/** Water whose surface pattern is driven by the remote valve. */
export class PoolView {
  private readonly surface: Phaser.GameObjects.Graphics;
  private readonly ice: Phaser.GameObjects.Graphics;
  private pattern = 0;
  private changedAt = -Infinity;
  /** While frozen, the surface stays as it was at this time. */
  private frozenAt: number | null = null;

  constructor(private readonly scene: Phaser.Scene, private readonly p: Placement) {
    scene.add.circle(p.x, p.y, p.radius + 12, STONE).setStrokeStyle(4, INK);
    scene.add.circle(p.x, p.y, p.radius, 0x5f93a6);
    this.surface = scene.add.graphics({ x: p.x, y: p.y });
    this.ice = drawIce(scene, p);
  }

  setPattern(pattern: number, animate: boolean): void {
    this.pattern = pattern;
    if (animate) this.changedAt = this.scene.time.now;
  }

  /** Ice is shown by a pale cracked sheet and a motionless surface, not only by colour. */
  setFrozen(frozen: boolean, animate: boolean): void {
    if (frozen === (this.frozenAt !== null)) return;
    this.frozenAt = frozen ? this.scene.time.now : null;
    fade(this.scene, this.ice, frozen ? 1 : 0, animate);
  }

  update(now: number): void {
    const time = this.frozenAt ?? now;
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
  private dimming?: Phaser.Time.TimerEvent;

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
    // Only the glow is restarted: the body may be in the middle of the finale's rise.
    scene.tweens.killTweensOf(this.glow);
    this.glow.setScale(0.8).setAlpha(0.95).setFillStyle(LIGHT, 1);
    scene.tweens.add({ targets: this.glow, scale: 4.5, alpha: 0, duration: 900, ease: "Cubic.easeOut" });
    this.body.setFillStyle(LIGHT);
    // A quick second press keeps the beacon lit for its full flash.
    this.dimming?.remove();
    this.dimming = scene.time.delayedCall(700, () => this.body.setFillStyle(0x56606a));
    const rays = scene.add.graphics({ x: this.p.x, y: this.p.y });
    rays.lineStyle(6, LIGHT, 1);
    for (let i = 0; i < 8; i += 1) {
      const angle = (i * Math.PI) / 4;
      rays.lineBetween(Math.cos(angle) * 60, Math.sin(angle) * 60, Math.cos(angle) * 120, Math.sin(angle) * 120);
    }
    scene.tweens.add({ targets: rays, alpha: 0, scale: 1.6, duration: 650, onComplete: () => rays.destroy() });
  }

  rise(): void {
    rise(this.scene, [this.body]);
  }
}

/** The red sculptural tower: its arm turns with the remote wheel; it glows with the remote lever. */
export class TowerView {
  private readonly arm: Phaser.GameObjects.Container;
  private readonly halo: Phaser.GameObjects.Arc;
  private readonly base: Phaser.GameObjects.Rectangle;
  private readonly frost: Phaser.GameObjects.Graphics;
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
    this.frost = scene.add.graphics();
    this.frost.fillStyle(ICE, 0.85);
    this.frost.lineStyle(3, 0xffffff, 0.9);
    // Snow caps on the arm and icicles along it: the arm is stuck.
    this.frost.fillCircle(p.radius * 3, 0, 12);
    this.frost.fillCircle(0, 0, 13);
    for (let x = p.radius * 0.6; x < p.radius * 2.9; x += 14) this.frost.fillTriangle(x - 5, 9, x + 5, 9, x, 24);
    this.frost.strokeRect(-6, -12, p.radius * 3, 24);
    this.frost.setAlpha(0);
    this.arm = scene.add.container(p.x, p.y, [beam, tip, hub, this.frost]);
  }

  setFrozen(frozen: boolean, animate: boolean): void {
    fade(this.scene, this.frost, frozen ? 1 : 0, animate);
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
    rise(this.scene, [this.base, this.arm]);
  }
}

interface SeasonLook {
  /** Wash over the grass. */
  readonly tint: number;
  readonly tintAlpha: number;
  /** Things lying on the ground, and things in the air: shape matters as well as colour. */
  readonly ground: { readonly color: number; readonly shape: "flower" | "leaf" | "drift" | "none" };
  readonly air: { readonly color: number; readonly shape: "petal" | "mote" | "leaf" | "flake"; readonly count: number; readonly fall: number };
}

/** Indexed by Season: spring, summer, autumn, winter. */
const SEASON_LOOKS: readonly SeasonLook[] = [
  { tint: 0xb9e39a, tintAlpha: 0.18, ground: { color: 0xf3c6d8, shape: "flower" }, air: { color: 0xf7d3e0, shape: "petal", count: 18, fall: 22 } },
  { tint: 0xf3e27a, tintAlpha: 0.16, ground: { color: 0xfff1a8, shape: "none" }, air: { color: 0xfff6c2, shape: "mote", count: 14, fall: 4 } },
  { tint: 0xd98a3d, tintAlpha: 0.3, ground: { color: 0xc8662f, shape: "leaf" }, air: { color: 0xd8742f, shape: "leaf", count: 22, fall: 40 } },
  { tint: 0xeef4f6, tintAlpha: 0.55, ground: { color: 0xffffff, shape: "drift" }, air: { color: 0xffffff, shape: "flake", count: 55, fall: 55 } },
];

/** The clearing's season: a wash over the grass, things on the ground and things in the air. */
export class SeasonView {
  private readonly wash: Phaser.GameObjects.Rectangle;
  private readonly ground: Phaser.GameObjects.Graphics;
  private readonly air: Phaser.GameObjects.Graphics;
  private season = 0;

  constructor(private readonly scene: Phaser.Scene, private readonly seed: number) {
    const { width, height } = scene.scale;
    this.wash = scene.add.rectangle(width / 2, height / 2, width, height, 0xffffff, 0);
    this.ground = scene.add.graphics();
    this.air = scene.add.graphics().setDepth(20);
  }

  set(season: number, animate: boolean): void {
    this.season = season;
    const look = SEASON_LOOKS[season] ?? SEASON_LOOKS[0]!;
    this.wash.setFillStyle(look.tint, look.tintAlpha);
    this.drawGround(look);
    if (animate) {
      // A gust: the whole clearing brightens and settles into the new season.
      const { width, height } = this.scene.scale;
      const gust = this.scene.add.rectangle(width / 2, height / 2, width, height, 0xffffff, 0.45).setDepth(21);
      this.scene.tweens.add({ targets: gust, alpha: 0, duration: 1200, ease: "Sine.easeOut", onComplete: () => gust.destroy() });
      for (const target of [this.wash, this.ground]) {
        target.setAlpha(0);
        this.scene.tweens.add({ targets: target, alpha: 1, duration: 1200 });
      }
    }
  }

  private drawGround(look: SeasonLook): void {
    const { width, height } = this.scene.scale;
    const random = mulberry32(this.seed + 7);
    const g = this.ground;
    g.clear();
    if (look.ground.shape === "none") return;
    for (let i = 0; i < 90; i += 1) {
      const [x, y] = [random() * width, random() * height];
      const size = 3 + random() * 4;
      g.fillStyle(look.ground.color, 0.85);
      if (look.ground.shape === "flower") {
        for (let k = 0; k < 4; k += 1) g.fillCircle(x + Math.cos((k * Math.PI) / 2) * size * 0.7, y + Math.sin((k * Math.PI) / 2) * size * 0.7, size * 0.55);
        g.fillStyle(0xf2d14b, 1);
        g.fillCircle(x, y, size * 0.35);
      } else if (look.ground.shape === "leaf") {
        g.fillEllipse(x, y, size * 2.4, size * 1.2);
      } else {
        g.fillEllipse(x, y, size * 9, size * 3.5);
      }
    }
  }

  update(time: number): void {
    const look = SEASON_LOOKS[this.season] ?? SEASON_LOOKS[0]!;
    drawAir(this.air, this.scene, look.air, time, this.seed);
  }
}

/** Deterministic falling particles: each one's path is a function of its index and the time. */
function drawAir(
  g: Phaser.GameObjects.Graphics,
  scene: Phaser.Scene,
  air: SeasonLook["air"],
  time: number,
  seed: number,
): void {
  const { width, height } = scene.scale;
  const t = time / 1000;
  const random = mulberry32(seed);
  g.clear();
  for (let i = 0; i < air.count; i += 1) {
    const [x0, y0, sway, speed] = [random() * width, random() * height, random() * 6, 0.6 + random() * 0.8];
    const y = (y0 + t * air.fall * speed) % height;
    const x = (((x0 + Math.sin(t * 0.8 + sway) * 18) % width) + width) % width;
    drawParticle(g, air.shape, air.color, x, y, t + sway, 0.8);
  }
}

function drawParticle(
  g: Phaser.GameObjects.Graphics,
  shape: SeasonLook["air"]["shape"] | "rain",
  color: number,
  x: number,
  y: number,
  phase: number,
  alpha: number,
): void {
  if (shape === "rain") {
    g.lineStyle(2, color, alpha);
    g.lineBetween(x, y, x - 3, y + 14);
    return;
  }
  g.fillStyle(color, alpha);
  if (shape === "flake") {
    g.fillCircle(x, y, 2.5);
  } else if (shape === "mote") {
    g.fillCircle(x, y, 1.5 + Math.abs(Math.sin(phase * 2)) * 1.5);
  } else {
    // Petals and leaves tumble: their width changes as they turn.
    const turn = Math.abs(Math.sin(phase * 3));
    g.fillEllipse(x, y, (shape === "leaf" ? 10 : 7) * (0.3 + turn), shape === "leaf" ? 6 : 5);
  }
}

/**
 * A flock flying from west to east across the clearing. Both clearings see the
 * same flock: the eastern one after a delay, as the birds fly on from the west.
 */
export function flyFlock(scene: Phaser.Scene, eventId: number, delay: number): void {
  const { width, height } = scene.scale;
  const random = mulberry32(eventId * 97);
  const y = height * (0.25 + random() * 0.4);
  const birds = scene.add.graphics().setDepth(25);
  const start = -60;
  const shape = { progress: 0 };
  scene.tweens.add({
    targets: shape,
    progress: 1,
    delay,
    duration: 5200,
    ease: "Linear",
    onUpdate: () => {
      const lead = start + shape.progress * (width + 320);
      birds.clear();
      for (let i = 0; i < 11; i += 1) {
        const rank = Math.ceil(i / 2);
        const side = i % 2 === 0 ? 1 : -1;
        const bx = lead - rank * 42;
        const by = y + side * rank * 30 + Math.sin(shape.progress * 30 + i) * 4;
        const flap = Math.sin(shape.progress * 60 + i * 0.7);
        // Shadow on the grass, then a body and two curved wings that beat.
        birds.fillStyle(0x2c3a24, 0.2);
        birds.fillEllipse(bx + 10, by + 34, 26, 8);
        birds.lineStyle(4, 0x2b2620, 0.95);
        for (const wing of [-1, 1]) {
          birds.beginPath();
          birds.moveTo(bx, by);
          birds.lineTo(bx - 8, by + wing * (8 + flap * 5));
          birds.lineTo(bx - 18, by + wing * (14 + flap * 10));
          birds.strokePath();
        }
        birds.fillStyle(0x2b2620, 1);
        birds.fillEllipse(bx - 2, by, 16, 6);
      }
    },
    onComplete: () => birds.destroy(),
  });
}

/**
 * A drift between clearings. Leaving: what lies in this clearing's air blows
 * away through the tree line. Arriving: something different blows in from it.
 */
export function blowDrift(
  scene: Phaser.Scene,
  eventId: number,
  direction: "leaving" | "arriving",
  treeEdge: "east" | "west",
  season: number,
): void {
  const { width, height } = scene.scale;
  const random = mulberry32(eventId * 131);
  const shape: SeasonLook["air"]["shape"] | "rain" =
    direction === "leaving" ? (season === 3 ? "flake" : "leaf") : season === 1 ? "rain" : "petal";
  const color = shape === "flake" ? 0xffffff : shape === "leaf" ? 0xd8742f : shape === "rain" ? 0xbfe3ef : 0xf7c9da;
  const edgeX = treeEdge === "east" ? width + 30 : -30;
  const particles = Array.from({ length: 70 }, () => ({
    x: random() * width,
    y: random() * height,
    delay: random() * 0.35,
    phase: random() * 6,
  }));
  const g = scene.add.graphics().setDepth(24);
  const state = { progress: 0 };
  scene.tweens.add({
    targets: state,
    progress: 1,
    duration: 3600,
    onUpdate: () => {
      g.clear();
      for (const p of particles) {
        const local = Phaser.Math.Clamp((state.progress - p.delay) / (1 - p.delay), 0, 1);
        const eased = Phaser.Math.Easing.Sine.InOut(local);
        // Leaving: from a spot in the clearing out to the tree line. Arriving: the reverse.
        const along = direction === "leaving" ? eased : 1 - eased;
        const x = Phaser.Math.Linear(p.x, edgeX, along);
        const y = p.y + Math.sin(local * 6 + p.phase) * 20 + (shape === "rain" ? local * 40 : 0);
        const alpha = direction === "leaving" ? 0.9 * (1 - local * 0.3) : 0.9 * Math.min(1, local * 3) * (1 - Math.max(0, local - 0.8) * 5);
        drawParticle(g, shape, color, x, y, p.phase + local * 4, Math.max(0, alpha));
      }
    },
    onComplete: () => g.destroy(),
  });
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
