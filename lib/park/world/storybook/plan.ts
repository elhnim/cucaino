// Where the storybook diorama's things go — pure maths, deterministic, no three.js (tested).
//
//   - a coarse 2 m grid over the island holding "how far to the nearest trail" and "how far to the
//     nearest land / place / plaza / Dream Park" (a chamfer distance transform), so the forest can
//     leave natural meadow clearings round everything people walk to
//   - the dense forest: noise-shaped forest masses on a jittered grid, thickest along the stream
//     and the coast, pines clustered on the slopes and the mountains, lone trees in the meadows
//   - the pasture grid (open, level, free ground — not under the forest) for sheep and windmills
//   - flocks of sheep that graze and wander slowly as a flock, never leaving the pasture
//   - windmills on open hilltops, hot-air balloon loops, drifting clouds, the horizon's ridges
import { LANDS, PLACES, placeFootprint } from "../../registry/places";
import { ISLAND_R, STREAM_POINTS, TRAIL_POINTS, seaDist } from "../../registry/island";
import { groundY, slopeAt } from "../../registry/terrain";
import { lakeEdgeDist, waterSdf } from "../../registry/waterways";
import { trailDistance } from "../../registry/jungle";
import { zoneBounds } from "../../builder/rules";
import { fbm2, noise2, rngOf, smoothstep, type Rng } from "../fantasy/noise";

export type FreeFn = (x: number, z: number, pad: number) => boolean;
export type { Rng };
export { rngOf };

const TAU = Math.PI * 2;
const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);

// ── the island grid ──

/** a square grid of cells over [-HALF, HALF] (x and z), row-major (z rows, x columns) */
export const CELL = 2;
export const HALF = 160;
export const GN = Math.round((HALF * 2) / CELL);

export const cellOf = (v: number) => Math.floor((v + HALF) / CELL);
export const cellCentre = (i: number) => -HALF + (i + 0.5) * CELL;
/** grid index of (x, z), or -1 off the grid */
export function gridIndex(x: number, z: number): number {
  const i = cellOf(x);
  const j = cellOf(z);
  return i < 0 || j < 0 || i >= GN || j >= GN ? -1 : j * GN + i;
}

/** two-pass chamfer distance transform (metres) from the cells where `seed` is 0 */
function chamfer(d: Float32Array) {
  const a = CELL;
  const b = CELL * Math.SQRT2;
  const N = GN;
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const k = j * N + i;
      let v = d[k];
      if (i > 0) v = Math.min(v, d[k - 1] + a);
      if (j > 0) {
        v = Math.min(v, d[k - N] + a);
        if (i > 0) v = Math.min(v, d[k - N - 1] + b);
        if (i < N - 1) v = Math.min(v, d[k - N + 1] + b);
      }
      d[k] = v;
    }
  for (let j = N - 1; j >= 0; j--)
    for (let i = N - 1; i >= 0; i--) {
      const k = j * N + i;
      let v = d[k];
      if (i < N - 1) v = Math.min(v, d[k + 1] + a);
      if (j < N - 1) {
        v = Math.min(v, d[k + N] + a);
        if (i < N - 1) v = Math.min(v, d[k + N + 1] + b);
        if (i > 0) v = Math.min(v, d[k + N - 1] + b);
      }
      d[k] = v;
    }
}

export interface OpenFields {
  /** metres to the nearest trail centre line */
  trail: Float32Array;
  /** metres to the nearest land / place / plaza / Dream Park edge (0 inside) */
  land: Float32Array;
  /** metres to the water (the river, the plunge pool, the lake, the outlet) */
  stream: Float32Array;
}

let fieldsCache: OpenFields | null = null;

/** distance fields to the things people walk to (computed once; the registries are static) */
export function openFields(): OpenFields {
  if (fieldsCache) return fieldsCache;
  const BIG = 1e6;
  const trail = new Float32Array(GN * GN).fill(BIG);
  const land = new Float32Array(GN * GN).fill(BIG);
  const stream = new Float32Array(GN * GN).fill(BIG);
  for (const pts of TRAIL_POINTS)
    for (const [x, z] of pts) {
      const k = gridIndex(x, z);
      if (k >= 0) trail[k] = 0;
    }
  for (const [x, z] of STREAM_POINTS) {
    const k = gridIndex(x, z);
    if (k >= 0) stream[k] = 0;
  }
  const zb = zoneBounds();
  for (let j = 0; j < GN; j++)
    for (let i = 0; i < GN; i++) {
      const x = cellCentre(i);
      const z = cellCentre(j);
      const k = j * GN + i;
      if (waterSdf(x, z) < 0) stream[k] = 0; // the river, the plunge pool, the lake, the outlet
      if (Math.hypot(x, z) < 14) land[k] = 0; // the plaza
      else if (x > zb.minX && x < zb.maxX && z > zb.minZ && z < zb.maxZ) land[k] = 0;
      else if (LANDS.some((l) => Math.hypot(x - l.x, z - l.z) < l.radius)) land[k] = 0;
      else if (PLACES.some((p) => Math.hypot(x - placeFootprint(p).x, z - placeFootprint(p).z) < Math.max(p.radius, 1.5) + 1.5)) land[k] = 0;
    }
  chamfer(trail);
  chamfer(land);
  chamfer(stream);
  fieldsCache = { trail, land, stream };
  return fieldsCache;
}

