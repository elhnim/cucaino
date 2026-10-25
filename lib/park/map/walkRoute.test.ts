import { describe, expect, it } from "vitest";
import { walkRoute } from "./walkRoute";
import { FOOTPATHS } from "../registry/footpaths";

describe("walkRoute", () => {
  it("uses the park's trails inside the park", () => {
    const r = walkRoute({ x: 0, z: 20 }, { x: 60, z: -40 });
    expect(r.length).toBeGreaterThan(1);
    expect(r[r.length - 1]).toEqual([60, -40]);
    for (const [x, z] of r) expect(Math.hypot(x, z)).toBeLessThan(200);
  });

  it("never sends a Wildlands walk back through the park", () => {
    const from = { x: 1400, z: -600 };
    const to = { x: 1600, z: 300 };
    const r = walkRoute(from, to);
    const direct = Math.hypot(to.x - from.x, to.z - from.z);
    // no point of the route is further from the destination than the start was
    for (const [x, z] of r) expect(Math.hypot(x - to.x, z - to.z)).toBeLessThanOrEqual(direct + 1);
    expect(r[r.length - 1]).toEqual([to.x, to.z]);
  });

  it("follows a village's own footpath between its two ends, either way", () => {
    for (const f of FOOTPATHS) {
      const a = f.points[0];
      const b = f.points[f.points.length - 1];
      const out = walkRoute({ x: a[0] + 3, z: a[1] }, { x: b[0], z: b[1] + 2 });
      expect(out.length, f.settlementId).toBe(f.points.length + 1);
      const back = walkRoute({ x: b[0], z: b[1] + 2 }, { x: a[0] + 3, z: a[1] });
      expect(back[0], f.settlementId).toEqual(b);
    }
  });
});
