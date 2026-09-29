// Cucaino Park's dreamy soundscape, generated live with WebAudio (nothing to download, never
// the same twice): a soft drifting pad of slow chords, twinkly bell chimes through a gentle
// echo, birdsong by day, crickets at twilight, and ocean waves that swell as you near the
// beach. `setScene` blends it all from what the world is doing; mute follows the app setting.
import { getMuted } from "@/lib/audio/sound-manager";

export interface AmbienceScene {
  /** 0 = day, 1 = glowing twilight */
  glow: number;
  /** 0..1 how close to the sea */
  shore: number;
  /** 0..1 how deep in the Glow Forest */
  forest: number;
  /** a ride or game is covering the park: duck everything */
  quiet?: boolean;
}

// dreamy chord loop (Cmaj9 - Am9 - Fmaj7#11 - Gsus), as frequencies
const CHORDS = [
  [130.81, 196.0, 246.94, 293.66, 329.63],
  [110.0, 164.81, 196.0, 246.94, 261.63],
  [87.31, 130.81, 174.61, 220.0, 246.94],
  [98.0, 146.83, 196.0, 261.63, 293.66],
];
const PENTA = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.51];

export class Ambience {
  private ac: AudioContext | null = null;
  private master: GainNode | null = null;
  private padGain: GainNode | null = null;
  private padFilter: BiquadFilterNode | null = null;
  private voices: { osc: OscillatorNode; gain: GainNode }[] = [];
  private echo: DelayNode | null = null;
  private echoGain: GainNode | null = null;
  private seaGain: GainNode | null = null;
  private seaFilter: BiquadFilterNode | null = null;
  private noise: AudioBuffer | null = null;
  private scene: AmbienceScene = { glow: 0, shore: 0, forest: 0 };
  private chord = 0;
  private timers: number[] = [];
  private started = false;

  /** Call from a user gesture (tap) — browsers only allow audio to start after one. */
  start() {
    if (this.started) {
      void this.ac?.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.started = true;
    const ac = (this.ac = new AC());
    this.master = ac.createGain();
    this.master.gain.value = 0;
    this.master.connect(ac.destination);

    // gentle echo for chimes (the "dreamy" part)
    this.echo = ac.createDelay(1.5);
    this.echo.delayTime.value = 0.42;
    const fb = ac.createGain();
    fb.gain.value = 0.42;
    const tone = ac.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = 2600;
    this.echo.connect(tone).connect(fb).connect(this.echo);
    this.echoGain = ac.createGain();
    this.echoGain.gain.value = 0.55;
    this.echo.connect(this.echoGain).connect(this.master);

    // pad: five soft voices through a slowly breathing low-pass
    this.padFilter = ac.createBiquadFilter();
    this.padFilter.type = "lowpass";
    this.padFilter.frequency.value = 900;
    this.padFilter.Q.value = 0.6;
    this.padGain = ac.createGain();
    this.padGain.gain.value = 0.05;
    this.padFilter.connect(this.padGain).connect(this.master);
    const lfo = ac.createOscillator();
    const lfoAmt = ac.createGain();
    lfo.frequency.value = 0.07;
    lfoAmt.gain.value = 350;
    lfo.connect(lfoAmt).connect(this.padFilter.frequency);
    lfo.start();
    for (let i = 0; i < 5; i++) {
      const osc = ac.createOscillator();
      osc.type = i % 2 ? "triangle" : "sine";
      osc.detune.value = (i - 2) * 4;
      const g = ac.createGain();
      g.gain.value = 0.16;
      osc.connect(g).connect(this.padFilter);
      osc.start();
      this.voices.push({ osc, gain: g });
    }
    this.setChord(0, 0.01);

    // the sea: looping noise through a moving filter
    this.noise = ac.createBuffer(1, ac.sampleRate * 3, ac.sampleRate);
    const d = this.noise.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      last = last * 0.97 + (Math.random() * 2 - 1) * 0.03; // brownish
      d[i] = last * 6;
    }
    const sea = ac.createBufferSource();
    sea.buffer = this.noise;
    sea.loop = true;
    this.seaFilter = ac.createBiquadFilter();
    this.seaFilter.type = "lowpass";
    this.seaFilter.frequency.value = 500;
    this.seaGain = ac.createGain();
    this.seaGain.gain.value = 0;
    sea.connect(this.seaFilter).connect(this.seaGain).connect(this.master);
    sea.start();
    const swell = ac.createOscillator();
    const swellAmt = ac.createGain();
    swell.frequency.value = 0.11;
    swellAmt.gain.value = 320;
    swell.connect(swellAmt).connect(this.seaFilter.frequency);
    swell.start();

    this.master.gain.setTargetAtTime(this.targetVolume(), ac.currentTime, 2);
    this.loop(() => this.nextChord(), 9000);
    this.loop(() => this.chimeMaybe(), 1300);
    this.loop(() => this.critterMaybe(), 700);
    this.loop(() => this.master && this.ac && this.master.gain.setTargetAtTime(this.targetVolume(), this.ac.currentTime, 0.8), 1000);
  }

