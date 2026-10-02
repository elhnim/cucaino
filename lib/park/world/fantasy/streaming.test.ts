// The streamed ground: the lazily baked height field, the shaders' windows that follow the kid,
// the quadtree of ground blocks and the Wildlands' trees and rocks.
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { DEEP_FLOOR, TERRAIN_CELL, TERRAIN_NX, TERRAIN_NZ, TERRAIN_TILE, TERRAIN_X0, TERRAIN_X1, TERRAIN_Z0, TERRAIN_Z1, groundY, groundYFar, terrainCovers, terrainSample, terrainTilesBaked } from "../../registry/terrain";
import { coastR, seaDist, WILDLANDS } from "../../registry/island";
import { waterSdf } from "../../registry/waterways";
import { MASK_HALF, bakeGrassMask, grassMask, maskAt, maskPx } from "./mask";
import { HEIGHT_WIN, buildTerrainWindows } from "./terrainWindow";
import { BLOCK, BLOCK_SEGS, buildTerrainChunks } from "./terrainChunks";
import { WILD_FROM, buildWilds, wildCell } from "./wilds";

describe("the island: about 3 km across, the park at its south-west end", () => {
  it("is ~10x the old island across, with the park's own south-west shore kept", () => {
    let lo = Infinity;
    let hi = -Infinity;
    for (let k = 0; k < 720; k++) {
      const a = (k / 720) * Math.PI * 2;
      const r = coastR(a);
      lo = Math.min(lo, Math.sin(a) * r);
      hi = Math.max(hi, Math.sin(a) * r);
    }
    expect(hi - lo).toBeGreaterThan(2600);
    // the park's shore (round Rainbow Lake to the strait) is where it always was (away from the
    // soft bays where it meets the Wildlands' shore)
    for (let d = -118; d <= 8; d += 5) expect(Math.abs(coastR((d / 180) * Math.PI) - (152 + Math.sin(((d / 180) * Math.PI) * 4 + 0.5) * 5 + Math.sin(((d / 180) * Math.PI) * 9 + 2) * 2.5))).toBeLessThan(1.5);
    // the plaza is on land, and the Wildlands' middle is far inland
    expect(seaDist(0, 0)).toBeLessThan(-140);
    expect(seaDist(WILDLANDS.x, WILDLANDS.z)).toBeLessThan(-1200);
  });

  it("has snowy mountains, broad plains and a beach all round", () => {
    let peak = -Infinity;
    for (let u = 0; u < 400; u++) peak = Math.max(peak, groundYFar(200 + u * 4, -400 - u * 3.2));
    expect(peak).toBeGreaterThan(70);
    // the plains (east of the Great Lake): mostly dry, gentle land
    let dry = 0;
    for (let k = 0; k < 200; k++) {
      const x = 1700 + (k % 20) * 28;
      const z = 20 - Math.floor(k / 20) * 28;
      if (groundYFar(x, z) > 0.5) dry++;
    }
    expect(dry).toBeGreaterThan(180);
    // the coast goes down to the sea everywhere (30 m out from the shore: in the lagoon)
    for (let k = 0; k < 64; k++) {
      const a = (k / 64) * Math.PI * 2;
      const c = coastR(a);
      let o = c;
      while (seaDist(Math.sin(a) * o, Math.cos(a) * o) < 30) o += 2;
      expect(groundYFar(Math.sin(a) * o, Math.cos(a) * o)).toBeLessThan(-1);
      // (inland it's dry — except Rainbow Lake and the river, of course)
      let i = c;
      while (seaDist(Math.sin(a) * i, Math.cos(a) * i) > -30) i -= 2;
      const ix = Math.sin(a) * i;
      const iz = Math.cos(a) * i;
      if (waterSdf(ix, iz) > 3) expect(groundYFar(ix, iz)).toBeGreaterThan(-0.1);
    }
  });
});

