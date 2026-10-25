import Phaser from "phaser";
import type { Action, ControlView, Effect, Observation } from "../shared/types";
import { cues, setHum, unlockAudio } from "./audio";
import { CLEARINGS, type ClearingLayout, type Placement } from "./layout";
import type { ClientSession, SessionUpdate } from "./session";
import {
  BeaconView,
  ButtonView,
  type ControlRenderer,
  drawScenery,
  LeverView,
  PoolView,
  TowerView,
  ValveView,
  WheelView,
} from "./views";

/** Forgiving reach, measured from the edge of a control. */
const INTERACT_RANGE = 70;
const AVATAR_SPEED = 200;
const AVATAR_RADIUS = 14;

/** Local tactile feedback for the operator's own controls. */
const CONTROL_CUES: Readonly<Record<string, () => void>> = {
  wheel: cues.click,
  lever: cues.clunk,
  valve: cues.gurgle,
};

export interface SceneData {
  session: ClientSession;
}

/** Emitted on `game.events` so the page can show an accessible hint. */
export const FOCUS_EVENT = "control-focus";

/**
 * Renders one clearing purely from the role's observation. It never sees
 * the authoritative state or the other role's controls.
 */
export class GameScene extends Phaser.Scene {
  private session!: ClientSession;
  private layout!: ClearingLayout;
  private observation!: Observation;
  private avatar!: Phaser.GameObjects.Container;
  private focusRing!: Phaser.GameObjects.Arc;
  private focused: string | null = null;
  private keys!: Record<"up" | "down" | "left" | "right" | "w" | "a" | "s" | "d", Phaser.Input.Keyboard.Key>;
  private readonly controls = new Map<string, ControlRenderer>();
  private pool?: PoolView;
  private beacon?: BeaconView;
  private tower?: TowerView;
  private finaleGlow?: Phaser.GameObjects.Graphics;
  private readonly seenEvents = new Set<number>();

  constructor() {
    super("GameScene");
  }

  init(data: SceneData): void {
    this.session = data.session;
    this.layout = CLEARINGS[data.session.role];
    this.controls.clear();
    this.seenEvents.clear();
    this.focused = null;
    this.pool = this.beacon = this.tower = undefined;
  }

