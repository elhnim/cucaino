import { describe, expect, it } from "vitest";
import type { TripLeg } from "./planner";
import { advanceTrip, FLY_LAND_R, startTrip, tripStatus, type TripSense } from "./tripMachine";

const walkThenTrainThenWalk: TripLeg[] = [
  { mode: "walk", label: "walk to station", x: 10, z: 0, instruction: "Walk to the station", etaSec: 5 },
  { mode: "train", label: "ride", x: 100, z: 0, instruction: "Ride the train", etaSec: 20 },
  { mode: "walk", label: "walk to spot", x: 110, z: 5, instruction: "Walk to the spot", etaSec: 3 },
];

function sense(partial: Partial<TripSense>): TripSense {
  return { pose: null, onTrain: false, railStop: null, flyingTo: null, ...partial };
}

describe("tripMachine", () => {
  it("stays on the first leg until the kid arrives", () => {
    let state = startTrip();
    state = advanceTrip(walkThenTrainThenWalk, state, sense({ pose: { x: 0, z: 0 } }));
    expect(state.legIndex).toBe(0);
    state = advanceTrip(walkThenTrainThenWalk, state, sense({ pose: { x: 10, z: 0 } }));
    expect(state.legIndex).toBe(1);
  });

  it("a train leg waits to board, then waits to alight at the right stop", () => {
    let state = startTrip();
    state = { ...state, legIndex: 1 }; // already walked to the station
    // not on the train yet: no progress even if "arrived" at the target (can't skip boarding)
    state = advanceTrip(walkThenTrainThenWalk, state, sense({ pose: { x: 100, z: 0 }, onTrain: false }));
    expect(state.legIndex).toBe(1);
    expect(state.boarded).toBe(false);
    // boards
    state = advanceTrip(walkThenTrainThenWalk, state, sense({ pose: { x: 50, z: 0 }, onTrain: true }));
    expect(state.boarded).toBe(true);
    expect(state.legIndex).toBe(1);
    // still riding, not there yet
    state = advanceTrip(walkThenTrainThenWalk, state, sense({ pose: { x: 80, z: 0 }, onTrain: true }));
    expect(state.legIndex).toBe(1);
    // steps off right at the target stop
    state = advanceTrip(walkThenTrainThenWalk, state, sense({ pose: { x: 100, z: 0 }, onTrain: false }));
    expect(state.legIndex).toBe(2);
  });

  it("a train leg does not finish if the kid steps off at the wrong stop", () => {
    let state = { legIndex: 1, boarded: true, done: false };
    state = advanceTrip(walkThenTrainThenWalk, state, sense({ pose: { x: 55, z: 0 }, onTrain: false }));
    expect(state.legIndex).toBe(1); // got off early, not at (100,0): still on this leg
  });

  it("marks the whole trip done after the last leg", () => {
    let state = { legIndex: 2, boarded: false, done: false };
    state = advanceTrip(walkThenTrainThenWalk, state, sense({ pose: { x: 110, z: 5 } }));
    expect(state.done).toBe(true);
  });

  it("never advances past done", () => {
    const done = { legIndex: 3, boarded: false, done: true };
    const next = advanceTrip(walkThenTrainThenWalk, done, sense({ pose: { x: 110, z: 5 } }));
    expect(next.done).toBe(true);
    expect(next.legIndex).toBe(3);
  });

  it("tripStatus reports the current leg and remaining distance", () => {
    const state = startTrip();
    const status = tripStatus(walkThenTrainThenWalk, state, sense({ pose: { x: 0, z: 0 } }));
    expect(status.leg?.instruction).toBe("Walk to the station");
    expect(status.remaining).toBeCloseTo(10, 5);
  });

  it("a flight is finished where the dragon really sets down (its landing distance short of the target)", () => {
    const fly: TripLeg[] = [{ mode: "fly", label: "fly", x: 500, z: 0, instruction: "Fly there", etaSec: 20 }];
    let state = startTrip();
    // still flying: not done even when close
    state = advanceTrip(fly, state, sense({ pose: { x: 500 - FLY_LAND_R + 1, z: 0 }, flyingTo: "Somewhere" }));
    expect(state.done).toBe(false);
    // landed at the autopilot's own stopping distance: done
    state = advanceTrip(fly, state, sense({ pose: { x: 500 - FLY_LAND_R + 1, z: 0 }, flyingTo: null }));
    expect(state.done).toBe(true);
    // but landing far away (the kid took over and came down early) is not arriving
    expect(advanceTrip(fly, startTrip(), sense({ pose: { x: 400, z: 0 }, flyingTo: null })).done).toBe(false);
  });
});
