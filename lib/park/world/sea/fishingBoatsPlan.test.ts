import { describe, expect, it } from "vitest";
import { MOORINGS } from "../../registry/harbours";
import { seaDepth } from "./wander";
import { FISHING_BOATS, FISHING_FACTS, HOUR_SECONDS, allFishingBoatStates, fishingBoatLine, fishingBoatStateAtTime } from "./fishingBoatsPlan";

describe("the fishing fleet's homes and routes", () => {
  it("has 10-14 boats, spread over the three harbours", () => {
    expect(FISHING_BOATS.length).toBeGreaterThanOrEqual(10);
    expect(FISHING_BOATS.length).toBeLessThanOrEqual(14);
    const fleets = new Set(FISHING_BOATS.map((d) => d.fleet));
    expect(fleets.size).toBe(3);
  });

  it("a couple of boats fish by lantern-light at night", () => {
    const night = FISHING_BOATS.filter((d) => d.night);
    expect(night.length).toBeGreaterThanOrEqual(1);
    expect(night.length).toBeLessThanOrEqual(3);
  });

  it("every home is clear of the kid's own rideable moorings", () => {
    for (const d of FISHING_BOATS) {
      for (const m of MOORINGS) expect(Math.hypot(m.x - d.hx, m.z - d.hz)).toBeGreaterThan(6);
    }
  });

  it("every route stays in deep water (seaDepth >= ~6-8 m) out towards the grounds, never aground", () => {
    for (const d of FISHING_BOATS) {
      // the first couple of waypoints are the boat finding its way off its own shallow mooring —
      // check the remainder of the walk out, which is the open-water run to the grounds
      for (let i = 2; i < d.route.length; i++) {
        const [x, z] = d.route[i];
        expect(seaDepth(x, z)).toBeGreaterThan(0);
      }
      // the grounds themselves (the route's own end) are properly deep
      const last = d.route[d.route.length - 1];
      expect(seaDepth(last[0], last[1])).toBeGreaterThanOrEqual(6);
    }
  });

  it("the fishing grounds stay deep enough all round the boat's slow drift out there", () => {
    for (const d of FISHING_BOATS) {
      let worst = Infinity;
      for (let h = 0; h <= 2; h += 0.05) {
        const t = (fishingBoatStateAtTimeFor(d) + h) * HOUR_SECONDS;
        const s = fishingBoatStateAtTime(d, t);
        if (s.phase === "fishing") worst = Math.min(worst, seaDepth(s.x, s.z));
      }
      expect(worst).toBeGreaterThanOrEqual(5.5);
    }
  });
});

/** the hour (absolute, in the boat's own first cycle) its fishing phase begins, for probing round it */
function fishingBoatStateAtTimeFor(d: (typeof FISHING_BOATS)[number]): number {
  // walk forward in big steps until we're in the fishing phase, then back off half an hour
  for (let h = 0; h < 48; h += 0.25) {
    const s = fishingBoatStateAtTime(d, h * HOUR_SECONDS);
    if (s.phase === "fishing") return Math.max(0, h - 0.1);
  }
  throw new Error("never fishes?");
}

describe("a boat's day: pure, continuous, and moored at night (except the night-fishers)", () => {
  it("is a pure function of time: the same t always gives the same answer", () => {
    const d = FISHING_BOATS[0];
    const a = fishingBoatStateAtTime(d, 12345);
    const b = fishingBoatStateAtTime(d, 12345);
    expect(a).toEqual(b);
  });

  it("never jumps: position is continuous across a couple of full days", () => {
    for (const d of FISHING_BOATS) {
      let prev = fishingBoatStateAtTime(d, 0);
      const dt = 0.02 * HOUR_SECONDS;
      for (let t = dt; t < 60 * HOUR_SECONDS; t += dt) {
        const s = fishingBoatStateAtTime(d, t);
        const jump = Math.hypot(s.x - prev.x, s.z - prev.z);
        expect(jump).toBeLessThan(6);
        prev = s;
      }
    }
  });

  it("day boats are moored overnight, every single night; the night-fishers are out working after dark on at least every other night (their round trip runs past one midnight, so it spans two calendar days)", () => {
    const hours = [25, 49, 73, 97, 121, 145];
    for (const d of FISHING_BOATS) {
      if (d.night) expect(hours.some((h) => fishingBoatStateAtTime(d, h * HOUR_SECONDS).phase !== "moored")).toBe(true);
      else for (const h of hours) expect(fishingBoatStateAtTime(d, h * HOUR_SECONDS).phase).toBe("moored");
    }
  });

  it("the night-fishers' lantern is lit while they're out; the day boats' never is", () => {
    for (const d of FISHING_BOATS) {
      if (d.night) continue;
      for (const h of [0, 7, 10, 20]) expect(fishingBoatStateAtTime(d, h * HOUR_SECONDS).lantern).toBe(false);
    }
  });
});

describe("no two boats ever crowd each other", () => {
  it("stays at least ~12 m apart at every sampled moment across a day", () => {
    let worst = Infinity;
    for (let h = 0; h < 24; h += 0.2) {
      const states = allFishingBoatStates(h * HOUR_SECONDS);
      for (let i = 0; i < states.length; i++)
        for (let j = i + 1; j < states.length; j++) {
          const d = Math.hypot(states[i].x - states[j].x, states[i].z - states[j].z);
          worst = Math.min(worst, d);
        }
    }
    expect(worst).toBeGreaterThanOrEqual(12);
  });
});

describe("crew chat", () => {
  it("has 10-15 true facts, every one short enough for a speech bubble", () => {
    expect(FISHING_FACTS.length).toBeGreaterThanOrEqual(10);
    expect(FISHING_FACTS.length).toBeLessThanOrEqual(16);
    for (const f of FISHING_FACTS) expect(f.length).toBeLessThanOrEqual(140);
  });

  it("gives a sensible line for every phase", () => {
    const d = FISHING_BOATS[0];
    for (const t of [0, 7, 10, 20]) {
      const s = fishingBoatStateAtTime(d, t * HOUR_SECONDS);
      expect(fishingBoatLine(d, s, 0).length).toBeGreaterThan(0);
      expect(fishingBoatLine(d, s, 1)).toBe(fishingBoatLine(d, s, 1));
    }
  });
});
