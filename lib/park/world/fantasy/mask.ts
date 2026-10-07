// The grass mask: an RGBA8 image over the island that tells the grass shader where it may grow.
// R = how much grass (0 none .. 1 full), G = tidy-lawn factor (1 = wild meadow, lower = shorter
// cut grass inside lands), B = PAVING (1 on the park's paved trails, the plaza, the lands' squares
// and the pad under every building — the ground's own shader lays stone flags there with a crisp
// edge, pixel by pixel, which the coarse vertex colours never could). Drawn from island.ts / places.ts / terrain.ts, so blades never poke
// through trails, the stream, the pond, the plaza, buildings, the Dream Park grid, steep cliffs or
// the beach. Nothing is baked up front: the mask is worked out in tiles of MASK_TILE pixels the
// first time something looks inside one (the grass only ever needs the window round the kid —
// see terrainWindow.ts). Pure (typed arrays only) — safe in Node and unit tested.
import { ISLAND_R, LAND_SQUARES, POND, STREAM_POINTS, STREAM_WIDTH, TRAIL_POINTS, TRAIL_WIDTH, seaDist } from "../../registry/island";
import { LANDS, PLACES } from "../../registry/places";
import { TERRAIN_CELL, TERRAIN_NX, TERRAIN_NZ, TERRAIN_X0, TERRAIN_Z0, terrainSample } from "../../registry/terrain";
import { zoneBounds } from "../../builder/rules";
import { smoothstep } from "./noise";
import { RAIL_POINTS, STATIONS } from "../../registry/railway";
import { WILD_WATER_BOUNDS, inWildWater, wildWaterSdf } from "../../registry/wildWater";
import { SETTLEMENTS } from "../../registry/settlements";
import { CART_ROAD } from "../../registry/cartRoad";
import { FOOTPATHS } from "../../registry/footpaths";
import { kartTrackWorld } from "../../registry/kartTrack";
import { TRACK_WIDTH } from "../../karts/track";
import { canyonDesertK, CANYON_FOOTPATH } from "../../registry/grandCanyon";
import { paricutinFootprintWeight } from "../../registry/paricutin";
import { ROAD_SEGMENTS, ROAD_HALF, TUNNELS, CAR_PARKS, ROAD_JUNCTIONS, ROUNDABOUT_INNER, ROUNDABOUT_OUTER } from "../../registry/roads";

/** The mask's pixel grid: pixel (i, j) covers x from -MASK_HALF + i * px (and z likewise) — for
 *  any i, j (the mask reaches over the whole island, tile by tile). Its resolution `n` is the
 *  number of pixels across the park's own square (2 * MASK_HALF): 1024 standard, 512 low. */
export const MASK_N = 1024;
export const MASK_HALF = ISLAND_R + 13;
/** pixels per mask tile side */
export const MASK_TILE = 64;

/** slope (0 flat .. 1 cliff) at terrain grid sample (i, j), same scale as terrain.ts slopeAt() */
function slopeSample(i: number, j: number): number {
  const l = terrainSample(Math.max(0, i - 1), j);
  const r = terrainSample(Math.min(TERRAIN_NX - 1, i + 1), j);
  const d = terrainSample(i, Math.max(0, j - 1));
  const u = terrainSample(i, Math.min(TERRAIN_NZ - 1, j + 1));
  return Math.min(1, Math.hypot(r - l, u - d) / (2 * TERRAIN_CELL) / 1.4);
}

/** grass amount a pixel at world (x, z) gets from the terrain alone (cliffs, peaks, beach) */
export function terrainGrassFactor(x: number, z: number, h: number, slope: number): number {
  let v = smoothstep(-2.5, -8, seaDist(x, z)); // sand at the shore
  v *= 1 - smoothstep(0.34, 0.56, slope); // rock shows on steep ground
  v *= 1 - smoothstep(30, 44, h); // thin out towards the peaks
  v *= 1 - canyonDesertK(x, z); // the Grand Canyon's own footprint: dry desert, no grass at all
  v *= 1 - paricutinFootprintWeight(x, z); // Parícutin's own footprint: bare cinder/lava, no grass
  return v;
}

