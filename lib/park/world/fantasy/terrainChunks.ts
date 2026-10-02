// The island's ground, streamed: the height field (terrain.ts) is drawn as square chunks — one
// per terrain tile — each at a level of detail picked by how far it is from the kid, so the
// ground near you is finely shaped and the far hills cost a handful of triangles. Chunks are
// built as they're needed (nearest first, within a small time budget each frame, so walking
// never hitches), kept for a while in case you come back, and an older level of detail stays
// up until its replacement is ready (no holes). Skirts hide the seams between levels; normals
// come from the field itself so neighbouring chunks light the same. Vertex-coloured by
// groundColor() — meadow greens, rock, snow, sand, river beds, trails — like the old one-piece mesh.
// Taps find the ground by marching the pointer's ray over the field (no mesh raycast needed).
import * as THREE from "three";
import { TERRAIN_CELL, TERRAIN_EXTENT, TERRAIN_N, TERRAIN_TILE, groundY, slopeAt } from "../../registry/terrain";
import { groundColor } from "./terrainMesh";
import type { GrassMask } from "./mask";

/** a chunk's side (world units): one terrain tile */
export const CHUNK = TERRAIN_TILE * TERRAIN_CELL;
/** chunks across the field */
const NC = Math.ceil((TERRAIN_N - 1) / TERRAIN_TILE);
/** segments per chunk side at each level of detail (0 = finest) */
export const CHUNK_LODS = { std: [32, 16, 8, 4], low: [16, 8, 4, 2] };
/** the level of detail by distance (world units, from the kid to the chunk's nearest point) */
export const LOD_RANGES = [70, 170, 330];
/** chunks further than this aren't drawn (past the fog and the camera's far plane) */
export const VIEW_R = 640;
/** at most this many chunk meshes are kept (the furthest unused go first) */
const KEEP = 220;

export interface TerrainChunks {
  group: THREE.Group;
  /** the one material every chunk shares (others may patch its shader, e.g. the jungle floor) */
  material: THREE.MeshStandardMaterial;
  /** stream the chunks round `focus`; `budgetMs` caps the building this frame (Infinity = all now) */
  update(focus: { x: number; z: number }, budgetMs?: number): void;
  /** where `ray` first meets the island's ground (within `maxD`); false if it misses the field */
  raycast(ray: THREE.Ray, out: THREE.Vector3, maxD?: number): boolean;
  /** what's drawn right now (and how many chunk meshes are built in all) */
  stats(): { drawn: number; triangles: number; built: number };
  dispose(): void;
}

interface Built {
  mesh: THREE.Mesh;
  tris: number;
  used: number;
}

