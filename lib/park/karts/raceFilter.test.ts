import { describe, expect, it } from "vitest";
import { isForThisRace } from "./raceFilter";
import type { KartNetMsg } from "./types";

const RACE = "mia-1700000000000";
const RACERS = ["mia", "leo"];
const banana = (raceId: string, kidId: string): KartNetMsg => ({ type: "item", raceId, kidId, ev: "banana", id: "b1", x: 1, z: 2 });

describe("kart race message filter", () => {
  it("takes a racer's own messages for this race", () => {
    expect(isForThisRace(banana(RACE, "leo"), RACE, RACERS)).toBe(true);
    expect(isForThisRace({ type: "finish", raceId: RACE, kidId: "leo", totalMs: 1, bestLapMs: 1 }, RACE, RACERS)).toBe(true);
  });

  it("drops another race's bananas, even from someone racing here (the race before a rematch)", () => {
    expect(isForThisRace(banana("mia-1699999990000", "leo"), RACE, RACERS)).toBe(false);
  });

  it("drops a different family race going on at the same time", () => {
    expect(isForThisRace(banana("zoe-1700000000500", "zoe"), RACE, RACERS)).toBe(false);
    expect(isForThisRace(banana(RACE, "zoe"), RACE, RACERS)).toBe(false);
  });

  it("the circuit's id is not a race id (every race on the track used to share it)", () => {
    expect(isForThisRace(banana("cucaino-karts-3", "leo"), RACE, RACERS)).toBe(false);
  });

  it("a racer dropping off the channel still counts, whoever else leaves does not", () => {
    expect(isForThisRace({ type: "leave", kidId: "leo" }, RACE, RACERS)).toBe(true);
    expect(isForThisRace({ type: "leave", kidId: "zoe" }, RACE, RACERS)).toBe(false);
  });

  it("lobby messages are never in-race messages", () => {
    expect(isForThisRace({ type: "accept", raceId: RACE, kidId: "leo" }, RACE, RACERS)).toBe(false);
  });
});
