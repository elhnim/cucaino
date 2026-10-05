import { describe, expect, it } from "vitest";
import { formatEta, planTrip } from "./planner";
import { STATIC_ENTITIES } from "./entities";

const questBoard = STATIC_ENTITIES.find((e) => e.category === "quest")!;
const lakeside = STATIC_ENTITIES.find((e) => e.id === "lakeside")!;
const parkStation = STATIC_ENTITIES.find((e) => e.id === "park-station")!;
const everest = STATIC_ENTITIES.find((e) => e.id === "everest")!;
const coralcove = STATIC_ENTITIES.find((e) => e.category === "island" && !e.id.startsWith("dock:") && e.remote)!;

const FROM_PLAZA = { x: 0, z: 0 };

describe("planTrip", () => {
  it("always offers a walk to a nearby, non-remote place (the Quest Board)", () => {
    const options = planTrip(FROM_PLAZA, questBoard);
    expect(options.some((o) => o.mode === "walk")).toBe(true);
    expect(options[0].etaMin).toBeGreaterThan(0);
  });

  it("offers a train option for a far Wildlands settlement, and prefers it to walking", () => {
    const options = planTrip(FROM_PLAZA, lakeside);
    const walk = options.find((o) => o.mode === "walk")!;
    const train = options.find((o) => o.mode === "train" || o.mode === "jeep")!;
    expect(walk).toBeTruthy();
    expect(train).toBeTruthy();
    expect(train.etaMin).toBeLessThan(walk.etaMin);
    // the fastest option overall is the train-based one
    expect(options[0].mode).not.toBe("walk");
  });

  it("every leg of the fastest route points somewhere and says what to do", () => {
    const [best] = planTrip(FROM_PLAZA, lakeside);
    expect(best.legs.length).toBeGreaterThan(0);
    for (const leg of best.legs) {
      expect(leg.instruction.length).toBeGreaterThan(0);
      expect(Number.isFinite(leg.x)).toBe(true);
      expect(Number.isFinite(leg.z)).toBe(true);
      expect(leg.etaSec).toBeGreaterThanOrEqual(0);
    }
  });

  it("never offers 'fly' unless the context says a dragon is available", () => {
    const grounded = planTrip(FROM_PLAZA, everest, { canFly: false });
    expect(grounded.some((o) => o.mode === "fly")).toBe(false);
    const flying = planTrip(FROM_PLAZA, everest, { canFly: true });
    expect(flying.some((o) => o.mode === "fly")).toBe(true);
  });

  it("offers a boat for a remote island and no walk-the-whole-way option", () => {
    const options = planTrip(FROM_PLAZA, coralcove);
    expect(options.some((o) => o.mode === "boat")).toBe(true);
    expect(options.some((o) => o.mode === "walk")).toBe(false);
  });

  it("never offers a boat to a floating sky island/mountain — only flying gets you there", () => {
    const sky = STATIC_ENTITIES.find((e) => e.category === "mountain" && e.remote);
    if (sky) {
      const grounded = planTrip(FROM_PLAZA, sky, { canFly: false });
      expect(grounded.some((o) => o.mode === "boat")).toBe(false);
      expect(grounded.some((o) => o.mode === "walk")).toBe(false);
      const flying = planTrip(FROM_PLAZA, sky, { canFly: true });
      expect(flying.some((o) => o.mode === "fly")).toBe(true);
    }
  });

  it("reaches every destination with at least one option", () => {
    for (const e of STATIC_ENTITIES) {
      const options = planTrip(FROM_PLAZA, e, { canFly: true });
      expect(options.length, `${e.id} has no route`).toBeGreaterThan(0);
    }
  });

  it("ETA is monotonic: a station twice as far down the line never comes back faster", () => {
    const park = STATIC_ENTITIES.find((e) => e.id === "park-station")!;
    const falls = STATIC_ENTITIES.find((e) => e.id === "falls-station")!;
    const peak = STATIC_ENTITIES.find((e) => e.id === "peak-station")!;
    const toPark = planTrip(FROM_PLAZA, park)[0].etaMin;
    const toFalls = planTrip(FROM_PLAZA, falls)[0].etaMin;
    const toPeak = planTrip(FROM_PLAZA, peak)[0].etaMin;
    expect(toPark).toBeLessThan(toFalls);
    expect(toFalls).toBeLessThan(toPeak);
  });

  it("formatEta reads naturally in seconds or minutes", () => {
    expect(formatEta(0.1)).toMatch(/s$/);
    expect(formatEta(3)).toBe("3 min");
  });
});
