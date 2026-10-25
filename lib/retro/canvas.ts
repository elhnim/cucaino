import type { Tune } from "./music";
// Browser implementations of the retro console: a pixel-perfect canvas Gfx with a built-in
// 5x7 pixel font, and a WebAudio chiptune synth for sound effects.
import { H, W, type Gfx, type Sfx, type SfxName, type Sprite } from "./engine";

// ── 5x7 pixel font (uppercase; lowercase is drawn as uppercase) ──
const FONT: Record<string, string> = {
  A: "01110 10001 10001 11111 10001 10001 10001",
  B: "11110 10001 10001 11110 10001 10001 11110",
  C: "01110 10001 10000 10000 10000 10001 01110",
  D: "11110 10001 10001 10001 10001 10001 11110",
  E: "11111 10000 10000 11110 10000 10000 11111",
  F: "11111 10000 10000 11110 10000 10000 10000",
  G: "01110 10001 10000 10111 10001 10001 01111",
  H: "10001 10001 10001 11111 10001 10001 10001",
  I: "01110 00100 00100 00100 00100 00100 01110",
  J: "00111 00010 00010 00010 00010 10010 01100",
  K: "10001 10010 10100 11000 10100 10010 10001",
  L: "10000 10000 10000 10000 10000 10000 11111",
  M: "10001 11011 10101 10101 10001 10001 10001",
  N: "10001 10001 11001 10101 10011 10001 10001",
  O: "01110 10001 10001 10001 10001 10001 01110",
  P: "11110 10001 10001 11110 10000 10000 10000",
  Q: "01110 10001 10001 10001 10101 10010 01101",
  R: "11110 10001 10001 11110 10100 10010 10001",
  S: "01111 10000 10000 01110 00001 00001 11110",
  T: "11111 00100 00100 00100 00100 00100 00100",
  U: "10001 10001 10001 10001 10001 10001 01110",
  V: "10001 10001 10001 10001 10001 01010 00100",
  W: "10001 10001 10001 10101 10101 10101 01010",
  X: "10001 10001 01010 00100 01010 10001 10001",
  Y: "10001 10001 01010 00100 00100 00100 00100",
  Z: "11111 00001 00010 00100 01000 10000 11111",
  "0": "01110 10001 10011 10101 11001 10001 01110",
  "1": "00100 01100 00100 00100 00100 00100 01110",
  "2": "01110 10001 00001 00010 00100 01000 11111",
  "3": "11111 00010 00100 00010 00001 10001 01110",
  "4": "00010 00110 01010 10010 11111 00010 00010",
  "5": "11111 10000 11110 00001 00001 10001 01110",
  "6": "00110 01000 10000 11110 10001 10001 01110",
  "7": "11111 00001 00010 00100 01000 01000 01000",
  "8": "01110 10001 10001 01110 10001 10001 01110",
  "9": "01110 10001 10001 01111 00001 00010 01100",
  "!": "00100 00100 00100 00100 00100 00000 00100",
  "?": "01110 10001 00001 00010 00100 00000 00100",
  ".": "00000 00000 00000 00000 00000 01100 01100",
  ",": "00000 00000 00000 00000 01100 00100 01000",
  ":": "00000 01100 01100 00000 01100 01100 00000",
  "-": "00000 00000 00000 11111 00000 00000 00000",
  "+": "00000 00100 00100 11111 00100 00100 00000",
  "/": "00001 00010 00010 00100 01000 01000 10000",
  "'": "00100 00100 01000 00000 00000 00000 00000",
  "<": "00010 00100 01000 10000 01000 00100 00010",
  ">": "01000 00100 00010 00001 00010 00100 01000",
  "(": "00010 00100 01000 01000 01000 00100 00010",
  ")": "01000 00100 00010 00010 00010 00100 01000",
  "=": "00000 00000 11111 00000 11111 00000 00000",
  "%": "11000 11001 00010 00100 01000 10011 00011",
  "#": "01010 01010 11111 01010 11111 01010 01010",
  "*": "00000 10101 01110 11111 01110 10101 00000",
  "♥": "00000 01010 11111 11111 01110 00100 00000",
  "★": "00100 00100 11111 01110 01110 11011 10001",
};
const GLYPHS: Record<string, number[][]> = {};
for (const [ch, rows] of Object.entries(FONT)) GLYPHS[ch] = rows.split(" ").map((r) => [...r].map(Number));

export const CHAR_W = 6;

