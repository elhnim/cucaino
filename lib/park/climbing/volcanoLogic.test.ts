import { describe, expect, it } from "vitest";
import {
  PARICUTIN_STOPS,
  VOLCANO_STEPS_PER_LEG,
  currentStop,
  initialVolcanoClimbState,
  isAtRim,
  justArrivedStop,
  nextStop,
  volcanoProgress,
  volcanoStep,
  type VolcanoClimbState,
} from "./volcanoLogic";

describe("the volcano climb's state machine", () => {
  it("starts at the trailhead, having just arrived at the first stop", () => {
    const s = initialVolcanoClimbState();
    expect(s.stopIndex).toBe(0);
    expect(s.stepsIntoLeg).toBe(0);
    expect(isAtRim(s)).toBe(false);
    expect(justArrivedStop(s)).toBe(PARICUTIN_STOPS[0]);
    expect(currentStop(s)).toBe(PARICUTIN_STOPS[0]);
    expect(nextStop(s)).toBe(PARICUTIN_STOPS[1]);
    expect(volcanoProgress(s)).toBe(0);
  });

  it("every VOLCANO_STEPS_PER_LEG taps arrives at the next stop", () => {
    let s = initialVolcanoClimbState();
    for (let i = 0; i < VOLCANO_STEPS_PER_LEG - 1; i++) {
      s = volcanoStep(s);
      expect(justArrivedStop(s)).toBeNull();
    }
    s = volcanoStep(s);
    expect(s.stopIndex).toBe(1);
    expect(s.stepsIntoLeg).toBe(0);
    expect(justArrivedStop(s)).toBe(PARICUTIN_STOPS[1]);
  });

  it("walks the whole route to the rim and then stops advancing (never fails, never regresses)", () => {
    let s: VolcanoClimbState = initialVolcanoClimbState();
    const totalTaps = (PARICUTIN_STOPS.length - 1) * VOLCANO_STEPS_PER_LEG;
    for (let i = 0; i < totalTaps; i++) s = volcanoStep(s);
    expect(isAtRim(s)).toBe(true);
    expect(s.stopIndex).toBe(PARICUTIN_STOPS.length - 1);
    expect(volcanoProgress(s)).toBe(1);
    expect(currentStop(s)).toBe(PARICUTIN_STOPS[PARICUTIN_STOPS.length - 1]);
    const again = volcanoStep(s);
    expect(again).toEqual(s); // tapping after arriving is a safe no-op
  });

  it("volcanoProgress climbs smoothly and monotonically with every tap", () => {
    let s: VolcanoClimbState = initialVolcanoClimbState();
    let last = volcanoProgress(s);
    for (let i = 0; i < (PARICUTIN_STOPS.length - 1) * VOLCANO_STEPS_PER_LEG; i++) {
      s = volcanoStep(s);
      const p = volcanoProgress(s);
      expect(p).toBeGreaterThanOrEqual(last);
      last = p;
    }
  });

  it("PARICUTIN_STOPS tells the real story, in order, with true kid-level facts", () => {
    expect(PARICUTIN_STOPS.length).toBeGreaterThanOrEqual(4);
    for (const stop of PARICUTIN_STOPS) {
      expect(stop.fact.length).toBeLessThanOrEqual(120);
      expect(stop.fact.length).toBeGreaterThan(0);
      expect(stop.name.length).toBeGreaterThan(0);
      expect(stop.emoji.length).toBeGreaterThan(0);
    }
    // heights never go backwards (the real mountain only ever grew)
    for (let i = 1; i < PARICUTIN_STOPS.length; i++) expect(PARICUTIN_STOPS[i].height).toBeGreaterThanOrEqual(PARICUTIN_STOPS[i - 1].height);
  });
});