/** bilinear-free lookup of a grid field at (x, z) (off the grid = far away) */
export function fieldAt(f: Float32Array, x: number, z: number): number {
  const k = gridIndex(x, z);
  return k < 0 ? 1e6 : f[k];
}

// ── the dense forest ──

/** tree kinds: three round deciduous shapes and two pines (one geometry each) */
export const KIND_ROUND = 0;
export const KIND_LUMPY = 1;
export const KIND_TALL = 2;
export const KIND_PINE = 3;
export const KIND_SPIRE = 4;
export const TREE_KINDS = 5;
export const isPine = (k: number) => k >= KIND_PINE;

/** canopy colours (sRGB): leafy greens, yellow-greens, and a few autumn yellows / oranges */
export const LEAF_GREENS = ["#4f9a3c", "#5dab42", "#3f8a3a", "#6cb845", "#58a04a", "#468f45", "#7cc04a", "#8fc94a"];
export const LEAF_YELLOWS = ["#d8c23a", "#e6a93a"];
export const PINE_GREENS = ["#3b7d4c", "#488c50", "#377459", "#539653"];

export interface ForestTree {
  x: number;
  z: number;
  y: number;
  kind: number;
  /** overall scale (1 = a ~5.5 m deciduous tree / ~7 m pine) */
  s: number;
  /** extra height stretch */
  sy: number;
  rot: number;
  /** index into LEAF_GREENS (0..7), LEAF_YELLOWS (100+), or PINE_GREENS (200+) */
  hue: number;
}

export interface ForestPlan {
  trees: ForestTree[];
  /** grid cells (1) under a canopy — the sheep keep out of the woods */
  covered: Uint8Array;
  /** candidate trees before the triangle cap thinned them (for tests / stats) */
  candidates: number;
}

export interface ForestOptions {
  lowQuality?: boolean;
  seed?: number;
  /** cap on deciduous / pine counts (triangle budget) */
  maxLeafy?: number;
  maxPines?: number;
}

/** 0..1: how much this spot wants to be forest (before clearings) */
export function forestMass(x: number, z: number): number {
  const f = openFields();
  const m = fbm2(x / 52 + 3.1, z / 52 - 5.3, 3, 11);
  const sd = seaDist(x, z);
  // forest edges hug the stream and the coast; the hills and mountains are wooded
  const nearStream = 1 - smoothstep(3, 14, fieldAt(f.stream, x, z));
  const nearCoast = smoothstep(-34, -12, sd) * (1 - smoothstep(-7, -3, sd));
  const high = smoothstep(4, 14, groundY(x, z));
  return m + nearStream * 0.17 + nearCoast * 0.12 + high * 0.1;
}

/** 0..1: how open (meadow) a spot should be because of the trails and lands near it */
export function clearing(x: number, z: number): number {
  const f = openFields();
  // verges of varying width along every trail, meadows round the lands and places
  const v0 = 1.2 + 5.5 * noise2(x / 21 + 7, z / 21 - 2, 31);
  const l0 = 2.5 + 8 * noise2(x / 27 - 4, z / 27 + 9, 32);
  const byTrail = smoothstep(v0, v0 + 3, fieldAt(f.trail, x, z));
  const byLand = smoothstep(l0, l0 + 5, fieldAt(f.land, x, z));
  // keep the view from the park's start point (the gate, looking in) open
  const start = smoothstep(12, 20, Math.hypot(x, z - 30));
  // Rainbow Lake's shores stay open meadow (the herds come down to drink, the giants included)
  const byLake = smoothstep(5, 14, lakeEdgeDist(x, z) + (noise2(x / 9, z / 9, 34) - 0.5) * 6);
  return byTrail * byLand * start * byLake;
}

// ── meadows: open clearings kept for the sheep and the windmills ──

export interface Meadow {
  x: number;
  z: number;
  r: number;
}

