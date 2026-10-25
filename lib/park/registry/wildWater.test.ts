import { describe, expect, it } from "vitest";
import { WILD_FALLS, WILD_LAKE, WILD_LAKE_OUTLINE, WILD_OUTLET_POINTS, WILD_RIVER_LENGTH, WILD_RIVER_POINTS, WILD_SHELF, WILD_WATER_BOUNDS, wildRainforestK, wildWaterSdf } from "./wildWater";
import { WATER_BODIES, waterBodyAt, waterDepthAt, waterSdf } from "./waterways";
import { WATER_Y, groundY } from "./terrain";
import { seaDist, WILDLANDS } from "./island";

const U = 1.6;

describe("the Wildlands' great waterway", () => {
  it("lies far out in the Wildlands, on the island", () => {
    const d = Math.hypot(WILD_LAKE.x, WILD_LAKE.z);
    expect(d).toBeGreaterThan(1000);
    expect(seaDist(WILD_LAKE.x, WILD_LAKE.z)).toBeLessThan(-400);
    expect(Math.hypot(WILD_LAKE.x - WILDLANDS.x, WILD_LAKE.z - WILDLANDS.z)).toBeLessThan(WILDLANDS.r);
  });

  it("the Great Falls drop ~25+ m off the shelf into a deep pool", () => {
    const top = groundY(WILD_SHELF.x, WILD_SHELF.z);
    expect(top).toBeGreaterThan(38);
    expect((WILD_FALLS.lip.y - WATER_Y) / U).toBeGreaterThan(24);
    // where the water lands is the pool, deep enough to swim
    const land = { x: WILD_FALLS.lip.x + Math.sin(WILD_FALLS.heading) * 7, z: WILD_FALLS.lip.z + Math.cos(WILD_FALLS.heading) * 7 };
    expect(waterSdf(land.x, land.z)).toBeLessThan(0);
    expect(waterBodyAt(WILD_FALLS.pool.x, WILD_FALLS.pool.z)).toBe(WATER_BODIES.pool);
    expect(WATER_Y - groundY(WILD_FALLS.pool.x, WILD_FALLS.pool.z)).toBeGreaterThan(2.5);
  });

  it("the Great Lake is 300–500 across, sandy at the edge, deep in the middle", () => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const [x] of WILD_LAKE_OUTLINE) {
      lo = Math.min(lo, x);
      hi = Math.max(hi, x);
    }
    expect(hi - lo).toBeGreaterThan(300);
    expect(hi - lo).toBeLessThan(500);
    expect(waterBodyAt(WILD_LAKE.x, WILD_LAKE.z)).toBe(WATER_BODIES.lake);
    expect(WATER_Y - groundY(WILD_LAKE.x, WILD_LAKE.z)).toBeGreaterThan(6);
    // the shallows: knee-deep a few metres in from the shore
    const [sx, sz] = WILD_LAKE_OUTLINE[40];
    const ix = sx + (WILD_LAKE.x - sx) * 0.02;
    const iz = sz + (WILD_LAKE.z - sz) * 0.02;
    expect(WATER_Y - groundY(ix, iz)).toBeLessThan(1.2);
  });

  it("the Wild River runs from the pool to the lake: wadeable at its edges, swimmable mid-stream", () => {
    expect(WILD_RIVER_LENGTH).toBeGreaterThan(300);
    const [ax, az] = WILD_RIVER_POINTS[0];
    expect(Math.hypot(ax - WILD_FALLS.pool.x, az - WILD_FALLS.pool.z)).toBeLessThan(WILD_FALLS.pool.r + 5);
    const [bx, bz] = WILD_RIVER_POINTS[WILD_RIVER_POINTS.length - 1];
    expect(wildWaterSdf(bx, bz)).toBeLessThan(0);
    for (let k = 4; k < WILD_RIVER_POINTS.length - 4; k += 9) {
      const [x, z] = WILD_RIVER_POINTS[k];
      expect(waterSdf(x, z)).toBeLessThan(-4);
      expect(WATER_Y - groundY(x, z), `mid ${k}`).toBeGreaterThan(1.2);
      // (a metre in from the bank: wading)
      const [nx, nz] = WILD_RIVER_POINTS[k + 1];
      const l = Math.hypot(nx - x, nz - z) || 1;
      let e = 0;
      while (waterSdf(x + (-(nz - z) / l) * e, z + ((nx - x) / l) * e) < -1.2 && e < 40) e += 0.25;
      expect(waterDepthAt(x + (-(nz - z) / l) * e, z + ((nx - x) / l) * e)).toBeLessThan(1.2);
    }
  });

  it("the outlet carries the lake out to the sea", () => {
    const end = WILD_OUTLET_POINTS[WILD_OUTLET_POINTS.length - 1];
    expect(seaDist(end[0], end[1])).toBeGreaterThan(0);
    for (let k = 4; k < WILD_OUTLET_POINTS.length - 10; k += 8) {
      const [x, z] = WILD_OUTLET_POINTS[k];
      expect(groundY(x, z), `outlet ${k}`).toBeLessThan(WATER_Y - 0.5);
    }
  });

  it("has no phantom water: every spot in its valley below the waterline is in the river, the pool or the lake", () => {
    let bad = 0;
    let where = "";
    const B = WILD_WATER_BOUNDS;
    for (let z = B.z0 + 3; z < B.z1 - 3; z += 6)
      for (let x = B.x0 + 3; x < B.x1 - 3; x += 6) {
        if (seaDist(x, z) > -8) continue;
        if (groundY(x, z) < WATER_Y && waterSdf(x, z) > 0.6) {
          bad++;
          where = `${x},${z}`;
        }
      }
    expect(bad, where).toBe(0);
  });

  it("grows a rainforest round the falls and along the upper river, not in the water", () => {
    const mid = WILD_RIVER_POINTS[Math.floor(WILD_RIVER_POINTS.length * 0.3)];
    const n = WILD_RIVER_POINTS[Math.floor(WILD_RIVER_POINTS.length * 0.3) + 1];
    const l = Math.hypot(n[0] - mid[0], n[1] - mid[1]);
    expect(wildRainforestK(mid[0] + (-(n[1] - mid[1]) / l) * 40, mid[1] + ((n[0] - mid[0]) / l) * 40)).toBeGreaterThan(0.6);
    expect(wildRainforestK(WILD_FALLS.pool.x, WILD_FALLS.pool.z)).toBe(0);
    expect(wildRainforestK(WILD_LAKE.x, WILD_LAKE.z)).toBe(0);
  });
});
