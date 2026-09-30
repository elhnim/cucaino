import { describe, expect, it } from "vitest";
import {
  CLOUD_BOX,
  RIDGES,
  balloonAt,
  canopyR,
  cloudAt,
  fieldAt,
  gridIndex,
  isPine,
  openFields,
  pastureAt,
  planBalloons,
  planClouds,
  planFlocks,
  planForest,
  planMeadows,
  planPasture,
  planWindmills,
  stepFlock,
  treeLine,
  trunkObstacles,
  type FreeFn,
} from "./plan";
import { LANDS, PLACES } from "../../registry/places";
import { TRAIL_POINTS, coastR, nearStream, nearTrail } from "../../registry/island";
import { zoneBounds } from "../../builder/rules";

// a stand-in for the park's free() predicate (trails, places, plaza, Dream Park, stream, beach)
const zb = zoneBounds();
const free: FreeFn = (x, z, pad) => {
  const r = Math.hypot(x, z);
  if (r < 12 + pad || r > coastR(Math.atan2(x, z)) - 4 - pad) return false;
  if (x > zb.minX - pad && x < zb.maxX + pad && z > zb.minZ - pad && z < zb.maxZ + pad) return false;
  if (nearTrail(x, z, pad + 1.6) || nearStream(x, z, pad)) return false;
  return !PLACES.some((p) => Math.hypot(x - p.x, z - p.z) < Math.max(p.radius, 1.5) + pad + 1.2);
};

const meadows = planMeadows(free, { count: 8 });
const forest = planForest(free, { meadows });
const forestLow = planForest(free, { meadows: planMeadows(free, { count: 6 }), lowQuality: true });
const pasture = planPasture(free, forest.covered);

describe("open fields", () => {
  it("is zero on the trails and in the lands, and grows away from them", () => {
    const f = openFields();
    const [tx, tz] = TRAIL_POINTS[0][0];
    expect(fieldAt(f.trail, tx, tz)).toBe(0);
    for (const l of LANDS) expect(fieldAt(f.land, l.x, l.z)).toBe(0);
    expect(fieldAt(f.trail, tx + 20, tz)).toBeGreaterThan(fieldAt(f.trail, tx + 4, tz));
    expect(gridIndex(9999, 0)).toBe(-1);
  });
});

describe("dense forest", () => {
  it("is deterministic", () => {
    const again = planForest(free, { meadows });
    expect(again.trees.length).toBe(forest.trees.length);
    expect(again.trees.slice(0, 50)).toEqual(forest.trees.slice(0, 50));
  });

  it("plants thousands of trees, inside the triangle caps, fewer in low quality", () => {
    const pines = forest.trees.filter((t) => isPine(t.kind)).length;
    expect(forest.trees.length).toBeGreaterThan(1800);
    expect(forest.trees.length - pines).toBeLessThanOrEqual(2500);
    expect(pines).toBeLessThanOrEqual(1250);
    expect(pines).toBeGreaterThan(200);
    expect(forestLow.trees.length).toBeLessThan(forest.trees.length);
  });

  it("only grows where free() allows, on the island, never in a meadow", () => {
    for (const t of forest.trees) {
      expect(free(t.x, t.z, 0.8)).toBe(true);
      expect(Math.hypot(t.x, t.z)).toBeLessThan(coastR(Math.atan2(t.x, t.z)) - 3.9);
      for (const m of meadows) expect(Math.hypot(t.x - m.x, t.z - m.z)).toBeGreaterThan(m.r - 3);
      expect(Number.isFinite(t.y)).toBe(true);
    }
  });

  it("keeps crowns from piling into each other (Poisson spacing)", () => {
    const T = forest.trees;
    let worst = Infinity;
    for (let i = 0; i < T.length; i++)
      for (let j = i + 1; j < T.length; j++) {
        const d = Math.hypot(T[i].x - T[j].x, T[i].z - T[j].z);
        if (d > 12) continue;
        worst = Math.min(worst, d / (canopyR(T[i].kind, T[i].s) + canopyR(T[j].kind, T[j].s)));
      }
    expect(worst).toBeGreaterThanOrEqual(0.65);
  });

  it("leaves clearings round the lands", () => {
    for (const l of LANDS) for (const t of forest.trees) expect(Math.hypot(t.x - l.x, t.z - l.z)).toBeGreaterThan(l.radius + 1.5);
  });

  it("has a sane obstacle list (trunks only, small)", () => {
    const obs = trunkObstacles(forest.trees, 1400);
    expect(obs.length).toBeGreaterThan(300);
    expect(obs.length).toBeLessThanOrEqual(1400);
    for (const o of obs) expect(o.r).toBeLessThanOrEqual(1.2);
  });
});