/** pick level, open spots away from the lands for meadow clearings (the forest keeps out) */
export function planMeadows(free: FreeFn, opts: { count: number; seed?: number }): Meadow[] {
  const r = rngOf(opts.seed ?? 3131);
  const f = openFields();
  const out: Meadow[] = [];
  for (let tries = 0; tries < 4000 && out.length < opts.count; tries++) {
    const a = r() * TAU;
    const d = 24 + Math.sqrt(r()) * (ISLAND_R - 40);
    const x = Math.sin(a) * d;
    const z = Math.cos(a) * d;
    const rad = 11 + r() * 7;
    if (fieldAt(f.land, x, z) < rad * 0.5 + 4) continue;
    if (groundY(x, z) > 16) continue;
    let rough = slopeAt(x, z);
    for (let k = 0; k < 6; k++) rough = Math.max(rough, slopeAt(x + Math.sin((k / 6) * TAU) * rad * 0.6, z + Math.cos((k / 6) * TAU) * rad * 0.6));
    if (rough > 0.3) continue;
    if (!free(x, z, 5)) continue;
    if (out.some((m) => Math.hypot(m.x - x, m.z - z) < m.r + rad + 22)) continue;
    out.push({ x, z, r: rad });
  }
  return out;
}

/** 0..1 how far outside every meadow (0 inside one), with a ragged edge */
export function outsideMeadows(meadows: Meadow[], x: number, z: number): number {
  let k = 1;
  for (const m of meadows) {
    const d = Math.hypot(x - m.x, z - m.z);
    if (d < m.r + 10) k = Math.min(k, smoothstep(m.r, m.r + 7, d + (noise2(x / 6, z / 6, 33) - 0.5) * 5));
  }
  return k;
}

/** canopy radius of a tree (m) */
export const canopyR = (kind: number, s: number) => (isPine(kind) ? 1.65 : 1.95) * s;

/**
 * The trails are open-sky lanes through the woods: no crown hangs within this of a trail's centre
 * line, so a giraffe or an elephant walking a wooded trail keeps its head out of the leaves, and
 * the safari's herds can travel the trails from meadow to meadow.
 */
export const TRAIL_LANE = 2.8;

/**
 * Plan the dense forest: candidates on a fine jittered grid, each wanting to be forest by the
 * forest mass, the clearings and the meadows; they are planted strongest-first (the cores of the
 * forest masses fill before their fringes, so the triangle cap trims edges rather than punching
 * holes), spaced by canopy size (a Poisson fill: packed, barely overlapping crowns), and `free`
 * has the final say.
 */
