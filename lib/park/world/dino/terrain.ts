// Dino Isle's ground and water, in island-local coordinates (the island's centre at the origin).
//
// Ground: the registry's height grid, triangulated exactly as dinoLandY() interpolates it (so feet
// sit on the grass), flat-coloured per face — lush jungle greens, sunny plains, golden beaches,
// sandy trails, dark volcanic rock with red-hot gullies near the crater, and in the Ice Age valley
// snow, rock, the glacier's white-and-blue ice with deep blue crevasses and the frozen pond; under
// the sea pale sand shading to teal and deep blue with a coral-dotted reef crest; then a coarse
// skirt down the flanks to the deep floor.
// Water (one mesh): the lagoon's clear turquoise, the murky green swamp, the river and the plateau
// stream (flowing ripples and foam), the waterfall's tumbling curtain, and a "shallows" ring over
// the reef that rides the ocean's own swell (calmed like the ocean is, via dinoCalm).
import * as THREE from "three";
import {
  DINO_CAVE,
  DINO_EXTENT,
  DINO_GRID,
  DINO_ISLAND,
  DINO_LAGOON,
  DINO_N,
  DINO_PADDOCK,
  DINO_POND,
  DINO_RIVER,
  DINO_RIVER_HALF,
  DINO_SEA_R,
  DINO_STREAM,
  DINO_SWAMP,
  DINO_VOLCANO,
  DINO_WATERFALL,
  DINO_WATER_Y,
  DINO_CALM_GLSL,
  DINO_DIG,
  DINO_NESTS,
  DINO_CAMP,
  DINO_PLAZA,
  DINO_GATE,
  dinoCalm,
  dinoCoastR,
  dinoGlacier,
  dinoGrid,
  dinoHeightAt,
  dinoInCave,
  dinoLandY,
  dinoRng,
  dinoSnow,
  dinoTrailDistance,
  dinoWaterAt,
} from "../../registry/dinoIsland";
import { noise2 } from "../fantasy/noise";

const X0 = DINO_ISLAND.x;
const Z0 = DINO_ISLAND.z;
const c = (h: string) => new THREE.Color(h);
const JUNGLE = [c("#3f9a46"), c("#4fae4c"), c("#358a40")];
const PLAINS_A = c("#96c95a");
const PLAINS_B = c("#b5d466");
const FLOWER = [c("#ffd84a"), c("#ff8fb0"), c("#fff4f0")];
const SAND = c("#f4dfa4");
const SAND_WET = c("#dcc284");
const PATH = c("#e9cf96");
const DIRT = c("#b89a68");
const ROCK = c("#a89a8c");
const ROCK_D = c("#8a7e74");
const BASALT = c("#5e5058");
const BASALT_D = c("#4a3f48");
const HOT = c("#e0582a");
const HOT_D = c("#b8341e");
const CRATER = c("#3a2c30");
const SNOW = c("#f6f9ff");
const SNOW_B = c("#e4eefa");
const SNOW_ROCK = c("#98a2b4");
const SNOW_PATH = c("#d6dae6");
const TUNDRA = c("#b8b88a");
const ICE = c("#d8f0fc");
const ICE_B = c("#b4dcf4");
const CREVASSE = c("#3f86cc");
const ICE_CLIFF = c("#8cc8ec");
const POND_ICE = c("#cfeefc");
const UNDER_SAND = c("#e8d49a");
const UNDER_TEAL = c("#58b8b0");
const UNDER_DEEP = c("#2a5f8a");
const CORAL = [c("#ff7fa0"), c("#ffb35c"), c("#b58cff"), c("#ff9ad8"), c("#6fe0c8")];
const LAGOON_BED = c("#e9e0b8");
const SWAMP_BED = c("#6a7040");
const RIVER_BED = c("#b8b090");
const MUD = c("#7f8a4c");

const _c = new THREE.Color();
const _t = new THREE.Color();
const smooth = (a: number, b: number, x: number) => {
  const u = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return u * u * (3 - 2 * u);
};
const V = DINO_VOLCANO;

