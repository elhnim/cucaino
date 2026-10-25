// Cucaino Retro Arcade — background music. Every game gets its own original chiptune loop,
// composed from its id (so it's always the same tune for the same game) with a tempo and mood
// that suit its genre. Pure and deterministic (no audio here): canvas.ts's webAudioSfx plays it
// on NES-style channels — a 25% pulse lead, a 12.5% pulse arpeggio, a triangle bass and noise
// drums — quietly under the sound effects. Tested in music.test.ts.
import type { RetroGameDef } from "./engine";
import { rng } from "./engine";

export interface TuneNote {
  /** 16th-note step it starts on */
  at: number;
  /** length in 16th-note steps */
  len: number;
  /** MIDI note number */
  midi: number;
}
export type DrumHit = "kick" | "snare" | "hat";
export interface Tune {
  bpm: number;
  /** loop length in 16th-note steps */
  steps: number;
  lead: TuneNote[];
  arp: TuneNote[];
  bass: TuneNote[];
  drums: { at: number; hit: DrumHit }[];
}

type Genre = RetroGameDef["genre"];
interface Mood {
  bpm: [number, number];
  /** scale steps from the root */
  scale: number[];
  /** chord roots as scale degrees (0-based), one per bar; two choices each for the A and B parts */
  progA: number[][];
  progB: number[][];
  /** 0 calm .. 1 driving */
  drive: number;
  arp: boolean;
}
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const MIXO = [0, 2, 4, 5, 7, 9, 10];
const MOODS: Record<Genre, Mood> = {
  Action: { bpm: [146, 158], scale: MINOR, progA: [[0, 5, 2, 6], [0, 3, 6, 2]], progB: [[5, 6, 0, 0], [3, 4, 5, 6]], drive: 0.9, arp: true },
  Platformer: { bpm: [134, 146], scale: MAJOR, progA: [[0, 4, 5, 3], [0, 3, 4, 3]], progB: [[3, 4, 2, 5], [5, 3, 0, 4]], drive: 0.7, arp: true },
  Shooter: { bpm: [156, 168], scale: MINOR, progA: [[0, 6, 5, 6], [0, 5, 3, 4]], progB: [[2, 6, 3, 4], [5, 6, 0, 4]], drive: 1, arp: true },
  Puzzle: { bpm: [112, 124], scale: MAJOR, progA: [[0, 5, 3, 4], [0, 2, 3, 4]], progB: [[3, 0, 3, 4], [5, 2, 3, 4]], drive: 0.35, arp: true },
  Racing: { bpm: [164, 176], scale: MIXO, progA: [[0, 6, 3, 0], [0, 3, 6, 4]], progB: [[3, 6, 0, 4], [6, 3, 4, 4]], drive: 1, arp: false },
  Sports: { bpm: [138, 150], scale: MAJOR, progA: [[0, 3, 4, 0], [0, 5, 3, 4]], progB: [[3, 4, 2, 5], [3, 0, 3, 4]], drive: 0.75, arp: true },
  Adventure: { bpm: [118, 130], scale: DORIAN, progA: [[0, 3, 0, 6], [0, 6, 3, 4]], progB: [[2, 3, 6, 4], [5, 3, 6, 0]], drive: 0.5, arp: true },
  Classic: { bpm: [128, 140], scale: MAJOR, progA: [[0, 4, 5, 3], [0, 5, 3, 4]], progB: [[3, 4, 0, 5], [5, 3, 4, 4]], drive: 0.6, arp: true },
};