export function planForest(free: FreeFn, opts: ForestOptions & { meadows?: Meadow[] } = {}): ForestPlan {
  const low = !!opts.lowQuality;
  const r = rngOf(opts.seed ?? 20260930);
  const meadows = opts.meadows ?? [];
  const step = 1.7;
  const n = Math.ceil((ISLAND_R * 2 + 8) / step);
  const x0 = -ISLAND_R - 4;
  type Cand = { x: number; z: number; gy: number; slope: number; want: number; core: number; roll: number };
  const cands: Cand[] = [];
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const x = x0 + (i + 0.1 + r() * 0.8) * step;
      const z = x0 + (j + 0.1 + r() * 0.8) * step;
      const roll = r();
      if (seaDist(x, z) > -4) continue;
      // (inland ground can sit at or below sea level: the sea only starts past the beach)
      const gy = groundY(x, z);
      const slope = slopeAt(x, z);
      if (slope > 0.86) continue; // bare cliffs
      const massRaw = forestMass(x, z);
      const mass = smoothstep(0.35, 0.44, massRaw);
      const open = clearing(x, z) * outsideMeadows(meadows, x, z);
      let want = mass * open;
      // lone trees and little copses dotted about the meadows
      if (want < 0.2 && open > 0.6 && noise2(x / 9, z / 9, 41) > 0.74) want = 0.3;
      if (want < 0.05) continue;
      // deep in the woods (far from any edge) the trees grow big
      const core = smoothstep(0.47, 0.62, massRaw) * smoothstep(0.7, 1, open);
      cands.push({ x, z, gy, slope, want, core, roll });
    }
  // strongest first (with a little shuffle so the fill isn't grid-ordered)
  const key = (c: Cand) => c.want * 0.75 + c.roll * 0.25 + c.core * 0.15;
  cands.sort((a, b) => key(b) - key(a));
  const maxLeafy = opts.maxLeafy ?? (low ? 1350 : 2500);
  const maxPines = opts.maxPines ?? (low ? 650 : 1250);
  let leafyN = 0;
  let pineN = 0;
  const trees: ForestTree[] = [];
  // spatial hash of planted trees (4 m cells)
  const HC = 4;
  const HN = Math.ceil((ISLAND_R * 2 + 16) / HC);
  const buckets: number[][] = Array.from({ length: HN * HN }, () => []);
  const hb = (v: number) => Math.max(0, Math.min(HN - 1, Math.floor((v + ISLAND_R + 8) / HC)));
  let considered = 0;
  for (const c of cands) {
    if (leafyN >= maxLeafy && pineN >= maxPines) break;
    if (c.roll > c.want + 0.35) continue; // thin fringes stay broken, not a hard wall
    const { x, z, gy, slope } = c;
    considered++;
    // pines: clustered by noise, on slopes and up high, mostly on the northern mountains
    const pineNz = noise2(x / 19 + 2, z / 19 + 8, 43);
    const pineP = clamp(smoothstep(0.58, 0.72, pineNz) * 0.85 + smoothstep(6, 18, gy) * 0.75 + smoothstep(0.28, 0.6, slope) * 0.6, 0, 0.96);
    let pine = noise2(x * 0.9, z * 0.9, 46) < pineP;
    if (pine && pineN >= maxPines) pine = false;
    if (!pine && leafyN >= maxLeafy) continue;
    const sizeN = noise2(x / 14 - 3, z / 14 + 1, 44);
    const s = (0.7 + c.core * 0.6 + sizeN * 0.3 + (noise2(x * 1.3, z * 1.3, 47) - 0.5) * 0.2) * (low ? 1.2 : 1);
    const cr = canopyR(pine ? KIND_PINE : KIND_ROUND, s);
    // (crowns stay off the trails' lanes)
    if (fieldAt(openFields().trail, x, z) < cr + TRAIL_LANE + 3 && trailDistance(x, z, cr + TRAIL_LANE + 1) < cr + TRAIL_LANE) continue;
    // spacing: crowns may overlap a little (0.66 of the sum of radii)
    const bi = hb(x);
    const bj = hb(z);
    let clash = false;
    for (let dj = -1; dj <= 1 && !clash; dj++)
      for (let di = -1; di <= 1 && !clash; di++) {
        const ii = bi + di;
        const jj = bj + dj;
        if (ii < 0 || jj < 0 || ii >= HN || jj >= HN) continue;
        for (const ti of buckets[jj * HN + ii]) {
          const t = trees[ti];
          const min = (canopyR(t.kind, t.s) + cr) * 0.66;
          if ((t.x - x) ** 2 + (t.z - z) ** 2 < min * min) {
            clash = true;
            break;
          }
        }
      }
    if (clash) continue;
    if (!free(x, z, pine ? 0.9 * s : 1.2 * s)) continue;
    let kind: number;
    let hue: number;
    if (pine) {
      kind = noise2(x * 0.7, z * 0.7, 48) < 0.4 ? KIND_SPIRE : KIND_PINE;
      hue = 200 + Math.floor(noise2(x * 0.8, z * 0.8, 49) * PINE_GREENS.length * 0.999);
      pineN++;
    } else {
      const kr = noise2(x * 1.1, z * 1.1, 50);
      kind = kr < 0.4 ? KIND_ROUND : kr < 0.72 ? KIND_LUMPY : KIND_TALL;
      // hue drifts across the forest (patches of the same green), a few autumn yellows
      const hN = noise2(x / 24 + 5, z / 24 - 6, 45);
      const yr = noise2(x * 1.7, z * 1.7, 51);
      if (yr > 0.9) hue = 100 + (yr > 0.965 ? 1 : 0);
      else hue = clamp(Math.floor(hN * 5.5 + noise2(x * 2.1, z * 2.1, 52) * 3), 0, LEAF_GREENS.length - 1);
      leafyN++;
    }
    buckets[bj * HN + bi].push(trees.length);
    trees.push({ x, z, y: gy, kind, s, sy: pine ? 0.9 + noise2(x * 3, z * 3, 53) * 0.45 : 0.88 + noise2(x * 3, z * 3, 54) * 0.26, rot: noise2(x * 5, z * 5, 55) * TAU * 3, hue });
  }
  // the ground under the canopies
  const covered = new Uint8Array(GN * GN);
  for (const t of trees) {
    const cr = canopyR(t.kind, t.s) + 0.6;
    const i0 = cellOf(t.x - cr);
    const i1 = cellOf(t.x + cr);
    const j0 = cellOf(t.z - cr);
    const j1 = cellOf(t.z + cr);
    for (let j = Math.max(0, j0); j <= Math.min(GN - 1, j1); j++)
      for (let i = Math.max(0, i0); i <= Math.min(GN - 1, i1); i++) if (Math.hypot(cellCentre(i) - t.x, cellCentre(j) - t.z) < cr) covered[j * GN + i] = 1;
  }
  return { trees, covered, candidates: considered };
}

/** round obstacles for the trunks: one per cell (the biggest tree), cells grown until ≤ `max` */
export function trunkObstacles(trees: ForestTree[], max = 1400): { x: number; z: number; r: number }[] {
  let cell = 2.6;
  for (let it = 0; it < 30; it++) {
    const best = new Map<number, ForestTree>();
    for (const t of trees) {
      const key = Math.floor((t.x + 400) / cell) * 4096 + Math.floor((t.z + 400) / cell);
      const b = best.get(key);
      if (!b || t.s > b.s) best.set(key, t);
    }
    if (best.size <= max) return [...best.values()].map((t) => ({ x: t.x, z: t.z, r: Math.min(1.2, (isPine(t.kind) ? 0.45 : 0.55) + 0.3 * t.s) }));
    cell *= 1.1;
  }
  return [];
}

