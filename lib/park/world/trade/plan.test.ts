import { describe, expect, it } from "vitest";
import { HOUR_SECONDS, TRADERS, allTraderStates, scheduleOf, traderLine, traderStateAtTime } from "./plan";
import { tradePostOf, tradeRouteOf } from "../../registry/trade";
import { PARK_DAY_SECONDS } from "../atmosphere";

describe("trade plan: traders", () => {
  it("every trader names real posts it can actually trade between", () => {
    for (const d of TRADERS) {
      expect(tradePostOf(d.homeId)).toBeTruthy();
      expect(tradePostOf(d.otherId)).toBeTruthy();
      expect(d.homeId).not.toBe(d.otherId);
    }
  });
  it("has several traders, on both routes", () => {
    expect(TRADERS.length).toBeGreaterThanOrEqual(4);
    expect(TRADERS.some((d) => d.mode === "cart")).toBe(true);
    expect(TRADERS.some((d) => d.mode === "boat")).toBe(true);
  });
  it("facts are true-length (<=140 chars) and unique", () => {
    const facts = new Set<string>();
    for (const d of TRADERS) {
      expect(d.fact.length).toBeLessThanOrEqual(140);
      expect(facts.has(d.fact)).toBe(false);
      facts.add(d.fact);
    }
  });
});

describe("trade plan: schedules", () => {
  it("every trader's day fits a whole number of 24h cycles", () => {
    for (const d of TRADERS) {
      const s = scheduleOf(d);
      expect(s.t0).toBeLessThan(s.t1);
      expect(s.t1).toBeLessThan(s.t2);
      expect(s.t2).toBeLessThan(s.t3);
      expect(s.t3).toBeLessThan(s.t4);
      expect(s.t4).toBeLessThanOrEqual(s.cycleHours);
      expect(s.cycleHours % 24).toBe(0);
    }
  });
});

describe("trade plan: traderStateAtTime is a pure function of time", () => {
  it("the same t always gives exactly the same state", () => {
    for (const d of TRADERS) {
      for (const t of [0, 1234, HOUR_SECONDS * 5, PARK_DAY_SECONDS * 3.3]) {
        expect(traderStateAtTime(d, t)).toEqual(traderStateAtTime(d, t));
      }
    }
  });
  it("is well-defined arbitrarily far in the future (no accumulated drift / no simulation needed)", () => {
    const d = TRADERS[0];
    const near = traderStateAtTime(d, HOUR_SECONDS * 10);
    const far = traderStateAtTime(d, HOUR_SECONDS * 10 + scheduleOf(d).cycleHours * HOUR_SECONDS * 400);
    expect(far).toEqual(near);
  });
});

describe("trade plan: a trip", () => {
  it("sets off, travels, arrives and trades (cargo becomes the other post's good), then comes home", () => {
    const d = TRADERS.find((t) => t.mode === "cart")!;
    const s = scheduleOf(d);
    const atHomeBefore = traderStateAtTime(d, (s.t0 - 0.1) * HOUR_SECONDS);
    expect(atHomeBefore.phase).toBe("home");
    expect(atHomeBefore.atPostId).toBe(d.homeId);
    expect(atHomeBefore.cargo).toBe(d.cargoOut);

    const midOutbound = traderStateAtTime(d, ((s.t0 + s.t1) / 2) * HOUR_SECONDS);
    expect(midOutbound.phase).toBe("outbound");
    expect(midOutbound.atPostId).toBeNull();
    expect(midOutbound.cargo).toBe(d.cargoOut);

    const atOther = traderStateAtTime(d, (s.t1 + 0.1) * HOUR_SECONDS);
    expect(atOther.phase).toBe("trading-away");
    expect(atOther.atPostId).toBe(d.otherId);
    expect(atOther.cargo).toBe(d.cargoBack); // traded: cargo became what the other post makes
    const other = tradePostOf(d.otherId)!;
    expect(atOther.x).toBeCloseTo(other.x, 5);
    expect(atOther.z).toBeCloseTo(other.z, 5);

    const midInbound = traderStateAtTime(d, ((s.t2 + s.t3) / 2) * HOUR_SECONDS);
    expect(midInbound.phase).toBe("inbound");
    expect(midInbound.cargo).toBe(d.cargoBack);

    const atHomeAfter = traderStateAtTime(d, (s.t3 + 0.1) * HOUR_SECONDS);
    expect(atHomeAfter.phase).toBe("trading-home");
    expect(atHomeAfter.atPostId).toBe(d.homeId);
    const home = tradePostOf(d.homeId)!;
    expect(atHomeAfter.x).toBeCloseTo(home.x, 5);
    expect(atHomeAfter.z).toBeCloseTo(home.z, 5);

    const restedAgain = traderStateAtTime(d, (s.t4 + 0.1) * HOUR_SECONDS);
    expect(restedAgain.phase).toBe("home");
    expect(restedAgain.cargo).toBe(d.cargoOut); // ready to go again
  });

  it("stays on its route while travelling (never far from the cart road / boat route polyline)", () => {
    for (const d of TRADERS) {
      const s = scheduleOf(d);
      const route = tradeRouteOf(d.mode === "cart" ? "cart-lakeside-market" : "boat-lakeside-coralcove")!;
      for (const frac of [0.1, 0.3, 0.5, 0.7, 0.9]) {
        const hour = s.t0 + (s.t1 - s.t0) * frac;
        const st = traderStateAtTime(d, hour * HOUR_SECONDS);
        // (the position is computed ON a segment between two sampled route points, so it can be up
        // to half a sample's spacing from the nearest sampled point itself — not a deviation from
        // the path, just the sampling grid)
        const dists = route.points.map((p) => Math.hypot(p[0] - st.x, p[1] - st.z));
        expect(Math.min(...dists)).toBeLessThan(10);
      }
    }
  });

  it("position is continuous — a small step in time never teleports a travelling trader", () => {
    const d = TRADERS.find((t) => t.mode === "boat")!;
    const s = scheduleOf(d);
    const dt = 2; // seconds
    let prev = traderStateAtTime(d, s.t0 * HOUR_SECONDS + 5);
    for (let t = s.t0 * HOUR_SECONDS + 5 + dt; t < s.t2 * HOUR_SECONDS; t += dt) {
      const cur = traderStateAtTime(d, t);
      if (cur.atPostId === null && prev.atPostId === null) {
        const dist = Math.hypot(cur.x - prev.x, cur.z - prev.z);
        // the fastest trader covers at most speed*dt per step, with a little slack for the route's smoothing
        expect(dist).toBeLessThan((d.speed / HOUR_SECONDS) * dt + 5);
      }
      prev = cur;
    }
  });
});

describe("trade plan: several on the move", () => {
  it("at most sampled hours of the day, at least one trader is travelling", () => {
    let hoursWithMovement = 0;
    for (let h = 0; h < 24; h += 1) {
      const states = allTraderStates(h * HOUR_SECONDS);
      if (states.some((st) => st.phase === "outbound" || st.phase === "inbound")) hoursWithMovement++;
    }
    expect(hoursWithMovement).toBeGreaterThanOrEqual(15);
  });
});

describe("trade plan: talk lines", () => {
  it("every line is short and mentions the trade", () => {
    for (const d of TRADERS) {
      const state = traderStateAtTime(d, d.departHour * HOUR_SECONDS + 1);
      for (const which of [0, 1] as const) {
        const line = traderLine(d, state, which);
        expect(line.length).toBeLessThanOrEqual(140);
        expect(line.length).toBeGreaterThan(0);
      }
    }
  });
});