export interface GrassMask {
  /** the resolution this mask is read at (pixel size = 2 * half / n) */
  n: number;
  half: number;
  /** RGBA8, row-major, rows = z (from -half), cols = x (from -half) — only on a bake of the
   *  park's square (bakeGrassMask); a lazy mask (grassMask) reads its tiles anywhere instead */
  data?: Uint8Array;
}

// ── the carving: soft-edged discs (inside r0 no grass, fading back to full by r1) ──
interface Disc {
  x: number;
  z: number;
  r0: number;
  r1: number;
  /** carves the lawn factor (down to `floor`) instead of the grass amount */
  lawn: boolean;
  floor: number;
}
/** the park's paving: trails as straight pieces [ax, az, bx, bz, half width], and discs [x, z, r] */
let pavingList: { segs: number[][]; discs: number[][] } | null = null;
function paving() {
  if (pavingList) return pavingList;
  const segs: number[][] = [];
  const discs: number[][] = [];
  const half = TRAIL_WIDTH / 2;
  for (const pts of TRAIL_POINTS) for (let i = 0; i + 1 < pts.length; i++) segs.push([pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], half]);
  discs.push([0, 0, 9.8]); // the plaza
  for (const sq of LAND_SQUARES) discs.push([sq.x, sq.z, sq.r]);
  // (the pad a building stands on, a step wider than the building all round)
  for (const p of PLACES) if (p.radius > 0 && !p.sky && Math.hypot(p.x, p.z) < ISLAND_R + 20) discs.push([p.x, p.z, p.radius + 1.5]);
  return (pavingList = { segs, discs });
}
let discList: Disc[] | null = null;
function discs(): Disc[] {
  if (discList) return discList;
  const out: Disc[] = [];
  const carve = (x: number, z: number, r0: number, r1: number, lawn = false, floor = 0) => out.push({ x, z, r0, r1, lawn, floor });
  const tr = TRAIL_WIDTH / 2;
  for (const pts of TRAIL_POINTS) for (const [x, z] of pts) carve(x, z, tr + 0.35, tr + 1.7);
  const sr = STREAM_WIDTH / 2 + 1.1; // water + sandy bank
  for (const [x, z] of STREAM_POINTS) carve(x, z, sr, sr + 1.3);
  carve(POND.x, POND.z, POND.r + 1.4, POND.r + 2.8);
  carve(0, 0, 9.6, 11.5); // the plaza
  // the Wildlands Railway's ballast and its platforms
  for (let i = 0; i < RAIL_POINTS.length; i++) carve(RAIL_POINTS[i][0], RAIL_POINTS[i][1], 1.9, 3.2);
  for (const st of STATIONS) carve(st.x, st.z, 7, 10);
  for (const p of PLACES) {
    const r = Math.max(p.radius, 1.5);
    carve(p.x, p.z, r + 0.8, r + 2.4);
  }
  // Wildlands settlements: packed earth under the fire plaza, a worn dooryard at every hut, and a
  // trodden path along every stretch between them (registry/settlements.ts) — the very same
  // trail-coloured DIRT a real path gets (terrainMesh.ts groundColor)
  for (const st of SETTLEMENTS) {
    carve(st.x, st.z, 7, 14);
    // Sunnybrook's cobbled square + streets: a continuous town floor the whole way out (not just
    // narrow treads between huts), so paving reads solid, not a dirt/grass patchwork — the actual
    // cobble TINT is terrainMesh.ts's groundColor() (it checks settlementAt().style === "town");
    // this just clears the grass over the same footprint
    // (the built-up square + streets reach about 3/4 of the town's own radius — the rest, further
    // out, is fields on purpose; see registry/town.ts's `fieldInner`)
    if (st.style === "town") carve(st.x, st.z, st.radius * 0.76, st.radius * 0.8);
    for (const hut of st.huts) carve(hut.x, hut.z, hut.size + 0.6, hut.size + 3.2);
    for (const w of st.work) carve(w.x, w.z, 2.2, 5);
    for (const [a, b] of st.edges) {
      const na = st.nodes[a];
      const nb = st.nodes[b];
      const d = Math.hypot(nb.x - na.x, nb.z - na.z);
      const steps = Math.max(1, Math.round(d / 2.6));
      for (let k = 0; k <= steps; k++) carve(na.x + ((nb.x - na.x) * k) / steps, na.z + ((nb.z - na.z) * k) / steps, 0.9, 2.4);
    }
  }
  // the Lakeside <-> Market Street cart road (registry/cartRoad.ts): the same trail-coloured dirt a
  // park trail gets, just a touch narrower (a cart, not a crowd, wears this one in)
  for (const [x, z] of CART_ROAD.points) carve(x, z, 1.6, 3.4);
  // every other settlement's own footpath to its station — a kid's and a trader's own worn dirt walk
  for (const fp of FOOTPATHS) for (const [x, z] of fp.points) carve(x, z, 1.1, 2.6);
  // the Grand Canyon's own footpath in from Park Station (registry/grandCanyon.ts)
  for (const [x, z] of CANYON_FOOTPATH) carve(x, z, 1.1, 2.6);
  // the go-kart circuit's asphalt and kerbs (registry/kartTrack.ts): no grass or flowers on the road
  for (const pt of kartTrackWorld().points) carve(pt.x, pt.z, TRACK_WIDTH / 2 + 1.2, TRACK_WIDTH / 2 + 2.6);
  // the island's road network (Agent R): asphalt + kerb, no grass on the bed, soft verge beyond it.
  // round 4: a road's RAW points (not the trimmed ribbon — world/roads/index.ts's buildSection cuts
  // the ribbon back from a roundabout, but this dirt mask used every raw point regardless) can sit
  // close to a junction's own ring without the ribbon actually being drawn there (a road's stub out
  // to a roundabout, then its own pre-existing route briefly curving back near the new hub before
  // straightening away — measured on ring-h2-h3, 20.7 m out at one point, just inside the ring's own
  // 22 m) — that near point's dirt halo (up to ROAD_HALF+2.6 wide) then bled OUT past the ring's
  // edge into open grass, a real "earth" patch right by the roundabout with no road ribbon anywhere
  // near it to explain the dirt. Skip carving any road point sitting inside a ring's own footprint —
  // the ring draws its own green island there (and its own paved surface on top either way).
  const nearRoundabout = (x: number, z: number) => ROAD_JUNCTIONS.some((j) => Math.hypot(x - j.x, z - j.z) < ROUNDABOUT_OUTER + 2);
  for (const seg of ROAD_SEGMENTS) for (const p of seg.points) if (!nearRoundabout(p.x, p.z)) carve(p.x, p.z, ROAD_HALF + 0.4, ROAD_HALF + 2.6);
  for (const t of TUNNELS) {
    const n = Math.max(4, Math.round(Math.hypot(t.x1 - t.x0, t.z1 - t.z0) / 8));
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      carve(t.x0 + (t.x1 - t.x0) * u, t.z0 + (t.z1 - t.z0) * u, t.half + 0.4, t.half + 2.6);
    }
  }
  // (a car park is a rectangle longer than its `r`: three discs along it clear its ends too)
  for (const cp of CAR_PARKS) for (const k of [-0.6, 0, 0.6]) carve(cp.x + Math.sin(cp.heading) * cp.r * k, cp.z + Math.cos(cp.heading) * cp.r * k, cp.r * 0.95, cp.r * 0.95 + 3);
  // a roundabout's ring of asphalt: no flowers on it (its middle stays a green island)
  for (const j of ROAD_JUNCTIONS)
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      const rr = (ROUNDABOUT_OUTER + ROUNDABOUT_INNER) / 2;
      carve(j.x + Math.sin(a) * rr, j.z + Math.cos(a) * rr, (ROUNDABOUT_OUTER - ROUNDABOUT_INNER) / 2 + 0.8, (ROUNDABOUT_OUTER - ROUNDABOUT_INNER) / 2 + 2.4);
    }
  // lands: tidy, shorter lawns (not bare)
  for (const l of LANDS) {
    if (l.id === "forest") continue;
    carve(l.x, l.z, l.radius - 2, l.radius + 3, true, 0.45);
  }
  discList = out;
  return out;
}