// ── pasture: open, level ground outside the woods ──

export interface Pasture {
  /** 1 = sheep may stand here */
  ok: Uint8Array;
}

export function planPasture(free: FreeFn, covered: Uint8Array): Pasture {
  const f = openFields();
  const ok = new Uint8Array(GN * GN);
  for (let j = 0; j < GN; j++)
    for (let i = 0; i < GN; i++) {
      const k = j * GN + i;
      if (covered[k]) continue;
      const x = cellCentre(i);
      const z = cellCentre(j);
      const rad = Math.hypot(x, z);
      if (seaDist(x, z) > -7 || rad < 16) continue;
      if (f.land[k] < 3 || f.trail[k] < 4.5) continue; // off the trails, out of the lands
      if (slopeAt(x, z) > 0.34) continue;
      if (!free(x, z, 1)) continue;
      ok[k] = 1;
    }
  return { ok };
}

/**
 * Take ground out of the pasture (the horses' paddock and the farm corner, which the fauna plans
 * once the flocks are placed): the sheep never graze there. Call it before the first step.
 */
export function carvePasture(p: Pasture, out: (x: number, z: number) => boolean, flocks: Flock[] = []): number {
  let n = 0;
  for (let j = 0; j < GN; j++)
    for (let i = 0; i < GN; i++) {
      const k = j * GN + i;
      if (!p.ok[k]) continue;
      const x = cellCentre(i);
      const z = cellCentre(j);
      // (a sheep is a metre across: the whole cell and a little round it must be clear)
      if (out(x, z) || out(x - 1.2, z - 1.2) || out(x + 1.2, z - 1.2) || out(x - 1.2, z + 1.2) || out(x + 1.2, z + 1.2)) {
        p.ok[k] = 0;
        n++;
      }
    }
  // a flock that was grazing there moves over onto the pasture next to it (before anyone sees)
  for (const f of flocks) {
    if (pastureShare(p, f.x, f.z, f.r) > 0.85 && f.sheep.every((s) => pastureAt(p, s.x, s.z))) continue;
    let best: { x: number; z: number } | null = null;
    for (let d = 2; d < 90 && !best; d += 2)
      for (let k = 0; k < 24 && !best; k++) {
        const a = (k / 24) * TAU;
        const x = f.x + Math.sin(a) * d;
        const z = f.z + Math.cos(a) * d;
        if (pastureAt(p, x, z) && pastureShare(p, x, z, f.r + 1) > 0.85) best = { x, z };
      }
    if (!best) continue;
    const dx = best.x - f.x;
    const dz = best.z - f.z;
    f.x = best.x;
    f.z = best.z;
    for (const s of f.sheep) {
      s.x += dx;
      s.z += dz;
      if (pastureAt(p, s.x, s.z)) continue;
      s.x = f.x + s.ox * 0.3;
      s.z = f.z + s.oz * 0.3;
      if (!pastureAt(p, s.x, s.z)) {
        s.x = f.x;
        s.z = f.z;
      }
    }
  }
  return n;
}

export const pastureAt = (p: Pasture, x: number, z: number) => {
  const k = gridIndex(x, z);
  return k >= 0 && p.ok[k] === 1;
};

/** fraction of pasture within `r` metres of (x, z) */
export function pastureShare(p: Pasture, x: number, z: number, r: number): number {
  let n = 0;
  let ok = 0;
  for (let dz = -r; dz <= r; dz += CELL)
    for (let dx = -r; dx <= r; dx += CELL) {
      if (dx * dx + dz * dz > r * r) continue;
      n++;
      if (pastureAt(p, x + dx, z + dz)) ok++;
    }
  return n ? ok / n : 0;
}

// ── sheep ──

export interface Sheep {
  x: number;
  z: number;
  yaw: number;
  /** where it's wandering to, relative to the flock centre */
  ox: number;
  oz: number;
  /** seconds until it picks a new spot in the flock */
  wait: number;
  /** 0 grazing .. 1 walking (eased, drives the head and the legs) */
  walk: number;
  seed: number;
}

export interface Flock {
  x: number;
  z: number;
  heading: number;
  /** flock radius (m) */
  r: number;
  seed: number;
  sheep: Sheep[];
}

