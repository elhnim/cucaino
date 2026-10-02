// The streamed ground: the lazily baked height field, the shaders' windows that follow the kid
// and the chunked ground mesh.
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { DEEP_FLOOR, TERRAIN_CELL, TERRAIN_EXTENT, TERRAIN_N, TERRAIN_TILE, groundY, terrainSample, terrainTilesBaked } from "../../registry/terrain";
import { MASK_HALF, bakeGrassMask, grassMask, maskAt, maskPx } from "./mask";
import { HEIGHT_WIN, buildTerrainWindows } from "./terrainWindow";
import { CHUNK, CHUNK_LODS, buildTerrainChunks } from "./terrainChunks";

describe("the height field, baked lazily", () => {
  it("bakes only the tiles that are asked for", () => {
    // (this file runs in its own worker: nothing has baked yet)
    expect(terrainTilesBaked()).toBe(0);
    groundY(1, 1);
    expect(terrainTilesBaked()).toBe(1);
  });

  it("is seamless across tile edges (shared samples, smooth heights)", () => {
    // anywhere along a tile edge (not just at samples), the height just either side matches
    for (let t = 1; t * TERRAIN_TILE < TERRAIN_N - 1; t++) {
      const e = -TERRAIN_EXTENT + t * TERRAIN_TILE * TERRAIN_CELL;
      for (let s = -TERRAIN_EXTENT + 0.37; s < TERRAIN_EXTENT - 1; s += 1.71) {
        expect(Math.abs(groundY(e - 1e-4, s) - groundY(e + 1e-4, s))).toBeLessThan(0.01);
        expect(Math.abs(groundY(s, e - 1e-4) - groundY(s, e + 1e-4))).toBeLessThan(0.01);
      }
    }
    // and a tile's edge sample is the same value whichever tile it's read through
    for (let t = 1; t * TERRAIN_TILE < TERRAIN_N - 1; t++) {
      const i = t * TERRAIN_TILE;
      for (let j = 0; j < TERRAIN_N; j += 13) {
        const x = -TERRAIN_EXTENT + i * TERRAIN_CELL;
        const z = -TERRAIN_EXTENT + j * TERRAIN_CELL;
        expect(groundY(x - 1e-6, z)).toBeCloseTo(terrainSample(i, j), 4);
        expect(groundY(x + 1e-6, z)).toBeCloseTo(terrainSample(i, j), 4);
      }
    }
  });

  it("is the deep sea floor off the field", () => {
    expect(groundY(TERRAIN_EXTENT + 5, 0)).toBe(DEEP_FLOOR);
    expect(terrainSample(-1, 3)).toBe(DEEP_FLOOR);
  });
});

describe("the shaders' windows round the kid", () => {
  it("hold the field's heights and the grass mask round the focus, and follow it", () => {
    const n = 512;
    const w = buildTerrainWindows(n, 256);
    const whole = bakeGrassMask(n);
    for (const [fx, fz] of [
      [0, 0],
      [60, -40],
      [-120, 90],
    ]) {
      w.update(fx, fz);
      // heights: the texel at the focus is the grid sample there
      const H = w.height;
      const data = H.uHeightTex.value.image.data as Uint16Array;
      const i = Math.round((fx - H.uTerrO.value.x) / H.uTerrCell.value);
      const j = Math.round((fz - H.uTerrO.value.y) / H.uTerrCell.value);
      const x = H.uTerrO.value.x + i * H.uTerrCell.value;
      const z = H.uTerrO.value.y + j * H.uTerrCell.value;
      expect(THREE.DataUtils.fromHalfFloat(data[j * HEIGHT_WIN + i])).toBeCloseTo(groundY(x, z), 1);
      // the focus sits well inside both windows (the grass reaches ~60 units out)
      const span = HEIGHT_WIN * H.uTerrCell.value;
      expect(fx - H.uTerrO.value.x).toBeGreaterThan(60);
      expect(H.uTerrO.value.x + span - fx).toBeGreaterThan(60);
      const M = w.mask;
      expect(fx - M.uMaskO.value.x).toBeGreaterThan(60);
      expect(M.uMaskO.value.x + M.uMaskSpan.value - fx).toBeGreaterThan(60);
      expect(fz - M.uMaskO.value.y).toBeGreaterThan(60);
      // the mask window's pixels are the whole mask's pixels
      const md = M.uMask.value.image.data as Uint8Array;
      const px = maskPx(n);
      for (let k = 0; k < 200; k++) {
        const qx = fx + Math.sin(k * 1.3) * 50;
        const qz = fz + Math.cos(k * 1.9) * 50;
        const pi = Math.floor((qx - M.uMaskO.value.x) / px);
        const pj = Math.floor((qz - M.uMaskO.value.y) / px);
        expect(md[(pj * 256 + pi) * 4] / 255).toBe(maskAt(whole, qx, qz));
      }
    }
    w.dispose();
  });

  it("reads a lazy mask exactly like a whole bake", () => {
    const whole = bakeGrassMask(1024);
    const lazy = grassMask(1024);
    for (let k = 0; k < 3000; k++) {
      const x = Math.sin(k * 0.77) * (MASK_HALF + 8);
      const z = Math.cos(k * 1.31) * (MASK_HALF + 8);
      expect(maskAt(lazy, x, z)).toBe(maskAt(whole, x, z));
    }
  });
});

