// The carousel's band organ: a little fairground waltz, synthesised (no audio files) — reedy
// pipes for the tune, a soft oom-pah-pah underneath. Obeys the app's mute switch.
import { getMuted } from "@/lib/audio/sound-manager";

// (note names -> semitones from A4)
const N: Record<string, number> = {
  C4: -9,
  D4: -7,
  E4: -5,
  F4: -4,
  G4: -2,
  A4: 0,
  B4: 2,
  C5: 3,
  D5: 5,
  E5: 7,
  F5: 8,
  G5: 10,
  A5: 12,
  C3: -21,
  F3: -16,
  G3: -14,
  G2: -26,
  C2: -33,
};
const hz = (n: string) => 440 * Math.pow(2, N[n] / 12);
// one bar = three beats; the tune, one entry per beat ("-" holds the note before)
const TUNE = [
  "E5",
  "-",
  "G5",
  "C5",
  "-",
  "E5",
  "D5",
  "E5",
  "F5",
  "E5",
  "-",
  "-",
  "D5",
  "-",
  "F5",
  "B4",
  "-",
  "D5",
  "C5",
  "D5",
  "E5",
  "C5",
  "-",
  "-",
  "E5",
  "-",
  "G5",
  "A5",
  "-",
  "G5",
  "F5",
  "E5",
  "D5",
  "G5",
  "-",
  "-",
  "F5",
  "E5",
  "D5",
  "C5",
  "B4",
  "D5",
  "C5",
  "-",
  "E5",
  "C5",
  "-",
  "-",
];
// the bass note of each bar, then its chord on beats two and three
const BARS: [string, string[]][] = [
  ["C3", ["E4", "G4"]],
  ["C3", ["E4", "G4"]],
  ["G3", ["D4", "F4"]],
  ["C3", ["E4", "G4"]],
  ["G3", ["D4", "F4"]],
  ["G3", ["D4", "F4"]],
  ["C3", ["E4", "G4"]],
  ["C3", ["E4", "G4"]],
  ["C3", ["E4", "G4"]],
  ["F3", ["F4", "A4"]],
  ["G3", ["D4", "F4"]],
  ["C3", ["E4", "G4"]],
  ["G3", ["D4", "F4"]],
  ["G3", ["D4", "F4"]],
  ["C3", ["E4", "G4"]],
  ["C3", ["E4", "G4"]],
];
const BEAT = 0.3; // seconds

export function startCarouselMusic(): { stop(): void } | null {
  if (typeof window === "undefined" || getMuted()) return null;
  const AC: typeof AudioContext | undefined =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AC) return null;
  let ctx: AudioContext;
  try {
    ctx = new AC();
  } catch {
    return null;
  }
  const out = ctx.createGain();
  out.gain.value = 0.0001;
  out.gain.exponentialRampToValueAtTime(0.16, ctx.currentTime + 0.6);
  out.connect(ctx.destination);
  const note = (
    f: number,
    at: number,
    dur: number,
    type: OscillatorType,
    vol: number,
  ) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + 0.02);
    g.gain.setValueAtTime(vol, at + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g);
    g.connect(out);
    o.start(at);
    o.stop(at + dur + 0.02);
  };
  let next = ctx.currentTime + 0.1;
  let beat = 0;
  let stopped = false;
  const schedule = () => {
    if (stopped) return;
    if (getMuted()) out.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.05);
    while (next < ctx.currentTime + 0.6) {
      const b = beat % TUNE.length;
      const t = TUNE[b];
      if (t !== "-") {
        let len = 1;
        while (TUNE[(b + len) % TUNE.length] === "-" && len < 3) len++;
        // two reedy pipes an octave apart
        note(hz(t), next, BEAT * len * 0.96, "square", 0.16);
        note(hz(t) * 2, next, BEAT * len * 0.96, "triangle", 0.12);
      }
      const [bass, chord] = BARS[Math.floor(b / 3) % BARS.length];
      if (b % 3 === 0) note(hz(bass), next, BEAT * 0.9, "triangle", 0.34);
      else
        for (const c of chord) note(hz(c), next, BEAT * 0.5, "triangle", 0.1);
      next += BEAT;
      beat++;
    }
  };
  schedule();
  const timer = window.setInterval(schedule, 200);
  return {
    stop() {
      if (stopped) return;
      stopped = true;
      window.clearInterval(timer);
      out.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.15);
      window.setTimeout(() => void ctx.close().catch(() => {}), 700);
    },
  };
}