/** flocks of 6..12 sheep: in the meadow clearings first (`sites`), then any roomy pasture */
export function planFlocks(p: Pasture, opts: { count: number; seed?: number; avoid?: { x: number; z: number; r: number }[]; sites?: { x: number; z: number }[] }): Flock[] {
  const r = rngOf(opts.seed ?? 4242);
  const flocks: Flock[] = [];
  for (let tries = 0; tries < 3000 && flocks.length < opts.count; tries++) {
    const a = r() * TAU;
    const d = 20 + Math.sqrt(r()) * (ISLAND_R - 26);
    const x = Math.sin(a) * d;
    const z = Math.cos(a) * d;
    if (!pastureAt(p, x, z)) continue;
    if (pastureShare(p, x, z, 7) < 0.85) continue;
    if (flocks.some((f) => Math.hypot(f.x - x, f.z - z) < 30)) continue;
    if (opts.avoid?.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + 6)) continue;
    const n = 6 + Math.floor(r() * 7);
    const fr = 2.2 + Math.sqrt(n) * 0.9;
    const sheep: Sheep[] = [];
    for (let k = 0; k < n * 6 && sheep.length < n; k++) {
      const sa = r() * TAU;
      const sd = Math.sqrt(r()) * fr;
      const sx = x + Math.sin(sa) * sd;
      const sz = z + Math.cos(sa) * sd;
      if (!pastureAt(p, sx, sz)) continue;
      if (sheep.some((s) => Math.hypot(s.x - sx, s.z - sz) < 1.3)) continue;
      sheep.push({ x: sx, z: sz, yaw: r() * TAU, ox: sx - x, oz: sz - z, wait: r() * 6, walk: 0, seed: r() * 1000 });
    }
    if (sheep.length < 4) continue;
    flocks.push({ x, z, heading: r() * TAU, r: fr, seed: r() * 1000, sheep });
  }
  return flocks;
}

const SIDESTEP = [0, 0.7, -0.7, 1.4, -1.4];
const wig = (t: number, seed: number, ch: number) => noise2(t, seed + ch * 57.3, 50 + ch) * 2 - 1;

/**
 * One step of a grazing flock: the centre ambles slowly (turning back when the pasture ends
 * ahead), each sheep grazes, then now and then trots to a new spot near the centre. Nobody ever
 * steps off the pasture. Allocation-free.
 */
export function stepFlock(f: Flock, p: Pasture, dt: number, t: number): void {
  // the flock drifts at ~0.12 m/s, heading wandering with noise
  f.heading += wig(t * 0.05, f.seed, 0) * 0.35 * dt;
  const sp = 0.06 + 0.08 * (wig(t * 0.03, f.seed, 1) * 0.5 + 0.5);
  const look = f.r + 3;
  const ax = f.x + Math.sin(f.heading) * look;
  const az = f.z + Math.cos(f.heading) * look;
  // the flock waits for its stragglers: if the sheep lag behind, the centre drifts back to them
  let mx = 0;
  let mz = 0;
  let far = 0;
  for (const s of f.sheep) {
    mx += s.x;
    mz += s.z;
    far = Math.max(far, Math.hypot(s.x - f.x, s.z - f.z));
  }
  mx /= f.sheep.length || 1;
  mz /= f.sheep.length || 1;
  const lag = Math.hypot(mx - f.x, mz - f.z);
  if (lag > f.r * 0.45 || far > f.r + 3) {
    const k = Math.min(1, (0.25 * dt) / Math.max(lag, 1e-3));
    const nx = f.x + (mx - f.x) * k;
    const nz = f.z + (mz - f.z) * k;
    if (pastureAt(p, nx, nz)) {
      f.x = nx;
      f.z = nz;
    }
  } else if (!pastureAt(p, ax, az)) {
    f.heading += dt * 0.9; // pasture ends ahead: swing round
  } else {
    const nx = f.x + Math.sin(f.heading) * sp * dt;
    const nz = f.z + Math.cos(f.heading) * sp * dt;
    if (pastureAt(p, nx, nz) || !pastureAt(p, f.x, f.z)) {
      f.x = nx;
      f.z = nz;
    }
  }
  for (const s of f.sheep) {
    s.wait -= dt;
    if (s.wait <= 0) {
      // pick a new spot in the flock, a little ahead of the flock's drift
      const a = (noise2(t * 0.7, s.seed, 60) * 2 - 1) * Math.PI;
      const d = (0.25 + 0.75 * noise2(t * 0.9, s.seed, 61)) * f.r;
      s.ox = Math.sin(f.heading + a) * d + Math.sin(f.heading) * 1.2;
      s.oz = Math.cos(f.heading + a) * d + Math.cos(f.heading) * 1.2;
      s.wait = 5 + noise2(t, s.seed, 62) * 9;
    }
    const tx = f.x + s.ox;
    const tz = f.z + s.oz;
    const dx = tx - s.x;
    const dz = tz - s.z;
    const d = Math.hypot(dx, dz);
    const wantWalk = d > 0.6 ? 1 : 0;
    s.walk += (wantWalk - s.walk) * Math.min(1, dt * 2.5);
    if (d > 0.05) {
      const want = Math.atan2(dx, dz);
      let dy = want - s.yaw;
      dy -= Math.round(dy / TAU) * TAU;
      s.yaw += clamp(dy, -2.2 * dt, 2.2 * dt) * (0.3 + 0.7 * s.walk);
    }
    if (s.walk > 0.05) {
      const v = 0.75 * s.walk * dt;
      // straight on, or sidestep round whatever is in the way
      let moved = false;
      for (let k = 0; k < SIDESTEP.length && !moved; k++) {
        const yaw = s.yaw + SIDESTEP[k];
        const nx = s.x + Math.sin(yaw) * v;
        const nz = s.z + Math.cos(yaw) * v;
        // (one that finds itself off the pasture — ground carved out under it — may walk back on)
        if (pastureAt(p, nx, nz) || !pastureAt(p, s.x, s.z)) {
          s.x = nx;
          s.z = nz;
          moved = true;
        }
      }
      if (!moved) s.wait = 0; // boxed in: choose somewhere else
    }
  }
  // keep a little personal space
  const sh = f.sheep;
  for (let i = 0; i < sh.length; i++)
    for (let j = i + 1; j < sh.length; j++) {
      const dx = sh[j].x - sh[i].x;
      const dz = sh[j].z - sh[i].z;
      const d2 = dx * dx + dz * dz;
      if (d2 < 1.1 * 1.1 && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        const push = ((1.1 - d) / d) * 0.5;
        const ix = sh[i].x - dx * push;
        const iz = sh[i].z - dz * push;
        const jx = sh[j].x + dx * push;
        const jz = sh[j].z + dz * push;
        if (pastureAt(p, ix, iz)) {
          sh[i].x = ix;
          sh[i].z = iz;
        }
        if (pastureAt(p, jx, jz)) {
          sh[j].x = jx;
          sh[j].z = jz;
        }
      }
    }
}

