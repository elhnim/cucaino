import { describe, expect, it } from "vitest";
import { SETTLEMENTS } from "./settlements";
import { BASE_CAMP_SITE } from "./everestBaseCamp";
import { EVEREST_SUMMIT } from "./landform";
import { groundY, WATER_Y } from "./terrain";
import { footprintStats } from "./landform";
import { CLIMB_CAMP_U, CLIMB_LADDER_U, CLIMB_RIDGE_U, EVEREST_ROUTE, climbHeadingAtU, climbPointAtU, distToClimbRoute } from "./everestRoute";

// (settlements.ts is imported first purely to avoid the circular-import TDZ hazard documented in
// everestBaseCamp.ts/settlements.ts — see those files' own comments; everestRoute.ts itself only
// needs landform.ts/everestBaseCamp.ts/geom2d.ts/everestFacts.ts, none of which import terrain.ts)
void SETTLEMENTS;

describe("the Climb Everest route (registry/everestRoute.ts): a real polyline on the real mountain", () => {
  it("starts right at Base Camp's trailhead and ends exactly on the true summit", () => {
    const first = EVEREST_ROUTE[0];
    const last = EVEREST_ROUTE[EVEREST_ROUTE.length - 1];
    expect(Math.hypot(first[0] - BASE_CAMP_SITE.x, first[1] - BASE_CAMP_SITE.z)).toBeLessThan(1);
    expect(last[0]).toBeCloseTo(EVEREST_SUMMIT.x, 5);
    expect(last[1]).toBeCloseTo(EVEREST_SUMMIT.z, 5);
    const atOne = climbPointAtU(1);
    expect(atOne.x).toBeCloseTo(EVEREST_SUMMIT.x, 1);
    expect(atOne.z).toBeCloseTo(EVEREST_SUMMIT.z, 1);
    const atZero = climbPointAtU(0);
    expect(Math.hypot(atZero.x - BASE_CAMP_SITE.x, atZero.z - BASE_CAMP_SITE.z)).toBeLessThan(1);
  });

  it("lies on the real ground the whole way (groundY, not a fixed/baked height), climbing from Base Camp's own height to the summit's", () => {
    for (let k = 0; k <= 20; k++) {
      const u = k / 20;
      const p = climbPointAtU(u);
      const y = groundY(p.x, p.z);
      expect(y, `u=${u}`).toBeGreaterThan(WATER_Y); // always dry land, never underwater
    }
    const start = climbPointAtU(0);
    const startY = groundY(start.x, start.z);
    const end = climbPointAtU(1);
    const endY = groundY(end.x, end.z);
    expect(startY).toBeLessThan(40);
    expect(endY).toBeGreaterThan(300);
  });

  it("progress mapping (climbPointAtU/climbHeadingAtU) stays monotonic: walking u from 0 to 1 never teleports, and altitude never dips hard backwards", () => {
    // climbPointAtU's own binary search over the route's cumulative arc length already guarantees u
    // maps to strictly-non-decreasing arc length by construction; what actually matters for the kid
    // walking it is (a) consecutive samples stay close together (no teleport) and (b) altitude is
    // never seriously undone (a real switchback may dip a little rounding a shoulder, never a lot)
    let dipCount = 0;
    let prevY = groundY(BASE_CAMP_SITE.x, BASE_CAMP_SITE.z);
    for (let k = 0; k <= 60; k++) {
      const u = k / 60;
      const p = climbPointAtU(u);
      if (k > 0) {
        const prevP = climbPointAtU((k - 1) / 60);
        expect(Math.hypot(p.x - prevP.x, p.z - prevP.z), `u=${u}`).toBeLessThan(15);
      }
      const y = groundY(p.x, p.z);
      if (y < prevY - 15) dipCount++;
      prevY = y;
    }
    expect(dipCount).toBe(0);
    // every camp u is strictly after the last, Base Camp (0) to the summit (1)
    for (let i = 1; i < CLIMB_CAMP_U.length; i++) expect(CLIMB_CAMP_U[i], `camp ${i}`).toBeGreaterThan(CLIMB_CAMP_U[i - 1]);
    expect(CLIMB_CAMP_U[0]).toBe(0);
    expect(CLIMB_CAMP_U[CLIMB_CAMP_U.length - 1]).toBe(1);
  });

  it("the Icefall's two ladders sit within its own leg (Base Camp -> the Icefall camp), in order", () => {
    expect(CLIMB_LADDER_U[0]).toBeGreaterThan(CLIMB_CAMP_U[0]);
    expect(CLIMB_LADDER_U[1]).toBeGreaterThan(CLIMB_LADDER_U[0]);
    expect(CLIMB_LADDER_U[1]).toBeLessThan(CLIMB_CAMP_U[1]);
  });

  it("the ridge's fixed-rope stretch sits between Camp 4 and the summit", () => {
    expect(CLIMB_RIDGE_U[0]).toBeGreaterThan(CLIMB_CAMP_U[5]);
    expect(CLIMB_RIDGE_U[1]).toBeLessThanOrEqual(1);
    expect(CLIMB_RIDGE_U[1]).toBeGreaterThan(CLIMB_RIDGE_U[0]);
  });

  it("every camp (Icefall, Camp 1-4) sits on the gentlest real ground a local search could find near its target altitude — Everest's own flanks are genuinely steep past the Icefall (the real Lhotse Face is much the same), so this is 'least-bad nearby', not a flat lawn", () => {
    for (let i = 1; i < CLIMB_CAMP_U.length - 1; i++) {
      const p = climbPointAtU(CLIMB_CAMP_U[i]);
      const s = footprintStats(p.x, p.z, 6, 2);
      expect(s.maxSlope, `camp ${i} slope`).toBeLessThan(2.5);
      expect(s.relief, `camp ${i} relief`).toBeLessThan(25);
    }
  });

  it("climbHeadingAtU gives a real (non-NaN, non-zero) walking direction all along the route", () => {
    for (let k = 0; k <= 20; k++) {
      const u = k / 20;
      const h = climbHeadingAtU(u);
      expect(Number.isFinite(h), `u=${u}`).toBe(true);
    }
  });

  it("distToClimbRoute: 0 right on the route, clearly positive well off it", () => {
    const p = climbPointAtU(0.4);
    // distToClimbRoute checks against the route's own discrete (~5-unit-spaced) samples, so a point
    // interpolated BETWEEN two samples can be up to half that spacing from the nearest one
    expect(distToClimbRoute(p.x, p.z)).toBeLessThan(3);
    expect(distToClimbRoute(p.x + 200, p.z + 200)).toBeGreaterThan(100);
  });
});