export function buildTerrainChunks(opts: { lowQuality?: boolean; mask?: GrassMask } = {}): TerrainChunks {
  const lods = opts.lowQuality ? CHUNK_LODS.low : CHUNK_LODS.std;
  const group = new THREE.Group();
  group.name = "terrain";
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  const built = new Map<number, Built>();
  /** what each chunk shows now (key of the built mesh, or -1) */
  const showing = new Int32Array(NC * NC).fill(-1);
  const key = (ci: number, cj: number, lod: number) => (lod * NC + cj) * NC + ci;
  const c = new THREE.Color();
  let frame = 0;

  function buildChunk(ci: number, cj: number, lod: number): Built {
    const S = lods[lod];
    const x0 = -TERRAIN_EXTENT + ci * CHUNK;
    const z0 = -TERRAIN_EXTENT + cj * CHUNK;
    // (the last chunks stop at the field's edge)
    const x1 = Math.min(TERRAIN_EXTENT, x0 + CHUNK);
    const z1 = Math.min(TERRAIN_EXTENT, z0 + CHUNK);
    const n = S + 1;
    // the grid, then a skirt ring hanging down round it
    const vCount = n * n + 4 * n;
    const pos = new Float32Array(vCount * 3);
    const nor = new Float32Array(vCount * 3);
    const col = new Float32Array(vCount * 3);
    const e = TERRAIN_CELL;
    // (trails are painted from the grass mask on the near chunks only: far off they're too small to see)
    const mask = lod <= 1 ? opts.mask : undefined;
    const put = (k: number, x: number, y: number, z: number, from = -1) => {
      pos[k * 3] = x;
      pos[k * 3 + 1] = y;
      pos[k * 3 + 2] = z;
      if (from >= 0) {
        nor.copyWithin(k * 3, from * 3, from * 3 + 3);
        col.copyWithin(k * 3, from * 3, from * 3 + 3);
        return;
      }
      const dx = groundY(x + e, z) - groundY(x - e, z);
      const dz = groundY(x, z + e) - groundY(x, z - e);
      const l = Math.hypot(dx, 2 * e, dz);
      nor[k * 3] = -dx / l;
      nor[k * 3 + 1] = (2 * e) / l;
      nor[k * 3 + 2] = -dz / l;
      groundColor(x, z, y, slopeAt(x, z), c, mask, !!mask);
      col[k * 3] = c.r;
      col[k * 3 + 1] = c.g;
      col[k * 3 + 2] = c.b;
    };
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const x = x0 + ((x1 - x0) * i) / S;
        const z = z0 + ((z1 - z0) * j) / S;
        put(j * n + i, x, groundY(x, z), z);
      }
    const idx: number[] = [];
    for (let j = 0; j < S; j++)
      for (let i = 0; i < S; i++) {
        const a = j * n + i;
        idx.push(a, a + n, a + 1, a + 1, a + n, a + n + 1);
      }
    // skirts: each edge's vertices again, dropped, stitched to the edge (facing out)
    const drop = 1.2 + ((x1 - x0) / S) * 0.5;
    const edges: number[][] = [
      Array.from({ length: n }, (_, i) => i), // z0 edge
      Array.from({ length: n }, (_, i) => S * n + (S - i)), // z1 edge
      Array.from({ length: n }, (_, j) => (S - j) * n), // x0 edge
      Array.from({ length: n }, (_, j) => j * n + S), // x1 edge
    ];
    let k = n * n;
    for (const edge of edges) {
      const base = k;
      for (const v of edge) put(k++, pos[v * 3], pos[v * 3 + 1] - drop, pos[v * 3 + 2], v);
      for (let m = 0; m + 1 < n; m++) {
        const a = edge[m];
        const b = edge[m + 1];
        // (both windings: a skirt is seen from whichever side the crack shows it)
        idx.push(a, base + m, b, b, base + m, base + m + 1, a, b, base + m, b, base + m + 1, base + m);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, material);
    mesh.name = `terrain-${ci}-${cj}-${lod}`;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.visible = false;
    group.add(mesh);
    return { mesh, tris: idx.length / 3, used: frame };
  }

  /** distance from (x, z) to chunk (ci, cj)'s square */
  const chunkDist = (ci: number, cj: number, x: number, z: number) => {
    const x0 = -TERRAIN_EXTENT + ci * CHUNK;
    const z0 = -TERRAIN_EXTENT + cj * CHUNK;
    return Math.hypot(Math.max(x0 - x, 0, x - (x0 + CHUNK)), Math.max(z0 - z, 0, z - (z0 + CHUNK)));
  };
  const lodFor = (d: number) => {
    let l = 0;
    while (l < LOD_RANGES.length && d > LOD_RANGES[l]) l++;
    return Math.min(l, lods.length - 1);
  };

  const want: { ci: number; cj: number; lod: number; d: number }[] = [];
  function update(focus: { x: number; z: number }, budgetMs = 3) {
    frame++;
    const t0 = performance.now();
    want.length = 0;
    for (let cj = 0; cj < NC; cj++)
      for (let ci = 0; ci < NC; ci++) {
        const d = chunkDist(ci, cj, focus.x, focus.z);
        const slot = cj * NC + ci;
        if (d > VIEW_R) {
          if (showing[slot] >= 0) built.get(showing[slot])!.mesh.visible = false;
          showing[slot] = -1;
          continue;
        }
        want.push({ ci, cj, lod: lodFor(d), d });
      }
    // nearest first: anything with nothing to show at all goes before refinements
    want.sort((a, b) => {
      const ea = showing[a.cj * NC + a.ci] < 0 ? 0 : 1;
      const eb = showing[b.cj * NC + b.ci] < 0 ? 0 : 1;
      return ea - eb || a.d - b.d;
    });
    for (const w of want) {
      const slot = w.cj * NC + w.ci;
      const k = key(w.ci, w.cj, w.lod);
      let b = built.get(k);
      if (!b) {
        // over budget: keep what's up (or, with nothing up, build the coarsest — it's cheap)
        if (performance.now() - t0 > budgetMs) {
          if (showing[slot] >= 0) {
            built.get(showing[slot])!.used = frame;
            continue;
          }
          const kc = key(w.ci, w.cj, lods.length - 1);
          b = built.get(kc) ?? buildChunk(w.ci, w.cj, lods.length - 1);
          built.set(kc, b);
          showChunk(slot, kc, b);
          continue;
        }
        b = buildChunk(w.ci, w.cj, w.lod);
        built.set(k, b);
      }
      showChunk(slot, k, b);
    }
    // forget the furthest unused chunks
    if (built.size > KEEP) {
      const old = [...built.entries()].filter(([, b]) => b.used < frame).sort((a, b) => a[1].used - b[1].used);
      for (let i = 0; i < old.length && built.size > KEEP; i++) {
        const [k, b] = old[i];
        group.remove(b.mesh);
        b.mesh.geometry.dispose();
        built.delete(k);
      }
    }
  }
  function showChunk(slot: number, k: number, b: Built) {
    if (showing[slot] !== k) {
      if (showing[slot] >= 0) {
        const prev = built.get(showing[slot]);
        if (prev) prev.mesh.visible = false;
      }
      showing[slot] = k;
    }
    b.mesh.visible = true;
    b.used = frame;
  }

  const step = new THREE.Vector3();
  return {
    group,
    material,
    update,
    raycast(ray, out, maxD = 500) {
      // march along the ray, then bisect where it crosses the ground
      const inField = (x: number, z: number) => Math.abs(x) < TERRAIN_EXTENT && Math.abs(z) < TERRAIN_EXTENT;
      const above = (s: number) => {
        ray.at(s, step);
        return step.y - groundY(step.x, step.z);
      };
      const dt = 0.6;
      let s0 = 0;
      let h0 = above(0);
      if (h0 < 0) return false;
      for (let s = dt; s <= maxD; s += dt) {
        const h = above(s);
        if (h < 0) {
          let a = s0;
          let b = s;
          for (let k = 0; k < 18; k++) {
            const m = (a + b) / 2;
            if (above(m) < 0) b = m;
            else a = m;
          }
          ray.at(b, out);
          if (!inField(out.x, out.z)) return false;
          out.y = groundY(out.x, out.z);
          return true;
        }
        s0 = s;
        h0 = h;
      }
      void h0;
      return false;
    },
    stats() {
      let drawn = 0;
      let triangles = 0;
      for (const b of built.values())
        if (b.mesh.visible) {
          drawn++;
          triangles += b.tris;
        }
      return { drawn, triangles, built: built.size };
    },
    dispose() {
      for (const b of built.values()) b.mesh.geometry.dispose();
      built.clear();
      material.dispose();
    },
  };
}
