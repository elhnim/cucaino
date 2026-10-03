import { describe, expect, it } from "vitest";
import { FISH_FACTS, getFish } from "../registry/fishFacts";
import {
  backToIdle,
  initialFishingState,
  mulberry32,
  pickWeightedFish,
  releaseCast,
  reelTap,
  startCast,
  tapEarly,
  tapNibble,
  tickNibble,
  tickReeling,
  tickWaiting,
  totalCaught,
  type FishingState,
  REEL_IDLE_TIMEOUT_MS,
} from "./logic";

/** Drive a fresh cast all the way to the nibble window, tapping exactly on time. */
function castToNibble(rng: () => number) {
  let s = initialFishingState();
  s = startCast(s);
  s = releaseCast(s, 400, rng);
  expect(s.phase).toBe("waiting");
  // advance past the wait (any amount >= waitTotalMs lands on "nibble")
  s = tickWaiting(s, s.waitTotalMs, rng);
  expect(s.phase).toBe("nibble");
  return s;
}

/** Reel all the way in with repeated taps. */
function reelIn(s: FishingState, rng: () => number) {
  let state = s;
  let guard = 0;
  while (state.phase === "reeling" && guard++ < 20) {
    state = reelTap(state, rng);
  }
  return state;
}

describe("fishing state machine", () => {
  it("starts idle and only casts from idle", () => {
    const s = initialFishingState();
    expect(s.phase).toBe("idle");
    const started = startCast(s);
    expect(started.phase).toBe("casting");
    // casting again while already casting is a no-op
    expect(startCast(started)).toBe(started);
  });

  it("goes idle -> casting -> waiting -> nibble on schedule", () => {
    const rng = mulberry32(1);
    const s = castToNibble(rng);
    expect(s.nibbleTotalMs).toBeGreaterThanOrEqual(900);
    expect(s.nibbleTotalMs).toBeLessThanOrEqual(1400);
    expect(s.pendingFishId).toBeTruthy();
    expect(getFish(s.pendingFishId!)).toBeDefined();
  });

  it("tapping early (during waiting) scares the fish off gently", () => {
    const rng = mulberry32(2);
    let s = initialFishingState();
    s = startCast(s);
    s = releaseCast(s, 500, rng);
    expect(s.phase).toBe("waiting");
    s = tapEarly(s);
    expect(s.phase).toBe("missed");
    expect(s.missMessage).toMatch(/not yet|swam off/i);
    expect(totalCaught(s)).toBe(0);
    // can go back to idle and cast again
    s = backToIdle(s);
    expect(s.phase).toBe("idle");
  });

  it("missing the whole nibble window is also a gentle miss, not a catch", () => {
    const rng = mulberry32(3);
    let s = castToNibble(rng);
    s = tickNibble(s, s.nibbleTotalMs + 50);
    expect(s.phase).toBe("missed");
    expect(s.missMessage).toMatch(/too slow|got away/i);
    expect(totalCaught(s)).toBe(0);
  });

  it("tapping within the nibble window hooks the fish and reeling lands the catch", () => {
    const rng = mulberry32(4);
    let s = castToNibble(rng);
    s = tapNibble(s);
    expect(s.phase).toBe("reeling");
    s = reelIn(s, rng);
    expect(s.phase).toBe("caught");
    expect(s.result).toBeTruthy();
    expect(getFish(s.result!.fishId)).toBeDefined();
    expect(totalCaught(s)).toBe(1);
    expect(s.result!.isNew).toBe(true);
  });

  it("reeling never hard-fails quickly — only very long inaction lets the fish go, kindly", () => {
    const rng = mulberry32(5);
    let s = castToNibble(rng);
    s = tapNibble(s);
    expect(s.phase).toBe("reeling");
    // a little bit of idling should not fail the catch
    s = tickReeling(s, 500);
    expect(s.phase).toBe("reeling");
    // but sitting idle past the timeout lets it go, with a gentle message (never harsh)
    s = tickReeling(s, REEL_IDLE_TIMEOUT_MS);
    expect(s.phase).toBe("missed");
    expect(s.missMessage).toMatch(/got away/i);
  });

  it("tracks a fish-book catch log with counts and first-catch 'new species' flags", () => {
    const rng = mulberry32(42);
    let s = initialFishingState();
    for (let i = 0; i < 25; i++) {
      s = startCast(s);
      s = releaseCast(s, 300, rng);
      s = tickWaiting(s, s.waitTotalMs, rng);
      s = tapNibble(s);
      s = reelIn(s, rng);
      expect(s.phase).toBe("caught");
      const id = s.result!.fishId;
      expect(s.catchCounts[id]).toBeGreaterThan(0);
      // isNew is true exactly on the first time this species shows up in the log
      expect(s.result!.isNew).toBe(s.catchCounts[id] === 1);
      s = backToIdle(s);
    }
    expect(totalCaught(s)).toBe(25);
    expect(Object.values(s.catchCounts).reduce((a, b) => a + b, 0)).toBe(25);
  });

  it("weighted picks land on every species over many seeded draws, favouring common ones", () => {
    const rng = mulberry32(7);
    const tally: Record<string, number> = {};
    const N = 20000;
    for (let i = 0; i < N; i++) {
      const fish = pickWeightedFish(rng);
      tally[fish.id] = (tally[fish.id] ?? 0) + 1;
    }
    // every species should show up at least once over this many draws
    for (const f of FISH_FACTS) {
      expect(tally[f.id] ?? 0).toBeGreaterThan(0);
    }
    const golden = tally["golden-fish"] ?? 0;
    const bluegill = tally["bluegill"] ?? 0; // the highest-weight common fish
    // the rare golden fish is possible but meaningfully rarer than the commonest fish
    expect(golden).toBeGreaterThan(0);
    expect(golden).toBeLessThan(bluegill);
  });

  it("distributes catches roughly proportional to registry weights", () => {
    const rng = mulberry32(99);
    const totalWeight = FISH_FACTS.reduce((s, f) => s + f.weight, 0);
    const N = 30000;
    const tally: Record<string, number> = {};
    for (let i = 0; i < N; i++) {
      const id = pickWeightedFish(rng).id;
      tally[id] = (tally[id] ?? 0) + 1;
    }
    for (const f of FISH_FACTS) {
      const expected = (f.weight / totalWeight) * N;
      const got = tally[f.id] ?? 0;
      // generous tolerance: within 50% relative or +/-40 absolute, whichever is larger
      const tolerance = Math.max(expected * 0.5, 40);
      expect(Math.abs(got - expected)).toBeLessThanOrEqual(tolerance);
    }
  });
});