describe("the height field, baked lazily", () => {
  it("bakes only the tiles that are asked for — and never the open sea's", () => {
    // (this file runs in its own worker: nothing has baked yet)
    expect(terrainTilesBaked()).toBe(0);
    groundY(1, 1);
    expect(terrainTilesBaked()).toBe(1);
    // far out in the rectangle's open sea: no tile, just the deep floor
    let x = TERRAIN_X1 - 30;
    let z = TERRAIN_Z1 - 30;
    expect(terrainCovers(x, z)).toBe(false);
    expect(groundY(x, z)).toBe(DEEP_FLOOR);
    expect(terrainTilesBaked()).toBe(1);
    // the far-off height (no baking at all) is close to the baked one: within centimetres on most
    // ground, a few metres at worst on the cliffs (where the blur matters; the far blocks' skirts hide it)
    const diffs: number[] = [];
    for (let k = 0; k < 400; k++) {
      x = Math.sin(k * 1.7) * 140;
      z = Math.cos(k * 2.3) * 140;
      diffs.push(Math.abs(groundYFar(x, z) - groundY(x, z)));
    }
    diffs.sort((a, b) => a - b);
    expect(diffs[Math.floor(diffs.length * 0.9)]).toBeLessThan(0.5);
    expect(diffs[diffs.length - 1]).toBeLessThan(5);
  });

  it("is seamless across tile edges", () => {
    for (let t = 1; t * TERRAIN_TILE < 360; t++) {
      const ex = TERRAIN_X0 + (Math.floor((-150 - TERRAIN_X0) / TERRAIN_CELL / TERRAIN_TILE) + t) * TERRAIN_TILE * TERRAIN_CELL;
      for (let s = -150; s < 150; s += 2.71) expect(Math.abs(groundY(ex - 1e-4, s) - groundY(ex + 1e-4, s))).toBeLessThan(0.01);
    }
    // a tile's edge sample is the same whichever tile reads it
    const i = TERRAIN_TILE * Math.round((0 - TERRAIN_X0) / TERRAIN_CELL / TERRAIN_TILE);
    for (let j = Math.round((-140 - TERRAIN_Z0) / TERRAIN_CELL); j < Math.round((140 - TERRAIN_Z0) / TERRAIN_CELL); j += 11) {
      const x = TERRAIN_X0 + i * TERRAIN_CELL;
      const z = TERRAIN_Z0 + j * TERRAIN_CELL;
      expect(groundY(x - 1e-6, z)).toBeCloseTo(terrainSample(i, j), 4);
      expect(groundY(x + 1e-6, z)).toBeCloseTo(terrainSample(i, j), 4);
    }
  });

  it("is the deep sea floor off the field", () => {
    expect(groundY(TERRAIN_X1 + 5, 0)).toBe(DEEP_FLOOR);
    expect(terrainSample(-1, 3)).toBe(DEEP_FLOOR);
    expect(terrainSample(TERRAIN_NX, TERRAIN_NZ)).toBe(DEEP_FLOOR);
  });
});

describe("the shaders' windows round the kid", () => {
  it("hold the field's heights and the grass mask round the focus, and follow it — out in the Wildlands too", () => {
    const n = 512;
    const w = buildTerrainWindows(n, 256);
    const whole = bakeGrassMask(n);
    for (const [fx, fz] of [
      [0, 0],
      [60, -40],
      [-120, 90],
      [900, -600],
    ]) {
      w.update(fx, fz);
      const H = w.height;
      const data = H.uHeightTex.value.image.data as Uint16Array;
      const i = Math.round((fx - H.uTerrO.value.x) / H.uTerrCell.value);
      const j = Math.round((fz - H.uTerrO.value.y) / H.uTerrCell.value);
      const x = H.uTerrO.value.x + i * H.uTerrCell.value;
      const z = H.uTerrO.value.y + j * H.uTerrCell.value;
      expect(THREE.DataUtils.fromHalfFloat(data[j * HEIGHT_WIN + i])).toBeCloseTo(groundY(x, z), 0);
      // the focus sits well inside both windows (the grass reaches ~60 units out)
      const span = HEIGHT_WIN * H.uTerrCell.value;
      expect(fx - H.uTerrO.value.x).toBeGreaterThan(60);
      expect(H.uTerrO.value.x + span - fx).toBeGreaterThan(60);
      const M = w.mask;
      expect(fx - M.uMaskO.value.x).toBeGreaterThan(60);
      expect(M.uMaskO.value.x + M.uMaskSpan.value - fx).toBeGreaterThan(60);
      expect(fz - M.uMaskO.value.y).toBeGreaterThan(60);
      // the mask window's pixels are the mask's pixels
      const md = M.uMask.value.image.data as Uint8Array;
      const px = maskPx(n);
      const lazy = grassMask(n);
      for (let k = 0; k < 200; k++) {
        const qx = fx + Math.sin(k * 1.3) * 50;
        const qz = fz + Math.cos(k * 1.9) * 50;
        const pi = Math.floor((qx - M.uMaskO.value.x) / px);
        const pj = Math.floor((qz - M.uMaskO.value.y) / px);
        expect(md[(pj * 256 + pi) * 4] / 255).toBe(maskAt(lazy, qx, qz));
        if (Math.abs(qx) < MASK_HALF - 1 && Math.abs(qz) < MASK_HALF - 1) expect(maskAt(lazy, qx, qz)).toBe(maskAt(whole, qx, qz));
      }
    }
    w.dispose();
  });

  it("grows grass in the Wildlands' meadows, not on the snow or the beaches", () => {
    const m = grassMask(512);
    let grassy = 0;
    for (let k = 0; k < 200; k++) if (maskAt(m, 1700 + (k % 20) * 20, 20 - Math.floor(k / 20) * 20) > 0.5) grassy++;
    expect(grassy).toBeGreaterThan(150);
    const a = 1.2;
    const c = coastR(a);
    expect(maskAt(m, Math.sin(a) * (c - 1), Math.cos(a) * (c - 1))).toBe(0);
  });
});

