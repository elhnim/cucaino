// The deep sea floor beyond the island's height grid: a patch of sandy plain that follows the kid
// (snapped to its cells, so nothing swims), shaped by seaFloorY (the slope off the grid's edge,
// then low dunes at DEEP_FLOOR). The "sand" shader pattern draws ripples and patches from world
// position and discards the part over the height grid (the terrain mesh draws that), so it joins
// the reef's drop-off seamlessly. One draw call; rebuilt only when the kid crosses a cell.
import * as THREE from "three";
import { TERRAIN_EXTENT } from "../../registry/terrain";
import { seaFloorY } from "./wander";

export interface DeepFloor {
  mesh: THREE.Mesh;
  update(focus: { x: number; z: number }): void;
  dispose(): void;
}

export function buildDeepFloor(material: THREE.Material, cells: number, cell: number): DeepFloor {
  const n = cells + 1;
  const pos = new Float32Array(n * n * 3);
  const nor = new Float32Array(n * n * 3);
  const colr = new Float32Array(n * n * 3);
  const fx = new Float32Array(n * n * 3);
  const sand = new THREE.Color("#d8caa6");
  for (let i = 0; i < n * n; i++) {
    colr[i * 3] = sand.r;
    colr[i * 3 + 1] = sand.g;
    colr[i * 3 + 2] = sand.b;
  }
  const idx: number[] = [];
  for (let j = 0; j < cells; j++)
    for (let i = 0; i < cells; i++) {
      const a = j * n + i;
      idx.push(a, a + n, a + 1, a + 1, a + n, a + n + 1);
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colr, 3));
  geo.setAttribute("aFx", new THREE.BufferAttribute(fx, 3));
  geo.setIndex(idx);
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = "uw-deep-floor";
  mesh.frustumCulled = false;
  mesh.receiveShadow = false;
  const half = (cells * cell) / 2;
  const ys = new Float32Array(n * n);
  let cx = Infinity;
  let cz = Infinity;
  return {
    mesh,
    update(f) {
      const sx = Math.round(f.x / cell) * cell;
      const sz = Math.round(f.z / cell) * cell;
      if (sx === cx && sz === cz) return;
      cx = sx;
      cz = sz;
      // entirely over the height grid: nothing to draw
      mesh.visible = Math.abs(sx) + half > TERRAIN_EXTENT - 1 || Math.abs(sz) + half > TERRAIN_EXTENT - 1;
      if (!mesh.visible) return;
      for (let j = 0; j < n; j++)
        for (let i = 0; i < n; i++) {
          const x = sx - half + i * cell;
          const z = sz - half + j * cell;
          const k = j * n + i;
          ys[k] = seaFloorY(x, z);
          pos[k * 3] = x;
          pos[k * 3 + 1] = ys[k];
          pos[k * 3 + 2] = z;
        }
      for (let j = 0; j < n; j++)
        for (let i = 0; i < n; i++) {
          const k = j * n + i;
          const dx = ys[j * n + Math.min(n - 1, i + 1)] - ys[j * n + Math.max(0, i - 1)];
          const dz = ys[Math.min(n - 1, j + 1) * n + i] - ys[Math.max(0, j - 1) * n + i];
          const l = Math.hypot(dx, 2 * cell, dz);
          nor[k * 3] = -dx / l;
          nor[k * 3 + 1] = (2 * cell) / l;
          nor[k * 3 + 2] = -dz / l;
        }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.normal.needsUpdate = true;
    },
    dispose() {
      geo.dispose();
    },
  };
}
