// Fishing mini-game state machine (pure, no I/O, no timers — the component drives it with real
// clock ticks so this stays deterministic and easy to test).
//
// idle -> casting (holding the Cast! button) -> waiting (bobber sits still, 2-6s) -> nibble
// (bobber dips, ~0.9-1.4s "tap now!" window) -> reeling (a few taps/holds, can't really fail) ->
// caught -> back to idle.
//
// Tapping during "waiting" (before the nibble cue) scares the fish off — a gentle miss, never a
// hard fail. Letting the nibble window pass without tapping does the same. Once reeling starts it
// always succeeds for a few taps; only ignoring it for a long time lets the fish go, kindly.
import { FISH_FACTS, TOTAL_FISH_WEIGHT, getFish, type FishDef } from "../registry/fishFacts";

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

function randRange(rng: RNGFn, min: number, max: number): number {
  return min + rng() * (max - min);
}

/** Weighted-random pick over FISH_FACTS (or any pool) — bigger `weight` = more likely. */
export function pickWeightedFish(rng: RNGFn, pool: readonly FishDef[] = FISH_FACTS): FishDef {
  const total = pool.reduce((s, f) => s + f.weight, 0) || TOTAL_FISH_WEIGHT;
  let r = rng() * total;
  for (const f of pool) {
    r -= f.weight;
    if (r <= 0) return f;
  }
  return pool[pool.length - 1];
}

export const CAST_MAX_HOLD_MS = 1500;
export const WAIT_MIN_MS = 2000;
export const WAIT_MAX_MS = 6000;
export const NIBBLE_MIN_MS = 900;
export const NIBBLE_MAX_MS = 1400;
export const REEL_TAP_GAIN = 34;
export const REEL_DECAY_PER_SEC = 14;
export const REEL_TARGET = 100;
/** how long reeling can sit untouched before the fish kindly gets away */
export const REEL_IDLE_TIMEOUT_MS = 9000;

export type FishingPhase = "idle" | "casting" | "waiting" | "nibble" | "reeling" | "caught" | "missed";

export interface CaughtResult {
  fishId: string;
  sizeCm: number;
  isNew: boolean;
  releaseOnly: boolean;
}

export interface FishingState {
  phase: FishingPhase;
  /** 0..1, how far the cast went (purely cosmetic) */
  castPower: number;
  waitTotalMs: number;
  waitElapsedMs: number;
  nibbleTotalMs: number;
  nibbleElapsedMs: number;
  reelProgress: number;
  reelIdleMs: number;
  /** chosen the moment the nibble starts, revealed only once reeled in */
  pendingFishId: string | null;
  result: CaughtResult | null;
  missMessage: string | null;
  /** this session's catch counts, keyed by fish id */
  catchCounts: Record<string, number>;
  casts: number;
}

export function initialFishingState(): FishingState {
  return {
    phase: "idle",
    castPower: 0,
    waitTotalMs: 0,
    waitElapsedMs: 0,
    nibbleTotalMs: 0,
    nibbleElapsedMs: 0,
    reelProgress: 0,
    reelIdleMs: 0,
    pendingFishId: null,
    result: null,
    missMessage: null,
    catchCounts: {},
    casts: 0,
  };
}

/** Start holding the Cast! button (idle -> casting). No-op outside idle. */
export function startCast(s: FishingState): FishingState {
  if (s.phase !== "idle") return s;
  return { ...s, phase: "casting", castPower: 0, result: null, missMessage: null };
}

/** Release the Cast! button after holding for `holdMs` (casting -> waiting). */
export function releaseCast(s: FishingState, holdMs: number, rng: RNGFn): FishingState {
  if (s.phase !== "casting") return s;
  const castPower = Math.max(0, Math.min(1, holdMs / CAST_MAX_HOLD_MS));
  return {
    ...s,
    phase: "waiting",
    castPower,
    waitTotalMs: randRange(rng, WAIT_MIN_MS, WAIT_MAX_MS),
    waitElapsedMs: 0,
    casts: s.casts + 1,
  };
}

