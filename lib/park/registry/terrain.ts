// Cucaino Island's terrain: rolling hills and valleys, a mountain range with cliffs along the
// north coast, gentle slopes down to the beaches and a gully for the stream — while every trail,
// building, land, the plaza and the Dream Park sit on smoothly levelled ground so walking stays
// easy. Baked once into a height grid; `groundY(x, z)` samples it (bilinear) and the same grid
// can be uploaded as a texture for shaders (grass, etc.). Pure maths, deterministic, no three.js.
import { LANDS, PLACES } from "./places";
import { ISLAND_R, POND, STREAM_POINTS, TRAIL_POINTS, coastR } from "./island";
import { DREAM_ZONE } from "../builder/rules";

/** the grid covers [-EXTENT, EXTENT] on x and z */
export const TERRAIN_EXTENT = 200;
export const TERRAIN_N = 320;
const CELL = (TERRAIN_EXTENT * 2) / (TERRAIN_N - 1);

// ── value noise ──
function hash(x: number, y: number) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x: number, y: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi);
  const b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1);
  const d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x: number, y: number, oct = 4) {
  let s = 0;
  let amp = 0.5;
  let f = 1;
  for (let i = 0; i < oct; i++) {
    s += amp * vnoise(x * f, y * f);
    f *= 2.03;
    amp *= 0.5;
  }
  return s;
}
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** the wild land before anything is levelled */
function rawHeight(x: number, z: number): number {
  const r = Math.hypot(x, z);
  const a = Math.atan2(x, z);
  const coast = coastR(a);
  // rolling meadow hills
  let h = (fbm(x / 38 + 11, z / 38 - 7) - 0.45) * 11;
  // broad swells
  h += Math.sin(x / 61 + 1.3) * Math.cos(z / 53 - 0.7) * 3.5;
  // a mountain range with cliffs along the north coast (z very negative = north on the map)
  const north = smooth(0.1, 0.9, (-z - 40) / 90) * smooth(coast - 2, coast - 40, r);
  const ridge = Math.pow(fbm(x / 22 + 40, z / 22 + 3, 5), 1.6) * 60;
  h += north * (14 + ridge);
  // softer highlands in the far west
  const west = smooth(0.2, 1, (-x - 70) / 70) * smooth(coast, coast - 30, r);
  h += west * fbm(x / 30 - 5, z / 30 + 9) * 16;
  // slope down to the beach (level with the sand), then shelve away under the sea
  const edge = smooth(coast, coast - 26, r);
  h = h * edge;
  h -= smooth(coast + 10, coast + 30, r) * 4;
  return h;
}

let grid: Float32Array | null = null;

