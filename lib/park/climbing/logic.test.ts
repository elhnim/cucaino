import { describe, expect, it } from "vitest";
import { EVEREST_CAMPS } from "../registry/everestFacts";
import {
  BREATH_COST,
  BREATH_GAIN,
  BREATH_MAX,
  STEPS_PER_LEG,
  breathe,
  climbStep,
  currentAltitude,
  currentCamp,
  initialClimbState,
  isSummited,
  justArrivedCamp,
  nextCamp,
  overallProgress,
} from "./logic";

describe("Climb Everest: the camps (true data)", () => {
  it("are in real, strictly ascending altitude order, starting at Base Camp and ending at the Summit (8,849 m)", () => {
    expect(EVEREST_CAMPS.length).toBeGreaterThanOrEqual(5);
    expect(EVEREST_CAMPS[0].id).toBe("basecamp");
    for (let i = 1; i < EVEREST_CAMPS.length; i++) expect(EVEREST_CAMPS[i].altitude).toBeGreaterThan(EVEREST_CAMPS[i - 1].altitude);
    const summit = EVEREST_CAMPS[EVEREST_CAMPS.length - 1];
    expect(summit.id).toBe("summit");
    expect(summit.altitude).toBe(8849);
  });

  it("every camp has a true, kid-length fact (non-empty, at most 120 chars)", () => {
    for (const c of EVEREST_CAMPS) {
      expect(c.fact.length).toBeGreaterThan(0);
      expect(c.fact.length).toBeLessThanOrEqual(120);
    }
  });
});

describe("Climb Everest: the progression logic (pure, no fail state)", () => {
  it("starts at Base Camp, full breath, not summited", () => {
    const s = initialClimbState();
    expect(s.campIndex).toBe(0);
    expect(s.stepsIntoLeg).toBe(0);
    expect(s.breath).toBe(BREATH_MAX);
    expect(s.summited).toBe(false);
    expect(currentAltitude(s)).toBe(EVEREST_CAMPS[0].altitude);
    expect(justArrivedCamp(s)?.id).toBe("basecamp");
  });

  it("climbStep spends breath and advances the leg; every STEPS_PER_LEG taps reaches the next camp", () => {
    let s = initialClimbState();
    for (let i = 0; i < STEPS_PER_LEG - 1; i++) {
      s = climbStep(s);
      expect(justArrivedCamp(s)).toBeNull(); // mid-leg, not freshly arrived
    }
    expect(s.campIndex).toBe(0);
    expect(s.stepsIntoLeg).toBe(STEPS_PER_LEG - 1);
    s = climbStep(s);
    expect(s.campIndex).toBe(1);
    expect(s.stepsIntoLeg).toBe(0);
    expect(justArrivedCamp(s)?.id).toBe(EVEREST_CAMPS[1].id);
  });

  it("altitude climbs smoothly between camps and matches each camp exactly on arrival", () => {
    let s = initialClimbState();
    expect(currentAltitude(s)).toBe(EVEREST_CAMPS[0].altitude);
    s = climbStep(s);
    const expected = EVEREST_CAMPS[0].altitude + (EVEREST_CAMPS[1].altitude - EVEREST_CAMPS[0].altitude) * (1 / STEPS_PER_LEG);
    expect(currentAltitude(s)).toBeCloseTo(expected, 0);
    for (let i = 0; i < STEPS_PER_LEG - 1; i++) s = climbStep(s);
    expect(currentAltitude(s)).toBe(EVEREST_CAMPS[1].altitude);
  });

  it("breath never goes negative: climbStep refuses (a no-op, just bumps `winded`) once breath is too low", () => {
    let s = initialClimbState();
    const stepsAvailable = Math.floor(BREATH_MAX / BREATH_COST);
    for (let i = 0; i < stepsAvailable; i++) {
      s = climbStep(s);
      expect(s.breath).toBeGreaterThanOrEqual(0);
    }
    const before = s;
    s = climbStep(s); // not enough breath left: must no-op, not go negative or fail
    expect(s.breath).toBe(before.breath);
    expect(s.campIndex).toBe(before.campIndex);
    expect(s.stepsIntoLeg).toBe(before.stepsIntoLeg);
    expect(s.winded).toBe(before.winded + 1);
    expect(s.summited).toBe(false); // never a fail/game-over state
  });

  it("breathe() always restores breath (clamped to BREATH_MAX) and is always safe to call", () => {
    let s = initialClimbState();
    s = climbStep(s);
    const afterClimb = s.breath;
    s = breathe(s);
    expect(s.breath).toBe(Math.min(BREATH_MAX, afterClimb + BREATH_GAIN));
    // calling it again and again at full breath never errors or goes over the cap
    for (let i = 0; i < 20; i++) s = breathe(s);
    expect(s.breath).toBe(BREATH_MAX);
    expect(s.winded).toBe(0);
  });

  it("alternating climb/breathe forever eventually reaches the Summit, and summiting is sticky (further taps are no-ops, never a failure)", () => {
    let s = initialClimbState();
    let guard = 0;
    while (!isSummited(s) && guard < 5000) {
      s = climbStep(s);
      if (s.breath < BREATH_COST) s = breathe(s);
      guard++;
    }
    expect(isSummited(s)).toBe(true);
    expect(currentCamp(s).id).toBe("summit");
    expect(currentAltitude(s)).toBe(8849);
    expect(overallProgress(s)).toBe(1);
    const atSummit = s;
    s = climbStep(s);
    expect(s).toEqual(atSummit); // nothing more happens — no fail, no overshoot
    expect(nextCamp(s).id).toBe("summit");
  });

  it("overallProgress rises monotonically from 0 to 1 across the whole climb", () => {
    let s = initialClimbState();
    let prev = overallProgress(s);
    expect(prev).toBe(0);
    let guard = 0;
    while (!isSummited(s) && guard < 5000) {
      s = climbStep(s);
      if (s.breath < BREATH_COST) s = breathe(s);
      const now = overallProgress(s);
      expect(now).toBeGreaterThanOrEqual(prev);
      prev = now;
      guard++;
    }
    expect(prev).toBe(1);
  });
});