export function canvasGfx(ctx: CanvasRenderingContext2D): Gfx {
  ctx.imageSmoothingEnabled = false;
  const spriteCache = new WeakMap<Sprite, HTMLCanvasElement>();
  const glyphCache = new Map<string, HTMLCanvasElement>();
  let camX = 0;
  let camY = 0;

  const spriteCanvas = (s: Sprite) => {
    let c = spriteCache.get(s);
    if (!c) {
      c = document.createElement("canvas");
      c.width = s.rows[0]?.length ?? 1;
      c.height = s.rows.length || 1;
      const g = c.getContext("2d")!;
      s.rows.forEach((row, y) => {
        for (let x = 0; x < row.length; x++) {
          const col = s.pal[row[x]];
          if (!col || row[x] === "." || row[x] === " ") continue;
          g.fillStyle = col;
          g.fillRect(x, y, 1, 1);
        }
      });
      spriteCache.set(s, c);
    }
    return c;
  };
  const glyph = (ch: string, color: string) => {
    const key = ch + color;
    let c = glyphCache.get(key);
    if (!c) {
      c = document.createElement("canvas");
      c.width = 5;
      c.height = 7;
      const g = c.getContext("2d")!;
      g.fillStyle = color;
      (GLYPHS[ch] ?? []).forEach((row, y) => row.forEach((on, x) => on && g.fillRect(x, y, 1, 1)));
      glyphCache.set(key, c);
    }
    return c;
  };
  const r = Math.round;

  return {
    clear(color) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, W, H);
      camX = camY = 0;
    },
    rect(x, y, w, h, color) {
      ctx.fillStyle = color;
      ctx.fillRect(r(x - camX), r(y - camY), r(w), r(h));
    },
    box(x, y, w, h, color) {
      ctx.fillStyle = color;
      const X = r(x - camX);
      const Y = r(y - camY);
      ctx.fillRect(X, Y, r(w), 1);
      ctx.fillRect(X, Y + r(h) - 1, r(w), 1);
      ctx.fillRect(X, Y, 1, r(h));
      ctx.fillRect(X + r(w) - 1, Y, 1, r(h));
    },
    circle(x, y, rad, color) {
      ctx.fillStyle = color;
      const cx = r(x - camX);
      const cy = r(y - camY);
      const R = Math.max(0, r(rad));
      for (let dy = -R; dy <= R; dy++) {
        const dx = Math.floor(Math.sqrt(R * R - dy * dy));
        ctx.fillRect(cx - dx, cy + dy, dx * 2 + 1, 1);
      }
    },
    line(x1, y1, x2, y2, color) {
      ctx.fillStyle = color;
      let ax = r(x1 - camX);
      let ay = r(y1 - camY);
      const bx = r(x2 - camX);
      const by = r(y2 - camY);
      const dx = Math.abs(bx - ax);
      const dy = -Math.abs(by - ay);
      const sx = ax < bx ? 1 : -1;
      const sy = ay < by ? 1 : -1;
      let err = dx + dy;
      for (let i = 0; i < 2000; i++) {
        ctx.fillRect(ax, ay, 1, 1);
        if (ax === bx && ay === by) break;
        const e2 = 2 * err;
        if (e2 >= dy) {
          err += dy;
          ax += sx;
        }
        if (e2 <= dx) {
          err += dx;
          ay += sy;
        }
      }
    },
    sprite(s, x, y, opts) {
      const c = spriteCanvas(s);
      const sc = opts?.scale ?? 1;
      const X = r(x - camX);
      const Y = r(y - camY);
      if (opts?.flipX || opts?.flipY) {
        ctx.save();
        ctx.translate(X + (opts.flipX ? c.width * sc : 0), Y + (opts.flipY ? c.height * sc : 0));
        ctx.scale(opts.flipX ? -1 : 1, opts.flipY ? -1 : 1);
        ctx.drawImage(c, 0, 0, c.width * sc, c.height * sc);
        ctx.restore();
      } else ctx.drawImage(c, X, Y, c.width * sc, c.height * sc);
    },
    text(str, x, y, color, opts) {
      const s = opts?.size ?? 1;
      const up = str.toUpperCase();
      const width = up.length * CHAR_W * s - s;
      let X = r(x);
      if (opts?.align === "center") X = r(x - width / 2);
      else if (opts?.align === "right") X = r(x - width);
      for (const ch of up) {
        if (ch !== " ") ctx.drawImage(glyph(ch, color), X, r(y), 5 * s, 7 * s);
        X += CHAR_W * s;
      }
    },
    camera(x, y) {
      camX = x;
      camY = y;
    },
    alpha(a) {
      ctx.globalAlpha = a;
    },
  };
}