describe("pasture, sheep and windmills", () => {
  it("pasture is open, free ground outside the woods", () => {
    let n = 0;
    for (let k = 0; k < pasture.ok.length; k++) if (pasture.ok[k]) (n++, expect(forest.covered[k]).toBe(0));
    expect(n).toBeGreaterThan(500);
  });

  it("puts 5..8 flocks of sheep in the meadows, all on pasture", () => {
    const flocks = planFlocks(pasture, { count: 7, sites: meadows });
    expect(flocks.length).toBeGreaterThanOrEqual(5);
    expect(flocks.length).toBeLessThanOrEqual(8);
    for (const f of flocks) {
      expect(f.sheep.length).toBeGreaterThanOrEqual(4);
      expect(f.sheep.length).toBeLessThanOrEqual(12);
      for (const s of f.sheep) expect(pastureAt(pasture, s.x, s.z)).toBe(true);
    }
  });

  it("flocks graze and wander for ten minutes without leaving the pasture or scattering", () => {
    const flocks = planFlocks(pasture, { count: 7, sites: meadows });
    const start = flocks.map((f) => [f.x, f.z]);
    let moved = 0;
    for (let t = 0; t < 600; t += 0.1) for (const f of flocks) stepFlock(f, pasture, 0.1, t);
    flocks.forEach((f, i) => {
      moved = Math.max(moved, Math.hypot(f.x - start[i][0], f.z - start[i][1]));
      expect(pastureAt(pasture, f.x, f.z)).toBe(true);
      for (const s of f.sheep) {
        expect(pastureAt(pasture, s.x, s.z)).toBe(true);
        expect(Math.hypot(s.x - f.x, s.z - f.z)).toBeLessThan(f.r + 8);
        expect(Number.isFinite(s.yaw) && s.walk >= 0 && s.walk <= 1).toBe(true);
      }
    });
    expect(moved).toBeGreaterThan(1); // they do amble about
  });

  it("stands 3..4 windmills on open ground, well apart", () => {
    const mills = planWindmills(pasture, { count: 4 });
    expect(mills.length).toBeGreaterThanOrEqual(3);
    for (const m of mills) expect(pastureAt(pasture, m.x, m.z)).toBe(true);
    for (let i = 0; i < mills.length; i++) for (let j = i + 1; j < mills.length; j++) expect(Math.hypot(mills[i].x - mills[j].x, mills[i].z - mills[j].z)).toBeGreaterThanOrEqual(50);
  });
});

describe("sky: balloons and clouds", () => {
  it("balloons drift over the island at 25..60 m", () => {
    const out = { x: 0, y: 0, z: 0, yaw: 0 };
    for (const b of planBalloons(5))
      for (let t = 0; t < 2000; t += 13) {
        balloonAt(b, t, out);
        expect(out.y).toBeGreaterThanOrEqual(24);
        expect(out.y).toBeLessThanOrEqual(62);
        expect(Math.hypot(out.x, out.z)).toBeLessThan(180);
      }
  });

  it("clouds float at 20..45 m and wrap round their box", () => {
    const clouds = planClouds(24, 3);
    for (const c of clouds) {
      expect(c.y).toBeGreaterThanOrEqual(20);
      expect(c.y).toBeLessThanOrEqual(45);
    }
    const o = { x: 0, z: 0 };
    for (let t = 0; t < 5000; t += 97) {
      cloudAt(clouds[3], t, 0.86, 0.5, o);
      expect(Math.abs(o.x)).toBeLessThanOrEqual(CLOUD_BOX);
      expect(Math.abs(o.z)).toBeLessThanOrEqual(CLOUD_BOX);
    }
  });
});

describe("painted horizon", () => {
  it("each ridge ring closes, and the farther ridges rise higher (they peek over)", () => {
    let prevMean = -Infinity;
    RIDGES.forEach((L, i) => {
      const top = treeLine(L, i, 600);
      expect(top.length).toBe(601);
      expect(top[600]).toBe(top[0]);
      let sum = 0;
      for (const y of top) {
        expect(y).toBeGreaterThanOrEqual(2);
        sum += y;
      }
      const mean = sum / top.length;
      expect(mean).toBeGreaterThan(prevMean);
      prevMean = mean;
      if (i > 0) expect(L.dist).toBeGreaterThan(RIDGES[i - 1].dist);
    });
  });
});
