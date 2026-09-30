import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { SKY_ISLANDS, SKY_RUNE_STONES, SKY_SPOTS, skyLocalHeight, skyTopY } from "../../registry/skyIslands";
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

  it("lights rune stones as the kid stands on them, and solves the circle when all are lit", () => {
    const sky = buildSkyIslands(makeUniforms(), { lowQuality: true });
    const c = SKY_SPOTS.find((s) => s.kind === "stones")!;
    const stones = SKY_RUNE_STONES.filter((s) => s.spot === c.id);
    sky.update(1);
    // flying over a stone doesn't count
    sky.setKid(stones[0].x, skyTopY(stones[0].x, stones[0].z, 1)!.y + 8, stones[0].z);
    expect(sky.puzzleState().find((p) => p.id === c.id)).toEqual({ id: c.id, lit: 0, total: 5, done: false });
    for (const st of stones.slice(0, 3)) sky.setKid(st.x, skyTopY(st.x, st.z, 1)!.y, st.z);
    expect(sky.puzzleState().find((p) => p.id === c.id)!.lit).toBe(3);
    // wander away: an unfinished circle goes back to sleep
    sky.setKid(c.x + 60, 0, c.z);
    expect(sky.puzzleState().find((p) => p.id === c.id)!.lit).toBe(0);
    for (const st of stones) sky.setKid(st.x, skyTopY(st.x, st.z, 1)!.y, st.z);
    expect(sky.puzzleState().find((p) => p.id === c.id)!.done).toBe(true);
    sky.setKid(c.x + 60, 0, c.z);
    expect(sky.puzzleState().find((p) => p.id === c.id)!.done).toBe(true);
    // a circle solved on another day comes back solved
    const other = SKY_SPOTS.filter((s) => s.kind === "stones")[1];
    sky.setSpotsFound([other.id]);
    expect(sky.puzzleState().find((p) => p.id === other.id)!.done).toBe(true);
    sky.update(2);
    sky.dispose();
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
    expect(std.triangles).toBeLessThan(236000); // was ~117k before the discoveries; budget +120k
    expect(low.triangles).toBeLessThan(std.triangles * 0.75);
    // sane vertex colours (a shared colour mutated in place once blew the tops out to white)
    for (const m of [std.mesh, low.mesh]) {
      const c = m.geometry.attributes.color.array as Float32Array;
      let hi = 0;
      for (let i = 0; i < c.length; i++) hi = Math.max(hi, c[i]);
      expect(hi).toBeLessThan(1.5);
      expect(Number.isFinite(hi)).toBe(true);
    }
    // chests (3) + the discoveries' moving parts: at most +8 draw calls
    expect(std.chests.length).toBeGreaterThanOrEqual(3);
    expect(std.chests.length).toBeLessThanOrEqual(11);
    std.setKid(0, 0, 0);
    expect(std.puzzleState().length).toBeGreaterThanOrEqual(2);
    std.setOpened([SKY_ISLANDS[0].id]);
    std.update(1);
    std.update(2);
    std.dispose();
    low.dispose();
  });
});
