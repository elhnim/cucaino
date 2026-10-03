import { describe, expect, it } from "vitest";
import { FOOTPATHS, footpathOf, nearFootpath } from "./footpaths";
import { SETTLEMENTS } from "./settlements";
import { STATIONS } from "./railway";
import { wildWaterSdf } from "./wildWater";

describe("footpaths: a settlement's own walk to its station", () => {
  it("has one for every settlement with a station except Lakeside (its cart road already passes its station)", () => {
    const ids = FOOTPATHS.map((f) => f.settlementId).sort();
    expect(ids).toEqual(["highstone", "treetop"]);
  });

  it("each one runs from just outside its village to its own station, and names the right station", () => {
    for (const fp of FOOTPATHS) {
      const s = SETTLEMENTS.find((x) => x.id === fp.settlementId)!;
      expect(s).toBeTruthy();
      expect(fp.stationId).toBe(s.stationId);
      const st = STATIONS.find((x) => x.id === fp.stationId)!;
      expect(st).toBeTruthy();
      expect(fp.points.length).toBeGreaterThan(1);
      const first = fp.points[0];
      const last = fp.points[fp.points.length - 1];
      expect(Math.hypot(first[0] - s.x, first[1] - s.z)).toBeLessThan(s.radius + 15);
      expect(Math.hypot(last[0] - st.x, last[1] - st.z)).toBeLessThan(5);
    }
  });

  it("stays dry (or very close to it) the whole way, and never leaps unreasonably far between points", () => {
    for (const fp of FOOTPATHS) {
      for (const [x, z] of fp.points) expect(wildWaterSdf(x, z)).toBeGreaterThan(-1);
      for (let i = 1; i < fp.points.length; i++) {
        const [ax, az] = fp.points[i - 1];
        const [bx, bz] = fp.points[i];
        expect(Math.hypot(bx - ax, bz - az)).toBeLessThan(20);
      }
    }
  });

  it("footpathOf resolves by settlement id, and nearFootpath recognises its own tread", () => {
    expect(footpathOf("treetop")).toBeTruthy();
    expect(footpathOf("lakeside")).toBeUndefined();
    const fp = footpathOf("highstone")!;
    const mid = fp.points[Math.floor(fp.points.length / 2)];
    expect(nearFootpath(mid[0], mid[1])).toBe(true);
    expect(nearFootpath(mid[0] + 500, mid[1] + 500)).toBe(false);
  });
});
