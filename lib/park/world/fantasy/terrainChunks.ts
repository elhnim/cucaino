// The island's ground, streamed: the height field (terrain.ts) is drawn as a quadtree of square
// blocks round the kid — small, finely shaped blocks close by, then bigger and coarser ones out to
// the horizon — so the whole 3 km island costs a couple of dozen draw calls. Blocks are built as
// they're needed (nearest first, within a small time budget each frame, so walking never
// hitches), kept for a while in case you come back, and anything not ready yet shows a quick
// rough stand-in (no holes). Only the nearest blocks read the baked field (groundY); the far ones
// work their heights out on the spot (groundYFar), so nothing far away gets baked. Skirts hide the
// seams between levels; normals come from the field so neighbouring blocks light the same.
// Vertex-coloured by groundColor() — meadow greens, rock, snow, sand, river beds, trails.
// Taps find the ground by marching the pointer's ray over the field (no mesh raycast needed).
import * as THREE from "three";
import { DEEP_FLOOR, TERRAIN_X0, TERRAIN_X1, TERRAIN_Z0, TERRAIN_Z1, groundY, groundYFar, inTerrain, slopeAt, terrainCoverGrid, terrainCovers, terrainPrefetch } from "../../registry/terrain";
import { groundColor } from "./terrainMesh";
import { ISLAND_R } from "../../registry/island";
import type { GrassMask } from "./mask";

/** block sides (world units) at each level, finest first */
export const BLOCK = [120, 240, 480];
/** segments per block side at each level, finest first, then: the finest level's blocks a little
 *  further off (FINE_R), and a quick stand-in */
export const BLOCK_SEGS = { std: [56, 32, 16, 28, 8], low: [28, 16, 8, 16, 6] };
/** the finest blocks get their full detail only within this of the kid */
export const FINE_R = 45;
/** a block splits into the next finer level when the kid is nearer than this (per level, from 1) */
export const SPLIT_R = [0, 60, 300];
/** blocks further than this aren't drawn (past the fog and the camera's far plane) */
export const VIEW_R = 700;
/** at most this many block meshes are kept (the longest unused go first) */
const KEEP = 160;
const MID = 3;
const STANDIN = 4;

const TOP = BLOCK.length - 1;
const NBX = Math.ceil((TERRAIN_X1 - TERRAIN_X0) / BLOCK[TOP]);
const NBZ = Math.ceil((TERRAIN_Z1 - TERRAIN_Z0) / BLOCK[TOP]);

export interface TerrainChunks {
  group: THREE.Group;
  /** the one material every block shares (others may patch its shader, e.g. the jungle floor) */
  material: THREE.MeshStandardMaterial;
  /** stream the blocks round `focus`; `budgetMs` caps the building this frame (Infinity = all now) */
  update(focus: { x: number; z: number }, budgetMs?: number): void;
  /** where `ray` first meets the island's ground (within `maxD`); false if it misses the field */
  raycast(ray: THREE.Ray, out: THREE.Vector3, maxD?: number): boolean;
  /** what's drawn right now (and how many block meshes are built in all) */
  stats(): { drawn: number; triangles: number; built: number; levels: number[] };
  dispose(): void;
}

interface Built {
  mesh: THREE.Mesh;
  tris: number;
  used: number;
  level: number;
}