  setScene(s: AmbienceScene) {
    this.scene = s;
    const ac = this.ac;
    if (!ac || !this.padGain || !this.seaGain || !this.padFilter) return;
    const t = ac.currentTime;
    // twilight is slower, darker and a touch louder; the sea swells near the shore
    this.padGain.gain.setTargetAtTime(s.quiet ? 0.012 : 0.045 + s.glow * 0.025, t, 1.2);
    this.seaGain.gain.setTargetAtTime(s.quiet ? 0 : 0.02 + s.shore * 0.22, t, 1.5);
  }

  /** a sparkly twinkle, e.g. when you brush past a glowing flower */
  twinkle() {
    this.bell(PENTA[Math.floor(Math.random() * PENTA.length)] * 2, 0.05, 0.9);
  }

  stop() {
    for (const id of this.timers) window.clearInterval(id);
    this.timers = [];
    void this.ac?.close();
    this.ac = null;
    this.started = false;
    this.voices = [];
  }

  private targetVolume() {
    return getMuted() ? 0 : 0.85;
  }

  private loop(fn: () => void, ms: number) {
    this.timers.push(window.setInterval(fn, ms));
  }

  private setChord(i: number, glide = 2.5) {
    const ac = this.ac;
    if (!ac) return;
    const notes = CHORDS[i % CHORDS.length];
    this.voices.forEach((v, k) => v.osc.frequency.setTargetAtTime(notes[k % notes.length], ac.currentTime, glide));
  }

  private nextChord() {
    this.chord = (this.chord + 1) % CHORDS.length;
    this.setChord(this.chord);
  }

  private bell(freq: number, vol: number, dur: number) {
    const ac = this.ac;
    if (!ac || !this.master || !this.echo || getMuted()) return;
    const t = ac.currentTime;
    const o = ac.createOscillator();
    const o2 = ac.createOscillator();
    const g = ac.createGain();
    o.type = "sine";
    o2.type = "sine";
    o.frequency.value = freq;
    o2.frequency.value = freq * 2.01; // bell-ish shimmer
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const g2 = ac.createGain();
    g2.gain.value = 0.3;
    o.connect(g);
    o2.connect(g2).connect(g);
    g.connect(this.master);
    g.connect(this.echo);
    o.start(t);
    o2.start(t);
    o.stop(t + dur + 0.05);
    o2.stop(t + dur + 0.05);
  }

  private chimeMaybe() {
    if (this.scene.quiet) return;
    // chimes are rarer by day, more in the Glow Forest and at twilight
    const p = 0.12 + this.scene.glow * 0.3 + this.scene.forest * 0.35;
    if (Math.random() > p) return;
    const n = PENTA[Math.floor(Math.random() * PENTA.length)];
    this.bell(n, 0.035 + this.scene.forest * 0.02, 1.8);
    if (Math.random() < 0.35) window.setTimeout(() => this.bell(n * 1.5, 0.025, 1.4), 180);
  }

  private critterMaybe() {
    const ac = this.ac;
    if (!ac || !this.master || this.scene.quiet || getMuted()) return;
    const t = ac.currentTime;
    if (this.scene.glow < 0.5) {
      // birdsong: quick sweeping chirps
      if (Math.random() > 0.18 * (1 - this.scene.glow * 1.6)) return;
      const base = 2200 + Math.random() * 1600;
      const n = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) {
        const o = ac.createOscillator();
        const g = ac.createGain();
        const st = t + i * 0.11;
        o.frequency.setValueAtTime(base, st);
        o.frequency.exponentialRampToValueAtTime(base * (1.3 + Math.random() * 0.4), st + 0.07);
        g.gain.setValueAtTime(0.0001, st);
        g.gain.exponentialRampToValueAtTime(0.018, st + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, st + 0.09);
        o.connect(g).connect(this.master);
        o.start(st);
        o.stop(st + 0.1);
      }
    } else if (this.noise) {
      // crickets: soft high pulses
      if (Math.random() > 0.35 * this.scene.glow) return;
      for (let i = 0; i < 3; i++) {
        const src = ac.createBufferSource();
        src.buffer = this.noise;
        const bp = ac.createBiquadFilter();
        bp.type = "bandpass";
        bp.frequency.value = 4300 + Math.random() * 400;
        bp.Q.value = 18;
        const g = ac.createGain();
        const st = t + i * 0.07;
        g.gain.setValueAtTime(0.0001, st);
        g.gain.exponentialRampToValueAtTime(0.35, st + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, st + 0.05);
        src.connect(bp).connect(g).connect(this.master);
        src.start(st, Math.random() * 2, 0.06);
      }
    }
  }
}