  create(): void {
    const { layout } = this;
    const placements = [...Object.values(layout.controls), ...Object.values(layout.fixtures)];
    drawScenery(this, layout.treeEdge, placements, this.session.role === "A" ? 11 : 29);
    this.finaleGlow = this.add.graphics();

    this.observation = this.session.observation();
    this.createFixtures();
    this.createControls();

    this.focusRing = this.add.circle(0, 0, 10).setStrokeStyle(3, 0xfdf8e8, 0.9).setVisible(false);
    this.tweens.add({ targets: this.focusRing, alpha: 0.4, duration: 600, yoyo: true, repeat: -1 });

    const body = this.add.circle(0, 0, AVATAR_RADIUS, 0xf6ecd2).setStrokeStyle(3, 0x3b362f);
    const nose = this.add.circle(AVATAR_RADIUS - 3, 0, 4, 0x3b362f);
    this.avatar = this.add.container(layout.spawn.x, layout.spawn.y, [body, nose]);

    this.add
      .text(16, 12, layout.title, { fontFamily: "system-ui, sans-serif", fontSize: "16px", color: "#203024" })
      .setAlpha(0.7);

    const keyboard = this.input.keyboard!;
    this.keys = keyboard.addKeys({
      up: "UP", down: "DOWN", left: "LEFT", right: "RIGHT", w: "W", a: "A", s: "S", d: "D",
    }) as typeof this.keys;
    keyboard.addCapture("SPACE");
    keyboard.on("keydown-E", () => this.interact());
    keyboard.on("keydown-SPACE", () => this.interact());
    keyboard.on("keydown", unlockAudio);

    this.applyObservation(this.observation, false);
    const unsubscribe = this.session.subscribe((update) => this.onUpdate(update));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      unsubscribe();
      setHum(false);
      this.game.events.emit(FOCUS_EVENT, null);
    });
  }

  update(time: number, delta: number): void {
    this.moveAvatar(delta);
    this.updateFocus();
    this.pool?.update(time);
    this.tower?.update(time);
  }

  private createControls(): void {
    for (const [id, placement] of Object.entries(this.layout.controls)) {
      const view = this.observation.controls[id];
      if (!view) continue;
      const positions = view.kind === "detent" ? view.positions : 0;
      const renderer =
        id === "wheel" ? new WheelView(this, placement, positions)
        : id === "valve" ? new ValveView(this, placement, positions)
        : id === "lever" ? new LeverView(this, placement)
        : new ButtonView(this, placement);
      this.controls.set(id, renderer);
    }
  }

  private createFixtures(): void {
    const { fixtures } = this.layout;
    if (fixtures.pool) this.pool = new PoolView(this, fixtures.pool);
    if (fixtures.beacon) this.beacon = new BeaconView(this, fixtures.beacon);
    if (fixtures.tower) this.tower = new TowerView(this, fixtures.tower);
  }

  private onUpdate({ observation, effects }: SessionUpdate): void {
    this.applyObservation(observation, true);
    for (const effect of effects) this.playEffect(effect);
  }

  private applyObservation(next: Observation, animate: boolean): void {
    const previous = this.observation;
    this.observation = next;

    for (const [id, view] of Object.entries(next.controls)) {
      const value = controlValue(view);
      if (value === null) continue;
      const changed = !animate || value !== controlValue(previous.controls[id]);
      if (!changed) continue;
      this.controls.get(id)?.show(value, animate);
      if (animate) CONTROL_CUES[id]?.();
    }

    const pattern = next.fixtures.pool?.pattern;
    if (typeof pattern === "number" && (!animate || pattern !== previous.fixtures.pool?.pattern)) {
      this.pool?.setPattern(pattern, animate);
      if (animate) cues.swirl();
    }
    const tower = next.fixtures.tower;
    if (tower) {
      if (typeof tower.orientation === "number" && (!animate || tower.orientation !== previous.fixtures.tower?.orientation)) {
        this.tower?.setOrientation(tower.orientation, animate);
        if (animate) cues.creak();
      }
      this.tower?.setHalo(tower.halo === true);
      setHum(tower.halo === true);
    }
    this.drawFinaleGlow(next.finaleComplete);
  }

  private playEffect(effect: Effect): void {
    // Event IDs are stable, so a repeated delivery never replays an effect.
    if (this.seenEvents.has(effect.eventId)) return;
    this.seenEvents.add(effect.eventId);
    if (effect.kind === "pulse" && effect.fixture === "beacon") {
      this.beacon?.pulse();
      cues.pulse();
    } else if (effect.kind === "finale") {
      this.playFinale();
    }
  }

  private playFinale(): void {
    cues.harmonic();
    this.cameras.main.flash(900, 255, 241, 168);
    this.beacon?.rise();
    this.tower?.rise();
    for (const p of Object.values(this.layout.fixtures)) {
      for (let i = 0; i < 4; i += 1) {
        const ring = this.add.circle(p.x, p.y, p.radius, 0xfff1a8, 0).setStrokeStyle(8, 0xfff1a8, 0.9);
        this.tweens.add({
          targets: ring,
          scale: 12,
          alpha: 0,
          delay: i * 350,
          duration: 2400,
          ease: "Sine.easeOut",
          onComplete: () => ring.destroy(),
        });
      }
    }
  }

  private drawFinaleGlow(complete: boolean): void {
    const glow = this.finaleGlow;
    if (!glow) return;
    glow.clear();
    if (!complete) return;
    for (const p of Object.values(this.layout.fixtures)) {
      glow.lineStyle(4, 0xfff1a8, 0.8);
      glow.strokeCircle(p.x, p.y, p.radius * 1.6);
      glow.lineStyle(2, 0xfff1a8, 0.5);
      glow.strokeCircle(p.x, p.y, p.radius * 2);
    }
  }

  private moveAvatar(delta: number): void {
    const k = this.keys;
    const dx = Number(k.right.isDown || k.d.isDown) - Number(k.left.isDown || k.a.isDown);
    const dy = Number(k.down.isDown || k.s.isDown) - Number(k.up.isDown || k.w.isDown);
    if (dx === 0 && dy === 0) return;
    const length = Math.hypot(dx, dy);
    const step = (AVATAR_SPEED * delta) / 1000;
    const { width, height } = this.scale;
    let x = Phaser.Math.Clamp(this.avatar.x + (dx / length) * step, 40, width - 40);
    let y = Phaser.Math.Clamp(this.avatar.y + (dy / length) * step, 40, height - 40);
    for (const p of this.solids()) {
      const distance = Phaser.Math.Distance.Between(x, y, p.x, p.y);
      const minimum = p.radius + AVATAR_RADIUS + 4;
      if (distance < minimum && distance > 0) {
        x = p.x + ((x - p.x) / distance) * minimum;
        y = p.y + ((y - p.y) / distance) * minimum;
      }
    }
    this.avatar.setPosition(x, y);
    this.avatar.rotation = Math.atan2(dy, dx);
  }

  private *solids(): Generator<Placement> {
    for (const p of [...Object.values(this.layout.controls), ...Object.values(this.layout.fixtures)]) {
      if (p.solid) yield p;
    }
  }

  private updateFocus(): void {
    let nearest: string | null = null;
    let best = INTERACT_RANGE;
    for (const [id, p] of Object.entries(this.layout.controls)) {
      const gap = Phaser.Math.Distance.Between(this.avatar.x, this.avatar.y, p.x, p.y) - p.radius;
      if (gap < best) {
        best = gap;
        nearest = id;
      }
    }
    if (nearest === this.focused) return;
    this.focused = nearest;
    const placement = nearest ? this.layout.controls[nearest] : undefined;
    this.focusRing.setVisible(Boolean(placement));
    if (placement) this.focusRing.setPosition(placement.x, placement.y).setRadius(placement.radius + 20);
    this.game.events.emit(FOCUS_EVENT, placement?.label ?? null);
  }

  private interact(): void {
    unlockAudio();
    const id = this.focused;
    const view = id ? this.observation.controls[id] : undefined;
    if (!id || !view) return;
    const action: Action =
      view.kind === "detent" ? { type: "turn", controlId: id, direction: 1 }
      : view.kind === "toggle" ? { type: "toggle", controlId: id }
      : { type: "press", controlId: id };
    if (action.type === "press") {
      this.controls.get(id)?.press?.();
      cues.thunk();
    }
    this.session.act(action);
  }
}

function controlValue(view: ControlView | undefined): number | boolean | null {
  if (!view) return null;
  if (view.kind === "detent") return view.position;
  if (view.kind === "toggle") return view.on;
  return null;
}