function faceColor(x: number, y: number, z: number, slope: number, rnd: () => number, out: THREE.Color): THREE.Color {
  // (x, z local)
  const wx = x + X0;
  const wz = z + Z0;
  const d = Math.hypot(x, z);
  const s = d / dinoCoastR(Math.atan2(x, z));
  const jit = 0.95 + rnd() * 0.07;
  if (y < DINO_WATER_Y - 0.1 && s > 0.95) {
    if (s > 1.16 && s < 1.28 && rnd() < 0.45) return out.copy(CORAL[Math.floor(rnd() * CORAL.length)]);
    out.copy(UNDER_SAND).lerp(UNDER_TEAL, smooth(-0.5, -6, y));
    return out.lerp(UNDER_DEEP, smooth(-6, -20, y)).multiplyScalar(0.94 + rnd() * 0.06);
  }
  const snow = dinoSnow(wx, wz);
  // water beds
  const water = dinoWaterAt(wx, wz);
  if (water !== null && water > y) {
    if (Math.hypot(wx - DINO_SWAMP.x, wz - DINO_SWAMP.z) < DINO_SWAMP.rx * 1.4) return out.copy(SWAMP_BED).multiplyScalar(jit);
    if (Math.hypot(wx - DINO_LAGOON.x, wz - DINO_LAGOON.z) < DINO_LAGOON.rx * 1.4) return out.copy(LAGOON_BED).multiplyScalar(jit);
    return out.copy(RIVER_BED).multiplyScalar(0.9 + rnd() * 0.12);
  }
  // the volcano: dark rock, red-hot gullies near the top, the black crater
  const vd = Math.hypot(wx - V.x, wz - V.z);
  const vk = 1 - vd / V.r;
  if (vk > 0.12 && snow < 0.3) {
    if (vd < V.craterR + 0.6) return out.copy(CRATER).multiplyScalar(jit);
    const va = Math.atan2(wx - V.x, wz - V.z);
    const gully = Math.sin(7 * va + 0.5) < -0.86 && vk > 0.33;
    if (gully) return out.copy(rnd() < 0.5 ? HOT : HOT_D);
    out.copy(rnd() < 0.5 ? BASALT : BASALT_D);
    // (greener at the foot, where the jungle climbs)
    _t.copy(JUNGLE[Math.floor(rnd() * 3)]);
    return out.lerp(_t, 1 - smooth(0.12, 0.42, vk)).multiplyScalar(jit);
  }
  // the ice: glacier, cave, pond, snow
  const g = dinoGlacier(wx, wz);
  if (g) {
    if (Math.sin(Math.min(1, Math.max(0, g.t)) * 38 + g.q * 0.4) > 0.8) return out.copy(CREVASSE).multiplyScalar(0.9 + rnd() * 0.15);
    if (slope > 0.9) return out.copy(ICE_CLIFF).multiplyScalar(jit);
    return out.copy(rnd() < 0.6 ? ICE : ICE_B).multiplyScalar(0.97 + rnd() * 0.04);
  }
  if (dinoInCave(wx, wz)) return out.copy(ICE_B).multiplyScalar(0.8);
  if (Math.hypot(wx - DINO_CAVE.x, wz - DINO_CAVE.z) < 12 && slope > 1.2 && snow > 0.8) return out.copy(ICE_CLIFF).multiplyScalar(jit);
  const pd = Math.hypot(wx - DINO_POND.x, wz - DINO_POND.z);
  if (pd < DINO_POND.r) return rnd() < 0.08 ? out.copy(SNOW) : out.copy(POND_ICE).multiplyScalar(0.97 + rnd() * 0.04);
  const td = dinoTrailDistance(wx, wz);
  const beach = y < 1.6 || s > 0.9;
  // warm ground
  if (beach) out.copy(y < 0.7 ? SAND_WET : SAND).multiplyScalar(0.95 + rnd() * 0.05);
  else if (td < 1.25) out.copy(PATH).multiplyScalar(0.93 + rnd() * 0.07);
  else if (slope > 1.25) out.copy(rnd() < 0.5 ? ROCK : ROCK_D);
  else {
    const jk = jungleK(x, z);
    const k = noise2(x / 11 + 3, z / 11 - 7, 5);
    out.copy(PLAINS_A).lerp(PLAINS_B, Math.min(1, Math.max(0, (k - 0.3) * 1.8)));
    _t.copy(JUNGLE[Math.floor(rnd() * 3)]);
    out.lerp(_t, jk);
    if (rnd() < 0.007 * (1 - jk)) out.lerp(FLOWER[Math.floor(rnd() * 3)], 0.55);
    // trampled places: the paddock, the nests, the dig, the plaza, the gate
    const pk = Math.hypot(wx - DINO_PADDOCK.x, wz - DINO_PADDOCK.z) < DINO_PADDOCK.r - 0.5 ? 0.45 + noise2(x / 3, z / 3, 9) * 0.4 : 0;
    const nk = Math.hypot(wx - DINO_NESTS.x, wz - DINO_NESTS.z) < 6 ? 0.7 : 0;
    const dk = Math.hypot(wx - DINO_DIG.x, wz - DINO_DIG.z) < DINO_DIG.r + 0.6 ? 1 : 0;
    const plk = Math.hypot(wx - DINO_PLAZA.x, wz - DINO_PLAZA.z) < 6.5 || Math.hypot(wx - DINO_GATE.x, wz - DINO_GATE.z) < 5 ? 0.85 : 0;
    const swk = Math.hypot(wx - DINO_SWAMP.x, wz - DINO_SWAMP.z) < DINO_SWAMP.rx * 1.35 ? 0.6 : 0;
    if (pk) out.lerp(DIRT, pk);
    if (nk) out.lerp(SAND, nk);
    if (dk) out.copy(c("#d9a45e")).multiplyScalar(0.92 + rnd() * 0.1);
    if (plk) out.lerp(PATH, plk);
    if (swk) out.lerp(MUD, swk);
    if (s > 0.84) out.lerp(SAND, 0.4);
    out.multiplyScalar(0.97 + rnd() * 0.05);
  }
  // snow over it all in the Ice Age valley (the trails packed, rock showing on steep faces)
  if (snow > 0.02) {
    if (td < 1.25 && !beach) _t.copy(SNOW_PATH);
    else if (slope > 1.15) _t.copy(SNOW_ROCK).multiplyScalar(0.92 + rnd() * 0.12);
    else if (Math.hypot(wx - DINO_CAMP.x, wz - DINO_CAMP.z) < 6) _t.copy(SNOW_B).lerp(TUNDRA, 0.25);
    else _t.copy(rnd() < 0.55 ? SNOW : SNOW_B).lerp(TUNDRA, noise2(x / 6, z / 6, 17) > 0.72 ? 0.5 : 0);
    out.lerp(_t, smooth(0.1, 0.6, snow + (noise2(x / 3, z / 3, 18) - 0.5) * 0.3));
  }
  return out;
}