describe("the chunked ground", () => {
  it("draws the field round the kid, finely near and coarsely far, within budget", () => {
    const g = buildTerrainChunks({ mask: grassMask(1024) });
    g.update({ x: 0, z: 0 }, Infinity);
    const s = g.stats();
    // (the whole present island is in view)
    const nc = Math.ceil((TERRAIN_N - 1) / TERRAIN_TILE);
    expect(s.drawn).toBe(nc * nc);
    expect(s.triangles).toBeLessThan(80_000);
    // the chunk under the kid is the finest level
    const under = g.group.children.find((m) => m.visible && m.name.startsWith(`terrain-${Math.floor(TERRAIN_EXTENT / CHUNK)}-${Math.floor(TERRAIN_EXTENT / CHUNK)}-`))!;
    expect(under.name.endsWith("-0")).toBe(true);
    // its vertices are on the field
    const pos = (under as THREE.Mesh).geometry.attributes.position as THREE.BufferAttribute;
    const n = (CHUNK_LODS.std[0] + 1) ** 2;
    for (let k = 0; k < n; k += 7) expect(pos.getY(k)).toBeCloseTo(groundY(pos.getX(k), pos.getZ(k)), 4);
    g.dispose();
  });

  it("streams with the kid: a small budget never leaves a hole, and refines over the next frames", () => {
    const g = buildTerrainChunks({ lowQuality: true });
    g.update({ x: -150, z: 120 }, 0);
    const first = g.stats();
    const nc = Math.ceil((TERRAIN_N - 1) / TERRAIN_TILE);
    expect(first.drawn).toBe(nc * nc);
    for (let f = 0; f < 60; f++) g.update({ x: -150 + f * 4, z: 120 - f * 3 }, 2);
    expect(g.stats().drawn).toBe(nc * nc);
    g.dispose();
  });

  it("finds where a tap's ray meets the ground", () => {
    const g = buildTerrainChunks({ lowQuality: true });
    const out = new THREE.Vector3();
    for (const [x, z] of [
      [0, 8],
      [-60, 40],
      [30, -90],
    ]) {
      const from = new THREE.Vector3(x + 10, groundY(x, z) + 14, z + 14);
      const ray = new THREE.Ray(from, new THREE.Vector3(x, groundY(x, z), z).sub(from).normalize());
      expect(g.raycast(ray, out)).toBe(true);
      expect(Math.hypot(out.x - x, out.z - z)).toBeLessThan(1.5);
      expect(out.y).toBeCloseTo(groundY(out.x, out.z), 3);
    }
    // a ray out to the empty sea misses
    expect(g.raycast(new THREE.Ray(new THREE.Vector3(0, 30, 380), new THREE.Vector3(0, -0.05, 1).normalize()), out)).toBe(false);
    g.dispose();
  });
});
