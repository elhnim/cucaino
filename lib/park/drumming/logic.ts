// Drumming mini-game state machine (pure, no I/O, no timers — the component drives "demo" with
// real clock ticks via tickDemo, same pattern as lib/park/fishing/logic.ts).
//
// ready -> demo (the lead drummer plays the pattern, one hit lights up at a time) -> input (the
// kid copies it, tap order only — no time pressure) -> correct (level done, short jam + fact) ->
// demo (next, longer pattern) ... A wrong tap during "input" is a gentle "mistake": no penalty,
// just listen again and replay the same pattern. "jam" is a separate free-play mode: any tap just
// plays a drum, no scoring at all.
export type RNGFn = () => number;

/** Deterministic seeded PRNG (mulberry32) — same seed always gives the same sequence. */
export function mulberry32(seed: number): RNGFn {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type DrumId = "low" | "mid" | "high" | "shaker";
export const DRUM_IDS: readonly DrumId[] = ["low", "mid", "high", "shaker"];

export type DrumPhase = "ready" | "demo" | "input" | "correct" | "mistake" | "jam";
export type DrumMode = "levels" | "jam";

/** a pattern hit lights its drum for this long, then a short gap before the next hit */
export const DEMO_ON_MS = 480;
export const DEMO_GAP_MS = 260;
export const DEMO_STEP_MS = DEMO_ON_MS + DEMO_GAP_MS;

export const MIN_PATTERN_LEN = 2;
export const MAX_PATTERN_LEN = 8;

export interface DrumState {
  phase: DrumPhase;
  mode: DrumMode;
  level: number;
  pattern: DrumId[];
  demoIndex: number;
  demoElapsedMs: number;
  inputIndex: number;
  mistakes: number;
  stars: number;
  bestLevel: number;
  /** the drum currently lit — during "demo" (the pattern playing), or the last tap in "input"/"jam" */
  activeDrum: DrumId | null;
}

export function initialDrumState(): DrumState {
  return {
    phase: "ready",
    mode: "levels",
    level: 0,
    pattern: [],
    demoIndex: 0,
    demoElapsedMs: 0,
    inputIndex: 0,
    mistakes: 0,
    stars: 0,
    bestLevel: 0,
    activeDrum: null,
  };
}

/** how many hits a level's pattern has — grows from 2 to 8 and then stays there */
export function patternLength(level: number): number {
  return Math.max(MIN_PATTERN_LEN, Math.min(MAX_PATTERN_LEN, level + 1));
}

/** Build a fresh random pattern for a level (seeded, so this is deterministic in tests). */
export function generatePattern(level: number, rng: RNGFn): DrumId[] {
  const len = patternLength(level);
  const pattern: DrumId[] = [];
  for (let i = 0; i < len; i++) {
    pattern.push(DRUM_IDS[Math.floor(rng() * DRUM_IDS.length) % DRUM_IDS.length]);
  }
  return pattern;
}

/** Start (or restart) a given level with a brand-new pattern — always begins with the demo. */
export function startLevel(s: DrumState, level: number, rng: RNGFn): DrumState {
  const pattern = generatePattern(level, rng);
  return {
    ...s,
    mode: "levels",
    phase: "demo",
    level,
    pattern,
    demoIndex: 0,
    demoElapsedMs: 0,
    inputIndex: 0,
    mistakes: 0,
    activeDrum: pattern[0] ?? null,
  };
}

/** From the ready screen (or jam), begin level 1. */
export function beginLevels(s: DrumState, rng: RNGFn): DrumState {
  return startLevel(s, 1, rng);
}

/** From the ready screen, pick up at the level reached before (or start at 1 if brand new). */
export function resumeLevels(s: DrumState, rng: RNGFn): DrumState {
  return startLevel(s, Math.max(1, s.level), rng);
}

/** Replay the current level's pattern from the top (used after a gentle mistake). */
export function replayPattern(s: DrumState): DrumState {
  return {
    ...s,
    phase: "demo",
    demoIndex: 0,
    demoElapsedMs: 0,
    inputIndex: 0,
    activeDrum: s.pattern[0] ?? null,
  };
}

/** Advance the demo clock; flips to "input" once every hit in the pattern has played. */
export function tickDemo(s: DrumState, dtMs: number): DrumState {
  if (s.phase !== "demo") return s;
  const elapsed = s.demoElapsedMs + Math.max(0, dtMs);
  if (elapsed < DEMO_STEP_MS) {
    return { ...s, demoElapsedMs: elapsed, activeDrum: elapsed < DEMO_ON_MS ? s.pattern[s.demoIndex] : null };
  }
  const nextIndex = s.demoIndex + 1;
  if (nextIndex >= s.pattern.length) {
    return { ...s, phase: "input", demoIndex: 0, demoElapsedMs: 0, inputIndex: 0, activeDrum: null };
  }
  return { ...s, demoIndex: nextIndex, demoElapsedMs: 0, activeDrum: s.pattern[nextIndex] };
}

/** The kid's turn: one tap on a drum. Order matters; there is no time window at all. */
export function hitDrum(s: DrumState, drum: DrumId): DrumState {
  if (s.phase === "jam") return { ...s, activeDrum: drum };
  if (s.phase !== "input") return s;
  const expected = s.pattern[s.inputIndex];
  if (drum !== expected) {
    return { ...s, phase: "mistake", mistakes: s.mistakes + 1, activeDrum: drum };
  }
  const inputIndex = s.inputIndex + 1;
  if (inputIndex >= s.pattern.length) {
    return {
      ...s,
      phase: "correct",
      inputIndex,
      activeDrum: drum,
      stars: s.stars + 1,
      bestLevel: Math.max(s.bestLevel, s.level),
    };
  }
  return { ...s, inputIndex, activeDrum: drum };
}

/** A free tap while a "correct" fact card is showing — the short post-level jam, not scored. */
export function jamTapDuringCelebration(s: DrumState, drum: DrumId): DrumState {
  if (s.phase !== "correct") return s;
  return { ...s, activeDrum: drum };
}

/** After a gentle mistake, listen again (same pattern, same level). */
export function retryLevel(s: DrumState): DrumState {
  if (s.phase !== "mistake") return s;
  return replayPattern(s);
}

/** Move on to the next, slightly longer pattern. */
export function nextLevel(s: DrumState, rng: RNGFn): DrumState {
  if (s.phase !== "correct") return s;
  return startLevel(s, s.level + 1, rng);
}

/** Switch to free-play Jam mode — no pattern, no scoring, any tap just makes music. */
export function enterJam(s: DrumState): DrumState {
  return { ...s, mode: "jam", phase: "jam", activeDrum: null };
}

/** Leave Jam mode back to the ready screen (levels, stars and best level are untouched). */
export function exitJam(s: DrumState): DrumState {
  return { ...s, mode: "levels", phase: "ready", activeDrum: null };
}

/** True while the kid's input should be accepted (not during the demo). */
export function acceptsInput(s: DrumState): boolean {
  return s.phase === "input" || s.phase === "jam" || s.phase === "correct";
}