/** each resolution's tiles and its discs bucketed by tile */
interface MaskRes {
  n: number;
  px: number;
  buckets: Map<number, Disc[]>;
  tiles: Map<number, Uint8Array>;
}
const RES = new Map<number, MaskRes>();
/** at most this many tiles are kept per resolution (the oldest go first; a re-bake is identical) */
const KEEP_TILES = 1024;
const tkey = (ti: number, tj: number) => (tj + 4096) * 8192 + (ti + 4096);

function res(n: number): MaskRes {
  let r = RES.get(n);
  if (r) return r;
  const px = (MASK_HALF * 2) / n;
  const tw = MASK_TILE * px;
  const buckets = new Map<number, Disc[]>();
  for (const d of discs()) {
    const ti0 = Math.floor((d.x - d.r1 + MASK_HALF) / tw);
    const ti1 = Math.floor((d.x + d.r1 + MASK_HALF) / tw);
    const tj0 = Math.floor((d.z - d.r1 + MASK_HALF) / tw);
    const tj1 = Math.floor((d.z + d.r1 + MASK_HALF) / tw);
    for (let tj = tj0; tj <= tj1; tj++)
      for (let ti = ti0; ti <= ti1; ti++) {
        const k = tkey(ti, tj);
        let b = buckets.get(k);
        if (!b) buckets.set(k, (b = []));
        b.push(d);
      }
  }
  r = { n, px, buckets, tiles: new Map() };
  RES.set(n, r);
  return r;
}

