import { describe, expect, it } from "vitest";
import {
  DEMO_STEP_MS,
  MAX_PATTERN_LEN,
  acceptsInput,
  beginLevels,
  enterJam,
  exitJam,
  generatePattern,
  hitDrum,
  initialDrumState,
  mulberry32,
  nextLevel,
  patternLength,
  replayPattern,
  resumeLevels,
  retryLevel,
  startLevel,
  tickDemo,
  type DrumState,
} from "./logic";

/** Drive a level's demo all the way through to "input". */
function demoToInput(s: DrumState): DrumState {
  let state = s;
  let guard = 0;
  while (state.phase === "demo" && guard++ < 200) {
    state = tickDemo(state, DEMO_STEP_MS);
  }
  return state;
}

/** Tap out the whole pattern correctly, in order. */
function playPatternCorrectly(s: DrumState): DrumState {
  let state = s;
  for (const drum of s.pattern) {
    state = hitDrum(state, drum);
  }
  return state;
}

describe("pattern generation", () => {
  it("grows from 2 hits and caps at 8", () => {
    expect(patternLength(1)).toBe(2);
    expect(patternLength(2)).toBe(3);
    expect(patternLength(7)).toBe(8);
    expect(patternLength(20)).toBe(MAX_PATTERN_LEN);
  });

  it("is deterministic for a given seed", () => {
    const a = generatePattern(3, mulberry32(42));
    const b = generatePattern(3, mulberry32(42));
    expect(a).toEqual(b);
    expect(a.length).toBe(patternLength(3));
    for (const hit of a) {
      expect(["low", "mid", "high", "shaker"]).toContain(hit);
    }
  });

  it("different seeds can give different patterns", () => {
    const a = generatePattern(5, mulberry32(1));
    const b = generatePattern(5, mulberry32(2));
    expect(a).not.toEqual(b);
  });
});

describe("demo playback", () => {
  it("lights up each hit in turn then moves to input", () => {
    const rng = mulberry32(7);
    let s = startLevel(initialDrumState(), 2, rng);
    expect(s.phase).toBe("demo");
    expect(s.pattern.length).toBe(patternLength(2));
    expect(s.activeDrum).toBe(s.pattern[0]);

    // small ticks accumulate within one step
    s = tickDemo(s, 100);
    expect(s.phase).toBe("demo");
    expect(s.demoIndex).toBe(0);

    s = demoToInput(s);
    expect(s.phase).toBe("input");
    expect(s.inputIndex).toBe(0);
    expect(s.activeDrum).toBeNull();
  });

  it("ignores ticks outside the demo phase", () => {
    const s = initialDrumState();
    expect(tickDemo(s, 1000)).toBe(s);
  });
});

describe("input matching (order only, no time pressure)", () => {
  it("accepts the pattern in order and completes the level", () => {
    const rng = mulberry32(9);
    let s = demoToInput(startLevel(initialDrumState(), 1, rng));
    expect(acceptsInput(s)).toBe(true);
    s = playPatternCorrectly(s);
    expect(s.phase).toBe("correct");
    expect(s.stars).toBe(1);
    expect(s.bestLevel).toBe(1);
  });

  it("a wrong drum is a gentle mistake, not a hard fail, and does not lose stars", () => {
    const rng = mulberry32(11);
    let s = demoToInput(startLevel(initialDrumState(), 3, rng));
    const starsBefore = s.stars;
    const wrong = s.pattern[0] === "low" ? "mid" : "low";
    s = hitDrum(s, wrong);
    expect(s.phase).toBe("mistake");
    expect(s.mistakes).toBe(1);
    expect(s.stars).toBe(starsBefore);
    // gently replays the same pattern from the top
    s = retryLevel(s);
    expect(s.phase).toBe("demo");
    expect(s.inputIndex).toBe(0);
  });

  it("taps outside the input phase are ignored", () => {
    const rng = mulberry32(2);
    const s = startLevel(initialDrumState(), 1, rng); // still in "demo"
    expect(hitDrum(s, "low")).toBe(s);
  });
});

describe("level progression", () => {
  it("nextLevel only works from 'correct' and grows the pattern", () => {
    const rng = mulberry32(5);
    let s = demoToInput(startLevel(initialDrumState(), 1, rng));
    expect(nextLevel(s, rng)).toBe(s); // not completed yet, no-op
    s = playPatternCorrectly(s);
    expect(s.phase).toBe("correct");
    const s2 = nextLevel(s, rng);
    expect(s2.level).toBe(2);
    expect(s2.phase).toBe("demo");
    expect(s2.pattern.length).toBe(patternLength(2));
  });

  it("resumeLevels picks up at the current level, beginLevels always starts at 1", () => {
    const rng = mulberry32(13);
    let s = initialDrumState();
    s = playPatternCorrectly(demoToInput(startLevel(s, 1, rng)));
    s = nextLevel(s, rng); // now level 2, mid-demo
    const resumed = resumeLevels({ ...s, phase: "ready" }, rng);
    expect(resumed.level).toBe(2);
    const fresh = beginLevels({ ...s, phase: "ready" }, rng);
    expect(fresh.level).toBe(1);
  });
});

describe("jam (free play) mode", () => {
  it("any tap just lights the drum, never scores or breaks levels progress", () => {
    let s = initialDrumState();
    s = enterJam(s);
    expect(s.phase).toBe("jam");
    s = hitDrum(s, "shaker");
    expect(s.activeDrum).toBe("shaker");
    expect(s.phase).toBe("jam");
    expect(s.stars).toBe(0);
    s = exitJam(s);
    expect(s.phase).toBe("ready");
    expect(s.mode).toBe("levels");
  });
});
