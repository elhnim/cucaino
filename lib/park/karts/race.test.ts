import { describe, expect, it } from "vitest";
import { createRace, dropKart, isRaceOver, positionOf, positions, raceResults, updateKartProgress } from "./race";

const LEN = 400;

describe("kart race state machine", () => {
  it("starts everyone on lap 1, nobody finished", () => {
    const r = createRace(["a", "b"], 3, LEN, 0);
    expect(r.karts.a.lap).toBe(1);
    expect(r.karts.a.finished).toBe(false);
    expect(isRaceOver(r)).toBe(false);
  });

  it("ranks by distance while racing", () => {
    const r = createRace(["a", "b", "c"], 3, LEN, 0);
    updateKartProgress(r, "a", 100, 1, 1000);
    updateKartProgress(r, "b", 250, 1, 1000);
    updateKartProgress(r, "c", 40, 1, 1000);
    expect(positions(r)).toEqual(["b", "a", "c"]);
    expect(positionOf(r, "b")).toBe(1);
    expect(positionOf(r, "c")).toBe(3);
  });

  it("records a lap time and best lap when a kart's lap count rises", () => {
    const r = createRace(["a"], 3, LEN, 0);
    updateKartProgress(r, "a", LEN - 1, 1, 500);
    updateKartProgress(r, "a", LEN + 5, 2, 20_000); // crossed the line: lap 1 -> 2
    expect(r.karts.a.lastLapMs).toBe(20_000);
    expect(r.karts.a.bestLapMs).toBe(20_000);
    updateKartProgress(r, "a", LEN * 2 + 5, 3, 35_000); // a faster lap 2
    expect(r.karts.a.lastLapMs).toBe(15_000);
    expect(r.karts.a.bestLapMs).toBe(15_000);
    updateKartProgress(r, "a", LEN * 2 + 10, 3, 36_000); // a slower partial update, no new lap yet
    expect(r.karts.a.bestLapMs).toBe(15_000); // unchanged
  });

  it("finishes a kart once its lap count passes the race's lap total", () => {
    const r = createRace(["a"], 2, LEN, 0);
    updateKartProgress(r, "a", LEN - 1, 1, 1000);
    updateKartProgress(r, "a", LEN + 1, 2, 20_000);
    expect(r.karts.a.finished).toBe(false);
    updateKartProgress(r, "a", LEN * 2 + 1, 3, 40_000);
    expect(r.karts.a.finished).toBe(true);
    expect(r.karts.a.finishMs).toBe(40_000);
  });

  it("finished karts always rank ahead of still-racing karts, earliest finish first", () => {
    const r = createRace(["a", "b", "c"], 1, LEN, 0);
    updateKartProgress(r, "a", LEN + 1, 2, 30_000); // finishes 2nd (later time)
    updateKartProgress(r, "b", LEN + 1, 2, 20_000); // finishes 1st
    updateKartProgress(r, "c", LEN * 0.4, 1, 20_000); // still racing
    expect(positions(r)).toEqual(["b", "a", "c"]);
  });

  it("a dropped (disconnected) kart keeps its place but ranks behind anyone still racing", () => {
    const r = createRace(["a", "b"], 3, LEN, 0);
    updateKartProgress(r, "a", 200, 1, 1000);
    updateKartProgress(r, "b", 50, 1, 1000);
    dropKart(r, "a");
    expect(positions(r)).toEqual(["b", "a"]);
  });

  it("isRaceOver is true once every kart has finished or dropped", () => {
    const r = createRace(["a", "b"], 1, LEN, 0);
    expect(isRaceOver(r)).toBe(false);
    updateKartProgress(r, "a", LEN + 1, 2, 10_000);
    expect(isRaceOver(r)).toBe(false);
    dropKart(r, "b");
    expect(isRaceOver(r)).toBe(true);
  });

  it("raceResults gives a 1-based position, total time and best lap per kart", () => {
    const r = createRace(["a", "b"], 1, LEN, 1_000);
    updateKartProgress(r, "a", LEN + 1, 2, 11_000);
    updateKartProgress(r, "b", LEN * 0.5, 1, 11_000);
    dropKart(r, "b");
    const results = raceResults(r);
    expect(results[0]).toMatchObject({ id: "a", position: 1, totalMs: 10_000, finished: true });
    expect(results[1]).toMatchObject({ id: "b", position: 2, totalMs: null, finished: false });
  });

  it("never lets distance (or position) go backwards from a rescue pop-back/bump", () => {
    const r = createRace(["a"], 3, LEN, 0);
    updateKartProgress(r, "a", 150, 1, 1000);
    updateKartProgress(r, "a", 90, 1, 1200); // a bump/rescue nudged it back locally
    expect(r.karts.a.distTotal).toBe(150);
  });
});
