import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { SKY_ISLANDS, skyLocalHeight } from "../../registry/skyIslands";
import { buildSkyIslands, buildTop } from "./sky";
import { makeUniforms } from "./shaders";
import { ringCourse } from "../quests3d";

describe("sky island meshes", () => {
  it("builds each grassy top on exactly the registry's heightfield (feet sit on the grass)", () => {
    for (const s of SKY_ISLANDS) {
      const { geo, rim } = buildTop(s, 56);
      const pos = geo.attributes.position as THREE.BufferAttribute;
      let area = 0;
      for (let i = 0; i < pos.count; i += 3) {
        const ax = pos.getX(i), ay = pos.getY(i), az = pos.getZ(i);
        const bx = pos.getX(i + 1), by = pos.getY(i + 1), bz = pos.getZ(i + 1);
        const cx = pos.getX(i + 2), cy = pos.getY(i + 2), cz = pos.getZ(i + 2);
        // every triangle lies on the heightfield: its vertices and its centroid
        const mx = (ax + bx + cx) / 3;
        const mz = (az + bz + cz) / 3;
        expect(Math.abs((ay + by + cy) / 3 - skyLocalHeight(s, mx, mz)), s.id).toBeLessThan(2e-3);
        expect(Math.abs(ay - skyLocalHeight(s, ax, az))).toBeLessThan(2e-3);
        area += Math.abs((bx - ax) * (cz - az) - (cx - ax) * (bz - az)) / 2;
      }
      // ...and covers the whole walkable disc
      expect(area).toBeGreaterThan(Math.PI * s.r * s.r);
      for (const p of rim) expect(Math.abs(p.y - skyLocalHeight(s, p.x, p.z))).toBeLessThan(1e-4);
      geo.dispose();
    }
  });

  it("keeps the Sky Rings course clear of the islands", () => {
    for (const ring of ringCourse())
      for (const s of SKY_ISLANDS)
        if (Math.hypot(ring.x - s.x, ring.z - s.z) < s.r + 6) expect(s.y - s.depth, `${s.id} over a sky ring`).toBeGreaterThan(ring.y + 8);
  });

  it("stays in its triangle budget at both qualities, and opens chests", () => {
    const std = buildSkyIslands(makeUniforms(), {});
    const low = buildSkyIslands(makeUniforms(), { lowQuality: true });
    // the old 4 small islands were ~17k triangles; the budget is +120k
    expect(std.triangles).toBeLessThan(137000);
    expect(low.triangles).toBeLessThan(std.triangles * 0.75);
    expect(std.chests.length).toBe(3);
    std.setOpened([SKY_ISLANDS[0].id]);
    std.update(1);
    std.update(2);
    std.dispose();
    low.dispose();
  });
});