/** Advance the clock while waiting; flips to "nibble" once the wait is up. */
export function tickWaiting(s: FishingState, dtMs: number, rng: RNGFn): FishingState {
  if (s.phase !== "waiting") return s;
  const waitElapsedMs = s.waitElapsedMs + Math.max(0, dtMs);
  if (waitElapsedMs < s.waitTotalMs) return { ...s, waitElapsedMs };
  const fish = pickWeightedFish(rng);
  return {
    ...s,
    phase: "nibble",
    waitElapsedMs,
    nibbleTotalMs: randRange(rng, NIBBLE_MIN_MS, NIBBLE_MAX_MS),
    nibbleElapsedMs: 0,
    pendingFishId: fish.id,
  };
}

/** The kid tapped too soon, before the bobber dipped — the fish swims off, gently. */
export function tapEarly(s: FishingState): FishingState {
  if (s.phase !== "waiting") return s;
  return {
    ...s,
    phase: "missed",
    missMessage: "Shh, not yet... the fish swam off! Wait for the bobber to dip.",
    pendingFishId: null,
  };
}

/** Advance the clock during the nibble window; missing it entirely is a gentle miss too. */
export function tickNibble(s: FishingState, dtMs: number): FishingState {
  if (s.phase !== "nibble") return s;
  const nibbleElapsedMs = s.nibbleElapsedMs + Math.max(0, dtMs);
  if (nibbleElapsedMs < s.nibbleTotalMs) return { ...s, nibbleElapsedMs };
  return {
    ...s,
    phase: "missed",
    nibbleElapsedMs,
    missMessage: "Too slow — it got away! Try again.",
    pendingFishId: null,
  };
}

/** Tap during the nibble window — hooked! Moves to reeling. */
export function tapNibble(s: FishingState): FishingState {
  if (s.phase !== "nibble") return s;
  return { ...s, phase: "reeling", reelProgress: 0, reelIdleMs: 0 };
}

/** One reel tap/hold-tick — always makes progress; reaching the target lands the catch. */
export function reelTap(s: FishingState, rng: RNGFn): FishingState {
  if (s.phase !== "reeling") return s;
  const reelProgress = Math.min(REEL_TARGET, s.reelProgress + REEL_TAP_GAIN);
  if (reelProgress >= REEL_TARGET) return finishCatch({ ...s, reelProgress }, rng);
  return { ...s, reelProgress, reelIdleMs: 0 };
}

/** Advance the clock while reeling; very long inaction lets the fish go, kindly (never harshly). */
export function tickReeling(s: FishingState, dtMs: number): FishingState {
  if (s.phase !== "reeling") return s;
  const dt = Math.max(0, dtMs);
  const reelIdleMs = s.reelIdleMs + dt;
  if (reelIdleMs >= REEL_IDLE_TIMEOUT_MS) {
    return { ...s, phase: "missed", missMessage: "It got away — no worries, try again!", pendingFishId: null };
  }
  const reelProgress = Math.max(0, s.reelProgress - (REEL_DECAY_PER_SEC * dt) / 1000);
  return { ...s, reelProgress, reelIdleMs };
}

function finishCatch(s: FishingState, rng: RNGFn): FishingState {
  const fish = getFish(s.pendingFishId ?? "") ?? pickWeightedFish(rng);
  const sizeCm = Math.round(randRange(rng, fish.sizeCm[0], fish.sizeCm[1]));
  const priorCount = s.catchCounts[fish.id] ?? 0;
  const catchCounts = { ...s.catchCounts, [fish.id]: priorCount + 1 };
  return {
    ...s,
    phase: "caught",
    pendingFishId: null,
    catchCounts,
    result: { fishId: fish.id, sizeCm, isNew: priorCount === 0, releaseOnly: !!fish.releaseOnly },
  };
}

/** Back to idle (cast-ready) — keeps the session's catch counts and cast tally. */
export function backToIdle(s: FishingState): FishingState {
  return {
    ...s,
    phase: "idle",
    castPower: 0,
    waitTotalMs: 0,
    waitElapsedMs: 0,
    nibbleTotalMs: 0,
    nibbleElapsedMs: 0,
    reelProgress: 0,
    reelIdleMs: 0,
    pendingFishId: null,
    result: null,
    missMessage: null,
  };
}

/** Total catches so far this session, across all species. */
export function totalCaught(s: FishingState): number {
  return Object.values(s.catchCounts).reduce((sum, n) => sum + n, 0);
}