export function buildTerrainChunks(opts: { lowQuality?: boolean; mask?: GrassMask } = {}): TerrainChunks {
  const segs = opts.lowQuality ? BLOCK_SEGS.low : BLOCK_SEGS.std;
  const group = new THREE.Group();
  group.name = "terrain";
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  const built = new Map<number, Built>();
  /** variant: -1 = the level's own detail, MID, STANDIN */
  const key = (level: number, bi: number, bj: number, variant: number) => ((variant < 0 ? level : variant) * 4096 + bj) * 4096 + bi;
  const c = new THREE.Color();
  let frame = 0;

  /** A block being built, a few rows at a time (so no frame ever waits on a whole block): first
   *  its heights on a grid one sample wider all round (for the normals and slopes at its edges),
   *  then its vertices row by row, then the mesh. */
  interface Job {
    level: number;
    bi: number;
    bj: number;
    variant: number;
    S: number;
    n: number;
    x0: number;
    z0: number;
    step: number;
    near: boolean;
    /** (n + 2)² heights, the outer ring one step outside the block */
    hs: Float32Array;
    cover: Uint8Array;
    pos: Float32Array;
    nor: Float32Array;
    col: Float32Array;
    /** samples done: heights first ((n + 2)² of them), then vertices (n²) */
    row: number;
  }
  const jobs = new Map<number, Job>();
  // a block's triangles depend only on its segment count: worked out once per size
  const edgeCache = new Map<number, number[][]>();
  const blockEdges = (S: number) => {
    let e = edgeCache.get(S);
    if (!e) {
      const n = S + 1;
      e = [
        Array.from({ length: n }, (_, i) => i),
        Array.from({ length: n }, (_, i) => S * n + (S - i)),
        Array.from({ length: n }, (_, j) => (S - j) * n),
        Array.from({ length: n }, (_, j) => j * n + S),
      ];
      edgeCache.set(S, e);
    }
    return e;
  };
  const indexCache = new Map<number, Uint32Array>();
  const blockIndex = (S: number) => {
    let ix = indexCache.get(S);
    if (!ix) {
      const n = S + 1;
      const out: number[] = [];
      for (let j = 0; j < S; j++)
        for (let i = 0; i < S; i++) {
          const a = j * n + i;
          out.push(a, a + n, a + 1, a + 1, a + n, a + n + 1);
        }
      // (skirts: both windings, a skirt is seen from whichever side the crack shows it)
      let base = n * n;
      for (const edge of blockEdges(S)) {
        for (let m = 0; m + 1 < n; m++) {
          const a = edge[m];
          const b = edge[m + 1];
          out.push(a, base + m, b, b, base + m, base + m + 1, a, b, base + m, b, base + m + 1, base + m);
        }
        base += n;
      }
      ix = Uint32Array.from(out);
      indexCache.set(S, ix);
    }
    return ix;
  };

  function startJob(level: number, bi: number, bj: number, variant: number): Job {
    const S = variant < 0 ? segs[level] : segs[variant];
    const side = BLOCK[level];
    const x0 = TERRAIN_X0 + bi * side;
    const z0 = TERRAIN_Z0 + bj * side;
    // (the finest blocks read the baked field — and in the park, with its painted trails, the next
    // ring out does too; elsewhere the rest work it out on the spot)
    const near = level === 0 && (variant < 0 || (variant === MID && Math.hypot(x0 + side / 2, z0 + side / 2) < ISLAND_R + 140));
    const n = S + 1;
    const vCount = n * n + 4 * n;
    return { level, bi, bj, variant, S, n, x0, z0, step: side / S, near, hs: new Float32Array((n + 2) * (n + 2)), cover: new Uint8Array((n + 2) * (n + 2)), pos: new Float32Array(vCount * 3), nor: new Float32Array(vCount * 3), col: new Float32Array(vCount * 3), row: 0 };
  }

  /** work on a job until `deadline` (performance.now()); the finished block, or null */
  function stepJob(J: Job, deadline: number): Built | null {
    const { n, S, step, hs, cover, pos, nor, col } = J;
    const N2 = n + 2;
    const hAt = J.near ? groundY : groundYFar;
    const mask = J.near ? opts.mask : undefined;
    // (one sample at a time, checking the clock every few: a sample can bake a tile of the ground
    // or the grass mask, so even one row can take a while)
    const H = N2 * N2;
    while (J.row < H) {
      const k = J.row;
      const x = J.x0 + ((k % N2) - 1) * step;
      const z = J.z0 + (Math.floor(k / N2) - 1) * step;
      const cv = terrainCovers(x, z);
      cover[k] = cv ? 1 : 0;
      hs[k] = cv ? hAt(x, z) : DEEP_FLOOR;
      J.row++;
      if ((J.row & 15) === 0 && performance.now() > deadline) return null;
    }
    while (J.row < H + n * n) {
      const k = J.row - H;
      const i = k % n;
      const j = Math.floor(k / n);
      const x = J.x0 + i * step;
      const z = J.z0 + j * step;
      const h = (j + 1) * N2 + (i + 1);
      const y = hs[h];
      // (over the open deep sea the deep sea floor is drawn instead: sink these out of sight)
      pos[k * 3] = x;
      pos[k * 3 + 1] = cover[h] ? y : DEEP_FLOOR - 60;
      pos[k * 3 + 2] = z;
      const dx = hs[h + 1] - hs[h - 1];
      const dz = hs[h + N2] - hs[h - N2];
      const l = Math.hypot(dx, 2 * step, dz);
      nor[k * 3] = -dx / l;
      nor[k * 3 + 1] = (2 * step) / l;
      nor[k * 3 + 2] = -dz / l;
      const slope = J.near ? slopeAt(x, z) : Math.min(1, Math.hypot(dx, dz) / (2 * step) / 1.4);
      groundColor(x, z, y, slope, c, mask, !!mask);
      col[k * 3] = c.r;
      col[k * 3 + 1] = c.g;
      col[k * 3 + 2] = c.b;
      J.row++;
      if ((J.row & 15) === 0 && J.row < H + n * n && performance.now() > deadline) return null;
    }
    // the mesh: the grid, then skirts — each edge's vertices again, dropped (the triangles are the
    // same for every block of this size: ./blockIndex)
    const drop = 1.5 + step * 0.6;
    const edges = blockEdges(S);
    let k = n * n;
    for (const edge of edges)
      for (const v of edge) {
        pos[k * 3] = pos[v * 3];
        pos[k * 3 + 1] = pos[v * 3 + 1] - drop;
        pos[k * 3 + 2] = pos[v * 3 + 2];
        nor.copyWithin(k * 3, v * 3, v * 3 + 3);
        col.copyWithin(k * 3, v * 3, v * 3 + 3);
        k++;
      }
    const idx = blockIndex(S).slice();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, material);
    mesh.name = `terrain-${J.level}-${J.bi}-${J.bj}${J.variant === STANDIN ? "-rough" : J.variant === MID ? "-mid" : ""}`;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.visible = false;
    group.add(mesh);
    return { mesh, tris: idx.length / 3, used: frame, level: J.level };
  }
  /** build a block now, all at once (the quick rough stand-ins) */
  const buildBlock = (level: number, bi: number, bj: number, variant: number) => stepJob(startJob(level, bi, bj, variant), Infinity)!;

  /** distance from (x, z) to block (level, bi, bj)'s square */
  const blockDist = (level: number, bi: number, bj: number, x: number, z: number) => {
    const side = BLOCK[level];
    const x0 = TERRAIN_X0 + bi * side;
    const z0 = TERRAIN_Z0 + bj * side;
    return Math.hypot(Math.max(x0 - x, 0, x - (x0 + side)), Math.max(z0 - z, 0, z - (z0 + side)));
  };

  /** does any of block (level, bi, bj) cover the island's ground (else it's all open deep sea) */
  const cg = terrainCoverGrid();
  const coversAny = (level: number, bi: number, bj: number) => {
    const side = BLOCK[level];
    const t0x = Math.floor((bi * side) / cg.size);
    const t0z = Math.floor((bj * side) / cg.size);
    const t1x = Math.min(cg.nx - 1, Math.ceil(((bi + 1) * side) / cg.size));
    const t1z = Math.min(cg.nz - 1, Math.ceil(((bj + 1) * side) / cg.size));
    for (let tz = t0z; tz <= t1z; tz++) for (let tx = t0x; tx <= t1x; tx++) if (cg.data[tz * cg.nx + tx]) return true;
    return false;
  };

  /** the blocks to draw this frame (leaves of the quadtree round the focus), nearest first */
  const leaves: { level: number; bi: number; bj: number; d: number }[] = [];
  function collect(level: number, bi: number, bj: number, x: number, z: number) {
    const side = BLOCK[level];
    // (off the field's far edges: nothing)
    if (TERRAIN_X0 + bi * side >= TERRAIN_X1 || TERRAIN_Z0 + bj * side >= TERRAIN_Z1) return;
    const d = blockDist(level, bi, bj, x, z);
    if (d > VIEW_R || !coversAny(level, bi, bj)) return;
    if (level > 0 && d < SPLIT_R[level]) {
      for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) collect(level - 1, bi * 2 + i, bj * 2 + j, x, z);
      return;
    }
    leaves.push({ level, bi, bj, d });
  }

  const shown = new Set<Built>();
  function update(focus: { x: number; z: number }, budgetMs = 2.5) {
    frame++;
    const t0 = performance.now();
    // (bake the ground just ahead of need: one tile a frame round the kid)
    if (budgetMs < Infinity) terrainPrefetch(focus.x, focus.z, 150, 1);
    leaves.length = 0;
    for (let bj = 0; bj < NBZ; bj++) for (let bi = 0; bi < NBX; bi++) collect(TOP, bi, bj, focus.x, focus.z);
    leaves.sort((a, b) => a.d - b.d);
    // (while the ground right round the kid is still a rough stand-in, build it faster)
    let budget = budgetMs;
    for (const L of leaves) {
      if (L.d > 60) break;
      if (!built.has(key(L.level, L.bi, L.bj, L.level === 0 && L.d > FINE_R ? MID : -1))) {
        budget = Math.max(budget, 8);
        break;
      }
    }
    const now = new Set<Built>();
    for (const L of leaves) {
      const variant = L.level === 0 && L.d > FINE_R ? MID : -1;
      const k = key(L.level, L.bi, L.bj, variant);
      let b = built.get(k);
      if (!b && performance.now() - t0 < budget) {
        // (a few rows within this frame's budget: big blocks finish over the next frames)
        let J = jobs.get(k);
        if (!J) jobs.set(k, (J = startJob(L.level, L.bi, L.bj, variant)));
        const done = stepJob(J, t0 + budget);
        if (done) {
          jobs.delete(k);
          built.set(k, (b = done));
        }
      }
      if (!b) {
        // not ready: whatever this block already has up, else a quick rough stand-in
        b = built.get(key(L.level, L.bi, L.bj, variant === MID ? -1 : MID)) ?? built.get(key(L.level, L.bi, L.bj, STANDIN));
        if (!b) {
          b = buildBlock(L.level, L.bi, L.bj, STANDIN);
          built.set(key(L.level, L.bi, L.bj, STANDIN), b);
        }
      }
      b.used = frame;
      now.add(b);
    }
    // (blocks half-built for somewhere the kid has left: dropped)
    if (jobs.size > 12) for (const k of [...jobs.keys()].slice(0, jobs.size - 12)) jobs.delete(k);
    for (const b of shown) if (!now.has(b)) b.mesh.visible = false;
    for (const b of now) b.mesh.visible = true;
    shown.clear();
    for (const b of now) shown.add(b);
    // forget the longest-unused blocks
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

  const step = new THREE.Vector3();
  return {
    group,
    material,
    update,
    raycast(ray, out, maxD = 500) {
      // march along the ray, then bisect where it crosses the ground
      const above = (s: number) => {
        ray.at(s, step);
        return step.y - groundY(step.x, step.z);
      };
      const dt = 0.6;
      let s0 = 0;
      if (above(0) < 0) return false;
      for (let s = dt; s <= maxD; s += dt) {
        if (above(s) < 0) {
          let a = s0;
          let b = s;
          for (let k = 0; k < 18; k++) {
            const m = (a + b) / 2;
            if (above(m) < 0) b = m;
            else a = m;
          }
          ray.at(b, out);
          if (!inTerrain(out.x, out.z)) return false;
          out.y = groundY(out.x, out.z);
          return true;
        }
        s0 = s;
      }
      return false;
    },
    stats() {
      let drawn = 0;
      let triangles = 0;
      const levels = BLOCK.map(() => 0);
      for (const b of shown) {
        drawn++;
        triangles += b.tris;
        levels[b.level]++;
      }
      return { drawn, triangles, built: built.size, levels };
    },
    dispose() {
      for (const b of built.values()) b.mesh.geometry.dispose();
      built.clear();
      material.dispose();
    },
  };
}