describe("the ground blocks", () => {
  it("draw the island round the kid — finely near, coarsely far — within budget, wherever the kid is", () => {
    for (const [x, z] of [
      [0, 8],
      [900, -700],
      [1600, -300],
    ]) {
      const g = buildTerrainChunks({ mask: grassMask(1024) });
      g.update({ x, z }, Infinity);
      const s = g.stats();
      expect(s.drawn).toBeGreaterThan(8);
      expect(s.drawn, "draw calls").toBeLessThanOrEqual(40);
      expect(s.triangles, "triangles").toBeLessThan(110_000);
      // the block under the kid is the finest, at full detail, on the field
      const under = g.group.children.find((m) => {
        if (!m.visible || !/^terrain-0-\d+-\d+$/.test(m.name)) return false;
        const [, , bi, bj] = m.name.split("-").map(Number);
        const x0 = TERRAIN_X0 + bi * BLOCK[0];
        const z0 = TERRAIN_Z0 + bj * BLOCK[0];
        return x >= x0 && x < x0 + BLOCK[0] && z >= z0 && z < z0 + BLOCK[0];
      }) as THREE.Mesh;
      expect(under, `${x},${z}`).toBeTruthy();
      const pos = under.geometry.attributes.position as THREE.BufferAttribute;
      const n = (BLOCK_SEGS.std[0] + 1) ** 2;
      for (let k = 0; k < n; k += 13) if (terrainCovers(pos.getX(k), pos.getZ(k))) expect(pos.getY(k)).toBeCloseTo(groundY(pos.getX(k), pos.getZ(k)), 4);
      g.dispose();
    }
  });

  it("stream with the kid: a small budget never leaves a hole, and refine over the next frames", () => {
    const g = buildTerrainChunks({ lowQuality: true });
    g.update({ x: 400, z: -300 }, 0);
    const first = g.stats().drawn;
    expect(first).toBeGreaterThan(8);
    for (let f = 0; f < 80; f++) g.update({ x: 400 + f * 6, z: -300 - f * 4 }, 2);
    expect(g.stats().drawn).toBeGreaterThan(8);
    g.dispose();
  });

  it("find where a tap's ray meets the ground", () => {
    const g = buildTerrainChunks({ lowQuality: true });
    const out = new THREE.Vector3();
    for (const [x, z] of [
      [0, 8],
      [-60, 40],
      [30, -90],
      [1200, -500],
    ]) {
      const from = new THREE.Vector3(x + 10, groundY(x, z) + 14, z + 14);
      const ray = new THREE.Ray(from, new THREE.Vector3(x, groundY(x, z), z).sub(from).normalize());
      expect(g.raycast(ray, out)).toBe(true);
      expect(Math.hypot(out.x - x, out.z - z)).toBeLessThan(1.5);
      expect(out.y).toBeCloseTo(groundY(out.x, out.z), 3);
    }
    // a ray out over the open sea, past the field, misses
    expect(g.raycast(new THREE.Ray(new THREE.Vector3(TERRAIN_X1 + 20, 30, TERRAIN_Z1 + 20), new THREE.Vector3(1, -0.05, 1).normalize()), out)).toBe(false);
    g.dispose();
  });
});

describe("the Wildlands' trees and rocks", () => {
  it("are the same every time, on dry open land: none in the park, the sea, on the snow or on cliffs", () => {
    expect(wildCell(20, -12)).toEqual(wildCell(20, -12));
    let trees = 0;
    for (let cj = -20; cj < 4; cj += 3)
      for (let ci = 0; ci < 34; ci += 3)
        for (const t of wildCell(ci, cj)) {
          expect(Math.hypot(t.x, t.z)).toBeGreaterThanOrEqual(WILD_FROM);
          expect(seaDist(t.x, t.z)).toBeLessThan(-6);
          if (t.kind < 5) {
            trees++;
            expect(t.y).toBeLessThan(63);
          }
        }
    expect(trees).toBeGreaterThan(400);
    // nothing in the park
    for (const t of wildCell(0, 0)) expect(Math.hypot(t.x, t.z)).toBeGreaterThanOrEqual(WILD_FROM);
  });

  it("are drawn round the kid only, within budget, and the kid bumps into trunks", () => {
    const mat = new THREE.MeshStandardMaterial();
    for (const low of [false, true]) {
      const w = buildWilds(mat, { lowQuality: low });
      for (let k = 0; k < 40; k++) w.update({ x: 1900 + k * 0.01, z: -100 });
      const s = w.stats();
      expect(s.trees).toBeGreaterThan(low ? 150 : 300);
      expect(s.triangles).toBeLessThan(low ? 90_000 : 210_000);
      expect(w.meshes.length).toBe(11);
      // somewhere near: a trunk to bump into
      let hit = 0;
      for (let x = 1840; x < 1960; x += 2) for (let z = -160; z < -40; z += 2) if (w.trunkAt(x, z, 0.45)) hit++;
      expect(hit).toBeGreaterThan(3);
      w.dispose();
    }
  });
});
