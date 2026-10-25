/**
 * Tiny procedural sound palette. Every cue has a visual counterpart, so the
 * game stays legible when muted.
 */
let context: AudioContext | null = null;
/** Every sound passes through this node, so muting also silences sounds already playing. */
let master: GainNode | null = null;
let muted = false;
let unlocked = false;
let hum: { oscillator: OscillatorNode; gain: GainNode } | null = null;

function audio(): { ctx: AudioContext; output: GainNode } | null {
  if (!unlocked || typeof AudioContext === "undefined") return null;
  if (!context || !master) {
    context = new AudioContext();
    master = context.createGain();
    master.gain.value = muted ? 0 : 1;
    master.connect(context.destination);
  }
  if (context.state === "suspended") void context.resume();
  return { ctx: context, output: master };
}

interface Tone {
  frequency: number;
  endFrequency?: number;
  duration: number;
  type?: OscillatorType;
  volume?: number;
  delay?: number;
}

function tone({ frequency, endFrequency, duration, type = "sine", volume = 0.2, delay = 0 }: Tone): void {
  const sink = muted ? null : audio();
  if (!sink) return;
  const { ctx, output } = sink;
  const start = ctx.currentTime + delay;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(endFrequency, start + duration);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + Math.min(0.02, duration / 4));
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain).connect(output);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.05);
}

export const cues = {
  /** Wheel detent. */
  click: () => {
    tone({ frequency: 1400, duration: 0.04, type: "square", volume: 0.06 });
    tone({ frequency: 700, duration: 0.06, type: "square", volume: 0.05, delay: 0.03 });
  },
  /** Lever lock/unlock. */
  clunk: () => {
    tone({ frequency: 140, endFrequency: 70, duration: 0.18, type: "triangle", volume: 0.3 });
    tone({ frequency: 900, duration: 0.03, type: "square", volume: 0.04 });
  },
  /** Valve friction and water. */
  gurgle: () => {
    for (let i = 0; i < 4; i += 1) {
      tone({ frequency: 420 - i * 55, endFrequency: 260 - i * 30, duration: 0.09, volume: 0.12, delay: i * 0.07 });
    }
  },
  /** Button press. */
  thunk: () => tone({ frequency: 95, endFrequency: 50, duration: 0.16, volume: 0.35 }),
  /** Remote: the tower turns. */
  creak: () => tone({ frequency: 180, endFrequency: 95, duration: 0.6, type: "sawtooth", volume: 0.07 }),
  /** Remote: the pool changes its flow. */
  swirl: () => {
    tone({ frequency: 300, endFrequency: 600, duration: 0.5, volume: 0.08 });
    tone({ frequency: 450, endFrequency: 225, duration: 0.5, volume: 0.06, delay: 0.1 });
  },
  /** Remote: the beacon fires. */
  pulse: () => {
    tone({ frequency: 660, duration: 0.9, volume: 0.22 });
    tone({ frequency: 990, duration: 0.7, volume: 0.12, delay: 0.02 });
    tone({ frequency: 55, endFrequency: 40, duration: 0.5, volume: 0.3 });
  },
  /** Shared finale. */
  harmonic: () => {
    [220, 277.2, 329.6, 440, 554.4].forEach((frequency, i) => {
      tone({ frequency, endFrequency: frequency * 1.5, duration: 2.8, volume: 0.09, delay: i * 0.18 });
    });
  },
};

/** Continuous low hum while the tower's halo is on. It keeps running while muted. */
export function setHum(on: boolean): void {
  if (!on) {
    if (hum) {
      const { oscillator, gain } = hum;
      gain.gain.setTargetAtTime(0.0001, oscillator.context.currentTime, 0.15);
      oscillator.stop(oscillator.context.currentTime + 0.6);
      hum = null;
    }
    return;
  }
  const sink = audio();
  if (!sink || hum) return;
  const { ctx, output } = sink;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.frequency.value = 110;
  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.setTargetAtTime(0.05, ctx.currentTime, 0.3);
  oscillator.connect(gain).connect(output);
  oscillator.start();
  hum = { oscillator, gain };
}

/** Browsers only allow audio after a user gesture; call from an input handler. */
export function unlockAudio(): void {
  unlocked = true;
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(value: boolean): void {
  muted = value;
  if (context && master) master.gain.setTargetAtTime(muted ? 0 : 1, context.currentTime, 0.02);
}