/** bake tile (ti, tj) of the mask at resolution n: MASK_TILE x MASK_TILE RGBA8 pixels, whose
 *  pixel (i, j) is the mask's pixel (ti * MASK_TILE + i, tj * MASK_TILE + j) */
function bakeTile(R: MaskRes, ti: number, tj: number): Uint8Array {
  const T = MASK_TILE;
  const half = MASK_HALF;
  const px = R.px;
  const amount = new Float32Array(T * T);
  const lawn = new Float32Array(T * T).fill(1);
  const I0 = ti * T;
  const J0 = tj * T;
  const wx = (I: number) => -half + (I + 0.5) * px;

  // start from the terrain: grass everywhere on the island except beach, cliffs, peaks
  // (the heights and slopes under this tile are read once into a little patch of the grid)
  const gi = (x: number) => Math.min(TERRAIN_NX - 1.001, Math.max(0, (x - TERRAIN_X0) / TERRAIN_CELL));
  const gj = (z: number) => Math.min(TERRAIN_NZ - 1.001, Math.max(0, (z - TERRAIN_Z0) / TERRAIN_CELL));
  const gi0 = Math.floor(gi(wx(I0)));
  const gj0 = Math.floor(gj(wx(J0)));
  const PW = Math.floor(gi(wx(I0 + T - 1))) - gi0 + 2;
  const PH = Math.floor(gj(wx(J0 + T - 1))) - gj0 + 2;
  const ph = new Float32Array(PW * PH);
  const ps = new Float32Array(PW * PH);
  for (let j = 0; j < PH; j++)
    for (let i = 0; i < PW; i++) {
      ph[j * PW + i] = terrainSample(gi0 + i, gj0 + j);
      ps[j * PW + i] = slopeSample(gi0 + i, gj0 + j);
    }
  for (let j = 0; j < T; j++) {
    const z = wx(J0 + j);
    const fz = gj(z);
    const pj = Math.floor(fz);
    const v = fz - pj;
    for (let i = 0; i < T; i++) {
      const x = wx(I0 + i);
      if (seaDist(x, z) > 10) continue;
      const fx = gi(x);
      const pi = Math.floor(fx);
      const u = fx - pi;
      const k = (pj - gj0) * PW + (pi - gi0);
      const h = (ph[k] * (1 - u) + ph[k + 1] * u) * (1 - v) + (ph[k + PW] * (1 - u) + ph[k + PW + 1] * u) * v;
      const s = (ps[k] * (1 - u) + ps[k + 1] * u) * (1 - v) + (ps[k + PW] * (1 - u) + ps[k + PW + 1] * u) * v;
      amount[j * T + i] = terrainGrassFactor(x, z, h, s);
    }
  }

  for (const d of R.buckets.get(tkey(ti, tj)) ?? []) {
    const into = d.lawn ? lawn : amount;
    const i0 = Math.max(I0, Math.floor((d.x - d.r1 + half) / px));
    const i1 = Math.min(I0 + T - 1, Math.ceil((d.x + d.r1 + half) / px));
    const j0 = Math.max(J0, Math.floor((d.z - d.r1 + half) / px));
    const j1 = Math.min(J0 + T - 1, Math.ceil((d.z + d.r1 + half) / px));
    for (let J = j0; J <= j1; J++) {
      const dz = wx(J) - d.z;
      for (let I = i0; I <= i1; I++) {
        const dx = wx(I) - d.x;
        const dd = Math.sqrt(dx * dx + dz * dz);
        if (dd >= d.r1) continue;
        const v = d.floor + (1 - d.floor) * smoothstep(d.r0, d.r1, dd);
        const k = (J - J0) * T + (I - I0);
        if (v < into[k]) into[k] = v;
      }
    }
  }

  // the Wildlands' great river, pool and lake: water and wet banks, no grass
  if (I0 * px - half < WILD_WATER_BOUNDS.x1 && (I0 + T) * px - half > WILD_WATER_BOUNDS.x0 && J0 * px - half < WILD_WATER_BOUNDS.z1 && (J0 + T) * px - half > WILD_WATER_BOUNDS.z0)
    for (let j = 0; j < T; j++) {
      const z = wx(J0 + j);
      for (let i = 0; i < T; i++) {
        const x = wx(I0 + i);
        if (!inWildWater(x, z)) continue;
        const v = smoothstep(0.8, 3.4, wildWaterSdf(x, z));
        const k = j * T + i;
        if (v < amount[k]) amount[k] = v;
      }
    }

  // the Dream Park build grid stays completely clear
  const zb = zoneBounds();
  for (let j = 0; j < T; j++) {
    const z = wx(J0 + j);
    if (z < zb.minZ - 3 || z > zb.maxZ + 3) continue;
    for (let i = 0; i < T; i++) {
      const x = wx(I0 + i);
      if (x < zb.minX - 3 || x > zb.maxX + 3) continue;
      const dx = Math.max(zb.minX - x, 0, x - zb.maxX);
      const dz = Math.max(zb.minZ - z, 0, z - zb.maxZ);
      const v = smoothstep(0.6, 3, Math.hypot(dx, dz));
      const k = j * T + i;
      if (v < amount[k]) amount[k] = v;
    }
  }

  // the paving: every pixel's distance to the nearest paved trail (a run of straight pieces), or
  // into the nearest paved disc
  const pave = new Float32Array(T * T);
  {
    const P = paving();
    const x0 = wx(I0) - 3;
    const x1 = wx(I0 + T - 1) + 3;
    const z0 = wx(J0) - 3;
    const z1 = wx(J0 + T - 1) + 3;
    const segs = P.segs.filter((s) => Math.max(s[0], s[2]) > x0 && Math.min(s[0], s[2]) < x1 && Math.max(s[1], s[3]) > z0 && Math.min(s[1], s[3]) < z1);
    const pads = P.discs.filter((d) => d[0] + d[2] > x0 && d[0] - d[2] < x1 && d[1] + d[2] > z0 && d[1] - d[2] < z1);
    if (segs.length || pads.length)
      for (let j = 0; j < T; j++) {
        const z = wx(J0 + j);
        for (let i = 0; i < T; i++) {
          const x = wx(I0 + i);
          let v = 0;
          for (const s of segs) {
            const ex = s[2] - s[0];
            const ez = s[3] - s[1];
            const u = Math.max(0, Math.min(1, ((x - s[0]) * ex + (z - s[1]) * ez) / (ex * ex + ez * ez || 1)));
            const d = Math.hypot(x - s[0] - ex * u, z - s[1] - ez * u);
            if (d < s[4] + 0.4) v = Math.max(v, 1 - smoothstep(s[4] - 0.3, s[4] + 0.3, d));
          }
          for (const d of pads) {
            const dd = Math.hypot(x - d[0], z - d[1]);
            if (dd < d[2] + 0.4) v = Math.max(v, 1 - smoothstep(d[2] - 0.3, d[2] + 0.3, dd));
          }
          pave[j * T + i] = v;
        }
      }
  }

  const data = new Uint8Array(T * T * 4);
  for (let k = 0; k < T * T; k++) {
    data[k * 4] = Math.round(Math.min(1, Math.max(0, amount[k])) * 255);
    data[k * 4 + 1] = Math.round(lawn[k] * 255);
    data[k * 4 + 2] = Math.round(pave[k] * 255);
    data[k * 4 + 3] = 255;
  }
  return data;
}

