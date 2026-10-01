import { describe, expect, it } from "vitest";
import {
  ABYSS,
  ABYSS_BOUNDS,
  ABYSS_GRID,
  ABYSS_LENGTH,
  COLS,
  RIM_MARGIN,
  abyssCut,
  abyssDistance,
  abyssFloorY,
  abyssFrame,
  abyssPlainY,
  abyssProject,
  abyssVertexX,
  abyssVertexZ,
  depthAt,
  rimHalfAt,
} from "./abyss";
import { DEEP_FLOOR, TERRAIN_EXTENT, WRAP_R } from "./terrain";
import { VILLAGE_ISLAND, VILLAGE_SEA_R } from "./villageIsland";
import { dunes, seaFloorY } from "../world/sea/wander";

const G = ABYSS_GRID;
const W = G.cols + 1;
const rnd = (() => {
  let s = 12345;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
})();

describe("the Midnight Rift (registry)", () => {
  it("has the shape asked for: a long winding crack, 36-72 m wide (room for true-size giants), ~85-115 m deep", () => {
    expect(ABYSS.id).toBe("midnight-rift");
    expect(ABYSS.name.length).toBeGreaterThan(3);
    expect(ABYSS_LENGTH).toBeGreaterThan(300);
    expect(ABYSS_LENGTH).toBeLessThan(460);
    expect(ABYSS.path.length).toBeGreaterThan(20);
    expect(ABYSS.width).toBeGreaterThan(55);
    expect(ABYSS.width).toBeLessThanOrEqual(72);
    expect(ABYSS.depth).toBeGreaterThan(85);
    let lo = 0;
    for (const y of G.y) lo = Math.min(lo, y);
    expect(lo).toBeLessThan(-105);
    expect(lo).toBeGreaterThan(-140);
    // the rim is at least 34 m across along its body (a 26-unit megalodon can turn round)
    for (let s = 70; s < ABYSS_LENGTH - 70; s += 5) expect(rimHalfAt(s) * 2).toBeGreaterThanOrEqual(34);
  });

  it("repeats the plain's numbers exactly (DEEP_FLOOR, the dunes)", () => {
    for (let k = 0; k < 200; k++) {
      const x = -300 + rnd() * 600;
      const z = -700 + rnd() * 400;
      expect(abyssPlainY(x, z)).toBeCloseTo(DEEP_FLOOR + dunes(x, z), 10);
    }
  });

  it("sits in open sea, clear of the park, Coralcove Isle and the world's wrap", () => {
    for (let i = 0; i < G.rows; i++)
      for (const j of [0, G.cols / 2, G.cols]) {
        const x = abyssVertexX(i, j);
        const z = abyssVertexZ(i, j);
        // off the main island's height grid (and its 12 m slope down to the plain)
        expect(Math.max(Math.abs(x) - TERRAIN_EXTENT, Math.abs(z) - TERRAIN_EXTENT)).toBeGreaterThan(40);
        expect(Math.hypot(x - VILLAGE_ISLAND.x, z - VILLAGE_ISLAND.z)).toBeGreaterThan(VILLAGE_SEA_R + 40);
        expect(Math.hypot(x, z)).toBeLessThan(WRAP_R - 50);
        // (well away from the dinosaur island being built round (-330, 300))
        expect(Math.hypot(x + 330, z - 300)).toBeGreaterThan(300);
      }
  });

  it("the strip never folds over itself (the rows don't cross)", () => {
    for (let i = 1; i < G.rows - 1; i++) {
      const a1 = Math.atan2(G.nx[i], G.nz[i]);
      const a2 = Math.atan2(G.nx[i + 1], G.nz[i + 1]);
      let d = Math.abs(a2 - a1);
      if (d > Math.PI) d = Math.PI * 2 - d;
      const R = 2 / Math.max(1e-9, d);
      expect(R).toBeGreaterThan(G.half[i] * 1.1);
    }
  });

  it("abyssFloorY is exactly the canyon mesh: every vertex, and inside every triangle", () => {
    for (let i = 0; i < G.rows; i += 3)
      for (let j = 0; j <= COLS; j += 2) {
        const y = abyssFloorY(abyssVertexX(i, j), abyssVertexZ(i, j));
        expect(y).not.toBeNull();
        expect(Math.abs((y as number) - G.y[i * W + j])).toBeLessThan(1e-6);
      }
    // triangle centres (both triangles of random quads)
    for (let k = 0; k < 2000; k++) {
      const i = Math.floor(rnd() * (G.rows - 1));
      const j = Math.floor(rnd() * COLS);
      const P = (ii: number, jj: number) => [abyssVertexX(ii, jj), abyssVertexZ(ii, jj), G.y[ii * W + jj]];
      const tris = [
        [P(i, j), P(i + 1, j), P(i, j + 1)],
        [P(i, j + 1), P(i + 1, j), P(i + 1, j + 1)],
      ];
      for (const t of tris) {
        const x = (t[0][0] + t[1][0] + t[2][0]) / 3;
        const z = (t[0][1] + t[1][1] + t[2][1]) / 3;
        const y = (t[0][2] + t[1][2] + t[2][2]) / 3;
        expect(Math.abs((abyssFloorY(x, z) as number) - y)).toBeLessThan(1e-5);
      }
    }
  });

  it("is never above the plain, meets it exactly at the strip's edge, and is null outside", () => {
    for (let k = 0; k < 3000; k++) {
      const x = ABYSS_BOUNDS.minX + rnd() * (ABYSS_BOUNDS.maxX - ABYSS_BOUNDS.minX);
      const z = ABYSS_BOUNDS.minZ + rnd() * (ABYSS_BOUNDS.maxZ - ABYSS_BOUNDS.minZ);
      const y = abyssFloorY(x, z);
      if (y === null) continue;
      expect(y).toBeLessThanOrEqual(abyssPlainY(x, z) + 0.02);
    }
    for (let i = 0; i < G.rows; i++)
      for (const j of [0, COLS]) {
        const x = abyssVertexX(i, j);
        const z = abyssVertexZ(i, j);
        expect(G.y[i * W + j]).toBeCloseTo(abyssPlainY(x, z), 9);
        // just outside the strip: nothing (the plain takes over)
        const cx = G.cx[i];
        const cz = G.cz[i];
        const l = Math.hypot(x - cx, z - cz);
        expect(abyssFloorY(cx + ((x - cx) / l) * (l + 0.5), cz + ((z - cz) / l) * (l + 0.5))).toBeNull();
      }
    expect(abyssFloorY(0, 0)).toBeNull();
    expect(abyssFloorY(285, -300)).toBeNull();
  });

  it("the plain's own sea floor agrees at the strip's edge (no seam, no gap)", () => {
    // seaFloorY out here is the plain (or, once the engine folds the rift in, min(plain, rift))
    for (let i = 0; i < G.rows; i += 2)
      for (const j of [0, 1, COLS - 1, COLS]) {
        const x = abyssVertexX(i, j);
        const z = abyssVertexZ(i, j);
        expect(Math.abs(seaFloorY(x, z) - G.y[i * W + j])).toBeLessThan(0.02);
      }
  });

  it("is continuous: no jumps anywhere across the crack", () => {
    for (let k = 0; k < 60; k++) {
      const s = 10 + rnd() * (ABYSS_LENGTH - 20);
      const f = abyssFrame(s, { x: 0, z: 0, nx: 0, nz: 0 });
      let prev: number | null = null;
      for (let u = -45; u <= 45; u += 0.05) {
        const x = f.x + f.nx * u;
        const z = f.z + f.nz * u;
        const y = abyssFloorY(x, z) ?? abyssPlainY(x, z);
        expect(Number.isFinite(y)).toBe(true);
        if (prev !== null) expect(Math.abs(y - prev)).toBeLessThan(3.5);
        prev = y;
      }
    }
  }, 30_000); // (heavy: give it room when the whole suite runs in parallel)

  it("the rim is at plain height, the floor is deep, and ledges step the walls", () => {
    for (let s = 60; s < ABYSS_LENGTH - 60; s += 11) {
      const rim = rimHalfAt(s);
      expect(abyssCut(s, rim)).toBe(0);
      expect(abyssCut(s, -rim)).toBe(0);
      expect(abyssCut(s, rim + 1)).toBe(0);
      expect(abyssCut(s, 0)).toBeGreaterThan(depthAt(s) * 0.9);
      // somewhere on each wall there's a flattish ledge (a gentle stretch between cliffs)
      for (const side of [1, -1]) {
        let flat = 0;
        for (let u = rim * 0.35; u < rim * 0.95; u += 0.25) if (Math.abs(abyssCut(s, side * (u + 0.25)) - abyssCut(s, side * u)) < 0.3) flat++;
        expect(flat).toBeGreaterThan(3);
      }
    }
  });

  it("abyssProject / abyssFrame: canyon coordinates round-trip", () => {
    for (let k = 0; k < 500; k++) {
      const s = 5 + rnd() * (ABYSS_LENGTH - 10);
      const u = (rnd() * 2 - 1) * rimHalfAt(s);
      const f = abyssFrame(s, { x: 0, z: 0, nx: 0, nz: 0 });
      const c = abyssProject(f.x + f.nx * u, f.z + f.nz * u);
      expect(c).not.toBeNull();
      expect(Math.abs(c!.s - s)).toBeLessThan(0.1);
      expect(Math.abs(c!.u - u)).toBeLessThan(0.1);
    }
  });

  it("abyssDistance: 0 over the crack, the distance out from the rim beyond it", () => {
    for (let s = 40; s < ABYSS_LENGTH - 40; s += 13) {
      const f = abyssFrame(s, { x: 0, z: 0, nx: 0, nz: 0 });
      expect(abyssDistance(f.x, f.z)).toBe(0);
      const rim = rimHalfAt(s);
      const d = abyssDistance(f.x + f.nx * (rim + 2), f.z + f.nz * (rim + 2));
      expect(d).toBeGreaterThan(1.5);
      expect(d).toBeLessThan(2.6);
      const far = abyssDistance(f.x + f.nx * (rim + 60), f.z + f.nz * (rim + 60));
      expect(far).toBeGreaterThan(40);
    }
    expect(abyssDistance(0, 0)).toBeGreaterThan(300);
    expect(RIM_MARGIN).toBeGreaterThan(1.5);
  });

  it("is fast enough to be the sea floor (the engine calls it a lot)", () => {
    const t0 = performance.now();
    let acc = 0;
    for (let k = 0; k < 100000; k++) {
      const y = abyssFloorY(-150 + (k % 997) * 0.33, -520 + ((k * 7) % 541) * 0.26);
      if (y !== null) acc += y;
    }
    expect(Number.isFinite(acc)).toBe(true);
    expect(performance.now() - t0).toBeLessThan(400);
  });
});