// ── windmills: open hilltops ──

export interface MillSpot {
  x: number;
  z: number;
  y: number;
  /** which way the sails face */
  face: number;
}

export function planWindmills(p: Pasture, opts: { count: number; seed?: number; avoid?: { x: number; z: number; r: number }[] }): MillSpot[] {
  const r = rngOf(opts.seed ?? 5151);
  const cand: { x: number; z: number; y: number; score: number }[] = [];
  for (let k = 0; k < 2600; k++) {
    const a = r() * TAU;
    const d = 24 + Math.sqrt(r()) * (ISLAND_R - 32);
    const x = Math.sin(a) * d;
    const z = Math.cos(a) * d;
    if (!pastureAt(p, x, z) || pastureShare(p, x, z, 4.5) < 0.9) continue;
    const y = groundY(x, z);
    // how much higher than its surroundings (a knoll or hilltop reads best)
    let around = 0;
    for (let q = 0; q < 8; q++) around += groundY(x + Math.sin((q / 8) * TAU) * 12, z + Math.cos((q / 8) * TAU) * 12);
    cand.push({ x, z, y, score: y - around / 8 + y * 0.08 + r() * 0.4 });
  }
  cand.sort((a, b) => b.score - a.score);
  const out: MillSpot[] = [];
  for (const c of cand) {
    if (out.length >= opts.count) break;
    if (out.some((m) => Math.hypot(m.x - c.x, m.z - c.z) < 50)) continue;
    if (opts.avoid?.some((o) => Math.hypot(o.x - c.x, o.z - c.z) < o.r + 5)) continue;
    out.push({ x: c.x, z: c.z, y: c.y, face: 0.52 + r() * 0.5 }); // roughly into the wind
  }
  return out;
}

// ── hot-air balloons: slow lazy loops over the island ──

export interface BalloonPath {
  cx: number;
  cz: number;
  rx: number;
  rz: number;
  alt: number;
  altAmp: number;
  speed: number;
  phase: number;
  /** pattern index (rainbow gores, checks, stripes ...) */
  style: number;
}

export function planBalloons(count: number, seed = 6060): BalloonPath[] {
  const r = rngOf(seed);
  const out: BalloonPath[] = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * TAU + r() * 0.8;
    const d = 30 + r() * 70;
    out.push({
      cx: Math.sin(a) * d,
      cz: Math.cos(a) * d,
      rx: 25 + r() * 30,
      rz: 20 + r() * 30,
      alt: 28 + (i / Math.max(1, count - 1)) * 26 + r() * 4,
      altAmp: 2 + r() * 3,
      speed: (0.012 + r() * 0.01) * (i % 2 ? 1 : -1),
      phase: r() * TAU,
      style: i,
    });
  }
  return out;
}

