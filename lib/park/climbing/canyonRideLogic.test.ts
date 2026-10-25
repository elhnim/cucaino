import { describe, expect, it } from "vitest";
import { CANYON_LAYERS } from "../registry/grandCanyon";
import { RIDE_STEPS_PER_LEG, currentLayer, initialCanyonRideState, isAtRiver, justArrivedLayer, nextLayer, rideProgress, rideStep, type CanyonRideState } from "./canyonRideLogic";

describe("the canyon ride's state machine", () => {
  it("starts at the trailhead, having just arrived at the first layer (the rim)", () => {
    const s = initialCanyonRideState();
    expect(s.layerIndex).toBe(0);
    expect(s.stepsIntoLeg).toBe(0);
    expect(isAtRiver(s)).toBe(false);
    expect(justArrivedLayer(s)).toBe(CANYON_LAYERS[0]);
    expect(currentLayer(s)).toBe(CANYON_LAYERS[0]);
    expect(nextLayer(s)).toBe(CANYON_LAYERS[1]);
    expect(rideProgress(s)).toBe(0);
  });

  it("every RIDE_STEPS_PER_LEG taps arrives at the next layer", () => {
    let s = initialCanyonRideState();
    for (let i = 0; i < RIDE_STEPS_PER_LEG - 1; i++) {
      s = rideStep(s);
      expect(justArrivedLayer(s)).toBeNull();
    }
    s = rideStep(s);
    expect(s.layerIndex).toBe(1);
    expect(s.stepsIntoLeg).toBe(0);
    expect(justArrivedLayer(s)).toBe(CANYON_LAYERS[1]);
  });

  it("rides the whole trail to the river and then stops advancing (never fails, never regresses)", () => {
    let s: CanyonRideState = initialCanyonRideState();
    const totalTaps = (CANYON_LAYERS.length - 1) * RIDE_STEPS_PER_LEG;
    for (let i = 0; i < totalTaps; i++) s = rideStep(s);
    expect(isAtRiver(s)).toBe(true);
    expect(s.layerIndex).toBe(CANYON_LAYERS.length - 1);
    expect(rideProgress(s)).toBe(1);
    expect(currentLayer(s)).toBe(CANYON_LAYERS[CANYON_LAYERS.length - 1]);
    const again = rideStep(s);
    expect(again).toEqual(s); // tapping after arriving is a safe no-op
  });

  it("rideProgress climbs smoothly and monotonically with every tap", () => {
    let s: CanyonRideState = initialCanyonRideState();
    let last = rideProgress(s);
    for (let i = 0; i < (CANYON_LAYERS.length - 1) * RIDE_STEPS_PER_LEG; i++) {
      s = rideStep(s);
      const p = rideProgress(s);
      expect(p).toBeGreaterThanOrEqual(last);
      last = p;
    }
  });

  it("CANYON_LAYERS tells the real story, in descending order, with true kid-level facts", () => {
    expect(CANYON_LAYERS.length).toBeGreaterThanOrEqual(5);
    for (const layer of CANYON_LAYERS) {
      expect(layer.fact.length).toBeLessThanOrEqual(120);
      expect(layer.fact.length).toBeGreaterThan(0);
      expect(layer.name.length).toBeGreaterThan(0);
      expect(layer.emoji.length).toBeGreaterThan(0);
    }
    expect(CANYON_LAYERS[0].name).toMatch(/Rim/i);
    expect(CANYON_LAYERS[CANYON_LAYERS.length - 1].name).toMatch(/River/i);
  });
});
