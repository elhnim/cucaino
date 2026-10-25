"use client";

// Cucaino Karts' own sounds, synthesised with WebAudio (no files to load): an engine that rises
// with speed, and little moments — a coin, an item, the rocket, a banana spin, the jump, drift
// sparks. Everything respects the app's mute switch (lib/audio/sound-manager.ts) and is a safe
// no-op where WebAudio isn't there. Create it from a tap (the Race! button) so the browser lets it
// play.
import { getMuted } from "@/lib/audio/sound-manager";

export type KartSound = "coin" | "itemGet" | "rocket" | "banana" | "shield" | "star" | "spin" | "pop" | "gotcha" | "jump" | "land" | "drift1" | "drift2" | "miniBoost" | "wall" | "boost";

export interface KartAudio {
  /** 0..1 how fast the kart is going; `boost` = boosting right now */
  setEngine(speedFrac: number, boost: boolean): void;
  play(kind: KartSound): void;
  /** fades the engine out (the race is over) */
  quiet(): void;
  dispose(): void;
}

const NOOP: KartAudio = { setEngine() {}, play() {}, quiet() {}, dispose() {} };

export function createKartAudio(): KartAudio {
  if (typeof window === "undefined") return NOOP;
  const AC: typeof AudioContext | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return NOOP;
  let ctx: AudioContext;
  try {
    ctx = new AC();
  } catch {
    return NOOP;
  }
  void ctx.resume?.().catch(() => {});
  const master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(ctx.destination);

  // ── the engine: two slightly detuned oscillators through a low-pass that opens up with speed ──
  const engGain = ctx.createGain();
  engGain.gain.value = 0;
  const engFilter = ctx.createBiquadFilter();
  engFilter.type = "lowpass";
  engFilter.frequency.value = 500;
  engFilter.Q.value = 2;
  const o1 = ctx.createOscillator();
  o1.type = "sawtooth";
  const o2 = ctx.createOscillator();
  o2.type = "square";
  const o2Gain = ctx.createGain();
  o2Gain.gain.value = 0.35;
  o1.connect(engFilter);
  o2.connect(o2Gain).connect(engFilter);
  engFilter.connect(engGain).connect(master);
  o1.frequency.value = 55;
  o2.frequency.value = 27.5;
  o1.start();
  o2.start();
  let disposed = false;
  let quiet = false;

  const tone = (freq: number, dur: number, opts: { type?: OscillatorType; vol?: number; to?: number; delay?: number } = {}) => {
    const t0 = ctx.currentTime + (opts.delay ?? 0);
    const o = ctx.createOscillator();
    o.type = opts.type ?? "sine";
    o.frequency.setValueAtTime(freq, t0);
    if (opts.to) o.frequency.exponentialRampToValueAtTime(Math.max(20, opts.to), t0 + dur);
    const g = ctx.createGain();
    const v = opts.vol ?? 0.16;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(v, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(master);
    o.start(t0);
    o.stop(t0 + dur + 0.03);
  };
  let noiseBuf: AudioBuffer | null = null;
  const noise = (dur: number, f0: number, f1: number, vol = 0.2, delay = 0) => {
    if (!noiseBuf) {
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const t0 = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.Q.value = 1.2;
    f.frequency.setValueAtTime(f0, t0);
    f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(master);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  };
  const notes = (freqs: number[], step: number, dur: number, type: OscillatorType = "triangle", vol = 0.15) => freqs.forEach((f, i) => tone(f, dur, { type, vol, delay: i * step }));

  return {
    setEngine(speedFrac, boost) {
      if (disposed) return;
      const s = Math.max(0, Math.min(1.4, speedFrac));
      const t = ctx.currentTime;
      const f = 52 + 118 * s + (boost ? 26 : 0);
      o1.frequency.setTargetAtTime(f, t, 0.08);
      o2.frequency.setTargetAtTime(f / 2, t, 0.08);
      engFilter.frequency.setTargetAtTime(380 + 1500 * s, t, 0.1);
      engGain.gain.setTargetAtTime(getMuted() || quiet ? 0 : 0.035 + 0.03 * Math.min(1, s), t, 0.12);
    },
    play(kind) {
      if (disposed || getMuted()) return;
      try {
        switch (kind) {
          case "coin":
            notes([1319, 1760], 0.06, 0.16, "square", 0.07);
            break;
          case "itemGet":
            notes([523, 659, 784, 1047, 1319], 0.07, 0.14);
            break;
          case "rocket":
            noise(0.9, 400, 3200, 0.22);
            tone(160, 0.8, { type: "sawtooth", to: 720, vol: 0.1 });
            break;
          case "boost":
          case "miniBoost":
            noise(0.4, 600, 2600, 0.14);
            tone(260, 0.35, { type: "sawtooth", to: 640, vol: 0.08 });
            break;
          case "banana":
            tone(520, 0.16, { to: 260, type: "triangle" });
            break;
          case "shield":
            notes([660, 880, 1320], 0.08, 0.3, "sine", 0.12);
            break;
          case "star":
            notes([784, 988, 1175, 1568, 1175, 1568, 1976, 2349], 0.075, 0.13, "square", 0.07);
            break;
          case "spin":
            for (let i = 0; i < 4; i++) tone(900 - i * 120, 0.22, { to: 420 - i * 60, type: "triangle", vol: 0.14, delay: i * 0.2 });
            break;
          case "pop":
            noise(0.12, 2400, 900, 0.22);
            tone(420, 0.2, { to: 1100, vol: 0.12 });
            break;
          case "gotcha":
            notes([784, 1047, 1319], 0.08, 0.16, "square", 0.08);
            break;
          case "jump":
            tone(320, 0.42, { to: 1050, type: "sine", vol: 0.16 });
            break;
          case "land":
            tone(150, 0.2, { to: 55, type: "sine", vol: 0.26 });
            noise(0.14, 500, 160, 0.14);
            break;
          case "drift1":
            tone(1250, 0.09, { type: "square", vol: 0.06 });
            break;
          case "drift2":
            notes([1500, 1900], 0.07, 0.09, "square", 0.07);
            break;
          case "wall":
            noise(0.16, 320, 110, 0.24);
            break;
        }
      } catch {
        // a sound that fails to start must never break the race
      }
    },
    quiet() {
      quiet = true;
      if (!disposed) engGain.gain.setTargetAtTime(0, ctx.currentTime, 0.25);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      try {
        o1.stop();
        o2.stop();
        void ctx.close();
      } catch {
        // already closed
      }
    },
  };
}
