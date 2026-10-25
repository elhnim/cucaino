import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { bakeFloorRows, cutIslandFloors, deepFloorMeshY, islandFloors, makeFloorMask, openPlainY, type FloorMask, type IslandFloor } from "./islandFloors";
import { VILLAGE_ISLAND } from "../../registry/villageIsland";
import { FROST_ISLAND } from "../../registry/frostIsland";
import { DINO_ISLAND } from "../../registry/dinoIsland";
import { seaFloorY } from "./wander";

/** the GPU's view of a mask: bilinear sample, cut where > 0.5 (as the shader) */
function cutBy(m: FloorMask, x: number, z: number): boolean {
  const fx = (x - m.x0) / m.texel;
  const fz = (z - m.z0) / m.texel;
  if (fx < -0.5 || fz < -0.5 || fx > m.w - 0.5 || fz > m.h - 0.5) return false;
  const i = Math.max(0, Math.min(m.w - 2, Math.floor(fx)));
  const j = Math.max(0, Math.min(m.h - 2, Math.floor(fz)));
  const u = Math.min(1, Math.max(0, fx - i));
  const v = Math.min(1, Math.max(0, fz - j));
  const d = (a: number, b: number) => m.data[(j + b) * m.w + i + a] / 255;
  return d(0, 0) * (1 - u) * (1 - v) + d(1, 0) * u * (1 - v) + d(0, 1) * (1 - u) * v + d(1, 1) * u * v > 0.5;
}

describe("the deep sand floor never pokes through an island's own ground", () => {
  const cell = 6;
  const cases: [string, number][] = [
    [VILLAGE_ISLAND.id, 0.9],
    [FROST_ISLAND.id, 0.9],
    [DINO_ISLAND.id, 1.7],
  ];
  it("every far island is registered", () => {
    const ids = islandFloors().map((f) => f.id);
    for (const [id] of cases) expect(ids).toContain(id);
  });
  for (const [id, step] of cases) {
    it(`${id}: wherever the sand would show above the island's ground it is cut, and the open plain keeps its sand`, () => {
      const f = islandFloors().find((g) => g.id === id) as IslandFloor;
      const m = makeFloorMask(f);
      bakeFloorRows(f, m, 0, m.h);
      let pokes = 0;
      let uncut = 0;
      let holes = 0;
      let covered = 0;
      for (let x = f.minX + 0.37; x < f.maxX; x += step)
        for (let z = f.minZ + 0.61; z < f.maxZ; z += step) {
          const g = f.floorY(x, z);
          if (g === null) continue;
          const sand = deepFloorMeshY(x, z, cell);
          const cut = cutBy(m, x, z);
          // (where the island's flanks are buried under the plain, or just meet it at the rim ~22 m
          // down, the plain's sand is the floor)
          if (sand > g + 0.15 && g > openPlainY(x, z) + 0.5) {
            pokes++;
            if (!cut) uncut++;
          }
          // the island's flanks sunk under the open plain: the plain's sand still covers them (no ditch)
          if (g < openPlainY(x, z) - 1) {
            covered++;
            if (cut) holes++;
          }
        }
      // (uncut, the sand poked up through thousands of these points)
      expect(pokes).toBeGreaterThan(500);
      expect(uncut).toBe(0);
      if (covered) expect(holes / covered).toBeLessThan(0.01);
    });
  }
  it("the mesh height matches the deep floor's own triangles", () => {
    for (const [x, z] of [[300.4, -251.2], [12.5, 377.9], [-405.1, -60.3]])
      expect(deepFloorMeshY(Math.round(x / cell) * cell, Math.round(z / cell) * cell, cell)).toBeCloseTo(seaFloorY(Math.round(x / cell) * cell, Math.round(z / cell) * cell), 5);
  });
  it("one call cuts the sand material: a discard per island mask, baked as the kid comes near", () => {
    const mat = new THREE.MeshStandardMaterial();
    const cut = cutIslandFloors(mat);
    const shader = { vertexShader: "void main() {", fragmentShader: "void main() {", uniforms: {} } as unknown as THREE.WebGLProgramParametersWithUniforms;
    mat.onBeforeCompile(shader, null as unknown as THREE.WebGLRenderer);
    expect(shader.fragmentShader).toContain("uIslCut");
    expect(shader.fragmentShader).toContain("discard");
    expect(mat.customProgramCacheKey()).toContain("island-cut");
    const box = (shader.uniforms as Record<string, { value: THREE.Vector4[] }>).uIslBox.value;
    // far from every island: nothing baked
    expect(cut.update({ x: 0, z: -700 })).toBe(true);
    expect(box.every((b) => b.z === 0)).toBe(true);
    // at Coralcove: baked over a few frames, then its mask is live
    let frames = 0;
    while (!cut.update({ x: VILLAGE_ISLAND.x, z: VILLAGE_ISLAND.z }) && frames < 200) frames++;
    expect(frames).toBeGreaterThan(0);
    const k = islandFloors().findIndex((f) => f.id === VILLAGE_ISLAND.id);
    expect(box[k].z).toBeGreaterThan(0);
    cut.dispose();
  });
});