/** 0 open plains .. 1 deep jungle (for the ground's greens; matches the registry's tree scatter) */
function jungleK(x: number, z: number) {
  const west = smooth(10, -20, x) * (1 - smooth(-10, 10, z - 60));
  const gate = 1 - smooth(8, 24, Math.hypot(x - 38, z + 36));
  const ring = smooth(0.55, 0.78, Math.hypot(x, z) / dinoCoastR(Math.atan2(x, z)));
  return Math.min(1, Math.max(west, gate, ring * 0.7) + (noise2(x / 12, z / 12, 41) - 0.5) * 0.4);
}

/** the island's ground (land + reef + flanks) as one flat-shaded, face-coloured mesh */
export function buildGroundGeometry(low: boolean): THREE.BufferGeometry {
  const N = DINO_N;
  const G = DINO_GRID;
  const E = DINO_EXTENT;
  const g = dinoGrid();
  const rnd = dinoRng(77);
  const pos: number[] = [];
  const colr: number[] = [];
  const keepR = E - 0.5;
  const tri = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number) => {
    pos.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    const ux = bx - ax;
    const uy = by - ay;
    const uz = bz - az;
    const vx = cx - ax;
    const vy = cy - ay;
    const vz = cz - az;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const slope = 1 - Math.abs(ny) / Math.hypot(nx, ny, nz);
    faceColor((ax + bx + cx) / 3, (ay + by + cy) / 3, (az + bz + cz) / 3, slope * 2.2, rnd, _c);
    for (let k = 0; k < 3; k++) colr.push(_c.r, _c.g, _c.b);
  };
  // the grid (cells split along the (i+1, j) – (i, j+1) diagonal, like dinoLandY). Where a 2x2
  // block is well under the sea (nobody stands there) it's drawn as one coarser cell.
  const deep = (i: number, j: number) => {
    if (i + 2 >= N || j + 2 >= N) return false;
    for (let b = 0; b <= 2; b++) for (let a = 0; a <= 2; a++) if (g[(j + b) * N + i + a] > DINO_WATER_Y - (low ? 0.5 : 1.2)) return false;
    return true;
  };
  for (let j = 0; j < N - 1; j++)
    for (let i = 0; i < N - 1; i++) {
      const x0 = -E + i * G;
      const z0 = -E + j * G;
      if (Math.hypot(x0 + G / 2, z0 + G / 2) > keepR) continue;
      const bi = i - (i % 2);
      const bj = j - (j % 2);
      const block = deep(bi, bj);
      if (block && (i % 2 || j % 2)) continue;
      const S = block ? 2 : 1;
      const x1 = x0 + G * S;
      const z1 = z0 + G * S;
      const k = j * N + i;
      const h00 = g[k];
      const h10 = g[k + S];
      const h01 = g[k + N * S];
      const h11 = g[k + N * S + S];
      tri(x0, h00, z0, x0, h01, z1, x1, h10, z0);
      tri(x1, h11, z1, x1, h10, z0, x0, h01, z1);
    }
  // the skirt: rings from inside the grid's edge down the flanks to the deep floor
  const segs = low ? 80 : 120;
  const rings = low ? 5 : 8;
  const r0 = E - 3;
  const r1 = DINO_SEA_R + 2;
  const ringR = (i: number) => r0 + (r1 - r0) * Math.pow(i / rings, 1.3);
  const hAt = (r: number, a: number) => dinoHeightAt(X0 + Math.sin(a) * r, Z0 + Math.cos(a) * r);
  for (let i = 0; i < rings; i++)
    for (let k = 0; k < segs; k++) {
      const a0 = (k / segs) * Math.PI * 2;
      const a1 = ((k + 1) / segs) * Math.PI * 2;
      const ra = ringR(i);
      const rb = ringR(i + 1);
      const p = [
        [Math.sin(a0) * ra, hAt(ra, a0), Math.cos(a0) * ra],
        [Math.sin(a1) * ra, hAt(ra, a1), Math.cos(a1) * ra],
        [Math.sin(a0) * rb, hAt(rb, a0), Math.cos(a0) * rb],
        [Math.sin(a1) * rb, hAt(rb, a1), Math.cos(a1) * rb],
      ];
      tri(p[0][0], p[0][1] - 0.05, p[0][2], p[2][0], p[2][1], p[2][2], p[1][0], p[1][1] - 0.05, p[1][2]);
      tri(p[1][0], p[1][1] - 0.05, p[1][2], p[2][0], p[2][1], p[2][2], p[3][0], p[3][1], p[3][2]);
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colr, 3));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

