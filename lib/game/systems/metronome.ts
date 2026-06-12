/**
 * Drift-free metronome engine (Web Audio), ported from components/kid/Metronome.tsx
 * so the canvas practice panel ticks identically. Oscillators are scheduled ahead
 * of time (lookahead 25ms / schedule 100ms) for sample-accurate timing; an onBeat
 * callback fires aligned to audio time for the visual pulse.
 */
export class Metronome {
  private ctx: AudioContext | null = null;
  private timer: number | null = null;
  private nextNoteTime = 0;
  private beat = 0;
  bpm: number;
  beats: number;
  volume = 60;
  playing = false;
  onBeat: (beat: number) => void = () => {};

  constructor(bpm = 80, beats = 4) {
    this.bpm = bpm;
    this.beats = beats;
  }

  async start() {
    if (this.playing) return;
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
    }
    if (this.ctx.state === "suspended") await this.ctx.resume();
    this.beat = 0;
    this.nextNoteTime = this.ctx.currentTime + 0.05;
    this.timer = window.setInterval(() => this.scheduler(), 25);
    this.playing = true;
  }

  stop() {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
    this.playing = false;
  }

  setBpm(v: number) {
    this.bpm = Math.max(40, Math.min(240, Math.round(v)));
  }

  setBeats(n: number) {
    this.beats = n;
  }

  private scheduler() {
    const ctx = this.ctx;
    if (!ctx) return;
    while (this.nextNoteTime < ctx.currentTime + 0.1) {
      this.schedule(this.beat, this.nextNoteTime);
      this.nextNoteTime += 60.0 / this.bpm;
      this.beat = (this.beat + 1) % this.beats;
    }
  }

  private schedule(beat: number, time: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const isAccent = beat === 0;
    osc.frequency.value = isAccent ? 1500 : 900;
    const peak = (this.volume / 100) * (isAccent ? 0.6 : 0.3);
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(peak, time + 0.001);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(time);
    osc.stop(time + 0.06);
    const delayMs = Math.max(0, (time - ctx.currentTime) * 1000);
    window.setTimeout(() => this.onBeat(beat), delayMs);
  }

  destroy() {
    this.stop();
    this.ctx?.close().catch(() => {});
    this.ctx = null;
  }
}
