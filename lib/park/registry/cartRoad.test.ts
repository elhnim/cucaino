import { describe, expect, it } from "vitest";
import { CART_ROAD, LAKESIDE_ROAD_END, MARKET_ROAD_END, nearCartRoad } from "./cartRoad";
import { wildWaterSdf } from "./wildWater";
import { waterSdf } from "./waterways";
import { nearRail, stationAt } from "./railway";
import { seaDist } from "./island";
import { LANDS } from "./places";
import { groundY } from "./terrain";

describe("cartRoad", () => {
  it("has a sensible number of points and ends at both markets", () => {
    expect(CART_ROAD.points.length).toBeGreaterThan(50);
    const first = CART_ROAD.points[0];
    const last = CART_ROAD.points[CART_ROAD.points.length - 1];
    expect(Math.hypot(first[0] - MARKET_ROAD_END[0], first[1] - MARKET_ROAD_END[1])).toBeLessThan(0.01);
    expect(Math.hypot(last[0] - LAKESIDE_ROAD_END[0], last[1] - LAKESIDE_ROAD_END[1])).toBeLessThan(0.01);
  });

  it("stays on dry land the whole way (the park's own river/pond, and the Wildlands' water)", () => {
    for (const [x, z] of CART_ROAD.points) {
      expect(seaDist(x, z)).toBeLessThan(-5); // well inland, never at the sea
      expect(waterSdf(x, z)).toBeGreaterThan(1); // clear of the park's river/pond/stream
      expect(wildWaterSdf(x, z)).toBeGreaterThan(0.2); // clear of the Wildlands' river/lake/outlet
    }
  });

  it("never comes within 4 m of the rail track except at a designated crossing", () => {
    let offCrossing = 0;
    for (const [x, z] of CART_ROAD.points) {
      const nearCrossing = CART_ROAD.crossings.some(([cx, cz]) => Math.hypot(x - cx, z - cz) < 35);
      if (nearRail(x, z, 4) && !nearCrossing) offCrossing++;
    }
    expect(offCrossing).toBe(0);
    // at most a couple of crossings, per the spec
    expect(CART_ROAD.crossings.length).toBeLessThanOrEqual(2);
  });

  it("keeps clear of every station's platform", () => {
    for (const [x, z] of CART_ROAD.points) expect(stationAt(x, z, 0)).toBeNull();
  });

  it("grades gently out in the Wildlands (excludes the stretch already inside a land's own flat terrace)", () => {
    let maxGrade = 0;
    let prevY: number | null = null;
    let prevP: [number, number] | null = null;
    for (const [x, z] of CART_ROAD.points) {
      const inLand = LANDS.some((l) => Math.hypot(x - l.x, z - l.z) < l.radius + 10);
      if (inLand) {
        prevY = null;
        prevP = null;
        continue;
      }
      const y = groundY(x, z);
      if (prevY !== null && prevP) {
        const d = Math.hypot(x - prevP[0], z - prevP[1]) || 1;
        maxGrade = Math.max(maxGrade, Math.abs(y - prevY) / d);
      }
      prevY = y;
      prevP = [x, z];
    }
    // gentler than a cliff, if steeper in a spot or two than the railway's own engineered 4% (the
    // road just follows a locally-smoothed version of whatever the Wildlands' hills are already
    // doing — no global multi-pass grade limiter like the rail's, so it stays cheap out there; see
    // the spec's "known limits")
    expect(maxGrade).toBeLessThan(0.7);
  });

  it("nearCartRoad finds points on the road and not far off it", () => {
    const [x, z] = CART_ROAD.points[Math.floor(CART_ROAD.points.length / 2)];
    expect(nearCartRoad(x, z, 0)).toBe(true);
    expect(nearCartRoad(x + 200, z + 200, 0)).toBe(false);
  });
});