// ── water ──

/** the ocean's swell (a copy of ocean.ts's seaWave, in world xz) */
const SEA_WAVE_GLSL = /* glsl */ `
  float seaWave( vec2 p, float t ) {
    return sin( p.x * 0.08 + t * 0.9 ) * 0.35 + sin( p.y * 0.11 - t * 1.1 ) * 0.28 + sin( ( p.x + p.y ) * 0.05 + t * 0.6 ) * 0.4
         + sin( dot( p, vec2( 0.13, -0.21 ) ) + t * 1.45 ) * 0.12;
  }`;
/** the same swell in JS, calmed round the island (the plesiosaur bobs on it) */
export function seaWave(x: number, z: number, t: number): number {
  return dinoCalm(x, z) * (Math.sin(x * 0.08 + t * 0.9) * 0.35 + Math.sin(z * 0.11 - t * 1.1) * 0.28 + Math.sin((x + z) * 0.05 + t * 0.6) * 0.4 + Math.sin(x * 0.13 - z * 0.21 + t * 1.45) * 0.12);
}

export interface WaterUniforms {
  uTime: { value: number };
  uGlow: { value: number };
  uFogColor: { value: THREE.Color };
  uFogNear: { value: number };
  uFogFar: { value: number };
}

/** water kinds */
const W_LAGOON = 0;
const W_SEA = 1;
const W_SWAMP = 2;
const W_RIVER = 3;
const W_FALL = 4;

