import { describe, expect, it } from "vitest";
import * as R from "./roads";
import { RAIL_LENGTH, RAIL_POINTS, nearestRail } from "./railway";
import { TRAIN_V } from "../world/railway";
import { CANYON_SITE, CANYON_REACH, CANYON_TRAILHEAD } from "./grandCanyon";

// Where the roads meet the railway, re-derived from the live rail line (roads.ts keeps frozen copies
// of these numbers so it can stay a leaf module — this is what keeps the copies honest).
describe("roads and the railway", () => {
  const crossingsOfRail = () => {
    const out: { seg: string; x: number; z: number }[] = [];
    const N = RAIL_POINTS.length;
    for (const seg of R.ROAD_SEGMENTS)
      for (let i = 1; i < seg.points.length; i++) {
        const a = seg.points[i - 1];
        const b = seg.points[i];
        if (nearestRail((a.x + b.x) / 2, (a.z + b.z) / 2).d > 30) continue;
        for (let k = 0; k < N; k++) {
          const c = RAIL_POINTS[k];
          const d = RAIL_POINTS[(k + 1) % N];
          const rx = b.x - a.x;
          const rz = b.z - a.z;
          const qx = d[0] - c[0];
          const qz = d[1] - c[1];
          const den = rx * qz - rz * qx;
          if (Math.abs(den) < 1e-9) continue;
          const t = ((c[0] - a.x) * qz - (c[1] - a.z) * qx) / den;
          const u = ((c[0] - a.x) * rz - (c[1] - a.z) * rx) / den;
          if (t >= 0 && t < 1 && u >= 0 && u < 1) out.push({ seg: seg.id, x: a.x + rx * t, z: a.z + rz * t });
        }
      }
    return out;
  };

  it("every place a road crosses the rails is a level crossing, the overpass or a tunnel — none unmarked", () => {
    const xs = crossingsOfRail();
    expect(xs.length).toBeGreaterThan(0);
    for (const x of xs) {
      const marked =
        R.LEVEL_CROSSINGS.some((c) => Math.hypot(c.x - x.x, c.z - x.z) < 3) ||
        R.BRIDGES.some((b) => b.style === "overpass" && Math.hypot(b.x - x.x, b.z - x.z) < b.span / 2) ||
        R.TUNNELS.some((t) => R.tunnelDeckAt(t, x.x, x.z) !== null);
      expect(marked, `${x.seg} crosses the rails unmarked at (${x.x.toFixed(0)}, ${x.z.toFixed(0)})`).toBe(true);
    }
  });

  it("every level crossing really is on the rails and on a road, at the place along the line it says", () => {
    const xs = crossingsOfRail();
    for (const c of R.LEVEL_CROSSINGS) {
      const n = nearestRail(c.x, c.z);
      expect(n.d, `${c.id} is not on the rails`).toBeLessThan(1);
      expect(Math.abs(n.s - c.railS), `${c.id} railS`).toBeLessThan(2);
      expect(R.roadCentreDist(c.x, c.z), `${c.id} is not on a road`).toBeLessThan(1);
      expect(xs.some((x) => Math.hypot(x.x - c.x, x.z - c.z) < 3), `${c.id} is not where a road crosses`).toBe(true);
    }
  });

  it("the copied rail length and train speed match the real ones, and every boom comes down for the train", () => {
    expect(R.RAIL_LENGTH_COPY).toBeCloseTo(RAIL_LENGTH, 1);
    expect(R.TRAIN_V_COPY).toBe(TRAIN_V);
    for (const c of R.LEVEL_CROSSINGS) {
      expect(R.crossingBoomDown(c, c.railS - 50), c.id).toBe(true);
      expect(R.crossingBoomDown(c, c.railS + 3), c.id).toBe(true);
      expect(R.crossingBoomDown(c, c.railS - 500), c.id).toBe(false);
      // (and across the loop's seam)
      expect(R.crossingBoomDown(c, c.railS - 50 + RAIL_LENGTH), c.id).toBe(true);
    }
  });

  it("the canyon road ends at its trailhead car park, inside the wonder's reach but off the gorge itself", () => {
    const cp = R.CAR_PARKS.find((c) => c.id === "cp-canyon")!;
    expect(Math.hypot(cp.x - CANYON_SITE.x, cp.z - CANYON_SITE.z)).toBeLessThan(CANYON_REACH);
    expect(Math.hypot(cp.x - CANYON_TRAILHEAD.x, cp.z - CANYON_TRAILHEAD.z)).toBeLessThan(80);
  });
});