function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Compose `def`'s tune: 16 bars, A A' B A, 4/4 in 16th-note steps. */
export function composeTune(def: Pick<RetroGameDef, "id" | "genre">): Tune {
  const m = MOODS[def.genre] ?? MOODS.Classic;
  const r = rng(hashId(def.id) || 1);
  const bpm = Math.round(r.range(m.bpm[0], m.bpm[1]));
  const root = 57 + r.int(0, 7); // A3..E4
  const sc = m.scale;
  /** scale degree (any integer, wraps octaves) -> MIDI */
  const deg = (d: number, base = root) => base + sc[((d % 7) + 7) % 7] + 12 * Math.floor(d / 7);
  const progA = r.pick(m.progA);
  const progB = r.pick(m.progB);
  const bars = [...progA, ...progA, ...progB, ...progA];
  const BAR = 16;
  const steps = bars.length * BAR;
  const lead: TuneNote[] = [];
  const arp: TuneNote[] = [];
  const bass: TuneNote[] = [];
  const drums: { at: number; hit: DrumHit }[] = [];

  // ── the melody: a two-bar rhythm motif (onsets on 8ths, a few 16th pickups), reused through the
  // tune; its pitches are re-fitted to each bar's chord so it always sits on the harmony ──
  const motif: number[] = [];
  for (let s = 0; s < 32; s += 2) {
    const strong = s % 8 === 0;
    if (strong || r.chance(0.5 + m.drive * 0.15)) motif.push(s);
    if (!strong && m.drive > 0.6 && r.chance(0.18)) motif.push(s + 1);
  }
  motif.sort((a, b) => a - b);
  // the melody's contour: a gentle walk in scale steps, pulled to chord tones on the beats
  const contour = motif.map(() => r.int(-2, 2));
  const answer = motif.map(() => r.int(-2, 2)); // the B part's variation
  for (let bar = 0; bar < bars.length; bar += 2) {
    const part = bar >= 8 && bar < 12 ? answer : contour;
    let cur = 7 + bars[bar] + 2; // start round the chord's third, an octave up
    for (let i = 0; i < motif.length; i++) {
      const at = bar * BAR + motif[i];
      const chord = bars[bar + (motif[i] >= 16 ? 1 : 0)];
      cur += part[i];
      // on a beat, snap to the nearest chord tone (root, third, fifth)
      if (motif[i] % 4 === 0) {
        const tones = [0, 2, 4].map((t) => chord + t);
        let best = cur;
        let bd = Infinity;
        for (const t of tones)
          for (let o = 0; o <= 14; o += 7) {
            const c = t + o;
            if (Math.abs(c - cur) < bd) ((bd = Math.abs(c - cur)), (best = c));
          }
        cur = best;
      }
      cur = Math.max(5, Math.min(16, cur));
      const next = i + 1 < motif.length ? motif[i + 1] : 32;
      const len = Math.max(1, next - motif[i]);
      // (a little breath at the end of each phrase)
      if (i === motif.length - 1 && (bar / 2) % 2 === 1) continue;
      lead.push({ at, len: Math.min(len, 6), midi: deg(cur) });
    }
  }
  // the very end lands on the root, so the loop resolves before it comes round again
  lead.push({ at: steps - 8, len: 6, midi: deg(7) });

  // ── the bass: driving eighths (root / octave / fifth) or calmer half-bar roots ──
  for (let b = 0; b < bars.length; b++) {
    const c = bars[b];
    const r0 = deg(c, root - 24);
    if (m.drive >= 0.7) {
      const pat = [0, 0, 12, 0, 7, 0, 12, 7];
      for (let k = 0; k < 8; k++) bass.push({ at: b * BAR + k * 2, len: 2, midi: r0 + pat[k] });
    } else {
      bass.push({ at: b * BAR, len: 6, midi: r0 });
      bass.push({ at: b * BAR + 8, len: 4, midi: r0 + 7 });
      bass.push({ at: b * BAR + 12, len: 4, midi: r0 + 12 });
    }
  }

  // ── the arpeggio: the chord broken into fast 16ths on the second pulse (the NES trick) ──
  if (m.arp) {
    for (let b = 0; b < bars.length; b++) {
      const c = bars[b];
      const tones = [deg(c), deg(c + 2), deg(c + 4), deg(c + 2)];
      for (let k = 0; k < 16; k++) if (m.drive > 0.5 || k % 2 === 0) arp.push({ at: b * BAR + k, len: 1, midi: tones[k % 4] });
    }
  }

  // ── the drums ──
  for (let b = 0; b < bars.length; b++) {
    const o = b * BAR;
    // (racing gets a four-on-the-floor kick)
    const four = def.genre === "Racing";
    for (let k = 0; k < 16; k++) {
      if (k === 0 || k === 8 || (four && k % 4 === 0) || (m.drive > 0.8 && k === 10)) drums.push({ at: o + k, hit: "kick" });
      if (k === 4 || k === 12) drums.push({ at: o + k, hit: "snare" });
      if (m.drive >= 0.5 ? k % 2 === 0 : k % 4 === 2) drums.push({ at: o + k, hit: "hat" });
    }
    // a fill into the next section
    if (b % 4 === 3 && m.drive >= 0.5) for (const k of [13, 14, 15]) drums.push({ at: o + k, hit: "snare" });
  }
  return { bpm, steps, lead, arp, bass, drums };
}