/** the lagoon, swamp, river, stream, waterfall and the reef shallows in one mesh */
export function buildWater(low: boolean, U: WaterUniforms): THREE.Mesh {
  const pos: number[] = [];
  const kind: number[] = [];
  const floor: number[] = [];
  const edge: number[] = [];
  const flow: number[] = [];
  const idx: number[] = [];
  const vert = (x: number, y: number, z: number, k: number, f: number, e: number, fl: number) => {
    pos.push(x, y, z);
    kind.push(k);
    floor.push(f);
    edge.push(e);
    flow.push(fl);
    return pos.length / 3 - 1;
  };
  const upTri = (a: number, b: number, cc: number) => {
    // (wind every triangle so it faces up, or out of the cliff for the waterfall)
    const ax = pos[a * 3];
    const az = pos[a * 3 + 2];
    const bx = pos[b * 3];
    const bz = pos[b * 3 + 2];
    const cx = pos[cc * 3];
    const cz = pos[cc * 3 + 2];
    const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    if (ny >= 0) idx.push(a, b, cc);
    else idx.push(a, cc, b);
  };
  // lagoon + swamp: ellipse fans
  const ellipse = (L: { x: number; z: number; rx: number; rz: number; rot: number; waterY: number }, k: number, segs: number, rings: number) => {
    const cr = Math.cos(L.rot);
    const sr = Math.sin(L.rot);
    const c0 = vert(L.x - X0, L.waterY, L.z - Z0, k, dinoHeightAt(L.x, L.z), 0, 0);
    const ring: number[][] = [];
    for (let i = 1; i <= rings; i++) {
      const e = (1.34 * i) / rings;
      const row: number[] = [];
      for (let q = 0; q < segs; q++) {
        const a = (q / segs) * Math.PI * 2;
        const u = Math.sin(a) * L.rx * e;
        const v = Math.cos(a) * L.rz * e;
        const x = L.x + u * cr + v * sr;
        const z = L.z - u * sr + v * cr;
        row.push(vert(x - X0, L.waterY, z - Z0, k, dinoLandY(x, z) ?? dinoHeightAt(x, z), e, 0));
      }
      ring.push(row);
    }
    for (let q = 0; q < segs; q++) upTri(c0, ring[0][(q + 1) % segs], ring[0][q]);
    for (let i = 0; i + 1 < rings; i++)
      for (let q = 0; q < segs; q++) {
        const a = ring[i][q];
        const b = ring[i][(q + 1) % segs];
        const cc = ring[i + 1][q];
        const d = ring[i + 1][(q + 1) % segs];
        upTri(a, b, cc);
        upTri(b, d, cc);
      }
  };
  ellipse(DINO_LAGOON, W_LAGOON, low ? 26 : 36, low ? 4 : 6);
  ellipse(DINO_SWAMP, W_SWAMP, low ? 28 : 40, low ? 4 : 6);
  // the river: a ribbon down its centreline, each cross-section at its own water height
  const ribbon = (pts: { x: number; z: number; y: number }[], half: number, step: number, skip: number) => {
    let acc = 0;
    let prevRow: [number, number, number] | null = null;
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const L = Math.hypot(b.x - a.x, b.z - a.z);
      const n = Math.max(1, Math.ceil(L / step));
      for (let k = i === 0 ? 0 : 1; k <= n; k++) {
        const u = k / n;
        const s = acc + u * L;
        if (s < skip) continue;
        const x = a.x + (b.x - a.x) * u;
        const z = a.z + (b.z - a.z) * u;
        const y = a.y + (b.y - a.y) * u;
        const px = -(b.z - a.z) / L;
        const pz = (b.x - a.x) / L;
        const row: [number, number, number] = [
          vert(x - px * half - X0, y, z - pz * half - Z0, W_RIVER, dinoLandY(x - px * half, z - pz * half) ?? y - 0.5, 1, s),
          vert(x - X0, y, z - Z0, W_RIVER, dinoLandY(x, z) ?? y - 0.5, 0, s),
          vert(x + px * half - X0, y, z + pz * half - Z0, W_RIVER, dinoLandY(x + px * half, z + pz * half) ?? y - 0.5, 1, s),
        ];
        if (prevRow) {
          upTri(prevRow[0], prevRow[1], row[0]);
          upTri(prevRow[1], row[1], row[0]);
          upTri(prevRow[1], prevRow[2], row[1]);
          upTri(prevRow[2], row[2], row[1]);
        }
        prevRow = row;
      }
      acc += L;
    }
  };
  ribbon(DINO_RIVER, DINO_RIVER_HALF + 0.9, low ? 2.2 : 1.4, 2.5);
  // the plateau's stream (sitting in its groove)
  const streamPts = DINO_STREAM.map((p) => ({ x: p.x, z: p.z, y: (dinoLandY(p.x, p.z) ?? 12) + 0.16 }));
  ribbon(streamPts, 1.2, 1.2, 0);
  // the waterfall: a curtain from the lip down the cliff face into the lagoon, hugging the rock
  const F = DINO_WATERFALL;
  const fx = Math.sin(F.rot);
  const fz = Math.cos(F.rot);
  const sx = fz;
  const sz = -fx;
  const rowsN = low ? 8 : 12;
  const colsN = low ? 4 : 6;
  const grid: number[][] = [];
  for (let r = 0; r <= rowsN; r++) {
    const u = r / rowsN;
    const y = F.top + (F.bottom - F.top) * u;
    const row: number[] = [];
    for (let q = 0; q <= colsN; q++) {
      const v = q / colsN - 0.5;
      const bx = F.x + sx * v * F.w * (1 + u * 0.35);
      const bz = F.z + sz * v * F.w * (1 + u * 0.35);
      // march out from the lip until the rock is below this height, then stand a little off it
      let o = -1.5;
      while (o < 8 && (dinoHeightAt(bx + fx * o, bz + fz * o) ?? 0) > y - 0.05) o += 0.2;
      const off = o + 0.45 + u * 0.4;
      row.push(vert(bx + fx * off - X0, y, bz + fz * off - Z0, W_FALL, y - 3, Math.abs(v) * 2, u));
    }
    grid.push(row);
  }
  for (let r = 0; r < rowsN; r++)
    for (let q = 0; q < colsN; q++) {
      const a = grid[r][q];
      const b = grid[r][q + 1];
      const cc = grid[r + 1][q];
      const d = grid[r + 1][q + 1];
      idx.push(a, b, cc, b, d, cc);
    }
  // the reef shallows: a ring from under the beach out past the reef
  const ss = low ? 100 : 150;
  const sRings = low ? 9 : 13;
  const s0 = 0.84;
  const s1 = 1.5;
  const sb = pos.length / 3;
  for (let i = 0; i <= sRings; i++) {
    const s = s0 + (s1 - s0) * Math.pow(i / sRings, 1.25);
    for (let q = 0; q < ss; q++) {
      const a = (q / ss) * Math.PI * 2;
      const r = dinoCoastR(a) * s;
      const x = Math.sin(a) * r;
      const z = Math.cos(a) * r;
      vert(x, DINO_WATER_Y, z, W_SEA, dinoHeightAt(x + X0, z + Z0), smooth(1.24, s1, s), 0);
    }
  }
  const sr = (i: number, q: number) => sb + i * ss + (q % ss);
  for (let i = 0; i < sRings; i++)
    for (let q = 0; q < ss; q++) {
      upTri(sr(i, q), sr(i, q + 1), sr(i + 1, q));
      upTri(sr(i, q + 1), sr(i + 1, q + 1), sr(i + 1, q));
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("aKind", new THREE.Float32BufferAttribute(kind, 1));
  geo.setAttribute("aFloor", new THREE.Float32BufferAttribute(floor, 1));
  geo.setAttribute("aEdge", new THREE.Float32BufferAttribute(edge, 1));
  geo.setAttribute("aFlow", new THREE.Float32BufferAttribute(flow, 1));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { ...U },
    vertexShader: /* glsl */ `
      attribute float aKind; attribute float aFloor; attribute float aEdge; attribute float aFlow;
      uniform float uTime;
      varying float vKind; varying float vFloor; varying float vEdge; varying float vFlow; varying vec3 vW; varying float vDist; varying float vWave;
      ${SEA_WAVE_GLSL}
      ${DINO_CALM_GLSL}
      void main() {
        vec4 w = modelMatrix * vec4( position, 1.0 );
        float wave = seaWave( w.xz, uTime ) * dinoCalm( w.xz );
        vWave = wave;
        if ( aKind > 0.5 && aKind < 1.5 ) w.y += wave + 0.1;
        else if ( aKind < 3.5 ) w.y += sin( w.x * 0.9 + uTime * 1.3 ) * 0.02 + sin( w.z * 1.1 - uTime ) * 0.02;
        vKind = aKind; vFloor = aFloor; vEdge = aEdge; vFlow = aFlow; vW = w.xyz;
        vec4 mv = viewMatrix * w;
        vDist = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform float uGlow; uniform vec3 uFogColor; uniform float uFogNear; uniform float uFogFar;
      varying float vKind; varying float vFloor; varying float vEdge; varying float vFlow; varying vec3 vW; varying float vDist; varying float vWave;
      float hash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
      void main() {
        float depth = max( 0.0, vW.y - vFloor );
        vec3 col; float a;
        vec2 q = vW.xz * 0.8; vec2 cell = floor( q );
        float g = hash( cell + floor( uTime * 1.3 ) );
        float dotG = 1.0 - smoothstep( 0.08, 0.24, length( fract( q ) - 0.5 ) );
        if ( vKind < 0.5 ) {
          // the lagoon: clear, bright turquoise over pale sand; foam rings where the waterfall lands
          col = mix( vec3( 0.2, 0.8, 0.84 ), vec3( 0.06, 0.55, 0.72 ), smoothstep( 0.05, 0.45, depth ) );
          col = mix( col, vec3( 0.08, 0.22, 0.42 ), uGlow * 0.6 );
          float rip = sin( vW.x * 2.1 + uTime * 1.7 ) * sin( vW.z * 1.7 - uTime * 1.3 );
          col *= 0.95 + rip * 0.05;
          col += step( 0.95, g ) * dotG * vec3( 1.0 ) * 0.5 * ( 1.0 - uGlow );
          float fd = length( vW.xz - vec2( ${(DINO_WATERFALL.x + Math.sin(DINO_WATERFALL.rot) * 1.6).toFixed(2)}, ${(DINO_WATERFALL.z + Math.cos(DINO_WATERFALL.rot) * 1.6).toFixed(2)} ) );
          float foamF = ( 1.0 - smoothstep( 1.0, 4.5, fd ) ) * ( 0.6 + 0.4 * sin( fd * 5.0 - uTime * 6.0 ) );
          col = mix( col, vec3( 1.0 ), clamp( foamF, 0.0, 1.0 ) * 0.8 );
          a = mix( 0.55, 0.85, smoothstep( 0.0, 0.5, depth ) );
          float rim = 1.0 - smoothstep( 0.0, 0.06, depth );
          col = mix( col, vec3( 1.0 ), rim * 0.45 );
          a = max( a, max( rim * 0.7, foamF * 0.8 ) );
        } else if ( vKind < 1.5 ) {
          // the reef shallows: turquoise over sand, teal over the shelf, fading into the ocean's blue
          vec3 shallow = mix( vec3( 0.3, 0.86, 0.8 ), vec3( 0.06, 0.55, 0.62 ), smoothstep( 0.4, 3.5, depth ) );
          shallow = mix( shallow, vec3( 0.07, 0.34, 0.66 ), smoothstep( 3.5, 9.0, depth ) );
          col = mix( shallow, vec3( 0.04, 0.12, 0.34 ), uGlow * 0.7 );
          col *= 0.93 + 0.1 * smoothstep( -0.9, 0.9, vWave );
          col += step( 0.96, g ) * dotG * smoothstep( 0.1, 0.7, vWave ) * vec3( 1.0 ) * 0.6 * ( 1.0 - uGlow );
          float foam = 1.0 - smoothstep( 0.0, 0.45 + 0.15 * sin( vW.x * 0.7 + uTime * 2.0 ), depth );
          float crest = smoothstep( 0.35, 0.5, vEdge ) * ( 1.0 - smoothstep( 0.5, 0.7, vEdge ) ) * step( 0.55, hash( floor( vW.xz * 0.6 ) + floor( uTime * 0.8 ) ) );
          col = mix( col, vec3( 1.0, 0.99, 0.97 ) * mix( 1.0, 0.55, uGlow ), max( foam * 0.9, crest * 0.4 ) );
          col += uGlow * step( 0.93, hash( cell + floor( uTime * 0.5 ) ) ) * dotG * vec3( 0.3, 1.0, 0.95 ) * 0.6;
          a = mix( 0.8, 0.9, foam ) * ( 1.0 - vEdge );
        } else if ( vKind < 2.5 ) {
          // the swamp: murky green, lily pads, bubbles popping, glowing specks at night
          col = mix( vec3( 0.36, 0.52, 0.26 ), vec3( 0.22, 0.36, 0.2 ), smoothstep( 0.05, 0.4, depth ) );
          col = mix( col, vec3( 0.06, 0.16, 0.12 ), uGlow * 0.6 );
          vec2 lp = vW.xz * 0.45; vec2 lc = floor( lp );
          float pad = step( 0.72, hash( lc * 3.1 ) ) * ( 1.0 - smoothstep( 0.22, 0.3, length( fract( lp ) - 0.5 ) ) );
          col = mix( col, vec3( 0.36, 0.72, 0.28 ), pad );
          float bub = step( 0.985, hash( cell + floor( uTime * 2.0 ) ) ) * dotG;
          col = mix( col, vec3( 0.85, 0.95, 0.8 ), bub );
          col += uGlow * step( 0.92, hash( cell * 1.3 + floor( uTime * 0.7 ) ) ) * dotG * vec3( 0.6, 1.0, 0.4 ) * 0.8;
          a = mix( 0.8, 0.93, smoothstep( 0.0, 0.3, depth ) );
          float rim = 1.0 - smoothstep( 0.0, 0.07, depth );
          a *= 1.0 - rim * 0.6;
        } else if ( vKind < 3.5 ) {
          // the river: flowing ripples and streaks of foam, clear over the pebbles
          col = mix( vec3( 0.4, 0.84, 0.86 ), vec3( 0.12, 0.58, 0.7 ), smoothstep( 0.1, 0.5, depth ) );
          col = mix( col, vec3( 0.08, 0.2, 0.4 ), uGlow * 0.6 );
          float st = sin( vFlow * 1.6 - uTime * 4.0 + sin( vW.x * 1.3 + vW.z ) * 1.2 ) * sin( vEdge * 7.0 + vFlow * 0.3 );
          col = mix( col, vec3( 1.0 ), smoothstep( 0.72, 0.95, st ) * 0.7 );
          col += step( 0.95, g ) * dotG * vec3( 1.0 ) * 0.4 * ( 1.0 - uGlow );
          a = mix( 0.5, 0.85, smoothstep( 0.0, 0.4, depth ) ) * ( 1.0 - smoothstep( 0.85, 1.0, vEdge ) * 0.5 );
          float rim = 1.0 - smoothstep( 0.0, 0.08, depth );
          col = mix( col, vec3( 1.0 ), rim * 0.5 );
        } else {
          // the waterfall: tumbling white-and-blue streaks, frothy at the foot
          float lane = floor( vW.x * 2.3 + vW.z * 2.3 );
          float sp = 0.9 + hash( vec2( lane, 3.0 ) ) * 0.7;
          float streak = fract( vFlow * 3.0 - uTime * sp + hash( vec2( lane, 7.0 ) ) );
          col = mix( vec3( 0.55, 0.85, 0.95 ), vec3( 1.0 ), smoothstep( 0.35, 0.9, streak ) );
          col = mix( col, vec3( 1.0 ), smoothstep( 0.75, 1.0, vFlow ) );
          col = mix( col, vec3( 0.3, 0.45, 0.65 ), uGlow * 0.5 );
          a = ( 0.72 + 0.25 * streak ) * ( 1.0 - smoothstep( 0.75, 1.0, vEdge ) );
        }
        float fog = smoothstep( uFogNear, uFogFar, vDist );
        col = mix( col, uFogColor, fog );
        gl_FragColor = vec4( col, a );
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "dino-water";
  // (drawn after the ocean, so it tints the sea over the reef)
  mesh.renderOrder = 2;
  return mesh;
}