/** tile (ti, tj) of the mask at resolution n (baked the first time it's asked for) */
export function maskTile(n: number, ti: number, tj: number): Uint8Array {
  const R = res(n);
  const k = tkey(ti, tj);
  let t = R.tiles.get(k);
  if (!t) {
    t = bakeTile(R, ti, tj);
    if (R.tiles.size >= KEEP_TILES) R.tiles.delete(R.tiles.keys().next().value as number);
    R.tiles.set(k, t);
  }
  return t;
}

/** the mask's pixel size (world units) at resolution n */
export const maskPx = (n: number) => (MASK_HALF * 2) / n;

/** A lazy mask at resolution n: maskAt() reads its tiles as needed. */
export function grassMask(n = MASK_N): GrassMask {
  return { n, half: MASK_HALF };
}

/** Bake the whole mask at once (tests and tools — the park reads it lazily). Deterministic. */
export function bakeGrassMask(n = MASK_N): GrassMask {
  const T = MASK_TILE;
  const data = new Uint8Array(n * n * 4);
  const nt = Math.ceil(n / T);
  for (let tj = 0; tj < nt; tj++)
    for (let ti = 0; ti < nt; ti++) {
      const t = maskTile(n, ti, tj);
      for (let j = 0; j < T && tj * T + j < n; j++) {
        const row = (tj * T + j) * n + ti * T;
        const w = Math.min(T, n - ti * T);
        data.set(t.subarray(j * T * 4, (j * T + w) * 4), row * 4);
      }
    }
  return { n, half: MASK_HALF, data };
}

/** Read the mask's grass amount (0..1) at world (x, z) — nearest pixel (tests, CPU checks). */
export function maskAt(mask: GrassMask, x: number, z: number): number {
  const px = (mask.half * 2) / mask.n;
  const i = Math.floor((x + mask.half) / px);
  const j = Math.floor((z + mask.half) / px);
  if (mask.data) return i < 0 || j < 0 || i >= mask.n || j >= mask.n ? 0 : mask.data[(j * mask.n + i) * 4] / 255;
  const T = MASK_TILE;
  const ti = Math.floor(i / T);
  const tj = Math.floor(j / T);
  return maskTile(mask.n, ti, tj)[((j - tj * T) * T + (i - ti * T)) * 4] / 255;
}
