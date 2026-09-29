// The grass mask: a baked RGBA8 image covering the island that tells the grass shader where it
// may grow. R = how much grass (0 none .. 1 full), G = tidy-lawn factor (1 = wild meadow,
// lower = shorter cut grass inside lands). Drawn from island.ts / places.ts / terrain.ts, so
// blades never poke through trails, the stream, the pond, the plaza, buildings, the Dream Park
// grid, steep cliffs or the beach. Pure (typed arrays only) — safe in Node and unit tested.
import { ISLAND_R, POND, STREAM_POINTS, STREAM_WIDTH, TRAIL_POINTS, TRAIL_WIDTH, coastR } from "../../registry/island";
import { LANDS, PLACES } from "../../registry/places";
import { TERRAIN_EXTENT, TERRAIN_N, terrainGrid } from "../../registry/terrain";
import { zoneBounds } from "../../builder/rules";
import { smoothstep } from "./noise";

/** mask resolution and the half-size (world units) of the square it covers, centred on 0,0 */
export const MASK_N = 1024;
export const MASK_HALF = ISLAND_R + 13;

/** slope (0 flat .. 1 cliff) for every terrain grid cell, same scale as terrain.ts slopeAt() */
export function terrainSlopeGrid(): Float32Array {
  const g = terrainGrid();
  const N = TERRAIN_N;
  const cell = (TERRAIN_EXTENT * 2) / (N - 1);
  const out = new Float32Array(N * N);
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const l = g[j * N + Math.max(0, i - 1)];
      const r = g[j * N + Math.min(N - 1, i + 1)];
      const d = g[Math.max(0, j - 1) * N + i];
      const u = g[Math.min(N - 1, j + 1) * N + i];
      out[j * N + i] = Math.min(1, Math.hypot(r - l, u - d) / (2 * cell) / 1.4);
    }
  return out;
}

function bilinear(grid: Float32Array, x: number, z: number): number {
  const N = TERRAIN_N;
  const cell = (TERRAIN_EXTENT * 2) / (N - 1);
  const fx = Math.min(N - 1.001, Math.max(0, (x + TERRAIN_EXTENT) / cell));
  const fz = Math.min(N - 1.001, Math.max(0, (z + TERRAIN_EXTENT) / cell));
  const i = Math.floor(fx);
  const j = Math.floor(fz);
  const u = fx - i;
  const v = fz - j;
  const k = j * N + i;
  return (grid[k] * (1 - u) + grid[k + 1] * u) * (1 - v) + (grid[k + N] * (1 - u) + grid[k + N + 1] * u) * v;
}

/** grass amount a pixel at world (x, z) gets from the terrain alone (cliffs, peaks, beach) */
export function terrainGrassFactor(x: number, z: number, h: number, slope: number): number {
  const r = Math.hypot(x, z);
  const coast = coastR(Math.atan2(x, z));
  let v = smoothstep(coast - 2.5, coast - 8, r); // sand at the shore
  v *= 1 - smoothstep(0.34, 0.56, slope); // rock shows on steep ground
  v *= 1 - smoothstep(30, 44, h); // thin out towards the peaks
  return v;
}

export interface GrassMask {
  n: number;
  half: number;
  /** RGBA8, row-major, rows = z (from -half), cols = x (from -half) */
  data: Uint8Array;
}

/** Bake the grass mask. Deterministic; ~40 ms at 1024². */
export function bakeGrassMask(n = MASK_N): GrassMask {
  const half = MASK_HALF;
  const px = (half * 2) / n;
  const amount = new Float32Array(n * n);
  const lawn = new Float32Array(n * n).fill(1);
  const slope = terrainSlopeGrid();
  const heights = terrainGrid();
  const wx = (i: number) => -half + (i + 0.5) * px;

  // start from the terrain: grass everywhere on the island except beach, cliffs, peaks
  for (let j = 0; j < n; j++) {
    const z = wx(j);
    for (let i = 0; i < n; i++) {
      const x = wx(i);
      if (Math.hypot(x, z) > ISLAND_R + 10) continue;
      amount[j * n + i] = terrainGrassFactor(x, z, bilinear(heights, x, z), bilinear(slope, x, z));
    }
  }

  // carve soft-edged discs: inside r0 no grass, fading back to full by r1
  const carve = (cx: number, cz: number, r0: number, r1: number, into = amount, floor = 0) => {
    const i0 = Math.max(0, Math.floor((cx - r1 + half) / px));
    const i1 = Math.min(n - 1, Math.ceil((cx + r1 + half) / px));
    const j0 = Math.max(0, Math.floor((cz - r1 + half) / px));
    const j1 = Math.min(n - 1, Math.ceil((cz + r1 + half) / px));
    for (let j = j0; j <= j1; j++) {
      const dz = wx(j) - cz;
      for (let i = i0; i <= i1; i++) {
        const dx = wx(i) - cx;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d >= r1) continue;
        const v = floor + (1 - floor) * smoothstep(r0, r1, d);
        const k = j * n + i;
        if (v < into[k]) into[k] = v;
      }
    }
  };

  const tr = TRAIL_WIDTH / 2;
  for (const pts of TRAIL_POINTS) for (const [x, z] of pts) carve(x, z, tr + 0.35, tr + 1.7);
  const sr = STREAM_WIDTH / 2 + 1.1; // water + sandy bank
  for (const [x, z] of STREAM_POINTS) carve(x, z, sr, sr + 1.3);
  carve(POND.x, POND.z, POND.r + 1.4, POND.r + 2.8);
  carve(0, 0, 9.6, 11.5); // the plaza
  for (const p of PLACES) {
    const r = Math.max(p.radius, 1.5);
    carve(p.x, p.z, r + 0.8, r + 2.4);
  }
  // lands: tidy, shorter lawns (not bare)
  for (const l of LANDS) {
    if (l.id === "forest") continue;
    carve(l.x, l.z, l.radius - 2, l.radius + 3, lawn, 0.45);
  }

  // the Dream Park build grid stays completely clear
  const zb = zoneBounds();
  for (let j = 0; j < n; j++) {
    const z = wx(j);
    if (z < zb.minZ - 3 || z > zb.maxZ + 3) continue;
    for (let i = 0; i < n; i++) {
      const x = wx(i);
      if (x < zb.minX - 3 || x > zb.maxX + 3) continue;
      const dx = Math.max(zb.minX - x, 0, x - zb.maxX);
      const dz = Math.max(zb.minZ - z, 0, z - zb.maxZ);
      const d = Math.hypot(dx, dz);
      const v = smoothstep(0.6, 3, d);
      const k = j * n + i;
      if (v < amount[k]) amount[k] = v;
    }
  }

  const data = new Uint8Array(n * n * 4);
  for (let k = 0; k < n * n; k++) {
    data[k * 4] = Math.round(Math.min(1, Math.max(0, amount[k])) * 255);
    data[k * 4 + 1] = Math.round(lawn[k] * 255);
    data[k * 4 + 2] = 0;
    data[k * 4 + 3] = 255;
  }
  return { n, half, data };
}

/** Read the mask's grass amount (0..1) at world (x, z) — nearest pixel (tests, CPU checks). */
export function maskAt(mask: GrassMask, x: number, z: number): number {
  const px = (mask.half * 2) / mask.n;
  const i = Math.floor((x + mask.half) / px);
  const j = Math.floor((z + mask.half) / px);
  if (i < 0 || j < 0 || i >= mask.n || j >= mask.n) return 0;
  return mask.data[(j * mask.n + i) * 4] / 255;
}