/** where a balloon is at time t (x, y, z) and its heading */
export function balloonAt(b: BalloonPath, t: number, out: { x: number; y: number; z: number; yaw: number }) {
  const u = b.phase + t * b.speed;
  out.x = b.cx + Math.sin(u) * b.rx + Math.sin(u * 2.3 + 1) * 6;
  out.z = b.cz + Math.cos(u) * b.rz + Math.cos(u * 1.7) * 5;
  out.y = b.alt + Math.sin(t * 0.17 + b.phase * 3) * b.altAmp;
  out.yaw = u * 0.6;
  return out;
}

// ── clouds ──

export interface CloudSpot {
  x: number;
  z: number;
  y: number;
  s: number;
  variant: number;
  rot: number;
  speed: number;
}

/** clouds drift over this box and wrap round (centred on the island) */
export const CLOUD_BOX = 230;

export function planClouds(count: number, variants: number, seed = 7070): CloudSpot[] {
  const r = rngOf(seed);
  const out: CloudSpot[] = [];
  for (let i = 0; i < count; i++) {
    const big = i < Math.ceil(count * 0.22);
    out.push({
      x: (r() * 2 - 1) * CLOUD_BOX,
      z: (r() * 2 - 1) * CLOUD_BOX * 0.8,
      y: big ? 21 + r() * 5 : 27 + r() * 18,
      s: big ? 2.2 + r() * 0.7 : 1 + r() * 0.9,
      variant: i % variants,
      rot: r() * TAU,
      speed: 0.7 + r() * 0.6,
    });
  }
  return out;
}

/** the drifting position of a cloud at time t (wraps round the box along the wind) */
export function cloudAt(c: CloudSpot, t: number, windX: number, windZ: number, out: { x: number; z: number }) {
  const span = CLOUD_BOX * 2;
  const x = c.x + windX * c.speed * t;
  const z = c.z + windZ * c.speed * t;
  out.x = x - Math.floor((x + CLOUD_BOX) / span) * span;
  out.z = z - Math.floor((z + CLOUD_BOX) / span) * span;
  return out;
}

// ── the painted horizon: forested ridges ──

export interface RidgeLayer {
  /** distance from the focus (m) */
  dist: number;
  /** base height of the ridge line and its hills */
  base: number;
  hills: number;
  /** tree-line teeth height */
  teeth: number;
  seed: number;
}

export const RIDGES: RidgeLayer[] = [
  { dist: 385, base: 14, hills: 18, teeth: 3.6, seed: 1 },
  { dist: 420, base: 22, hills: 22, teeth: 4, seed: 2 },
  { dist: 455, base: 30, hills: 26, teeth: 4.4, seed: 3 },
  { dist: 490, base: 40, hills: 30, teeth: 4.8, seed: 4 },
];

/** height of ridge layer `L`'s rolling hill line at angle `a` (no teeth) */
export function ridgeHill(L: RidgeLayer, a: number): number {
  // periodic in a: sample the noise round a circle
  const cx = Math.sin(a) * 3.2;
  const cz = Math.cos(a) * 3.2;
  const big = fbm2(cx + L.seed * 11, cz - L.seed * 7, 3, 80 + L.seed);
  const cx2 = Math.sin(a) * 11;
  const cz2 = Math.cos(a) * 11;
  const small = noise2(cx2 + L.seed * 5, cz2, 90 + L.seed);
  return L.base + (big - 0.3) * L.hills * 1.6 + (small - 0.5) * L.hills * 0.3;
}

/**
 * The top edge of ridge layer `L` sampled at `segs + 1` evenly spaced angles (the last equals the
 * first, so the ring closes): the rolling hill line plus a tree line of crowns of varying widths —
 * pointy pines in some stretches, round broadleaf crowns in others, each its own height.
 */
export function treeLine(L: RidgeLayer, layer: number, segs: number): Float32Array {
  const out = new Float32Array(segs + 1);
  const r = rngOf(9000 + layer * 31 + L.seed);
  let left = 0;
  let width = 1;
  let height = 0;
  let pine = false;
  for (let k = 0; k < segs; k++) {
    const a = (k / segs) * TAU;
    if (left <= 0) {
      pine = noise2(Math.sin(a) * 7 + layer * 3, Math.cos(a) * 7, 70 + layer) > 0.5;
      width = pine ? 2 + Math.floor(r() * 2) : 3 + Math.floor(r() * 3);
      height = L.teeth * (pine ? 0.8 + r() * 0.7 : 0.45 + r() * 0.45);
      left = width;
    }
    const u = (width - left + 0.5) / width; // 0..1 across this crown
    const w = 2 * u - 1;
    const crown = pine ? height * Math.pow(1 - Math.abs(w), 1.15) : height * Math.sqrt(Math.max(0, 1 - w * w));
    left--;
    out[k] = Math.max(2, ridgeHill(L, a) + crown);
  }
  out[segs] = out[0];
  return out;
}
