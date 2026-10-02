import { describe, expect, it } from "vitest";
import { BRIDGES, POND, TRAIL_POINTS, bridgeDeckY, coastR } from "./island";
import { WATER_Y, groundY, slopeAt } from "./terrain";
import { worldFloorY } from "./harbours";
import {
  DUCK_BAY,
  FALLS,
  FALLS_DROP_M,
  JETTY,
  LAKE,
  LAKE_OUTLINE,
  MESA,
  OUTLET_POINTS,
  RIVER_LENGTH,
  RIVER_POINTS,
  U_PER_M,
  WATER_LEVEL,
  flowAt,
  lakeRadius,
  mesaRadius,
  riverAt,
  riverHalfWidth,
  waterSdf,
} from "./waterways";

const depth = (x: number, z: number) => WATER_Y - groundY(x, z);

describe("waterways", { timeout: 30000 }, () => {
  it("shares the sea's water level", () => {
    expect(WATER_LEVEL).toBe(WATER_Y);
  });

  it("drops Rainbow Falls 15-25 m off a tall mesa into a deep plunge pool", () => {
    expect(FALLS_DROP_M).toBeGreaterThan(15);
    expect(FALLS_DROP_M).toBeLessThan(25);
    // the lip is up on the mesa's edge, the pool at its foot
    expect(groundY(FALLS.lip.x - 1, FALLS.lip.z)).toBeGreaterThan(FALLS.lip.y - 2);
    expect(depth(FALLS.pool.x, FALLS.pool.z)).toBeGreaterThan(4);
    // a real cliff under the lip (steep), and the mesa's top is high all round
    expect(slopeAt(FALLS.lip.x + 1.5, FALLS.lip.z)).toBeGreaterThan(0.85);
    for (let a = 0; a < Math.PI * 2; a += 0.4) {
      const r = mesaRadius(a) - 3;
      expect(groundY(MESA.x + Math.sin(a) * r, MESA.z + Math.cos(a) * r), `mesa top ${a.toFixed(1)}`).toBeGreaterThan(28);
    }
  });

  it("winds a 6-10 m wide river from the pool into the lake, deep in the middle and wadeable at the edges", () => {
    for (let s = 0; s <= RIVER_LENGTH; s += 3) {
      const w = (riverHalfWidth(s) * 2) / U_PER_M;
      expect(w, `width at ${s.toFixed(0)}`).toBeGreaterThan(6);
      expect(w, `width at ${s.toFixed(0)}`).toBeLessThan(10.5);
    }
    let deep = 0;
    for (let i = 4; i < RIVER_POINTS.length - 4; i++) {
      const [x, z] = RIVER_POINTS[i];
      const at = `river ${i} @ ${x.toFixed(0)},${z.toFixed(0)}`;
      // continuous water all the way down
      expect(depth(x, z), at).toBeGreaterThan(1.2);
      if (depth(x, z) > 2.2) deep++;
      // the shallow edges: step in from the bank and you're wading (< the engine's swim depth)
      const { heading, half } = riverAt(x, z);
      for (const side of [-1, 1]) {
        const ex = x + Math.cos(heading) * side * (half - 0.8);
        const ez = z - Math.sin(heading) * side * (half - 0.8);
        if (waterSdf(ex, ez) > -0.2 || waterSdf(ex, ez) < -1.6) continue;
        expect(depth(ex, ez), `${at} edge`).toBeLessThan(0.9);
        expect(depth(ex, ez), `${at} edge`).toBeGreaterThan(0);
        // and the bank just beyond is dry
        const bx = x + Math.cos(heading) * side * (half + 2.5);
        const bz = z - Math.sin(heading) * side * (half + 2.5);
        if (waterSdf(bx, bz) > 1.5) expect(groundY(bx, bz), `${at} bank`).toBeGreaterThan(WATER_Y + 0.25);
      }
    }
    // swimmable most of the way (deep enough to dive under)
    expect(deep / (RIVER_POINTS.length - 8)).toBeGreaterThan(0.8);
    // it really runs downstream, toward the lake
    const f = { x: 0, z: 0 };
    for (let i = 3; i < RIVER_POINTS.length - 6; i += 5) {
      const [x, z] = RIVER_POINTS[i];
      const [nx, nz] = RIVER_POINTS[i + 3];
      flowAt(x, z, f);
      expect(f.x * (nx - x) + f.z * (nz - z), `flow at ${i}`).toBeGreaterThan(0);
      expect(Math.hypot(f.x, f.z)).toBeGreaterThan(0.5);
    }
  });

  it("fills a 50-80 m lake, deep enough to dive, that drains down its outlet to the sea", () => {
    let minX = Infinity;
    let maxX = -Infinity;
    for (const [x] of LAKE_OUTLINE) ((minX = Math.min(minX, x)), (maxX = Math.max(maxX, x)));
    const across = (maxX - minX) / U_PER_M;
    expect(across).toBeGreaterThan(50);
    expect(across).toBeLessThan(80);
    expect(depth(LAKE.x, LAKE.z) / U_PER_M).toBeGreaterThan(3);
    // shallow round the edge (wade in from the beach), dry ground just outside
    for (let a = 0; a < Math.PI * 2; a += 0.21) {
      const R = lakeRadius(a);
      const inX = LAKE.x + Math.sin(a) * (R - 1.2);
      const inZ = LAKE.z + Math.cos(a) * (R - 1.2);
      if (waterSdf(inX, inZ) < -2) continue; // (where the river comes in)
      expect(depth(inX, inZ), `shore ${a.toFixed(2)}`).toBeLessThan(0.9);
      const outX = LAKE.x + Math.sin(a) * (R + 3);
      const outZ = LAKE.z + Math.cos(a) * (R + 3);
      if (waterSdf(outX, outZ) > 1.5) expect(groundY(outX, outZ), `bank ${a.toFixed(2)}`).toBeGreaterThan(WATER_Y + 0.2);
    }
    // water all the way down the outlet, out past the beach
    for (const [x, z] of OUTLET_POINTS) expect(depth(x, z), `outlet ${x.toFixed(0)},${z.toFixed(0)}`).toBeGreaterThan(0.25);
    const [ex, ez] = OUTLET_POINTS[OUTLET_POINTS.length - 1];
    expect(Math.hypot(ex, ez)).toBeGreaterThan(coastR(Math.atan2(ex, ez)) + 6);
    // the ducks' bay is all water
    for (let a = 0; a < Math.PI * 2; a += 0.5) expect(waterSdf(DUCK_BAY.x + Math.sin(a) * DUCK_BAY.r, DUCK_BAY.z + Math.cos(a) * DUCK_BAY.r)).toBeLessThan(-0.5);
    expect(POND.x).toBe(DUCK_BAY.x);
  });

  it("has no phantom water: every inland spot below the waterline is in the river, the pool or the lake", () => {
    for (let z = -150; z <= 150; z += 3)
      for (let x = -150; x <= 150; x += 3) {
        const r = Math.hypot(x, z);
        if (r > coastR(Math.atan2(x, z)) - 3) continue;
        if (groundY(x, z) < WATER_Y) expect(waterSdf(x, z), `${x},${z}`).toBeLessThan(1);
      }
  });

  it("bridges every trail over the water (and never sends a trail through it)", () => {
    expect(BRIDGES.length).toBeGreaterThanOrEqual(2);
    for (const b of BRIDGES) {
      // the deck spans bank to bank, above the water
      for (let u = -0.5; u <= 0.5; u += 0.05) {
        const x = b.x + Math.sin(b.heading) * u * b.span * 0.98;
        const z = b.z + Math.cos(b.heading) * u * b.span * 0.98;
        expect(bridgeDeckY(x, z), `bridge ${b.x.toFixed(0)}`).not.toBeNull();
        expect(worldFloorY(x, z) - WATER_Y, `deck ${b.x.toFixed(0)}`).toBeGreaterThan(0.4);
      }
      // true size: a footbridge 2-3 m wide
      expect((b.half * 2) / U_PER_M).toBeGreaterThan(1.5);
      expect((b.half * 2) / U_PER_M).toBeLessThan(3.2);
      expect(waterSdf(b.x, b.z)).toBeLessThan(0);
    }
    for (const pts of TRAIL_POINTS)
      for (let i = 0; i + 1 < pts.length; i++)
        for (let u = 0; u < 1; u += 0.25) {
          const x = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * u;
          const z = pts[i][1] + (pts[i + 1][1] - pts[i][1]) * u;
          if (WATER_Y - worldFloorY(x, z) > 0.5) throw new Error(`trail under water at ${x.toFixed(1)},${z.toFixed(1)}`);
        }
  });

  it("walks out over the lake on the jetty", () => {
    for (let u = 0.1; u <= 1; u += 0.1) {
      const x = JETTY.ax + (JETTY.bx - JETTY.ax) * u;
      const z = JETTY.az + (JETTY.bz - JETTY.az) * u;
      expect(worldFloorY(x, z), `jetty ${u.toFixed(1)}`).toBeGreaterThan(WATER_Y + 0.6);
    }
    expect(depth(JETTY.bx, JETTY.bz)).toBeGreaterThan(1);
  });
});