function bake(): Float32Array {
  const N = TERRAIN_N;
  const raw = new Float32Array(N * N);
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) raw[j * N + i] = rawHeight(-TERRAIN_EXTENT + i * CELL, -TERRAIN_EXTENT + j * CELL);

  // level the walkable things: stamp "target height + weight" discs, then blend
  const target = new Float32Array(N * N);
  const weight = new Float32Array(N * N);
  const stamp = (x: number, z: number, rIn: number, rOut: number, h: number) => {
    const i0 = Math.max(0, Math.floor((x - rOut + TERRAIN_EXTENT) / CELL));
    const i1 = Math.min(N - 1, Math.ceil((x + rOut + TERRAIN_EXTENT) / CELL));
    const j0 = Math.max(0, Math.floor((z - rOut + TERRAIN_EXTENT) / CELL));
    const j1 = Math.min(N - 1, Math.ceil((z + rOut + TERRAIN_EXTENT) / CELL));
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const d = Math.hypot(-TERRAIN_EXTENT + i * CELL - x, -TERRAIN_EXTENT + j * CELL - z);
        if (d > rOut) continue;
        const w = 1 - smooth(rIn, rOut, d);
        const k = j * N + i;
        if (w > weight[k]) {
          // the strongest stamp wins (a land beats the trail running into it)
          target[k] = h;
          weight[k] = w;
        }
      }
  };
  const sample = (x: number, z: number) => rawHeight(x, z);
  // trails: follow the land softly, so paths roll with the hills but never get steep
  for (const pts of TRAIL_POINTS) {
    const hs = pts.map(([x, z]) => sample(x, z) * 0.55);
    // smooth along the trail
    for (let pass = 0; pass < 6; pass++) for (let i = 1; i + 1 < hs.length; i++) hs[i] = (hs[i - 1] + hs[i] * 2 + hs[i + 1]) / 4;
    pts.forEach(([x, z], i) => stamp(x, z, 2.6, 7, hs[i]));
  }
  // lands, places, plaza, Dream Park: flat terraces
  const landH: Record<string, number> = {};
  for (const l of LANDS) {
    const h = l.id === "gate" ? 0 : sample(l.x, l.z) * 0.45;
    landH[l.id] = h;
    stamp(l.x, l.z, l.radius + 1, l.radius + 10, h);
  }
  for (const p of PLACES) stamp(p.x, p.z, p.radius + 2, p.radius + 7, landH[p.land] ?? 0);
  stamp(0, 0, 13, 24, 0);
  const dz = { cx: DREAM_ZONE.x0 + (DREAM_ZONE.cols * DREAM_ZONE.cell) / 2, cz: DREAM_ZONE.z0 + (DREAM_ZONE.rows * DREAM_ZONE.cell) / 2 };
  stamp(dz.cx, dz.cz, DREAM_ZONE.cols * DREAM_ZONE.cell * 0.75, DREAM_ZONE.cols * DREAM_ZONE.cell * 0.75 + 8, landH.dream ?? 0);
  // the stream runs in a little gully, the pond sits in a hollow
  const streamH = STREAM_POINTS.map(([x, z]) => sample(x, z) * 0.5 - 0.6);
  for (let pass = 0; pass < 8; pass++) for (let i = 1; i + 1 < streamH.length; i++) streamH[i] = Math.min(streamH[i - 1] + 0.02, (streamH[i - 1] + streamH[i] * 2 + streamH[i + 1]) / 4);
  STREAM_POINTS.forEach(([x, z], i) => stamp(x, z, 1.8, 5, streamH[i]));
  stamp(POND.x, POND.z, POND.r + 0.5, POND.r + 6, streamH[streamH.length - 1] ?? -0.6);

  const out = new Float32Array(N * N);
  for (let k = 0; k < out.length; k++) out[k] = raw[k] + (target[k] - raw[k]) * weight[k];
  // two soft blur passes so nothing has a hard edge (except the mountain cliffs, which stay bold)
  const tmp = new Float32Array(N * N);
  for (let pass = 0; pass < 2; pass++) {
    tmp.set(out);
    for (let j = 1; j < N - 1; j++)
      for (let i = 1; i < N - 1; i++) {
        const k = j * N + i;
        tmp[k] = (out[k] * 4 + out[k - 1] + out[k + 1] + out[k - N] + out[k + N]) / 8;
      }
    out.set(tmp);
  }
  return out;
}

/** the baked height grid (row-major, TERRAIN_N x TERRAIN_N, z rows / x columns) */
export function terrainGrid(): Float32Array {
  if (!grid) grid = bake();
  return grid;
}

/** ground height at (x, z) — everything that stands on the island uses this */
export function groundY(x: number, z: number): number {
  const g = terrainGrid();
  const N = TERRAIN_N;
  const fx = (x + TERRAIN_EXTENT) / CELL;
  const fz = (z + TERRAIN_EXTENT) / CELL;
  if (fx < 0 || fz < 0 || fx >= N - 1 || fz >= N - 1) return -4;
  const i = Math.floor(fx);
  const j = Math.floor(fz);
  const u = fx - i;
  const v = fz - j;
  const k = j * N + i;
  return (g[k] * (1 - u) + g[k + 1] * u) * (1 - v) + (g[k + N] * (1 - u) + g[k + N + 1] * u) * v;
}

/** how steep the ground is at (x, z): 0 flat .. 1 cliff (for rock vs grass colouring) */
export function slopeAt(x: number, z: number): number {
  const e = CELL;
  const dx = groundY(x + e, z) - groundY(x - e, z);
  const dz = groundY(x, z + e) - groundY(x, z - e);
  return Math.min(1, Math.hypot(dx, dz) / (2 * e) / 1.4);
}

export const ISLAND_RADIUS = ISLAND_R;