// ── chiptune sound effects ──
// One small "console" sound chip: everything (effects and music) goes through a master bus with
// a soft compressor (so a busy moment never clips) and a short slap-back echo send (the warm
// cartridge-in-a-room sound), using NES-style pulse waves (thin 12.5% / 25% duty) as well as
// square/triangle/saw and a noise channel. Effects are layered (an explosion is a noise crash
// AND a falling sine boom) so they feel big without being loud.
export function webAudioSfx(isMuted: () => boolean): Sfx & { resume(): void; close(): void; music(t: Tune | null): void } {
  let ac: AudioContext | null = null;
  let noiseBuf: AudioBuffer | null = null;
  let master: GainNode | null = null;
  let echo: GainNode | null = null;
  let pulse25: PeriodicWave | null = null;
  let pulse12: PeriodicWave | null = null;
  /** a pulse wave of the given duty cycle (the NES's thin, buzzy square), from its Fourier series */
  const pulse = (a: AudioContext, duty: number) => {
    const N = 32;
    const re = new Float32Array(N);
    const im = new Float32Array(N);
    for (let n = 1; n < N; n++) im[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * duty);
    return a.createPeriodicWave(re, im);
  };
  const get = () => {
    if (!ac) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      const a = new AC();
      ac = a;
      noiseBuf = a.createBuffer(1, a.sampleRate * 1, a.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const comp = a.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.ratio.value = 4;
      comp.attack.value = 0.004;
      comp.release.value = 0.18;
      comp.connect(a.destination);
      master = a.createGain();
      master.gain.value = 0.95;
      master.connect(comp);
      // the echo: a short delay, a little feedback, darkened, sent quietly back into the master
      echo = a.createGain();
      echo.gain.value = 0.16;
      const dl = a.createDelay(0.5);
      dl.delayTime.value = 0.13;
      const fb = a.createGain();
      fb.gain.value = 0.28;
      const lp = a.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 2600;
      echo.connect(dl);
      dl.connect(lp);
      lp.connect(fb);
      fb.connect(dl);
      lp.connect(comp);
      pulse25 = pulse(a, 0.25);
      pulse12 = pulse(a, 0.125);
    }
    return ac;
  };
  let lastAt: Partial<Record<SfxName, number>> = {};

  type Wave = OscillatorType | "pulse25" | "pulse12";
  const setWave = (o: OscillatorNode, w: Wave) => {
    if (w === "pulse25" && pulse25) o.setPeriodicWave(pulse25);
    else if (w === "pulse12" && pulse12) o.setPeriodicWave(pulse12);
    else o.type = w === "pulse25" || w === "pulse12" ? "square" : w;
  };
  /** one note: `slideTo` glides the pitch, `vib` adds vibrato (Hz depth), `wet` sends to the echo */
  const tone = (freq: number, dur: number, wave: Wave = "square", vol = 0.08, slideTo?: number, delay = 0, vib = 0, wet = 0.5) => {
    const a = get();
    if (!a || !master || isMuted()) return;
    const t = a.currentTime + delay;
    const o = a.createOscillator();
    const g = a.createGain();
    setWave(o, wave);
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    if (vib > 0) {
      const lfo = a.createOscillator();
      const lg = a.createGain();
      lfo.frequency.value = 7;
      lg.gain.value = vib;
      lfo.connect(lg).connect(o.frequency);
      lfo.start(t);
      lfo.stop(t + dur + 0.02);
    }
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(master);
    if (echo && wet > 0) {
      const s = a.createGain();
      s.gain.value = wet;
      g.connect(s).connect(echo);
    }
    o.start(t);
    o.stop(t + dur + 0.03);
  };
  /** filtered noise: `type` lowpass (rumble, crash), bandpass (swish, snare), highpass (hiss) */
  const burst = (dur: number, vol = 0.12, from = 1800, to = 200, delay = 0, type: BiquadFilterType = "lowpass", q = 0.8) => {
    const a = get();
    if (!a || !noiseBuf || !master || isMuted()) return;
    const t = a.currentTime + delay;
    const src = a.createBufferSource();
    src.buffer = noiseBuf;
    src.playbackRate.value = 0.7 + Math.random() * 0.6;
    const f = a.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(Math.max(30, from), t);
    f.frequency.exponentialRampToValueAtTime(Math.max(30, to), t + dur);
    const g = a.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(master);
    if (echo) g.connect(echo);
    src.start(t, Math.random() * 0.4);
    src.stop(t + dur + 0.02);
  };
  const arp = (notes: number[], step: number, dur: number, wave: Wave, vol: number, delay = 0) => notes.forEach((f, i) => tone(f, dur, wave, vol, undefined, delay + i * step));

  // ── background music (lib/retro/music.ts composes it; this plays it) ──
  let musicGain: GainNode | null = null;
  let tune: Tune | null = null;
  let timer: number | null = null;
  let step = 0;
  let nextAt = 0;
  const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
  const note = (a: AudioContext, out: GainNode, wave: Wave, midi: number, t: number, dur: number, vol: number, vib = 0) => {
    const o = a.createOscillator();
    setWave(o, wave);
    o.frequency.setValueAtTime(mtof(midi), t);
    if (vib > 0 && dur > 0.22) {
      // long lead notes get a delayed vibrato, like a real chip tune
      const lfo = a.createOscillator();
      const lg = a.createGain();
      lfo.frequency.value = 5.5;
      lg.gain.setValueAtTime(0, t);
      lg.gain.linearRampToValueAtTime(mtof(midi) * vib, t + dur * 0.6);
      lfo.connect(lg).connect(o.frequency);
      lfo.start(t);
      lfo.stop(t + dur + 0.02);
    }
    const g = a.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.008);
    g.gain.setValueAtTime(vol, t + Math.max(0.01, dur * 0.7));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.02);
    return g;
  };
  const drum = (a: AudioContext, out: GainNode, hit: "kick" | "snare" | "hat", t: number) => {
    if (hit === "kick") {
      const o = a.createOscillator();
      const g = a.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(160, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.13);
      g.gain.setValueAtTime(0.55, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 0.18);
      return;
    }
    if (!noiseBuf) return;
    const src = a.createBufferSource();
    src.buffer = noiseBuf;
    const f = a.createBiquadFilter();
    f.type = hit === "hat" ? "highpass" : "bandpass";
    f.frequency.setValueAtTime(hit === "hat" ? 7500 : 1700, t);
    const g = a.createGain();
    const dur = hit === "hat" ? 0.035 : 0.13;
    g.gain.setValueAtTime(hit === "hat" ? 0.11 : 0.32, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(out);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.01);
    if (hit === "snare") {
      // a snare has a body too: a short pitched thump under the rattle
      const o = a.createOscillator();
      const og = a.createGain();
      o.type = "triangle";
      o.frequency.setValueAtTime(220, t);
      o.frequency.exponentialRampToValueAtTime(120, t + 0.06);
      og.gain.setValueAtTime(0.18, t);
      og.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
      o.connect(og).connect(out);
      o.start(t);
      o.stop(t + 0.08);
    }
  };
  /** schedule every note starting in the next ~150 ms (called every 40 ms: steady timing even if a frame stutters) */
  const schedule = () => {
    const a = ac;
    if (!a || !tune || !musicGain) return;
    const sd = 60 / tune.bpm / 4;
    if (nextAt < a.currentTime - 0.2) nextAt = a.currentTime + 0.05; // (after a long stall: don't rush to catch up)
    while (nextAt < a.currentTime + 0.15) {
      const s = step % tune.steps;
      if (!isMuted()) {
        for (const n of tune.lead) if (n.at === s) {
          const g = note(a, musicGain, "pulse25", n.midi, nextAt, n.len * sd * 0.9, 0.05, 0.012);
          if (echo) {
            const send = a.createGain();
            send.gain.value = 0.55;
            g.connect(send).connect(echo);
          }
        }
        for (const n of tune.arp) if (n.at === s) note(a, musicGain, "pulse12", n.midi, nextAt, sd * 0.8, 0.02);
        for (const n of tune.bass) if (n.at === s) note(a, musicGain, "triangle", n.midi, nextAt, n.len * sd * 0.92, 0.17);
        for (const d of tune.drums) if (d.at === s) drum(a, musicGain, d.hit, nextAt);
      }
      step++;
      nextAt += sd;
    }
  };

  return {
    resume() {
      const a = get();
      if (a?.state === "suspended") void a.resume();
    },
    close() {
      if (timer !== null) window.clearInterval(timer);
      timer = null;
      tune = null;
      void ac?.close();
      ac = null;
      master = null;
      echo = null;
      musicGain = null;
      lastAt = {};
    },
    music(t) {
      if (t === tune) return;
      if (timer !== null) window.clearInterval(timer);
      timer = null;
      const a = get();
      if (musicGain && a) {
        // fade the old tune out rather than cutting it dead
        const old = musicGain;
        old.gain.setTargetAtTime(0.0001, a.currentTime, 0.06);
        window.setTimeout(() => old.disconnect(), 400);
      }
      musicGain = null;
      tune = t;
      if (!t || !a || !master) return;
      musicGain = a.createGain();
      musicGain.gain.value = 0.5;
      musicGain.connect(master);
      step = 0;
      nextAt = a.currentTime + 0.08;
      schedule();
      timer = window.setInterval(schedule, 40);
    },
    tone: (f, d, w, v) => tone(f, d, w, v),
    slide: (f, to, d, w, v) => tone(f, d, w, v, to),
    noise: (d, v, from, to) => burst(d, v, from, to),
    play(name) {
      // don't machine-gun the same sound more than ~25x a second
      const now = performance.now();
      if ((lastAt[name] ?? 0) > now - 40) return;
      lastAt[name] = now;
      switch (name) {
        case "jump":
          tone(240, 0.17, "pulse25", 0.07, 680);
          return tone(480, 0.12, "pulse12", 0.025, 1300, 0.01);
        case "shoot":
          tone(980, 0.08, "pulse12", 0.055, 260);
          return burst(0.03, 0.05, 6000, 3000, 0, "highpass");
        case "laser":
          tone(1500, 0.14, "sawtooth", 0.035, 180, 0, 0, 0.7);
          return tone(1800, 0.12, "pulse25", 0.025, 300);
        case "hit":
          burst(0.1, 0.11, 2600, 500, 0, "bandpass", 1.2);
          return tone(220, 0.08, "square", 0.05, 90);
        case "explode":
          burst(0.6, 0.18, 1600, 50);
          tone(120, 0.5, "sine", 0.22, 32);
          return burst(0.25, 0.08, 4000, 800, 0.05, "bandpass");
        case "coin":
          tone(988, 0.07, "pulse25", 0.06, undefined, 0, 0, 0.3);
          return tone(1319, 0.28, "pulse25", 0.06, undefined, 0.07, 0, 0.6);
        case "powerup":
          arp([523, 659, 784, 1047, 1319, 1568], 0.045, 0.09, "pulse25", 0.05);
          return arp([262, 330, 392, 523], 0.07, 0.12, "triangle", 0.06);
        case "die":
          arp([660, 622, 587, 554, 523, 494, 466, 440], 0.07, 0.1, "pulse25", 0.06);
          return tone(330, 0.75, "triangle", 0.12, 55, 0.5);
        case "win":
          arp([523, 659, 784, 1047, 784, 1047, 1319], 0.1, 0.16, "pulse25", 0.06);
          arp([262, 330, 392, 523, 392, 523, 659], 0.1, 0.16, "triangle", 0.1);
          return burst(0.5, 0.04, 9000, 6000, 0.7, "highpass");
        case "bounce":
          return tone(440, 0.08, "triangle", 0.11, 250);
        case "step":
          tone(130, 0.04, "triangle", 0.06, 90, 0, 0, 0);
          return burst(0.025, 0.03, 3000, 1500, 0, "bandpass");
        case "pop":
          return tone(500, 0.07, "sine", 0.12, 1400, 0, 0, 0.3);
        case "zap":
          return tone(2200, 0.1, "pulse12", 0.05, 90);
        case "whoosh":
          return burst(0.28, 0.08, 300, 3500, 0, "bandpass", 1.6);
        case "splash":
          burst(0.4, 0.12, 2400, 300);
          tone(700, 0.06, "sine", 0.05, 1400, 0.08);
          return tone(900, 0.06, "sine", 0.04, 1800, 0.16);
        case "thud":
          tone(110, 0.16, "sine", 0.2, 40, 0, 0, 0.2);
          return burst(0.08, 0.08, 900, 200);
        case "pickup":
          return arp([880, 1320, 1760], 0.04, 0.08, "pulse25", 0.05);
        case "hurt":
          tone(330, 0.22, "square", 0.06, 150, 0, 20);
          return burst(0.08, 0.06, 2000, 600, 0, "bandpass");
        case "select":
          return tone(1047, 0.06, "pulse12", 0.05, undefined, 0, 0, 0.3);
        case "kick":
          tone(150, 0.12, "sine", 0.22, 50, 0, 0, 0);
          return burst(0.05, 0.08, 3000, 800, 0, "bandpass");
        case "cheer":
          burst(1.1, 0.07, 1400, 900, 0, "bandpass", 0.6);
          return arp([784, 988, 1175, 1568], 0.08, 0.12, "pulse25", 0.04, 0.1);
        case "blip":
        default:
          return tone(660, 0.05, "pulse25", 0.05, undefined, 0, 0, 0.2);
      }
    },
  };
}
